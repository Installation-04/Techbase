const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createPool } = require('./db');
const { version } = require('../package.json');

const isNetlify = !!process.env.NETLIFY;

if ((isNetlify || process.env.NODE_ENV === 'production') && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const app = express();

// Netlify Functions run behind one reverse-proxy hop; trust its
// X-Forwarded-* headers (needed for express-rate-limit's IP detection
// and for req.protocol to reflect https when building OAuth redirect URIs).
app.set('trust proxy', 1);

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
}));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok', version }));

// General ceiling on API abuse; auth routes layer their own tighter limiter on top.
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez plus tard' },
}));

const pool = createPool();
app.locals.db = pool;

if (!isNetlify) {
  // '/app/uploads' is the Docker container's path (set explicitly via
  // UPLOADS_DIR in docker-compose.yml); default to a path relative to this
  // file so requiring the app outside a container (e.g. in CI) never tries
  // to create a directory it has no permission for.
  const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));
}

const authRouter = require('./routes/auth');
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
const workOrdersRouter = require('./routes/workorders');

app.use('/api/auth', authRouter);
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
app.use('/api', workOrdersRouter);

// Catch-all safety net for errors thrown outside a route's own try/catch
// (e.g. a misconfigured middleware) — never let those fall through to
// Express's default HTML error page.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const message = process.env.NODE_ENV === 'production' ? 'Erreur serveur' : err.message;
  res.status(err.status || 500).json({ error: message });
});

let readyPromise = null;

async function init() {
  if (!readyPromise) {
    readyPromise = (async () => {
      // Serverless: the DB is already up, no container-startup race to wait out.
      let retries = isNetlify ? 1 : 10;
      while (retries > 0) {
        try {
          await pool.query('SELECT 1');
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
