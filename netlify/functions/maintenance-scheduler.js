// Scheduled Netlify Function: runs daily and delegates to the shared daily jobs
// (preventive work orders + admin email digest — see backend/src/lib/dailyJobs.js).
// Docker installs run the same jobs through backend/src/scheduler.js.
const { createPool } = require('../../backend/src/db');
const { runDailyJobs } = require('../../backend/src/lib/dailyJobs');

exports.handler = async () => {
  const pool = createPool();
  try {
    await runDailyJobs(pool);
    return { statusCode: 200 };
  } catch (err) {
    console.error('Maintenance scheduler failed:', err);
    return { statusCode: 500 };
  } finally {
    await pool.end();
  }
};

exports.config = { schedule: '@daily' };
