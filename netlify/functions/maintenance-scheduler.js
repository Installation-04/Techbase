// Scheduled Netlify Function: runs daily, auto-creates a work order for any
// equipment whose next_maintenance date is within 7 days and doesn't already
// have an active auto-generated work order (enforced by a DB unique index,
// as a second line of defense against duplicates on overlapping runs). Also
// emails admins a digest of overdue maintenance and low EPI stock.
const { createPool } = require('../../backend/src/db');
const { sendEmail } = require('../../backend/src/lib/email');

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

    await sendAdminDigest(pool);

    return { statusCode: 200 };
  } catch (err) {
    console.error('Maintenance scheduler failed:', err);
    return { statusCode: 500 };
  } finally {
    await pool.end();
  }
};

async function sendAdminDigest(pool) {
  if (!process.env.RESEND_API_KEY) return; // email is opt-in

  const [overdueEquipment, lowStockEpi, admins] = await Promise.all([
    pool.query(`
      SELECT e.name, c.name AS client_name, e.next_maintenance
      FROM equipment e JOIN clients c ON c.id = e.client_id
      WHERE e.next_maintenance IS NOT NULL AND e.next_maintenance <= CURRENT_DATE
      ORDER BY e.next_maintenance
    `),
    pool.query(`
      SELECT ep.name, c.name AS client_name, ep.quantity
      FROM epi ep JOIN clients c ON c.id = ep.client_id
      WHERE ep.quantity <= 2
      ORDER BY ep.quantity
    `),
    pool.query("SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL"),
  ]);

  if (overdueEquipment.rows.length === 0 && lowStockEpi.rows.length === 0) return;

  const equipmentList = overdueEquipment.rows
    .map(e => `<li>${e.name} (${e.client_name}) — échue le ${e.next_maintenance}</li>`)
    .join('');
  const epiList = lowStockEpi.rows
    .map(e => `<li>${e.name} (${e.client_name}) — quantité restante : ${e.quantity}</li>`)
    .join('');

  const html = `
    <h2>Résumé quotidien TechBase</h2>
    ${overdueEquipment.rows.length > 0 ? `<h3>Maintenance en retard (${overdueEquipment.rows.length})</h3><ul>${equipmentList}</ul>` : ''}
    ${lowStockEpi.rows.length > 0 ? `<h3>EPI en stock faible (${lowStockEpi.rows.length})</h3><ul>${epiList}</ul>` : ''}
  `;

  for (const admin of admins.rows) {
    await sendEmail({ to: admin.email, subject: 'TechBase — résumé quotidien', html });
  }
}

exports.config = { schedule: '@daily' };
