const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/clients', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM clients ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/clients/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { name, contract_number, manager, address, phone, email, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  try {
    const result = await db.query(
      'INSERT INTO clients (name, contract_number, manager, address, phone, email, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, contract_number, manager, address, phone, email, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/clients/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { name, contract_number, manager, address, phone, email, notes } = req.body;
  try {
    const result = await db.query(
      'UPDATE clients SET name=$1, contract_number=$2, manager=$3, address=$4, phone=$5, email=$6, notes=$7, updated_at=NOW() WHERE id=$8 RETURNING *',
      [name, contract_number, manager, address, phone, email, notes, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/clients/:id', authenticate, requireAdmin, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ message: 'Client supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
