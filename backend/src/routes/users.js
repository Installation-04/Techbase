const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { issueToken } = require('../lib/token');
const { serverError } = require('../lib/respond');
const { validate } = require('../middleware/validate');
const { audit } = require('../lib/audit');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// bcrypt hash of a random throwaway string (cost 10, same as real hashes).
// Login compares against it when the account doesn't exist or has no local
// password, so those cases take as long as a wrong password and can't be
// told apart by response time.
const DUMMY_HASH = '$2b$10$F6fZeYPi/n2cxyF9cKWFr.1FcpToYrYAmYgUdGgpTLndCTwbi7rXq';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez plus tard' },
});

// POST /api/users/register
// Open self-registration. The very first account created (local or SSO)
// becomes admin; everyone after that gets the default 'user' role.
router.post('/register', loginLimiter, validate({
  email: { required: true, type: 'string', maxLength: 255, pattern: EMAIL_PATTERN },
  password: { required: true, type: 'string', minLength: 8, maxLength: 255 },
  name: { required: true, type: 'string', maxLength: 255 },
}), async (req, res) => {
  const db = req.app.locals.db;
  const { email, password, name } = req.body;
  try {
    const countResult = await db.query('SELECT COUNT(*)::int AS count FROM users');
    const role = countResult.rows[0].count === 0 ? 'admin' : 'user';
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      "INSERT INTO users (email, password_hash, name, role, provider) VALUES ($1, $2, $3, $4, 'local') RETURNING id, email, name, role",
      [email, hash, name, role]
    );
    const user = result.rows[0];
    await audit(req, 'user.registered', { role: user.role, email: user.email }, { user, target: ['user', user.id] });
    res.status(201).json({ token: issueToken(user), user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé' });
    serverError(res, err);
  }
});

// POST /api/users/login
router.post('/login', loginLimiter, validate({
  email: { required: true, type: 'string' },
  password: { required: true, type: 'string' },
}), async (req, res) => {
  const db = req.app.locals.db;
  const { email, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    // Same work and same message whether the email is unknown, the account is
    // SSO-only, or the password is wrong — nothing here confirms an account exists.
    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !user.password_hash || !valid) {
      await audit(req, 'login.failure', { reason: !user ? 'unknown_account' : !user.password_hash ? 'no_local_password' : 'bad_password' }, { user: { id: user?.id ?? null, email: email.slice(0, 255) } });
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    await audit(req, 'login.success', { method: 'password' }, { user });
    res.json({ token: issueToken(user), user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    serverError(res, err);
  }
});

// GET /api/users/me
router.get('/me', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT id, email, name, role, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

// GET /api/users/assignable — minimal user list any authenticated user can
// read, for populating work-order assignment dropdowns (no email/dates).
router.get('/assignable', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT id, name, role FROM users ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

// GET /api/users (admin)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/users (admin)
router.post('/', authenticate, requireAdmin, validate({
  email: { required: true, type: 'string', maxLength: 255, pattern: EMAIL_PATTERN },
  password: { required: true, type: 'string', minLength: 8, maxLength: 255 },
  name: { required: true, type: 'string', maxLength: 255 },
  role: { type: 'string', enum: ['admin', 'user'] },
}), async (req, res) => {
  const db = req.app.locals.db;
  const { email, password, name, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at',
      [email, hash, name, role || 'user']
    );
    await audit(req, 'user.created', { email, role: result.rows[0].role }, { target: ['user', result.rows[0].id] });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé' });
    serverError(res, err);
  }
});

// PUT /api/users/:id (admin)
router.put('/:id', authenticate, requireAdmin, validate({
  email: { required: true, type: 'string', maxLength: 255, pattern: EMAIL_PATTERN },
  password: { type: 'string', minLength: 8, maxLength: 255 },
  name: { required: true, type: 'string', maxLength: 255 },
  role: { required: true, type: 'string', enum: ['admin', 'user'] },
}), async (req, res) => {
  const db = req.app.locals.db;
  const { email, password, name, role } = req.body;
  try {
    const before = (await db.query('SELECT email, role FROM users WHERE id = $1', [req.params.id])).rows[0];
    let query, params;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET email=$1, password_hash=$2, name=$3, role=$4 WHERE id=$5 RETURNING id, email, name, role, created_at';
      params = [email, hash, name, role, req.params.id];
    } else {
      query = 'UPDATE users SET email=$1, name=$2, role=$3 WHERE id=$4 RETURNING id, email, name, role, created_at';
      params = [email, name, role, req.params.id];
    }
    const result = await db.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const target = ['user', req.params.id];
    if (before && before.role !== role) await audit(req, 'user.role_changed', { email, from: before.role, to: role }, { target });
    if (password) await audit(req, 'user.password_changed', { email }, { target });
    if (before && before.email !== email) await audit(req, 'user.email_changed', { from: before.email, to: email }, { target });
    res.json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

// DELETE /api/users/:id (admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }
  const db = req.app.locals.db;
  try {
    const gone = await db.query('DELETE FROM users WHERE id = $1 RETURNING email, role', [req.params.id]);
    if (gone.rows[0]) await audit(req, 'user.deleted', { email: gone.rows[0].email, role: gone.rows[0].role }, { target: ['user', req.params.id] });
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
