const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

process.env.JWT_SECRET = 'test-secret';
// Loading the app loads src/db.js, which registers the DATE parser on the shared `pg` module.
const { app } = require('../src/app');
const { issueToken } = require('../src/lib/token');

const auth = { Authorization: `Bearer ${issueToken({ id: 1, email: 't@example.com', name: 'T', role: 'user' })}` };

let testDb;
let clientId;
let equipmentId;

test.before(async () => {
  if (skipWithoutPg.skip) return;
  testDb = await createTestDb();
  app.locals.db = testDb.pool;
  clientId = (await testDb.pool.query("INSERT INTO clients (name) VALUES ('Acme') RETURNING id")).rows[0].id;
  equipmentId = (await testDb.pool.query(
    `INSERT INTO equipment (client_id, name, installation_date, last_maintenance, next_maintenance)
     VALUES ($1, 'Chaudière', '2026-01-05', '2026-04-20', '2026-10-12') RETURNING id`, [clientId]
  )).rows[0].id;
  await testDb.pool.query("INSERT INTO epi (client_id, name, expiry_date) VALUES ($1, 'Casque', '2026-12-31')", [clientId]);
  await testDb.pool.query("INSERT INTO work_orders (client_id, title, due_date) VALUES ($1, 'Inspection', '2026-10-12')", [clientId]);
});

test.after(async () => {
  if (testDb) await testDb.drop();
});

const ZONES = ['UTC', 'America/Toronto', 'Europe/Paris', 'Pacific/Auckland'];

test('DATE columns come back as YYYY-MM-DD strings, whatever the server time zone', skipWithoutPg, async () => {
  const previous = process.env.TZ;
  try {
    for (const tz of ZONES) {
      process.env.TZ = tz;
      const eq = (await testDb.pool.query('SELECT installation_date, last_maintenance, next_maintenance FROM equipment WHERE id = $1', [equipmentId])).rows[0];
      assert.deepEqual(eq, { installation_date: '2026-01-05', last_maintenance: '2026-04-20', next_maintenance: '2026-10-12' }, `equipment in ${tz}`);
      assert.equal((await testDb.pool.query('SELECT expiry_date FROM epi')).rows[0].expiry_date, '2026-12-31', `epi in ${tz}`);
      assert.equal((await testDb.pool.query('SELECT due_date FROM work_orders')).rows[0].due_date, '2026-10-12', `work order in ${tz}`);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('timestamps are still real instants (only DATE columns changed)', skipWithoutPg, async () => {
  const row = (await testDb.pool.query('SELECT created_at FROM clients LIMIT 1')).rows[0];
  assert.ok(row.created_at instanceof Date);
});

test('the API serves date-only fields as plain YYYY-MM-DD in JSON', skipWithoutPg, async () => {
  const equipment = await request(app).get(`/api/clients/${clientId}/equipment`).set(auth);
  assert.equal(equipment.body[0].next_maintenance, '2026-10-12');
  assert.equal(equipment.body[0].installation_date, '2026-01-05');

  const epi = await request(app).get(`/api/clients/${clientId}/epi`).set(auth);
  assert.equal(epi.body[0].expiry_date, '2026-12-31');

  const orders = await request(app).get('/api/work-orders').set(auth);
  assert.equal(orders.body[0].due_date, '2026-10-12');
});

test('editing an item and saving it back does not move its dates', skipWithoutPg, async () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Paris'; // east of UTC: the old Date-object path went a day backwards here
  try {
    const { body: item } = (await request(app).get(`/api/clients/${clientId}/equipment`).set(auth));
    const saved = await request(app).put(`/api/clients/${clientId}/equipment/${equipmentId}`).set(auth).send(item[0]);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.next_maintenance, '2026-10-12');
    assert.equal(saved.body.last_maintenance, '2026-04-20');

    // The work-order board sends due_date.slice(0, 10) back on every status change.
    const order = (await request(app).get('/api/work-orders').set(auth)).body[0];
    const moved = await request(app).put(`/api/work-orders/${order.id}`).set(auth)
      .send({ title: order.title, status: 'in_progress', due_date: order.due_date.slice(0, 10) });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.due_date, '2026-10-12');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
