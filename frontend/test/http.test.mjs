import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldForceLogout } from '../src/lib/http.mjs';

const err = (status, url) => ({ response: status ? { status } : undefined, config: url === undefined ? undefined : { url } });

test('a 401 from a failed login or registration does not log out / reload', () => {
  assert.equal(shouldForceLogout(err(401, '/api/users/login')), false);
  assert.equal(shouldForceLogout(err(401, '/api/users/register')), false);
});

test('a 401 from the SSO callback profile fetch does not log out / reload either', () => {
  assert.equal(shouldForceLogout(err(401, '/api/users/me')), false);
});

test('the check ignores a query string and an absolute URL', () => {
  assert.equal(shouldForceLogout(err(401, '/api/users/login?x=1')), false);
  assert.equal(shouldForceLogout(err(401, 'https://api.example.com/api/users/login')), false);
});

test('a 401 from any other endpoint means the session expired: force logout', () => {
  assert.equal(shouldForceLogout(err(401, '/api/clients')), true);
  assert.equal(shouldForceLogout(err(401, '/api/dashboard/summary')), true);
  assert.equal(shouldForceLogout(err(401, '/api/users/assignable')), true);
  assert.equal(shouldForceLogout(err(401, undefined)), true);
});

test('a lookalike path is not treated as an auth attempt', () => {
  assert.equal(shouldForceLogout(err(401, '/api/users/memory')), true);
  assert.equal(shouldForceLogout(err(401, '/api/users/login-history')), true);
});

test('non-401 errors never force a logout', () => {
  assert.equal(shouldForceLogout(err(500, '/api/clients')), false);
  assert.equal(shouldForceLogout(err(403, '/api/users')), false);
  assert.equal(shouldForceLogout(err(null, '/api/clients')), false); // network error: no response
  assert.equal(shouldForceLogout(undefined), false);
});
