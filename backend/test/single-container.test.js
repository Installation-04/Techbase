const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

const ROOT = path.join(__dirname, '../..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const have = tool => spawnSync('sh', ['-c', `command -v ${tool}`]).status === 0;
const skipNoBash = have('bash') ? {} : { skip: 'bash is required' };
const skipNoPgTools = have('pg_dump') && have('psql') && have('tar') && !skipWithoutPg.skip ? {} : { skip: 'pg_dump, psql, tar and TEST_DATABASE_URL are required' };

test('the all-in-one image ships the supervisor, backup/restore and the nginx config it references', () => {
  const dockerfile = read('Dockerfile');
  for (const file of ['docker/single/entrypoint.sh', 'docker/single/backup.sh', 'docker/single/restore.sh', 'docker/single/nginx.conf', 'frontend/nginx-security-headers.conf']) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} exists`);
    assert.ok(dockerfile.includes(file), `Dockerfile copies ${file}`);
  }
  assert.match(dockerfile, /FROM postgres:15-bookworm/, 'same Debian PostgreSQL 15 as the 4-container stack, so data directories are compatible');
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /ENTRYPOINT \["tini"/);
});

test('single-container nginx config is the frontend config pointed at the local API', () => {
  const single = read('docker/single/nginx.conf');
  const multi = read('frontend/nginx.conf');
  assert.equal(single, multi.replace('proxy_pass http://backend:3001;', 'proxy_pass http://127.0.0.1:3001;'));
});

test('the single-container compose file: default port, one data volume, version override', () => {
  const compose = read('docker-compose.single.yml');
  assert.ok(compose.includes('"${HTTP_PORT:-26591}:80"'), 'same default port as the 4-container stack');
  assert.match(compose, /techibase_data:\/data/);
  assert.match(compose, /^\s+JWT_SECRET: "\$\{JWT_SECRET:\?/m, 'JWT_SECRET is required');
  assert.match(read('docker-compose.single.release.yml'), /techbase:\$\{TECHIBASE_VERSION:\?/);
  assert.match(read('Caddyfile.single'), /reverse_proxy techibase:80/);
});

test('every setting the 4-container backend receives also reaches the all-in-one container', () => {
  const settings = file => new Set([...read(file).matchAll(/^\s+([A-Z][A-Z0-9_]+): /gm)].map(m => m[1]));
  // UPLOADS_DIR is set by the entrypoint (/data/uploads); the Postgres variables belong to the bundled database.
  const multi = settings('docker-compose.yml');
  const single = settings('docker-compose.single.yml');
  const missing = [...multi].filter(k => !single.has(k) && !['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'UPLOADS_DIR', 'DB_HOST', 'DB_PORT'].includes(k));
  assert.deepEqual(missing, [], `missing in docker-compose.single.yml: ${missing.join(', ')}`);
});

test('a .env copied from .env.example (DB_HOST=db) must not turn the bundled database off', () => {
  // The four-container stack uses DB_HOST=db; the all-in-one container would read it as "external database".
  assert.match(read('.env.example'), /^DB_HOST=db$/m, 'this guard assumes .env.example still carries DB_HOST=db');
  assert.doesNotMatch(read('docker-compose.single.yml'), /^\s+DB_(HOST|PORT):/m);
});

test('DATABASE_URL selects an external database', () => {
  const saved = { ...process.env };
  try {
    delete process.env.NETLIFY_DATABASE_URL; delete process.env.NETLIFY_DB_URL;
    process.env.DATABASE_URL = 'postgres://u:p@db.example.com:5432/techibase';
    delete require.cache[require.resolve('../src/db')];
    const pool = require('../src/db').createPool();
    assert.equal(pool.options.connectionString, 'postgres://u:p@db.example.com:5432/techibase');
    pool.end();
  } finally {
    process.env = saved;
    delete require.cache[require.resolve('../src/db')];
  }
});

function runEntrypoint(env) {
  const base = { PATH: process.env.PATH, HOME: os.tmpdir() };
  return spawnSync('bash', [path.join(ROOT, 'docker/single/entrypoint.sh')], { encoding: 'utf8', env: { ...base, ...env }, timeout: 15000 });
}

test('the supervisor refuses to start without JWT_SECRET', skipNoBash, () => {
  const r = runEntrypoint({});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /JWT_SECRET is not set/);
});

test('the supervisor rejects database names that are not plain identifiers', skipNoBash, () => {
  const r = runEntrypoint({ JWT_SECRET: 'x', DB_NAME: 'bad name; DROP DATABASE x' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /DB_NAME and DB_USER may only contain/);
});

// A dump made by a newer pg_dump than the server can contain settings the server does not know
// (pg_dump 17 writes SET transaction_timeout, rejected by PostgreSQL 16 on restore). The image
// always has matching tools; the test must use matching ones too.
function matchingPgToolsPath(serverMajor) {
  const dir = `/usr/lib/postgresql/${serverMajor}/bin`;
  if (fs.existsSync(path.join(dir, 'pg_dump'))) return `${dir}:${process.env.PATH}`;
  const out = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' }).stdout || '';
  return out.match(/\s(\d+)[.\s]/)?.[1] === String(serverMajor) ? process.env.PATH : null;
}

test('backup then restore brings back the database AND the uploaded documents', skipNoPgTools, async t => {
  const db = await createTestDb();
  const serverMajor = Math.floor((await db.pool.query('SHOW server_version_num')).rows[0].server_version_num / 10000);
  const toolsPath = matchingPgToolsPath(serverMajor);
  if (!toolsPath) {
    await db.drop();
    return t.skip(`no pg_dump ${serverMajor} to match the test server (install postgresql-client-${serverMajor})`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'techibase-backup-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'uploads', 'plan.pdf'), 'original bytes');
  const env = { PATH: toolsPath, DATABASE_URL: db.url, DATA_DIR: dataDir };
  const run = (script, input) => spawnSync('bash', [path.join(ROOT, 'docker/single', script)], { env, input, maxBuffer: 64 * 1024 * 1024 });
  try {
    await db.pool.query("INSERT INTO clients (name) VALUES ('Usine Métal Laval')");

    const backup = run('backup.sh');
    assert.equal(backup.status, 0, backup.stderr.toString());
    assert.deepEqual([...backup.stdout.subarray(0, 2)], [0x1f, 0x8b], 'output is a gzip stream');

    // Disaster: the client is deleted and the document is changed and another one appears.
    await db.pool.query('DELETE FROM clients');
    fs.writeFileSync(path.join(dataDir, 'uploads', 'plan.pdf'), 'corrupted');
    fs.writeFileSync(path.join(dataDir, 'uploads', 'stray.txt'), 'should disappear');

    const restore = run('restore.sh', backup.stdout);
    assert.equal(restore.status, 0, restore.stderr.toString());
    const { rows } = await db.pool.query('SELECT name FROM clients');
    assert.deepEqual(rows.map(r => r.name), ['Usine Métal Laval']);
    assert.equal(fs.readFileSync(path.join(dataDir, 'uploads', 'plan.pdf'), 'utf8'), 'original bytes');
    assert.equal(fs.existsSync(path.join(dataDir, 'uploads', 'stray.txt')), false, 'files added after the backup are removed');

    const bad = run('restore.sh', Buffer.from('this is not an archive'));
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr.toString(), /not a valid backup archive/);
    assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM clients')).rows[0].n, 1, 'a bad archive changes nothing');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    await db.drop();
  }
});
