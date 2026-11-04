// Pure helpers for the service-report form.

// "1h30", "1 h 30", "1:30", "90", "90 min", "1,5h" -> minutes (integer), or
// null when empty / not understood. A bare number is read as minutes.
export function parseDuration(input) {
  const s = String(input ?? '').trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  let m = /^(\d+(?:\.\d+)?)\s*h(?:\s*(\d{1,2}))?\s*(?:min|m)?$/.exec(s);
  if (m) return Math.round(parseFloat(m[1]) * 60 + (m[2] ? parseInt(m[2], 10) : 0));
  m = /^(\d+):(\d{1,2})$/.exec(s);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = /^(\d+)\s*(?:min|m)?$/.exec(s);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || minutes === '') return '';
  const n = Number(minutes);
  if (!Number.isFinite(n) || n < 0) return '';
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

// The server caps a signature at 64 kB of PNG. Canvas exports for a pad of
// this size are far below that, but check before sending to give a clear message.
export const SIGNATURE_MAX_BYTES = 64 * 1024;
export function signatureDataUrlBytes(dataUrl) {
  const b64 = String(dataUrl ?? '').split(',')[1] || '';
  const padding = (b64.match(/=+$/) || [''])[0].length;
  return Math.floor((b64.length * 3) / 4) - padding;
}
