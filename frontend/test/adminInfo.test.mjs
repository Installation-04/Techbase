import test from 'node:test';
import assert from 'node:assert/strict';
import { updateInstructions, formatBytes, formatDuration, MODE_LABELS, plainNotes } from '../src/lib/adminInfo.mjs';

test('update instructions follow the way TechIBase was installed', () => {
  const release = updateInstructions({ mode: 'all-in-one', fromRelease: true }, '0.0.12');
  assert.equal(release.steps[0], "Dans le dossier d'installation, éditez .env : TECHIBASE_VERSION=0.0.12");
  assert.match(release.steps[1], /docker compose pull && docker compose up -d --wait/);
  const source = updateInstructions({ mode: 'source', fromRelease: false }, '0.0.12');
  assert.deepEqual(source.steps, ['git pull', 'docker compose up -d --build --wait']);
  assert.match(updateInstructions({ mode: 'netlify', fromRelease: false }).steps[0], /Netlify/);
  assert.match(updateInstructions({ mode: 'all-in-one', fromRelease: true }).steps[0], /X\.Y\.Z/, 'no latest version known');
});

test('every install mode the API reports has a label', () => {
  for (const mode of ['all-in-one', 'four-containers', 'netlify', 'source']) assert.ok(MODE_LABELS[mode], mode);
});

test('formatBytes and formatDuration', () => {
  assert.equal(formatBytes(0), '0 o');
  assert.equal(formatBytes(1536), '1.5 Ko');
  assert.equal(formatBytes(25 * 1024 * 1024), '25 Mo');
  assert.equal(formatBytes(null), '—');
  assert.equal(formatDuration(90), '1 min');
  assert.equal(formatDuration(3 * 3600 + 120), '3 h 2 min');
  assert.equal(formatDuration(2 * 86400 + 5 * 3600), '2 j 5 h');
  assert.equal(formatDuration(undefined), '—');
});

test('plainNotes turns release-note Markdown into readable text without rendering any HTML', () => {
  const md = "- **Un seul conteneur** : voir `techibase-backup`.\n\n## Images Docker\n\n```bash\ndocker pull x\n```\n\nVoir [le guide](https://example.com).\n<script>alert(1)</script>";
  const text = plainNotes(md);
  assert.equal(text, "• Un seul conteneur : voir techibase-backup.\n\nImages Docker\n\ndocker pull x\n\nVoir le guide.\n<script>alert(1)</script>");
  assert.equal(plainNotes(null), '');
});
