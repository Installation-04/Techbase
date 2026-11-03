const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

// get-techibase.sh is meant to be run as `curl ... | bash`. These tests do exactly
// that against a fake GitHub (releases list + bundle download) on localhost and a
// stubbed `docker`, so nothing real is installed.
const SCRIPT = fs.readFileSync(path.join(__dirname, '../../get-techibase.sh'), 'utf8');
const MANAGED = [
  'docker-compose.yml', 'docker-compose.release.yml', 'docker-compose.https.yml', 'Caddyfile',
  'install.sh', '.env.example', 'backend/db/init.sql', 'scripts/docker-smoke.sh',
];

const tools = ['bash', 'curl', 'tar'].every(t => spawnSync('sh', ['-c', `command -v ${t}`]).status === 0);
const skip = tools ? {} : { skip: 'bash, curl and tar are required' };

let root;
let server;
let baseUrl;
const bundles = {}; // version -> tar.gz Buffer

// A bundle shaped like the real one (techibase-vX-docker/...), with a stub install.sh
// that behaves like the real one where it matters: it keeps an existing .env, creates
// one from .env.example otherwise, and records that it ran.
function makeBundle(version) {
  const work = fs.mkdtempSync(path.join(root, 'bundle-'));
  const top = path.join(work, `techibase-v${version}-docker`);
  for (const file of MANAGED) {
    fs.mkdirSync(path.dirname(path.join(top, file)), { recursive: true });
    fs.writeFileSync(path.join(top, file), `# ${file} from ${version}\n`);
  }
  fs.writeFileSync(path.join(top, '.env.example'), `JWT_SECRET=changeme\nTECHIBASE_VERSION=${version}\nCOMPOSE_FILE=docker-compose.yml:docker-compose.release.yml\n`);
  fs.writeFileSync(path.join(top, 'install.sh'), [
    '#!/usr/bin/env bash',
    'set -e',
    '[ -n "$FAKE_INSTALL_FAILS" ] && exit 1',
    '[ -f .env ] || cp .env.example .env',
    'echo "install.sh ran with $(grep ^TECHIBASE_VERSION= .env)" > install.log',
    '',
  ].join('\n'));
  fs.chmodSync(path.join(top, 'install.sh'), 0o755);
  const tarball = path.join(work, 'bundle.tar.gz');
  const result = spawnSync('tar', ['czf', tarball, '-C', work, `techibase-v${version}-docker`]);
  assert.equal(result.status, 0, String(result.stderr));
  return fs.readFileSync(tarball);
}

test.before(async () => {
  if (skip.skip) return;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'techibase-get-'));
  for (const version of ['1.2.3', '1.2.4']) bundles[version] = makeBundle(version);
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/releases') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify([{ tag_name: 'v1.2.4', prerelease: true }, { tag_name: 'v1.2.3' }], null, 2));
    }
    const match = /^\/dl\/v([^/]+)\/techibase-v\1-docker\.tar\.gz$/.exec(url.pathname);
    if (match && bundles[match[1]]) return res.end(bundles[match[1]]);
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

// docker stub: `docker info` fails when DOCKER_DOWN is set; everything else succeeds.
function dockerShim() {
  const dir = fs.mkdtempSync(path.join(root, 'shim-'));
  fs.writeFileSync(path.join(dir, 'docker'), '#!/bin/sh\nif [ "$1" = info ] && [ -n "$DOCKER_DOWN" ]; then exit 1; fi\nexit 0\n');
  fs.chmodSync(path.join(dir, 'docker'), 0o755);
  return dir;
}

