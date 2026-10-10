import { BadRequestException } from '@nestjs/common';
import { AssessmentType, PromotionStatus, ResultLevel } from '@prisma/client';
import {
  academicLevel,
  assertMark,
  completionGaps,
  CompletionInput,
  formatMark,
  isValidMark,
  needsRetake,
  promotionFor,
  PromotionFacts,
  promotionReason,
  regularCountFor,
  retakeOutcome,
  reviewKind,
  roundScore,
  semesterAverage,
  semesterPassed,
  SubjectOutcome,
  TITLE_EXCELLENT,
  TITLE_GOOD,
  titleFor,
  yearAverage,
  yearConduct,
  yearPassed,
} from './tt22';

const score = (average: number | null): SubjectOutcome => ({ assessment: AssessmentType.SCORE, average, passed: null });
const comment = (passed: boolean | null): SubjectOutcome => ({ assessment: AssessmentType.COMMENT, average: null, passed });

describe('TT22 rules', () => {
  describe('marks', () => {
    it('rounds to one decimal, half up', () => {
      expect(roundScore(7.25)).toBe(7.3);
      expect(roundScore(7.24)).toBe(7.2);
      expect(roundScore(8.05)).toBe(8.1);
      expect(roundScore(10)).toBe(10);
    });

    it('accepts 0–10 in 0.1 steps only', () => {
      expect(isValidMark(0)).toBe(true);
      expect(isValidMark(10)).toBe(true);
      expect(isValidMark(7.5)).toBe(true);
      expect(isValidMark(10.3)).toBe(false);
      expect(isValidMark(7.25)).toBe(false);
      expect(isValidMark(-0.1)).toBe(false);
      expect(isValidMark(NaN)).toBe(false);
      expect(() => assertMark(10.3)).toThrow(BadRequestException);
      expect(() => assertMark(8)).not.toThrow();
    });

    it('derives the number of regular marks from periods per year', () => {
      expect(regularCountFor(35)).toBe(2);
      expect(regularCountFor(36)).toBe(3);
      expect(regularCountFor(70)).toBe(3);
      expect(regularCountFor(140)).toBe(4);
    });

    it('formats marks with a decimal comma', () => {
      expect(formatMark(8.5)).toBe('8,5');
      expect(formatMark(10)).toBe('10,0');
    });
  });

  describe('averages', () => {
    it('weights TX ×1, GK ×2, CK ×3', () => {
      // (8 + 7 + 9 + 2×8 + 3×7.5) / 8 = 62.5 / 8 = 7.8125 -> 7.8
      expect(semesterAverage({ tx: [8, 7, 9], gk: 8, ck: 7.5 }, 3)).toBe(7.8);
      expect(semesterAverage({ tx: [10, 10], gk: 10, ck: 10 }, 2)).toBe(10);
    });

    it('is null until every required mark exists', () => {
      expect(semesterAverage({ tx: [8, 7], gk: 8, ck: 7.5 }, 3)).toBeNull();
      expect(semesterAverage({ tx: [8, 7, null], gk: 8, ck: 7.5 }, 3)).toBeNull();
      expect(semesterAverage({ tx: [8, 7, 9], gk: null, ck: 7.5 }, 3)).toBeNull();
      expect(semesterAverage({ tx: [8, 7, 9], gk: 8, ck: null }, 3)).toBeNull();
    });

    it('ignores regular marks beyond the configured count', () => {
      expect(semesterAverage({ tx: [8, 8, 0, 0], gk: 8, ck: 8 }, 2)).toBe(8);
    });

    it('computes the year average as (HK1 + 2×HK2) / 3', () => {
      expect(yearAverage(7.0, 8.0)).toBe(7.7);
      expect(yearAverage(null, 8.0)).toBeNull();
      expect(yearAverage(7.0, null)).toBeNull();
    });

    it('rates comment subjects Đạt only when every recorded mark passed', () => {
      expect(semesterPassed({ tx: [true, true], gk: true, ck: true })).toBe(true);
      expect(semesterPassed({ tx: [true, false], gk: true, ck: true })).toBe(false);
      expect(semesterPassed({ tx: [null, null], gk: true, ck: true })).toBe(true);
      expect(semesterPassed({ tx: [true], gk: true, ck: false })).toBe(false);
      expect(semesterPassed({ tx: [true], gk: null, ck: true })).toBeNull();
      expect(yearPassed(true, true)).toBe(true);
      expect(yearPassed(true, false)).toBe(false);
      expect(yearPassed(true, null)).toBeNull();
    });
  });

  describe('academic level', () => {
    const six = (v: number) => Array.from({ length: 6 }, () => score(v));

    it('is TOT with every score subject ≥ 6.5, six of them ≥ 8.0 and every comment subject Đạt', () => {
      expect(academicLevel([...six(8.0), score(6.5), comment(true)])).toBe(ResultLevel.TOT);
      expect(academicLevel([...six(8.0), score(6.4), comment(true)])).toBe(ResultLevel.KHA);
      expect(academicLevel([...six(8.0), comment(false)])).toBe(ResultLevel.DAT);
      expect(academicLevel([...Array.from({ length: 5 }, () => score(8.0)), score(7.9), comment(true)])).toBe(ResultLevel.KHA);
    });

    it('is KHA with every score subject ≥ 5.0 and six ≥ 6.5', () => {
      expect(academicLevel([...six(6.5), score(5.0), comment(true)])).toBe(ResultLevel.KHA);
      expect(academicLevel([...six(6.5), score(4.9), comment(true)])).toBe(ResultLevel.DAT);
    });

    it('is DAT with at most one Chưa đạt, six subjects ≥ 5.0 and none < 3.5', () => {
      expect(academicLevel([...six(5.0), score(3.5), comment(false), comment(true)])).toBe(ResultLevel.DAT);
      expect(academicLevel([...six(5.0), score(3.4), comment(true)])).toBe(ResultLevel.CHUA_DAT);
      expect(academicLevel([...six(5.0), comment(false), comment(false)])).toBe(ResultLevel.CHUA_DAT);
      expect(academicLevel([...Array.from({ length: 5 }, () => score(5.0)), score(4.9), comment(true)])).toBe(ResultLevel.CHUA_DAT);
    });

    it('treats "at least 6" as "all" for students with fewer than 6 score subjects', () => {
      expect(academicLevel([score(8.0), score(9.0), comment(true)])).toBe(ResultLevel.TOT);
      expect(academicLevel([score(8.0), score(7.0)])).toBe(ResultLevel.KHA);
      expect(academicLevel([score(5.0), score(5.0)])).toBe(ResultLevel.DAT);
    });

    it('is null while any outcome is missing', () => {
      expect(academicLevel([])).toBeNull();
      expect(academicLevel([score(8.0), score(null)])).toBeNull();
      expect(academicLevel([score(8.0), comment(null)])).toBeNull();
    });
  });

  describe('title and promotion', () => {
    const results = (v: number) => [...Array.from({ length: 6 }, () => score(v)), score(6.5), comment(true)];

    it('awards Giỏi for TOT/TOT and Xuất sắc with six subjects ≥ 9.0', () => {
      expect(titleFor(ResultLevel.TOT, ResultLevel.TOT, results(8.0))).toBe(TITLE_GOOD);
      expect(titleFor(ResultLevel.TOT, ResultLevel.TOT, results(9.0))).toBe(TITLE_EXCELLENT);
      expect(titleFor(ResultLevel.TOT, ResultLevel.KHA, results(9.0))).toBeNull();
      expect(titleFor(ResultLevel.KHA, ResultLevel.TOT, results(9.0))).toBeNull();
      expect(titleFor(ResultLevel.TOT, null, results(9.0))).toBeNull();
    });

    it('promotes, retests or retains by academic and conduct level', () => {
      expect(promotionFor(ResultLevel.TOT, ResultLevel.TOT, 0)).toBe(PromotionStatus.PROMOTED);
      expect(promotionFor(ResultLevel.DAT, ResultLevel.DAT, 45)).toBe(PromotionStatus.PROMOTED);
      expect(promotionFor(ResultLevel.CHUA_DAT, ResultLevel.DAT, 0)).toBe(PromotionStatus.RETEST);
      expect(promotionFor(ResultLevel.DAT, ResultLevel.CHUA_DAT, 0)).toBe(PromotionStatus.RETEST);
      expect(promotionFor(ResultLevel.CHUA_DAT, ResultLevel.CHUA_DAT, 0)).toBe(PromotionStatus.RETAINED);
      expect(promotionFor(ResultLevel.TOT, ResultLevel.TOT, 46)).toBe(PromotionStatus.RETAINED);
      expect(promotionFor(null, ResultLevel.TOT, 0)).toBeNull();
      expect(promotionFor(ResultLevel.TOT, null, 0)).toBeNull();
    });
  });

  describe('year conduct', () => {
    const { TOT, KHA, DAT, CHUA_DAT } = ResultLevel;

    it('follows Điều 8: the second semester weighs more', () => {
      // [HK1, HK2, year]
      const cases: [ResultLevel, ResultLevel, ResultLevel][] = [
        [TOT, TOT, TOT],
        [KHA, TOT, TOT],
        [DAT, TOT, KHA],
        [CHUA_DAT, TOT, KHA],
        [TOT, KHA, KHA],
        [DAT, KHA, KHA],
        [CHUA_DAT, KHA, DAT],
        [TOT, DAT, KHA],
        [KHA, DAT, DAT],
        [CHUA_DAT, DAT, DAT],
        [TOT, CHUA_DAT, CHUA_DAT],
        [CHUA_DAT, CHUA_DAT, CHUA_DAT],
      ];
      for (const [hk1, hk2, year] of cases) expect([hk1, hk2, yearConduct(hk1, hk2)]).toEqual([hk1, hk2, year]);
    });

    it('waits for both semesters', () => {
      expect(yearConduct(TOT, null)).toBeNull();
      expect(yearConduct(undefined, TOT)).toBeNull();
    });
  });

  describe('summer review', () => {
    const { TOT, KHA, DAT, CHUA_DAT } = ResultLevel;

    it('keeps one failed level on RETEST until the review gives its replacement', () => {
      expect(promotionFor(CHUA_DAT, KHA, 0, { academicAfterRetake: null })).toBe(PromotionStatus.RETEST);
      expect(promotionFor(CHUA_DAT, KHA, 0, { academicAfterRetake: DAT })).toBe(PromotionStatus.PROMOTED);
      expect(promotionFor(CHUA_DAT, KHA, 0, { academicAfterRetake: CHUA_DAT })).toBe(PromotionStatus.RETAINED);
      expect(promotionFor(TOT, CHUA_DAT, 0, { conductAfterTraining: DAT })).toBe(PromotionStatus.PROMOTED);
      expect(promotionFor(TOT, CHUA_DAT, 0, { conductAfterTraining: CHUA_DAT })).toBe(PromotionStatus.RETAINED);
      // Only the review of the failed level counts.
      expect(promotionFor(CHUA_DAT, KHA, 0, { conductAfterTraining: TOT })).toBe(PromotionStatus.RETEST);
      // No review lifts both failures or too many absences.
      expect(promotionFor(CHUA_DAT, CHUA_DAT, 0, { academicAfterRetake: DAT, conductAfterTraining: DAT })).toBe(PromotionStatus.RETAINED);
      expect(promotionFor(CHUA_DAT, KHA, 46, { academicAfterRetake: DAT })).toBe(PromotionStatus.RETAINED);
    });

    it('sends failed learning to retakes and failed conduct to summer training', () => {
      expect(reviewKind(CHUA_DAT, DAT)).toBe('RETAKE');
      expect(reviewKind(KHA, CHUA_DAT)).toBe('TRAINING');
      expect(reviewKind(CHUA_DAT, CHUA_DAT)).toBeNull();
      expect(reviewKind(TOT, TOT)).toBeNull();
      expect(reviewKind(CHUA_DAT, null)).toBeNull();
    });

    it('retakes comment subjects at Chưa đạt and score subjects under 5.0', () => {
      expect(needsRetake(score(4.9))).toBe(true);
      expect(needsRetake(score(5.0))).toBe(false);
      expect(needsRetake(score(null))).toBe(false);
      expect(needsRetake(comment(false))).toBe(true);
      expect(needsRetake(comment(true))).toBe(false);
      expect(retakeOutcome(AssessmentType.SCORE, { score: 6.5, passed: null })).toEqual(score(6.5));
      expect(retakeOutcome(AssessmentType.SCORE, { score: null, passed: null })).toBeNull();
      expect(retakeOutcome(AssessmentType.COMMENT, { score: null, passed: true })).toEqual(comment(true));
      expect(retakeOutcome(AssessmentType.COMMENT, { score: null, passed: null })).toBeNull();
    });

    it('explains every outcome that is not a plain promotion', () => {
      const facts = (t: Partial<PromotionFacts>): PromotionFacts => ({
        promotion: PromotionStatus.RETEST,
        academic: KHA,
        conduct: KHA,
        absentDays: 0,
        academicAfterRetake: null,
        conductAfterTraining: null,
        promotionOverride: null,
        ...t,
      });
      expect(promotionReason(facts({ promotion: PromotionStatus.PROMOTED }))).toBe('');
      expect(promotionReason(facts({ academic: CHUA_DAT }), ['Toán', 'Tiếng Anh'])).toBe('Kiểm tra lại Toán, Tiếng Anh');
      expect(promotionReason(facts({ academic: CHUA_DAT, academicAfterRetake: DAT }), ['Toán'])).toBe('Lên lớp sau kiểm tra lại Toán');
      expect(promotionReason(facts({ academic: CHUA_DAT, academicAfterRetake: CHUA_DAT }), ['Toán'])).toBe('Kiểm tra lại Toán, học tập vẫn Chưa đạt');
      expect(promotionReason(facts({ conduct: CHUA_DAT }))).toBe('Rèn luyện trong hè');
      expect(promotionReason(facts({ conduct: CHUA_DAT, conductAfterTraining: DAT }))).toBe('Lên lớp sau rèn luyện hè');
      expect(promotionReason(facts({ conduct: CHUA_DAT, conductAfterTraining: CHUA_DAT }))).toBe('Rèn luyện hè, rèn luyện vẫn Chưa đạt');
      expect(promotionReason(facts({ academic: CHUA_DAT, conduct: CHUA_DAT }))).toBe('Học tập và rèn luyện cả năm Chưa đạt');
      expect(promotionReason(facts({ absentDays: 48 }))).toBe('Nghỉ 48 buổi (quá 45 buổi)');
      expect(promotionReason(facts({ promotionOverride: PromotionStatus.PROMOTED }))).toBe('Do nhà trường quyết định');
    });
  });

  describe('THCS completion', () => {
    const { KHA, DAT, CHUA_DAT } = ResultLevel;
    const input = (c: Partial<CompletionInput>): CompletionInput => ({ academic: KHA, conduct: DAT, absentDays: 3, failedSubjects: [], birthYear: 2012, reviewYear: 2027, dossierComplete: true, ...c });

    it('recognises a student who meets every condition', () => {
      expect(completionGaps(input({}))).toEqual([]);
      // 21 by year of birth is still allowed.
      expect(completionGaps(input({ birthYear: 2006 }))).toEqual([]);
    });

    it('lists every condition a student misses', () => {
      expect(completionGaps(input({ conduct: CHUA_DAT, academic: CHUA_DAT, failedSubjects: ['Nghệ thuật'], absentDays: 46, birthYear: 2005, dossierComplete: false }))).toEqual([
        'Rèn luyện cả năm Chưa đạt',
        'Học tập cả năm Chưa đạt',
        'Chưa đạt môn Nghệ thuật',
        'Nghỉ 46 buổi (quá 45 buổi)',
        'Quá 21 tuổi',
        'Hồ sơ chưa đủ',
      ]);
      expect(completionGaps(input({ conduct: null, academic: null, birthYear: null }))).toEqual(['Chưa có kết quả rèn luyện cả năm', 'Chưa có kết quả học tập cả năm', 'Chưa có ngày sinh']);
    });

    it('follows a promotion the school set by hand', () => {
      expect(completionGaps(input({ academic: CHUA_DAT, promotionOverride: PromotionStatus.PROMOTED }))).toEqual([]);
      expect(completionGaps(input({ promotionOverride: PromotionStatus.RETAINED }))).toEqual(['Ở lại lớp theo quyết định của nhà trường']);
      expect(completionGaps(input({ promotionOverride: PromotionStatus.RETEST, dossierComplete: false }))).toEqual(['Đang chờ kiểm tra lại, rèn luyện hè', 'Hồ sơ chưa đủ']);
    });
  });
});
