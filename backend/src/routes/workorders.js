const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { serverError } = require('../lib/respond');

const STATUSES = ['open', 'assigned', 'in_progress', 'done', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const SELECT_WORK_ORDER = `
  SELECT wo.*, c.name AS client_name, e.name AS equipment_name, u.name AS assigned_to_name
  FROM work_orders wo
  JOIN clients c ON c.id = wo.client_id
  LEFT JOIN equipment e ON e.id = wo.equipment_id
  LEFT JOIN users u ON u.id = wo.assigned_to
`;

// GET /api/work-orders — global list, optionally filtered
router.get('/work-orders', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { status, assigned_to, client_id } = req.query;
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`wo.status = $${params.length}`);
  }
  if (assigned_to) {
    params.push(assigned_to);
    conditions.push(`wo.assigned_to = $${params.length}`);
  }
  if (client_id) {
    params.push(client_id);
    conditions.push(`wo.client_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const result = await db.query(
      `${SELECT_WORK_ORDER} ${where} ORDER BY wo.due_date NULLS LAST, wo.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

// GET /api/clients/:clientId/work-orders
router.get('/clients/:clientId/work-orders', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      `${SELECT_WORK_ORDER} WHERE wo.client_id = $1 ORDER BY wo.due_date NULLS LAST, wo.created_at DESC`,
      [req.params.clientId]
    );
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/clients/:clientId/work-orders
router.post('/clients/:clientId/work-orders', authenticate, validate({
  title: { required: true, type: 'string', maxLength: 255 },
  description: { type: 'string', maxLength: 5000 },
  priority: { type: 'string', enum: PRIORITIES },
  equipment_id: { type: 'number' },
  assigned_to: { type: 'number' },
  due_date: { type: 'string' },
}), async (req, res) => {
  const db = req.app.locals.db;
  const { title, description, priority, equipment_id, assigned_to, due_date } = req.body;
  const status = assigned_to ? 'assigned' : 'open';
  try {
    const result = await db.query(
      `INSERT INTO work_orders (client_id, equipment_id, title, description, priority, status, assigned_to, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.params.clientId, equipment_id || null, title, description || null, priority || 'medium', status, assigned_to || null, due_date || null, req.user.id]
    );
    const full = await db.query(`${SELECT_WORK_ORDER} WHERE wo.id = $1`, [result.rows[0].id]);
    res.status(201).json(full.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

// PUT /api/work-orders/:id — update fields and/or transition status
router.put('/work-orders/:id', authenticate, validate({
  title: { required: true, type: 'string', maxLength: 255 },
  description: { type: 'string', maxLength: 5000 },
  status: { type: 'string', enum: STATUSES },
  priority: { type: 'string', enum: PRIORITIES },
  equipment_id: { type: 'number' },
  assigned_to: { type: 'number' },
  due_date: { type: 'string' },
}), async (req, res) => {
  const db = req.app.locals.db;
  const { title, description, status, priority, equipment_id, assigned_to, due_date } = req.body;
  const completedAt = status === 'done' ? 'NOW()' : 'NULL';
  try {
    const result = await db.query(
      `UPDATE work_orders SET
         title=$1, description=$2, status=$3, priority=$4,
         equipment_id=$5, assigned_to=$6, due_date=$7,
         updated_at=NOW(), completed_at=${completedAt}
       WHERE id=$8 RETURNING id`,
      [title, description || null, status || 'open', priority || 'medium', equipment_id || null, assigned_to || null, due_date || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Bon de service non trouvé' });
    const full = await db.query(`${SELECT_WORK_ORDER} WHERE wo.id = $1`, [req.params.id]);
    res.json(full.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

// DELETE /api/work-orders/:id
router.delete('/work-orders/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    await db.query('DELETE FROM work_orders WHERE id=$1', [req.params.id]);
    res.json({ message: 'Bon de service supprimé' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
