// Uploaded documents come from users, so the Content-Type they declare can't
// be trusted: an .html/.svg served inline from the app's own origin would run
// script with access to the session token. Only types that browsers render
// without executing anything are ever served inline, and for binary types the
// declared type must match the file's actual signature. Everything else is
// still accepted and stored — it's just always downloaded, never rendered.
const INLINE_SAFE = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
]);

const FALLBACK_MIMETYPE = 'application/octet-stream';

// Bytes needed by sniffMime() to recognise every signature below.
const SNIFF_BYTES = 12;

function startsWith(buf, bytes, offset = 0) {
  return bytes.every((b, i) => buf[offset + i] === b);
}

// Returns the type implied by the file's leading bytes, or null if it isn't
// one of the inline-safe binary formats (text/plain has no signature).
function sniffMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'; // %PDF
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'; // GIF8
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp'; // RIFF....WEBP
  }
  return null;
}

// The mimetype to persist for an upload. A declared inline-safe binary type is
// only kept if the signature agrees; a mismatch (e.g. HTML renamed to .png) is
// downgraded to octet-stream. Other declared types are kept as metadata but
// are never served inline (see isInlineSafe).
function resolveStoredMimetype(declared, head) {
  const type = (declared || '').split(';')[0].trim().toLowerCase();
  if (!type) return FALLBACK_MIMETYPE;
  if (type === 'text/plain') return type;
  if (INLINE_SAFE.has(type)) return sniffMime(head) === type ? type : FALLBACK_MIMETYPE;
  return type;
}

function isInlineSafe(mimetype) {
  return INLINE_SAFE.has((mimetype || '').split(';')[0].trim().toLowerCase());
}

// Content-Disposition value with an ASCII fallback plus the RFC 5987 UTF-8
// form, so non-ASCII filenames survive and a quote or CRLF in the name can't
// break out of the header.
function contentDisposition(disposition, filename) {
  const ascii = String(filename).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const utf8 = encodeURIComponent(String(filename)).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

module.exports = {
  INLINE_SAFE,
  FALLBACK_MIMETYPE,
  SNIFF_BYTES,
  sniffMime,
  resolveStoredMimetype,
  isInlineSafe,
  contentDisposition,
};
