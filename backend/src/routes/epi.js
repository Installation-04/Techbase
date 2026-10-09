const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../lib/respond');

// A quantity of 0 is meaningful (out of stock) and must survive a round trip:
// `quantity || 1` used to turn it into 1, so editing any field of a zero-stock
// item silently restocked it. Returns undefined when the field is absent/blank
// (callers pick the default), null when it's present but not a whole number >= 0.
function parseQuantity(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

router.get('/clients/:clientId/epi', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM epi WHERE client_id = $1 ORDER BY name', [req.params.clientId]);
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/clients/:clientId/epi', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { name, type, quantity, expiry_date, location, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const qty = parseQuantity(quantity);
  if (qty === null) return res.status(400).json({ error: 'Quantité invalide (entier supérieur ou égal à 0)' });
  try {
    const result = await db.query(
      'INSERT INTO epi (client_id, name, type, quantity, expiry_date, location, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.params.clientId, name, type, qty ?? 1, expiry_date || null, location, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.put('/clients/:clientId/epi/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { name, type, quantity, expiry_date, location, notes } = req.body;
  const qty = parseQuantity(quantity);
  if (qty === null) return res.status(400).json({ error: 'Quantité invalide (entier supérieur ou égal à 0)' });
  try {
    // An absent/blank quantity keeps the stored value rather than resetting it.
    const result = await db.query(
      'UPDATE epi SET name=$1, type=$2, quantity=COALESCE($3, quantity), expiry_date=$4, location=$5, notes=$6, updated_at=NOW() WHERE id=$7 AND client_id=$8 RETURNING *',
      [name, type, qty ?? null, expiry_date || null, location, notes, req.params.id, req.params.clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'EPI non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/clients/:clientId/epi/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM epi WHERE id=$1 AND client_id=$2', [req.params.id, req.params.clientId]);
    res.json({ message: 'EPI supprimé' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
