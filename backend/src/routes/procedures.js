const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../lib/respond');

router.get('/procedures', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT p.*, c.name as client_name FROM procedures p LEFT JOIN clients c ON c.id = p.client_id ORDER BY p.created_at DESC');
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/clients/:clientId/procedures', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM procedures WHERE client_id = $1 ORDER BY title', [req.params.clientId]);
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/clients/:clientId/procedures', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { title, type, content } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  try {
    const result = await db.query(
      'INSERT INTO procedures (client_id, title, type, content) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.clientId, title, type || 'onsite', content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.put('/clients/:clientId/procedures/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { title, type, content } = req.body;
  try {
    const result = await db.query(
      'UPDATE procedures SET title=$1, type=$2, content=$3, updated_at=NOW() WHERE id=$4 AND client_id=$5 RETURNING *',
      [title, type, content, req.params.id, req.params.clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Procédure non trouvée' });
    res.json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/clients/:clientId/procedures/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM procedures WHERE id=$1 AND client_id=$2', [req.params.id, req.params.clientId]);
    res.json({ message: 'Procédure supprimée' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
