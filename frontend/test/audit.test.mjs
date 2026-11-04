import test from 'node:test';
import assert from 'node:assert/strict';
import { actionLabel, actionTone, auditQuery, formatDetail, ACTION_GROUPS, ACTION_LABELS } from '../src/lib/audit.mjs';

test('actions have French labels, unknown ones are shown as-is', () => {
  assert.equal(actionLabel('vault.reveal'), 'Mot de passe affiché');
  assert.equal(actionLabel('something.new'), 'something.new');
});

test('failures and deletions are red, secret access is amber, the rest neutral', () => {
  assert.equal(actionTone('login.failure'), 'red');
  assert.equal(actionTone('user.deleted'), 'red');
  assert.equal(actionTone('vault.reveal'), 'amber');
  assert.equal(actionTone('vault.copy'), 'amber');
  assert.equal(actionTone('login.success'), 'gray');
});

test('auditQuery keeps only filled filters and encodes them', () => {
  assert.equal(auditQuery({ user: '', action: 'vault.', q: 'a&b', from: '' }, { page: 2 }), 'action=vault.&q=a%26b&page=2');
  assert.equal(auditQuery({}), '');
});

test('formatDetail renders key: value pairs and skips empties', () => {
  assert.equal(formatDetail({ label: 'Router', client_id: 3, x: null, y: '' }), 'label: Router · client_id: 3');
  assert.equal(formatDetail({ filters: { a: 1 } }), 'filters: {"a":1}');
  assert.equal(formatDetail(null), '');
});

test('every action group prefix ends with a dot (server prefix match)', () => {
  assert.ok(ACTION_GROUPS.every(g => g.value === '' || g.value.endsWith('.')));
  assert.ok(Object.keys(ACTION_LABELS).length > 10);
});
