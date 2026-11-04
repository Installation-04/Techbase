const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

process.env.JWT_SECRET = 'test-secret';
process.env.UPDATE_CHECK = 'false';
const TOKEN = 'u'.repeat(40);
const { app } = require('../src/app');
const { issueToken } = require('../src/lib/token');
const sys = require('../src/lib/systemInfo');

// A fake updater service that records what the app asks of it.
let fake; let received = []; let nextStatus = { state: 'idle' };
test.before(() => new Promise(resolve => {
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end('{}'); }
      if (req.url === '/status') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(nextStatus)); }
      if (req.url === '/update' && body && JSON.parse(body).version === '0.0.0') { res.writeHead(409, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'déjà installée' })); }
      res.writeHead(202, { 'Content-Type': 'application/json' }); res.end('{"accepted":true}');
    });
  }).listen(0, '127.0.0.1', resolve);
}));
test.after(() => new Promise(resolve => fake.close(resolve)));

let testDb; let adminToken; let userToken;
test.before(async () => {
  if (skipWithoutPg.skip) return;
  testDb = await createTestDb();
  app.locals.db = testDb.pool;
  const hash = await bcrypt.hash('motdepasse-admin', 4);
  const a = await testDb.pool.query("INSERT INTO users (email, password_hash, name, role) VALUES ('admin@example.com', $1, 'Admin', 'admin') RETURNING id", [hash]);
  const u = await testDb.pool.query("INSERT INTO users (email, password_hash, name, role) VALUES ('tech@example.com', $1, 'Tech', 'user') RETURNING id", [hash]);
  adminToken = issueToken({ id: a.rows[0].id, email: 'admin@example.com', name: 'Admin', role: 'admin' });
  userToken = issueToken({ id: u.rows[0].id, email: 'tech@example.com', name: 'Tech', role: 'user' });
});
test.after(async () => { if (testDb) await testDb.drop(); });

const withUpdater = () => { process.env.UPDATER_TOKEN = TOKEN; process.env.UPDATER_URL = `http://127.0.0.1:${fake.address().port}`; received = []; };
const withoutUpdater = () => { delete process.env.UPDATER_TOKEN; delete process.env.UPDATER_URL; };
const post = (url, token, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);

test('without the updater service, every update route says so (404) and nothing is sent', skipWithoutPg, async () => {
  withoutUpdater();
  assert.equal((await post('/api/admin/update', adminToken, { version: '0.0.12', password: 'motdepasse-admin' })).status, 404);
  assert.equal((await request(app).get('/api/admin/update/status').set('Authorization', `Bearer ${adminToken}`)).status, 404);
  assert.equal((await post('/api/admin/update/rollback', adminToken, { password: 'motdepasse-admin' })).status, 404);
  assert.equal(received.length, 0);
});

test('system info advertises the updater only for release installs with the service configured', async () => {
  withUpdater();
  assert.equal((await sys.systemInfo({ env: { DEPLOY_MODE: 'single', TECHIBASE_VERSION: '0.0.11', UPDATER_TOKEN: TOKEN, UPDATE_CHECK: 'false' } })).updaterAvailable, true);
  assert.equal((await sys.systemInfo({ env: { DEPLOY_MODE: 'single', TECHIBASE_VERSION: '0.0.11', UPDATE_CHECK: 'false' } })).updaterAvailable, false);
  assert.equal((await sys.systemInfo({ env: { DEPLOY_MODE: 'single', UPDATER_TOKEN: TOKEN, UPDATE_CHECK: 'false' } })).updaterAvailable, false, 'a source install has no pinned release to switch');
  assert.equal((await sys.systemInfo({ env: { DEPLOY_MODE: 'single', TECHIBASE_VERSION: '0.0.11', UPDATER_TOKEN: 'short', UPDATE_CHECK: 'false' } })).updaterAvailable, false, 'a weak secret disables it');
  withoutUpdater();
});

test('non-admins and anonymous callers are refused before anything else', skipWithoutPg, async () => {
  withUpdater();
  for (const url of ['/api/admin/update', '/api/admin/update/rollback']) {
    assert.equal((await request(app).post(url).send({})).status, 401);
    assert.equal((await post(url, userToken, { version: '0.0.12', password: 'motdepasse-admin' })).status, 403);
  }
  assert.equal((await request(app).get('/api/admin/update/status').set('Authorization', `Bearer ${userToken}`)).status, 403);
  assert.equal(received.length, 0, 'the updater was never contacted');
});

