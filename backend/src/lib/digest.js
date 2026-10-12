const { sendEmail, escapeHtml } = require('./email');

// Daily email to every admin summarising overdue maintenance and low EPI
// stock. A no-op when RESEND_API_KEY isn't set (email is opt-in) or when there
// is nothing to report. Shared by the Netlify scheduled function and the
// Docker scheduler (see lib/dailyJobs.js).
async function sendAdminDigest(db) {
  if (!process.env.RESEND_API_KEY) return;

  const [overdueEquipment, lowStockEpi, admins] = await Promise.all([
    db.query(`
      SELECT e.name, c.name AS client_name, to_char(e.next_maintenance, 'DD/MM/YYYY') AS due
      FROM equipment e JOIN clients c ON c.id = e.client_id
      WHERE e.next_maintenance IS NOT NULL AND e.next_maintenance <= CURRENT_DATE
      ORDER BY e.next_maintenance
    `),
    db.query(`
      SELECT ep.name, c.name AS client_name, ep.quantity
      FROM epi ep JOIN clients c ON c.id = ep.client_id
      WHERE ep.quantity <= 2
      ORDER BY ep.quantity
    `),
    db.query("SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL"),
  ]);

  if (overdueEquipment.rows.length === 0 && lowStockEpi.rows.length === 0) return;

  const equipmentList = overdueEquipment.rows
    .map(e => `<li>${escapeHtml(e.name)} (${escapeHtml(e.client_name)}) — échue le ${e.due}</li>`)
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

module.exports = { sendAdminDigest };
