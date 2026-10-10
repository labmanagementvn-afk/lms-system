import { AssessmentType, Prisma, PrismaClient, ResultLevel, ScoreKind } from '@prisma/client';
import { academicLevel, promotionFor, retakeOutcome, semesterAverage, semesterPassed, SubjectOutcome, titleFor, YEAR, yearAverage, yearConduct, yearPassed } from './tt22';

// Turns Score rows into SubjectResult and TermResult rows. Shared by the API
// service and the demo seed, so it only needs a PrismaClient.

export type Db = Pick<PrismaClient, 'subjectSetting' | 'enrollment' | 'score' | 'subjectResult' | 'termResult' | 'subjectExemption' | 'subjectRetake' | 'summerTraining' | '$transaction'>;

export interface SubjectSettingLike {
  assessment: AssessmentType;
  regularCount: number;
}

export const DEFAULT_SETTING: SubjectSettingLike = { assessment: AssessmentType.SCORE, regularCount: 3 };

/** Preferred display order of the usual THCS subjects; unknown codes follow, by name. */
const SUBJECT_ORDER = ['TOAN', 'VAN', 'ANH', 'KHTN', 'LY', 'HOA', 'SINH', 'LSDL', 'SU', 'DIA', 'GDCD', 'TIN', 'CN', 'GDTC', 'NT', 'AN', 'MT', 'HDTN', 'GDDP'];

export function orderSubjects<T extends { code: string; name: string }>(subjects: T[]): T[] {
  const rank = (code: string) => {
    const i = SUBJECT_ORDER.indexOf(code.toUpperCase());
    return i === -1 ? SUBJECT_ORDER.length : i;
  };
  return [...subjects].sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name, 'vi'));
}

export interface ScoreLike {
  studentId: string;
  subjectId: string;
  semester: number;
  kind: ScoreKind;
  index: number;
  value: Prisma.Decimal | number | null;
  passed: boolean | null;
}

export interface MarkSheet {
  TX: (number | null)[];
  GK: number | null;
  CK: number | null;
  passed: { TX: (boolean | null)[]; GK: boolean | null; CK: boolean | null };
}

