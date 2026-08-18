const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { createPool } = require('./db');
const { version } = require('../package.json');

const isNetlify = !!process.env.NETLIFY;

if ((isNetlify || process.env.NODE_ENV === 'production') && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
}));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', version }));

const pool = createPool();
app.locals.db = pool;

if (!isNetlify) {
  const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads';
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));
}

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

let readyPromise = null;

async function init() {
  if (!readyPromise) {
    readyPromise = (async () => {
      // Serverless: the DB is already up, no container-startup race to wait out.
      let retries = isNetlify ? 1 : 10;
      while (retries > 0) {
        try {
          await pool.query('SELECT 1');
          await createDefaultAdmin();
          return;
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    })().catch(err => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

module.exports = { app, init, pool };
