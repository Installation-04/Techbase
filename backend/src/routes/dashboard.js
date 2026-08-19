const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../lib/respond');

// GET /api/dashboard/summary — aggregate KPIs for the Home dashboard
router.get('/dashboard/summary', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const [
      clients,
      equipmentStatus,
      overdueMaintenance,
      workOrdersByStatus,
      workOrdersByPriority,
      interventionsByMonth,
      lowStockEpi,
    ] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count FROM clients'),
      db.query('SELECT COALESCE(status, \'inconnu\') AS status, COUNT(*)::int AS count FROM equipment GROUP BY status'),
      db.query("SELECT COUNT(*)::int AS count FROM equipment WHERE next_maintenance IS NOT NULL AND next_maintenance <= CURRENT_DATE"),
      db.query('SELECT status, COUNT(*)::int AS count FROM work_orders GROUP BY status'),
      db.query("SELECT priority, COUNT(*)::int AS count FROM work_orders WHERE status NOT IN ('done', 'cancelled') GROUP BY priority"),
      db.query(`
        SELECT to_char(date_trunc('month', entry_date), 'YYYY-MM') AS month, COUNT(*)::int AS count
        FROM logbook
        WHERE type = 'intervention' AND entry_date >= NOW() - INTERVAL '6 months'
        GROUP BY 1 ORDER BY 1
      `),
      db.query('SELECT COUNT(*)::int AS count FROM epi WHERE quantity <= 2'),
    ]);

    res.json({
      totalClients: clients.rows[0].count,
      equipmentByStatus: Object.fromEntries(equipmentStatus.rows.map(r => [r.status, r.count])),
      overdueMaintenanceCount: overdueMaintenance.rows[0].count,
      workOrdersByStatus: Object.fromEntries(workOrdersByStatus.rows.map(r => [r.status, r.count])),
      workOrdersByPriority: Object.fromEntries(workOrdersByPriority.rows.map(r => [r.priority, r.count])),
      interventionsByMonth: interventionsByMonth.rows,
      lowStockEpiCount: lowStockEpi.rows[0].count,
    });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
