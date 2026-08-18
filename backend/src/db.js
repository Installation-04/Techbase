const { Pool } = require('pg');

function createPool() {
  if (process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY) {
    try {
      const { getConnectionString } = require('@netlify/database');
      return new Pool({ connectionString: getConnectionString() });
    } catch (err) {
      console.error('Netlify Database unavailable, falling back to manual DB config:', err.message);
    }
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
