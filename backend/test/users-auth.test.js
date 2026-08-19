const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret';
const { app } = require('../src/app');

// Minimal in-memory stand-in for the pg Pool, covering just the queries
// register/login actually issue.
function createFakeDb() {
  const users = [];
  let nextId = 1;
  return {
    users,
    async query(text, params = []) {
      if (text.includes('SELECT COUNT(*)::int AS count FROM users')) {
        return { rows: [{ count: users.length }] };
      }
      if (text.startsWith('INSERT INTO users (email, password_hash, name, role, provider)')) {
        const [email, password_hash, name, role] = params;
        if (users.some(u => u.email === email)) {
          const err = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          throw err;
        }
        const user = { id: nextId++, email, password_hash, name, role, provider: 'local', provider_id: null };
        users.push(user);
        return { rows: [{ id: user.id, email: user.email, name: user.name, role: user.role }] };
      }
      if (text.includes('SELECT * FROM users WHERE email = $1')) {
        const user = users.find(u => u.email === params[0]);
        return { rows: user ? [user] : [] };
      }
      throw new Error(`Unhandled query in fake db: ${text}`);
    },
  };
}

test('first registered user becomes admin, second becomes a regular user', async () => {
  app.locals.db = createFakeDb();

  const first = await request(app).post('/api/users/register')
    .send({ email: 'alice@example.com', password: 'password123', name: 'Alice' });
  assert.equal(first.status, 201);
  assert.equal(first.body.user.role, 'admin');
  assert.ok(first.body.token);

  const second = await request(app).post('/api/users/register')
    .send({ email: 'bob@example.com', password: 'password123', name: 'Bob' });
  assert.equal(second.status, 201);
  assert.equal(second.body.user.role, 'user');
});

test('register rejects a password shorter than 8 characters', async () => {
  app.locals.db = createFakeDb();
  const res = await request(app).post('/api/users/register')
    .send({ email: 'alice@example.com', password: 'short', name: 'Alice' });
  assert.equal(res.status, 400);
});

test('register rejects a malformed email', async () => {
  app.locals.db = createFakeDb();
  const res = await request(app).post('/api/users/register')
    .send({ email: 'not-an-email', password: 'password123', name: 'Alice' });
  assert.equal(res.status, 400);
});

test('register rejects a duplicate email with 409', async () => {
  const db = createFakeDb();
  app.locals.db = db;
  await request(app).post('/api/users/register')
    .send({ email: 'alice@example.com', password: 'password123', name: 'Alice' });
  const res = await request(app).post('/api/users/register')
    .send({ email: 'alice@example.com', password: 'password123', name: 'Alice again' });
  assert.equal(res.status, 409);
});

test('login succeeds with the right password and fails with the wrong one', async () => {
  app.locals.db = createFakeDb();
  await request(app).post('/api/users/register')
    .send({ email: 'alice@example.com', password: 'password123', name: 'Alice' });

  const ok = await request(app).post('/api/users/login')
    .send({ email: 'alice@example.com', password: 'password123' });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);

  const bad = await request(app).post('/api/users/login')
    .send({ email: 'alice@example.com', password: 'wrong-password' });
  assert.equal(bad.status, 401);
});

test('login rejects an unknown email without leaking which part was wrong', async () => {
  app.locals.db = createFakeDb();
  const res = await request(app).post('/api/users/login')
    .send({ email: 'nobody@example.com', password: 'password123' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Identifiants invalides');
});
