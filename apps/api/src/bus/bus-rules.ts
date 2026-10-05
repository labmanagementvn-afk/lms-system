// Pure date rules for the bus module. Calendar dates are school-local YYYY-MM-DD strings
// stored in @db.Date columns as UTC midnight.

export const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Paperwork (inspection, insurance, licence) is flagged this many days before it lapses. */
export const EXPIRY_WARNING_DAYS = 30;

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidDate(s: string): boolean {
  return YMD.test(s) && !isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
}

/** @db.Date value for a calendar date, and back. */
export const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const fromDbDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Whole days from `today` (YYYY-MM-DD) until a @db.Date value; negative once past, null when unset. */
export function daysLeft(date: Date | null | undefined, today: string): number | null {
  if (!date) return null;
  return Math.round((toDbDate(fromDbDate(date)!).getTime() - toDbDate(today).getTime()) / 86_400_000);
}

/** Expired or lapsing within the warning window. */
export const isExpiring = (days: number | null) => days !== null && days <= EXPIRY_WARNING_DAYS;
