const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

process.env.JWT_SECRET = 'test-secret';
const { app } = require('../src/app');
const { issueToken } = require('../src/lib/token');

const auth = { Authorization: `Bearer ${issueToken({ id: 1, email: 't@example.com', name: 'T', role: 'user' })}` };

let testDb;
let clientId;

test.before(async () => {
  if (skipWithoutPg.skip) return;
  testDb = await createTestDb();
  app.locals.db = testDb.pool;
  clientId = (await testDb.pool.query("INSERT INTO clients (name) VALUES ('Acme') RETURNING id")).rows[0].id;
});

test.after(async () => {
  if (testDb) await testDb.drop();
});

const create = (body) => request(app).post(`/api/clients/${clientId}/epi`).set(auth).send(body);
const update = (id, body) => request(app).put(`/api/clients/${clientId}/epi/${id}`).set(auth).send(body);

test('a quantity of 0 is stored as 0 on create (number or form string)', skipWithoutPg, async () => {
  assert.equal((await create({ name: 'Casque', quantity: 0 })).body.quantity, 0);
  assert.equal((await create({ name: 'Gants', quantity: '0' })).body.quantity, 0);
});

test('quantity defaults to 1 when omitted or blank on create', skipWithoutPg, async () => {
  assert.equal((await create({ name: 'Lunettes' })).body.quantity, 1);
  assert.equal((await create({ name: 'Bouchons', quantity: '' })).body.quantity, 1);
});

test('editing another field of a zero-stock item keeps it at 0 (regression)', skipWithoutPg, async () => {
  const { body: item } = await create({ name: 'Harnais', quantity: 0 });

  // What the edit modal sends: the whole row, quantity still the numeric 0 from the DB.
  const res = await update(item.id, { ...item, notes: 'à commander' });

  assert.equal(res.status, 200);
  assert.equal(res.body.quantity, 0);
  assert.equal(res.body.notes, 'à commander');
});

test('an update with no quantity keeps the stored quantity', skipWithoutPg, async () => {
  const { body: item } = await create({ name: 'Visière', quantity: 4 });
  const res = await update(item.id, { name: 'Visière', notes: 'x' });
  assert.equal(res.body.quantity, 4);
});

test('an update can change the quantity, including down to 0', skipWithoutPg, async () => {
  const { body: item } = await create({ name: 'Masque', quantity: 5 });
  assert.equal((await update(item.id, { name: 'Masque', quantity: '2' })).body.quantity, 2);
  assert.equal((await update(item.id, { name: 'Masque', quantity: 0 })).body.quantity, 0);
});

test('rejects negative, fractional and non-numeric quantities with 400', skipWithoutPg, async () => {
  const { body: item } = await create({ name: 'Botte', quantity: 3 });
  for (const bad of [-1, '-1', 1.5, '1.5', 'abc']) {
    assert.equal((await create({ name: 'Bad', quantity: bad })).status, 400, `create with ${JSON.stringify(bad)}`);
    assert.equal((await update(item.id, { name: 'Botte', quantity: bad })).status, 400, `update with ${JSON.stringify(bad)}`);
  }
  assert.equal((await update(item.id, { name: 'Botte' })).body.quantity, 3); // untouched by the rejected requests
});
