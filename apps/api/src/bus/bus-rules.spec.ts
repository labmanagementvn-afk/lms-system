import { daysLeft, fromDbDate, isExpiring, isValidDate, toDbDate } from './bus-rules';

describe('bus date rules', () => {
  it('validates calendar dates', () => {
    expect(isValidDate('2026-10-05')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('05/10/2026')).toBe(false);
  });

  it('round-trips @db.Date values as UTC midnight', () => {
    expect(toDbDate('2026-10-05').toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(fromDbDate(toDbDate('2026-10-05'))).toBe('2026-10-05');
    expect(fromDbDate(null)).toBeNull();
  });

  it('counts days left and flags the warning window', () => {
    expect(daysLeft(toDbDate('2026-11-04'), '2026-10-05')).toBe(30);
    expect(daysLeft(toDbDate('2026-10-01'), '2026-10-05')).toBe(-4);
    expect(daysLeft(null, '2026-10-05')).toBeNull();
    expect(isExpiring(30)).toBe(true);
    expect(isExpiring(-4)).toBe(true);
    expect(isExpiring(31)).toBe(false);
    expect(isExpiring(null)).toBe(false);
  });
});
