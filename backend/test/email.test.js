const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml } = require('../src/lib/email');

test('escapeHtml neutralises markup characters', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('1')"> & more`),
    '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt; &amp; more'
  );
});

test('escapeHtml leaves plain text (including accents) untouched', () => {
  assert.equal(escapeHtml('Maintenance préventive — Chaudière #2'), 'Maintenance préventive — Chaudière #2');
});

test('escapeHtml tolerates null, undefined and numbers', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});