export const num = (v: Prisma.Decimal | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

/** Groups the Score rows of one student, subject and semester into a mark sheet of `regularCount` TX slots. */
export function toMarkSheet(rows: ScoreLike[], regularCount: number): MarkSheet {
  const sheet: MarkSheet = {
    TX: Array.from({ length: regularCount }, () => null),
    GK: null,
    CK: null,
    passed: { TX: Array.from({ length: regularCount }, () => null), GK: null, CK: null },
  };
  for (const r of rows) {
    if (r.kind === ScoreKind.TX) {
      if (r.index >= 1 && r.index <= regularCount) {
        sheet.TX[r.index - 1] = num(r.value);
        sheet.passed.TX[r.index - 1] = r.passed;
      }
    } else {
      sheet[r.kind] = num(r.value);
      sheet.passed[r.kind] = r.passed;
    }
  }
  return sheet;
}

/** The semester outcome of one subject from its mark sheet. */
export function sheetOutcome(sheet: MarkSheet, setting: SubjectSettingLike): SubjectOutcome {
  if (setting.assessment === AssessmentType.COMMENT) {
    return { assessment: setting.assessment, average: null, passed: semesterPassed({ tx: sheet.passed.TX, gk: sheet.passed.GK, ck: sheet.passed.CK }) };
  }
  return { assessment: setting.assessment, average: semesterAverage({ tx: sheet.TX, gk: sheet.GK, ck: sheet.CK }, setting.regularCount), passed: null };
}

export function yearOutcome(hk1: SubjectOutcome, hk2: SubjectOutcome, setting: SubjectSettingLike): SubjectOutcome {
  if (setting.assessment === AssessmentType.COMMENT) return { assessment: setting.assessment, average: null, passed: yearPassed(hk1.passed, hk2.passed) };
  return { assessment: setting.assessment, average: yearAverage(hk1.average, hk2.average), passed: null };
}

export interface RecomputeScope {
  schoolId: string;
  academicYearId: string;
  classId: string;
  /** Defaults to every student enrolled in the class. */
  studentIds?: string[];
  /** Defaults to every subject that has marks or results for the class. */
  subjectIds?: string[];
}

export async function loadSettings(db: Db, schoolId: string): Promise<Map<string, SubjectSettingLike>> {
  const rows = await db.subjectSetting.findMany({ where: { schoolId }, select: { subjectId: true, assessment: true, regularCount: true } });
  return new Map(rows.map((r) => [r.subjectId, { assessment: r.assessment, regularCount: r.regularCount }]));
}

const key = (studentId: string, subjectId: string, semester: number) => `${studentId}|${subjectId}|${semester}`;

/**
 * Which semesters of a subject a student is exempt from (miễn học). An exemption
 * for the year (semester 0) covers both semesters; exempt from both semesters
 * means exempt for the year, and exempt from one means the year takes the other.
 */
export function exemptTerms(rows: { semester: number }[]): { hk1: boolean; hk2: boolean; year: boolean } {
  const hk1 = rows.some((r) => r.semester === 1 || r.semester === YEAR);
  const hk2 = rows.some((r) => r.semester === 2 || r.semester === YEAR);
  return { hk1, hk2, year: hk1 && hk2 };
}

export interface RetakeLike {
  subjectId: string;
  score: Prisma.Decimal | number | null;
  passed: boolean | null;
}

/**
 * The year outcomes of a student with each retaken subject's result in place of
 * its year result (Điều 14 TT22). `complete` is false while a registered retake
 * has no result yet; those subjects keep their year result.
 */
export function withRetakes(year: Map<string, SubjectOutcome>, retakes: RetakeLike[], settingOf: (subjectId: string) => SubjectSettingLike) {
  const outcomes = new Map(year);
  let complete = true;
  for (const r of retakes) {
    const o = retakeOutcome(settingOf(r.subjectId).assessment, { score: num(r.score), passed: r.passed });
    if (o) outcomes.set(r.subjectId, o);
    else complete = false;
  }
  return { outcomes, complete };
}

/** Kết quả học tập after the retakes; null without retakes or while one still has no result. */
export function academicAfterRetakes(year: Map<string, SubjectOutcome>, retakes: RetakeLike[], settingOf: (subjectId: string) => SubjectSettingLike): ResultLevel | null {
  if (!retakes.length) return null;
  const { outcomes, complete } = withRetakes(year, retakes, settingOf);
  return complete ? academicLevel([...outcomes.values()]) : null;
}

/**
 * Recomputes SubjectResult rows (HK1, HK2, year) for the scoped subjects and
 * students, then refreshes their TermResult rows: the academic level, and for
 * the year the conduct from both semesters (Điều 8), title, the levels after
 * retakes and summer training, and promotion (a promotion the school set by hand
 * wins). Semester conduct, absent days and the homeroom comment are kept as
 * they are.
 */
export async function recomputeResults(db: Db, scope: RecomputeScope) {
  const { schoolId, academicYearId, classId } = scope;
  const enrolled = await db.enrollment.findMany({
    where: { classId, academicYearId, ...(scope.studentIds ? { studentId: { in: scope.studentIds } } : {}) },
    select: { studentId: true },
  });
  const studentIds = enrolled.map((e) => e.studentId);
  if (!studentIds.length) return;

  const settings = await loadSettings(db, schoolId);
  const settingOf = (subjectId: string) => settings.get(subjectId) ?? DEFAULT_SETTING;

  const [scores, existing, terms, exemptions, retakes, trainings] = await Promise.all([
    db.score.findMany({
      where: { classId, academicYearId, studentId: { in: studentIds }, ...(scope.subjectIds ? { subjectId: { in: scope.subjectIds } } : {}) },
      select: { studentId: true, subjectId: true, semester: true, kind: true, index: true, value: true, passed: true },
    }),
    db.subjectResult.findMany({
      where: { academicYearId, studentId: { in: studentIds } },
      select: { studentId: true, subjectId: true, semester: true, average: true, passed: true, exempt: true },
    }),
    db.termResult.findMany({ where: { academicYearId, studentId: { in: studentIds } }, select: { studentId: true, semester: true, conduct: true, absentDays: true, promotionOverride: true } }),
    db.subjectExemption.findMany({ where: { academicYearId, studentId: { in: studentIds } }, select: { studentId: true, subjectId: true, semester: true } }),
    db.subjectRetake.findMany({ where: { academicYearId, studentId: { in: studentIds } }, select: { studentId: true, subjectId: true, score: true, passed: true } }),
    db.summerTraining.findMany({ where: { academicYearId, studentId: { in: studentIds } }, select: { studentId: true, result: true } }),
  ]);
  const exemptOf = (studentId: string, subjectId: string) => exemptTerms(exemptions.filter((e) => e.studentId === studentId && e.subjectId === subjectId));

  // Subjects to recompute: the scoped ones, or every subject with marks or results.
  const subjectIds = scope.subjectIds ?? [...new Set([...scores.map((s) => s.subjectId), ...existing.map((r) => r.subjectId), ...exemptions.map((e) => e.subjectId)])];

  const byCell = new Map<string, ScoreLike[]>();
  for (const s of scores) {
    const k = key(s.studentId, s.subjectId, s.semester);
    const list = byCell.get(k);
    if (list) list.push(s);
    else byCell.set(k, [s]);
  }

  // Outcomes of every subject per student: existing rows overridden by the fresh ones.
  const outcomes = new Map<string, SubjectOutcome>();
  for (const r of existing) if (!r.exempt) outcomes.set(key(r.studentId, r.subjectId, r.semester), { assessment: settingOf(r.subjectId).assessment, average: num(r.average), passed: r.passed });

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const studentId of studentIds) {
    for (const subjectId of subjectIds) {
      const setting = settingOf(subjectId);
      const hk1 = sheetOutcome(toMarkSheet(byCell.get(key(studentId, subjectId, 1)) ?? [], setting.regularCount), setting);
      const hk2 = sheetOutcome(toMarkSheet(byCell.get(key(studentId, subjectId, 2)) ?? [], setting.regularCount), setting);
      const ex = exemptOf(studentId, subjectId);
      const year = ex.year ? hk1 : ex.hk1 ? hk2 : ex.hk2 ? hk1 : yearOutcome(hk1, hk2, setting);
      for (const [semester, o, exempt] of [
        [1, hk1, ex.hk1],
        [2, hk2, ex.hk2],
        [YEAR, year, ex.year],
      ] as const) {
        const k = key(studentId, subjectId, semester);
        if (exempt) outcomes.delete(k);
        else outcomes.set(k, o);
        const average = exempt ? null : o.average;
        const passed = exempt ? null : o.passed;
        ops.push(
          db.subjectResult.upsert({
            where: { studentId_subjectId_academicYearId_semester: { studentId, subjectId, academicYearId, semester } },
            create: { schoolId, academicYearId, semester, classId, studentId, subjectId, average, passed, exempt },
            update: { classId, average, passed, exempt },
          }),
        );
      }
    }
  }

  const termOf = (studentId: string, semester: number) => terms.find((t) => t.studentId === studentId && t.semester === semester);
  for (const studentId of studentIds) {
    for (const semester of [1, 2, YEAR]) {
      const own = [...outcomes.entries()].filter(([k]) => k.startsWith(`${studentId}|`) && k.endsWith(`|${semester}`));
      const results = own.map(([, o]) => o);
      const academic = academicLevel(results);
      const term = termOf(studentId, semester);
      const where = { studentId_academicYearId_semester: { studentId, academicYearId, semester } };
      if (semester !== YEAR) {
        ops.push(db.termResult.upsert({ where, create: { schoolId, academicYearId, semester, classId, studentId, academic }, update: { classId, academic, title: null, promotion: null } }));
        continue;
      }
      // The year conduct follows the two semesters once both are known; until then whatever is stored stays.
      const conduct = yearConduct(termOf(studentId, 1)?.conduct, termOf(studentId, 2)?.conduct) ?? term?.conduct ?? null;
      const absentDays = term?.absentDays ?? 0;
      const title = titleFor(academic, conduct, results);
      const year = new Map(own.map(([k, o]) => [k.split('|')[1], o]));
      const academicAfterRetake = academicAfterRetakes(year, retakes.filter((r) => r.studentId === studentId), settingOf);
      const conductAfterTraining = trainings.find((t) => t.studentId === studentId)?.result ?? null;
      const promotion = term?.promotionOverride ?? promotionFor(academic, conduct, absentDays, { academicAfterRetake, conductAfterTraining });
      const data = { academic, conduct, title, promotion, academicAfterRetake, conductAfterTraining };
      ops.push(db.termResult.upsert({ where, create: { schoolId, academicYearId, semester, classId, studentId, ...data }, update: { classId, ...data } }));
    }
  }

  // Prisma runs a batch as one transaction; chunk it so very large classes stay within limits.
  for (let i = 0; i < ops.length; i += 500) await db.$transaction(ops.slice(i, i + 500));
}
