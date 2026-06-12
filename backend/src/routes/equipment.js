const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

router.get('/clients/:clientId/equipment', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM equipment WHERE client_id = $1 ORDER BY name', [req.params.clientId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients/:clientId/equipment', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { name, type, serial_number, installation_date, last_maintenance, next_maintenance, status, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  try {
    const result = await db.query(
      'INSERT INTO equipment (client_id, name, type, serial_number, installation_date, last_maintenance, next_maintenance, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [req.params.clientId, name, type, serial_number, installation_date || null, last_maintenance || null, next_maintenance || null, status || 'active', notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/clients/:clientId/equipment/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { name, type, serial_number, installation_date, last_maintenance, next_maintenance, status, notes } = req.body;
  try {
    const result = await db.query(
      'UPDATE equipment SET name=$1, type=$2, serial_number=$3, installation_date=$4, last_maintenance=$5, next_maintenance=$6, status=$7, notes=$8, updated_at=NOW() WHERE id=$9 AND client_id=$10 RETURNING *',
      [name, type, serial_number, installation_date || null, last_maintenance || null, next_maintenance || null, status, notes, req.params.id, req.params.clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Équipement non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/clients/:clientId/equipment/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM equipment WHERE id=$1 AND client_id=$2', [req.params.id, req.params.clientId]);
    res.json({ message: 'Équipement supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
