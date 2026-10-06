import { BadRequestException } from '@nestjs/common';
import { AssessmentType, PromotionStatus, ResultLevel } from '@prisma/client';
import {
  academicLevel,
  assertMark,
  formatMark,
  isValidMark,
  promotionFor,
  regularCountFor,
  roundScore,
  semesterAverage,
  semesterPassed,
  SubjectOutcome,
  TITLE_EXCELLENT,
  TITLE_GOOD,
  titleFor,
  yearAverage,
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
});
