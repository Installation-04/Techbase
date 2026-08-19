const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../lib/respond');

router.get('/clients/:clientId/contacts', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM contacts WHERE client_id = $1 ORDER BY name', [req.params.clientId]);
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/clients/:clientId/contacts', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { name, role, phone, email, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  try {
    const result = await db.query(
      'INSERT INTO contacts (client_id, name, role, phone, email, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.clientId, name, role, phone, email, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.put('/clients/:clientId/contacts/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { name, role, phone, email, notes } = req.body;
  try {
    const result = await db.query(
      'UPDATE contacts SET name=$1, role=$2, phone=$3, email=$4, notes=$5, updated_at=NOW() WHERE id=$6 AND client_id=$7 RETURNING *',
      [name, role, phone, email, notes, req.params.id, req.params.clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/clients/:clientId/contacts/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM contacts WHERE id=$1 AND client_id=$2', [req.params.id, req.params.clientId]);
    res.json({ message: 'Contact supprimé' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
