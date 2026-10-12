const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sniffMime,
  resolveStoredMimetype,
  isInlineSafe,
  contentDisposition,
} = require('../src/lib/fileTypes');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = Buffer.from('%PDF-1.7\n');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const GIF = Buffer.from('GIF89a');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

test('sniffMime recognises each inline-safe binary signature', () => {
  assert.equal(sniffMime(PNG), 'image/png');
  assert.equal(sniffMime(PDF), 'application/pdf');
  assert.equal(sniffMime(JPEG), 'image/jpeg');
  assert.equal(sniffMime(GIF), 'image/gif');
  assert.equal(sniffMime(WEBP), 'image/webp');
});

test('sniffMime returns null for anything else, including HTML and tiny buffers', () => {
  assert.equal(sniffMime(HTML), null);
  assert.equal(sniffMime(Buffer.from([0x25])), null);
  assert.equal(sniffMime(null), null);
});

test('a declared inline-safe type is kept only when the signature agrees', () => {
  assert.equal(resolveStoredMimetype('image/png', PNG), 'image/png');
  assert.equal(resolveStoredMimetype('application/pdf', PDF), 'application/pdf');
  // HTML renamed to .png, or a PNG claiming to be a PDF, is downgraded.
  assert.equal(resolveStoredMimetype('image/png', HTML), 'application/octet-stream');
  assert.equal(resolveStoredMimetype('application/pdf', PNG), 'application/octet-stream');
});

test('declared type is normalised (case, parameters) and a missing one falls back', () => {
  assert.equal(resolveStoredMimetype('IMAGE/PNG; charset=binary', PNG), 'image/png');
  assert.equal(resolveStoredMimetype('', PNG), 'application/octet-stream');
  assert.equal(resolveStoredMimetype(undefined, PNG), 'application/octet-stream');
});

test('text/plain has no signature and is kept; other types are stored but never inline', () => {
  assert.equal(resolveStoredMimetype('text/plain', Buffer.from('hello')), 'text/plain');
  assert.equal(resolveStoredMimetype('text/html', HTML), 'text/html');
  assert.equal(isInlineSafe('text/plain'), true);
  assert.equal(isInlineSafe('text/html'), false);
  assert.equal(isInlineSafe('image/svg+xml'), false);
  assert.equal(isInlineSafe('application/octet-stream'), false);
  assert.equal(isInlineSafe(undefined), false);
});

test('contentDisposition emits an ASCII fallback and an RFC 5987 UTF-8 name', () => {
  assert.equal(
    contentDisposition('attachment', 'rapport été.pdf'),
    `attachment; filename="rapport _t_.pdf"; filename*=UTF-8''rapport%20%C3%A9t%C3%A9.pdf`
  );
});

test('contentDisposition cannot be broken out of with quotes or line breaks', () => {
  const value = contentDisposition('inline', 'a"; evil=1\r\nX-Injected: yes.pdf');
  assert.ok(!/[\r\n]/.test(value));
  assert.equal(value.split('"').length, 3); // exactly one quoted string
});
