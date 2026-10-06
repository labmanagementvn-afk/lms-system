import { AlertKind } from '@prisma/client';
import { evaluateRule, isSchoolDay, lateRate, schoolDaysEndingAt } from './alert-rules';

const stat = { students: 200, present: 170, late: 25, absent: 30, attendanceRate: 85, overdueAmount: 25_000_000n, healthIncidents: 3 };

describe('alert rules', () => {
  it('fires attendance-below only with gate data', () => {
    const r = evaluateRule({ kind: AlertKind.ATTENDANCE_RATE_BELOW, threshold: 90 }, stat);
    expect(r.fired).toBe(true);
    expect(r.value).toBe(85);
    expect(r.message).toContain('85,0%');
    expect(evaluateRule({ kind: AlertKind.ATTENDANCE_RATE_BELOW, threshold: 80 }, stat).fired).toBe(false);
    // A school without a gate terminal reports 0 present every day; that is not an alert.
    expect(evaluateRule({ kind: AlertKind.ATTENDANCE_RATE_BELOW, threshold: 90 }, { ...stat, present: 0, attendanceRate: 0 }).fired).toBe(false);
    expect(evaluateRule({ kind: AlertKind.ATTENDANCE_RATE_BELOW, threshold: 90 }, { ...stat, students: 0 }).fired).toBe(false);
  });

  it('computes the late rate', () => {
    expect(lateRate(stat)).toBe(12.5);
    expect(lateRate({ students: 0, late: 0 })).toBe(0);
    expect(evaluateRule({ kind: AlertKind.LATE_RATE_ABOVE, threshold: 10 }, stat)).toMatchObject({ fired: true, value: 12.5 });
    expect(evaluateRule({ kind: AlertKind.LATE_RATE_ABOVE, threshold: 12.5 }, stat).fired).toBe(false);
  });

  it('compares money and counts', () => {
    const fees = evaluateRule({ kind: AlertKind.OVERDUE_FEES_ABOVE, threshold: 20_000_000 }, stat);
    expect(fees.fired).toBe(true);
    expect(fees.value).toBe(25_000_000);
    expect(fees.message).toContain('25.000.000 ₫');
    expect(evaluateRule({ kind: AlertKind.OVERDUE_FEES_ABOVE, threshold: 25_000_000 }, stat).fired).toBe(false);
    expect(evaluateRule({ kind: AlertKind.HEALTH_INCIDENTS_ABOVE, threshold: 2 }, stat)).toMatchObject({ fired: true, value: 3 });
    expect(evaluateRule({ kind: AlertKind.HEALTH_INCIDENTS_ABOVE, threshold: 3 }, stat).fired).toBe(false);
  });

  it('lists the first five streak students', () => {
    const students = Array.from({ length: 7 }, (_, i) => ({ code: `HS${i}`, fullName: `Học sinh ${i}` }));
    const r = evaluateRule({ kind: AlertKind.ABSENT_STREAK, threshold: 3 }, stat, { absentStreak: students });
    expect(r).toMatchObject({ fired: true, value: 7 });
    expect(r.message).toContain('Học sinh 4 (HS4)');
    expect(r.message).toContain('và 2 học sinh khác');
    expect(r.message).not.toContain('HS5');
    expect(evaluateRule({ kind: AlertKind.ABSENT_STREAK, threshold: 3 }, stat).fired).toBe(false);
  });

  it('skips Sundays when counting school days', () => {
    // 2026-10-05 is a Monday.
    expect(schoolDaysEndingAt('2026-10-05', 3)).toEqual(['2026-10-02', '2026-10-03', '2026-10-05']);
    expect(schoolDaysEndingAt('2026-10-04', 1)).toEqual(['2026-10-03']);
    expect(isSchoolDay('2026-10-04')).toBe(false);
    expect(isSchoolDay('2026-10-03')).toBe(true);
  });
});
