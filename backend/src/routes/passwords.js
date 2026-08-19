const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../lib/respond');
const { encrypt: encryptWithSalt, decrypt: decryptWithSalt } = require('../lib/crypto');

const SALT = 'techbase_salt';
const encrypt = (text) => encryptWithSalt(text, SALT);
const decrypt = (text) => decryptWithSalt(text, SALT);

router.get('/clients/:clientId/passwords', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM passwords WHERE client_id = $1 ORDER BY label', [req.params.clientId]);
    const rows = result.rows.map(row => ({
      ...row,
      password: decrypt(row.encrypted_password)
    }));
    res.json(rows);
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
    res.status(201).json({ ...row, password: decrypt(row.encrypted_password) });
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
    res.json({ ...row, password: decrypt(row.encrypted_password) });
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/clients/:clientId/passwords/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM passwords WHERE id=$1 AND client_id=$2', [req.params.id, req.params.clientId]);
    res.json({ message: 'Mot de passe supprimé' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
