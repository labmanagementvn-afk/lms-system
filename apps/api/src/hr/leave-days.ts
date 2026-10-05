// Pure date helpers for the HR module. All dates are compared as UTC calendar days,
// which is how @db.Date columns come back from Prisma (UTC midnight).

const DAY_MS = 86_400_000;

/** UTC midnight of the calendar day of `d` (a Date or a YYYY-MM-DD / ISO string). */
export function toDay(d: Date | string): Date {
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Leave days between `from` and `to` inclusive, counting Monday to Friday only.
 * Returns 0 when `to` is before `from`.
 */
export function workingDays(from: Date | string, to: Date | string): number {
  const start = toDay(from);
  const end = toDay(to);
  if (end < start) return 0;
  const total = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const weeks = Math.floor(total / 7);
  let days = weeks * 5;
  // Walk the remainder (at most 6 days) so partial weeks count exactly.
  for (let i = weeks * 7; i < total; i++) {
    const dow = (start.getUTCDay() + i) % 7;
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

/** Whole days from `now` until `date` (negative once past), comparing calendar days. */
export function daysUntil(date: Date | string, now: Date | string = new Date()): number {
  return Math.round((toDay(date).getTime() - toDay(now).getTime()) / DAY_MS);
}

/** True when the inclusive ranges [aFrom, aTo] and [bFrom, bTo] share at least one day. */
export function rangesOverlap(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): boolean {
  return toDay(aFrom) <= toDay(bTo) && toDay(bFrom) <= toDay(aTo);
}
