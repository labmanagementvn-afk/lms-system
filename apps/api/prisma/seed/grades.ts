import { AssessmentType, PrismaClient, ScoreKind } from '@prisma/client';
import { recomputeResults } from '../../src/grades/results';
import { SeedContext } from './context';

// Subject code -> [assessment, regular marks per semester, periods per year, teacher code].
export const SUBJECTS: Record<string, [AssessmentType, number, number, string]> = {
  TOAN: [AssessmentType.SCORE, 4, 140, 'GV001'],
  VAN: [AssessmentType.SCORE, 4, 140, 'GV002'],
  ANH: [AssessmentType.SCORE, 3, 105, 'GV003'],
  KHTN: [AssessmentType.SCORE, 3, 140, 'GV004'],
  LSDL: [AssessmentType.SCORE, 3, 105, 'GV005'],
  GDCD: [AssessmentType.SCORE, 3, 35, 'GV005'],
  TIN: [AssessmentType.SCORE, 3, 35, 'GV006'],
  CN: [AssessmentType.SCORE, 3, 35, 'GV004'],
  GDTC: [AssessmentType.COMMENT, 3, 70, 'GV007'],
  NT: [AssessmentType.COMMENT, 3, 70, 'GV008'],
};

const EXCELLENT = 0; // first student of 6A1
const WEAK = 15; // sixth student of 6A2

/** Deterministic pseudo-random in [0, 1) from a few integers (xorshift on a mixed seed). */
function rand(...parts: number[]): number {
  let x = 0x9e3779b9;
  for (const p of parts) x = Math.imul(x ^ (p + 0x7f4a7c15), 0x85ebca6b) >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return x / 4294967296;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Marks are given in halves (7.0, 7.5, ...), the usual classroom practice. */
const half = (v: number) => Math.round(v * 2) / 2;

/** One mark for student i, subject s, semester, kind slot k (0 = TX1, ..., 4 = GK, 5 = CK). */
function mark(i: number, s: number, semester: number, k: number): number {
  const base = i === EXCELLENT ? 9.3 : i === WEAK ? 4.7 : 6.2 + rand(i, 1) * 3.0;
  const subjectTweak = (rand(i, s, 2) - 0.5) * 1.4;
  const noise = (rand(i, s, semester, k, 3) - 0.5) * 1.2;
  const spread = i === EXCELLENT ? 0.5 : i === WEAK ? 0.8 : 1;
  return half(clamp(base + (subjectTweak + noise) * spread, 2.0, 10));
}

/** Demo marks and term results: semester 1 for every class, semester 2 for 7A1 (so the year shows up). */
export async function seedGrades(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId, academicYearId, classes, subjects, teachers, studentIds } = ctx;
  const codes = Object.keys(SUBJECTS).filter((c) => subjects[c]);

  await prisma.subjectSetting.createMany({
    data: codes.map((code) => {
      const [assessment, regularCount, periodsPerYear] = SUBJECTS[code];
      return { schoolId, subjectId: subjects[code], assessment, regularCount, periodsPerYear };
    }),
    skipDuplicates: true,
  });

  const classOf = (i: number) => (i < 10 ? classes['6A1'] : i < 20 ? classes['6A2'] : classes['7A1']);
  const rows: {
    schoolId: string;
    academicYearId: string;
    semester: number;
    classId: string;
    studentId: string;
    subjectId: string;
    kind: ScoreKind;
    index: number;
    value: number | null;
    passed: boolean | null;
    note: string | null;
    teacherId: string | null;
  }[] = [];

  studentIds.forEach((studentId, i) => {
    const semesters = i >= 20 ? [1, 2] : [1];
    for (const semester of semesters) {
      codes.forEach((code, s) => {
        const [assessment, regularCount, , teacherCode] = SUBJECTS[code];
        const comment = assessment === AssessmentType.COMMENT;
        const slots: [ScoreKind, number, number][] = [
          ...Array.from({ length: regularCount }, (_, k) => [ScoreKind.TX, k + 1, k] as [ScoreKind, number, number]),
          [ScoreKind.GK, 1, 4],
          [ScoreKind.CK, 1, 5],
        ];
        for (const [kind, index, k] of slots) {
          // The weak student fails GDTC; everyone else passes the comment subjects.
          const passed = comment ? !(i === WEAK && code === 'GDTC' && kind !== ScoreKind.TX) : null;
          const note = kind === ScoreKind.CK && code === 'TOAN' && semester === 1 ? (i === EXCELLENT ? 'Xuất sắc, tư duy tốt' : i === WEAK ? 'Cần được kèm cặp thêm' : null) : null;
          rows.push({
            schoolId,
            academicYearId,
            semester,
            classId: classOf(i),
            studentId,
            subjectId: subjects[code],
            kind,
            index,
            value: comment ? null : mark(i, s, semester, k),
            passed,
            note,
            teacherId: teachers[teacherCode] ?? null,
          });
        }
      });
    }
  });
  await prisma.score.createMany({ data: rows });

  // 7A1's first semester is closed; absences and homeroom comments for its year results.
  await prisma.gradeLock.create({ data: { schoolId, academicYearId, semester: 1, classId: classes['7A1'], lockedById: ctx.adminUserId } });
  for (let i = 20; i < 30; i++) {
    const absentDays = [0, 2, 1, 0, 5, 0, 3, 0, 1, 0][i - 20];
    const homeroomComment = i === 20 ? 'Chăm ngoan, học đều các môn' : i === 24 ? 'Cần đi học đầy đủ hơn' : null;
    await prisma.termResult.upsert({
      where: { studentId_academicYearId_semester: { studentId: studentIds[i], academicYearId, semester: 0 } },
      create: { schoolId, academicYearId, semester: 0, classId: classes['7A1'], studentId: studentIds[i], absentDays, homeroomComment },
      update: { absentDays, homeroomComment },
    });
  }

  // Subject averages, academic levels, titles and promotion; conduct already seeded is kept.
  for (const classId of Object.values(classes)) await recomputeResults(prisma, { schoolId, academicYearId, classId });
}
