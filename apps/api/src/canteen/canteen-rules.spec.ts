import { fromDbDate, isLocked, isValidDate, monthRange, toDbDate } from './canteen-rules';

describe('canteen rules', () => {
  const tz = 'Asia/Ho_Chi_Minh';

  it('validates calendar dates', () => {
    expect(isValidDate('2026-10-05')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('05/10/2026')).toBe(false);
  });

  it('locks a day at the school-local cutoff', () => {
    // 08:30 in Vietnam is 01:30 UTC.
    expect(isLocked('2026-10-05', '08:30', tz, new Date('2026-10-05T01:29:00Z'))).toBe(false);
    expect(isLocked('2026-10-05', '08:30', tz, new Date('2026-10-05T01:30:00Z'))).toBe(true);
    expect(isLocked('2026-10-06', '08:30', tz, new Date('2026-10-05T10:00:00Z'))).toBe(false);
    expect(isLocked('2026-10-04', '08:30', tz, new Date('2026-10-05T00:00:00Z'))).toBe(true);
  });

  it('computes month ranges', () => {
    const { from, to } = monthRange('2026-12');
    expect(from.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(() => monthRange('2026-13')).toThrow();
  });

  it('round-trips db dates', () => {
    expect(fromDbDate(toDbDate('2026-10-05'))).toBe('2026-10-05');
  });
});
