// Security audit trail. One shared helper so every route records events the same way.
//
// Rules:
//  - recording NEVER fails or slows the request: errors are logged and swallowed;
//  - secrets are never stored (keys that look like secrets are redacted defensively);
//  - the client address comes from req.ip, i.e. Express' own "trust proxy" setting
//    (see app.js). X-Forwarded-For is never read directly, so it cannot be forged
//    when no trusted proxy sits in front of the API.

const SECRET_KEY = /pass(word|wd)?|secret|token|authorization|api[_-]?key/i;

function sanitize(value, depth = 0) {
  if (value == null || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 500) : value;
  if (depth > 3) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 50).map(v => sanitize(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEY.test(k) ? '[masqué]' : sanitize(v, depth + 1);
  }
  return out;
}

const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

// audit(req, 'vault.reveal', { label }, { target: ['password', 12], user: {id, email} })
// `user` overrides req.user (login attempts have none yet). `db` can be given when there is no req.
async function audit(req, action, detail = {}, opts = {}) {
  try {
    const db = opts.db || req.app.locals.db;
    const user = opts.user || req?.user || null;
    const [targetType, targetId] = opts.target || [null, null];
    await db.query(
      `INSERT INTO audit_log (user_id, user_email, action, detail, ip, user_agent, target_type, target_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
      [
        user?.id ?? null,
        clip(user?.email, 255),
        clip(action, 80),
        JSON.stringify(sanitize(detail)),
        req ? clip(req.ip, 64) : null,
        req && req.get ? clip(req.get('user-agent'), 255) : null,
        clip(targetType, 40),
        targetId == null ? null : String(targetId).slice(0, 64),
      ]
    );
  } catch (err) {
    console.error('audit log:', err.message);
  }
}

const DEFAULT_RETENTION_DAYS = 365;

// AUDIT_RETENTION_DAYS: a positive whole number of days; 0 keeps everything; anything else = default.
function retentionDays(env = process.env) {
  const raw = env.AUDIT_RETENTION_DAYS;
  if (raw == null || String(raw).trim() === '') return DEFAULT_RETENTION_DAYS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return DEFAULT_RETENTION_DAYS;
  return n;
}

// Deletes rows older than the retention period. Returns how many were removed (0 when disabled).
async function purgeAudit(db, { env = process.env, now = Date.now() } = {}) {
  const days = retentionDays(env);
  if (days === 0) return 0;
  const cutoff = new Date(now - days * 24 * 3600 * 1000);
  const res = await db.query('DELETE FROM audit_log WHERE created_at < $1', [cutoff]);
  if (res.rowCount > 0) {
    await audit(null, 'audit.purged', { deleted: res.rowCount, olderThanDays: days }, { db });
  }
  return res.rowCount;
}

// ---- querying & CSV ----

const escapeLike = s => s.replace(/[\\%_]/g, c => `\\${c}`);

function parseDate(value, endOfDay) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return undefined;
    if (endOfDay) d.setUTCDate(d.getUTCDate() + 1); // exclusive upper bound = whole day included
    return d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// Builds the WHERE clause from query-string filters. Throws {status:400} on bad input.
function buildFilter(query) {
  const where = []; const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  const bad = msg => { const e = new Error(msg); e.status = 400; throw e; };

  const str = k => (typeof query[k] === 'string' ? query[k].trim() : '');
  if (str('user')) {
    const u = str('user');
    if (/^\d+$/.test(u) && u.length < 10) add('user_id = ?', Number(u));
    else add("user_email ILIKE ? ESCAPE '\\'", `%${escapeLike(u)}%`);
  }
  if (str('action')) {
    const a = str('action');
    if (a.endsWith('.')) add("action LIKE ? ESCAPE '\\'", `${escapeLike(a)}%`);
    else add('action = ?', a);
  }
  if (str('target_type')) add('target_type = ?', str('target_type'));
  if (str('target_id')) add('target_id = ?', str('target_id'));
  const from = parseDate(str('from'), false);
  const to = parseDate(str('to'), true);
  if (from === undefined) bad('Date de début invalide');
  if (to === undefined) bad('Date de fin invalide');
  if (from) add('created_at >= ?', from);
  if (to) add('created_at < ?', to);
  if (str('q')) {
    params.push(`%${escapeLike(str('q'))}%`);
    const p = `$${params.length}`;
    where.push(`(action ILIKE ${p} ESCAPE '\\' OR user_email ILIKE ${p} ESCAPE '\\' OR ip ILIKE ${p} ESCAPE '\\' OR detail::text ILIKE ${p} ESCAPE '\\')`);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const COLUMNS = 'id, created_at, user_id, user_email, action, detail, ip, user_agent, target_type, target_id';

async function listAudit(db, query, { page = 1, pageSize = 50 } = {}) {
  const f = buildFilter(query);
  const total = (await db.query(`SELECT count(*)::int AS n FROM audit_log ${f.sql}`, f.params)).rows[0].n;
  const rows = (await db.query(
    `SELECT ${COLUMNS} FROM audit_log ${f.sql} ORDER BY created_at DESC, id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    f.params
  )).rows;
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

// A cell starting with = + - @ (or tab/CR) is run as a formula by Excel/LibreOffice: neutralise it
// with a leading apostrophe, then quote per RFC 4180.
function csvCell(value) {
  let s = value == null ? '' : (typeof value === 'object' && !(value instanceof Date) ? JSON.stringify(value) : String(value));
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER = ['id', 'date', 'utilisateur_id', 'utilisateur', 'action', 'detail', 'ip', 'agent', 'cible_type', 'cible_id'];

function toCsv(rows) {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    const date = r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at;
    lines.push([r.id, date, r.user_id, r.user_email, r.action, r.detail, r.ip, r.user_agent, r.target_type, r.target_id].map(csvCell).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

const EXPORT_LIMIT = 50000;

async function exportAudit(db, query) {
  const f = buildFilter(query);
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM audit_log ${f.sql} ORDER BY created_at DESC, id DESC LIMIT ${EXPORT_LIMIT}`, f.params);
  return { csv: toCsv(rows), count: rows.length };
}

module.exports = { audit, sanitize, retentionDays, purgeAudit, buildFilter, listAudit, exportAudit, toCsv, csvCell, DEFAULT_RETENTION_DAYS, EXPORT_LIMIT };
