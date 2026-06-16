const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = '/app/uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/clients/:clientId/documents', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT d.*, u.name as uploaded_by_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.client_id = $1 ORDER BY d.created_at DESC',
      [req.params.clientId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients/:clientId/documents', authenticate, upload.single('file'), async (req, res) => {
  const db = req.app.locals.db;
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  try {
    const result = await db.query(
      'INSERT INTO documents (client_id, filename, original_name, mimetype, size, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.clientId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/clients/:clientId/documents/:id', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query('SELECT * FROM documents WHERE id=$1 AND client_id=$2', [req.params.id, req.params.clientId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document non trouvé' });
    const doc = result.rows[0];
    const filePath = '/app/uploads/' + doc.filename;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db.query('DELETE FROM documents WHERE id=$1', [req.params.id]);
    res.json({ message: 'Document supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
