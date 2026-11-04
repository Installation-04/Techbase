const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

process.env.JWT_SECRET = 'test-secret';
process.env.UPDATE_CHECK = 'false';
const { app } = require('../src/app');
const { issueToken } = require('../src/lib/token');
const auditLib = require('../src/lib/audit');

let db; let admin; let plain;
const bearer = u => ({ Authorization: `Bearer ${issueToken(u)}` });
const rowsOf = async (where = 'TRUE', params = []) => (await db.pool.query(`SELECT * FROM audit_log WHERE ${where} ORDER BY id`, params)).rows;

test.before(async () => {
  if (skipWithoutPg.skip) return;
  db = await createTestDb();
  app.locals.db = db.pool;
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('correct-horse', 4);
  admin = (await db.pool.query("INSERT INTO users (email, name, role, password_hash) VALUES ('boss@example.com','Boss','admin',$1) RETURNING id,email,name,role", [hash])).rows[0];
  plain = (await db.pool.query("INSERT INTO users (email, name, role, password_hash) VALUES ('tech@example.com','Tech','user',$1) RETURNING id,email,name,role", [hash])).rows[0];
});
test.after(async () => { if (db) await db.drop(); });
test.beforeEach(async () => { if (db) await db.pool.query('DELETE FROM audit_log'); });

// ---- pure helpers ----

