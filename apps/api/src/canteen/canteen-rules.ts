// Pure date rules for meal registration. Dates are school-local calendar days (YYYY-MM-DD).
import { zonedToUtc } from '../common/time';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidDate(s: string): boolean {
  return DATE.test(s) && !isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
}

/** Registrations for `date` are locked once school-local time reaches `${date} ${cutoff}`. */
export function isLocked(date: string, cutoff: string, timeZone: string, now = new Date()): boolean {
  return now.getTime() >= zonedToUtc(`${date} ${cutoff}`, timeZone).getTime();
}

/** [from, to) of a month "YYYY-MM" as @db.Date values (UTC midnights). */
export function monthRange(month: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m || +m[2] < 1 || +m[2] > 12) throw new Error(`Invalid month: ${month}`);
  return { from: new Date(Date.UTC(+m[1], +m[2] - 1, 1)), to: new Date(Date.UTC(+m[1], +m[2], 1)) };
}

/** @db.Date value for a calendar date, and back. */
export const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);
