// Preventive-maintenance work-order generation, shared by the daily scheduled
// function (netlify/functions/maintenance-scheduler.js) and the tests.

// One statement for all due equipment (instead of one insert per equipment).
//
// An equipment gets a new auto-generated work order only if it has none that is
// still active AND none already generated for its current next_maintenance
// date. The second condition is what stops the scheduler from re-creating the
// work order the day after it is completed or cancelled: finishing the job
// doesn't move next_maintenance, so without it the equipment would look due
// again. Changing next_maintenance to a new date makes it eligible again.
//
// ON CONFLICT DO NOTHING (no target) swallows a lost race against the partial
// unique index idx_work_orders_one_active_auto_per_equipment when two runs
// overlap, so concurrent runs can't produce duplicates or errors.
const GENERATE_SQL = `
  INSERT INTO work_orders (client_id, equipment_id, title, description, status, priority, due_date, auto_generated)
  SELECT e.client_id,
         e.id,
         'Maintenance préventive — ' || e.name,
         'Généré automatiquement : prochaine maintenance prévue le ' || to_char(e.next_maintenance, 'DD/MM/YYYY') || '.',
         'open',
         'medium',
         e.next_maintenance,
         TRUE
  FROM equipment e
  WHERE e.next_maintenance IS NOT NULL
    AND e.next_maintenance <= CURRENT_DATE + INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM work_orders wo
      WHERE wo.equipment_id = e.id
        AND wo.auto_generated = TRUE
        AND (wo.status NOT IN ('done', 'cancelled') OR wo.due_date = e.next_maintenance)
    )
  ON CONFLICT DO NOTHING
  RETURNING id
`;

// Returns how many work orders were created.
async function generatePreventiveWorkOrders(db) {
  const { rows } = await db.query(GENERATE_SQL);
  return rows.length;
}

module.exports = { generatePreventiveWorkOrders };
