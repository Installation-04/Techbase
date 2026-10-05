// Long-running scheduler for Docker/self-hosted installs (on Netlify the same
// jobs run as the scheduled function in netlify/functions/maintenance-scheduler.js).
// Runs the daily jobs — auto-generated preventive work orders and the admin
// email digest — once a day at SCHEDULER_TIME.
//
//   node src/scheduler.js           run forever, once a day
//   node src/scheduler.js --once    run the jobs now, then exit (0 = ok, 1 = failed)
//
// Environment: SCHEDULER_TIME (HH:MM, default 06:00, in the container's TZ),
// RUN_ON_START=true to also run once at startup, plus the usual DB_* and
// RESEND_API_KEY / EMAIL_FROM.
const { createPool } = require('./db');
const { runDailyJobs } = require('./lib/dailyJobs');
const { parseTime, msUntilNext } = require('./lib/schedule');

const TIME = process.env.SCHEDULER_TIME || '06:00';

async function runOnce(pool) {
  try {
    await runDailyJobs(pool);
    return true;
  } catch (err) {
    // Never crash the daemon over one bad run (e.g. the database restarting) —
    // log it and try again at the next scheduled time.
    console.error('Daily jobs failed:', err);
    return false;
  }
}

async function main() {
  parseTime(TIME); // fail fast on a typo instead of at the first run
  const pool = createPool();

  if (process.argv.includes('--once')) {
    const ok = await runOnce(pool);
    await pool.end();
    process.exit(ok ? 0 : 1);
  }

  let timer;
  const scheduleNext = () => {
    const now = new Date(); // read the clock once so the logged time matches the timer exactly
    const ms = msUntilNext(now, TIME);
    console.log(`Scheduler: next run at ${new Date(now.getTime() + ms).toISOString()} (SCHEDULER_TIME=${TIME}, TZ=${process.env.TZ || 'UTC'})`);
    timer = setTimeout(async () => {
      await runOnce(pool);
      scheduleNext();
    }, ms);
  };

  const shutdown = async () => {
    clearTimeout(timer);
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  if (process.env.RUN_ON_START === 'true') await runOnce(pool);
  scheduleNext();
}

main().catch(err => {
  console.error('Scheduler failed to start:', err);
  process.exit(1);
});
