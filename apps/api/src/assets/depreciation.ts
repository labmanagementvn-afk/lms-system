// Straight-line depreciation, computed per full month, for the assets module.
// Dates are compared as UTC calendar days (how @db.Date columns come back from Prisma).

function toDay(d: Date | string): Date {
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Full months elapsed from `purchaseDate` to `at`; never negative. */
export function monthsElapsed(purchaseDate: Date | string, at: Date | string): number {
  const p = toDay(purchaseDate);
  const a = toDay(at);
  let months = (a.getUTCFullYear() - p.getUTCFullYear()) * 12 + (a.getUTCMonth() - p.getUTCMonth());
  if (a.getUTCDate() < p.getUTCDate()) months--;
  return Math.max(0, months);
}

/**
 * Book value (giá trị còn lại) at `at`: purchase price minus one month of straight-line
 * depreciation per full month since purchase, floored at 0 and rounded to whole VND.
 * A useful life of 0 or less means the asset is not depreciated (e.g. land).
 */
export function bookValue(purchasePrice: number, purchaseDate: Date | string, usefulLifeYears: number, at: Date | string = new Date()): number {
  if (!(usefulLifeYears > 0)) return purchasePrice;
  const totalMonths = usefulLifeYears * 12;
  const used = Math.min(totalMonths, monthsElapsed(purchaseDate, at));
  return Math.max(0, Math.round(purchasePrice * (1 - used / totalMonths)));
}

export interface ScheduleRow {
  year: number;
  /** Depreciation booked in this calendar year (VND). */
  depreciation: number;
  /** Book value at 31 December of this year (VND). */
  bookValueEnd: number;
}

/** Per-calendar-year depreciation from the purchase year until the book value reaches 0. */
export function schedule(purchasePrice: number, purchaseDate: Date | string, usefulLifeYears: number): ScheduleRow[] {
  if (!(usefulLifeYears > 0) || !(purchasePrice > 0)) return [];
  const rows: ScheduleRow[] = [];
  let previous = purchasePrice;
  // Months are counted up to 1 January of the next year, i.e. through 31 December.
  for (let year = toDay(purchaseDate).getUTCFullYear(); rows.length <= usefulLifeYears + 1; year++) {
    const end = bookValue(purchasePrice, purchaseDate, usefulLifeYears, new Date(Date.UTC(year + 1, 0, 1)));
    rows.push({ year, depreciation: previous - end, bookValueEnd: end });
    previous = end;
    if (end <= 0) break;
  }
  return rows;
}
