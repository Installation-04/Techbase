// Shared by scripts/bump-version.js, scripts/release-notes.js, the Release
// workflow and backend/test/release.test.js.
//
// The application version lives in six files that must always agree: the three
// package.json files and their lockfiles. /api/health, the sidebar footer, the
// Docker image tags and the GitHub Release all derive from it.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PACKAGE_FILES = ['package.json', 'backend/package.json', 'frontend/package.json'];
const LOCK_FILES = ['package-lock.json', 'backend/package-lock.json', 'frontend/package-lock.json'];
const VERSION_FILES = [...PACKAGE_FILES, ...LOCK_FILES];

// MAJOR.MINOR.PATCH with an optional pre-release suffix (1.0.0-rc.1). No build metadata, no "v".
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

function isSemver(version) {
  return SEMVER.test(String(version));
}

// A version is "stable" for the `latest` image tag when it has no pre-release suffix.
function isStable(version) {
  return isSemver(version) && !String(version).includes('-');
}

// Until 1.0.0 the project is a beta: GitHub Releases are flagged pre-release.
function isPrerelease(version) {
  return !isStable(version) || String(version).startsWith('0.');
}

function readJson(file, root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

// { 'package.json': '0.0.9', 'package-lock.json': '0.0.9', 'package-lock.json#root': '0.0.9', ... }
function readVersions(root = ROOT) {
  const versions = {};
  for (const file of PACKAGE_FILES) versions[file] = readJson(file, root).version;
  for (const file of LOCK_FILES) {
    const lock = readJson(file, root);
    versions[file] = lock.version;
    versions[`${file}#packages[""]`] = lock.packages && lock.packages[''] && lock.packages[''].version;
  }
  return versions;
}

// The single version if all files agree, otherwise null (and `versions` shows the disagreement).
function currentVersion(root = ROOT) {
  const values = new Set(Object.values(readVersions(root)));
  return values.size === 1 ? [...values][0] : null;
}

// Writes `version` into the six files. Refuses to touch anything if a file would
// not survive a parse/stringify round trip unchanged (so the diff is exactly the
// version lines and never a reformat).
function setVersion(version, root = ROOT) {
  if (!isSemver(version)) throw new Error(`"${version}" is not a valid version (expected MAJOR.MINOR.PATCH, e.g. 0.0.9)`);
  const updates = [];
  for (const file of VERSION_FILES) {
    const full = path.join(root, file);
    const text = fs.readFileSync(full, 'utf8');
    const json = JSON.parse(text);
    if (JSON.stringify(json, null, 2) + '\n' !== text) {
      throw new Error(`${file} is not in the canonical npm format; refusing to rewrite it`);
    }
    json.version = version;
    if (json.packages && json.packages['']) json.packages[''].version = version;
    updates.push([full, JSON.stringify(json, null, 2) + '\n']);
  }
  for (const [full, text] of updates) fs.writeFileSync(full, text);
}

// The text of the `## [version]` section of CHANGELOG.md, without its heading.
function releaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const heading = new RegExp(`^## \\[${version.replace(/[.+-]/g, '\\$&')}\\]`);
  const start = lines.findIndex(line => heading.test(line));
  if (start === -1) throw new Error(`CHANGELOG.md has no "## [${version}]" section`);
  let end = lines.findIndex((line, i) => i > start && /^## \[/.test(line));
  if (end === -1) end = lines.length;
  const body = lines.slice(start + 1, end).join('\n').trim();
  if (!body) throw new Error(`The "## [${version}]" section of CHANGELOG.md is empty`);
  return body;
}

module.exports = {
  ROOT, PACKAGE_FILES, LOCK_FILES, VERSION_FILES,
  isSemver, isStable, isPrerelease, readVersions, currentVersion, setVersion, releaseNotes,
};
