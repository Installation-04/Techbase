const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Updater, compareVersions, setEnvVar, readEnvVar } = require('../../docker/updater/lib');

function setup({ env = 'JWT_SECRET=x\nTECHIBASE_VERSION=0.0.11\nCOMPOSE_FILE=docker-compose.single.yml\n', services = ['techibase', 'updater'], pullCode = 0, upCodes = [0], health = {}, github = 200, backupBytes = 5000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-'));
  const projectDir = path.join(dir, 'install'); const dataDir = path.join(dir, 'data');
  fs.mkdirSync(projectDir); fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(projectDir, '.env'), env);
  const calls = []; let upIndex = 0;
  const run = async (args, opts = {}) => {
    calls.push({ args, opts });
    const [, sub, ...rest] = args || ['', 'raw'];
    if (opts.cmd === 'tar') { fs.writeFileSync(opts.args[1], Buffer.alloc(backupBytes, 1)); return { code: 0, stdout: '', stderr: '' }; }
    if (sub === 'config') return { code: 0, stdout: services.join('\n') + '\n', stderr: '' };
    if (sub === 'exec') {
      if (opts.outputFile) fs.writeFileSync(opts.outputFile, Buffer.alloc(backupBytes, 1));
      return { code: 0, stdout: '', stderr: '' };
    }
    if (sub === 'cp') return { code: 0, stdout: '', stderr: '' };
    if (sub === 'pull') return { code: pullCode, stdout: '', stderr: pullCode ? 'pull access denied\nregistry error' : '' };
    if (sub === 'up') return { code: upCodes[Math.min(upIndex++, upCodes.length - 1)], stdout: '', stderr: 'unhealthy' };
    return { code: 0, stdout: '', stderr: '' };
  };
  const envAtHealth = [];
  const fetchImpl = async url => {
    if (String(url).includes('api.github.com')) return { ok: github === 200, status: github };
    envAtHealth.push(fs.readFileSync(path.join(projectDir, '.env'), 'utf8'));
    const v = health[envAtHealth.length] ?? health.default;
    return { ok: !!v, json: async () => ({ status: 'ok', version: v }) };
  };
  const u = new Updater({ run, fetchImpl, projectDir, dataDir, sleep: async () => {}, healthTimeoutMs: 50 });
  const wait = async () => { for (let i = 0; i < 200 && u.running; i++) await new Promise(r => setTimeout(r, 5)); };
  return { u, calls, projectDir, dataDir, wait, envText: () => fs.readFileSync(path.join(projectDir, '.env'), 'utf8') };
}
const subs = calls => calls.map(c => c.args && c.args[1]).filter(Boolean);

test('version helpers', () => {
  assert.equal(compareVersions('0.0.12', '0.0.11'), 1);
  assert.equal(compareVersions('0.0.9', '0.0.10'), -1);
  assert.equal(readEnvVar('A=1\nTECHIBASE_VERSION=0.0.11\n', 'TECHIBASE_VERSION'), '0.0.11');
  assert.equal(setEnvVar('A=1\nTECHIBASE_VERSION=0.0.11\nB=2\n', 'TECHIBASE_VERSION', '0.0.12'), 'A=1\nTECHIBASE_VERSION=0.0.12\nB=2\n');
  assert.throws(() => setEnvVar('A=1\n', 'TECHIBASE_VERSION', '1.0.0'), /not set/);
});

test('a successful update: backup first, then .env, pull, recreate, health on the new version', async () => {
  const { u, calls, wait, envText } = setup({ health: { default: '0.0.12' } });
  await u.start('0.0.12');
  await wait();
  const s = u.state();
  assert.equal(s.state, 'success', JSON.stringify(s));
  assert.equal(s.from, '0.0.11'); assert.equal(s.to, '0.0.12');
  assert.match(s.backup, /^pre-update-0\.0\.11-to-0\.0\.12-.*\.tar\.gz$/);
  assert.match(envText(), /^TECHIBASE_VERSION=0\.0\.12$/m);
  const order = subs(calls);
  assert.ok(order.indexOf('exec') < order.indexOf('pull') && order.indexOf('pull') < order.indexOf('up'), order.join(','));
  const up = calls.find(c => c.args && c.args[1] === 'up').args;
  assert.deepEqual(up.slice(-1), ['techibase'], 'only the app service is recreated, never the updater itself');
  assert.ok(!up.includes('updater'));
});

