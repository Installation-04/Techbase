// Scheduled Netlify Function: runs daily, auto-creates one preventive work
// order per equipment maintenance date (see backend/src/lib/maintenance.js for
// the exact rules). Also emails admins a digest of overdue maintenance and low
// EPI stock.
const { createPool } = require('../../backend/src/db');
const { sendEmail, escapeHtml } = require('../../backend/src/lib/email');
const { generatePreventiveWorkOrders } = require('../../backend/src/lib/maintenance');

exports.handler = async () => {
  const pool = createPool();
  try {
    const created = await generatePreventiveWorkOrders(pool);

    console.log(`Maintenance scheduler: ${created} work order(s) created.`);

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
    .map(e => `<li>${escapeHtml(e.name)} (${escapeHtml(e.client_name)}) — échue le ${e.next_maintenance}</li>`)
    .join('');
  const epiList = lowStockEpi.rows
    .map(e => `<li>${escapeHtml(e.name)} (${escapeHtml(e.client_name)}) — quantité restante : ${e.quantity}</li>`)
    .join('');

  const html = `
    <h2>Résumé quotidien TechIBase</h2>
    ${overdueEquipment.rows.length > 0 ? `<h3>Maintenance en retard (${overdueEquipment.rows.length})</h3><ul>${equipmentList}</ul>` : ''}
    ${lowStockEpi.rows.length > 0 ? `<h3>EPI en stock faible (${lowStockEpi.rows.length})</h3><ul>${epiList}</ul>` : ''}
  `;

  for (const admin of admins.rows) {
    await sendEmail({ to: admin.email, subject: 'TechIBase — résumé quotidien', html });
  }
}

exports.config = { schedule: '@daily' };
