import { daysUntil, rangesOverlap, toDay, workingDays } from './leave-days';

// 2027-03-01 is a Monday.
describe('leave days', () => {
  it('counts Monday to Friday inclusive', () => {
    expect(workingDays('2027-03-01', '2027-03-05')).toBe(5);
    expect(workingDays('2027-03-01', '2027-03-01')).toBe(1);
    expect(workingDays('2027-03-01', '2027-03-07')).toBe(5);
    expect(workingDays('2027-03-01', '2027-03-14')).toBe(10);
    expect(workingDays('2027-03-05', '2027-03-08')).toBe(2);
    expect(workingDays('2027-03-03', '2027-03-23')).toBe(15);
  });

  it('gives zero for weekends only or an inverted range', () => {
    expect(workingDays('2027-03-06', '2027-03-07')).toBe(0);
    expect(workingDays('2027-03-05', '2027-03-01')).toBe(0);
  });

  it('accepts Date objects and ISO timestamps', () => {
    expect(workingDays(new Date('2027-03-01'), new Date('2027-03-05'))).toBe(5);
    expect(workingDays('2027-03-01T10:00:00.000Z', '2027-03-05T23:00:00.000Z')).toBe(5);
    expect(toDay('2027-03-01T23:30:00.000Z').toISOString()).toBe('2027-03-01T00:00:00.000Z');
  });

  it('counts days until a date by calendar day', () => {
    expect(daysUntil('2026-10-25', '2026-10-05')).toBe(20);
    expect(daysUntil('2026-10-01', '2026-10-05T15:00:00Z')).toBe(-4);
    expect(daysUntil(new Date('2026-10-05'), '2026-10-05')).toBe(0);
  });

  it('detects overlapping inclusive ranges', () => {
    const d = (s: string) => new Date(s);
    expect(rangesOverlap(d('2027-03-01'), d('2027-03-05'), d('2027-03-05'), d('2027-03-08'))).toBe(true);
    expect(rangesOverlap(d('2027-03-01'), d('2027-03-05'), d('2027-03-06'), d('2027-03-08'))).toBe(false);
    expect(rangesOverlap(d('2027-03-03'), d('2027-03-03'), d('2027-03-01'), d('2027-03-05'))).toBe(true);
    expect(rangesOverlap(d('2027-03-10'), d('2027-03-12'), d('2027-03-01'), d('2027-03-09'))).toBe(false);
  });
});
