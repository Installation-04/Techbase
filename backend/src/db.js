const { Pool, types } = require('pg');

// Return DATE columns (maintenance dates, EPI expiry, work-order due dates) as
// plain "YYYY-MM-DD" strings. By default pg turns them into a JS Date at local
// midnight of the *server*, which JSON-serialises to a UTC instant that is the
// previous day for anyone east of UTC (a Docker container with TZ=Europe/Paris)
// and displays a day early for anyone west of it (Québec). A calendar date has
// no time zone, so it travels as the string it is. TIMESTAMP columns are real
// instants and are left alone.
const PG_DATE_OID = 1082;
types.setTypeParser(PG_DATE_OID, value => value);

function createPool() {
  // Netlify Database (Neon) injects the connection string directly as
  // NETLIFY_DATABASE_URL — no SDK call needed (and @netlify/database's
  // getConnectionString() reads the older NETLIFY_DB_URL name, which
  // Netlify no longer sets, so it always threw here).
  const netlifyConnectionString = process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL;
  if (netlifyConnectionString) {
    return new Pool({ connectionString: netlifyConnectionString });
  }
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'techbase',
    user: process.env.DB_USER || 'techbase',
    password: process.env.DB_PASSWORD || 'changeme',
  });
}

module.exports = { createPool };
