const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test-secret';
const { encrypt, decrypt } = require('../src/lib/crypto');

test('encrypt/decrypt round-trips with the same salt', () => {
  const encrypted = encrypt('hunter2', 'salt-a');
  assert.equal(decrypt(encrypted, 'salt-a'), 'hunter2');
});

test('different salts derive different keys — cross-salt decryption fails', () => {
  const encrypted = encrypt('hunter2', 'salt-a');
  assert.throws(() => decrypt(encrypted, 'salt-b'));
});

test('encrypting the same text twice produces different ciphertext (random IV)', () => {
  const a = encrypt('hunter2', 'salt-a');
  const b = encrypt('hunter2', 'salt-a');
  assert.notEqual(a, b);
});
