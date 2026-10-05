import { localDate, localTime, zonedDayRange, zonedToUtc } from './time';

describe('time helpers', () => {
  const tz = 'Asia/Ho_Chi_Minh';

  it('converts Vietnam wall-clock time to UTC', () => {
    expect(zonedToUtc('2026-10-05 07:02:11', tz).toISOString()).toBe('2026-10-05T00:02:11.000Z');
  });

  it('computes the local day range', () => {
    const { start, end } = zonedDayRange('2026-10-05', tz);
    expect(start.toISOString()).toBe('2026-10-04T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-05T17:00:00.000Z');
  });

  it('formats local date and time', () => {
    const d = new Date('2026-10-04T23:30:00Z');
    expect(localDate(d, tz)).toBe('2026-10-05');
    expect(localTime(d, tz)).toBe('06:30');
  });

  it('rejects malformed input', () => {
    expect(() => zonedToUtc('05/10/2026', tz)).toThrow();
  });
});
