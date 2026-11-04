const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../lib/respond');

// Recurrence in months: blank -> null (no recurrence), invalid -> false.
function parseInterval(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : false;
}

router.get('/clients/:clientId/equipment', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM equipment WHERE client_id = $1 ORDER BY name', [req.params.clientId]);
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/clients/:clientId/equipment', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { name, type, serial_number, installation_date, last_maintenance, next_maintenance, status, notes, maintenance_interval_months } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const interval = parseInterval(maintenance_interval_months);
  if (interval === false) return res.status(400).json({ error: 'Cycle de maintenance invalide (1 à 120 mois)' });
  try {
    const result = await db.query(
      'INSERT INTO equipment (client_id, name, type, serial_number, installation_date, last_maintenance, next_maintenance, status, notes, maintenance_interval_months) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [req.params.clientId, name, type, serial_number, installation_date || null, last_maintenance || null, next_maintenance || null, status || 'active', notes, interval]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.put('/clients/:clientId/equipment/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { name, type, serial_number, installation_date, last_maintenance, next_maintenance, status, notes, maintenance_interval_months } = req.body;
  const interval = parseInterval(maintenance_interval_months);
  if (interval === false) return res.status(400).json({ error: 'Cycle de maintenance invalide (1 à 120 mois)' });
  // A client that doesn't send the field (older UI, scripts) must not wipe the cycle.
  const keepInterval = maintenance_interval_months === undefined;
  try {
    const result = await db.query(
      'UPDATE equipment SET name=$1, type=$2, serial_number=$3, installation_date=$4, last_maintenance=$5, next_maintenance=$6, status=$7, notes=$8, maintenance_interval_months=CASE WHEN $12 THEN maintenance_interval_months ELSE $9::int END, updated_at=NOW() WHERE id=$10 AND client_id=$11 RETURNING *',
      [name, type, serial_number, installation_date || null, last_maintenance || null, next_maintenance || null, status, notes, interval, req.params.id, req.params.clientId, keepInterval]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Équipement non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/clients/:clientId/equipment/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM equipment WHERE id=$1 AND client_id=$2', [req.params.id, req.params.clientId]);
    res.json({ message: 'Équipement supprimé' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
