// Pure calendar helpers for homeroom attendance and the lesson logbook.
// Dates are school-local calendar days in YYYY-MM-DD form; @db.Date columns hold them as UTC midnights.
export { fromDbDate, isValidDate, monthRange, toDbDate } from '../canteen/canteen-rules';

/** ISO weekday of a calendar date: 1 = Monday ... 7 = Sunday (same convention as TimetableEntry.dayOfWeek). */
export function dayOfWeek(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The calendar date `days` days after `date` (negative to go back). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Every calendar date from `from` to `to` inclusive (empty when `to` is before `from`). */
export function eachDay(from: string, to: string): string[] {
  const n = daysBetween(from, to);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

/** Monday of the week that contains `date`. */
export function mondayOf(date: string): string {
  return addDays(date, 1 - dayOfWeek(date));
}

/**
 * Semester of a school day. Vietnamese schools switch to semester 2 in mid January,
 * so days from 15 January of the year the academic year ends in are semester 2.
 */
export function semesterFor(date: string, year: { endDate: Date }): 1 | 2 {
  return date >= `${year.endDate.toISOString().slice(0, 4)}-01-15` ? 2 : 1;
}

/** "2026-10-05" -> "05/10/2026" */
export const dmy = (ymd: string) => ymd.split('-').reverse().join('/');
