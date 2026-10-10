import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConductStatus, NotificationKind, Prisma, ResultLevel, Role, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { recomputeResults } from '../grades/results';
import { YEAR } from '../grades/tt22';
import { NotificationsService } from '../notifications/notifications.service';
import { ParentAccessService } from '../parents/parent-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { StudentAccessService } from '../students/student-access.service';
import { approvedNotification, canApprove, canReopen, canReview, canSelfAssess, computeTotal, ConductRuleError, levelFor, validateItems } from './conduct-rules';
import { ClassQuery, ClassStudentsDto, OpenClassDto, ReviewDto, SelfAssessDto, SemesterMonthQuery } from './conduct.dto';
import { Criterion, CriteriaService } from './criteria.service';

const studentSelect = { id: true, code: true, fullName: true } satisfies Prisma.StudentSelect;
const classSelect = { id: true, name: true, gradeLevel: true, academicYearId: true, homeroomTeacherId: true } satisfies Prisma.ClassSelect;
const itemInclude = {
  criterion: { select: { id: true, code: true, name: true, maxPoints: true, groupName: true, sortOrder: true, isActive: true } },
} satisfies Prisma.ConductAssessmentItemInclude;
const assessmentInclude = {
  items: { include: itemInclude },
  student: { select: studentSelect },
  class: { select: classSelect },
} satisfies Prisma.ConductAssessmentInclude;

type ClassRef = Prisma.ClassGetPayload<{ select: typeof classSelect }>;
type Assessment = Prisma.ConductAssessmentGetPayload<{ include: typeof assessmentInclude }>;
type StudentRef = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

const HOMEROOM_ONLY = 'Bạn không phải giáo viên chủ nhiệm lớp này';
const STATUSES = Object.values(ConductStatus);
const LEVELS = Object.values(ResultLevel);

const emptyStatusCounts = () => Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ConductStatus, number>;
const emptyLevelCounts = () => Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<ResultLevel, number>;

/** The fields every list and detail of an assessment carries. */
function brief(a: Omit<Assessment, 'items' | 'student' | 'class'>) {
  return {
    id: a.id,
    semester: a.semester,
    month: a.month,
    status: a.status,
    selfTotal: a.selfTotal,
    teacherTotal: a.teacherTotal,
    finalTotal: a.finalTotal,
    level: a.level,
    selfComment: a.selfComment,
    teacherComment: a.teacherComment,
    reviewedById: a.reviewedById,
    approvedById: a.approvedById,
    approvedAt: a.approvedAt,
    updatedAt: a.updatedAt,
  };
}

function detail(a: Assessment) {
  const items = [...a.items]
    .sort((x, y) => x.criterion.sortOrder - y.criterion.sortOrder || x.criterion.code.localeCompare(y.criterion.code))
    .map((i) => ({ criterionId: i.criterionId, selfPoints: i.selfPoints, teacherPoints: i.teacherPoints, note: i.note, criterion: i.criterion }));
  return { ...brief(a), student: a.student, class: { id: a.class.id, name: a.class.name, gradeLevel: a.class.gradeLevel }, items };
}

/** Runs a pure rule and turns its violation into a 400. */
function rule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ConductRuleError) throw new BadRequestException(e.message);
    throw e;
  }
}

/**
 * Rèn luyện: a student's self-assessment, the homeroom teacher's review and leadership
 * approval per semester (month 0) or month, ending in TermResult.conduct for the gradebook.
 */
@Injectable()
export class ConductService {
  private readonly logger = new Logger(ConductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly criteria: CriteriaService,
    private readonly notifications: NotificationsService,
    private readonly years: AcademicYearsService,
    private readonly studentAccess: StudentAccessService,
    private readonly parentAccess: ParentAccessService,
  ) {}

  // ---- Class workflow (portal) ----

