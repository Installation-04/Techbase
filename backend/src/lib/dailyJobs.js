const { generatePreventiveWorkOrders } = require('./maintenance');
const { sendAdminDigest } = require('./digest');
const { sendReminderNotifications } = require('./reminders');
const { purgeAudit } = require('./audit');

// Everything the platform does once a day. One implementation, two runners:
// the Netlify scheduled function (netlify/functions/maintenance-scheduler.js)
// and the long-running scheduler container (backend/src/scheduler.js).
// Both steps are idempotent, so an accidental double run is harmless.
async function runDailyJobs(db) {
  const created = await generatePreventiveWorkOrders(db);
  console.log(`Daily jobs: ${created} preventive work order(s) created.`);

  const reminders = await sendReminderNotifications(db).catch(err => {
    console.error('Reminder notifications failed:', err.message);
    return 0;
  });
  console.log(`Daily jobs: ${reminders} reminder notification(s) created.`);

  // Email is best effort: a failing digest must not skip the status write below.
  await sendAdminDigest(db).catch(err => console.error('Admin digest failed:', err.message));
  // Audit-log retention (AUDIT_RETENTION_DAYS, default 365, 0 = keep everything). Best effort.
  try {
    const purged = await purgeAudit(db);
    if (purged) console.log(`Daily jobs: ${purged} audit log row(s) purged.`);
  } catch (err) {
    console.error('Could not purge the audit log:', err.message);
  }

  // Shown in the admin panel (Santé). Best effort: a status write must never fail the jobs.
  await db.query(
    `INSERT INTO app_status (key, value, updated_at) VALUES ('scheduler_last_run', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify({ created, reminders })]
  ).catch(err => console.error('Could not record the scheduler status:', err.message));
  return { created, reminders };
}

module.exports = { runDailyJobs };
