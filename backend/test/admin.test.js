const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

process.env.JWT_SECRET = 'test-secret';
process.env.UPDATE_CHECK = 'false'; // the route tests never touch the network
const { app } = require('../src/app');
const { issueToken } = require('../src/lib/token');
const { version } = require('../package.json');
const sys = require('../src/lib/systemInfo');

const as = role => ({ Authorization: `Bearer ${issueToken({ id: 1, email: 'a@example.com', name: 'A', role })}` });

test('compareVersions orders versions, pre-releases before the release', () => {
  assert.equal(sys.compareVersions('0.0.10', '0.0.9'), 1);
  assert.equal(sys.compareVersions('0.0.9', '0.0.10'), -1);
  assert.equal(sys.compareVersions('v1.2.3', '1.2.3'), 0);
  assert.equal(sys.compareVersions('1.0.0-rc1', '1.0.0'), -1);
  assert.equal(sys.compareVersions('1.0.0-rc2', '1.0.0-rc1'), 1);
});

test('pickLatest takes the highest published release, ignores drafts and odd tags, rejects foreign links', () => {
  const latest = sys.pickLatest([
    { tag_name: 'v0.0.9', body: 'old', html_url: 'https://github.com/x/y/releases/tag/v0.0.9', draft: false, prerelease: true },
    { tag_name: 'v0.0.11', body: 'new', html_url: 'https://evil.example/phish', draft: false, prerelease: true, published_at: '2026-11-04T00:00:00Z' },
    { tag_name: 'v0.0.12', body: 'draft', draft: true },
    { tag_name: 'nightly', draft: false },
  ]);
  assert.equal(latest.version, '0.0.11');
  assert.equal(latest.notes, 'new');
  assert.equal(latest.url, null, 'only github.com links are passed on');
  assert.equal(sys.pickLatest([]), null);
  assert.equal(sys.pickLatest(null), null);
});

test('detectInstall reads the deployment mode from the environment', () => {
  assert.deepEqual(sys.detectInstall({}), { mode: 'source', fromRelease: false, pinned: null });
  assert.deepEqual(sys.detectInstall({ DEPLOY_MODE: 'single', TECHIBASE_VERSION: '0.0.11' }), { mode: 'all-in-one', fromRelease: true, pinned: '0.0.11' });
  assert.equal(sys.detectInstall({ DEPLOY_MODE: 'multi' }).mode, 'four-containers');
  assert.equal(sys.detectInstall({ DEPLOY_MODE: 'multi', TECHIBASE_VERSION: 'dev' }).fromRelease, false, 'a locally built image is not a release');
  assert.equal(sys.detectInstall({ NETLIFY: 'true', TECHIBASE_VERSION: '1.0.0' }).mode, 'netlify');
});

test('fetchLatest caches for an hour, and failures are neither fatal nor cached', async () => {
  sys.resetCache();
  let calls = 0;
  const ok = async () => { calls++; return { ok: true, json: async () => [{ tag_name: 'v9.9.9', body: 'b', html_url: 'https://github.com/a/b', draft: false }] }; };
  const env = {};
  const first = await sys.fetchLatest({ fetchImpl: ok, now: 1000, env });
  assert.equal(first.latest.version, '9.9.9');
  await sys.fetchLatest({ fetchImpl: ok, now: 1000 + 59 * 60 * 1000, env });
  assert.equal(calls, 1, 'second call within the hour is served from cache');
  await sys.fetchLatest({ fetchImpl: ok, now: 1000 + 61 * 60 * 1000, env });
  assert.equal(calls, 2);

  sys.resetCache();
  const down = await sys.fetchLatest({ fetchImpl: async () => { throw new Error('offline'); }, env });
  assert.deepEqual(down, { latest: null, checked: false, reason: 'unreachable' });
  const limited = await sys.fetchLatest({ fetchImpl: async () => ({ ok: false, status: 403 }), env });
  assert.equal(limited.checked, false);
  const disabled = await sys.fetchLatest({ env: { UPDATE_CHECK: 'false' }, fetchImpl: async () => { throw new Error('must not be called'); } });
  assert.equal(disabled.reason, 'disabled');
  sys.resetCache();
});

test('systemInfo says an update is available only when the release is newer', async () => {
  sys.resetCache();
  const newer = async () => ({ ok: true, json: async () => [{ tag_name: 'v999.0.0', body: '', draft: false }] });
  const info = await sys.systemInfo({ fetchImpl: newer, env: {} });
  assert.equal(info.version, version);
  assert.equal(info.updateAvailable, true);
  sys.resetCache();
  const same = async () => ({ ok: true, json: async () => [{ tag_name: `v${version}`, body: '', draft: false }] });
  assert.equal((await sys.systemInfo({ fetchImpl: same, env: {} })).updateAvailable, false);
  sys.resetCache();
});

test('admin routes: 401 without a token, 403 for a plain user', async () => {
  for (const url of ['/api/admin/system', '/api/admin/health']) {
    assert.equal((await request(app).get(url)).status, 401, url);
    assert.equal((await request(app).get(url).set(as('user'))).status, 403, url);
  }
});

test('GET /api/admin/system for an admin', async () => {
  const res = await request(app).get('/api/admin/system').set(as('admin'));
  assert.equal(res.status, 200);
  assert.equal(res.body.version, version);
  assert.equal(res.body.mode, 'source');
  assert.equal(res.body.checked, false);
  assert.equal(res.body.reason, 'disabled');
  assert.equal(res.body.updaterAvailable, false);
});

let testDb;
test.before(async () => {
  if (skipWithoutPg.skip) return;
  testDb = await createTestDb();
  app.locals.db = testDb.pool;
});
test.after(async () => { if (testDb) await testDb.drop(); });

test('GET /api/admin/health reports the database, counts and the scheduler run', skipWithoutPg, async () => {
  await testDb.pool.query("INSERT INTO clients (name) VALUES ('Acme')");
  const before = await request(app).get('/api/admin/health').set(as('admin'));
  assert.equal(before.status, 200);
  assert.equal(before.body.database.ok, true);
  assert.ok(before.body.database.latencyMs >= 0);
  assert.equal(before.body.counts.clients, 1);
  assert.equal(before.body.scheduler, null, 'nothing has run yet');

  const { runDailyJobs } = require('../src/lib/dailyJobs');
  await runDailyJobs(testDb.pool);
  const after = await request(app).get('/api/admin/health').set(as('admin'));
  assert.equal(after.body.scheduler.created, 0);
  assert.ok(after.body.scheduler.at);
});

test('the health endpoint never throws when the database is down', skipWithoutPg, async () => {
  const saved = app.locals.db;
  app.locals.db = { query: async () => { throw new Error('connection refused'); } };
  try {
    const res = await request(app).get('/api/admin/health').set(as('admin'));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.database, { ok: false });
  } finally {
    app.locals.db = saved;
  }
});
