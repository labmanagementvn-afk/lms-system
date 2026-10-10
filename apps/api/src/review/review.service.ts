import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssessmentType, Prisma, PromotionStatus, ResultLevel, Role, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { DEFAULT_SETTING, loadSettings, num, orderSubjects, recomputeResults, SubjectSettingLike } from '../grades/results';
import { assertMark, MAX_ABSENT_DAYS, needsRetake, promotionReason, reviewKind, SubjectOutcome, YEAR } from '../grades/tt22';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterAllDto, RetakeResultsDto, RetakeSubjectsDto, ReviewScopeQuery, TrainingDto } from './review.dto';

/**
 * Why a student is on the retake list: not promoted because learning failed
 * (Điều 14 TT22), or a grade 9 subject at Chưa đạt that holds back the THCS
 * completion review.
 */
export type RetakeReason = 'PROMOTION' | 'COMPLETION';

const OFFICE: Role[] = [Role.ADMIN, Role.STAFF];
const NOT_IN_YEAR = 'Không tìm thấy học sinh trong năm học hiện tại';

const yearTermSelect = {
  studentId: true,
  academic: true,
  conduct: true,
  absentDays: true,
  promotion: true,
  academicAfterRetake: true,
  conductAfterTraining: true,
  promotionOverride: true,
} as const;
type YearTerm = Prisma.TermResultGetPayload<{ select: typeof yearTermSelect }>;

interface ClassRef {
  id: string;
  name: string;
  gradeLevel: number;
  homeroomTeacherId: string | null;
}
interface SubjectRef {
  id: string;
  code: string;
  name: string;
}

const byClassThenName = <T extends { class: { gradeLevel: number; name: string }; fullName: string }>(a: T, b: T) =>
  a.class.gradeLevel - b.class.gradeLevel || a.class.name.localeCompare(b.class.name, 'vi', { numeric: true }) || a.fullName.localeCompare(b.fullName, 'vi');

/**
 * The summer review after the school year (Điều 12 to 14 TT22): retakes of the
 * subjects a student failed, summer training for failed conduct, and the
 * promotion that follows from both.
 */
