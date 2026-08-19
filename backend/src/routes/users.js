const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { issueToken } = require('../lib/token');
const { serverError } = require('../lib/respond');
const { validate } = require('../middleware/validate');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants invalides' });
    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: `Ce compte utilise la connexion ${user.provider === 'google' ? 'Google' : 'Microsoft'}, pas de mot de passe` });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants invalides' });
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
    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