  /** Every enrolled student of the class with their assessment for the semester/month, plus counts. */
  async classView(user: AuthUser, query: ClassQuery) {
    const klass = await this.getClass(user.schoolId, query.classId);
    await this.assertHomeroom(user, klass);
    const [roster, criteria] = await Promise.all([this.roster(klass.id), this.criteria.list(user.schoolId)]);
    const assessments = await this.prisma.conductAssessment.findMany({
      where: { classId: klass.id, academicYearId: klass.academicYearId, semester: query.semester, month: query.month, studentId: { in: roster.map((s) => s.id) } },
    });
    const byStudent = new Map(assessments.map((a) => [a.studentId, a]));
    const rows = roster.map((student) => {
      const a = byStudent.get(student.id);
      return { student, assessment: a ? brief(a) : null };
    });
    const summary = { total: rows.length, opened: 0, status: emptyStatusCounts(), level: emptyLevelCounts() };
    for (const r of rows) {
      if (!r.assessment) continue;
      summary.opened++;
      summary.status[r.assessment.status]++;
      if (r.assessment.level) summary.level[r.assessment.level]++;
    }
    return { class: this.classRef(klass), semester: query.semester, month: query.month, criteria, rows, summary };
  }

  /** Creates a DRAFT assessment (with empty items) for every student of the class who has none. */
  async open(user: AuthUser, dto: OpenClassDto) {
    const klass = await this.getClass(user.schoolId, dto.classId);
    await this.assertHomeroom(user, klass);
    const [roster, criteria] = await Promise.all([this.roster(klass.id), this.criteria.active(user.schoolId)]);
    const existing = await this.prisma.conductAssessment.findMany({
      where: { academicYearId: klass.academicYearId, semester: dto.semester, month: dto.month, studentId: { in: roster.map((s) => s.id) } },
      select: { studentId: true },
    });
    const has = new Set(existing.map((a) => a.studentId));
    const missing = roster.filter((s) => !has.has(s.id));
    let created = 0;
    for (const s of missing) {
      await this.createDraft(user.schoolId, klass, s.id, dto.semester, dto.month, criteria);
      created++;
    }
    return { created, total: roster.length };
  }

  /** One assessment with its items joined to their criteria. */
  async get(user: AuthUser, id: string) {
    const a = await this.find(user.schoolId, id);
    await this.assertHomeroom(user, a.class);
    return detail(a);
  }

  /** The homeroom teacher's points per criterion; moves the assessment to REVIEWED. */
  async review(user: AuthUser, id: string, dto: ReviewDto) {
    const a = await this.find(user.schoolId, id);
    await this.assertHomeroom(user, a.class);
    if (!canReview(a.status)) throw new BadRequestException('Đánh giá đã được duyệt, hãy mở lại trước khi sửa');
    const criteria = await this.criteria.active(user.schoolId);
    const items = this.dedupe(dto.items.map((i) => ({ criterionId: i.criterionId, points: i.teacherPoints, note: i.note })));
    rule(() => validateItems(items, criteria));
    const teacherTotal = rule(() => computeTotal(items, criteria));
    await this.prisma.$transaction([
      ...items.map((i) =>
        this.prisma.conductAssessmentItem.upsert({
          where: { assessmentId_criterionId: { assessmentId: a.id, criterionId: i.criterionId } },
          create: { assessmentId: a.id, criterionId: i.criterionId, teacherPoints: i.points, note: i.note ?? null },
          update: { teacherPoints: i.points, note: i.note === undefined ? undefined : i.note || null },
        }),
      ),
      this.prisma.conductAssessment.update({
        where: { id: a.id },
        data: { teacherTotal, teacherComment: dto.teacherComment === undefined ? undefined : dto.teacherComment.trim() || null, status: ConductStatus.REVIEWED, reviewedById: user.userId },
      }),
    ]);
    return detail(await this.find(user.schoolId, a.id));
  }

