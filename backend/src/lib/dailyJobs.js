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
  return { created };
}

module.exports = { runDailyJobs };
