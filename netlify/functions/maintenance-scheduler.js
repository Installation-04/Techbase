// Scheduled Netlify Function: runs daily, auto-creates a work order for any
// equipment whose next_maintenance date is within 7 days and doesn't already
// have an active auto-generated work order (enforced by a DB unique index,
// as a second line of defense against duplicates on overlapping runs).
const { createPool } = require('../../backend/src/db');

exports.handler = async () => {
  const pool = createPool();
  try {
    const { rows: due } = await pool.query(`
      SELECT e.id, e.client_id, e.name, e.next_maintenance
      FROM equipment e
      WHERE e.next_maintenance IS NOT NULL
        AND e.next_maintenance <= CURRENT_DATE + INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM work_orders wo
          WHERE wo.equipment_id = e.id
            AND wo.auto_generated = TRUE
            AND wo.status NOT IN ('done', 'cancelled')
        )
    `);

    let created = 0;
    for (const eq of due) {
      try {
        await pool.query(
          `INSERT INTO work_orders (client_id, equipment_id, title, description, status, priority, due_date, auto_generated)
           VALUES ($1, $2, $3, $4, 'open', 'medium', $5, TRUE)`,
          [
            eq.client_id,
            eq.id,
            `Maintenance préventive — ${eq.name}`,
            `Généré automatiquement : prochaine maintenance prévue le ${eq.next_maintenance}.`,
            eq.next_maintenance,
          ]
        );
        created++;
      } catch (err) {
        if (err.code !== '23505') throw err; // ignore races caught by the unique index
      }
    }

    console.log(`Maintenance scheduler: ${created} work order(s) created (${due.length} equipment due).`);
    return { statusCode: 200 };
  } catch (err) {
    console.error('Maintenance scheduler failed:', err);
    return { statusCode: 500 };
  } finally {
    await pool.end();
  }
};

exports.config = { schedule: '@daily' };
