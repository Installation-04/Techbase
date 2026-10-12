import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate } from '../src/lib/dates.mjs';

test('formats a date-only string as DD/MM/YYYY', () => {
  assert.equal(formatDate('2026-10-12'), '12/10/2026');
  assert.equal(formatDate('2026-01-05'), '05/01/2026');
  assert.equal(formatDate('2026-12-31'), '31/12/2026');
});

test('gives the same answer in every time zone (it never goes through Date)', () => {
  const previous = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Toronto', 'America/Los_Angeles', 'Europe/Paris', 'Pacific/Auckland']) {
      process.env.TZ = tz;
      assert.equal(formatDate('2026-10-12'), '12/10/2026', `in ${tz}`);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('uses the date part of a full ISO timestamp string', () => {
  assert.equal(formatDate('2026-10-12T00:00:00.000Z'), '12/10/2026');
});

test('empty values give an empty string', () => {
  for (const empty of [null, undefined, '']) assert.equal(formatDate(empty), '');
});

test('an unrecognised value is shown as-is, not hidden', () => {
  assert.equal(formatDate('bientôt'), 'bientôt');
});

test('why not new Date(): a date-only string is parsed as UTC and lands on the previous day in Québec', () => {
  // This is the bug the helper exists to avoid.
  const viaDate = new Date('2026-10-12').toLocaleDateString('fr-FR', { timeZone: 'America/Toronto' });
  assert.equal(viaDate, '11/10/2026');
  assert.notEqual(viaDate, formatDate('2026-10-12'));
});
