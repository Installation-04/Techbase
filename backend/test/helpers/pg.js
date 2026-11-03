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
  // A connection error mid-test must still fail the test, so it is rethrown.
  // Once drop() has started, errors from connections being closed are expected.
  let closing = false;
  pool.on('error', error => {
    if (!closing) throw error;
  });
  await pool.query(schema);

  return {
    pool,
    name,
    url: url.toString(),
    async drop() {
      closing = true;
      await pool.end();
      const cleanup = new Pool({ connectionString: baseUrl, max: 1 });
      try {
        // pool.end() resolves before the sockets have really closed (pg-pool
        // does not wait for client.end()), so DROP DATABASE ... WITH (FORCE) used
        // to kill backends that were still closing; the "terminating connection
        // due to administrator command" error then surfaced after the test had
        // ended and failed the whole file. Wait until Postgres has reaped them.
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const { rows } = await cleanup.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1', [name]);
          if (rows[0].n === 0) break;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

module.exports = { skipWithoutPg, createTestDb };
