// Pure helpers for the school health module.

/** BMI = kg / m², one decimal; null unless both measurements are present. No adult category: children need WHO percentiles. */
export function bmi(heightCm?: number | null, weightKg?: number | null): number | null {
  if (!heightCm || !weightKg) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** BHYT card numbers are 10 (mã số BHXH) or 15 (old card format) letters/digits. */
export const INSURANCE_NUMBER = /^(?:[A-Z0-9]{10}|[A-Z0-9]{15})$/i;

/** Whole days from `now` until `date` (negative once expired), comparing calendar dates in UTC. */
export function daysUntil(date: Date, now = new Date()): number {
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((day(date) - day(now)) / 86_400_000);
}
