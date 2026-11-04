const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { serverError } = require('../lib/respond');
const { systemInfo } = require('../lib/systemInfo');

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

module.exports = router;
