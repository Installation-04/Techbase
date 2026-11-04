const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { serverError } = require('../lib/respond');
const { contentDisposition } = require('../lib/fileTypes');
const { SignatureError, parseSignatureDataUrl, buildServiceReportPdf } = require('../lib/serviceReport');
const documentsRouter = require('./documents');

const isNetlify = !!process.env.NETLIFY;

const REPORT_COLUMNS = `id, work_order_id, work_done, parts_used, time_spent_minutes, observations,
  signer_name, signed_at, document_id, created_by, created_at, updated_at, (signature IS NOT NULL) AS has_signature`;

// A work order's report is visible to admins and to the users attached to the
// work order (assignee or creator) — not to every authenticated user.
function canAccess(user, workOrder) {
  if (user?.role === 'admin') return true;
  const uid = String(user?.id);
  return [workOrder.assigned_to, workOrder.created_by].some(id => id !== null && id !== undefined && String(id) === uid);
}

// Loads the work order and enforces access; sends the error response itself
// and returns null when the caller must stop.
async function loadAuthorized(req, res) {
  const db = req.app.locals.db;
  const result = await db.query(
    `SELECT wo.*, c.name AS client_name, c.address AS client_address, c.phone AS client_phone,
            c.contract_number AS client_contract, e.name AS equipment_name, u.name AS assigned_to_name
     FROM work_orders wo
     JOIN clients c ON c.id = wo.client_id
     LEFT JOIN equipment e ON e.id = wo.equipment_id
     LEFT JOIN users u ON u.id = wo.assigned_to
     WHERE wo.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Bon de service non trouvé' });
    return null;
  }
  const workOrder = result.rows[0];
  if (!canAccess(req.user, workOrder)) {
    res.status(403).json({ error: 'Accès refusé' });
    return null;
  }
  return workOrder;
}

function pdfUnavailable(res) {
  return res.status(501).json({ error: "La génération de PDF n'est pas disponible sur ce type de déploiement" });
}

function pdfFilename(workOrder) {
  return `rapport-intervention-${workOrder.id}.pdf`;
}

async function renderPdf(db, workOrder, report) {
  const signatureRow = await db.query('SELECT signature FROM service_reports WHERE id = $1', [report.id]);
  return buildServiceReportPdf({
    company: process.env.COMPANY_NAME || 'TechIBase',
    workOrder,
    client: {
      name: workOrder.client_name,
      address: workOrder.client_address,
      phone: workOrder.client_phone,
      contract_number: workOrder.client_contract,
    },
    report,
    signature: signatureRow.rows[0]?.signature || null,
    generatedAt: new Date(),
  });
}

router.get('/work-orders/:id/service-report', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    if (!(await loadAuthorized(req, res))) return;
    const result = await db.query(`SELECT ${REPORT_COLUMNS} FROM service_reports WHERE work_order_id = $1`, [req.params.id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/work-orders/:id/service-report/signature', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    if (!(await loadAuthorized(req, res))) return;
    const result = await db.query('SELECT signature FROM service_reports WHERE work_order_id = $1', [req.params.id]);
    const sig = result.rows[0]?.signature;
    if (!sig) return res.status(404).json({ error: 'Signature non trouvée' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(sig);
  } catch (err) {
    serverError(res, err);
  }
});

// PUT creates or updates the report. `signature` (PNG data URL) signs it.
router.put('/work-orders/:id/service-report', authenticate, validate({
  work_done: { type: 'string', maxLength: 10000 },
  parts_used: { type: 'string', maxLength: 5000 },
  time_spent_minutes: { type: 'number' },
  observations: { type: 'string', maxLength: 10000 },
  signer_name: { type: 'string', maxLength: 255 },
  signature: { type: 'string' },
}), async (req, res) => {
  const db = req.app.locals.db;
  try {
    const workOrder = await loadAuthorized(req, res);
    if (!workOrder) return;
    const { work_done, parts_used, observations, signer_name, signature } = req.body;

    let time = null;
    if (req.body.time_spent_minutes !== undefined && req.body.time_spent_minutes !== null && req.body.time_spent_minutes !== '') {
      time = Number(req.body.time_spent_minutes);
      if (!Number.isInteger(time) || time < 0 || time > 24 * 60 * 31) {
        return res.status(400).json({ error: 'time_spent_minutes doit être un nombre entier de minutes valide' });
      }
    }

    let signatureBuf = null;
    if (signature) {
      if (!signer_name || !String(signer_name).trim()) {
        return res.status(400).json({ error: 'Le nom du signataire est requis' });
      }
      try {
        signatureBuf = parseSignatureDataUrl(signature);
      } catch (err) {
        if (err instanceof SignatureError) return res.status(400).json({ error: err.message });
        throw err;
      }
    }

    // The signature covers the report's content, so a save without a fresh
    // signature drops any previous one.
    const result = await db.query(
      `INSERT INTO service_reports (work_order_id, work_done, parts_used, time_spent_minutes, observations,
                                    signer_name, signature, signed_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (work_order_id) DO UPDATE SET
         work_done = EXCLUDED.work_done,
         parts_used = EXCLUDED.parts_used,
         time_spent_minutes = EXCLUDED.time_spent_minutes,
         observations = EXCLUDED.observations,
         signer_name = EXCLUDED.signer_name,
         signature = EXCLUDED.signature,
         signed_at = EXCLUDED.signed_at,
         updated_at = NOW()
       RETURNING ${REPORT_COLUMNS}`,
      [
        req.params.id, work_done || null, parts_used || null, time, observations || null,
        signatureBuf ? String(signer_name).trim() : null,
        signatureBuf, signatureBuf ? new Date() : null, req.user.id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

// GET the PDF, generated on the fly from the current report.
router.get('/work-orders/:id/service-report/pdf', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    if (isNetlify) return pdfUnavailable(res);
    const workOrder = await loadAuthorized(req, res);
    if (!workOrder) return;
    const result = await db.query(`SELECT ${REPORT_COLUMNS} FROM service_reports WHERE work_order_id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Rapport d'intervention non trouvé" });
    const pdf = await renderPdf(db, workOrder, result.rows[0]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition('attachment', pdfFilename(workOrder)));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(pdf);
  } catch (err) {
    serverError(res, err);
  }
});

