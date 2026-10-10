import { AssessmentType, Prisma, PrismaClient, ScoreKind } from '@prisma/client';
import { academicLevel, promotionFor, semesterAverage, semesterPassed, SubjectOutcome, titleFor, YEAR, yearAverage, yearPassed } from './tt22';

// Turns Score rows into SubjectResult and TermResult rows. Shared by the API
// service and the demo seed, so it only needs a PrismaClient.

export type Db = Pick<PrismaClient, 'subjectSetting' | 'enrollment' | 'score' | 'subjectResult' | 'termResult' | 'subjectExemption' | '$transaction'>;

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

/**
 * Recomputes SubjectResult rows (HK1, HK2, year) for the scoped subjects and
 * students, then refreshes their TermResult rows (academic level; title and
 * promotion for the year). Conduct, absent days and the homeroom comment are
 * kept as they are.
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

  const [scores, existing, terms, exemptions] = await Promise.all([
    db.score.findMany({
      where: { classId, academicYearId, studentId: { in: studentIds }, ...(scope.subjectIds ? { subjectId: { in: scope.subjectIds } } : {}) },
      select: { studentId: true, subjectId: true, semester: true, kind: true, index: true, value: true, passed: true },
    }),
    db.subjectResult.findMany({
      where: { academicYearId, studentId: { in: studentIds } },
      select: { studentId: true, subjectId: true, semester: true, average: true, passed: true, exempt: true },
    }),
    db.termResult.findMany({ where: { academicYearId, studentId: { in: studentIds } }, select: { studentId: true, semester: true, conduct: true, absentDays: true } }),
    db.subjectExemption.findMany({ where: { academicYearId, studentId: { in: studentIds } }, select: { studentId: true, subjectId: true, semester: true } }),
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
      const results = [...outcomes.entries()].filter(([k]) => k.startsWith(`${studentId}|`) && k.endsWith(`|${semester}`)).map(([, o]) => o);
      const academic = academicLevel(results);
      const term = termOf(studentId, semester);
      const conduct = term?.conduct ?? null;
      const absentDays = term?.absentDays ?? 0;
      const title = semester === YEAR ? titleFor(academic, conduct, results) : null;
      const promotion = semester === YEAR ? promotionFor(academic, conduct, absentDays) : null;
      ops.push(
        db.termResult.upsert({
          where: { studentId_academicYearId_semester: { studentId, academicYearId, semester } },
          create: { schoolId, academicYearId, semester, classId, studentId, academic, title, promotion },
          update: { classId, academic, title, promotion },
        }),
      );
    }
  }

  // Prisma runs a batch as one transaction; chunk it so very large classes stay within limits.
  for (let i = 0; i < ops.length; i += 500) await db.$transaction(ops.slice(i, i + 500));
}