  /**
   * Leadership approval: REVIEWED assessments get their final total and level; for the
   * semester (month 0) the level is written to TermResult.conduct, the year results of
   * those students are refreshed (year conduct, title, promotion) and the family is told.
   */
  async approve(user: AuthUser, dto: ClassStudentsDto) {
    const klass = await this.getClass(user.schoolId, dto.classId);
    const candidates = await this.candidates(klass, dto);
    if (dto.studentIds?.length) {
      const blocked = candidates.filter((a) => !canApprove(a.status) && a.status !== ConductStatus.APPROVED);
      if (blocked.length) throw new BadRequestException(`Có ${blocked.length} học sinh chưa được giáo viên chủ nhiệm đánh giá`);
      const missing = dto.studentIds.filter((id) => !candidates.some((a) => a.studentId === id));
      if (missing.length) throw new BadRequestException(`Có ${missing.length} học sinh chưa có phiếu đánh giá`);
    }
    const targets = candidates.filter((a) => canApprove(a.status));
    const now = new Date();
    const results = targets.map((a) => {
      const finalTotal = a.teacherTotal ?? 0;
      return { a, finalTotal, level: levelFor(finalTotal) };
    });
    await this.prisma.$transaction([
      ...results.map(({ a, finalTotal, level }) =>
        this.prisma.conductAssessment.update({
          where: { id: a.id },
          data: { finalTotal, level, status: ConductStatus.APPROVED, approvedById: user.userId, approvedAt: now },
        }),
      ),
      ...(dto.month === 0
        ? results.map(({ a, level }) =>
            this.prisma.termResult.upsert({
              where: { studentId_academicYearId_semester: { studentId: a.studentId, academicYearId: klass.academicYearId, semester: dto.semester } },
              create: { schoolId: user.schoolId, academicYearId: klass.academicYearId, semester: dto.semester, classId: klass.id, studentId: a.studentId, conduct: level },
              update: { conduct: level, classId: klass.id },
            }),
          )
        : []),
    ]);
    if (dto.month === 0 && results.length) {
      await recomputeResults(this.prisma, { schoolId: user.schoolId, academicYearId: klass.academicYearId, classId: klass.id, studentIds: results.map((r) => r.a.studentId) });
      for (const r of results) await this.notifyApproved(user.schoolId, klass, r.a, r.level, r.finalTotal);
    }
    return { approved: results.length };
  }

  /** Sends APPROVED assessments back to REVIEWED and clears the conduct level of the semester and the year in TermResult. */
  async reopen(user: AuthUser, dto: ClassStudentsDto) {
    const klass = await this.getClass(user.schoolId, dto.classId);
    const targets = (await this.candidates(klass, dto)).filter((a) => canReopen(a.status));
    if (!targets.length) return { reopened: 0 };
    const ids = targets.map((a) => a.id);
    await this.prisma.$transaction([
      this.prisma.conductAssessment.updateMany({
        where: { id: { in: ids } },
        data: { status: ConductStatus.REVIEWED, finalTotal: null, level: null, approvedById: null, approvedAt: null },
      }),
      ...(dto.month === 0
        ? [
            this.prisma.termResult.updateMany({
              where: { academicYearId: klass.academicYearId, semester: { in: [dto.semester, YEAR] }, studentId: { in: targets.map((a) => a.studentId) } },
              data: { conduct: null },
            }),
          ]
        : []),
    ]);
    if (dto.month === 0) await recomputeResults(this.prisma, { schoolId: user.schoolId, academicYearId: klass.academicYearId, classId: klass.id, studentIds: targets.map((a) => a.studentId) });
    return { reopened: ids.length };
  }

