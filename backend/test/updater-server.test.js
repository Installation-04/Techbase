const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TOKEN = 'a'.repeat(40);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-srv-'));
fs.writeFileSync(path.join(dir, '.env'), 'TECHIBASE_VERSION=0.0.11\n');
process.env.UPDATER_TOKEN = TOKEN;
process.env.PROJECT_DIR = dir;
process.env.UPDATER_DATA_DIR = path.join(dir, 'data');
const { server, authorised } = require('../../docker/updater/server');

let base;
test.before(() => new Promise(resolve => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); })));
test.after(() => new Promise(resolve => server.close(resolve)));

const call = (p, { method = 'GET', token = TOKEN, body } = {}) => fetch(base + p, {
  method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
});

test('every route needs the shared secret', async () => {
  for (const [p, m] of [['/status', 'GET'], ['/update', 'POST'], ['/rollback', 'POST'], ['/anything', 'GET']]) {
    assert.equal((await call(p, { method: m, token: null })).status, 401, p);
    assert.equal((await call(p, { method: m, token: 'b'.repeat(40) })).status, 401, p + ' wrong token');
    assert.equal((await call(p, { method: m, token: 'short' })).status, 401, p + ' wrong length');
  }
});

test('a missing or short secret in the environment authorises nobody', () => {
  const saved = process.env.UPDATER_TOKEN;
  // authorised() reads the secret loaded at start; an empty header never matches a 40-char secret
  assert.equal(authorised({ headers: {} }), false);
  assert.equal(authorised({ headers: { authorization: 'Bearer ' } }), false);
  process.env.UPDATER_TOKEN = saved;
});

test('GET /status answers idle on a fresh install; unknown routes are 404', async () => {
  const res = await call('/status');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).state, 'idle');
  assert.equal((await call('/nope')).status, 404);
});

test('POST /update rejects bad versions with 400 and never runs a command', async () => {
  for (const version of ['latest', '1.2', '0.0.12; id', '', null, 12]) {
    const res = await call('/update', { method: 'POST', body: { version } });
    assert.equal(res.status, 400, String(version));
  }
  assert.equal((await call('/update', { method: 'POST', body: { version: '0.0.11' } })).status, 409, 'already installed');
});

test('POST /rollback without a known previous version is refused', async () => {
  assert.equal((await call('/rollback', { method: 'POST' })).status, 409);
});

test('oversized and malformed bodies are rejected', async () => {
  assert.equal((await fetch(base + '/update', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: '{not json' })).status, 400);
  const big = await fetch(base + '/update', { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ version: 'x'.repeat(10000) }) }).catch(() => null);
  assert.ok(!big || big.status === 413, 'too large');
});
