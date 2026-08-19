const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';
const { issueToken } = require('../src/lib/token');

test('issueToken produces a verifiable JWT with the right payload', () => {
  const token = issueToken({ id: 1, email: 'a@example.com', name: 'Alice', role: 'admin' });
  const decoded = jwt.verify(token, 'test-secret');
  assert.equal(decoded.id, 1);
  assert.equal(decoded.email, 'a@example.com');
  assert.equal(decoded.name, 'Alice');
  assert.equal(decoded.role, 'admin');
});

test('issueToken rejects verification with the wrong secret', () => {
  const token = issueToken({ id: 1, email: 'a@example.com', name: 'Alice', role: 'admin' });
  assert.throws(() => jwt.verify(token, 'wrong-secret'));
});
