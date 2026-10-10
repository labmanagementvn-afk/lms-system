import { DutyKind } from '@prisma/client';
import { defaultDuties, levelOf, schoolWeek, weeklyFromYearly, workload } from './workload';

const { POSITION, CONCURRENT, OTHER } = DutyKind;
const base = { teacherNorm: 19, homeroomReduction: 4, homeroomClasses: [] as string[], duties: [], assigned: 0 };

describe('levelOf', () => {
  it('reads the level from the grades taught', () => {
    expect(levelOf([1, 3, 5])).toBe('TH');
    expect(levelOf([6, 9])).toBe('THCS');
    expect(levelOf([10, 12])).toBe('THPT');
    expect(levelOf([])).toBe('THCS');
  });
});

describe('defaultDuties', () => {
  it('starts from the circular: positions with their own norm, duties that lower it', () => {
    const thcs = defaultDuties('THCS');
    const by = (code: string) => thcs.find((d) => d.code === code);
    expect(by('HT')).toMatchObject({ kind: POSITION, periods: 2 });
    expect(by('PHT')).toMatchObject({ kind: POSITION, periods: 4 });
    expect(by('TPTD')).toMatchObject({ kind: POSITION, periods: 6 });
    expect(by('TTCM')).toMatchObject({ kind: CONCURRENT, periods: 3 });
    expect(by('TPCM')).toMatchObject({ kind: CONCURRENT, periods: 1 });
    expect(by('TS')).toMatchObject({ kind: OTHER, periods: 2 });
    expect(new Set(thcs.map((d) => d.code)).size).toBe(thcs.length);
    expect(thcs.every((d) => d.basis.includes('Thông tư 05/2025/TT-BGDĐT'))).toBe(true);
    expect(defaultDuties('TH').find((d) => d.code === 'TPTD')?.periods).toBe(8);
    expect(defaultDuties('THPT').find((d) => d.code === 'TPTD')).toBeUndefined();
  });
});

describe('workload', () => {
  it('takes the homeroom class and the duties off the norm', () => {
    const w = workload({ ...base, homeroomClasses: ['6A1'], duties: [{ name: 'Tổ trưởng chuyên môn', kind: CONCURRENT, periods: 3 }], assigned: 12 });
    expect(w).toMatchObject({ position: null, norm: 19, reduced: 7, required: 12, assigned: 12, difference: 0, concurrent: 2, warnings: [] });
    expect(w.reductions).toEqual([
      { label: 'Chủ nhiệm lớp 6A1', periods: 4 },
      { label: 'Tổ trưởng chuyên môn', periods: 3 },
    ]);
  });

  it('uses the norm of a position', () => {
    const w = workload({ ...base, duties: [{ name: 'Hiệu trưởng', kind: POSITION, periods: 2 }], assigned: 2 });
    expect(w).toMatchObject({ position: 'Hiệu trưởng', norm: 2, required: 2, difference: 0, concurrent: 0 });
  });

  it('never asks for fewer than 0 periods', () => {
    const w = workload({ ...base, homeroomClasses: ['9A1'], duties: [{ name: 'Phó hiệu trưởng', kind: POSITION, periods: 4 }, { name: 'Bí thư chi bộ', kind: CONCURRENT, periods: 3 }], assigned: 0 });
    expect(w).toMatchObject({ norm: 4, reduced: 7, required: 0, difference: 0 });
  });

  it('flags a third concurrent duty, counting the homeroom class', () => {
    const duties = [
      { name: 'Tổ phó chuyên môn', kind: CONCURRENT, periods: 1 },
      { name: 'Phụ trách phòng học bộ môn', kind: CONCURRENT, periods: 3 },
      { name: 'Giáo viên tập sự', kind: OTHER, periods: 2 },
    ];
    const w = workload({ ...base, homeroomClasses: ['9A1'], duties, assigned: 9 });
    expect(w.concurrent).toBe(3);
    expect(w.required).toBe(9);
    expect(w.warnings).toEqual([expect.stringContaining('Kiêm nhiệm 3 nhiệm vụ')]);
  });

  it('flags overtime above half of the norm, and not at exactly half', () => {
    expect(workload({ ...base, assigned: 28.5 }).warnings).toEqual([]);
    const over = workload({ ...base, assigned: 29 });
    expect(over.difference).toBe(10);
    expect(over.warnings).toEqual([expect.stringContaining('Dạy vượt 10 tiết/tuần, quá 50% định mức 19 tiết')]);
  });

  it('keeps half periods exact', () => {
    const w = workload({ ...base, homeroomClasses: ['8A1'], assigned: 16.5 });
    expect(w).toMatchObject({ required: 15, difference: 1.5 });
  });
});

describe('weeklyFromYearly', () => {
  it('averages over 35 weeks to the nearest half period', () => {
    expect(weeklyFromYearly(140)).toBe(4);
    expect(weeklyFromYearly(105)).toBe(3);
    expect(weeklyFromYearly(52)).toBe(1.5);
    expect(weeklyFromYearly(35)).toBe(1);
  });
});

describe('schoolWeek', () => {
  it('counts from the week the year opens in, or the next one after a weekend opening', () => {
    // 2026-09-05 is a Saturday: week 1 starts on Monday 7 September.
    expect(schoolWeek('2026-09-07', '2026-09-05')).toBe(1);
    expect(schoolWeek('2026-09-13', '2026-09-05')).toBe(1);
    expect(schoolWeek('2026-10-10', '2026-09-05')).toBe(5);
    expect(schoolWeek('2026-09-05', '2026-09-05')).toBe(0);
    // A Friday opening counts its own week.
    expect(schoolWeek('2025-09-05', '2025-09-05')).toBe(1);
    expect(schoolWeek('2025-09-08', '2025-09-05')).toBe(2);
  });
});
