// Calendar dates (equipment maintenance dates, EPI expiry, work-order due dates)
// are not instants. The API returns them as "YYYY-MM-DD" strings, and they must
// be formatted without going through `Date`: a date-only ISO string is parsed
// as UTC midnight, so `new Date("2026-10-12")` is still October 11th on the
// evening clock of anyone west of UTC (Québec included).
//
// Timestamps (created_at, entry_date…) ARE instants and keep using Date.
export function formatDate(value) {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  // Anything unrecognised is shown as-is rather than silently hidden.
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}
