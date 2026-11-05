const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { serverError } = require('../lib/respond');
const { rollMaintenanceForward } = require('../lib/reminders');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// "2026-02-31" matches the regexp and Date.parse accepts it (rolls over to March),
// but PostgreSQL rejects it: only a date that round-trips is a real calendar day.
const isCalendarDate = (s) => {
  if (!DATE_RE.test(s)) return false;
  const t = Date.parse(s);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

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
// in another time zone); it defaults to the server's current date. `tz` (IANA name,
// e.g. Europe/Paris) says which clock "finished today" is read on: completed_at is a
// server-clock timestamp, so a Québec evening would otherwise land on tomorrow.
router.get('/work-orders/my-day', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const { date, tz } = req.query;
  if (date !== undefined && (typeof date !== 'string' || !isCalendarDate(date))) {
    return res.status(400).json({ error: 'Date invalide (AAAA-MM-JJ attendu)' });
  }
  try {
    let zone = (await db.query("SELECT current_setting('TimeZone') AS z")).rows[0].z;
    if (tz !== undefined) {
      const known = typeof tz === 'string' && tz.length <= 64
        && (await db.query('SELECT 1 FROM pg_timezone_names WHERE name = $1', [tz])).rows.length > 0;
      if (!known) return res.status(400).json({ error: 'Fuseau horaire invalide' });
      zone = tz;
    }
    const day = date
      || (await db.query("SELECT to_char((NOW() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d", [zone])).rows[0].d;
    const result = await db.query(
      `${SELECT_DAY}
       WHERE wo.assigned_to = $1
         AND (
           (wo.status IN ('open', 'assigned', 'in_progress') AND (wo.status = 'in_progress' OR wo.due_date <= $2::date))
           OR (wo.status = 'done'
               AND ((wo.completed_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $3)::date = $2::date)
         )
       ORDER BY (wo.status = 'done'),
                (wo.status <> 'in_progress'),
                wo.due_date NULLS LAST,
                CASE wo.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                wo.id`,
      [req.user.id, day, zone]
    );
    res.json({
      date: day,
      workOrders: result.rows.map(r => ({ ...r, overdue: r.status !== 'done' && !!r.due_date && r.due_date < day })),
    });
  } catch (err) {
    serverError(res, err);
  }
});

// The one place a one-tap status change is written. Anything that must follow a
// transition (e.g. rolling equipment maintenance dates forward when an order
// becomes 'done') hooks in here, with `before` = the row as it was.
async function applyStatusChange(db, before, status) {
  const result = await db.query(
    `UPDATE work_orders SET status = $1, updated_at = NOW(),
       completed_at = ${status === 'done' ? 'COALESCE(completed_at, NOW())' : 'NULL'}
     WHERE id = $2 RETURNING id, status, completed_at`,
    [status, before.id]
  );
  // Same side effect as PUT /work-orders/:id: completing a maintenance work order
  // moves the equipment's next maintenance forward (only on a real transition).
  if (status === 'done' && before.status !== 'done') {
    await rollMaintenanceForward(db, before.id).catch(err => console.error('Maintenance roll-forward failed:', err));
  }
  return result.rows[0];
}

// POST /api/work-orders/:id/status — one-tap transition for the assignee (or an admin).
// Unlike PUT /work-orders/:id it touches nothing but the status, so a phone never
// overwrites the other fields with stale values.
router.post('/work-orders/:id/status', authenticate, validate({
  status: { required: true, type: 'string', enum: ['in_progress', 'done'] },
}), async (req, res) => {
  const db = req.app.locals.db;
  const { status } = req.body;
  // Not an int4: nothing can match, and PostgreSQL would answer 500 instead.
  if (!/^\d{1,9}$/.test(req.params.id)) return res.status(404).json({ error: 'Bon de service non trouvé' });
  try {
    const found = await db.query('SELECT id, assigned_to, status FROM work_orders WHERE id = $1', [req.params.id]);
    if (found.rows.length === 0) return res.status(404).json({ error: 'Bon de service non trouvé' });
    const wo = found.rows[0];
    if (req.user.role !== 'admin' && Number(wo.assigned_to) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Ce bon de service ne vous est pas assigné' });
    }
    if (wo.status === 'cancelled') return res.status(409).json({ error: 'Bon de service annulé' });
    res.json(await applyStatusChange(db, wo, status));
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
module.exports.applyStatusChange = applyStatusChange;
