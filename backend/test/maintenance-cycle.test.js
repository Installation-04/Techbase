const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

process.env.JWT_SECRET = 'test-secret';
const { app } = require('../src/app');
const { issueToken } = require('../src/lib/token');
const { getMaintenanceAlerts, getEpiAlerts, sendReminderNotifications } = require('../src/lib/reminders');

const auth = { Authorization: `Bearer ${issueToken({ id: 1, email: 't@example.com', name: 'T', role: 'user' })}` };

let testDb;
let db;
let clientId;

test.before(async () => {
  if (skipWithoutPg.skip) return;
  testDb = await createTestDb();
  db = testDb.pool;
  app.locals.db = db;
  clientId = (await db.query("INSERT INTO clients (name) VALUES ('Acme') RETURNING id")).rows[0].id;
});

test.after(async () => {
  if (testDb) await testDb.drop();
});

const dateStr = async (sql) => (await db.query(`SELECT to_char(${sql}, 'YYYY-MM-DD') AS d`)).rows[0].d;
const getEquipment = async (id) => (await db.query(
  "SELECT maintenance_interval_months AS m, to_char(next_maintenance,'YYYY-MM-DD') AS n, to_char(last_maintenance,'YYYY-MM-DD') AS l FROM equipment WHERE id=$1", [id])).rows[0];

test('equipment stores and validates the recurrence interval', skipWithoutPg, async () => {
  const base = `/api/clients/${clientId}/equipment`;
  const created = await request(app).post(base).set(auth).send({ name: 'Pompe', maintenance_interval_months: '6' });
  assert.equal(created.status, 201);
  assert.equal(created.body.maintenance_interval_months, 6);

  const updated = await request(app).put(`${base}/${created.body.id}`).set(auth).send({ name: 'Pompe', status: 'active', maintenance_interval_months: '' });
  assert.equal(updated.body.maintenance_interval_months, null);

  assert.equal((await request(app).post(base).set(auth).send({ name: 'X', maintenance_interval_months: 0 })).status, 400);
  assert.equal((await request(app).put(`${base}/${created.body.id}`).set(auth).send({ name: 'X', maintenance_interval_months: 'abc' })).status, 400);
});

test('completing a maintenance work order rolls next_maintenance forward', skipWithoutPg, async () => {
  const eq = (await db.query(
    "INSERT INTO equipment (client_id, name, next_maintenance, maintenance_interval_months) VALUES ($1,'Chaudière', CURRENT_DATE - 2, 3) RETURNING id", [clientId])).rows[0];
  const wo = (await db.query(
    "INSERT INTO work_orders (client_id, equipment_id, title, due_date, auto_generated) VALUES ($1,$2,'Maintenance', CURRENT_DATE - 2, TRUE) RETURNING id", [clientId, eq.id])).rows[0];

  const put = (status) => request(app).put(`/api/work-orders/${wo.id}`).set(auth)
    .send({ title: 'Maintenance', status, equipment_id: eq.id });

  assert.equal((await put('in_progress')).status, 200);
  assert.equal((await getEquipment(eq.id)).l, null);

  assert.equal((await put('done')).status, 200);
  const after = await getEquipment(eq.id);
  assert.equal(after.l, await dateStr('CURRENT_DATE'));
  assert.equal(after.n, await dateStr("CURRENT_DATE + INTERVAL '3 months'"));

  // Saving the already-done work order again does not roll a second time.
  await db.query('UPDATE equipment SET next_maintenance = CURRENT_DATE + 5 WHERE id=$1', [eq.id]);
  assert.equal((await put('done')).status, 200);
  assert.equal((await getEquipment(eq.id)).n, await dateStr('CURRENT_DATE + 5'));
});

test('without recurrence only last_maintenance is updated; unrelated work orders do not roll', skipWithoutPg, async () => {
  const eq = (await db.query(
    "INSERT INTO equipment (client_id, name, next_maintenance) VALUES ($1,'Clim', CURRENT_DATE + 10) RETURNING id", [clientId])).rows[0];
  const manual = (await db.query(
    "INSERT INTO work_orders (client_id, equipment_id, title) VALUES ($1,$2,'Dépannage') RETURNING id", [clientId, eq.id])).rows[0];
  await request(app).put(`/api/work-orders/${manual.id}`).set(auth).send({ title: 'Dépannage', status: 'done', equipment_id: eq.id });
  assert.equal((await getEquipment(eq.id)).l, null);

  const auto = (await db.query(
    "INSERT INTO work_orders (client_id, equipment_id, title, auto_generated) VALUES ($1,$2,'Maintenance', TRUE) RETURNING id", [clientId, eq.id])).rows[0];
  await request(app).put(`/api/work-orders/${auto.id}`).set(auth).send({ title: 'Maintenance', status: 'done', equipment_id: eq.id });
  const after = await getEquipment(eq.id);
  assert.equal(after.l, await dateStr('CURRENT_DATE'));
  assert.equal(after.n, await dateStr('CURRENT_DATE + 10'));
});

test('alert queries split overdue/upcoming and expired/expiring', skipWithoutPg, async () => {
  const c = (await db.query("INSERT INTO clients (name) VALUES ('Alertes') RETURNING id")).rows[0].id;
  await db.query(`INSERT INTO equipment (client_id, name, next_maintenance, status) VALUES
    ($1,'late', CURRENT_DATE - 1,'active'), ($1,'soon', CURRENT_DATE + 30,'active'),
    ($1,'far', CURRENT_DATE + 31,'active'), ($1,'off', CURRENT_DATE - 5,'inactive')`, [c]);
  await db.query(`INSERT INTO epi (client_id, name, expiry_date) VALUES
    ($1,'old', CURRENT_DATE - 1), ($1,'near', CURRENT_DATE + 10), ($1,'fine', CURRENT_DATE + 100)`, [c]);

  const m = await getMaintenanceAlerts(db);
  const mine = list => list.filter(r => r.client_id === c).map(r => r.name);
  assert.deepEqual(mine(m.overdue), ['late']);
  assert.deepEqual(mine(m.upcoming), ['soon']);
  const e = await getEpiAlerts(db);
  assert.deepEqual(mine(e.expired), ['old']);
  assert.deepEqual(mine(e.expiring), ['near']);

  const res = await request(app).get('/api/dashboard/summary').set(auth);
  assert.equal(res.status, 200);
  assert.ok(res.body.maintenanceAlerts.overdue.some(r => r.name === 'late'));
  assert.ok(res.body.epiAlerts.expiring.some(r => r.name === 'near'));
});

test('reminder notifications go to admins once, then are de-duplicated', skipWithoutPg, async () => {
  await db.query("INSERT INTO users (email, name, role) VALUES ('adm@x.com','Adm','admin'), ('u@x.com','U','user')");
  const first = await sendReminderNotifications(db);
  assert.ok(first >= 2);
  const rows = (await db.query('SELECT u.role, n.type FROM notifications n JOIN users u ON u.id = n.user_id')).rows;
  assert.ok(rows.length > 0 && rows.every(r => r.role === 'admin'));
  assert.ok(rows.some(r => r.type === 'maintenance_overdue') && rows.some(r => r.type === 'epi_expired'));
  assert.equal(await sendReminderNotifications(db), 0);
});
