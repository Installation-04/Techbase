const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const DEFAULT_PORT = '26591';
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

const tools = ['bash', 'curl', 'grep'].every(t => spawnSync('sh', ['-c', `command -v ${t}`]).status === 0);
const skip = tools ? {} : { skip: 'bash, curl and grep are required' };

test('one default port everywhere: .env.example, the compose fallback and the smoke test agree', () => {
  assert.match(read(ROOT, '.env.example'), new RegExp(`^HTTP_PORT=${DEFAULT_PORT}$`, 'm'));
  assert.ok(read(ROOT, 'docker-compose.yml').includes(`"\${HTTP_PORT:-${DEFAULT_PORT}}:80"`));
  assert.ok(read(ROOT, 'scripts/docker-smoke.sh').includes(`\${HTTP_PORT:-${DEFAULT_PORT}}`));
  assert.ok(read(ROOT, 'install.sh').includes(`PORT="\${PORT:-${DEFAULT_PORT}}"`));
});

test('the workflows do not assume the web app is on port 80', () => {
  for (const file of ['.github/workflows/release.yml', '.github/workflows/ci.yml']) {
    assert.doesNotMatch(read(ROOT, file), /http:\/\/localhost[\/{]/, `${file} hardcodes http://localhost/`);
  }
});

// Runs the real install.sh in a temp directory with a stubbed docker, so nothing starts.
function runInstaller(envFile, { args = [], example } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'techibase-install-'));
  fs.copyFileSync(path.join(ROOT, 'install.sh'), path.join(dir, 'install.sh'));
  if (example === undefined) fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(dir, '.env.example'));
  else fs.writeFileSync(path.join(dir, '.env.example'), example);
  const shim = path.join(dir, 'shim');
  fs.mkdirSync(shim);
  fs.writeFileSync(path.join(shim, 'docker'), '#!/bin/sh\necho "$*" >> "$(dirname "$0")/../docker.log"\nexit 0\n', { mode: 0o755 });
  if (envFile !== undefined) fs.writeFileSync(path.join(dir, '.env'), envFile);
  const result = spawnSync('bash', [path.join(dir, 'install.sh'), ...args], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${shim}:${process.env.PATH}` },
  });
  return { dir, out: result.stdout + result.stderr, code: result.status };
}

test('a new install uses the default port, stores it in .env, and says where to open the app', skip, () => {
  const { dir, out, code } = runInstaller();
  try {
    assert.equal(code, 0, out);
    assert.match(read(dir, '.env'), new RegExp(`^HTTP_PORT=${DEFAULT_PORT}$`, 'm'));
    assert.match(out, new RegExp(`Application accessible sur : http://localhost:${DEFAULT_PORT}\\b`));
    assert.match(out, /pour le changer, modifiez HTTP_PORT dans \.env/);
    assert.match(read(dir, 'docker.log'), /compose up/);
    assert.doesNotMatch(read(dir, '.env'), /^JWT_SECRET=change_this_secret_in_production$/m, 'secrets are generated');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an existing .env is kept as it is: an old install on port 80 stays on port 80', skip, () => {
  const existing = 'JWT_SECRET=keep-me-0123456789abcdef0123456789abcdef\nDB_PASSWORD=keep-too\nHTTP_PORT=80\n';
  const { dir, out, code } = runInstaller(existing);
  try {
    assert.equal(code, 0, out);
    assert.equal(read(dir, '.env'), existing);
    assert.match(out, /Application accessible sur : http:\/\/localhost\n/);
    assert.doesNotMatch(out, /localhost:80/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an existing .env without HTTP_PORT gets the default port in the message (and in compose)', skip, () => {
  const { dir, out, code } = runInstaller('JWT_SECRET=keep-me-0123456789abcdef0123456789abcdef\n');
  try {
    assert.equal(code, 0, out);
    assert.match(out, new RegExp(`http://localhost:${DEFAULT_PORT}\\b`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the smoke test targets the port written in .env', skip, async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  // The script runs from its parent directory and reads .env there, as in a real install.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'techibase-smoke-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(path.join(ROOT, 'scripts/docker-smoke.sh'), path.join(dir, 'scripts/docker-smoke.sh'));
  fs.writeFileSync(path.join(dir, '.env'), `JWT_SECRET=x\nHTTP_PORT=${port}\n`);
  const shim = path.join(dir, 'shim');
  fs.mkdirSync(shim);
  fs.writeFileSync(path.join(shim, 'docker'), '#!/bin/sh\nexit 1\n', { mode: 0o755 }); // the container checks fail, which is fine here

  try {
    const env = { ...process.env, PATH: `${shim}:${process.env.PATH}`, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' };
    delete env.HTTP_PORT;
    delete env.BASE;
    const child = spawn('bash', [path.join(dir, 'scripts/docker-smoke.sh')], { cwd: dir, env });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    await new Promise(resolve => child.on('close', resolve));
    assert.match(out, new RegExp(`Smoke test against http://localhost:${port}\\b`));
    assert.match(out, /API answers through nginx \(\/api\/health\)\s+ok/);
    assert.ok(requests.includes('/api/health'), 'the health check reached the port from .env');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- one container (default) or four ----

test('a new install runs as ONE container and records that in COMPOSE_FILE', skip, () => {
  const { dir, out, code } = runInstaller();
  try {
    assert.equal(code, 0, out);
    assert.match(read(dir, '.env'), /^COMPOSE_FILE=docker-compose\.single\.yml$/m);
    assert.match(out, /un seul conteneur/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a release-bundle install gets the published all-in-one image', skip, () => {
  const bundleExample = read(ROOT, '.env.example') + '\nTECHIBASE_VERSION=0.0.10\nCOMPOSE_FILE=docker-compose.yml:docker-compose.release.yml\n';
  const { dir, out, code } = runInstaller(undefined, { example: bundleExample });
  try {
    assert.equal(code, 0, out);
    const env = read(dir, '.env');
    assert.match(env, /^COMPOSE_FILE=docker-compose\.single\.yml:docker-compose\.single\.release\.yml$/m);
    assert.equal((env.match(/^COMPOSE_FILE=/gm) || []).length, 1, 'COMPOSE_FILE appears once');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--multi keeps the four-container stack', skip, () => {
  const { dir, out, code } = runInstaller(undefined, { args: ['--multi'] });
  try {
    assert.equal(code, 0, out);
    assert.doesNotMatch(read(dir, '.env'), /^COMPOSE_FILE=/m);
    assert.match(out, /db, backend, scheduler, frontend/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an existing four-container install is never switched to the single container', skip, () => {
  const existing = 'JWT_SECRET=keep-me-0123456789abcdef0123456789abcdef\nDB_PASSWORD=keep-too\nCOMPOSE_FILE=docker-compose.yml:docker-compose.release.yml\nTECHIBASE_VERSION=0.0.9\n';
  const { dir, out, code } = runInstaller(existing);
  try {
    assert.equal(code, 0, out);
    assert.equal(read(dir, '.env'), existing, '.env is untouched');
    assert.match(out, /db, backend, scheduler, frontend/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install.sh rejects an unknown option', skip, () => {
  const { dir, out, code } = runInstaller(undefined, { args: ['--bogus'] });
  try {
    assert.equal(code, 2);
    assert.match(out, /Option inconnue/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
