import { BadRequestException } from '@nestjs/common';
import { AssessmentType, PromotionStatus, ResultLevel } from '@prisma/client';

// Pure rules of Thông tư 22/2021/TT-BGDĐT (THCS/THPT assessment): averages,
// academic level, titles and promotion. No database access here.

/** Semester 0 means "cả năm" (the whole year) everywhere in the gradebook. */
export const YEAR = 0;

export const TITLE_EXCELLENT = 'Học sinh Xuất sắc';
export const TITLE_GOOD = 'Học sinh Giỏi';

/** Rounds to one decimal, half up (7.25 -> 7.3). */
export function roundScore(x: number): number {
  return Math.round((x + Number.EPSILON) * 10) / 10;
}

/** Marks are 0–10 in steps of 0.1. */
export function isValidMark(value: number): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10) return false;
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-6;
}

export function assertMark(value: number): void {
  if (!isValidMark(value)) throw new BadRequestException('Điểm phải từ 0 đến 10 và là bội số của 0,1');
}

/** Number of regular marks (ĐĐGtx) per semester from the subject's periods per year. */
export function regularCountFor(periodsPerYear: number): number {
  if (periodsPerYear <= 35) return 2;
  if (periodsPerYear <= 70) return 3;
  return 4;
}

export interface SemesterMarks {
  /** Regular marks by index (index 1 at position 0); missing ones are null. */
  tx: (number | null)[];
  gk: number | null;
  ck: number | null;
}

export interface SemesterPassed {
  tx: (boolean | null)[];
  gk: boolean | null;
  ck: boolean | null;
}

/**
 * ĐTBmhk = (ΣTX + 2×GK + 3×CK) / (number of TX + 5); null until every required
 * regular mark, the mid-term and the end-of-term mark are present.
 */
export function semesterAverage(marks: SemesterMarks, regularCount: number): number | null {
  const tx = marks.tx.slice(0, regularCount);
  if (tx.length < regularCount || tx.some((v) => v === null || v === undefined)) return null;
  if (marks.gk === null || marks.gk === undefined || marks.ck === null || marks.ck === undefined) return null;
  const sum = (tx as number[]).reduce((a, v) => a + v, 0) + 2 * marks.gk + 3 * marks.ck;
  return roundScore(sum / (regularCount + 5));
}

/** Comment-assessed subjects: Đạt when every recorded mark passed; null until GK and CK exist. */
export function semesterPassed(marks: SemesterPassed): boolean | null {
  if (marks.gk === null || marks.gk === undefined || marks.ck === null || marks.ck === undefined) return null;
  return marks.gk && marks.ck && marks.tx.every((v) => v !== false);
}

/** ĐTBmcn = (ĐTBhk1 + 2×ĐTBhk2) / 3. */
export function yearAverage(hk1: number | null, hk2: number | null): number | null {
  if (hk1 === null || hk1 === undefined || hk2 === null || hk2 === undefined) return null;
  return roundScore((hk1 + 2 * hk2) / 3);
}

/** Year Đạt only when both semesters are Đạt. */
export function yearPassed(hk1: boolean | null, hk2: boolean | null): boolean | null {
  if (hk1 === null || hk1 === undefined || hk2 === null || hk2 === undefined) return null;
  return hk1 && hk2;
}

/** The outcome of one subject for a term: an average for score subjects, Đạt/Chưa đạt for comment subjects. */
export interface SubjectOutcome {
  assessment: AssessmentType;
  average: number | null;
  passed: boolean | null;
}

const isComplete = (r: SubjectOutcome) => (r.assessment === AssessmentType.COMMENT ? r.passed !== null && r.passed !== undefined : r.average !== null && r.average !== undefined);

/** "At least 6 subjects" means "all of them" when the student takes fewer than 6 score subjects. */
const needed = (scoreCount: number) => Math.min(6, scoreCount);

/**
 * Kết quả học tập (Điều 9 TT22) for a set of subject outcomes; null while any
 * outcome is still missing.
 */
export function academicLevel(results: SubjectOutcome[]): ResultLevel | null {
  if (!results.length || results.some((r) => !isComplete(r))) return null;
  const scores = results.filter((r) => r.assessment === AssessmentType.SCORE).map((r) => r.average as number);
  const comments = results.filter((r) => r.assessment === AssessmentType.COMMENT).map((r) => r.passed as boolean);
  const failedComments = comments.filter((p) => !p).length;
  const atLeast = (min: number) => scores.filter((s) => s >= min).length >= needed(scores.length);
  const every = (min: number) => scores.every((s) => s >= min);

  if (failedComments === 0 && every(6.5) && atLeast(8.0)) return ResultLevel.TOT;
  if (failedComments === 0 && every(5.0) && atLeast(6.5)) return ResultLevel.KHA;
  if (failedComments <= 1 && every(3.5) && atLeast(5.0)) return ResultLevel.DAT;
  return ResultLevel.CHUA_DAT;
}

/** Danh hiệu (year only): Xuất sắc needs 6 score subjects at 9.0 or more on top of Giỏi. */
export function titleFor(academic: ResultLevel | null, conduct: ResultLevel | null, results: SubjectOutcome[]): string | null {
  if (academic !== ResultLevel.TOT || conduct !== ResultLevel.TOT) return null;
  const scores = results.filter((r) => r.assessment === AssessmentType.SCORE && r.average !== null).map((r) => r.average as number);
  if (scores.length && scores.filter((s) => s >= 9.0).length >= needed(scores.length)) return TITLE_EXCELLENT;
  return TITLE_GOOD;
}

/** Lên lớp / kiểm tra lại / ở lại lớp (Điều 12 TT22), year only. */
export function promotionFor(academic: ResultLevel | null, conduct: ResultLevel | null, absentDays: number): PromotionStatus | null {
  if (absentDays > 45) return PromotionStatus.RETAINED;
  if (!academic || !conduct) return null;
  const failed = [academic, conduct].filter((l) => l === ResultLevel.CHUA_DAT).length;
  if (failed === 2) return PromotionStatus.RETAINED;
  if (failed === 1) return PromotionStatus.RETEST;
  return PromotionStatus.PROMOTED;
}

/** Vietnamese label of a comment-subject outcome. */
export const passedLabel = (passed: boolean | null | undefined) => (passed === null || passed === undefined ? null : passed ? 'Đạt' : 'Chưa đạt');

/** "8.5" -> "8,5" for notification texts. */
export const formatMark = (value: number) => value.toFixed(1).replace('.', ',');
