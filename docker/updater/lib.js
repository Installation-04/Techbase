// The update procedure, with every side effect injected (docker, GitHub, the clock) so it
// can be tested with fakes. Nothing here executes caller-supplied text: the only inputs
// are a version that must be MAJOR.MINOR.PATCH and a published release, and the fixed
// commands below.
const fs = require('fs');
const path = require('path');

const SEMVER = /^\d+\.\d+\.\d+$/;
// Where release existence is checked. Overridable only so the end-to-end test can run offline.
const RELEASES_API = process.env.UPDATER_RELEASES_API || 'https://api.github.com/repos/Installation-04/Techbase/releases/tags/';
const NOT_APP_SERVICES = new Set(['updater', 'db', 'caddy']);

function compareVersions(a, b) {
  const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  return 0;
}

function readEnvVar(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

// Replace KEY=old with KEY=value; the key must already exist (a source install has none).
function setEnvVar(text, key, value) {
  if (!new RegExp(`^${key}=`, 'm').test(text)) throw new Error(`${key} is not set in .env`);
  return text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
}

class Updater {
  constructor({ run, fetchImpl = fetch, projectDir, dataDir, now = () => new Date(), sleep = ms => new Promise(r => setTimeout(r, ms)), healthTimeoutMs = 90000 }) {
    Object.assign(this, { run, fetchImpl, projectDir, dataDir, now, sleep, healthTimeoutMs });
    this.statePath = path.join(dataDir, 'state.json');
    this.envPath = path.join(projectDir, '.env');
    this.running = false;
  }

  state() {
    try { return JSON.parse(fs.readFileSync(this.statePath, 'utf8')); } catch { return { state: 'idle', log: [] }; }
  }

  save(patch) {
    const next = { ...this.state(), ...patch };
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.statePath + '.tmp', JSON.stringify(next));
    fs.renameSync(this.statePath + '.tmp', this.statePath);
    return next;
  }

  log(line) {
    const s = this.state();
    this.save({ log: [...(s.log || []), `${this.now().toISOString().slice(11, 19)} ${line}`].slice(-200) });
  }

  async compose(args, opts) { return this.run(['compose', ...args], opts); }

  async services() {
    const r = await this.compose(['config', '--services']);
    if (r.code !== 0) throw new Error('docker compose config failed: ' + r.stderr.trim());
    return r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
  }

  // Everything that must be refused before touching anything.
  async preflight(target, { allowDowngrade }) {
    if (typeof target !== 'string' || !SEMVER.test(target)) throw Object.assign(new Error('Version invalide (attendu : X.Y.Z).'), { status: 400 });
    let envText;
    try { envText = fs.readFileSync(this.envPath, 'utf8'); } catch { throw Object.assign(new Error('Le fichier .env est introuvable dans le dossier d\'installation.'), { status: 500 }); }
    const current = readEnvVar(envText, 'TECHIBASE_VERSION');
    if (!current || !SEMVER.test(current)) throw Object.assign(new Error('Mise à jour automatique impossible : TECHIBASE_VERSION doit être fixée à une version précise (X.Y.Z) dans .env.'), { status: 409 });
    if (target === current) throw Object.assign(new Error(`La version ${target} est déjà installée.`), { status: 409 });
    if (!allowDowngrade && compareVersions(target, current) < 0) throw Object.assign(new Error('Version plus ancienne : utilisez « Revenir en arrière ».'), { status: 409 });
    const res = await this.fetchImpl(`${RELEASES_API}v${target}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'TechIBase-updater' }, signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res) throw Object.assign(new Error('GitHub est injoignable : impossible de vérifier que la version existe.'), { status: 502 });
    if (res.status === 404) throw Object.assign(new Error(`La version ${target} n'existe pas.`), { status: 404 });
    if (!res.ok) throw Object.assign(new Error(`GitHub a répondu ${res.status}.`), { status: 502 });
    return { envText, current };
  }

  start(target, { allowDowngrade = false, label = 'update' } = {}) {
    return (async () => {
      if (this.running) throw Object.assign(new Error('Une opération est déjà en cours.'), { status: 409 });
      this.running = true;
      try {
        const { envText, current } = await this.preflight(target, { allowDowngrade });
        this.save({ state: 'running', label, from: current, to: target, startedAt: this.now().toISOString(), finishedAt: null, backup: null, error: null, log: [] });
        this.execute(target, current, envText).catch(err => this.finish('failed', err.message)).finally(() => { this.running = false; });
      } catch (err) {
        this.running = false;
        throw err;
      }
    })();
  }

  finish(state, error = null) {
    this.save({ state, error, finishedAt: this.now().toISOString() });
    this.log(state === 'success' ? 'Terminé.' : state === 'rolled_back' ? 'Retour à la version précédente effectué.' : `Échec : ${error}`);
  }

  async waitHealthy(url, version) {
    const deadline = Date.now() + this.healthTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const r = await this.fetchImpl(`${url}/api/health`, { signal: AbortSignal.timeout(4000) });
        if (r.ok && (await r.json()).version === version) return true;
      } catch { /* not up yet */ }
      await this.sleep(2000);
    }
    return false;
  }

  async backup(services, from, to) {
    const dir = path.join(this.projectDir, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const name = `pre-update-${from}-to-${to}-${this.now().toISOString().slice(0, 19).replace(/[:T]/g, '')}.tar.gz`;
    const file = path.join(dir, name);
    if (services.includes('techibase')) {
      const r = await this.compose(['exec', '-T', 'techibase', 'techibase-backup'], { outputFile: file });
      if (r.code !== 0) throw new Error('La sauvegarde a échoué : ' + r.stderr.trim());
    } else {
      // Four-container stack: same archive layout as techibase-backup (db.sql, uploads/, MANIFEST).
      const work = fs.mkdtempSync(path.join(this.dataDir, 'bk-'));
      try {
        const dump = await this.compose(['exec', '-T', 'db', 'sh', '-c', 'pg_dump --clean --if-exists --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"'], { outputFile: path.join(work, 'db.sql') });
        if (dump.code !== 0) throw new Error('La sauvegarde de la base a échoué : ' + dump.stderr.trim());
        const cp = await this.compose(['cp', 'backend:/app/uploads/.', path.join(work, 'uploads')]);
        if (cp.code !== 0) { fs.mkdirSync(path.join(work, 'uploads'), { recursive: true }); }
        fs.writeFileSync(path.join(work, 'MANIFEST'), `techibase-backup v1 ${this.now().toISOString()}\n`);
        fs.mkdirSync(path.join(work, 'uploads'), { recursive: true });
        const tar = await this.run(null, { cmd: 'tar', args: ['-czf', file, '-C', work, 'MANIFEST', 'db.sql', 'uploads'] });
        if (tar.code !== 0) throw new Error('Impossible de créer l\'archive : ' + tar.stderr.trim());
      } finally {
        fs.rmSync(work, { recursive: true, force: true });
      }
    }
    if (!fs.existsSync(file) || fs.statSync(file).size < 200) throw new Error('La sauvegarde est vide.');
    return name;
  }

  async execute(target, current, envText) {
    const services = await this.services();
    const app = services.filter(s => !NOT_APP_SERVICES.has(s));
    if (app.length === 0) throw new Error('Aucun service TechIBase trouvé dans la configuration Compose.');
    const healthHost = services.includes('techibase') ? 'techibase' : 'frontend';
    const healthUrl = `http://${healthHost}:80`;

    this.log(`Sauvegarde avant la mise à jour…`);
    const backupName = await this.backup(services, current, target);
    this.save({ backup: backupName });
    this.log(`Sauvegarde créée : backups/${backupName}`);

    fs.writeFileSync(this.envPath + '.bak', envText);
    const writeVersion = v => fs.writeFileSync(this.envPath + '.tmp', setEnvVar(fs.readFileSync(this.envPath, 'utf8'), 'TECHIBASE_VERSION', v)) || fs.renameSync(this.envPath + '.tmp', this.envPath);
    writeVersion(target);
    this.log(`TECHIBASE_VERSION=${target}`);

    const pull = await this.compose(['pull', ...app]);
    if (pull.code !== 0) {
      writeVersion(current);
      return this.finish('failed', 'Téléchargement des images impossible (rien n\'a été modifié) : ' + pull.stderr.trim().split('\n').pop());
    }
    this.log('Images téléchargées. Redémarrage…');
    const up = await this.compose(['up', '-d', '--wait', '--wait-timeout', '180', ...app]);
    if (up.code === 0 && await this.waitHealthy(healthUrl, target)) return this.finish('success');

    this.log('La nouvelle version ne répond pas : retour en arrière…');
    writeVersion(current);
    const back = await this.compose(['up', '-d', '--wait', '--wait-timeout', '180', ...app]);
    if (back.code === 0 && await this.waitHealthy(healthUrl, current)) return this.finish('rolled_back', `La version ${target} n'a pas démarré correctement.`);
    return this.finish('failed', `La version ${target} n'a pas démarré et le retour en arrière a échoué. La sauvegarde est dans backups/${backupName}.`);
  }
}

module.exports = { Updater, compareVersions, readEnvVar, setEnvVar, SEMVER };
