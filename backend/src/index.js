const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
}));
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'techbase',
  user: process.env.DB_USER || 'techbase',
  password: process.env.DB_PASSWORD || 'changeme',
});

app.locals.db = pool;

const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads';
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const usersRouter = require('./routes/users');
const clientsRouter = require('./routes/clients');
const equipmentRouter = require('./routes/equipment');
const proceduresRouter = require('./routes/procedures');
const passwordsRouter = require('./routes/passwords');
const contactsRouter = require('./routes/contacts');
const epiRouter = require('./routes/epi');
const logbookRouter = require('./routes/logbook');
const documentsRouter = require('./routes/documents');
const searchRouter = require('./routes/search');

app.use('/api/users', usersRouter);
app.use('/api', clientsRouter);
app.use('/api', equipmentRouter);
app.use('/api', proceduresRouter);
app.use('/api', passwordsRouter);
app.use('/api', contactsRouter);
app.use('/api', epiRouter);
app.use('/api', logbookRouter);
app.use('/api', documentsRouter);
app.use('/api', searchRouter);

async function createDefaultAdmin() {
  try {
    const result = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@techbase.local']);
    if (result.rows.length === 0) {
      const hash = await bcrypt.hash('Admin1234!', 10);
      await pool.query(
        'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)',
        ['admin@techbase.local', hash, 'Administrateur', 'admin']
      );
      console.log('Default admin created');
    }
  } catch (err) {
    console.error('Error creating default admin:', err);
  }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      console.log('Database connected');
      await createDefaultAdmin();
      break;
    } catch (err) {
      retries--;
      console.log(`DB not ready, retrying... (${retries} left)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
});
