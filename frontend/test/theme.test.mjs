import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { PREFERENCES, normalizePreference, resolveTheme, nextPreference } from '../src/lib/theme.mjs';

test('an unknown or missing stored value means "follow the system"', () => {
  for (const value of [null, undefined, '', 'blue', 'DARK', 42]) assert.equal(normalizePreference(value), 'system');
  for (const value of PREFERENCES) assert.equal(normalizePreference(value), value);
});

test('light and dark ignore the system; system follows it', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('garbage', true), 'dark'); // falls back to system
});

test('the toggle cycles system -> light -> dark -> system', () => {
  assert.equal(nextPreference('system'), 'light');
  assert.equal(nextPreference('light'), 'dark');
  assert.equal(nextPreference('dark'), 'system');
  assert.equal(nextPreference('garbage'), 'light');
});

// public/theme-init.js runs before React in the browser. Execute it for real, against a fake
// window, and require it to agree with resolveTheme() for every combination.
const initSource = fs.readFileSync(fileURLToPath(new URL('../public/theme-init.js', import.meta.url)), 'utf8');

function runInit({ stored, systemDark, storageThrows = false, noMatchMedia = false }) {
  const classes = new Set();
  const window = {
    matchMedia: noMatchMedia ? undefined : () => ({ matches: systemDark }),
  };
  const context = {
    window,
    localStorage: { getItem() { if (storageThrows) throw new Error('blocked'); return stored; } },
    document: { documentElement: { classList: { add: c => classes.add(c) } } },
  };
  vm.runInNewContext(initSource, context);
  return classes.has('dark');
}

test('the early script sets the dark class exactly when resolveTheme() says dark', () => {
  for (const stored of [null, 'light', 'dark', 'garbage']) {
    for (const systemDark of [true, false]) {
      assert.equal(runInit({ stored, systemDark }), resolveTheme(stored, systemDark) === 'dark', `stored=${stored} systemDark=${systemDark}`);
    }
  }
});

test('the early script never throws: blocked storage or no matchMedia just stays light', () => {
  assert.equal(runInit({ stored: null, systemDark: true, storageThrows: true }), false);
  assert.equal(runInit({ stored: null, systemDark: true, noMatchMedia: true }), false);
  assert.equal(runInit({ stored: 'dark', systemDark: false, noMatchMedia: true }), true);
});
