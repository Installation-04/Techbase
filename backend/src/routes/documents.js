const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../lib/respond');

const isNetlify = !!process.env.NETLIFY;
// '/app/uploads' is the Docker container's path (set explicitly via
// UPLOADS_DIR in docker-compose.yml); default to a path relative to this
// file so requiring this module outside a container never fails on
// permissions trying to create a directory it can't write to.
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
if (!isNetlify) fs.mkdirSync(uploadsDir, { recursive: true });

function uniqueFilename(originalname) {
  const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
  return unique + path.extname(originalname);
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
    if (isNetlify) {
      filename = uniqueFilename(req.file.originalname);
      const store = getBlobStore();
      await store.set(filename, req.file.buffer, { metadata: { mimetype: req.file.mimetype } });
    }
    const result = await db.query(
      'INSERT INTO documents (client_id, filename, original_name, mimetype, size, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.clientId, filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id]
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
    res.setHeader('Content-Type', doc.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`);
    if (isNetlify) {
      const store = getBlobStore();
      const data = await store.get(doc.filename, { type: 'arrayBuffer' });
      if (!data) return res.status(404).json({ error: 'Fichier non trouvé' });
      res.send(Buffer.from(data));
    } else {
      res.sendFile(path.join(uploadsDir, doc.filename));
    }
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