test('the admin must re-enter their own password; a wrong or missing one never reaches the updater', skipWithoutPg, async () => {
  withUpdater();
  assert.equal((await post('/api/admin/update', adminToken, { version: '0.0.12' })).status, 400);
  assert.equal((await post('/api/admin/update', adminToken, { version: '0.0.12', password: 'mauvais' })).status, 403);
  assert.equal((await post('/api/admin/update/rollback', adminToken, { password: 'mauvais' })).status, 403);
  assert.equal(received.length, 0);
  const rows = (await testDb.pool.query('SELECT action FROM audit_log')).rows;
  assert.equal(rows.length, 0, 'refused attempts are not logged as requests');
});

test('a correct password forwards the request with the shared secret and is audited', skipWithoutPg, async () => {
  withUpdater();
  const res = await post('/api/admin/update', adminToken, { version: '0.0.12', password: 'motdepasse-admin' });
  assert.equal(res.status, 202);
  assert.equal(received.length, 1);
  assert.equal(received[0].url, '/update');
  assert.equal(received[0].auth, `Bearer ${TOKEN}`);
  assert.deepEqual(received[0].body, { version: '0.0.12' }, 'the password is never forwarded');
  const log = (await testDb.pool.query("SELECT user_email, action, detail FROM audit_log WHERE action = 'update.requested'")).rows;
  assert.equal(log.length, 1);
  assert.equal(log[0].user_email, 'admin@example.com');
  assert.deepEqual(log[0].detail, { to: '0.0.12' });

  const rb = await post('/api/admin/update/rollback', adminToken, { password: 'motdepasse-admin' });
  assert.equal(rb.status, 202);
  assert.equal(received.at(-1).url, '/rollback');
});

test("the updater's refusals reach the admin with their status and message", skipWithoutPg, async () => {
  withUpdater();
  const res = await post('/api/admin/update', adminToken, { version: '0.0.0', password: 'motdepasse-admin' });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /déjà installée/);
});

test('an unreachable updater is a clear 503, a wrong shared secret is not leaked as 401', skipWithoutPg, async () => {
  process.env.UPDATER_TOKEN = TOKEN;
  process.env.UPDATER_URL = 'http://127.0.0.1:9'; // nothing listens there
  const down = await post('/api/admin/update', adminToken, { version: '0.0.12', password: 'motdepasse-admin' });
  assert.equal(down.status, 503);
  process.env.UPDATER_TOKEN = 'w'.repeat(40);
  process.env.UPDATER_URL = `http://127.0.0.1:${fake.address().port}`;
  const wrong = await request(app).get('/api/admin/update/status').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(wrong.status, 502, 'the browser session must not be logged out by an updater misconfiguration');
  withoutUpdater();
});

test('status passes through, and the outcome is written to the audit log exactly once', skipWithoutPg, async () => {
  withUpdater();
  nextStatus = { state: 'running', from: '0.0.11', to: '0.0.12', startedAt: 'T1', log: ['a'] };
  const running = await request(app).get('/api/admin/update/status').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(running.body.state, 'running');
  assert.equal((await testDb.pool.query("SELECT 1 FROM audit_log WHERE action LIKE 'update.%' AND action <> 'update.requested' AND action <> 'update.rollback_requested'")).rowCount, 0);

  nextStatus = { state: 'success', from: '0.0.11', to: '0.0.12', startedAt: 'T1', backup: 'pre-update-x.tar.gz', log: [] };
  for (let i = 0; i < 3; i++) await request(app).get('/api/admin/update/status').set('Authorization', `Bearer ${adminToken}`);
  const rows = (await testDb.pool.query("SELECT action, detail FROM audit_log WHERE action = 'update.success'")).rows;
  assert.equal(rows.length, 1, 'polling does not duplicate the entry');
  assert.equal(rows[0].detail.backup, 'pre-update-x.tar.gz');

  nextStatus = { state: 'rolled_back', from: '0.0.12', to: '0.0.13', startedAt: 'T2', error: 'did not start' };
  await request(app).get('/api/admin/update/status').set('Authorization', `Bearer ${adminToken}`);
  assert.equal((await testDb.pool.query("SELECT 1 FROM audit_log WHERE action = 'update.rolled_back'")).rowCount, 1);
  withoutUpdater();
});
