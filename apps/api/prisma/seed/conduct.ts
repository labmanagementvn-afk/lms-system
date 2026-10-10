import { ConductStatus, Prisma, PrismaClient, ResultLevel } from '@prisma/client';
import { DEFAULT_CRITERIA, levelFor } from '../../src/conduct/conduct-rules';
import { SeedContext } from './context';

// Demo conduct criteria and assessments: 6A1 mid-workflow for semester 1, 7A1 fully approved for both semesters.

type Criterion = { id: string; maxPoints: number };

/** Deterministic per-criterion points adding up to `total`: deductions rotate from criterion `seed`. */
function spread(total: number, criteria: Criterion[], seed: number): number[] {
  const points = criteria.map((c) => c.maxPoints);
  let deficit = points.reduce((a, b) => a + b, 0) - total;
  for (let k = 0; deficit > 0 && k < criteria.length * 10; k++) {
    const i = (seed + k) % criteria.length;
    const take = Math.min(deficit, Math.max(1, Math.floor(points[i] / 3)));
    if (points[i] - take < 0) continue;
    points[i] -= take;
    deficit -= take;
  }
  return points;
}

const SELF_COMMENTS = [
  'Em đi học đầy đủ, chuẩn bị bài trước khi đến lớp.',
  'Em tích cực tham gia hoạt động Đội, cần phát biểu nhiều hơn.',
  'Em tự thấy còn nói chuyện riêng trong giờ, sẽ cố gắng sửa.',
  'Em luôn lễ phép với thầy cô và giúp đỡ bạn bè.',
];
const TEACHER_COMMENTS = [
  'Em ngoan, chăm học, là tấm gương cho các bạn.',
  'Em có tiến bộ rõ rệt, cần giữ vững nề nếp.',
  'Em cần tập trung hơn trong giờ học và hoàn thành bài tập đúng hạn.',
  'Em hòa đồng, tích cực trong hoạt động tập thể.',
];

// Semester totals: 6A1 mostly 85-98, two around 70, one around 55; 7A1 mostly TOT/KHA.
const SELF_6A1 = [96, 92, 88, 95, 90, 98, 85, 71, 69, 56];
const TEACHER_6A1 = [94, 90, 86, 95, 88, 96, 84, 70, 68, 55];
const SELF_7A1 = { 1: [97, 93, 90, 91, 87, 98, 80, 92, 88, 75], 2: [98, 92, 87, 94, 90, 99, 84, 90, 91, 78] };
const TEACHER_7A1 = { 1: [95, 92, 88, 90, 85, 97, 78, 91, 86, 72], 2: [96, 90, 85, 93, 88, 98, 82, 89, 90, 75] };

export async function seedConduct(prisma: PrismaClient, ctx: SeedContext) {
  await prisma.conductCriterion.createMany({ data: DEFAULT_CRITERIA.map((c) => ({ ...c, schoolId: ctx.schoolId })), skipDuplicates: true });
  const rows: ConductRow[] = [];

  // 6A1, semester 1: everyone self-assessed, 8 reviewed by the homeroom teacher, 5 of those approved.
  const class6A1 = ctx.classes['6A1'];
  ctx.studentIds.slice(0, 10).forEach((studentId, i) => {
    rows.push({
      classId: class6A1,
      studentId,
      semester: 1,
      seed: i,
      selfTotal: SELF_6A1[i],
      ...(i < 8 ? { teacherTotal: TEACHER_6A1[i], reviewedById: ctx.teacherUsers.GV001 } : {}),
      ...(i < 5 ? { approved: true, approvedAt: new Date('2027-01-12T02:00:00Z') } : {}),
    });
  });

  // 7A1: both semesters approved so the year view has conduct levels.
  const class7A1 = ctx.classes['7A1'];
  for (const semester of [1, 2] as const) {
    ctx.studentIds.slice(20, 30).forEach((studentId, i) => {
      rows.push({
        classId: class7A1,
        studentId,
        semester,
        seed: i + semester,
        selfTotal: SELF_7A1[semester][i],
        teacherTotal: TEACHER_7A1[semester][i],
        reviewedById: ctx.teacherUsers.GV003,
        approved: true,
        approvedAt: semester === 1 ? new Date('2027-01-12T02:00:00Z') : new Date('2027-05-20T02:00:00Z'),
      });
    });
  }
  await createConductAssessments(prisma, ctx, rows);
}

/** One semester assessment to seed: the student's own total, and the teacher's once reviewed. */
export interface ConductRow {
  classId: string;
  studentId: string;
  semester: number;
  seed: number;
  selfTotal: number;
  teacherTotal?: number;
  reviewedById?: string;
  approved?: boolean;
  approvedAt?: Date;
}

/** Creates the assessments with points per criterion; approved ones also set the semester's conduct level. */
export async function createConductAssessments(prisma: PrismaClient, ctx: SeedContext, rows: ConductRow[]) {
  const { schoolId, academicYearId } = ctx;
  const criteria: Criterion[] = await prisma.conductCriterion.findMany({
    where: { schoolId, isActive: true },
    select: { id: true, maxPoints: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  const termResults: Prisma.TermResultUpsertArgs[] = [];
  for (const r of rows) {
    const self = spread(r.selfTotal, criteria, r.seed);
    const teacher = r.teacherTotal === undefined ? null : spread(r.teacherTotal, criteria, r.seed + 3);
    const status = r.approved ? ConductStatus.APPROVED : teacher ? ConductStatus.REVIEWED : ConductStatus.SELF_ASSESSED;
    const level: ResultLevel | null = r.approved ? levelFor(r.teacherTotal!) : null;
    await prisma.conductAssessment.create({
      data: {
        schoolId,
        academicYearId,
        semester: r.semester,
        month: 0,
        classId: r.classId,
        studentId: r.studentId,
        status,
        selfTotal: r.selfTotal,
        teacherTotal: r.teacherTotal ?? null,
        finalTotal: r.approved ? r.teacherTotal : null,
        level,
        selfComment: SELF_COMMENTS[r.seed % SELF_COMMENTS.length],
        teacherComment: teacher ? TEACHER_COMMENTS[r.seed % TEACHER_COMMENTS.length] : null,
        reviewedById: r.reviewedById ?? null,
        approvedById: r.approved ? ctx.adminUserId : null,
        approvedAt: r.approved ? r.approvedAt : null,
        items: {
          createMany: {
            data: criteria.map((c, i) => ({
              criterionId: c.id,
              selfPoints: self[i],
              teacherPoints: teacher ? teacher[i] : null,
              note: teacher && teacher[i] < self[i] ? 'Còn thiếu sót, cần cố gắng hơn' : null,
            })),
          },
        },
      },
    });
    if (r.approved && level) {
      termResults.push({
        where: { studentId_academicYearId_semester: { studentId: r.studentId, academicYearId, semester: r.semester } },
        create: { schoolId, academicYearId, semester: r.semester, classId: r.classId, studentId: r.studentId, conduct: level },
        update: { conduct: level, classId: r.classId },
      });
    }
  }
  await prisma.$transaction(termResults.map((args) => prisma.termResult.upsert(args)));
}
