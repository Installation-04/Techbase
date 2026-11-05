import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, formatDuration, signatureDataUrlBytes } from '../src/lib/serviceReport.mjs';

test('parseDuration understands common French/technician spellings', () => {
  assert.equal(parseDuration('1h30'), 90);
  assert.equal(parseDuration('1 h 30'), 90);
  assert.equal(parseDuration('2h'), 120);
  assert.equal(parseDuration('1,5h'), 90);
  assert.equal(parseDuration('1:05'), 65);
  assert.equal(parseDuration('45'), 45);
  assert.equal(parseDuration('45 min'), 45);
});

test('parseDuration returns null for empty or unusable input', () => {
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration(null), null);
  assert.equal(parseDuration('beaucoup'), null);
  assert.equal(parseDuration('-5'), null);
});

test('formatDuration', () => {
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatDuration(90), '1 h 30');
  assert.equal(formatDuration(null), '');
  assert.equal(formatDuration(-1), '');
});

test('signatureDataUrlBytes estimates the decoded size', () => {
  assert.equal(signatureDataUrlBytes('data:image/png;base64,QUJD'), 3);
  assert.equal(signatureDataUrlBytes('data:image/png;base64,QUI='), 2);
  assert.equal(signatureDataUrlBytes(''), 0);
});
