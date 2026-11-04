const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const request = require('supertest');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'techbase-sr-'));
process.env.JWT_SECRET = 'test-secret';
process.env.UPLOADS_DIR = uploadsDir;
delete process.env.NETLIFY;

const { app } = require('../src/app');
const { issueToken } = require('../src/lib/token');
const { parseSignatureDataUrl, buildServiceReportPdf, SignatureError, formatMinutes, pdfText } = require('../src/lib/serviceReport');

// Valid grayscale PNG of any size, built with zlib so the CRCs are right.
function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function makePng(w = 1, h = 1) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w, 255)]);
  const idat = zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const dataUrl = buf => `data:image/png;base64,${buf.toString('base64')}`;
const PNG_URL = dataUrl(makePng(40, 20));

const tokenFor = (id, role = 'user') => ({ Authorization: `Bearer ${issueToken({ id, email: `u${id}@x.fr`, name: `U${id}`, role })}` });
const binary = (r, cb) => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); };

test('parseSignatureDataUrl accepts a real PNG and rejects everything else', () => {
  assert.ok(parseSignatureDataUrl(PNG_URL).length > 8);
  assert.throws(() => parseSignatureDataUrl('data:image/jpeg;base64,/9j/4AAQ'), SignatureError);
  assert.throws(() => parseSignatureDataUrl('data:image/png;base64,' + Buffer.from('<svg onload=1>').toString('base64')), SignatureError);
  assert.throws(() => parseSignatureDataUrl(dataUrl(makePng(5000, 10))), SignatureError);
  assert.throws(() => parseSignatureDataUrl('data:image/png;base64,' + 'A'.repeat(200000)), SignatureError);
  assert.throws(() => parseSignatureDataUrl(42), SignatureError);
});

test('parseSignatureDataUrl refuses bombs, corrupt streams and polyglots', () => {
  const png = makePng(40, 20);
  // IHDR declares a big image backed by almost no data (decompression bomb)
  const bomb = Buffer.from(png);
  bomb.writeUInt32BE(2000, 16);
  bomb.writeUInt32BE(2000, 20);
  assert.throws(() => parseSignatureDataUrl(dataUrl(bomb)), SignatureError);
  // bytes after IEND (polyglot)
  assert.throws(() => parseSignatureDataUrl(dataUrl(Buffer.concat([png, Buffer.from('<?php system($_GET[0]);')]))), SignatureError);
  // truncated pixel data / missing IEND
  assert.throws(() => parseSignatureDataUrl(dataUrl(png.subarray(0, png.length - 20))), SignatureError);
  // IDAT that is not a zlib stream
  const junk = Buffer.concat([png.subarray(0, 8), chunk('IHDR', png.subarray(16, 29)), chunk('IDAT', Buffer.from('not zlib')), chunk('IEND', Buffer.alloc(0))]);
  assert.throws(() => parseSignatureDataUrl(dataUrl(junk)), SignatureError);
});

test('pdfText keeps French text and replaces what Helvetica cannot draw', () => {
  assert.equal(pdfText('é è à œ € ç « » Œ'), 'é è à œ € ç « » Œ');
  assert.equal(pdfText('a\r\nb\u0000c'), 'a\nbc');
  assert.equal(pdfText('日本 Привет 😀'), '?? ?????? ?');
  assert.equal(pdfText('e\u0301'), 'é');
  assert.equal(pdfText(null), '');
});

test('formatMinutes', () => {
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatMinutes(125), '2 h 05 min');
  assert.equal(formatMinutes(null), '');
});

test('buildServiceReportPdf returns a valid PDF buffer, signed or not', async () => {
  const base = {
    company: 'TechIBase',
    workOrder: { id: 7, title: 'Révision é à ü', description: 'x'.repeat(3000), equipment_name: 'Pompe', assigned_to_name: 'Jean', due_date: '2026-11-01' },
    client: { name: 'Acme', address: '1 rue', phone: '0102', contract_number: 'C-1' },
    report: { work_done: 'Remplacement joint\nTest', parts_used: 'Joint', time_spent_minutes: 90, observations: 'RAS', signer_name: 'Mme Client', signed_at: new Date() },
  };
  const signed = await buildServiceReportPdf({ ...base, signature: makePng(40, 20) });
  assert.equal(signed.subarray(0, 5).toString(), '%PDF-');
  assert.ok(signed.subarray(-10).toString().includes('%%EOF'));
  const unsigned = await buildServiceReportPdf({ ...base, signature: null });
  assert.equal(unsigned.subarray(0, 5).toString(), '%PDF-');
});

test('buildServiceReportPdf copes with a very long report and an absurd company name', async () => {
  const pdf = await buildServiceReportPdf({
    company: 'Société '.repeat(40),
    workOrder: { id: 1, title: '日本語 😀 titre', description: null },
    client: { name: 'Acme' },
    report: { work_done: 'ligne é\n'.repeat(900), observations: 'x'.repeat(9000), signer_name: 'M', signed_at: new Date() },
    signature: makePng(40, 20),
  });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 3);
});

let testDb;
let woId;

test.before(async () => {
  if (skipWithoutPg.skip) return;
  testDb = await createTestDb();
  app.locals.db = testDb.pool;
  const p = testDb.pool;
  for (const id of [1, 2, 3]) {
    await p.query('INSERT INTO users (id, email, name, role) VALUES ($1,$2,$3,$4)', [id, `u${id}@x.fr`, `U${id}`, id === 3 ? 'admin' : 'user']);
  }
  const clientId = (await p.query("INSERT INTO clients (name, address) VALUES ('Acme','1 rue') RETURNING id")).rows[0].id;
  woId = (await p.query("INSERT INTO work_orders (client_id, title, assigned_to, created_by) VALUES ($1,'Révision',1,3) RETURNING id", [clientId])).rows[0].id;
});

