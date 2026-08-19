const { Pool } = require('pg');

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
