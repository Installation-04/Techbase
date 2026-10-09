const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTime, msUntilNext } = require('../src/lib/schedule');

const HOUR = 3600 * 1000;

test('parseTime accepts 24 h times and rejects everything else', () => {
  assert.deepEqual(parseTime('06:00'), { hours: 6, minutes: 0 });
  assert.deepEqual(parseTime('6:30'), { hours: 6, minutes: 30 });
  assert.deepEqual(parseTime(' 23:59 '), { hours: 23, minutes: 59 });
  assert.deepEqual(parseTime('00:00'), { hours: 0, minutes: 0 });
  for (const bad of ['24:00', '06:60', '6', '06-00', 'noon', '', undefined]) {
    assert.throws(() => parseTime(bad), /Invalid time/, `should reject ${JSON.stringify(bad)}`);
  }
});

test('msUntilNext returns the time left until later today', () => {
  assert.equal(msUntilNext(new Date(2026, 9, 5, 5, 0, 0), '06:00'), HOUR);
  assert.equal(msUntilNext(new Date(2026, 9, 5, 23, 59, 0), '00:00'), 60 * 1000);
});

test('msUntilNext is strictly in the future: at or just after the run time means tomorrow', () => {
  assert.equal(msUntilNext(new Date(2026, 9, 5, 6, 0, 0, 0), '06:00'), 24 * HOUR);
  assert.equal(msUntilNext(new Date(2026, 9, 5, 6, 0, 0, 500), '06:00'), 24 * HOUR - 500);
  assert.equal(msUntilNext(new Date(2026, 9, 5, 7, 0, 0), '06:00'), 23 * HOUR);
});

test('msUntilNext follows the wall clock across a daylight-saving change', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Toronto'; // clocks jump 02:00 -> 03:00 on 2026-03-08
  try {
    // Saturday noon (EST) to Sunday 06:00 (EDT): 18 wall-clock hours, 17 real ones.
    assert.equal(msUntilNext(new Date(2026, 2, 7, 12, 0, 0), '06:00'), 17 * HOUR);
    // Ordinary day in the same zone is unaffected.
    assert.equal(msUntilNext(new Date(2026, 5, 10, 12, 0, 0), '06:00'), 18 * HOUR);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
