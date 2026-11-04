// The updater service: a tiny HTTP API reachable only on the compose network, with a
// shared secret. It holds the Docker socket, so it accepts a fixed set of actions and
// nothing else (no shell, no arbitrary commands).
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Updater } = require('./lib');

const TOKEN = process.env.UPDATER_TOKEN || '';
const PROJECT_DIR = process.env.PROJECT_DIR || '/install';
const DATA_DIR = process.env.UPDATER_DATA_DIR || '/data';
const PORT = Number(process.env.UPDATER_PORT || 8090);

// docker <args> in the install folder; optional output redirected to a file (backups can be big).
// Compose gives the process environment priority over .env, and the version being switched lives
// in .env: never let a stray variable of this container's own environment override it.
const COMPOSE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['TECHIBASE_VERSION', 'TECHIBASE_REGISTRY', 'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME'].includes(k)));

function run(args, { outputFile, cmd = 'docker', args: rawArgs } = {}) {
  return new Promise(resolve => {
    const child = spawn(cmd, rawArgs || args, { cwd: PROJECT_DIR, env: COMPOSE_ENV });
    let out = ''; let err = '';
    const sink = outputFile ? fs.createWriteStream(outputFile) : null;
    child.stdout.on('data', d => { if (sink) sink.write(d); else out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => resolve({ code: 127, stdout: out, stderr: String(e.message) }));
    child.on('close', code => { if (sink) sink.end(); resolve({ code, stdout: out, stderr: err }); });
  });
}

const updater = new Updater({ run, projectDir: PROJECT_DIR, dataDir: DATA_DIR });

function authorised(req) {
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
  const want = Buffer.from(TOKEN);
  return TOKEN.length >= 32 && given.length === want.length && crypto.timingSafeEqual(given, want);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 4096) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); } });
  });
}

const server = http.createServer(async (req, res) => {
  const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  try {
    if (!authorised(req)) return send(401, { error: 'unauthorised' });
    if (req.method === 'GET' && req.url === '/status') return send(200, updater.state());
    if (req.method === 'POST' && req.url === '/update') {
      const { version } = await readJson(req);
      await updater.start(version);
      return send(202, { accepted: true });
    }
    if (req.method === 'POST' && req.url === '/rollback') {
      const prev = updater.state().from;
      if (!prev) return send(409, { error: 'Aucune version précédente connue.' });
      await updater.start(prev, { allowDowngrade: true, label: 'rollback' });
      return send(202, { accepted: true });
    }
    return send(404, { error: 'not found' });
  } catch (err) {
    return send(err.status || 500, { error: err.status ? err.message : 'Erreur interne' });
  }
});

if (require.main === module) {
  if (TOKEN.length < 32) { console.error('UPDATER_TOKEN must be at least 32 characters; refusing to start.'); process.exit(1); }
  server.listen(PORT, '0.0.0.0', () => console.log(`Updater listening on ${PORT}`));
}
module.exports = { server, authorised };
