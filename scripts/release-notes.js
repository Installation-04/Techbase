#!/usr/bin/env node
// Print the CHANGELOG.md section of a version (used as the GitHub Release body).
//
//   node scripts/release-notes.js 0.0.9
const fs = require('fs');
const path = require('path');
const { releaseNotes, isSemver, ROOT } = require('./release-lib');

const version = process.argv[2];
if (!isSemver(version)) {
  console.error('usage: node scripts/release-notes.js <version>   (for example 0.0.9)');
  process.exit(2);
}

try {
  console.log(releaseNotes(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), version));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
