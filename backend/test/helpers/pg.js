// Real-Postgres test support. Tests that need a database call createTestDb(),
// which makes a throwaway database from the server named by TEST_DATABASE_URL
// (any database on it works — only the server and credentials are used; the
// role needs CREATEDB) and applies the app's schema. Each test file gets its
// own database, so `node --test` can run files in parallel.
//
// Without TEST_DATABASE_URL these tests are skipped rather than failed, so
// `npm test` keeps working on a machine with no Postgres. CI sets it, and
// scripts/dev-local.sh documents the local equivalent.
const crypto = require('crypto');
const { Pool } = require('pg');
const schema = require('../../src/db/schema');

const baseUrl = process.env.TEST_DATABASE_URL;

// Spread into test options: test('name', skipWithoutPg, async () => { ... })
const skipWithoutPg = baseUrl ? {} : { skip: 'TEST_DATABASE_URL is not set (no Postgres available)' };

async function createTestDb() {
  const name = `techbase_test_${crypto.randomBytes(5).toString('hex')}`;

  const admin = new Pool({ connectionString: baseUrl, max: 1 });
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString() });
  await pool.query(schema);

  return {
    pool,
    name,
    async drop() {
      await pool.end();
      const cleanup = new Pool({ connectionString: baseUrl, max: 1 });
      await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleanup.end();
    },
  };
}

module.exports = { skipWithoutPg, createTestDb };
