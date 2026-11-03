const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lib = require('../../scripts/release-lib');

const changelog = fs.readFileSync(path.join(lib.ROOT, 'CHANGELOG.md'), 'utf8');

test('the six version fields (3 package.json + 3 lockfiles) all agree', () => {
  const versions = lib.readVersions();
  assert.equal(Object.keys(versions).length, 9); // 3 package.json + 3 lockfile roots + 3 lockfile packages[""]
  assert.equal(new Set(Object.values(versions)).size, 1, JSON.stringify(versions, null, 2));
});

test('the version is a valid MAJOR.MINOR.PATCH', () => {
  assert.ok(lib.isSemver(lib.currentVersion()), `current version: ${lib.currentVersion()}`);
});

test('CHANGELOG.md has a non-empty section for the current version', () => {
  const notes = lib.releaseNotes(changelog, lib.currentVersion());
  assert.ok(notes.length > 20);
});

test('the Docker images report the version of the package they were built from', () => {
  // /api/health reads backend/package.json, which the backend image copies as /app/package.json.
  const { version } = require('../package.json');
  assert.equal(version, lib.currentVersion());
});

test('isSemver accepts releases and pre-releases, rejects everything else', () => {
  for (const ok of ['0.0.9', '1.0.0', '10.20.30', '1.0.0-rc.1']) assert.ok(lib.isSemver(ok), ok);
  for (const bad of ['v0.0.9', '0.0', '1.0.0.0', '01.0.0', '1.0.0+build', '', 'latest', undefined]) assert.ok(!lib.isSemver(bad), String(bad));
});

test('"latest" is for stable versions only; GitHub pre-release until 1.0.0', () => {
  assert.ok(lib.isStable('0.0.9'));
  assert.ok(!lib.isStable('1.0.0-rc.1'));
  assert.ok(lib.isPrerelease('0.0.9'));
  assert.ok(lib.isPrerelease('1.0.0-rc.1'));
  assert.ok(!lib.isPrerelease('1.0.0'));
});

const SAMPLE = [
  '# Journal',
  '',
  '## [Non publié]',
  '',
  '- futur',
  '',
  '## [1.2.3-rc.1] - Candidate',
  '',
  '- candidate line',
  '',
  '## [1.2.3] - Stable',
  '',
  '- first line',
  '- second line',
  '',
  '## [1.2.2] - Older',
  '',
  '- old line',
  '',
  '## [1.2.1] - Empty',
  '',
].join('\n');

test('releaseNotes returns exactly the requested section', () => {
  assert.equal(lib.releaseNotes(SAMPLE, '1.2.3'), '- first line\n- second line');
  assert.equal(lib.releaseNotes(SAMPLE, '1.2.3-rc.1'), '- candidate line');
  assert.equal(lib.releaseNotes(SAMPLE, '1.2.2'), '- old line');
});

test('releaseNotes fails loudly for a missing or empty section', () => {
  assert.throws(() => lib.releaseNotes(SAMPLE, '9.9.9'), /no "## \[9\.9\.9\]" section/);
  assert.throws(() => lib.releaseNotes(SAMPLE, '1.2.1'), /is empty/);
  // 1.2 must not match 1.2.3, and the dots are literal
  assert.throws(() => lib.releaseNotes(SAMPLE, '1.2'), /no "## \[1\.2\]" section/);
});

function copyVersionFiles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'techibase-version-'));
  for (const file of lib.VERSION_FILES) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(lib.ROOT, file), path.join(dir, file));
  }
  return dir;
}

test('setVersion rewrites only the version lines, in all six files', () => {
  const dir = copyVersionFiles();
  try {
    const before = lib.currentVersion(dir);
    lib.setVersion('7.8.9', dir);
    assert.equal(lib.currentVersion(dir), '7.8.9');
    for (const file of lib.VERSION_FILES) {
      const original = fs.readFileSync(path.join(lib.ROOT, file), 'utf8');
      const changed = fs.readFileSync(path.join(dir, file), 'utf8');
      // Putting the old version back gives the original file byte for byte: nothing else moved.
      assert.equal(changed.split('"version": "7.8.9"').join(`"version": "${before}"`), original, file);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('setVersion refuses an invalid version and leaves the files alone', () => {
  const dir = copyVersionFiles();
  try {
    const before = lib.currentVersion(dir);
    assert.throws(() => lib.setVersion('v1.0', dir), /not a valid version/);
    assert.equal(lib.currentVersion(dir), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('setVersion refuses a file it would reformat, and changes none of them', () => {
  const dir = copyVersionFiles();
  try {
    const before = lib.currentVersion(dir);
    const target = path.join(dir, 'frontend/package.json');
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace(/\n$/, '')); // drop the trailing newline
    assert.throws(() => lib.setVersion('7.8.9', dir), /canonical npm format/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
