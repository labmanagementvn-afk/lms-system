import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AttemptStatus, Prisma, ProgressStatus, TestKind, TestStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentStudent, StudentAccessService } from '../students/student-access.service';
import { asGrading, attemptEndsAt, gradeAttempt, pastGrace, remainingSec, round2, shuffle, startBlockReason } from './grading';
import { attemptQuestions, attemptSummary, TestsService, testQuestionInclude } from './tests.service';

const studentTestInclude = {
  course: { select: { id: true, title: true } },
  subject: { select: { id: true, code: true, name: true } },
  questions: { include: testQuestionInclude, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.TestInclude;

type StudentTest = Prisma.TestGetPayload<{ include: typeof studentTestInclude }>;

const DEFAULT_PASS = 50;

/** The student app: visible tests, starting / saving / submitting attempts, results and contest boards. */
@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StudentAccessService,
    private readonly tests: TestsService,
  ) {}

  /** PUBLISHED or CLOSED tests the student may see: their class, a course they joined, or a school-wide contest. */
  private visibleWhere(student: CurrentStudent): Prisma.TestWhereInput {
    const or: Prisma.TestWhereInput[] = [{ course: { enrollments: { some: { studentId: student.id } } } }, { kind: TestKind.CONTEST, classIds: { isEmpty: true } }];
    if (student.class) or.unshift({ classIds: { has: student.class.id } });
    return { schoolId: student.schoolId, status: { in: [TestStatus.PUBLISHED, TestStatus.CLOSED] }, OR: or };
  }

  private async current(user: AuthUser) {
    const student = await this.access.current(user);
    await this.expireStale(student.id);
    return student;
  }

  /** Hands in attempts whose deadline (plus grace) passed while the student was away. */
  private async expireStale(studentId: string) {
    const stale = await this.prisma.testAttempt.findMany({
      where: { studentId, status: AttemptStatus.IN_PROGRESS },
      include: { test: { include: studentTestInclude } },
    });
    const now = new Date();
    for (const a of stale) {
      const endsAt = attemptEndsAt(a.startedAt, a.test.timeLimitMin, a.test.closeAt);
      if (pastGrace(endsAt, now)) await this.finalize(a, a.test, (a.answers ?? {}) as Record<string, unknown>, endsAt ?? now);
    }
  }

  private testView(t: StudentTest) {
    const { questions, ...rest } = t;
    return { ...rest, questionCount: questions.length, maxScore: round2(questions.reduce((s, q) => s + Number(q.points), 0)) };
  }

  /** The test as a student sees it: no keys, plus their attempts and whether they may start now. */
  private async withMyAttempts(t: StudentTest, studentId: string) {
    const attempts = await this.prisma.testAttempt.findMany({ where: { testId: t.id, studentId }, orderBy: { attemptNo: 'asc' } });
    const inProgress = attempts.find((a) => a.status === AttemptStatus.IN_PROGRESS);
    const finished = attempts.filter((a) => a.status !== AttemptStatus.IN_PROGRESS);
    const reason = inProgress ? null : startBlockReason(t, finished.length);
    const best = finished.length ? finished.reduce((b, a) => (Number(a.score ?? 0) > Number(b.score ?? 0) ? a : b)) : null;
    return {
      ...this.testView(t),
      myAttempts: attempts.map(attemptSummary),
      myBest: best ? attemptSummary(best) : null,
      inProgressAttemptId: inProgress?.id ?? null,
      canStart: !reason && t.questions.length > 0,
      reason: reason ?? (t.questions.length ? undefined : 'Bài kiểm tra chưa có câu hỏi'),
    };
  }

  // ---- lists ----

  async list(user: AuthUser) {
    const student = await this.current(user);
    const tests = await this.prisma.test.findMany({
      where: { ...this.visibleWhere(student), kind: { not: TestKind.CONTEST } },
      include: studentTestInclude,
      orderBy: [{ status: 'asc' }, { closeAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return Promise.all(tests.map((t) => this.withMyAttempts(t, student.id)));
  }

  /** Contests with the student's rank and the top 10. */
  async contests(user: AuthUser) {
    const student = await this.current(user);
    const tests = await this.prisma.test.findMany({
      where: { ...this.visibleWhere(student), kind: TestKind.CONTEST },
      include: studentTestInclude,
      orderBy: [{ status: 'asc' }, { closeAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return Promise.all(
      tests.map(async (t) => {
        const rows = await this.tests.bestAttempts(t.id);
        const mine = rows.find((r) => r.student.id === student.id) ?? null;
        return { ...(await this.withMyAttempts(t, student.id)), participants: rows.length, myRank: mine?.rank ?? null, top: rows.slice(0, 10) };
      }),
    );
  }

  private async visibleTest(student: CurrentStudent, id: string): Promise<StudentTest> {
    const t = await this.prisma.test.findFirst({ where: { id, ...this.visibleWhere(student) }, include: studentTestInclude });
    if (!t) throw new NotFoundException('Không tìm thấy bài kiểm tra');
    return t;
  }

  async detail(user: AuthUser, id: string) {
    const student = await this.current(user);
    return this.withMyAttempts(await this.visibleTest(student, id), student.id);
  }

  async leaderboard(user: AuthUser, id: string) {
    const student = await this.current(user);
    const t = await this.visibleTest(student, id);
    const rows = await this.tests.bestAttempts(t.id);
    return { test: { id: t.id, title: t.title, kind: t.kind, status: t.status }, rows: rows.slice(0, 50), me: rows.find((r) => r.student.id === student.id) ?? null, total: rows.length };
  }

  // ---- taking a test ----

  private attemptPayload(t: StudentTest, a: { id: string; attemptNo: number; status: AttemptStatus; startedAt: Date; questionOrder: string[]; answers: Prisma.JsonValue | null }) {
    const endsAt = attemptEndsAt(a.startedAt, t.timeLimitMin, t.closeAt);
    const questions = attemptQuestions(t.questions, a, t.shuffleOptions).map(({ key: _key, explanation: _e, ...q }) => q);
    return {
      attempt: { id: a.id, testId: t.id, attemptNo: a.attemptNo, status: a.status, startedAt: a.startedAt, endsAt, remainingSec: remainingSec(endsAt), answers: (a.answers ?? {}) as Record<string, unknown> },
      test: { id: t.id, title: t.title, kind: t.kind, timeLimitMin: t.timeLimitMin, showResults: t.showResults, questionCount: t.questions.length },
      questions,
    };
  }

  /** Starts a new attempt, or returns the one still in progress. */
  async start(user: AuthUser, testId: string) {
    const student = await this.current(user);
    const t = await this.visibleTest(student, testId);
    const attempts = await this.prisma.testAttempt.findMany({ where: { testId, studentId: student.id }, orderBy: { attemptNo: 'asc' } });
    const inProgress = attempts.find((a) => a.status === AttemptStatus.IN_PROGRESS);
    if (inProgress) return this.attemptPayload(t, inProgress);
    const reason = startBlockReason(t, attempts.length);
    if (reason) throw new BadRequestException(reason);
    if (!t.questions.length) throw new BadRequestException('Bài kiểm tra chưa có câu hỏi');
    const attemptNo = (attempts[attempts.length - 1]?.attemptNo ?? 0) + 1;
    const ids = t.questions.map((q) => q.questionId);
    const questionOrder = t.shuffleQuestions ? shuffle(ids, `${t.id}:${student.id}:${attemptNo}`) : ids;
    const maxScore = round2(t.questions.reduce((s, q) => s + Number(q.points), 0));
    try {
      const a = await this.prisma.testAttempt.create({ data: { testId, studentId: student.id, attemptNo, questionOrder, maxScore, answers: {} } });
      return this.attemptPayload(t, a);
    } catch (e) {
      rethrowPrismaError(e, 'Bài làm đang được tạo, vui lòng thử lại');
    }
  }

  private async myAttempt(user: AuthUser, attemptId: string) {
    const student = await this.current(user);
    const a = await this.prisma.testAttempt.findFirst({ where: { id: attemptId, studentId: student.id }, include: { test: { include: studentTestInclude } } });
    if (!a) throw new NotFoundException('Không tìm thấy bài làm');
    return { student, attempt: a };
  }

  /** Questions, saved answers and the remaining time, for resuming. */
  async get(user: AuthUser, attemptId: string) {
    const { attempt } = await this.myAttempt(user, attemptId);
    return this.attemptPayload(attempt.test, attempt);
  }

  /** Keeps only answers to questions of the attempt, merged over what was saved before. */
  private mergeAnswers(attempt: { questionOrder: string[]; answers: Prisma.JsonValue | null }, incoming: Record<string, unknown> | undefined) {
    const allowed = new Set(attempt.questionOrder);
    const merged = { ...((attempt.answers ?? {}) as Record<string, unknown>) };
    for (const [id, value] of Object.entries(incoming ?? {})) {
      if (!allowed.has(id)) continue;
      if (value === null || value === undefined) delete merged[id];
      else merged[id] = value;
    }
    return merged;
  }

  async save(user: AuthUser, attemptId: string, answers: Record<string, unknown>) {
    const { attempt } = await this.myAttempt(user, attemptId);
    if (attempt.status !== AttemptStatus.IN_PROGRESS) throw new BadRequestException('Bài làm đã nộp');
    const endsAt = attemptEndsAt(attempt.startedAt, attempt.test.timeLimitMin, attempt.test.closeAt);
    if (pastGrace(endsAt)) throw new BadRequestException('Đã hết thời gian làm bài');
    const merged = this.mergeAnswers(attempt, answers);
    await this.prisma.testAttempt.update({ where: { id: attemptId }, data: { answers: merged as Prisma.InputJsonValue } });
    return { saved: Object.keys(merged).length, remainingSec: remainingSec(endsAt) };
  }

  /** Grades and hands in; answers sent after the grace period are ignored in favour of the saved ones. */
  async submit(user: AuthUser, attemptId: string, answers?: Record<string, unknown>) {
    const { attempt } = await this.myAttempt(user, attemptId);
    if (attempt.status !== AttemptStatus.IN_PROGRESS) return this.result(user, attemptId);
    const endsAt = attemptEndsAt(attempt.startedAt, attempt.test.timeLimitMin, attempt.test.closeAt);
    const now = new Date();
    const merged = this.mergeAnswers(attempt, pastGrace(endsAt, now) ? undefined : answers);
    await this.finalize(attempt, attempt.test, merged, pastGrace(endsAt, now) ? endsAt! : now);
    return this.result(user, attemptId);
  }

  private async finalize(attempt: { id: string; testId: string; studentId: string; startedAt: Date }, t: StudentTest, answers: Record<string, unknown>, submittedAt: Date) {
    const questions = t.questions.map((q) => ({ id: q.questionId, type: q.question.type, options: q.question.options, answer: q.question.answer, points: Number(q.points) }));
    const result = gradeAttempt(questions, answers);
    await this.prisma.testAttempt.update({
      where: { id: attempt.id },
      data: {
        answers: answers as Prisma.InputJsonValue,
        grading: result.grading as unknown as Prisma.InputJsonValue,
        score: result.score,
        maxScore: result.maxScore,
        needsGrading: result.needsGrading,
        status: result.needsGrading ? AttemptStatus.SUBMITTED : AttemptStatus.GRADED,
        submittedAt,
        durationSec: Math.max(0, Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000)),
      },
    });
    try {
      await this.completeQuizLessons(t.id, attempt.studentId);
    } catch (e) {
      this.logger.warn(`Lesson progress update failed for test ${t.id}: ${(e as Error).message}`);
    }
  }

  /** A submitted quiz completes every QUIZ lesson bound to the test in courses the student joined. */
  private async completeQuizLessons(testId: string, studentId: string) {
    const lessons = await this.prisma.lesson.findMany({ where: { testId, course: { enrollments: { some: { studentId } } } }, select: { id: true, courseId: true } });
    if (!lessons.length) return;
    const now = new Date();
    for (const l of lessons) {
      await this.prisma.lessonProgress.upsert({
        where: { lessonId_studentId: { lessonId: l.id, studentId } },
        create: { lessonId: l.id, studentId, status: ProgressStatus.COMPLETED, completedAt: now },
        update: { status: ProgressStatus.COMPLETED, completedAt: now, lastAt: now },
      });
    }
    for (const courseId of new Set(lessons.map((l) => l.courseId))) {
      const required = await this.prisma.lesson.findMany({ where: { courseId, isRequired: true }, select: { id: true } });
      const done = required.length ? await this.prisma.lessonProgress.count({ where: { studentId, status: ProgressStatus.COMPLETED, lessonId: { in: required.map((r) => r.id) } } }) : 0;
      const progressPct = required.length ? Math.round((100 * done) / required.length) : 0;
      await this.prisma.courseEnrollment.updateMany({ where: { courseId, studentId }, data: { progressPct } });
      if (progressPct === 100) await this.prisma.courseEnrollment.updateMany({ where: { courseId, studentId, completedAt: null }, data: { completedAt: now } });
    }
  }

  /** Totals always; per-question feedback only when the test shows results. */
  async result(user: AuthUser, attemptId: string) {
    const { attempt } = await this.myAttempt(user, attemptId);
    if (attempt.status === AttemptStatus.IN_PROGRESS) throw new BadRequestException('Bài làm chưa nộp');
    const t = attempt.test;
    const summary = attemptSummary(attempt);
    const passPercent = t.passPercent ?? DEFAULT_PASS;
    const base = {
      ...summary,
      startedAt: attempt.startedAt,
      passed: summary.percent >= passPercent,
      passPercent,
      test: { id: t.id, title: t.title, kind: t.kind, showResults: t.showResults, questionCount: t.questions.length },
    };
    if (!t.showResults) return { ...base, questions: null };
    const answers = (attempt.answers ?? {}) as Record<string, unknown>;
    const grading = asGrading(attempt.grading);
    const questions = attemptQuestions(t.questions, attempt, t.shuffleOptions).map(({ key, ...q }) => {
      const g = grading[q.id];
      return { ...q, myAnswer: answers[q.id] ?? null, correctAnswer: key, correct: g?.correct ?? null, points: g?.points ?? null, max: g?.max ?? q.points, manual: g?.manual ?? false };
    });
    return { ...base, questions };
  }
}
