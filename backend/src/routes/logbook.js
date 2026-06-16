const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

router.get('/clients/:clientId/logbook', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT l.*, u.name as user_name FROM logbook l LEFT JOIN users u ON u.id = l.user_id WHERE l.client_id = $1 ORDER BY l.entry_date DESC',
      [req.params.clientId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients/:clientId/logbook', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { title, content, type, entry_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre requis' });
  try {
    const result = await db.query(
      'INSERT INTO logbook (client_id, user_id, title, content, type, entry_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.clientId, req.user.id, title, content, type || 'note', entry_date || new Date()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/clients/:clientId/logbook/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { title, content, type, entry_date } = req.body;
  try {
    const result = await db.query(
      'UPDATE logbook SET title=$1, content=$2, type=$3, entry_date=$4, updated_at=NOW() WHERE id=$5 AND client_id=$6 RETURNING *',
      [title, content, type, entry_date, req.params.id, req.params.clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Entrée non trouvée' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/clients/:clientId/logbook/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM logbook WHERE id=$1 AND client_id=$2', [req.params.id, req.params.clientId]);
    res.json({ message: 'Entrée supprimée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
