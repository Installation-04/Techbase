const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { serverError } = require('../lib/respond');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SELECT_DAY = `
  SELECT wo.id, wo.client_id, wo.title, wo.description, wo.status, wo.priority,
         to_char(wo.due_date, 'YYYY-MM-DD') AS due_date, wo.completed_at,
         c.name AS client_name, c.address AS client_address, c.phone AS client_phone,
         e.name AS equipment_name
  FROM work_orders wo
  JOIN clients c ON c.id = wo.client_id
  LEFT JOIN equipment e ON e.id = wo.equipment_id
`;

// GET /api/work-orders/my-day[?date=YYYY-MM-DD]
// The caller's own work orders for the day: in progress, due today, overdue, and
// those finished today. `date` is the technician's local date (the server may be
// in another time zone); it defaults to the server's current date.
router.get('/work-orders/my-day', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { date } = req.query;
  if (date !== undefined && (typeof date !== 'string' || !DATE_RE.test(date) || Number.isNaN(Date.parse(date)))) {
    return res.status(400).json({ error: 'Date invalide (AAAA-MM-JJ attendu)' });
  }
  try {
    const day = date || (await db.query("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d")).rows[0].d;
    const result = await db.query(
      `${SELECT_DAY}
       WHERE wo.assigned_to = $1
         AND (
           (wo.status IN ('open', 'assigned', 'in_progress') AND (wo.status = 'in_progress' OR wo.due_date <= $2::date))
           OR (wo.status = 'done' AND wo.completed_at >= $2::date AND wo.completed_at < $2::date + 1)
         )
       ORDER BY (wo.status = 'done'),
                (wo.status <> 'in_progress'),
                wo.due_date NULLS LAST,
                CASE wo.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                wo.id`,
      [req.user.id, day]
    );
    res.json({
      date: day,
      workOrders: result.rows.map(r => ({ ...r, overdue: r.status !== 'done' && !!r.due_date && r.due_date < day })),
    });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/work-orders/:id/status — one-tap transition for the assignee (or an admin).
// Unlike PUT /work-orders/:id it touches nothing but the status, so a phone never
// overwrites the other fields with stale values.
router.post('/work-orders/:id/status', authenticate, validate({
  status: { required: true, type: 'string', enum: ['in_progress', 'done'] },
}), async (req, res) => {
  const db = req.app.locals.db;
  const { status } = req.body;
  try {
    const found = await db.query('SELECT assigned_to, status FROM work_orders WHERE id = $1', [req.params.id]);
    if (found.rows.length === 0) return res.status(404).json({ error: 'Bon de service non trouvé' });
    const wo = found.rows[0];
    if (req.user.role !== 'admin' && Number(wo.assigned_to) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Ce bon de service ne vous est pas assigné' });
    }
    if (wo.status === 'cancelled') return res.status(409).json({ error: 'Bon de service annulé' });
    const result = await db.query(
      `UPDATE work_orders SET status = $1, updated_at = NOW(),
         completed_at = ${status === 'done' ? 'COALESCE(completed_at, NOW())' : 'NULL'}
       WHERE id = $2 RETURNING id, status, completed_at`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