  /** Per class of the current year: students, assessment statuses and approved levels (semester, month 0). */
  async summary(schoolId: string, semester: number) {
    const year = await this.years.current(schoolId);
    const classes = await this.prisma.class.findMany({
      where: { schoolId, academicYearId: year.id },
      select: {
        id: true,
        name: true,
        gradeLevel: true,
        homeroomTeacher: { select: { id: true, fullName: true } },
        _count: { select: { enrollments: { where: { student: { status: StudentStatus.STUDYING } } } } },
      },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
    const where = { schoolId, academicYearId: year.id, semester, month: 0 };
    const [byStatus, byLevel] = await Promise.all([
      this.prisma.conductAssessment.groupBy({ by: ['classId', 'status'], where, _count: { _all: true } }),
      this.prisma.conductAssessment.groupBy({ by: ['classId', 'level'], where: { ...where, level: { not: null } }, _count: { _all: true } }),
    ]);
    const rows = classes.map((c) => {
      const status = emptyStatusCounts();
      const level = emptyLevelCounts();
      for (const g of byStatus) if (g.classId === c.id) status[g.status] += g._count._all;
      for (const g of byLevel) if (g.classId === c.id && g.level) level[g.level] += g._count._all;
      return { class: { id: c.id, name: c.name, gradeLevel: c.gradeLevel, homeroomTeacher: c.homeroomTeacher }, students: c._count.enrollments, status, level };
    });
    const totals = { students: 0, status: emptyStatusCounts(), level: emptyLevelCounts() };
    for (const r of rows) {
      totals.students += r.students;
      for (const s of STATUSES) totals.status[s] += r.status[s];
      for (const l of LEVELS) totals.level[l] += r.level[l];
    }
    return { academicYear: { id: year.id, name: year.name }, semester, rows, totals };
  }

  // ---- Student app ----

  /** The signed-in student's assessment with items and the criteria; a semester DRAFT is created on first view. */
  async forStudent(user: AuthUser, query: SemesterMonthQuery) {
    const s = await this.studentAccess.current(user);
    if (!s.class || !s.academicYear) throw new BadRequestException('Học sinh chưa được xếp lớp');
    const criteria = await this.criteria.active(user.schoolId);
    let a = await this.findOwn(s.id, s.academicYear.id, query.semester, query.month);
    if (!a && query.month === 0) {
      const klass = await this.getClass(user.schoolId, s.class.id);
      a = await this.createDraft(user.schoolId, klass, s.id, query.semester, query.month, criteria);
    }
    return this.readShape({ id: s.id, code: s.code, fullName: s.fullName, class: s.class }, s.academicYear, query, criteria, a);
  }

  /** The student's own points; allowed until the homeroom teacher reviews. */
  async selfAssess(user: AuthUser, dto: SelfAssessDto) {
    const s = await this.studentAccess.current(user);
    if (!s.class || !s.academicYear) throw new BadRequestException('Học sinh chưa được xếp lớp');
    const criteria = await this.criteria.active(user.schoolId);
    let a = await this.findOwn(s.id, s.academicYear.id, dto.semester, dto.month);
    if (!a) {
      if (dto.month !== 0) throw new NotFoundException('Chưa mở đợt đánh giá tháng này');
      a = await this.createDraft(user.schoolId, await this.getClass(user.schoolId, s.class.id), s.id, dto.semester, dto.month, criteria);
    }
    if (!canSelfAssess(a.status)) throw new BadRequestException('Giáo viên chủ nhiệm đã đánh giá, không thể sửa tự đánh giá');
    const items = this.dedupe(dto.items.map((i) => ({ criterionId: i.criterionId, points: i.selfPoints, note: i.note })));
    rule(() => validateItems(items, criteria));
    const selfTotal = rule(() => computeTotal(items, criteria));
    await this.prisma.$transaction([
      ...items.map((i) =>
        this.prisma.conductAssessmentItem.upsert({
          where: { assessmentId_criterionId: { assessmentId: a!.id, criterionId: i.criterionId } },
          create: { assessmentId: a!.id, criterionId: i.criterionId, selfPoints: i.points, note: i.note ?? null },
          update: { selfPoints: i.points, note: i.note === undefined ? undefined : i.note || null },
        }),
      ),
      this.prisma.conductAssessment.update({
        where: { id: a.id },
        data: { selfTotal, selfComment: dto.selfComment === undefined ? undefined : dto.selfComment.trim() || null, status: ConductStatus.SELF_ASSESSED },
      }),
    ]);
    const fresh = await this.find(user.schoolId, a.id);
    return this.readShape({ id: s.id, code: s.code, fullName: s.fullName, class: s.class }, s.academicYear, dto, criteria, fresh);
  }

  /** Every assessment of the student, newest year and semester first. */
  async history(user: AuthUser) {
    const s = await this.studentAccess.current(user);
    return this.historyOf(s.id);
  }

  // ---- Parent app ----

  /** A child's assessment, read-only, for the class the child is in now. */
  async forParent(user: AuthUser, studentId: string, query: SemesterMonthQuery) {
    const child = await this.parentAccess.assertChild(user, studentId);
    const criteria = await this.criteria.active(user.schoolId);
    const student = { id: child.id, code: child.code, fullName: child.fullName, class: child.class };
    if (!child.class) return this.readShape(student, null, query, criteria, null);
    const klass = await this.prisma.class.findUniqueOrThrow({ where: { id: child.class.id }, select: { academicYear: { select: { id: true, name: true } } } });
    const a = await this.findOwn(child.id, klass.academicYear.id, query.semester, query.month);
    return { ...this.readShape(student, klass.academicYear, query, criteria, a), history: await this.historyOf(child.id) };
  }

  // ---- internals ----

  private async getClass(schoolId: string, classId: string): Promise<ClassRef> {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: classSelect });
    if (!klass) throw new NotFoundException('Không tìm thấy lớp');
    return klass;
  }

  private classRef(klass: ClassRef) {
    return { id: klass.id, name: klass.name, gradeLevel: klass.gradeLevel, homeroomTeacherId: klass.homeroomTeacherId };
  }

