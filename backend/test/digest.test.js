const test = require('node:test');
const assert = require('node:assert/strict');
const { skipWithoutPg, createTestDb } = require('./helpers/pg');
const { sendAdminDigest } = require('../src/lib/digest');

let testDb;
let db;
let sent;
const realFetch = global.fetch;

test.before(async () => {
  if (skipWithoutPg.skip) return;
  testDb = await createTestDb();
  db = testDb.pool;
});

test.after(async () => {
  global.fetch = realFetch;
  delete process.env.RESEND_API_KEY;
  if (testDb) await testDb.drop();
});

test.beforeEach(async () => {
  if (!db) return;
  await db.query('TRUNCATE users, clients RESTART IDENTITY CASCADE');
  // Capture what would be sent to Resend instead of calling it.
  sent = [];
  global.fetch = async (url, options) => {
    sent.push({ url, body: JSON.parse(options.body) });
    return { ok: true, text: async () => '' };
  };
  process.env.RESEND_API_KEY = 're_test_key';
});

async function seed({ overdue = true, lowStock = true } = {}) {
  await db.query("INSERT INTO users (email, name, role) VALUES ('a@x.com','A','admin'), ('b@x.com','B','admin'), ('t@x.com','T','user')");
  const { id } = (await db.query("INSERT INTO clients (name) VALUES ('Dupont & Fils <Inc>') RETURNING id")).rows[0];
  if (overdue) await db.query("INSERT INTO equipment (client_id, name, next_maintenance) VALUES ($1, 'Pompe <b>1</b>', CURRENT_DATE - 3)", [id]);
  if (lowStock) await db.query("INSERT INTO epi (client_id, name, quantity) VALUES ($1, 'Gants', 1)", [id]);
}

test('emails every admin — and only admins — one digest', skipWithoutPg, async () => {
  await seed();
  await sendAdminDigest(db);

  assert.deepEqual(sent.map(s => s.body.to).sort(), ['a@x.com', 'b@x.com']);
  assert.equal(sent[0].url, 'https://api.resend.com/emails');
  assert.equal(sent[0].body.subject, 'TechIBase — résumé quotidien');
  assert.match(sent[0].body.html, /Maintenance en retard \(1\)/);
  assert.match(sent[0].body.html, /EPI en stock faible \(1\)/);
});

test('escapes names and shows the overdue date as DD/MM/YYYY', skipWithoutPg, async () => {
  await seed();
  await sendAdminDigest(db);

  const { html } = sent[0].body;
  assert.ok(html.includes('Pompe &lt;b&gt;1&lt;/b&gt; (Dupont &amp; Fils &lt;Inc&gt;)'), html);
  assert.ok(!html.includes('<b>1</b>'));
  const due = (await db.query("SELECT to_char(CURRENT_DATE - 3, 'DD/MM/YYYY') AS d")).rows[0].d;
  assert.ok(html.includes(`échue le ${due}`), html);
  assert.ok(!/GMT|00:00:00/.test(html), 'no JavaScript Date string');
});

test('sends nothing when there is nothing to report', skipWithoutPg, async () => {
  await seed({ overdue: false, lowStock: false });
  await sendAdminDigest(db);
  assert.equal(sent.length, 0);
});

test('reports only the sections that have content', skipWithoutPg, async () => {
  await seed({ overdue: false });
  await sendAdminDigest(db);
  assert.ok(!/Maintenance en retard/.test(sent[0].body.html));
  assert.match(sent[0].body.html, /EPI en stock faible \(1\)/);
});

test('is a no-op without RESEND_API_KEY (email is opt-in)', skipWithoutPg, async () => {
  await seed();
  delete process.env.RESEND_API_KEY;
  await sendAdminDigest(db);
  assert.equal(sent.length, 0);
});
