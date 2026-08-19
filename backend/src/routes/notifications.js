const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../lib/respond');

// GET /api/notifications — most recent 50 for the current user
router.get('/notifications', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

// GET /api/notifications/unread-count
router.get('/notifications/unread-count', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read = FALSE',
      [req.user.id]
    );
    res.json({ count: result.rows[0].count });
  } catch (err) {
    serverError(res, err);
  }
});

// PUT /api/notifications/read-all
router.put('/notifications/read-all', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE', [req.user.id]);
    res.json({ message: 'Notifications marquées comme lues' });
  } catch (err) {
    serverError(res, err);
  }
});

// PUT /api/notifications/:id/read
router.put('/notifications/:id/read', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification non trouvée' });
    res.json({ message: 'Notification marquée comme lue' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
