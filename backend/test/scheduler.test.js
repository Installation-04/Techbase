const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

const SCHEDULER = path.join(__dirname, '../src/scheduler.js');

let testDb;

test.before(async () => {
  if (skipWithoutPg.skip) return;
  testDb = await createTestDb();
});

test.after(async () => {
  if (testDb) await testDb.drop();
});

// Runs the real scheduler process against the test database.
function runScheduler(args, extraEnv = {}) {
  const env = { ...process.env, NETLIFY_DATABASE_URL: testDb?.url, ...extraEnv };
  delete env.RESEND_API_KEY;
  const child = spawn(process.execPath, [SCHEDULER, ...args], { env });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  const exited = new Promise(resolve => child.on('exit', code => resolve({ code, output })));
  return { child, exited, getOutput: () => output };
}

async function seedDueEquipment(name) {
  const { id } = (await testDb.pool.query("INSERT INTO clients (name) VALUES ('Acme') RETURNING id")).rows[0];
  await testDb.pool.query("INSERT INTO equipment (client_id, name, next_maintenance) VALUES ($1, $2, CURRENT_DATE + 2)", [id, name]);
}
const workOrderTitles = async () =>
  (await testDb.pool.query('SELECT title FROM work_orders ORDER BY id')).rows.map(r => r.title);

test('--once runs the daily jobs, exits 0, and is idempotent', skipWithoutPg, async () => {
  await seedDueEquipment('Chaudière --once');

  const first = await runScheduler(['--once']).exited;
  assert.equal(first.code, 0, first.output);
  assert.match(first.output, /1 preventive work order\(s\) created/);
  assert.deepEqual(await workOrderTitles(), ['Maintenance préventive — Chaudière --once']);

  const second = await runScheduler(['--once']).exited;
  assert.equal(second.code, 0, second.output);
  assert.match(second.output, /0 preventive work order\(s\) created/);
  assert.equal((await workOrderTitles()).length, 1);
});

test('--once exits 1 when the jobs fail (e.g. database unreachable)', skipWithoutPg, async () => {
  const result = await runScheduler(['--once'], { NETLIFY_DATABASE_URL: 'postgresql://techbase:wrong@127.0.0.1:1/nope' }).exited;
  assert.equal(result.code, 1);
  assert.match(result.output, /Daily jobs failed/);
});

test('refuses to start with an invalid SCHEDULER_TIME', skipWithoutPg, async () => {
  const result = await runScheduler([], { SCHEDULER_TIME: '25:99' }).exited;
  assert.equal(result.code, 1);
  assert.match(result.output, /Invalid time "25:99"/);
});

test('daemon mode: runs on start when asked, schedules the next run, stops cleanly on SIGTERM', skipWithoutPg, async () => {
  await seedDueEquipment('Chaudière daemon');
  const { child, exited, getOutput } = runScheduler([], { RUN_ON_START: 'true', SCHEDULER_TIME: '03:30', TZ: 'UTC' });

  // Wait until it has done the startup run and announced the next one.
  const deadline = Date.now() + 15000;
  while (!/Scheduler: next run at/.test(getOutput()) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100));
  }
  assert.match(getOutput(), /Scheduler: next run at \d{4}-\d{2}-\d{2}T03:30:00\.000Z \(SCHEDULER_TIME=03:30, TZ=UTC\)/);
  assert.ok((await workOrderTitles()).includes('Maintenance préventive — Chaudière daemon'));

  child.kill('SIGTERM');
  const { code } = await exited;
  assert.equal(code, 0);
});

test('the Netlify scheduled function still works through the shared daily jobs', skipWithoutPg, async () => {
  await seedDueEquipment('Chaudière netlify');
  const previous = process.env.NETLIFY_DATABASE_URL;
  process.env.NETLIFY_DATABASE_URL = testDb.url;
  delete process.env.RESEND_API_KEY;
  try {
    const { handler, config } = require('../../netlify/functions/maintenance-scheduler');
    assert.deepEqual(config, { schedule: '@daily' });
    assert.deepEqual(await handler(), { statusCode: 200 });
    assert.ok((await workOrderTitles()).includes('Maintenance préventive — Chaudière netlify'));
  } finally {
    if (previous === undefined) delete process.env.NETLIFY_DATABASE_URL;
    else process.env.NETLIFY_DATABASE_URL = previous;
  }
});

test('the Netlify scheduled function reports 500 when the jobs fail', skipWithoutPg, async () => {
  const previous = process.env.NETLIFY_DATABASE_URL;
  process.env.NETLIFY_DATABASE_URL = 'postgresql://techbase:wrong@127.0.0.1:1/nope';
  const originalError = console.error;
  console.error = () => {}; // expected failure; keep test output clean
  try {
    const { handler } = require('../../netlify/functions/maintenance-scheduler');
    assert.deepEqual(await handler(), { statusCode: 500 });
  } finally {
    console.error = originalError;
    if (previous === undefined) delete process.env.NETLIFY_DATABASE_URL;
    else process.env.NETLIFY_DATABASE_URL = previous;
  }
});
