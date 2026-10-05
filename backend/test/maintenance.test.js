const test = require('node:test');
const assert = require('node:assert/strict');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');
const { generatePreventiveWorkOrders } = require('../src/lib/maintenance');

let testDb;
let db;

test.before(async () => {
  if (skipWithoutPg.skip) return;
  testDb = await createTestDb();
  db = testDb.pool;
});

test.after(async () => {
  if (testDb) await testDb.drop();
});

// Fresh client + one equipment per test, so tests don't see each other's rows.
async function seedEquipment({ name = 'Chaudière #1', nextMaintenanceOffsetDays = 3 } = {}) {
  const client = (await db.query("INSERT INTO clients (name) VALUES ('Acme') RETURNING id")).rows[0];
  const equipment = (await db.query(
    `INSERT INTO equipment (client_id, name, next_maintenance)
     VALUES ($1, $2, CASE WHEN $3::int IS NULL THEN NULL ELSE CURRENT_DATE + $3::int END) RETURNING id`,
    [client.id, name, nextMaintenanceOffsetDays]
  )).rows[0];
  return { clientId: client.id, equipmentId: equipment.id };
}

const workOrdersFor = async (equipmentId) =>
  (await db.query('SELECT * FROM work_orders WHERE equipment_id = $1 ORDER BY id', [equipmentId])).rows;

test('creates a work order for equipment due within 7 days', skipWithoutPg, async () => {
  const { equipmentId, clientId } = await seedEquipment({ name: 'Pompe A', nextMaintenanceOffsetDays: 7 });

  assert.equal(await generatePreventiveWorkOrders(db), 1);

  const [wo] = await workOrdersFor(equipmentId);
  assert.equal(wo.client_id, clientId);
  assert.equal(wo.title, 'Maintenance préventive — Pompe A');
  assert.equal(wo.status, 'open');
  assert.equal(wo.priority, 'medium');
  assert.equal(wo.auto_generated, true);
});

test('ignores equipment due later than 7 days or with no maintenance date', skipWithoutPg, async () => {
  const later = await seedEquipment({ nextMaintenanceOffsetDays: 8 });
  const none = await seedEquipment({ nextMaintenanceOffsetDays: null });

  await generatePreventiveWorkOrders(db);

  assert.equal((await workOrdersFor(later.equipmentId)).length, 0);
  assert.equal((await workOrdersFor(none.equipmentId)).length, 0);
});

test('includes overdue equipment', skipWithoutPg, async () => {
  const { equipmentId } = await seedEquipment({ nextMaintenanceOffsetDays: -10 });
  await generatePreventiveWorkOrders(db);
  assert.equal((await workOrdersFor(equipmentId)).length, 1);
});

test('is idempotent while the work order is still active', skipWithoutPg, async () => {
  const { equipmentId } = await seedEquipment();
  await generatePreventiveWorkOrders(db);
  assert.equal(await generatePreventiveWorkOrders(db), 0);
  assert.equal((await workOrdersFor(equipmentId)).length, 1);
});

test('does NOT re-create the work order after it is completed (regression)', skipWithoutPg, async () => {
  const { equipmentId } = await seedEquipment();
  await generatePreventiveWorkOrders(db);
  await db.query("UPDATE work_orders SET status = 'done', completed_at = NOW() WHERE equipment_id = $1", [equipmentId]);

  assert.equal(await generatePreventiveWorkOrders(db), 0);
  assert.equal(await generatePreventiveWorkOrders(db), 0);
  assert.equal((await workOrdersFor(equipmentId)).length, 1);
});

test('does not re-create a cancelled work order for the same date either', skipWithoutPg, async () => {
  const { equipmentId } = await seedEquipment();
  await generatePreventiveWorkOrders(db);
  await db.query("UPDATE work_orders SET status = 'cancelled' WHERE equipment_id = $1", [equipmentId]);

  assert.equal(await generatePreventiveWorkOrders(db), 0);
  assert.equal((await workOrdersFor(equipmentId)).length, 1);
});

test('creates the next work order once next_maintenance moves to a new date', skipWithoutPg, async () => {
  const { equipmentId } = await seedEquipment({ nextMaintenanceOffsetDays: 3 });
  await generatePreventiveWorkOrders(db);
  await db.query("UPDATE work_orders SET status = 'done', completed_at = NOW() WHERE equipment_id = $1", [equipmentId]);

  // Someone records the next service date, which is again within the window.
  await db.query('UPDATE equipment SET next_maintenance = CURRENT_DATE + 5 WHERE id = $1', [equipmentId]);

  assert.equal(await generatePreventiveWorkOrders(db), 1);
  const orders = await workOrdersFor(equipmentId);
  assert.equal(orders.length, 2);
  assert.deepEqual(orders.map(o => o.status), ['done', 'open']);
});

test('overlapping runs create exactly one work order and never throw', skipWithoutPg, async () => {
  const { equipmentId } = await seedEquipment();

  const results = await Promise.all(Array.from({ length: 5 }, () => generatePreventiveWorkOrders(db)));

  assert.equal(results.reduce((a, b) => a + b, 0), 1);
  assert.equal((await workOrdersFor(equipmentId)).length, 1);
});

test('describes the due date as DD/MM/YYYY, not a JS Date string', skipWithoutPg, async () => {
  const { equipmentId } = await seedEquipment({ nextMaintenanceOffsetDays: 2 });
  await generatePreventiveWorkOrders(db);

  const [wo] = await workOrdersFor(equipmentId);
  const due = (await db.query("SELECT to_char(CURRENT_DATE + 2, 'DD/MM/YYYY') AS d")).rows[0].d;
  assert.equal(wo.description, `Généré automatiquement : prochaine maintenance prévue le ${due}.`);
});