test('four-container installs: db and app services are handled, db is never recreated', async () => {
  const { u, calls, wait } = setup({ services: ['db', 'backend', 'scheduler', 'frontend', 'updater', 'caddy'], health: { default: '0.0.12' } });
  await u.start('0.0.12');
  await wait();
  assert.equal(u.state().state, 'success', JSON.stringify(u.state()));
  const up = calls.find(c => c.args && c.args[1] === 'up').args;
  assert.deepEqual(up.slice(-3), ['backend', 'scheduler', 'frontend']);
  assert.ok(calls.some(c => c.args && c.args.join(' ').includes('pg_dump')), 'database dumped before the update');
});

test('a failed backup stops everything: no .env change, no pull', async () => {
  const { u, calls, wait, envText } = setup({ backupBytes: 10 });
  await u.start('0.0.12');
  await wait();
  const s = u.state();
  assert.equal(s.state, 'failed'); assert.match(s.error, /sauvegarde est vide/);
  assert.match(envText(), /^TECHIBASE_VERSION=0\.0\.11$/m);
  assert.ok(!subs(calls).includes('pull'));
});

test('a failing pull restores the version and recreates nothing', async () => {
  const { u, calls, wait, envText } = setup({ pullCode: 1 });
  await u.start('0.0.12');
  await wait();
  assert.equal(u.state().state, 'failed');
  assert.match(envText(), /^TECHIBASE_VERSION=0\.0\.11$/m);
  assert.ok(!subs(calls).includes('up'));
});

test('a new version that never becomes healthy is rolled back, and the old one verified', async () => {
  const { u, calls, wait, envText } = setup({ health: { default: '0.0.11' } }); // the app keeps answering 0.0.11
  await u.start('0.0.12');
  await wait();
  const s = u.state();
  assert.equal(s.state, 'rolled_back', JSON.stringify(s));
  assert.match(envText(), /^TECHIBASE_VERSION=0\.0\.11$/m);
  assert.equal(subs(calls).filter(x => x === 'up').length, 2, 'recreated once for the update, once for the rollback');
});

test('compose up failing, then rollback failing too, is reported as failed with the backup name', async () => {
  const { u, wait } = setup({ upCodes: [1, 1], health: { default: null } });
  await u.start('0.0.12');
  await wait();
  const s = u.state();
  assert.equal(s.state, 'failed');
  assert.match(s.error, /retour en arrière a échoué/);
  assert.match(s.error, /backups\/pre-update/);
});

test('refusals happen before anything is touched', async () => {
  const cases = [
    ['0.0.11', { status: 409, msg: /déjà installée/ }],
    ['0.0.10', { status: 409, msg: /plus ancienne/ }],
    ['latest', { status: 400, msg: /Version invalide/ }],
    ['0.0.12; rm -rf /', { status: 400, msg: /Version invalide/ }],
    ['0.0.12\n--help', { status: 400, msg: /Version invalide/ }],
    [{ toString: () => '0.0.12' }, { status: 400, msg: /Version invalide/ }],
  ];
  for (const [input, expected] of cases) {
    const { u, calls } = setup();
    await assert.rejects(u.start(input), err => err.status === expected.status && expected.msg.test(err.message), String(input));
    assert.equal(calls.length, 0, 'no docker command was run');
    assert.equal(u.running, false);
  }
});

test('a release that does not exist, and an unreachable GitHub, both refuse', async () => {
  const a = setup({ github: 404 });
  await assert.rejects(a.u.start('0.0.12'), err => err.status === 404);
  const b = setup({ github: 500 });
  await assert.rejects(b.u.start('0.0.12'), err => err.status === 502);
});

test('installs that are not pinned to an exact version cannot be updated automatically', async () => {
  for (const env of ['JWT_SECRET=x\n', 'TECHIBASE_VERSION=latest\n', 'TECHIBASE_VERSION=\n']) {
    const { u } = setup({ env });
    await assert.rejects(u.start('0.0.12'), err => err.status === 409 && /TECHIBASE_VERSION/.test(err.message), env);
  }
});

test('only one operation at a time', async () => {
  const { u, wait } = setup({ health: { default: '0.0.12' } });
  const first = u.start('0.0.12');
  await assert.rejects(u.start('0.0.13'), err => err.status === 409 && /déjà en cours/.test(err.message));
  await first; await wait();
  assert.equal(u.state().state, 'success');
});

test('rollback goes back to the previous version (downgrade allowed there only)', async () => {
  const { u, wait, envText } = setup({ env: 'TECHIBASE_VERSION=0.0.12\n', health: { default: '0.0.11' } });
  await assert.rejects(u.start('0.0.11'), err => /plus ancienne/.test(err.message));
  await u.start('0.0.11', { allowDowngrade: true, label: 'rollback' });
  await wait();
  assert.equal(u.state().state, 'success');
  assert.equal(u.state().label, 'rollback');
  assert.match(envText(), /^TECHIBASE_VERSION=0\.0\.11$/m);
});
