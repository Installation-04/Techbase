const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

process.env.JWT_SECRET = 'test-secret';
const { app } = require('../src/app');
const { issueToken } = require('../src/lib/token');

const tokenFor = (u) => ({ Authorization: `Bearer ${issueToken({ email: `${u.id}@x.fr`, name: `U${u.id}`, role: 'user', ...u })}` });

let testDb;
let tech, other, admin, clientId;
const DAY = '2026-06-15';

const insert = async (title, { status = 'assigned', due = null, assignee = tech, priority = 'medium', completedAt = null } = {}) =>
  (await testDb.pool.query(
    `INSERT INTO work_orders (client_id, title, status, priority, assigned_to, due_date, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [clientId, title, status, priority, assignee, due, completedAt]
  )).rows[0].id;

test.before(async () => {
  if (skipWithoutPg.skip) return;
  testDb = await createTestDb();
  app.locals.db = testDb.pool;
  const mk = async (email, role) => (await testDb.pool.query(
    "INSERT INTO users (email, password_hash, name, role) VALUES ($1,'x',$1,$2) RETURNING id", [email, role])).rows[0].id;
  tech = await mk('tech@x.fr', 'user');
  other = await mk('other@x.fr', 'user');
  admin = await mk('admin@x.fr', 'admin');
  clientId = (await testDb.pool.query(
    "INSERT INTO clients (name, address, phone) VALUES ('Acme','1 rue A, Lyon','0102030405') RETURNING id")).rows[0].id;
});

test.after(async () => { if (testDb) await testDb.drop(); });

test('my-day requires authentication', skipWithoutPg, async () => {
  assert.equal((await request(app).get('/api/work-orders/my-day')).status, 401);
});

test('my-day rejects a malformed date', skipWithoutPg, async () => {
  const res = await request(app).get('/api/work-orders/my-day?date=demain').set(tokenFor({ id: tech }));
  assert.equal(res.status, 400);
});

test('my-day lists own due, overdue, in-progress and done-today orders, in order', skipWithoutPg, async () => {
  await insert('later', { due: '2026-06-20' });
  await insert('no due date');
  await insert('cancelled', { status: 'cancelled', due: DAY });
  await insert('not mine', { assignee: other, due: DAY });
  await insert('done yesterday', { status: 'done', due: DAY, completedAt: '2026-06-14 10:00' });
  await insert('today urgent', { due: DAY, priority: 'urgent' });
  await insert('today low', { due: DAY, priority: 'low' });
  await insert('overdue', { due: '2026-06-10', status: 'open' });
  await insert('doing', { status: 'in_progress', due: '2026-06-30' });
  await insert('done today', { status: 'done', due: DAY, completedAt: '2026-06-15 09:00' });

  const res = await request(app).get(`/api/work-orders/my-day?date=${DAY}`).set(tokenFor({ id: tech }));
  assert.equal(res.status, 200);
  assert.equal(res.body.date, DAY);
  assert.deepEqual(res.body.workOrders.map(w => w.title),
    ['doing', 'overdue', 'today urgent', 'today low', 'done today']);
  const overdue = res.body.workOrders.find(w => w.title === 'overdue');
  assert.equal(overdue.overdue, true);
  assert.equal(overdue.due_date, '2026-06-10');
  assert.equal(overdue.client_address, '1 rue A, Lyon');
  assert.equal(overdue.client_phone, '0102030405');
  assert.equal(res.body.workOrders.find(w => w.title === 'today low').overdue, false);
});

test('status transition: assignee starts then finishes, others are refused', skipWithoutPg, async () => {
  const id = await insert('transition', { due: DAY });
  const post = (who, status) => request(app).post(`/api/work-orders/${id}/status`).set(tokenFor(who)).send({ status });

  assert.equal((await post({ id: other }, 'in_progress')).status, 403);
  assert.equal((await post({ id: tech }, 'cancelled')).status, 400);
  const started = await post({ id: tech }, 'in_progress');
  assert.equal(started.status, 200);
  assert.equal(started.body.status, 'in_progress');
  const done = await post({ id: tech }, 'done');
  assert.equal(done.body.status, 'done');
  assert.ok(done.body.completed_at);
  // Reopening (admin) clears the completion date.
  assert.equal((await post({ id: admin, role: 'admin' }, 'in_progress')).body.completed_at, null);
  assert.equal((await request(app).post('/api/work-orders/999999/status').set(tokenFor({ id: tech })).send({ status: 'done' })).status, 404);
});

test('a cancelled order cannot be transitioned', skipWithoutPg, async () => {
  const id = await insert('nope', { status: 'cancelled' });
  const res = await request(app).post(`/api/work-orders/${id}/status`).set(tokenFor({ id: tech })).send({ status: 'done' });
  assert.equal(res.status, 409);
});

test('my-day rejects an impossible calendar date instead of failing in SQL', skipWithoutPg, async () => {
  const res = await request(app).get('/api/work-orders/my-day?date=2026-02-31').set(tokenFor({ id: tech }));
  assert.equal(res.status, 400);
});

test('my-day reads "finished today" on the technician clock when tz is given', skipWithoutPg, async () => {
  const stamp = (await testDb.pool.query(
    `SELECT ((TIMESTAMP '2026-07-15 20:00' AT TIME ZONE 'America/Toronto') AT TIME ZONE current_setting('TimeZone')) AS t`)).rows[0].t;
  await insert('evening job', { status: 'done', completedAt: stamp });
  const titles = async (tz) => (await request(app).get(`/api/work-orders/my-day?date=2026-07-15&tz=${tz}`)
    .set(tokenFor({ id: tech }))).body.workOrders.map(w => w.title);
  assert.ok((await titles('America/Toronto')).includes('evening job'));
  assert.ok(!(await titles('Pacific/Auckland')).includes('evening job'));
  assert.equal((await request(app).get('/api/work-orders/my-day?tz=Mars/Base').set(tokenFor({ id: tech }))).status, 400);
});

test('status transition on a non-numeric or oversized id is a 404, not a 500', skipWithoutPg, async () => {
  for (const id of ['abc', '99999999999']) {
    const res = await request(app).post(`/api/work-orders/${id}/status`).set(tokenFor({ id: tech })).send({ status: 'done' });
    assert.equal(res.status, 404);
  }
});

test('finishing twice keeps the first completion time', skipWithoutPg, async () => {
  const id = await insert('twice', { status: 'in_progress', due: DAY });
  const post = () => request(app).post(`/api/work-orders/${id}/status`).set(tokenFor({ id: tech })).send({ status: 'done' });
  const first = (await post()).body.completed_at;
  assert.equal((await post()).body.completed_at, first);
});

test('finishing a maintenance order from the day view rolls the equipment forward (once)', skipWithoutPg, async () => {
  const q = (sql, p) => testDb.pool.query(sql, p);
  const eq = (await q(
    `INSERT INTO equipment (client_id, name, next_maintenance, maintenance_interval_months)
     VALUES ($1,'Onduleur', CURRENT_DATE, 6) RETURNING id`, [clientId])).rows[0].id;
  const wo = (await q(
    `INSERT INTO work_orders (client_id, equipment_id, title, status, assigned_to, due_date, auto_generated)
     VALUES ($1,$2,'Maintenance','assigned',$3,CURRENT_DATE,true) RETURNING id`, [clientId, eq, tech])).rows[0].id;
  const state = async () => (await q(
    `SELECT to_char(last_maintenance,'YYYY-MM-DD') AS last, to_char(next_maintenance,'YYYY-MM-DD') AS next,
            to_char(CURRENT_DATE,'YYYY-MM-DD') AS today,
            to_char(CURRENT_DATE + interval '6 months','YYYY-MM-DD') AS expected FROM equipment WHERE id = $1`, [eq])).rows[0];

  const res = await request(app).post(`/api/work-orders/${wo}/status`).set(tokenFor({ id: tech })).send({ status: 'done' });
  assert.equal(res.status, 200);
  const first = await state();
  assert.equal(first.last, first.today);
  assert.equal(first.next, first.expected);

  // Re-finishing the same order must not push the date forward again.
  await request(app).post(`/api/work-orders/${wo}/status`).set(tokenFor({ id: tech })).send({ status: 'done' });
  assert.equal((await state()).next, first.expected);
});
