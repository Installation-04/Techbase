const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

// documents.js reads UPLOADS_DIR when it's first required, so this has to be
// set before the app is loaded.
const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'techbase-uploads-'));
process.env.JWT_SECRET = 'test-secret';
process.env.UPLOADS_DIR = uploadsDir;
delete process.env.NETLIFY;

const { app } = require('../src/app');
const { issueToken } = require('../src/lib/token');

const token = issueToken({ id: 1, email: 'tech@example.com', name: 'Tech', role: 'user' });
const auth = { Authorization: `Bearer ${token}` };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const HTML = Buffer.from('<html><script>fetch("/steal?"+localStorage.token)</script></html>');

// Minimal stand-in for the pg Pool covering the document queries only.
function createFakeDb() {
  const docs = [];
  let nextId = 1;
  return {
    docs,
    async query(text, params = []) {
      if (text.startsWith('INSERT INTO documents')) {
        const [client_id, filename, original_name, mimetype, size, uploaded_by] = params;
        const row = { id: nextId++, client_id: Number(client_id), filename, original_name, mimetype, size, uploaded_by };
        docs.push(row);
        return { rows: [row] };
      }
      if (text.includes('SELECT * FROM documents WHERE id=$1 AND client_id=$2')) {
        const row = docs.find(d => String(d.id) === String(params[0]) && String(d.client_id) === String(params[1]));
        return { rows: row ? [row] : [] };
      }
      throw new Error(`Unhandled query in fake db: ${text}`);
    },
  };
}

function upload(clientId, buffer, filename, contentType) {
  return request(app)
    .post(`/api/clients/${clientId}/documents`)
    .set(auth)
    .attach('file', buffer, { filename, contentType });
}

test.after(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));

test('an uploaded HTML file is always downloaded, never rendered', async () => {
  app.locals.db = createFakeDb();
  const up = await upload(1, HTML, 'evil.html', 'text/html');
  assert.equal(up.status, 201);

  const res = await request(app).get(`/api/clients/1/documents/${up.body.id}/download`).set(auth);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/octet-stream');
  assert.match(res.headers['content-disposition'], /^attachment;/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(res.body, HTML);
});

test('a genuine PNG is served inline with its real type', async () => {
  app.locals.db = createFakeDb();
  const up = await upload(1, PNG, 'photo.png', 'image/png');
  assert.equal(up.body.mimetype, 'image/png');

  const res = await request(app).get(`/api/clients/1/documents/${up.body.id}/download`).set(auth);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/png');
  assert.match(res.headers['content-disposition'], /^inline;/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('HTML disguised as an image is downgraded at upload', async () => {
  app.locals.db = createFakeDb();
  const up = await upload(1, HTML, 'photo.png', 'image/png');
  assert.equal(up.status, 201);
  assert.equal(up.body.mimetype, 'application/octet-stream');

  const res = await request(app).get(`/api/clients/1/documents/${up.body.id}/download`).set(auth);
  assert.match(res.headers['content-disposition'], /^attachment;/);
});

test('rows stored before the check existed are re-verified on download', async () => {
  const db = createFakeDb();
  app.locals.db = db;
  // A legacy row: HTML content that was stored with a trusted-looking image type.
  fs.writeFileSync(path.join(uploadsDir, 'legacy.png'), HTML);
  db.docs.push({ id: 99, client_id: 1, filename: 'legacy.png', original_name: 'legacy.png', mimetype: 'image/png', size: HTML.length });

  const res = await request(app).get('/api/clients/1/documents/99/download').set(auth);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/octet-stream');
  assert.match(res.headers['content-disposition'], /^attachment;/);
});

test('stored filenames are random UUIDs, not timestamp-based', async () => {
  const db = createFakeDb();
  app.locals.db = db;
  await upload(1, HTML, 'a.html', 'text/html');
  await upload(1, HTML, 'a.html', 'text/html');
  const [a, b] = db.docs.map(d => d.filename);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.html$/);
  assert.notEqual(a, b);
});

test('an extension containing odd characters is dropped from the stored name', async () => {
  const db = createFakeDb();
  app.locals.db = db;
  await upload(1, HTML, 'weird.h tml', 'text/html');
  assert.match(db.docs[0].filename, /^[0-9a-f-]{36}$/);
});

test('uploaded files are not reachable as static files', async () => {
  const db = createFakeDb();
  app.locals.db = db;
  await upload(1, PNG, 'photo.png', 'image/png');
  const res = await request(app).get(`/uploads/${db.docs[0].filename}`);
  assert.equal(res.status, 404);
});

test('downloading requires authentication', async () => {
  app.locals.db = createFakeDb();
  const res = await request(app).get('/api/clients/1/documents/1/download');
  assert.equal(res.status, 401);
});

test('a document whose file is missing from disk returns 404', async () => {
  const db = createFakeDb();
  app.locals.db = db;
  db.docs.push({ id: 5, client_id: 1, filename: 'gone.pdf', original_name: 'gone.pdf', mimetype: 'application/pdf', size: 1 });
  const res = await request(app).get('/api/clients/1/documents/5/download').set(auth);
  assert.equal(res.status, 404);
});
