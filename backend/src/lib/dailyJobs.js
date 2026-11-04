const { generatePreventiveWorkOrders } = require('./maintenance');
const { sendAdminDigest } = require('./digest');

// Everything the platform does once a day. One implementation, two runners:
// the Netlify scheduled function (netlify/functions/maintenance-scheduler.js)
// and the long-running scheduler container (backend/src/scheduler.js).
// Both steps are idempotent, so an accidental double run is harmless.
async function runDailyJobs(db) {
  const created = await generatePreventiveWorkOrders(db);
  console.log(`Daily jobs: ${created} preventive work order(s) created.`);

  await sendAdminDigest(db);
  // Shown in the admin panel (Santé). Best effort: a status write must never fail the jobs.
  await db.query(
    `INSERT INTO app_status (key, value, updated_at) VALUES ('scheduler_last_run', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify({ created })]
  ).catch(err => console.error('Could not record the scheduler status:', err.message));
  return { created };
}

module.exports = { runDailyJobs };
