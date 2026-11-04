const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { serverError } = require('../lib/respond');
const { systemInfo } = require('../lib/systemInfo');
const updater = require('../lib/updaterClient');
const { audit, listAudit, exportAudit } = require('../lib/audit');

const router = express.Router();
router.use('/admin', authenticate, requireAdmin);

router.get('/admin/system', async (req, res) => {
  try {
    res.json(await systemInfo());
  } catch (err) {
    serverError(res, err);
  }
});

// Size of a folder, without following links and without ever throwing.
function folderSize(dir, limit = 20000) {
  let total = 0; let seen = 0;
  const walk = d => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (++seen > limit) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { try { total += fs.statSync(p).size; } catch { /* vanished */ } }
    }
  };
  walk(dir);
  return { bytes: total, truncated: seen > limit };
}

router.get('/admin/health', async (req, res) => {
  const db = req.app.locals.db;
  const out = { uptimeSeconds: Math.round(process.uptime()), node: process.version };
  try {
    const t0 = Date.now();
    await db.query('SELECT 1');
    out.database = { ok: true, latencyMs: Date.now() - t0 };
    const counts = await db.query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM clients) AS clients,
      (SELECT count(*)::int FROM work_orders WHERE status NOT IN ('done','cancelled')) AS open_work_orders`);
    out.counts = counts.rows[0];
    const sched = await db.query("SELECT value, updated_at FROM app_status WHERE key = 'scheduler_last_run'");
    out.scheduler = sched.rows[0] ? { ...sched.rows[0].value, at: sched.rows[0].updated_at } : null;
  } catch (err) {
    console.error('admin health:', err.message);
    out.database = { ok: false };
  }
  const uploads = process.env.UPLOADS_DIR;
  if (uploads) {
    out.uploads = folderSize(uploads);
    try {
      const s = fs.statfsSync(uploads);
      out.disk = { freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) };
    } catch { /* not supported here */ }
  }
  out.email = !!process.env.RESEND_API_KEY;
  out.sso = { google: !!process.env.GOOGLE_CLIENT_ID, microsoft: !!process.env.MICROSOFT_CLIENT_ID };
  res.json(out);
});

// ---- one-click update (only when the opt-in updater service is running) ----

const updateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives, réessayez plus tard' } });

// The admin must type their own password again: a stolen session alone must not be able to
// restart the server on another version.
async function confirmPassword(req) {
  const password = req.body?.password;
  if (typeof password !== 'string' || !password) { const e = new Error('Votre mot de passe est requis.'); e.status = 400; throw e; }
  const { rows } = await req.app.locals.db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const ok = rows[0]?.password_hash ? await bcrypt.compare(password, rows[0].password_hash) : false;
  if (!ok) { const e = new Error('Mot de passe incorrect.'); e.status = 403; throw e; }
}

function sendError(res, err) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  return serverError(res, err);
}

router.post('/admin/update', updateLimiter, async (req, res) => {
  try {
    await confirmPassword(req);
    const version = req.body.version;
    await updater.update(version);
    await audit(req, 'update.requested', { to: version }); // recorded once the updater has accepted it
    res.status(202).json({ accepted: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/admin/update/rollback', updateLimiter, async (req, res) => {
  try {
    await confirmPassword(req);
    await updater.rollback();
    await audit(req, 'update.rollback_requested', {});
    res.status(202).json({ accepted: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/admin/update/status', async (req, res) => {
  try {
    const state = await updater.status();
    // Record the outcome once, the first time anybody sees a finished operation.
    const terminal = ['success', 'rolled_back', 'failed'].includes(state.state);
    if (terminal && state.startedAt) {
      const db = req.app.locals.db;
      const key = 'updater_last_audited';
      const seen = await db.query('SELECT value FROM app_status WHERE key = $1', [key]);
      if (seen.rows[0]?.value?.startedAt !== state.startedAt) {
        await db.query(
          `INSERT INTO app_status (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, JSON.stringify({ startedAt: state.startedAt })]
        );
        await audit(req, `update.${state.state}`, { from: state.from, to: state.to, backup: state.backup, error: state.error });
      }
    }
    res.json(state);
  } catch (err) {
    sendError(res, err);
  }
});

// ---- audit log (admin only, like everything under /admin) ----

router.get('/admin/audit', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  try {
    res.json(await listAudit(req.app.locals.db, req.query, { page, pageSize }));
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/admin/audit/export', async (req, res) => {
  let started = false;
  try {
    // Rows are streamed in chunks; headers go out with the first one, after the filters validated.
    const write = chunk => new Promise(resolve => {
      if (!started) {
        started = true;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="journal-audit.csv"');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }
      if (res.write(chunk)) resolve(); else { res.once('drain', resolve); res.once('close', resolve); }
    });
    const count = await exportAudit(req.app.locals.db, req.query, write);
    await audit(req, 'audit.exported', { rows: count, filters: { ...req.query } });
    res.end();
  } catch (err) {
    if (started) return res.destroy(err); // a truncated download must not look complete
    sendError(res, err);
  }
});

module.exports = router;
