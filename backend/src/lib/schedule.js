// Parses "HH:MM" (24 h) into numbers, or throws a readable error.
function parseTime(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value).trim());
  if (!match) throw new Error(`Invalid time "${value}" — expected HH:MM (24 h), e.g. 06:00`);
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

// Milliseconds from `now` until the next occurrence of HH:MM in the process's
// local time zone (set the container's TZ to choose it). Always strictly in
// the future, so a run that finishes inside its own minute schedules tomorrow,
// and built from calendar fields so daylight-saving changes don't skew it.
function msUntilNext(now, time) {
  const { hours, minutes } = parseTime(time);
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

module.exports = { parseTime, msUntilNext };