@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  /** Students of the current year in scope, with their year results, subjects and summer review. */
  private async load(schoolId: string, query: ReviewScopeQuery & { studentId?: string }) {
    const year = await this.years.current(schoolId);
    const classes: ClassRef[] = await this.prisma.class.findMany({
      where: { schoolId, academicYearId: year.id, ...(query.gradeLevel ? { gradeLevel: query.gradeLevel } : {}), ...(query.classId ? { id: query.classId } : {}) },
      select: { id: true, name: true, gradeLevel: true, homeroomTeacherId: true },
    });
    if (query.classId && !classes.length) throw new NotFoundException('Không tìm thấy lớp');
    const classOf = new Map(classes.map((c) => [c.id, c]));
    const enrollments = await this.prisma.enrollment.findMany({
      where: { academicYearId: year.id, classId: { in: [...classOf.keys()] }, student: { status: StudentStatus.STUDYING }, ...(query.studentId ? { studentId: query.studentId } : {}) },
      select: { classId: true, student: { select: { id: true, code: true, fullName: true } } },
    });
    const studentIds = enrollments.map((e) => e.student.id);
    const [terms, results, retakes, trainings, settings, subjects] = await Promise.all([
      this.prisma.termResult.findMany({ where: { academicYearId: year.id, semester: YEAR, studentId: { in: studentIds } }, select: yearTermSelect }),
      this.prisma.subjectResult.findMany({
        where: { academicYearId: year.id, semester: YEAR, studentId: { in: studentIds }, exempt: false },
        select: { studentId: true, subjectId: true, average: true, passed: true },
      }),
      this.prisma.subjectRetake.findMany({
        where: { academicYearId: year.id, studentId: { in: studentIds } },
        select: { id: true, studentId: true, subjectId: true, score: true, passed: true, note: true, enteredAt: true },
      }),
      this.prisma.summerTraining.findMany({
        where: { academicYearId: year.id, studentId: { in: studentIds } },
        select: { id: true, studentId: true, tasks: true, result: true, comment: true, assignedAt: true, evaluatedAt: true },
      }),
      loadSettings(this.prisma, schoolId),
      this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, code: true, name: true } }),
    ]);
    const settingOf = (subjectId: string): SubjectSettingLike => settings.get(subjectId) ?? DEFAULT_SETTING;
    const order = new Map(orderSubjects(subjects).map((s, i) => [s.id, i]));
    const subjectOf = new Map<string, SubjectRef>(subjects.map((s) => [s.id, s]));
    const students = enrollments.map(({ classId, student }) => {
      const term = terms.find((t) => t.studentId === student.id) ?? null;
      const outcomes = results
        .filter((r) => r.studentId === student.id)
        .map((r) => ({ subjectId: r.subjectId, outcome: { assessment: settingOf(r.subjectId).assessment, average: num(r.average), passed: r.passed } as SubjectOutcome }))
        .sort((a, b) => (order.get(a.subjectId) ?? 99) - (order.get(b.subjectId) ?? 99));
      return {
        ...student,
        class: classOf.get(classId)!,
        term,
        outcomes,
        retakes: retakes.filter((r) => r.studentId === student.id).sort((a, b) => (order.get(a.subjectId) ?? 99) - (order.get(b.subjectId) ?? 99)),
        training: trainings.find((t) => t.studentId === student.id) ?? null,
      };
    });
    students.sort(byClassThenName);
    return { year, students, subjectOf, settingOf };
  }

  private async termOf(schoolId: string, studentId: string) {
    const year = await this.years.current(schoolId);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, academicYearId: year.id, student: { schoolId, status: StudentStatus.STUDYING } },
      select: { class: { select: { id: true, name: true, gradeLevel: true, homeroomTeacherId: true } } },
    });
    if (!enrollment) throw new NotFoundException(NOT_IN_YEAR);
    return { year, klass: enrollment.class };
  }

  private recompute(schoolId: string, academicYearId: string, classId: string, studentIds: string[]) {
    return recomputeResults(this.prisma, { schoolId, academicYearId, classId, studentIds });
  }

  // ---- retakes (kiểm tra lại) ----

  /** Why a student needs retakes, if at all. */
  private retakeReason(s: { class: ClassRef; term: YearTerm | null; outcomes: { outcome: SubjectOutcome }[] }): RetakeReason | null {
    const t = s.term;
    if (!t?.academic || !t.conduct) return null;
    if (reviewKind(t.academic, t.conduct) === 'RETAKE' && t.absentDays <= MAX_ABSENT_DAYS) return 'PROMOTION';
    const failedComment = s.outcomes.some(({ outcome }) => outcome.assessment === AssessmentType.COMMENT && outcome.passed === false);
    if (s.class.gradeLevel === 9 && t.academic !== ResultLevel.CHUA_DAT && failedComment) return 'COMPLETION';
    return null;
  }

  /**
   * Subjects the student may retake: every subject at Chưa đạt or with a year
   * average under 5.0 (Điều 14), or for the completion review only the subjects
   * at Chưa đạt.
   */
  private eligibleSubjects(reason: RetakeReason | null, outcomes: { subjectId: string; outcome: SubjectOutcome }[]) {
    return outcomes.filter(({ outcome }) => (reason === 'COMPLETION' ? outcome.assessment === AssessmentType.COMMENT && outcome.passed === false : needsRetake(outcome)));
  }

  private retakeRow(s: Awaited<ReturnType<ReviewService['load']>>['students'][number], subjectOf: Map<string, SubjectRef>, settingOf: (id: string) => SubjectSettingLike) {
    const reason = this.retakeReason(s);
    const subject = (id: string) => ({ subjectId: id, code: subjectOf.get(id)?.code ?? '', name: subjectOf.get(id)?.name ?? '', assessment: settingOf(id).assessment });
    const yearOf = (id: string) => s.outcomes.find((o) => o.subjectId === id)?.outcome;
    const t = s.term;
    return {
      id: s.id,
      code: s.code,
      fullName: s.fullName,
      class: { id: s.class.id, name: s.class.name, gradeLevel: s.class.gradeLevel },
      academic: t?.academic ?? null,
      conduct: t?.conduct ?? null,
      absentDays: t?.absentDays ?? 0,
      academicAfterRetake: t?.academicAfterRetake ?? null,
      promotion: t?.promotion ?? null,
      promotionSetByHand: !!t?.promotionOverride,
      reason,
      eligible: this.eligibleSubjects(reason, s.outcomes).map(({ subjectId, outcome }) => ({ ...subject(subjectId), average: outcome.average, passed: outcome.passed })),
      retakes: s.retakes.map((r) => ({
        id: r.id,
        ...subject(r.subjectId),
        yearAverage: yearOf(r.subjectId)?.average ?? null,
        yearPassed: yearOf(r.subjectId)?.passed ?? null,
        score: num(r.score),
        passed: r.passed,
        note: r.note,
        entered: r.enteredAt !== null,
      })),
    };
  }

  /** Students who retake subjects or may, with the subjects, the marks entered and the outcome. */
  async retakes(schoolId: string, query: ReviewScopeQuery & { studentId?: string }) {
    const { year, students, subjectOf, settingOf } = await this.load(schoolId, query);
    const rows = students.map((s) => this.retakeRow(s, subjectOf, settingOf)).filter((r) => r.reason || r.retakes.length);
    const retakes = rows.flatMap((r) => r.retakes);
    return {
      academicYear: { id: year.id, name: year.name },
      students: rows,
      summary: {
        students: rows.length,
        unregistered: rows.filter((r) => r.reason && !r.retakes.length).length,
        subjects: retakes.length,
        entered: retakes.filter((r) => r.entered).length,
        promoted: rows.filter((r) => r.reason === 'PROMOTION' && r.promotion === PromotionStatus.PROMOTED).length,
        retained: rows.filter((r) => r.reason === 'PROMOTION' && r.promotion === PromotionStatus.RETAINED).length,
      },
    };
  }

  private async retakeStudent(schoolId: string, studentId: string) {
    const r = await this.retakes(schoolId, { studentId });
    return r.students[0] ?? null;
  }

  /** Sets the subjects a student retakes: new ones are registered, the ones left out are dropped. */
  async setRetakes(user: AuthUser, studentId: string, dto: RetakeSubjectsDto) {
    const { year, klass } = await this.termOf(user.schoolId, studentId);
    const { students } = await this.load(user.schoolId, { classId: klass.id, studentId });
    const s = students[0];
    if (!s) throw new NotFoundException(NOT_IN_YEAR);
    const reason = this.retakeReason(s);
    if (!reason && !s.retakes.length) throw new BadRequestException('Học sinh không thuộc diện kiểm tra lại');
    const allowed = new Set(this.eligibleSubjects(reason, s.outcomes).map((o) => o.subjectId));
    const wanted = [...new Set(dto.subjectIds)];
    const existing = new Map(s.retakes.map((r) => [r.subjectId, r]));
    const invalid = wanted.filter((id) => !existing.has(id) && !allowed.has(id));
    if (invalid.length) throw new BadRequestException('Có môn không thuộc diện kiểm tra lại của học sinh');
    const dropped = s.retakes.filter((r) => !wanted.includes(r.subjectId));
    if (dropped.some((r) => r.enteredAt)) throw new BadRequestException('Không bỏ được môn đã có kết quả kiểm tra lại; hãy xóa kết quả trước');
    await this.prisma.$transaction([
      this.prisma.subjectRetake.deleteMany({ where: { id: { in: dropped.map((r) => r.id) } } }),
      this.prisma.subjectRetake.createMany({
        data: wanted.filter((id) => !existing.has(id)).map((subjectId) => ({ schoolId: user.schoolId, academicYearId: year.id, classId: klass.id, studentId, subjectId, createdById: user.userId })),
      }),
    ]);
    await this.recompute(user.schoolId, year.id, klass.id, [studentId]);
    return this.retakeStudent(user.schoolId, studentId);
  }

  /** Registers every eligible subject for the students on the list who have none registered yet. */
  async registerAll(user: AuthUser, dto: RegisterAllDto) {
    const { year, students } = await this.load(user.schoolId, dto);
    const data: Prisma.SubjectRetakeCreateManyInput[] = [];
    const touched = new Map<string, string[]>();
    for (const s of students) {
      const reason = this.retakeReason(s);
      if (!reason || s.retakes.length) continue;
      const subjects = this.eligibleSubjects(reason, s.outcomes);
      if (!subjects.length) continue;
      for (const { subjectId } of subjects) data.push({ schoolId: user.schoolId, academicYearId: year.id, classId: s.class.id, studentId: s.id, subjectId, createdById: user.userId });
      touched.set(s.class.id, [...(touched.get(s.class.id) ?? []), s.id]);
    }
    await this.prisma.subjectRetake.createMany({ data, skipDuplicates: true });
    for (const [classId, ids] of touched) await this.recompute(user.schoolId, year.id, classId, ids);
    return { students: [...touched.values()].flat().length, subjects: data.length };
  }

  /** Enters retake results. Teachers may enter them only for subjects they teach. */
  async saveResults(user: AuthUser, dto: RetakeResultsDto) {
    const ids = [...new Set(dto.entries.map((e) => e.retakeId))];
    const rows = await this.prisma.subjectRetake.findMany({
      where: { id: { in: ids }, schoolId: user.schoolId },
      select: { id: true, academicYearId: true, classId: true, studentId: true, subjectId: true, subject: { select: { name: true } } },
    });
    if (rows.length !== ids.length) throw new NotFoundException('Không tìm thấy môn kiểm tra lại');
    if (user.role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({ where: { userId: user.userId, schoolId: user.schoolId }, select: { subjects: { select: { subjectId: true } } } });
      const taught = new Set(teacher?.subjects.map((s) => s.subjectId) ?? []);
      const foreign = rows.find((r) => !taught.has(r.subjectId));
      if (foreign) throw new ForbiddenException(`Giáo viên chỉ nhập kết quả kiểm tra lại môn mình dạy (${foreign.subject.name})`);
    } else if (!OFFICE.includes(user.role)) {
      throw new ForbiddenException();
    }
    const settings = await loadSettings(this.prisma, user.schoolId);
    const now = new Date();
    const updates = dto.entries.map((e) => {
      const row = rows.find((r) => r.id === e.retakeId)!;
      const comment = (settings.get(row.subjectId) ?? DEFAULT_SETTING).assessment === AssessmentType.COMMENT;
      if (comment && e.score !== undefined && e.score !== null) throw new BadRequestException(`Môn ${row.subject.name} đánh giá bằng nhận xét: chọn Đạt hoặc Chưa đạt`);
      if (!comment && e.passed !== undefined && e.passed !== null) throw new BadRequestException(`Môn ${row.subject.name} đánh giá bằng điểm số: nhập điểm`);
      if (e.score !== undefined && e.score !== null) assertMark(e.score);
      const data: Prisma.SubjectRetakeUncheckedUpdateInput = {};
      if (e.score !== undefined) data.score = e.score;
      if (e.passed !== undefined) data.passed = e.passed;
      if (e.note !== undefined) data.note = e.note?.trim() || null;
      const result = comment ? e.passed : e.score;
      if (result !== undefined) {
        data.enteredById = result === null ? null : user.userId;
        data.enteredAt = result === null ? null : now;
      }
      return this.prisma.subjectRetake.update({ where: { id: row.id }, data });
    });
    await this.prisma.$transaction(updates);
    const byClass = new Map<string, { academicYearId: string; students: Set<string> }>();
    for (const r of rows) {
      const entry = byClass.get(r.classId) ?? { academicYearId: r.academicYearId, students: new Set<string>() };
      entry.students.add(r.studentId);
      byClass.set(r.classId, entry);
    }
    for (const [classId, { academicYearId, students }] of byClass) await this.recompute(user.schoolId, academicYearId, classId, [...students]);
    return { saved: updates.length };
  }

  // ---- summer training (rèn luyện hè) ----

  private trainingRow(s: Awaited<ReturnType<ReviewService['load']>>['students'][number]) {
    const t = s.term;
    return {
      id: s.id,
      code: s.code,
      fullName: s.fullName,
      class: { id: s.class.id, name: s.class.name, gradeLevel: s.class.gradeLevel },
      homeroomTeacherId: s.class.homeroomTeacherId,
      academic: t?.academic ?? null,
      conduct: t?.conduct ?? null,
      absentDays: t?.absentDays ?? 0,
      conductAfterTraining: t?.conductAfterTraining ?? null,
      promotion: t?.promotion ?? null,
      promotionSetByHand: !!t?.promotionOverride,
      /** Whether the re-evaluation decides promotion: not when learning failed too or absences went over. */
      decides: reviewKind(t?.academic, t?.conduct) === 'TRAINING' && (t?.absentDays ?? 0) <= MAX_ABSENT_DAYS,
      training: s.training,
    };
  }

  /** Students whose year conduct is Chưa đạt, with the tasks set and the re-evaluation. */
  async trainings(schoolId: string, query: ReviewScopeQuery & { studentId?: string }) {
    const { year, students } = await this.load(schoolId, query);
    const rows = students.filter((s) => s.term?.conduct === ResultLevel.CHUA_DAT || s.training).map((s) => this.trainingRow(s));
    return {
      academicYear: { id: year.id, name: year.name },
      students: rows,
      summary: {
        students: rows.length,
        assigned: rows.filter((r) => r.training).length,
        evaluated: rows.filter((r) => r.training?.result).length,
        promoted: rows.filter((r) => r.decides && r.promotion === PromotionStatus.PROMOTED).length,
        retained: rows.filter((r) => r.promotion === PromotionStatus.RETAINED).length,
      },
    };
  }

  /** Sets the tasks and, once the summer is over, the re-evaluated conduct (the homeroom teacher or the office). */
  async saveTraining(user: AuthUser, studentId: string, dto: TrainingDto) {
    const { year, klass } = await this.termOf(user.schoolId, studentId);
    if (user.role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({ where: { userId: user.userId, schoolId: user.schoolId }, select: { id: true } });
      if (!teacher || teacher.id !== klass.homeroomTeacherId) throw new ForbiddenException('Chỉ giáo viên chủ nhiệm lớp mới giao và đánh giá rèn luyện hè');
    }
    const [term, existing] = await Promise.all([
      this.prisma.termResult.findUnique({ where: { studentId_academicYearId_semester: { studentId, academicYearId: year.id, semester: YEAR } }, select: { conduct: true } }),
      this.prisma.summerTraining.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: year.id } }, select: { id: true } }),
    ]);
    if (term?.conduct !== ResultLevel.CHUA_DAT && !existing) throw new BadRequestException('Chỉ học sinh có kết quả rèn luyện cả năm Chưa đạt mới phải rèn luyện trong hè');
    const evaluated = dto.result !== undefined ? { result: dto.result, evaluatedById: dto.result ? user.userId : null, evaluatedAt: dto.result ? new Date() : null } : {};
    const comment = dto.comment === undefined ? {} : { comment: dto.comment?.trim() || null };
    await this.prisma.summerTraining.upsert({
      where: { studentId_academicYearId: { studentId, academicYearId: year.id } },
      create: { schoolId: user.schoolId, academicYearId: year.id, classId: klass.id, studentId, tasks: dto.tasks.trim(), assignedById: user.userId, ...evaluated, ...comment },
      update: { tasks: dto.tasks.trim(), classId: klass.id, ...evaluated, ...comment },
    });
    await this.recompute(user.schoolId, year.id, klass.id, [studentId]);
    return (await this.trainings(user.schoolId, { studentId })).students[0];
  }

  async removeTraining(user: AuthUser, studentId: string) {
    const { year, klass } = await this.termOf(user.schoolId, studentId);
    const { count } = await this.prisma.summerTraining.deleteMany({ where: { studentId, academicYearId: year.id, schoolId: user.schoolId } });
    if (!count) throw new NotFoundException('Học sinh chưa được giao rèn luyện hè');
    await this.recompute(user.schoolId, year.id, klass.id, [studentId]);
    return { deleted: true };
  }

  // ---- promotion after the review ----

  /** Per class, how many students go up, wait on the summer review or stay down; and who is not promoted outright. */
  async promotion(schoolId: string, query: ReviewScopeQuery) {
    const { year, students, subjectOf } = await this.load(schoolId, query);
    const classes = new Map<string, { id: string; name: string; gradeLevel: number; students: number; promoted: number; afterReview: number; retest: number; retained: number; pending: number }>();
    const rows = [];
    for (const s of students) {
      const c = classes.get(s.class.id) ?? { id: s.class.id, name: s.class.name, gradeLevel: s.class.gradeLevel, students: 0, promoted: 0, afterReview: 0, retest: 0, retained: 0, pending: 0 };
      classes.set(s.class.id, c);
      c.students++;
      const t = s.term;
      if (!t?.promotion) c.pending++;
      else if (t.promotion === PromotionStatus.RETEST) c.retest++;
      else if (t.promotion === PromotionStatus.RETAINED) c.retained++;
      else if (t.academic === ResultLevel.CHUA_DAT || t.conduct === ResultLevel.CHUA_DAT || t.promotionOverride) c.afterReview++;
      else c.promoted++;
      if (!t?.promotion) continue;
      const reason = promotionReason(t, s.retakes.map((r) => subjectOf.get(r.subjectId)?.name ?? ''));
      if (!reason) continue;
      rows.push({
        id: s.id,
        code: s.code,
        fullName: s.fullName,
        class: { id: s.class.id, name: s.class.name, gradeLevel: s.class.gradeLevel },
        academic: t.academic,
        conduct: t.conduct,
        absentDays: t.absentDays,
        academicAfterRetake: t.academicAfterRetake,
        conductAfterTraining: t.conductAfterTraining,
        promotion: t.promotion,
        review: t.promotion === PromotionStatus.RETEST ? reviewKind(t.academic, t.conduct) : null,
        promotionSetByHand: !!t.promotionOverride,
        reason,
      });
    }
    return { academicYear: { id: year.id, name: year.name }, classes: [...classes.values()], students: rows };
  }
}
