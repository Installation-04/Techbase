const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

const exists = async (name) => {
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    return (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount === 1;
  } finally {
    await admin.end();
  }
};

test('drop() removes the database even right after heavy parallel use of the pool', skipWithoutPg, async () => {
  for (let i = 0; i < 10; i++) {
    const testDb = await createTestDb();
    await Promise.all(Array.from({ length: 5 }, () => testDb.pool.query('SELECT pg_sleep(0.01)')));
    assert.equal(await exists(testDb.name), true);
    await testDb.drop();
    assert.equal(await exists(testDb.name), false);
  }
  // A connection killed while closing used to surface here as an uncaught
  // "terminating connection due to administrator command" and fail the file.
  await new Promise(resolve => setTimeout(resolve, 200));
});

test('a connection error while a test is running is not swallowed', skipWithoutPg, async () => {
  const testDb = await createTestDb();
  try {
    assert.throws(() => testDb.pool.emit('error', new Error('boom')), /boom/);
  } finally {
    await testDb.drop();
  }
});