test.after(async () => {
  if (testDb) await testDb.drop();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

const url = (id, suffix = '') => `/api/work-orders/${id}/service-report${suffix}`;

test("only the assignee, the creator and admins can reach a work order's report", skipWithoutPg, async () => {
  assert.equal((await request(app).get(url(woId))).status, 401);
  assert.equal((await request(app).get(url(woId)).set(tokenFor(2))).status, 403);
  assert.equal((await request(app).put(url(woId)).set(tokenFor(2)).send({ work_done: 'x' })).status, 403);
  assert.equal((await request(app).get(url(woId, '/pdf')).set(tokenFor(2))).status, 403);
  assert.equal((await request(app).get(url(woId)).set(tokenFor(1))).status, 200);
  assert.equal((await request(app).get(url(woId)).set(tokenFor(3, 'admin'))).status, 200);
  assert.equal((await request(app).get(url(99999)).set(tokenFor(3, 'admin'))).status, 404);
});

test('create, sign, download and attach a report', skipWithoutPg, async () => {
  const t = tokenFor(1);
  assert.equal((await request(app).get(url(woId)).set(t)).body, null);
  assert.equal((await request(app).get(url(woId, '/pdf')).set(t)).status, 404);

  const saved = await request(app).put(url(woId)).set(t).send({ work_done: 'Joint remplacé', parts_used: 'Joint', time_spent_minutes: 90, observations: 'RAS' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.has_signature, false);
  assert.equal(saved.body.signature, undefined);

  assert.equal((await request(app).post(url(woId, '/attach')).set(t)).status, 400); // unsigned

  assert.equal((await request(app).put(url(woId)).set(t).send({ work_done: 'a', signature: PNG_URL })).status, 400); // no signer
  const html = 'data:image/png;base64,' + Buffer.from('<html>').toString('base64');
  assert.equal((await request(app).put(url(woId)).set(t).send({ work_done: 'a', signer_name: 'M', signature: html })).status, 400);
  assert.equal((await request(app).put(url(woId)).set(t).send({ work_done: 'a', signer_name: 'M', signature: dataUrl(makePng(5000, 5)) })).status, 400);
  assert.equal((await request(app).put(url(woId)).set(t).send({ time_spent_minutes: -3 })).status, 400);

  const signed = await request(app).put(url(woId)).set(t).send({ work_done: 'Joint remplacé', time_spent_minutes: 90, signer_name: 'Mme Client', signature: PNG_URL });
  assert.equal(signed.status, 200);
  assert.equal(signed.body.has_signature, true);
  assert.ok(signed.body.signed_at);

  const sig = await request(app).get(url(woId, '/signature')).set(t).buffer(true).parse(binary);
  assert.equal(sig.status, 200);
  assert.equal(sig.headers['content-type'], 'image/png');
  assert.equal(sig.body[1], 0x50);

  const pdf = await request(app).get(url(woId, '/pdf')).set(t).buffer(true).parse(binary);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');

  const att = await request(app).post(url(woId, '/attach')).set(t);
  assert.equal(att.status, 201);
  assert.equal(att.body.mimetype, 'application/pdf');
  const firstFile = path.join(uploadsDir, att.body.filename);
  assert.equal(fs.readFileSync(firstFile).subarray(0, 5).toString(), '%PDF-');
  const dl = await request(app).get(`/api/clients/${att.body.client_id}/documents/${att.body.id}/download`).set(t);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers['content-type'], 'application/pdf');

  const again = await request(app).post(url(woId, '/attach')).set(t);
  assert.equal(again.status, 201);
  assert.equal(fs.existsSync(firstFile), false);
  const docs = await testDb.pool.query('SELECT id FROM documents WHERE client_id = $1', [att.body.client_id]);
  assert.equal(docs.rows.length, 1);

  const edited = await request(app).put(url(woId)).set(t).send({ work_done: 'Modifié' });
  assert.equal(edited.body.has_signature, false);
  assert.equal((await request(app).get(url(woId, '/signature')).set(t)).status, 404);
});

test('concurrent attaches keep exactly one document and leave no orphan file', skipWithoutPg, async () => {
  const t = tokenFor(1);
  const clientId = (await testDb.pool.query("INSERT INTO clients (name) VALUES ('Beta') RETURNING id")).rows[0].id;
  const id = (await testDb.pool.query("INSERT INTO work_orders (client_id, title, assigned_to, created_by) VALUES ($1,'T',1,3) RETURNING id", [clientId])).rows[0].id;
  await request(app).put(url(id)).set(t).send({ work_done: 'ok', signer_name: 'M', signature: PNG_URL });

  const results = await Promise.all([1, 2, 3, 4].map(() => request(app).post(url(id, '/attach')).set(t)));
  assert.ok(results.every(r => r.status === 201));
  const docs = await testDb.pool.query('SELECT id, filename FROM documents WHERE client_id = $1', [clientId]);
  assert.equal(docs.rows.length, 1);
  const link = await testDb.pool.query('SELECT document_id FROM service_reports WHERE work_order_id = $1', [id]);
  assert.equal(link.rows[0].document_id, docs.rows[0].id);
  const onDisk = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));
  assert.ok(onDisk.includes(docs.rows[0].filename));
  // every other generated PDF was cleaned up (only the first test's attachment remains besides this one)
  const known = (await testDb.pool.query('SELECT filename FROM documents')).rows.map(r => r.filename);
  assert.deepEqual(onDisk.filter(f => !known.includes(f)), []);
});
