import { ConductStatus, ResultLevel } from '@prisma/client';
import {
  activePoints,
  approvedNotification,
  canApprove,
  canReopen,
  canReview,
  canSelfAssess,
  computeTotal,
  ConductRuleError,
  DEFAULT_CRITERIA,
  LEVEL_THRESHOLDS,
  levelFor,
  validateItems,
} from './conduct-rules';

const criteria = [
  { id: 'a', maxPoints: 10 },
  { id: 'b', maxPoints: 15 },
  { id: 'c', maxPoints: 5, isActive: false },
];

describe('conduct rules', () => {
  it('maps totals to levels at the exported thresholds', () => {
    expect(LEVEL_THRESHOLDS).toEqual({ TOT: 90, KHA: 70, DAT: 50 });
    expect(levelFor(100)).toBe(ResultLevel.TOT);
    expect(levelFor(90)).toBe(ResultLevel.TOT);
    expect(levelFor(89)).toBe(ResultLevel.KHA);
    expect(levelFor(70)).toBe(ResultLevel.KHA);
    expect(levelFor(69)).toBe(ResultLevel.DAT);
    expect(levelFor(50)).toBe(ResultLevel.DAT);
    expect(levelFor(49)).toBe(ResultLevel.CHUA_DAT);
    expect(levelFor(0)).toBe(ResultLevel.CHUA_DAT);
  });

  it('sums active criteria, caps at the maximum and counts missing items as 0', () => {
    expect(computeTotal([{ criterionId: 'a', points: 8 }, { criterionId: 'b', points: 15 }], criteria)).toBe(23);
    expect(computeTotal([{ criterionId: 'a', points: 50 }], criteria)).toBe(10);
    expect(computeTotal([{ criterionId: 'a', points: null }], criteria)).toBe(0);
    expect(computeTotal([], criteria)).toBe(0);
    // Inactive criteria and unknown ids never count.
    expect(computeTotal([{ criterionId: 'c', points: 5 }, { criterionId: 'zzz', points: 5 }], criteria)).toBe(0);
  });

  it('rejects negative points', () => {
    expect(() => computeTotal([{ criterionId: 'a', points: -1 }], criteria)).toThrow(ConductRuleError);
  });

  it('validates items against the active criteria', () => {
    expect(() => validateItems([{ criterionId: 'a', points: 10 }, { criterionId: 'b', points: 0 }], criteria)).not.toThrow();
    expect(() => validateItems([{ criterionId: 'a', points: 11 }], criteria)).toThrow('tối đa 10');
    expect(() => validateItems([{ criterionId: 'a', points: -1 }], criteria)).toThrow(ConductRuleError);
    expect(() => validateItems([{ criterionId: 'a', points: 2.5 }], criteria)).toThrow(ConductRuleError);
    expect(() => validateItems([{ criterionId: 'c', points: 1 }], criteria)).toThrow('không còn áp dụng');
    expect(() => validateItems([{ criterionId: 'nope', points: 1 }], criteria)).toThrow(ConductRuleError);
  });

  it('ships default criteria in four groups adding to 100 points', () => {
    expect(activePoints(DEFAULT_CRITERIA)).toBe(100);
    const groups = new Map<string, number>();
    for (const c of DEFAULT_CRITERIA) groups.set(c.groupName, (groups.get(c.groupName) ?? 0) + c.maxPoints);
    expect([...groups.entries()]).toEqual([
      ['Ý thức học tập', 30],
      ['Chấp hành nội quy', 30],
      ['Hoạt động tập thể', 20],
      ['Quan hệ, ứng xử', 20],
    ]);
    expect(new Set(DEFAULT_CRITERIA.map((c) => c.code)).size).toBe(DEFAULT_CRITERIA.length);
    expect(DEFAULT_CRITERIA[0].code).toBe('RL01');
    expect(activePoints(criteria)).toBe(25);
  });

  it('follows DRAFT -> SELF_ASSESSED -> REVIEWED -> APPROVED', () => {
    expect(canSelfAssess(ConductStatus.DRAFT)).toBe(true);
    expect(canSelfAssess(ConductStatus.SELF_ASSESSED)).toBe(true);
    expect(canSelfAssess(ConductStatus.REVIEWED)).toBe(false);
    expect(canSelfAssess(ConductStatus.APPROVED)).toBe(false);

    expect(canReview(ConductStatus.DRAFT)).toBe(true);
    expect(canReview(ConductStatus.SELF_ASSESSED)).toBe(true);
    expect(canReview(ConductStatus.REVIEWED)).toBe(true);
    expect(canReview(ConductStatus.APPROVED)).toBe(false);

    expect(canApprove(ConductStatus.REVIEWED)).toBe(true);
    expect(canApprove(ConductStatus.SELF_ASSESSED)).toBe(false);
    expect(canApprove(ConductStatus.APPROVED)).toBe(false);

    expect(canReopen(ConductStatus.APPROVED)).toBe(true);
    expect(canReopen(ConductStatus.REVIEWED)).toBe(false);
  });

  it('words the approval notification', () => {
    expect(approvedNotification(1, ResultLevel.TOT, 95)).toEqual({ title: 'Kết quả rèn luyện', body: 'Kết quả rèn luyện học kỳ 1: Tốt (95 điểm)' });
    expect(approvedNotification(2, ResultLevel.CHUA_DAT, 40).body).toBe('Kết quả rèn luyện học kỳ 2: Chưa đạt (40 điểm)');
  });
});