// POST attaches the signed report's PDF to the client's documents. Re-attaching
// replaces the previous attachment instead of piling up copies.
router.post('/work-orders/:id/service-report/attach', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    if (isNetlify) return pdfUnavailable(res);
    const workOrder = await loadAuthorized(req, res);
    if (!workOrder) return;
    const result = await db.query(`SELECT ${REPORT_COLUMNS} FROM service_reports WHERE work_order_id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Rapport d'intervention non trouvé" });
    const report = result.rows[0];
    if (!report.has_signature) return res.status(400).json({ error: 'Le rapport doit être signé avant d\'être joint au dossier du client' });

    const pdf = await renderPdf(db, workOrder, report);
    const filename = `${crypto.randomUUID()}.pdf`;
    const uploadsDir = documentsRouter.uploadsDir;
    await fs.promises.writeFile(path.join(uploadsDir, filename), pdf);

    const doc = await db.query(
      'INSERT INTO documents (client_id, filename, original_name, mimetype, size, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [workOrder.client_id, filename, pdfFilename(workOrder), 'application/pdf', pdf.length, req.user.id]
    );

    if (report.document_id) {
      const old = await db.query('DELETE FROM documents WHERE id = $1 AND client_id = $2 RETURNING filename', [report.document_id, workOrder.client_id]);
      if (old.rows[0]) {
        await fs.promises.unlink(path.join(uploadsDir, old.rows[0].filename)).catch(() => {});
      }
    }
    await db.query('UPDATE service_reports SET document_id = $1, updated_at = NOW() WHERE id = $2', [doc.rows[0].id, report.id]);
    res.status(201).json(doc.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
module.exports.canAccess = canAccess;