test('csvCell quotes, doubles quotes and neutralises spreadsheet formulas', () => {
  const { csvCell } = auditLib;
  assert.equal(csvCell('simple'), 'simple');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  for (const bad of ['=SUM(A1)', '+1', '-1', '@cmd', '\t=1', '\r=1']) {
    assert.ok(csvCell(bad).replace(/^"/, '').startsWith("'"), `${JSON.stringify(bad)} must be prefixed`);
  }
  assert.equal(csvCell(null), '');
  assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
});

test('retentionDays: default 365, 0 disables, garbage falls back to the default', () => {
  const r = auditLib.retentionDays;
  assert.equal(r({}), 365);
  assert.equal(r({ AUDIT_RETENTION_DAYS: '30' }), 30);
  assert.equal(r({ AUDIT_RETENTION_DAYS: '0' }), 0);
  assert.equal(r({ AUDIT_RETENTION_DAYS: '-5' }), 365);
  assert.equal(r({ AUDIT_RETENTION_DAYS: 'abc' }), 365);
  assert.equal(r({ AUDIT_RETENTION_DAYS: '1.5' }), 365);
  assert.equal(r({ AUDIT_RETENTION_DAYS: ' ' }), 365);
});

test('sanitize masks secret-looking keys', () => {
  const out = auditLib.sanitize({ label: 'x', password: 'p', nested: { apiKey: 'k', token: 't', fine: 1 } });
  assert.deepEqual(out, { label: 'x', password: '[masqué]', nested: { apiKey: '[masqué]', token: '[masqué]', fine: 1 } });
});

test('audit() never throws when the write fails', async () => {
  const broken = { app: { locals: { db: { query: async () => { throw new Error('db down'); } } } }, ip: '1.2.3.4', get: () => 'ua' };
  const origErr = console.error; console.error = () => {};
  try { await auditLib.audit(broken, 'x.y', {}); } finally { console.error = origErr; }
});

// ---- access control ----

test('audit API: 401 anonymous, 403 for non-admins (list and export)', skipWithoutPg, async () => {
  for (const url of ['/api/admin/audit', '/api/admin/audit/export']) {
    assert.equal((await request(app).get(url)).status, 401);
    assert.equal((await request(app).get(url).set(bearer(plain))).status, 403);
  }
  assert.equal((await request(app).get(`/api/clients/1/passwords/1/audit`).set(bearer(plain))).status, 403);
});

// ---- recording ----

test('logins are recorded (success and failure) with IP and user agent, never the password', skipWithoutPg, async () => {
  await request(app).post('/api/users/login').set('User-Agent', 'TestAgent/1').send({ email: 'tech@example.com', password: 'correct-horse' }).expect(200);
  await request(app).post('/api/users/login').send({ email: 'tech@example.com', password: 'wrong-pass-123' }).expect(401);
  await request(app).post('/api/users/login').send({ email: 'ghost@example.com', password: 'whatever12' }).expect(401);
  const rows = await rowsOf();
  assert.deepEqual(rows.map(r => r.action), ['login.success', 'login.failure', 'login.failure']);
  assert.equal(rows[0].user_id, plain.id);
  assert.equal(rows[0].user_agent, 'TestAgent/1');
  assert.ok(rows[0].ip, 'ip recorded');
  assert.equal(rows[1].detail.reason, 'bad_password');
  assert.equal(rows[2].detail.reason, 'unknown_account');
  assert.equal(rows[2].user_email, 'ghost@example.com');
  assert.ok(!JSON.stringify(rows).includes('wrong-pass-123'));
  assert.ok(!JSON.stringify(rows).includes('correct-horse'));
});

test('the client IP follows the proxy trust setting (X-Forwarded-For is trusted for one hop, not read blindly)', skipWithoutPg, async () => {
  await request(app).post('/api/users/login').set('X-Forwarded-For', '203.0.113.9').send({ email: 'tech@example.com', password: 'correct-horse' }).expect(200);
  assert.equal((await rowsOf())[0].ip, '203.0.113.9', 'app trusts exactly one proxy hop');
  await db.pool.query('DELETE FROM audit_log');
  // With the setting off, a spoofed header must be ignored.
  app.set('trust proxy', false);
  try {
    await request(app).post('/api/users/login').set('X-Forwarded-For', '203.0.113.9').send({ email: 'tech@example.com', password: 'correct-horse' }).expect(200);
    assert.notEqual((await rowsOf())[0].ip, '203.0.113.9');
  } finally { app.set('trust proxy', 1); }
});

test('user create / role change / password change / delete are recorded', skipWithoutPg, async () => {
  const created = await request(app).post('/api/users').set(bearer(admin)).send({ email: 'new@example.com', password: 'longenough1', name: 'New' }).expect(201);
  const id = created.body.id;
  await request(app).put(`/api/users/${id}`).set(bearer(admin)).send({ email: 'new@example.com', name: 'New', role: 'admin', password: 'anotherlong1' }).expect(200);
  await request(app).delete(`/api/users/${id}`).set(bearer(admin)).expect(200);
  const rows = await rowsOf("action LIKE 'user.%'");
  assert.deepEqual(rows.map(r => r.action), ['user.created', 'user.role_changed', 'user.password_changed', 'user.deleted']);
  assert.equal(rows[1].detail.from, 'user'); assert.equal(rows[1].detail.to, 'admin');
  assert.equal(rows[0].user_id, admin.id);
  assert.ok(!JSON.stringify(rows).includes('longenough1') && !JSON.stringify(rows).includes('anotherlong1'));
});

test('integration connect/disconnect is recorded without the password', skipWithoutPg, async () => {
  await request(app).put('/api/integrations/acumatica/credentials').set(bearer(plain))
    .send({ base_url: 'https://erp.example.com', username: 'u', password: 'erp-secret-xyz', company: 'C' }).expect(200);
  await request(app).delete('/api/integrations/acumatica/credentials').set(bearer(plain)).expect(200);
  const rows = await rowsOf("action LIKE 'integration.%'");
  assert.deepEqual(rows.map(r => r.action), ['integration.acumatica.connected', 'integration.acumatica.disconnected']);
  assert.ok(!JSON.stringify(rows).includes('erp-secret-xyz'));
});

test('client deletion is recorded', skipWithoutPg, async () => {
  const c = (await db.pool.query("INSERT INTO clients (name) VALUES ('Doomed Inc') RETURNING id")).rows[0];
  await request(app).delete(`/api/clients/${c.id}`).set(bearer(admin)).expect(200);
  const rows = await rowsOf("action = 'client.deleted'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detail.name, 'Doomed Inc');
});

test('client creation/edit and document upload are recorded', skipWithoutPg, async () => {
  const made = await request(app).post('/api/clients').set(bearer(plain)).send({ name: 'Acme' }).expect(201);
  await request(app).put(`/api/clients/${made.body.id}`).set(bearer(plain)).send({ name: 'Acme 2' }).expect(200);
  await request(app).post(`/api/clients/${made.body.id}/documents`).set(bearer(plain)).attach('file', Buffer.from('hello'), 'note.txt').expect(201);
  const rows = await rowsOf("action IN ('client.created','client.updated','document.uploaded')");
  assert.deepEqual(rows.map(r => r.action), ['client.created', 'client.updated', 'document.uploaded']);
  assert.equal(rows[0].user_email, 'tech@example.com');
  assert.equal(rows[2].detail.name, 'note.txt');
});

test('vault: reveal and copy are logged per entry, who/when but never the secret; admins see the history', skipWithoutPg, async () => {
  const c = (await db.pool.query("INSERT INTO clients (name) VALUES ('Vault Co') RETURNING id")).rows[0];
  const created = await request(app).post(`/api/clients/${c.id}/passwords`).set(bearer(plain))
    .send({ label: 'Router', username: 'root', password: 'S3cr3t-Value!' }).expect(201);
  const pid = created.body.id;
  // The secret never travels in list/create/update responses, only through the audited reveal.
  assert.ok(!JSON.stringify(created.body).includes('S3cr3t-Value!') && !('encrypted_password' in created.body));
  const listed = await request(app).get(`/api/clients/${c.id}/passwords`).set(bearer(plain)).expect(200);
  assert.ok(!JSON.stringify(listed.body).includes('S3cr3t-Value!'));
  assert.ok(!('password' in listed.body[0]) && !('encrypted_password' in listed.body[0]));
  assert.equal(listed.body[0].has_password, true);
  const shown = await request(app).post(`/api/clients/${c.id}/passwords/${pid}/reveal`).set(bearer(plain)).send({ action: 'reveal' }).expect(200);
  assert.equal(shown.body.password, 'S3cr3t-Value!');
  assert.equal(shown.headers['cache-control'], 'no-store');
  await request(app).post(`/api/clients/${c.id}/passwords/${pid}/reveal`).set(bearer(plain)).send({ action: 'copy' }).expect(200);
  await request(app).post(`/api/clients/${c.id}/passwords/${pid}/reveal`).set(bearer(plain)).send({}).expect(200);
  assert.equal((await request(app).post(`/api/clients/${c.id}/passwords/99999/reveal`).set(bearer(plain)).send({})).status, 404);
  assert.equal((await request(app).post(`/api/clients/${c.id}/passwords/${pid}/reveal`).send({})).status, 401);

  const rows = await rowsOf("action LIKE 'vault.%'");
  assert.deepEqual(rows.map(r => r.action), ['vault.created', 'vault.reveal', 'vault.copy', 'vault.reveal']);
  assert.equal(rows[1].user_email, 'tech@example.com');
  assert.equal(rows[1].target_type, 'password');
  assert.equal(rows[1].target_id, String(pid));
  assert.equal(rows[1].detail.label, 'Router');
  const dump = JSON.stringify(rows);
  assert.ok(!dump.includes('S3cr3t-Value!'), 'the secret is never stored');

  const hist = await request(app).get(`/api/clients/${c.id}/passwords/${pid}/audit`).set(bearer(admin)).expect(200);
  assert.equal(hist.body.length, 4);
  assert.equal(hist.body[0].action, 'vault.reveal');
  assert.equal(hist.body[0].user_email, 'tech@example.com');
  // Another client's id does not leak this entry's history.
  assert.equal((await request(app).get(`/api/clients/${c.id + 1}/passwords/${pid}/audit`).set(bearer(admin)).expect(200)).body.length, 0);

  // Editing the secret is logged as a change, not its value.
  await request(app).put(`/api/clients/${c.id}/passwords/${pid}`).set(bearer(plain)).send({ label: 'Router', password: 'N3w-Secret-Val' }).expect(200);
  const again = await request(app).post(`/api/clients/${c.id}/passwords/${pid}/reveal`).set(bearer(plain)).send({}).expect(200);
  assert.equal(again.body.password, 'N3w-Secret-Val');
  assert.ok(!JSON.stringify(await rowsOf()).includes('N3w-Secret-Val'));
});

test('a failing audit write never fails the request', skipWithoutPg, async () => {
  const realDb = app.locals.db;
  app.locals.db = {
    query: (text, params) => (/audit_log/.test(text) ? Promise.reject(new Error('audit down')) : realDb.query(text, params)),
  };
  const origErr = console.error; console.error = () => {};
  try {
    await request(app).post('/api/users/login').send({ email: 'tech@example.com', password: 'correct-horse' }).expect(200);
    await request(app).post('/api/users/login').send({ email: 'tech@example.com', password: 'nope-nope-nope' }).expect(401);
  } finally { console.error = origErr; app.locals.db = realDb; }
});

// ---- listing, filters, pagination ----

async function seed() {
  const ins = (user_id, email, action, detail, at) => db.pool.query(
    'INSERT INTO audit_log (user_id, user_email, action, detail, ip, created_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6)',
    [user_id, email, action, JSON.stringify(detail), '10.0.0.1', at]);
  await ins(plain.id, 'tech@example.com', 'login.success', { method: 'password' }, '2026-01-10T10:00:00Z');
  await ins(null, 'ghost@example.com', 'login.failure', { reason: 'unknown_account' }, '2026-01-11T10:00:00Z');
  await ins(admin.id, 'boss@example.com', 'user.created', { email: '100%_odd@example.com' }, '2026-02-01T10:00:00Z');
  await ins(admin.id, 'boss@example.com', 'user.deleted', { email: 'x@example.com' }, '2026-02-02T23:59:00Z');
  await ins(plain.id, 'tech@example.com', 'vault.reveal', { label: 'Router' }, '2026-03-01T10:00:00Z');
}

test('GET /api/admin/audit: filters by user, action (exact and prefix), dates and text', skipWithoutPg, async () => {
  await seed();
  const get = q => request(app).get('/api/admin/audit').query(q).set(bearer(admin));
  const all = await get({}).expect(200);
  assert.equal(all.body.total, 5);
  assert.equal(all.body.rows[0].action, 'vault.reveal', 'newest first');

  assert.equal((await get({ user: 'ghost' })).body.total, 1);
  assert.equal((await get({ user: String(plain.id) })).body.total, 2);
  assert.equal((await get({ action: 'login.failure' })).body.total, 1);
  assert.equal((await get({ action: 'user.' })).body.total, 2);
  assert.equal((await get({ from: '2026-02-01', to: '2026-02-02' })).body.total, 2, 'the end day is inclusive');
  assert.equal((await get({ from: '2026-02-03' })).body.total, 1);
  assert.equal((await get({ q: 'router' })).body.total, 1);
  assert.equal((await get({ q: '100%_odd' })).body.total, 1, 'LIKE wildcards are escaped');
  assert.equal((await get({ q: '%' })).body.total, 1, 'a lone % matches literally, not everything');
  assert.equal((await get({ user: 'boss', action: 'user.created' })).body.total, 1);
  assert.equal((await get({ from: 'not-a-date' })).status, 400);
  assert.equal((await get({ to: '2026-13-45' })).status, 400);
});

test('GET /api/admin/audit paginates', skipWithoutPg, async () => {
  await seed();
  const p1 = await request(app).get('/api/admin/audit').query({ pageSize: 2, page: 1 }).set(bearer(admin)).expect(200);
  const p3 = await request(app).get('/api/admin/audit').query({ pageSize: 2, page: 3 }).set(bearer(admin)).expect(200);
  const p4 = await request(app).get('/api/admin/audit').query({ pageSize: 2, page: 4 }).set(bearer(admin)).expect(200);
  assert.equal(p1.body.rows.length, 2);
  assert.equal(p1.body.total, 5);
  assert.equal(p1.body.pages, 3);
  assert.equal(p3.body.rows.length, 1);
  assert.equal(p4.body.rows.length, 0);
  const ids = new Set(p1.body.rows.map(r => r.id));
  assert.ok(!ids.has(p3.body.rows[0].id));
  const big = await request(app).get('/api/admin/audit').query({ pageSize: 99999 }).set(bearer(admin)).expect(200);
  assert.equal(big.body.pageSize, 200, 'page size is capped');
});

// ---- CSV ----

test('CSV export honours filters, escapes, defuses formulas, and is itself audited', skipWithoutPg, async () => {
  await db.pool.query(
    'INSERT INTO audit_log (user_id, user_email, action, detail, user_agent) VALUES (NULL, $1, $2, $3::jsonb, $4)',
    ['=HYPERLINK("http://evil")@x.com', 'login.failure', JSON.stringify({ note: 'has, comma and "quotes"\nnewline' }), '@SUM(1)']);
  await db.pool.query("INSERT INTO audit_log (user_id, user_email, action) VALUES (NULL, 'other@example.com', 'user.created')");
  const res = await request(app).get('/api/admin/audit/export').query({ action: 'login.failure' }).set(bearer(admin)).expect(200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /attachment/);
  const body = res.text;
  assert.ok(body.startsWith('﻿id,date,'));
  assert.ok(!body.includes('other@example.com'), 'filters apply to the export');
  assert.ok(body.includes('"\'=HYPERLINK(""http://evil"")@x.com"'), body);
  assert.ok(body.includes(',\'@SUM(1),'), 'user agent formula defused');
  assert.ok(body.includes(String.raw`"{""note"":""has, comma and \""quotes\""\nnewline""}"`), 'JSON detail is quoted');
  const logged = await rowsOf("action = 'audit.exported'");
  assert.equal(logged.length, 1);
  assert.equal(logged[0].detail.rows, 1);
  assert.equal((await request(app).get('/api/admin/audit/export').query({ from: 'bad' }).set(bearer(admin))).status, 400);
});

// ---- retention ----

test('purgeAudit deletes only rows older than the retention period; 0 keeps everything', skipWithoutPg, async () => {
  const day = 24 * 3600 * 1000;
  const now = Date.now();
  for (const [action, age] of [['old.a', 400], ['old.b', 366], ['recent.a', 364], ['recent.b', 1]]) {
    await db.pool.query('INSERT INTO audit_log (action, created_at) VALUES ($1, $2)', [action, new Date(now - age * day)]);
  }
  assert.equal(await auditLib.purgeAudit(db.pool, { env: { AUDIT_RETENTION_DAYS: '0' }, now }), 0);
  assert.equal((await rowsOf()).length, 4);

  assert.equal(await auditLib.purgeAudit(db.pool, { env: {}, now }), 2, 'default is 365 days');
  const left = (await rowsOf()).map(r => r.action).sort();
  assert.deepEqual(left, ['audit.purged', 'recent.a', 'recent.b']);

  assert.equal(await auditLib.purgeAudit(db.pool, { env: { AUDIT_RETENTION_DAYS: '30' }, now }), 1);
  assert.equal((await rowsOf("action = 'recent.a'")).length, 0);
});

test('the daily job purges the audit log and a purge failure does not break the job', skipWithoutPg, async () => {
  const { runDailyJobs } = require('../src/lib/dailyJobs');
  await db.pool.query("INSERT INTO audit_log (action, created_at) VALUES ('ancient', NOW() - INTERVAL '800 days')");
  await runDailyJobs(db.pool);
  assert.equal((await rowsOf("action = 'ancient'")).length, 0);

  const failing = { query: (text, params) => (/audit_log/.test(text) ? Promise.reject(new Error('boom')) : db.pool.query(text, params)) };
  const origErr = console.error; console.error = () => {};
  try { await runDailyJobs(failing); } finally { console.error = origErr; }
});

// ---- QA regressions ----

test('absurd ?page= values are clamped instead of overflowing OFFSET (was a 500)', skipWithoutPg, async () => {
  await seed();
  for (const page of ['99999999999999999999', '1e21', '-5', 'abc']) {
    const res = await request(app).get('/api/admin/audit').query({ page }).set(bearer(admin));
    assert.equal(res.status, 200, `page=${page}`);
  }
});

test('exportAudit streams in keyset chunks, newest first, and honours the limit', skipWithoutPg, async () => {
  await db.pool.query("INSERT INTO audit_log (user_email, action) SELECT 'bulk' || g || '@example.com', 'user.created' FROM generate_series(1, 25) g");
  const chunks = [];
  const n = await auditLib.exportAudit(db.pool, { action: 'user.created' }, async c => { chunks.push(c); }, { chunk: 10 });
  assert.equal(n, 25);
  assert.equal(chunks.length, 1 + 3, 'header + 3 chunks (10, 10, 5)');
  const lines = chunks.join('').split('\r\n').filter(Boolean);
  assert.equal(lines.length, 26);
  const ids = lines.slice(1).map(l => Number(l.split(',')[0]));
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a), 'newest first, no duplicates');
  assert.equal(new Set(ids).size, 25);
  const capped = await auditLib.exportAudit(db.pool, {}, async () => {}, { chunk: 10, limit: 12 });
  assert.equal(capped, 12);
});