  /** Office accounts act on any class; a teacher only on the class they are homeroom teacher of. */
  private async assertHomeroom(user: AuthUser, klass: { homeroomTeacherId: string | null }) {
    if (user.role !== Role.TEACHER) return;
    const teacher = await this.prisma.teacher.findFirst({ where: { userId: user.userId, schoolId: user.schoolId }, select: { id: true } });
    if (!teacher || klass.homeroomTeacherId !== teacher.id) throw new ForbiddenException(HOMEROOM_ONLY);
  }

  private async roster(classId: string): Promise<StudentRef[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { classId, student: { status: StudentStatus.STUDYING } },
      select: { student: { select: studentSelect } },
      orderBy: { student: { fullName: 'asc' } },
    });
    return rows.map((r) => r.student);
  }

  private async find(schoolId: string, id: string): Promise<Assessment> {
    const a = await this.prisma.conductAssessment.findFirst({ where: { id, schoolId }, include: assessmentInclude });
    if (!a) throw new NotFoundException('Không tìm thấy phiếu đánh giá');
    return a;
  }

  private findOwn(studentId: string, academicYearId: string, semester: number, month: number) {
    return this.prisma.conductAssessment.findFirst({ where: { studentId, academicYearId, semester, month }, include: assessmentInclude });
  }

  /** Assessments of the class for the round, or only those of the given students. */
  private candidates(klass: ClassRef, dto: ClassStudentsDto) {
    return this.prisma.conductAssessment.findMany({
      where: {
        classId: klass.id,
        academicYearId: klass.academicYearId,
        semester: dto.semester,
        month: dto.month,
        ...(dto.studentIds?.length ? { studentId: { in: dto.studentIds } } : {}),
      },
      include: { student: { select: { id: true, fullName: true, userId: true } } },
    });
  }

  private createDraft(schoolId: string, klass: ClassRef, studentId: string, semester: number, month: number, criteria: Criterion[]) {
    return this.prisma.conductAssessment.create({
      data: {
        schoolId,
        academicYearId: klass.academicYearId,
        semester,
        month,
        classId: klass.id,
        studentId,
        status: ConductStatus.DRAFT,
        items: { createMany: { data: criteria.map((c) => ({ criterionId: c.id })) } },
      },
      include: assessmentInclude,
    });
  }

  /** Last entry wins when a criterion is sent twice. */
  private dedupe<T extends { criterionId: string }>(items: T[]): T[] {
    return [...new Map(items.map((i) => [i.criterionId, i])).values()];
  }

  private historyOf(studentId: string) {
    return this.prisma.conductAssessment.findMany({
      where: { studentId },
      select: {
        id: true,
        semester: true,
        month: true,
        status: true,
        selfTotal: true,
        teacherTotal: true,
        finalTotal: true,
        level: true,
        approvedAt: true,
        academicYear: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
      orderBy: [{ academicYear: { startDate: 'desc' } }, { semester: 'desc' }, { month: 'asc' }],
    });
  }

  private readShape(
    student: { id: string; code: string; fullName: string; class: { id: string; name: string } | null },
    academicYear: { id: string; name: string } | null,
    query: { semester: number; month: number },
    criteria: Criterion[],
    a: Assessment | null,
  ) {
    return {
      student: { id: student.id, code: student.code, fullName: student.fullName, class: student.class ? { id: student.class.id, name: student.class.name } : null },
      academicYear,
      semester: query.semester,
      month: query.month,
      criteria,
      assessment: a ? detail(a) : null,
    };
  }

  private async notifyApproved(schoolId: string, klass: ClassRef, a: { id: string; semester: number; month: number; studentId: string; student: { userId: string | null } }, level: ResultLevel, total: number) {
    const input = {
      kind: NotificationKind.CONDUCT_APPROVED,
      ...approvedNotification(a.semester, level, total),
      data: { assessmentId: a.id, classId: klass.id, className: klass.name, semester: a.semester, month: a.month, level, total },
      studentId: a.studentId,
    };
    try {
      if (a.student.userId) await this.notifications.notifyUsers(schoolId, [a.student.userId], input);
      await this.notifications.notifyGuardians(schoolId, a.studentId, input);
    } catch (e) {
      // The approval is saved already; a failed alert must not fail the request.
      this.logger.error(`conduct alert failed for ${a.studentId}: ${(e as Error).message}`);
    }
  }
}
