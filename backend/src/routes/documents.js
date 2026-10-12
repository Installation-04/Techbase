const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../lib/respond');
const {
  SNIFF_BYTES,
  FALLBACK_MIMETYPE,
  resolveStoredMimetype,
  isInlineSafe,
  contentDisposition,
} = require('../lib/fileTypes');

const isNetlify = !!process.env.NETLIFY;
// '/app/uploads' is the Docker container's path (set explicitly via
// UPLOADS_DIR in docker-compose.yml); default to a path relative to this
// file so requiring this module outside a container never fails on
// permissions trying to create a directory it can't write to.
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
if (!isNetlify) fs.mkdirSync(uploadsDir, { recursive: true });

// Random, unguessable storage name (the original name lives in the DB). The
// extension is kept only if it's plain alphanumerics, so it can't smuggle path
// characters into the stored filename.
function uniqueFilename(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  return crypto.randomUUID() + (/^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '');
}

async function readHead(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buf, 0, SNIFF_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

const upload = multer(
  isNetlify
    ? { storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }
    : {
        storage: multer.diskStorage({
          destination: (req, file, cb) => cb(null, uploadsDir),
          filename: (req, file, cb) => cb(null, uniqueFilename(file.originalname)),
        }),
        limits: { fileSize: 50 * 1024 * 1024 },
      }
);

function getBlobStore() {
  const { getStore } = require('@netlify/blobs');
  return getStore('documents');
}

router.get('/clients/:clientId/documents', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT d.*, u.name as uploaded_by_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.client_id = $1 ORDER BY d.created_at DESC',
      [req.params.clientId]
    );
    res.json(result.rows);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/clients/:clientId/documents', authenticate, upload.single('file'), async (req, res) => {
  const db = req.app.locals.db;
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  try {
    let filename = req.file.filename;
    const head = isNetlify ? req.file.buffer.subarray(0, SNIFF_BYTES) : await readHead(req.file.path);
    const mimetype = resolveStoredMimetype(req.file.mimetype, head);
    if (isNetlify) {
      filename = uniqueFilename(req.file.originalname);
      const store = getBlobStore();
      await store.set(filename, req.file.buffer, { metadata: { mimetype } });
    }
    const result = await db.query(
      'INSERT INTO documents (client_id, filename, original_name, mimetype, size, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.clientId, filename, req.file.originalname, mimetype, req.file.size, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/clients/:clientId/documents/:id/download', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM documents WHERE id=$1 AND client_id=$2', [req.params.id, req.params.clientId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document non trouvé' });
    const doc = result.rows[0];

    let body = null;
    let head;
    const filePath = path.join(uploadsDir, doc.filename);
    if (isNetlify) {
      const data = await getBlobStore().get(doc.filename, { type: 'arrayBuffer' });
      if (!data) return res.status(404).json({ error: 'Fichier non trouvé' });
      body = Buffer.from(data);
      head = body.subarray(0, SNIFF_BYTES);
    } else {
      try {
        head = await readHead(filePath);
      } catch (err) {
        if (err.code === 'ENOENT') return res.status(404).json({ error: 'Fichier non trouvé' });
        throw err;
      }
    }

    // Re-check the type on every download (not just at upload) so rows stored
    // before this check existed can't be served as active content either.
    const mimetype = resolveStoredMimetype(doc.mimetype, head);
    const inline = isInlineSafe(mimetype);
    res.setHeader('Content-Type', inline ? mimetype : FALLBACK_MIMETYPE);
    res.setHeader('Content-Disposition', contentDisposition(inline ? 'inline' : 'attachment', doc.original_name));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (isNetlify) res.send(body);
    else res.sendFile(filePath);
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/clients/:clientId/documents/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM documents WHERE id=$1 AND client_id=$2', [req.params.id, req.params.clientId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document non trouvé' });
    const doc = result.rows[0];
    if (isNetlify) {
      const store = getBlobStore();
      await store.delete(doc.filename);
    } else {
      const filePath = path.join(uploadsDir, doc.filename);
      await fs.promises.unlink(filePath).catch(err => {
        if (err.code !== 'ENOENT') throw err;
      });
    }
    await db.query('DELETE FROM documents WHERE id=$1', [req.params.id]);
    res.json({ message: 'Document supprimé' });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
