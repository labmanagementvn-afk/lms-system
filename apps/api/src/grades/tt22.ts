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

/** More than this many sessions absent in a year means staying down (Điều 12 TT22). */
export const MAX_ABSENT_DAYS = 45;

/**
 * Rèn luyện cả năm (Điều 8 TT22) from the two semesters, the second weighing
 * more; null until both are known.
 */
export function yearConduct(hk1: ResultLevel | null | undefined, hk2: ResultLevel | null | undefined): ResultLevel | null {
  if (!hk1 || !hk2) return null;
  const { TOT, KHA, DAT, CHUA_DAT } = ResultLevel;
  if (hk2 === TOT) return hk1 === TOT || hk1 === KHA ? TOT : KHA;
  if (hk2 === KHA) return hk1 === CHUA_DAT ? DAT : KHA;
  if (hk2 === DAT) return hk1 === TOT ? KHA : DAT;
  return CHUA_DAT;
}

/** What the summer review changed (year only). */
export interface ReviewOutcome {
  /** Kết quả học tập after the retakes (Điều 14); null until every registered retake has a result. */
  academicAfterRetake?: ResultLevel | null;
  /** Kết quả rèn luyện re-evaluated after summer training (Điều 13); null until evaluated. */
  conductAfterTraining?: ResultLevel | null;
}

/**
 * Lên lớp / kiểm tra lại or rèn luyện hè / ở lại lớp (Điều 12 to 14 TT22), year
 * only. A student with one of the two levels at Chưa đạt is RETEST until the
 * summer review gives the replacement level, then PROMOTED or RETAINED.
 */
export function promotionFor(academic: ResultLevel | null, conduct: ResultLevel | null, absentDays: number, review: ReviewOutcome = {}): PromotionStatus | null {
  if (absentDays > MAX_ABSENT_DAYS) return PromotionStatus.RETAINED;
  if (!academic || !conduct) return null;
  const academicFailed = academic === ResultLevel.CHUA_DAT;
  const conductFailed = conduct === ResultLevel.CHUA_DAT;
  if (academicFailed && conductFailed) return PromotionStatus.RETAINED;
  if (!academicFailed && !conductFailed) return PromotionStatus.PROMOTED;
  const after = academicFailed ? review.academicAfterRetake : review.conductAfterTraining;
  if (!after) return PromotionStatus.RETEST;
  return after === ResultLevel.CHUA_DAT ? PromotionStatus.RETAINED : PromotionStatus.PROMOTED;
}

/** Which summer review a RETEST student goes through: retakes when learning failed, training when conduct did. */
export function reviewKind(academic: ResultLevel | null | undefined, conduct: ResultLevel | null | undefined): 'RETAKE' | 'TRAINING' | null {
  if (academic === ResultLevel.CHUA_DAT && conduct && conduct !== ResultLevel.CHUA_DAT) return 'RETAKE';
  if (conduct === ResultLevel.CHUA_DAT && academic && academic !== ResultLevel.CHUA_DAT) return 'TRAINING';
  return null;
}

/** A year result with what the summer review and the school decided. */
export interface PromotionFacts {
  promotion: PromotionStatus | null;
  academic: ResultLevel | null;
  conduct: ResultLevel | null;
  absentDays: number;
  academicAfterRetake: ResultLevel | null;
  conductAfterTraining: ResultLevel | null;
  promotionOverride: PromotionStatus | null;
}

/** Why a student was not promoted outright, as the printed lists say it; empty for a plain promotion. */
export function promotionReason(t: PromotionFacts, retakeSubjects: string[] = []): string {
  if (t.promotionOverride) return 'Do nhà trường quyết định';
  if (t.absentDays > MAX_ABSENT_DAYS) return `Nghỉ ${t.absentDays} buổi (quá ${MAX_ABSENT_DAYS} buổi)`;
  const academicFailed = t.academic === ResultLevel.CHUA_DAT;
  const conductFailed = t.conduct === ResultLevel.CHUA_DAT;
  if (academicFailed && conductFailed) return 'Học tập và rèn luyện cả năm Chưa đạt';
  if (academicFailed) {
    const subjects = retakeSubjects.length ? ` ${retakeSubjects.join(', ')}` : '';
    if (!t.academicAfterRetake) return `Kiểm tra lại${subjects}`;
    return t.academicAfterRetake === ResultLevel.CHUA_DAT ? `Kiểm tra lại${subjects}, học tập vẫn Chưa đạt` : `Lên lớp sau kiểm tra lại${subjects}`;
  }
  if (conductFailed) {
    if (!t.conductAfterTraining) return 'Rèn luyện trong hè';
    return t.conductAfterTraining === ResultLevel.CHUA_DAT ? 'Rèn luyện hè, rèn luyện vẫn Chưa đạt' : 'Lên lớp sau rèn luyện hè';
  }
  return '';
}

