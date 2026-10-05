import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AttemptStatus, NotificationKind, Prisma, StudentStatus, TestKind, TestStatus } from '@prisma/client';
import { serializeCsv } from '../admissions/csv';
import { Page, pageArgs } from '../common/pagination';
import { localDate, localTime } from '../common/time';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTestDto, GradeAttemptDto, RandomQuestionsDto, SetTestQuestionsDto, TestQuery, UpdateTestDto } from './assessments.dto';
import { asGrading, percentOf, round2, shortText, shuffle, shuffledOptions, summarizeGrading } from './grading';

export const testQuestionInclude = {
  question: { select: { id: true, type: true, content: true, options: true, answer: true, explanation: true, difficulty: true, subjectId: true, tags: true, isActive: true } },
} satisfies Prisma.TestQuestionInclude;

export type TestQuestionRow = Prisma.TestQuestionGetPayload<{ include: typeof testQuestionInclude }>;

const testInclude = {
  course: { select: { id: true, title: true } },
  subject: { select: { id: true, code: true, name: true } },
  questions: { include: testQuestionInclude, orderBy: { sortOrder: 'asc' } },
  _count: { select: { attempts: true } },
} satisfies Prisma.TestInclude;

type TestRow = Prisma.TestGetPayload<{ include: typeof testInclude }>;

const studentSelect = {
  id: true,
  code: true,
  fullName: true,
  enrollments: { orderBy: { enrolledAt: 'desc' }, take: 1, select: { class: { select: { id: true, name: true } } } },
} satisfies Prisma.StudentSelect;

type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

const FINISHED: AttemptStatus[] = [AttemptStatus.SUBMITTED, AttemptStatus.GRADED];
const DEFAULT_PASS = 50;

export interface AttemptSummary {
  id: string;
  attemptNo: number;
  status: AttemptStatus;
  score: number | null;
  maxScore: number;
  percent: number;
  submittedAt: Date | null;
  durationSec: number | null;
  needsGrading: boolean;
}

export interface LeaderboardRow extends AttemptSummary {
  rank: number;
  student: { id: string; code: string; fullName: string; className: string | null };
}

export const studentRef = (s: StudentRow) => ({ id: s.id, code: s.code, fullName: s.fullName, className: s.enrollments[0]?.class.name ?? null });

export function attemptSummary(a: { id: string; attemptNo: number; status: AttemptStatus; score: Prisma.Decimal | null; maxScore: Prisma.Decimal; submittedAt: Date | null; durationSec: number | null; needsGrading: boolean }): AttemptSummary {
  const maxScore = Number(a.maxScore);
  const score = a.score === null ? null : Number(a.score);
  return { id: a.id, attemptNo: a.attemptNo, status: a.status, score, maxScore, percent: percentOf(score, maxScore), submittedAt: a.submittedAt, durationSec: a.durationSec, needsGrading: a.needsGrading };
}

/** Questions of an attempt in the order (and option order) the student saw them. Answer keys stay in `key`. */
export function attemptQuestions(rows: TestQuestionRow[], attempt: { id: string; questionOrder: string[] }, shuffleOpts: boolean) {
  const byId = new Map(rows.map((r) => [r.questionId, r]));
  const ids = attempt.questionOrder.length ? attempt.questionOrder.filter((id) => byId.has(id)) : rows.map((r) => r.questionId);
  return ids.map((id, index) => {
    const r = byId.get(id)!;
    const q = r.question;
    return {
      id,
      index,
      type: q.type,
      content: q.content,
      options: shuffleOpts ? shuffledOptions(q, `${attempt.id}:${id}`) : q.options,
      points: Number(r.points),
      key: q.answer,
      explanation: q.explanation,
    };
  });
}

