// scripts/release.sh: the maintainer's one command to prepare a version. It runs in a
// throwaway git repository that holds copies of the scripts and minimal version files.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
};

function run(cwd, cmd, args) {
  return spawnSync(cmd, args, { cwd, env: ENV, encoding: 'utf8' });
}

const pkg = (name, version, lock) => JSON.stringify(
  lock
    ? { name, version, lockfileVersion: 3, requires: true, packages: { '': { name, version } } }
    : { name, version },
  null, 2) + '\n';

function makeRepo({ changelog } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'techbase-release-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  for (const file of ['release.sh', 'release-lib.js', 'bump-version.js', 'release-notes.js']) {
    fs.copyFileSync(path.join(ROOT, 'scripts', file), path.join(dir, 'scripts', file));
  }
  fs.mkdirSync(path.join(dir, 'backend'));
  fs.mkdirSync(path.join(dir, 'frontend'));
  for (const base of ['.', 'backend', 'frontend']) {
    fs.writeFileSync(path.join(dir, base, 'package.json'), pkg('x', '0.0.1', false));
    fs.writeFileSync(path.join(dir, base, 'package-lock.json'), pkg('x', '0.0.1', true));
  }
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog ?? [
    '# Journal', '', '## [Non publié]', '', '- Une nouveauté.', '', '## [0.0.1] - Début', '', '- Première version.', '',
  ].join('\n'));
  assert.equal(run(dir, 'git', ['init', '-q', '-b', 'main']).status, 0);
  assert.equal(run(dir, 'git', ['add', '-A']).status, 0);
  assert.equal(run(dir, 'git', ['commit', '-q', '-m', 'init']).status, 0);
  return dir;
}

test('release.sh dates the changelog, bumps the six files, commits and tags (and pushes nothing)', () => {
  const dir = makeRepo();
  const res = run(dir, 'bash', ['scripts/release.sh', '0.0.2']);
  assert.equal(res.status, 0, res.stderr);

  const changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /## \[Non publié\]\n\n## \[0\.0\.2\] - \d{4}-\d{2}-\d{2}\n\n- Une nouveauté\./);
  for (const base of ['.', 'backend', 'frontend']) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, base, 'package.json'), 'utf8')).version, '0.0.2');
    const lock = JSON.parse(fs.readFileSync(path.join(dir, base, 'package-lock.json'), 'utf8'));
    assert.equal(lock.version, '0.0.2');
    assert.equal(lock.packages[''].version, '0.0.2');
  }
  assert.equal(run(dir, 'git', ['log', '-1', '--format=%s']).stdout.trim(), 'chore(release): v0.0.2');
  assert.equal(run(dir, 'git', ['cat-file', '-t', 'v0.0.2']).stdout.trim(), 'tag'); // annotated
  assert.equal(run(dir, 'git', ['status', '--porcelain']).stdout.trim(), '');
  assert.match(res.stdout, /git push origin main && git push origin v0\.0\.2/);
});

test('release.sh accepts a title instead of the date', () => {
  const dir = makeRepo();
  assert.equal(run(dir, 'bash', ['scripts/release.sh', '0.1.0-rc.1', 'Cycle de maintenance']).status, 0);
  assert.match(fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8'), /## \[0\.1\.0-rc\.1\] - Cycle de maintenance/);
});

test('release.sh refuses an invalid version, an existing tag, an empty changelog, a dirty tree and another branch', () => {
  const dir = makeRepo();
  const refuses = (args, pattern) => {
    const res = run(dir, 'bash', ['scripts/release.sh', ...args]);
    assert.notEqual(res.status, 0, `${args.join(' ')} should fail`);
    assert.match(res.stderr, pattern);
  };
  refuses(['v0.0.2'], /usage/);
  refuses(['0.0'], /usage/);

  fs.writeFileSync(path.join(dir, 'dirty.txt'), 'x');
  refuses(['0.0.2'], /non propre/);
  fs.rmSync(path.join(dir, 'dirty.txt'));

  run(dir, 'git', ['checkout', '-q', '-b', 'feature']);
  refuses(['0.0.2'], /branche main/);
  run(dir, 'git', ['checkout', '-q', 'main']);

  assert.equal(run(dir, 'bash', ['scripts/release.sh', '0.0.2']).status, 0);
  refuses(['0.0.2'], /existe déjà/);

  // Nothing left under [Non publié] after the release above.
  refuses(['0.0.3'], /vide/);
});
