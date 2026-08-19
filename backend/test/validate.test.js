const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/middleware/validate');

function runMiddleware(schema, body) {
  const req = { body };
  let statusCode, jsonBody, nextCalled = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; return this; },
  };
  validate(schema)(req, res, () => { nextCalled = true; });
  return { statusCode, jsonBody, nextCalled };
}

test('passes a valid body through to next()', () => {
  const result = runMiddleware({ name: { required: true, type: 'string' } }, { name: 'Alice' });
  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, undefined);
});

test('rejects a missing required field', () => {
  const result = runMiddleware({ name: { required: true, type: 'string' } }, {});
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 400);
});

test('accepts numeric strings for type:number (HTML forms always send strings)', () => {
  const result = runMiddleware({ age: { type: 'number' } }, { age: '42' });
  assert.equal(result.nextCalled, true);
});

test('rejects a non-numeric string for type:number', () => {
  const result = runMiddleware({ age: { type: 'number' } }, { age: 'not-a-number' });
  assert.equal(result.statusCode, 400);
});

test('enforces enum membership', () => {
  const result = runMiddleware({ status: { enum: ['open', 'done'] } }, { status: 'bogus' });
  assert.equal(result.statusCode, 400);
});

test('enforces minLength/maxLength on strings', () => {
  const tooShort = runMiddleware({ password: { type: 'string', minLength: 8 } }, { password: 'short' });
  assert.equal(tooShort.statusCode, 400);

  const longEnough = runMiddleware({ password: { type: 'string', minLength: 8 } }, { password: 'longenough' });
  assert.equal(longEnough.nextCalled, true);
});

test('enforces a regex pattern', () => {
  const bad = runMiddleware({ email: { type: 'string', pattern: /^[^@]+@[^@]+$/ } }, { email: 'not-an-email' });
  assert.equal(bad.statusCode, 400);

  const good = runMiddleware({ email: { type: 'string', pattern: /^[^@]+@[^@]+$/ } }, { email: 'a@b.com' });
  assert.equal(good.nextCalled, true);
});

test('optional fields are skipped when absent', () => {
  const result = runMiddleware({ nickname: { type: 'string', maxLength: 5 } }, {});
  assert.equal(result.nextCalled, true);
});
