// Helpers for working with "school local" time without a timezone library.

function partsIn(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return parts;
}

/** Offset of `timeZone` from UTC at `date`, in minutes (e.g. +420 for Asia/Ho_Chi_Minh). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Interprets a wall-clock time such as "2026-10-05 07:02:11" in `timeZone`. */
export function zonedToUtc(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) throw new Error(`Invalid local datetime: ${local}`);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const offset = tzOffsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60000);
}

/** UTC [start, end) of the local calendar day `date` (YYYY-MM-DD) in `timeZone`. */
export function zonedDayRange(date: string, timeZone: string): { start: Date; end: Date } {
  const start = zonedToUtc(`${date} 00:00:00`, timeZone);
  const [y, mo, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
  const end = zonedToUtc(`${next} 00:00:00`, timeZone);
  return { start, end };
}

/** Local "HH:mm" of an instant in `timeZone`. */
export function localTime(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Local "YYYY-MM-DD" of an instant in `timeZone`. */
export function localDate(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}