/** Bài kiểm tra, bài thi và cuộc thi: lifecycle, question assignment, manual grading, leaderboards and statistics. */
@Injectable()
export class TestsService {
  private readonly logger = new Logger(TestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- listing and CRUD ----

  async list(schoolId: string, query: TestQuery): Promise<Page<unknown>> {
    const where: Prisma.TestWhereInput = {
      schoolId,
      kind: query.kind,
      status: query.status,
      courseId: query.courseId,
      subjectId: query.subjectId,
      gradeLevel: query.gradeLevel,
      title: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.test.findMany({
        where,
        include: { course: { select: { id: true, title: true } }, subject: { select: { id: true, code: true, name: true } }, _count: { select: { questions: true, attempts: true } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.test.count({ where }),
    ]);
    const pending = await this.prisma.testAttempt.groupBy({
      by: ['testId'],
      where: { testId: { in: rows.map((r) => r.id) }, needsGrading: true },
      _count: { _all: true },
    });
    const pendingByTest = new Map(pending.map((p) => [p.testId, p._count._all]));
    const items = rows.map(({ _count, ...t }) => ({ ...t, questionCount: _count.questions, attemptCount: _count.attempts, needsGrading: pendingByTest.get(t.id) ?? 0 }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private async load(schoolId: string, id: string): Promise<TestRow> {
    const t = await this.prisma.test.findFirst({ where: { id, schoolId }, include: testInclude });
    if (!t) throw new NotFoundException('Không tìm thấy bài kiểm tra');
    return t;
  }

  private async present(t: TestRow) {
    const needsGrading = await this.prisma.testAttempt.count({ where: { testId: t.id, needsGrading: true } });
    const { _count, questions, ...rest } = t;
    return {
      ...rest,
      attemptCount: _count.attempts,
      needsGrading,
      questionCount: questions.length,
      maxScore: round2(questions.reduce((s, q) => s + Number(q.points), 0)),
      questions: questions.map((q) => ({ id: q.id, questionId: q.questionId, sortOrder: q.sortOrder, points: Number(q.points), question: q.question })),
    };
  }

  /** The test with its questions and their answer keys (portal only). */
  async get(schoolId: string, id: string) {
    return this.present(await this.load(schoolId, id));
  }

  private async checkRefs(schoolId: string, dto: Partial<CreateTestDto>) {
    if (dto.courseId) {
      const c = await this.prisma.course.findFirst({ where: { id: dto.courseId, schoolId }, select: { id: true } });
      if (!c) throw new BadRequestException('Không tìm thấy khóa học');
    }
    if (dto.subjectId) {
      const s = await this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId }, select: { id: true } });
      if (!s) throw new BadRequestException('Không tìm thấy môn học');
    }
    if (dto.classIds?.length) {
      const ids = [...new Set(dto.classIds)];
      const n = await this.prisma.class.count({ where: { id: { in: ids }, schoolId } });
      if (n !== ids.length) throw new BadRequestException('Có lớp không thuộc trường');
      dto.classIds = ids;
    }
    if (dto.openAt && dto.closeAt && new Date(dto.closeAt) <= new Date(dto.openAt)) throw new BadRequestException('Thời gian đóng phải sau thời gian mở');
  }

  /** Question ids that exist in the school's bank, in the order given, duplicates dropped. */
  private async checkQuestions(schoolId: string, items: { questionId: string; points: number }[]) {
    const seen = new Map<string, number>();
    for (const q of items) if (!seen.has(q.questionId)) seen.set(q.questionId, q.points);
    const ids = [...seen.keys()];
    if (!ids.length) return [];
    const found = await this.prisma.question.count({ where: { id: { in: ids }, schoolId } });
    if (found !== ids.length) throw new BadRequestException('Có câu hỏi không thuộc ngân hàng của trường');
    return ids.map((questionId, sortOrder) => ({ questionId, points: seen.get(questionId)!, sortOrder }));
  }

  private data(dto: Partial<CreateTestDto>): Prisma.TestUpdateInput {
    return {
      kind: dto.kind,
      title: dto.title?.trim(),
      description: dto.description === undefined ? undefined : dto.description.trim() || null,
      course: dto.courseId === undefined ? undefined : dto.courseId ? { connect: { id: dto.courseId } } : { disconnect: true },
      subject: dto.subjectId === undefined ? undefined : dto.subjectId ? { connect: { id: dto.subjectId } } : { disconnect: true },
      gradeLevel: dto.gradeLevel,
      timeLimitMin: dto.timeLimitMin,
      maxAttempts: dto.maxAttempts,
      shuffleQuestions: dto.shuffleQuestions,
      shuffleOptions: dto.shuffleOptions,
      showResults: dto.showResults,
      passPercent: dto.passPercent,
      openAt: dto.openAt === undefined ? undefined : dto.openAt ? new Date(dto.openAt) : null,
      closeAt: dto.closeAt === undefined ? undefined : dto.closeAt ? new Date(dto.closeAt) : null,
      classIds: dto.classIds,
    };
  }

  async create(schoolId: string, userId: string, dto: CreateTestDto) {
    await this.checkRefs(schoolId, dto);
    const questions = await this.checkQuestions(schoolId, dto.questions ?? []);
    const t = await this.prisma.test.create({
      data: {
        ...(this.data(dto) as Prisma.TestCreateInput),
        title: dto.title.trim(),
        kind: dto.kind ?? TestKind.QUIZ,
        // No DB default for scalar lists: an omitted classIds would be stored as NULL and miss the isEmpty filter.
        classIds: dto.classIds ?? [],
        school: { connect: { id: schoolId } },
        createdById: userId,
        questions: { create: questions },
      },
      include: testInclude,
    });
    return this.present(t);
  }

  async update(schoolId: string, id: string, dto: UpdateTestDto) {
    const t = await this.load(schoolId, id);
    if (t.status === TestStatus.CLOSED) throw new BadRequestException('Bài kiểm tra đã đóng, không thể sửa');
    await this.checkRefs(schoolId, dto);
    const merged = { openAt: dto.openAt === undefined ? t.openAt?.toISOString() : dto.openAt, closeAt: dto.closeAt === undefined ? t.closeAt?.toISOString() : dto.closeAt };
    if (merged.openAt && merged.closeAt && new Date(merged.closeAt) <= new Date(merged.openAt)) throw new BadRequestException('Thời gian đóng phải sau thời gian mở');
    const updated = await this.prisma.test.update({ where: { id }, data: this.data(dto), include: testInclude });
    return this.present(updated);
  }

  async remove(schoolId: string, id: string) {
    const t = await this.load(schoolId, id);
    if (t.status !== TestStatus.DRAFT) throw new BadRequestException('Chỉ xóa được bài kiểm tra ở trạng thái nháp');
    await this.prisma.test.delete({ where: { id } });
    return { deleted: true };
  }

  // ---- questions ----

  private assertEditableQuestions(t: TestRow) {
    if (t.status === TestStatus.CLOSED) throw new BadRequestException('Bài kiểm tra đã đóng, không thể thay đổi câu hỏi');
    if (t._count.attempts > 0) throw new BadRequestException('Đã có học sinh làm bài, không thể thay đổi câu hỏi');
  }

  /** Replaces the whole question list. */
  async setQuestions(schoolId: string, id: string, dto: SetTestQuestionsDto) {
    const t = await this.load(schoolId, id);
    this.assertEditableQuestions(t);
    const questions = await this.checkQuestions(schoolId, dto.questions);
    await this.prisma.$transaction([
      this.prisma.testQuestion.deleteMany({ where: { testId: id } }),
      this.prisma.testQuestion.createMany({ data: questions.map((q) => ({ ...q, testId: id })) }),
    ]);
    return this.get(schoolId, id);
  }

  /** Appends random active bank questions per difficulty, skipping those already in the test. */
  async addRandom(schoolId: string, id: string, dto: RandomQuestionsDto) {
    const t = await this.load(schoolId, id);
    this.assertEditableQuestions(t);
    const subjectId = dto.subjectId ?? t.subjectId ?? undefined;
    const gradeLevel = dto.gradeLevel ?? t.gradeLevel ?? undefined;
    const existing = new Set(t.questions.map((q) => q.questionId));
    const wanted = Object.entries(dto.counts)
      .map(([d, n]) => [Number(d), Number(n)] as const)
      .filter(([d, n]) => Number.isInteger(d) && d >= 1 && d <= 6 && Number.isInteger(n) && n > 0);
    if (!wanted.length) throw new BadRequestException('Chưa chọn số câu cần lấy');
    const pool = await this.prisma.question.findMany({
      where: { schoolId, isActive: true, subjectId, gradeLevel, difficulty: { in: wanted.map(([d]) => d) }, id: { notIn: [...existing] } },
      select: { id: true, difficulty: true },
      orderBy: { createdAt: 'asc' },
    });
    const picked: string[] = [];
    const missing: Record<number, number> = {};
    for (const [difficulty, n] of wanted) {
      const candidates = shuffle(
        pool.filter((q) => q.difficulty === difficulty).map((q) => q.id),
        `${id}:${difficulty}:${t.questions.length}`,
      );
      picked.push(...candidates.slice(0, n));
      if (candidates.length < n) missing[difficulty] = n - candidates.length;
    }
    if (picked.length) {
      const points = dto.points ?? 1;
      await this.prisma.testQuestion.createMany({ data: picked.map((questionId, i) => ({ testId: id, questionId, points, sortOrder: t.questions.length + i })) });
    }
    return { added: picked.length, missing, test: await this.get(schoolId, id) };
  }

  // ---- lifecycle ----

  /** Student users who should hear about the test: its classes, its course, or the whole school for an open contest. */
  private async audienceUserIds(t: TestRow): Promise<string[]> {
    const base: Prisma.StudentWhereInput = { schoolId: t.schoolId, status: StudentStatus.STUDYING, userId: { not: null } };
    let where: Prisma.StudentWhereInput | null = null;
    if (t.classIds.length) where = { ...base, enrollments: { some: { classId: { in: t.classIds } } } };
    else if (t.courseId) where = { ...base, courseEnrollments: { some: { courseId: t.courseId } } };
    else if (t.kind === TestKind.CONTEST) where = base;
    if (!where) return [];
    const students = await this.prisma.student.findMany({ where, select: { userId: true } });
    return students.map((s) => s.userId!).filter(Boolean);
  }

  async publish(schoolId: string, id: string) {
    const t = await this.load(schoolId, id);
    if (t.status === TestStatus.PUBLISHED) throw new BadRequestException('Bài kiểm tra đã được giao');
    if (t.status === TestStatus.CLOSED) throw new BadRequestException('Bài kiểm tra đã đóng');
    if (!t.questions.length) throw new BadRequestException('Bài kiểm tra chưa có câu hỏi');
    const updated = await this.prisma.test.update({ where: { id }, data: { status: TestStatus.PUBLISHED }, include: testInclude });
    try {
      const userIds = await this.audienceUserIds(updated);
      if (userIds.length) {
        const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
        const deadline = updated.closeAt ? `${localDate(updated.closeAt, school.timezone).slice(8, 10)}/${localDate(updated.closeAt, school.timezone).slice(5, 7)} ${localTime(updated.closeAt, school.timezone)}` : 'không giới hạn';
        await this.notifications.notifyUsers(schoolId, userIds, {
          kind: NotificationKind.TEST_ASSIGNED,
          title: updated.kind === TestKind.CONTEST ? 'Cuộc thi mới' : 'Bài kiểm tra mới',
          body: `${updated.title} · hạn ${deadline}`,
          data: { testId: updated.id, kind: updated.kind },
        });
      }
    } catch (e) {
      this.logger.warn(`TEST_ASSIGNED notification failed for ${id}: ${(e as Error).message}`);
    }
    return this.present(updated);
  }

  async close(schoolId: string, id: string) {
    const t = await this.load(schoolId, id);
    if (t.status !== TestStatus.PUBLISHED) throw new BadRequestException('Chỉ đóng được bài kiểm tra đang giao');
    const updated = await this.prisma.test.update({ where: { id }, data: { status: TestStatus.CLOSED }, include: testInclude });
    return this.present(updated);
  }

  // ---- attempts (teacher side) ----

  /** Best finished attempt per student: score desc, then faster, then earlier. */
  async bestAttempts(testId: string): Promise<LeaderboardRow[]> {
    const attempts = await this.prisma.testAttempt.findMany({
      where: { testId, status: { in: FINISHED } },
      include: { student: { select: studentSelect } },
    });
    const best = new Map<string, (typeof attempts)[number]>();
    const better = (a: (typeof attempts)[number], b: (typeof attempts)[number]) => {
      const sa = Number(a.score ?? 0);
      const sb = Number(b.score ?? 0);
      if (sa !== sb) return sa > sb;
      const da = a.durationSec ?? Number.MAX_SAFE_INTEGER;
      const db = b.durationSec ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da < db;
      return (a.submittedAt?.getTime() ?? 0) < (b.submittedAt?.getTime() ?? 0);
    };
    for (const a of attempts) {
      const cur = best.get(a.studentId);
      if (!cur || better(a, cur)) best.set(a.studentId, a);
    }
    return [...best.values()]
      .sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0))
      .map((a, i) => ({ rank: i + 1, student: studentRef(a.student), ...attemptSummary(a) }));
  }

  /** One row per student who attempted the test, with the best and the latest attempt. */
  async attempts(schoolId: string, id: string) {
    await this.load(schoolId, id);
    const attempts = await this.prisma.testAttempt.findMany({ where: { testId: id }, include: { student: { select: studentSelect } }, orderBy: { attemptNo: 'asc' } });
    const best = new Map((await this.bestAttempts(id)).map((r) => [r.student.id, r]));
    const byStudent = new Map<string, { student: ReturnType<typeof studentRef>; attempts: AttemptSummary[] }>();
    for (const a of attempts) {
      const row = byStudent.get(a.studentId) ?? { student: studentRef(a.student), attempts: [] };
      row.attempts.push(attemptSummary(a));
      byStudent.set(a.studentId, row);
    }
    const rows = [...byStudent.values()]
      .map((r) => ({
        student: r.student,
        attemptCount: r.attempts.length,
        best: best.get(r.student.id) ?? null,
        latest: r.attempts[r.attempts.length - 1],
        attempts: r.attempts,
        needsGrading: r.attempts.some((a) => a.needsGrading),
      }))
      .sort((a, b) => (a.student.className ?? '').localeCompare(b.student.className ?? '') || a.student.fullName.localeCompare(b.student.fullName, 'vi'));
    return { rows, total: rows.length, needsGrading: rows.filter((r) => r.needsGrading).length };
  }

  private async loadAttempt(schoolId: string, attemptId: string) {
    const a = await this.prisma.testAttempt.findFirst({
      where: { id: attemptId, test: { schoolId } },
      include: { student: { select: studentSelect }, test: { include: testInclude } },
    });
    if (!a) throw new NotFoundException('Không tìm thấy bài làm');
    return a;
  }

  /** The teacher's view of one attempt: every question with the student's answer, the key and the grading. */
  async attemptDetail(schoolId: string, attemptId: string) {
    const a = await this.loadAttempt(schoolId, attemptId);
    const answers = (a.answers ?? {}) as Record<string, unknown>;
    const grading = asGrading(a.grading);
    const questions = attemptQuestions(a.test.questions, a, a.test.shuffleOptions).map(({ key, ...q }) => ({
      ...q,
      myAnswer: answers[q.id] ?? null,
      correctAnswer: key,
      grading: grading[q.id] ?? null,
    }));
    const { questions: _q, _count, ...test } = a.test;
    return {
      ...attemptSummary(a),
      startedAt: a.startedAt,
      gradedAt: a.gradedAt,
      gradedById: a.gradedById,
      student: studentRef(a.student),
      test: { ...test, questionCount: _q.length },
      questions,
    };
  }

  /** Fills manual points (essays, or any override) and recomputes the attempt's score. */
  async grade(schoolId: string, userId: string, attemptId: string, dto: GradeAttemptDto) {
    const a = await this.loadAttempt(schoolId, attemptId);
    if (a.status === AttemptStatus.IN_PROGRESS) throw new BadRequestException('Học sinh chưa nộp bài');
    const grading = { ...asGrading(a.grading) };
    for (const [questionId, raw] of Object.entries(dto.items)) {
      const g = grading[questionId];
      if (!g) throw new BadRequestException('Câu hỏi không thuộc bài làm này');
      const points = Number(raw);
      if (!Number.isFinite(points) || points < 0 || points > g.max) throw new BadRequestException(`Điểm câu hỏi phải từ 0 đến ${g.max}`);
      grading[questionId] = { ...g, points: round2(points), correct: points >= g.max, manual: true };
    }
    const { score, needsGrading } = summarizeGrading(grading);
    await this.prisma.testAttempt.update({
      where: { id: attemptId },
      data: {
        grading: grading as unknown as Prisma.InputJsonValue,
        score,
        needsGrading,
        status: needsGrading ? AttemptStatus.SUBMITTED : AttemptStatus.GRADED,
        gradedById: userId,
        gradedAt: new Date(),
      },
    });
    return this.attemptDetail(schoolId, attemptId);
  }

  async leaderboard(schoolId: string, id: string, limit = 100) {
    await this.load(schoolId, id);
    const rows = await this.bestAttempts(id);
    return { rows: rows.slice(0, limit), total: rows.length };
  }

  /** Participation, pass rate, per-question success and a score histogram, from each student's best attempt. */
  async stats(schoolId: string, id: string) {
    const t = await this.load(schoolId, id);
    const best = await this.bestAttempts(id);
    const finished = await this.prisma.testAttempt.findMany({ where: { testId: id, status: { in: FINISHED } }, select: { grading: true } });
    const passPercent = t.passPercent ?? DEFAULT_PASS;
    const avgPercent = best.length ? Math.round((best.reduce((s, r) => s + r.percent, 0) / best.length) * 10) / 10 : 0;
    const passRate = best.length ? Math.round((best.filter((r) => r.percent >= passPercent).length / best.length) * 1000) / 10 : 0;
    const perQuestion = t.questions.map((q) => {
      let sum = 0;
      let n = 0;
      for (const a of finished) {
        const g = asGrading(a.grading)[q.questionId];
        if (g && g.points !== null && g.max > 0) {
          sum += g.points / g.max;
          n++;
        }
      }
      return { questionId: q.questionId, content: shortText(q.question.content), type: q.question.type, difficulty: q.question.difficulty, points: Number(q.points), answered: n, correctRate: n ? Math.round((sum / n) * 1000) / 10 : null };
    });
    const distribution = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 10, count: 0 }));
    for (const r of best) distribution[Math.min(9, Math.floor(r.percent / 10))].count++;
    return {
      attempts: finished.length,
      students: best.length,
      avgPercent,
      passPercent,
      passRate,
      needsGrading: await this.prisma.testAttempt.count({ where: { testId: id, needsGrading: true } }),
      perQuestion,
      distribution,
    };
  }

  async exportCsv(schoolId: string, id: string): Promise<string> {
    const t = await this.load(schoolId, id);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    const rows = await this.bestAttempts(id);
    const when = (d: Date | null) => (d ? `${localDate(d, school.timezone)} ${localTime(d, school.timezone)}` : '');
    return serializeCsv(
      [
        ['Bài kiểm tra', t.title],
        [],
        ['Hạng', 'Mã HS', 'Họ tên', 'Lớp', 'Điểm', 'Tổng điểm', 'Tỷ lệ %', 'Thời gian (giây)', 'Nộp lúc', 'Trạng thái'],
        ...rows.map((r) => [r.rank, r.student.code, r.student.fullName, r.student.className ?? '', r.score ?? '', r.maxScore, r.percent, r.durationSec ?? '', when(r.submittedAt), r.needsGrading ? 'Chờ chấm' : 'Đã chấm']),
      ],
      { bom: true },
    );
  }
}
