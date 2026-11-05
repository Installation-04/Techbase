const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { serverError } = require('../lib/respond');
const { audit } = require('../lib/audit');
const { encrypt: encryptWithSalt, decrypt: decryptWithSalt } = require('../lib/crypto');

const SALT = 'techbase_salt';
const encrypt = (text) => encryptWithSalt(text, SALT);
const decrypt = (text) => decryptWithSalt(text, SALT);

// Entry as sent to the browser: neither the secret nor its ciphertext.
const publicEntry = ({ encrypted_password, ...row }) => ({ ...row, has_password: !!encrypted_password });

router.get('/clients/:clientId/passwords', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM passwords WHERE client_id = $1 ORDER BY label', [req.params.clientId]);
    // Secrets are NOT in the list: they only leave the server through POST .../reveal, which is audited.
    res.json(result.rows.map(publicEntry));
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/clients/:clientId/passwords', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { label, username, password, url, notes } = req.body;
  if (!label || !password) return res.status(400).json({ error: 'Label et mot de passe requis' });
  try {
    const encrypted = encrypt(password);
    const result = await db.query(
      'INSERT INTO passwords (client_id, label, username, encrypted_password, url, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.clientId, label, username, encrypted, url, notes]
    );
    const row = result.rows[0];
    await audit(req, 'vault.created', { client_id: row.client_id, label: row.label }, { target: ['password', row.id] });
    res.status(201).json(publicEntry(row));
  } catch (err) {
    serverError(res, err);
  }
});

// The only way to read a secret: the interface calls this when a person unmasks ("reveal") or
// copies an entry. The access is recorded (who, which entry, when; id and label only, never the
// secret) before the secret is returned.
router.post('/clients/:clientId/passwords/:id/reveal', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const how = req.body?.action === 'copy' ? 'copy' : 'reveal';
  try {
    const result = await db.query('SELECT id, client_id, label, encrypted_password FROM passwords WHERE id = $1 AND client_id = $2', [req.params.id, req.params.clientId]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Mot de passe non trouvé' });
    await audit(req, `vault.${how}`, { client_id: row.client_id, label: row.label }, { target: ['password', row.id] });
    res.set('Cache-Control', 'no-store');
    res.json({ logged: true, password: decrypt(row.encrypted_password) });
  } catch (err) {
    serverError(res, err);
  }
});

// Who revealed/copied/changed this entry (admins only).
router.get('/clients/:clientId/passwords/:id/audit', authenticate, requireAdmin, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      `SELECT a.id, a.created_at, a.user_id, a.user_email, a.action, a.ip
         FROM audit_log a
        WHERE a.target_type = 'password' AND a.target_id = $1
          AND COALESCE((a.detail->>'client_id')::text, '') = $2
        ORDER BY a.created_at DESC, a.id DESC LIMIT 100`,
      [String(req.params.id), String(req.params.clientId)]
    );
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.put('/clients/:clientId/passwords/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { label, username, password, url, notes } = req.body;
  if (!label) return res.status(400).json({ error: 'Label requis' });
  try {
    let result;
    if (password) {
      const encrypted = encrypt(password);
      result = await db.query(
        'UPDATE passwords SET label=$1, username=$2, encrypted_password=$3, url=$4, notes=$5, updated_at=NOW() WHERE id=$6 AND client_id=$7 RETURNING *',
        [label, username, encrypted, url, notes, req.params.id, req.params.clientId]
      );
    } else {
      result = await db.query(
        'UPDATE passwords SET label=$1, username=$2, url=$3, notes=$4, updated_at=NOW() WHERE id=$5 AND client_id=$6 RETURNING *',
        [label, username, url, notes, req.params.id, req.params.clientId]
      );
    }
    if (result.rows.length === 0) return res.status(404).json({ error: 'Mot de passe non trouvé' });
    const row = result.rows[0];
    await audit(req, 'vault.updated', { client_id: row.client_id, label: row.label, secret_changed: !!password }, { target: ['password', row.id] });
    res.json(publicEntry(row));
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/clients/:clientId/passwords/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const gone = await db.query('DELETE FROM passwords WHERE id=$1 AND client_id=$2 RETURNING label', [req.params.id, req.params.clientId]);
    if (gone.rows[0]) await audit(req, 'vault.deleted', { client_id: Number(req.params.clientId), label: gone.rows[0].label }, { target: ['password', req.params.id] });
    res.json({ message: 'Mot de passe supprimé' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