// Runs the script the way `curl ... | bash -s -- <args>` does (script on stdin).
function run(args, { env = {}, dir } = {}) {
  const target = dir || path.join(fs.mkdtempSync(path.join(root, 'target-')), 'techibase');
  const child = spawn('bash', ['-s', '--', ...args], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${dockerShim()}:${process.env.PATH}`,
      NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1',
      TECHIBASE_API_URL: `${baseUrl}/api`,
      TECHIBASE_DOWNLOAD_URL: `${baseUrl}/dl`,
      TECHIBASE_DIR: target,
      ...env,
    },
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.stdin.end(SCRIPT);
  return new Promise(resolve => child.on('close', code => resolve({ code, out, target })));
}

const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

test('installs the newest release when no version is given', skip, async () => {
  const { code, out, target } = await run([]);
  assert.equal(code, 0, out);
  assert.match(out, /Version la plus récente : 1\.2\.4/);
  for (const file of MANAGED) assert.ok(fs.existsSync(path.join(target, file)), file);
  assert.match(read(target, 'docker-compose.yml'), /from 1\.2\.4/);
  assert.match(read(target, '.env'), /TECHIBASE_VERSION=1\.2\.4/);
  assert.match(read(target, 'install.log'), /TECHIBASE_VERSION=1\.2\.4/);
  assert.ok(fs.statSync(path.join(target, 'install.sh')).mode & 0o100, 'install.sh is executable');
});

test('--version (with or without a leading v) and --dir are honoured', skip, async () => {
  const dir = path.join(fs.mkdtempSync(path.join(root, 'custom-')), 'here');
  const { code, out } = await run(['--version', 'v1.2.3', '--dir', dir], { env: { TECHIBASE_DIR: '' } });
  assert.equal(code, 0, out);
  assert.match(read(dir, '.env'), /TECHIBASE_VERSION=1\.2\.3/);
});

test('running it again upgrades: .env secrets are kept, version and compose files change', skip, async () => {
  const first = await run(['--version', '1.2.3']);
  assert.equal(first.code, 0, first.out);
  const envPath = path.join(first.target, '.env');
  fs.writeFileSync(envPath, 'JWT_SECRET=keep-me\nDB_PASSWORD=also-me\nTECHIBASE_VERSION=1.2.3\n'); // no COMPOSE_FILE yet

  const second = await run(['--version', '1.2.4'], { dir: first.target });
  assert.equal(second.code, 0, second.out);
  assert.match(second.out, /mise à jour vers 1\.2\.4/);
  const env = fs.readFileSync(envPath, 'utf8');
  assert.match(env, /^JWT_SECRET=keep-me$/m);
  assert.match(env, /^DB_PASSWORD=also-me$/m);
  assert.match(env, /^TECHIBASE_VERSION=1\.2\.4$/m);
  assert.equal(env.match(/^TECHIBASE_VERSION=/gm).length, 1);
  assert.match(env, /^COMPOSE_FILE=docker-compose\.yml:docker-compose\.release\.yml$/m);
  assert.match(read(first.target, 'docker-compose.yml'), /from 1\.2\.4/);
});

test('rejects a malformed version before downloading anything', skip, async () => {
  const { code, out, target } = await run(['--version', '1.2']);
  assert.notEqual(code, 0);
  assert.match(out, /n'est pas un numéro de version valide/);
  assert.equal(fs.existsSync(target), false);
});

test('a version that does not exist gives a clear error and creates nothing', skip, async () => {
  const { code, out, target } = await run(['--version', '9.9.9']);
  assert.notEqual(code, 0);
  assert.match(out, /téléchargement impossible/);
  assert.equal(fs.existsSync(target), false);
});

test('stops early when Docker is not answering', skip, async () => {
  const { code, out, target } = await run([], { env: { DOCKER_DOWN: '1' } });
  assert.notEqual(code, 0);
  assert.match(out, /Docker ne répond pas/);
  assert.equal(fs.existsSync(target), false);
});

test('rejects an unknown option', skip, async () => {
  const { code, out } = await run(['--nope']);
  assert.notEqual(code, 0);
  assert.match(out, /option inconnue : --nope/);
});

test('when install.sh fails it says so and points at the GHCR sign-in', skip, async () => {
  const { code, out } = await run(['--version', '1.2.3'], { env: { FAKE_INSTALL_FAILS: '1' } });
  assert.notEqual(code, 0);
  assert.match(out, /L'installation a échoué/);
  assert.match(out, /docker login ghcr\.io/);
});