/** Môn được kiểm tra lại (Điều 14): comment subjects rated Chưa đạt and score subjects whose year average is below 5.0. */
export function needsRetake(o: SubjectOutcome): boolean {
  return o.assessment === AssessmentType.COMMENT ? o.passed === false : o.average !== null && o.average !== undefined && o.average < 5;
}

/** A retake's result as a subject outcome; null while it has not been entered. */
export function retakeOutcome(assessment: AssessmentType, r: { score: number | null; passed: boolean | null }): SubjectOutcome | null {
  if (assessment === AssessmentType.COMMENT) return r.passed === null || r.passed === undefined ? null : { assessment, average: null, passed: r.passed };
  return r.score === null || r.score === undefined ? null : { assessment, average: r.score, passed: null };
}

/** The oldest a student may be, by year of birth, to be recognised as completing THCS. */
export const MAX_COMPLETION_AGE = 21;

/** Everything the THCS completion review looks at, with the summer review already applied. */
export interface CompletionInput {
  academic: ResultLevel | null;
  conduct: ResultLevel | null;
  absentDays: number;
  /** Subjects whose final year result is Chưa đạt. */
  failedSubjects: string[];
  birthYear: number | null;
  /** The calendar year the school year ends in; age counts by year of birth. */
  reviewYear: number;
  dossierComplete: boolean;
  /** A promotion the school set by hand: PROMOTED stands in for the result conditions, anything else holds the student back. */
  promotionOverride?: PromotionStatus | null;
}

/**
 * Why a grade 9 student cannot yet be recognised as completing the THCS programme
 * (Điều 12 TT22 for grade 9, no subject at Chưa đạt, at most 21 by year of birth,
 * a complete dossier); empty when the student can be.
 */
export function completionGaps(c: CompletionInput): string[] {
  const gaps: string[] = [];
  if (c.promotionOverride === PromotionStatus.RETAINED) gaps.push('Ở lại lớp theo quyết định của nhà trường');
  else if (c.promotionOverride === PromotionStatus.RETEST) gaps.push('Đang chờ kiểm tra lại, rèn luyện hè');
  else if (!c.promotionOverride) {
    if (!c.conduct) gaps.push('Chưa có kết quả rèn luyện cả năm');
    else if (c.conduct === ResultLevel.CHUA_DAT) gaps.push('Rèn luyện cả năm Chưa đạt');
    if (!c.academic) gaps.push('Chưa có kết quả học tập cả năm');
    else if (c.academic === ResultLevel.CHUA_DAT) gaps.push('Học tập cả năm Chưa đạt');
    if (c.failedSubjects.length) gaps.push(`Chưa đạt môn ${c.failedSubjects.join(', ')}`);
    if (c.absentDays > MAX_ABSENT_DAYS) gaps.push(`Nghỉ ${c.absentDays} buổi (quá ${MAX_ABSENT_DAYS} buổi)`);
  }
  if (c.birthYear === null) gaps.push('Chưa có ngày sinh');
  else if (c.reviewYear - c.birthYear > MAX_COMPLETION_AGE) gaps.push(`Quá ${MAX_COMPLETION_AGE} tuổi`);
  if (!c.dossierComplete) gaps.push('Hồ sơ chưa đủ');
  return gaps;
}

/** Vietnamese label of a comment-subject outcome. */
export const passedLabel = (passed: boolean | null | undefined) => (passed === null || passed === undefined ? null : passed ? 'Đạt' : 'Chưa đạt');

/** "8.5" -> "8,5" for notification texts. */
export const formatMark = (value: number) => value.toFixed(1).replace('.', ',');
