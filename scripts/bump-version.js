#!/usr/bin/env node
// Set the application version in all six places (3 package.json + 3 lockfiles).
//
//   node scripts/bump-version.js 0.0.9      set it
//   node scripts/bump-version.js            show the current version (exit 1 if files disagree)
const { setVersion, readVersions, currentVersion } = require('./release-lib');

const wanted = process.argv[2];

if (!wanted) {
  const current = currentVersion();
  if (current) {
    console.log(current);
    process.exit(0);
  }
  console.error('The version files disagree:');
  for (const [file, version] of Object.entries(readVersions())) console.error(`  ${file}: ${version}`);
  process.exit(1);
}

try {
  setVersion(wanted);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Version set to ${wanted} in package.json, backend/package.json, frontend/package.json and their lockfiles.`);
console.log('Next: move the "Non publié" entries of CHANGELOG.md under a "## [' + wanted + '] - ..." heading.');
