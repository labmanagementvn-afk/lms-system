import { addDays, borrowBlockReason, canReserve, holdCheck, overdueDays, renewBlockReason } from './circulation';

describe('circulation rules', () => {
  const due = new Date('2026-10-10T03:00:00Z');

  it('counts started overdue days', () => {
    expect(overdueDays(due, new Date('2026-10-09T03:00:00Z'))).toBe(0);
    expect(overdueDays(due, due)).toBe(0);
    expect(overdueDays(due, new Date('2026-10-10T04:00:00Z'))).toBe(1);
    expect(overdueDays(due, new Date('2026-10-13T03:00:00Z'))).toBe(3);
    expect(addDays(due, 14).toISOString()).toBe('2026-10-24T03:00:00.000Z');
  });

  it('limits students and blocks borrowers with overdue books', () => {
    expect(borrowBlockReason({ isStudent: true, activeLoans: 2, hasOverdue: false })).toBeNull();
    expect(borrowBlockReason({ isStudent: true, activeLoans: 3, hasOverdue: false })).toMatch(/tối đa 3/);
    expect(borrowBlockReason({ isStudent: false, activeLoans: 10, hasOverdue: false })).toBeNull();
    expect(borrowBlockReason({ isStudent: false, activeLoans: 0, hasOverdue: true })).toMatch(/quá hạn/);
  });

  it('holds available copies for the earliest reservations', () => {
    expect(holdCheck([], 1, 'a')).toEqual({ allowed: true, fulfils: -1 });
    expect(holdCheck(['a', 'b'], 1, 'a')).toEqual({ allowed: true, fulfils: 0 });
    expect(holdCheck(['a', 'b'], 1, 'b')).toEqual({ allowed: false, fulfils: -1 });
    expect(holdCheck(['a', 'b'], 1)).toEqual({ allowed: false, fulfils: -1 });
    expect(holdCheck(['a', 'b'], 2, 'b')).toEqual({ allowed: true, fulfils: 1 });
    expect(holdCheck(['a'], 2, 'c')).toEqual({ allowed: true, fulfils: -1 });
    expect(canReserve(0, 0)).toBe(true);
    expect(canReserve(1, 0)).toBe(false);
    expect(canReserve(1, 1)).toBe(true);
  });

  it('renews only fresh, unreserved loans a limited number of times', () => {
    const now = new Date('2026-10-05T00:00:00Z');
    const loan = { dueAt: due, renewCount: 0, returnedAt: null };
    expect(renewBlockReason(loan, false, now)).toBeNull();
    expect(renewBlockReason({ ...loan, renewCount: 2 }, false, now)).toMatch(/tối đa 2/);
    expect(renewBlockReason(loan, true, now)).toMatch(/đặt trước/);
    expect(renewBlockReason(loan, false, new Date('2026-10-12T00:00:00Z'))).toMatch(/quá hạn/);
    expect(renewBlockReason({ ...loan, returnedAt: now }, false, now)).toMatch(/kết thúc/);
  });
});
