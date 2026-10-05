import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseStatus, LiveStatus, Prisma, ProgressStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { StudentAccessService } from '../students/student-access.service';
import { DiscussionsService } from './discussions.service';
import { flattenLessons } from './lessons';
import { joinUrl } from './live';
import { LiveService } from './live.service';
import { lessonInclude, subjectSelect, teacherSelect } from './lms-access.service';
import { CreatePostDto, CreateThreadDto, ProgressDto } from './lms.dto';
import { recomputeCourseProgress } from './progress';

const courseSelect = {
  id: true,
  title: true,
  description: true,
  gradeLevel: true,
  status: true,
  classIds: true,
  coverFileId: true,
  subject: { select: subjectSelect },
  teacher: { select: teacherSelect },
  _count: { select: { lessons: true } },
} satisfies Prisma.CourseSelect;

type CourseRow = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;

const progressSelect = { status: true, secondsSpent: true, completedAt: true, lastAt: true, scormData: true } satisfies Prisma.LessonProgressSelect;

const card = ({ _count, ...c }: CourseRow) => ({ ...c, lessonCount: _count.lessons });

/** What a signed-in student sees: their courses, lessons, progress, boards and live rooms. */
@Injectable()
export class StudentLmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentAccessService,
    private readonly discussions: DiscussionsService,
    private readonly live: LiveService,
  ) {}

  /** Enrolled courses with progress and the next lesson to open, plus open courses the student may join. */
  async courses(user: AuthUser) {
    const me = await this.students.current(user);
    const enrolments = await this.prisma.courseEnrollment.findMany({
      where: { studentId: me.id, course: { status: { not: CourseStatus.DRAFT } } },
      include: { course: { select: { ...courseSelect, sections: { select: { id: true, sortOrder: true } }, lessons: { select: { id: true, title: true, type: true, sectionId: true, sortOrder: true } } } } },
      orderBy: { enrolledAt: 'desc' },
    });
    const done = await this.prisma.lessonProgress.findMany({
      where: { studentId: me.id, status: ProgressStatus.COMPLETED, lesson: { courseId: { in: enrolments.map((e) => e.courseId) } } },
      select: { lessonId: true },
    });
    const completed = new Set(done.map((p) => p.lessonId));
    const enrolled = enrolments.map((e) => {
      const { sections, lessons, ...course } = e.course;
      const next = flattenLessons(sections, lessons).find((l) => !completed.has(l.id)) ?? null;
      return {
        ...card(course),
        enrolledAt: e.enrolledAt,
        progressPct: e.progressPct,
        completedAt: e.completedAt,
        nextLesson: next ? { id: next.id, title: next.title, type: next.type } : null,
      };
    });
    const available = (await this.prisma.course.findMany({ where: this.availableWhere(me), select: courseSelect, orderBy: { updatedAt: 'desc' } })).map(card);
    return { enrolled, available };
  }

  /** Self-enrolment into an open course of the student's class (or of the whole school). */
  async enrol(user: AuthUser, courseId: string) {
    const me = await this.students.current(user);
    const course = await this.prisma.course.findFirst({ where: { ...this.availableWhere(me), id: courseId }, select: { id: true } });
    if (!course) throw new BadRequestException('Khóa học không mở cho bạn hoặc bạn đã tham gia');
    await this.prisma.courseEnrollment.create({ data: { courseId, studentId: me.id } });
    return this.course(user, courseId);
  }

  /** The course outline with the student's progress on every lesson and the upcoming live rooms. */
  async course(user: AuthUser, courseId: string) {
    const me = await this.students.current(user);
    const enrolment = await this.enrolment(me, courseId);
    const course = await this.prisma.course.findFirstOrThrow({
      where: { id: courseId },
      select: { ...courseSelect, sections: { orderBy: { sortOrder: 'asc' } }, lessons: { include: lessonInclude, orderBy: { sortOrder: 'asc' } } },
    });
    const [progress, liveSessions] = await Promise.all([
      this.prisma.lessonProgress.findMany({ where: { studentId: me.id, lessonId: { in: course.lessons.map((l) => l.id) } }, select: { lessonId: true, ...progressSelect } }),
      this.prisma.liveSession.findMany({
        where: { courseId, status: { in: [LiveStatus.SCHEDULED, LiveStatus.LIVE] }, OR: [{ status: LiveStatus.LIVE }, { startsAt: { gte: new Date(Date.now() - 86_400_000) } }] },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    const byLesson = new Map(progress.map(({ lessonId, scormData: _scorm, ...p }) => [lessonId, p]));
    const { sections, lessons, ...rest } = course;
    const withProgress = (l: (typeof lessons)[number]) => ({ ...l, progress: byLesson.get(l.id) ?? null });
    return {
      ...card(rest),
      progressPct: enrolment.progressPct,
      completedAt: enrolment.completedAt,
      sections: sections.map((s) => ({ ...s, lessons: lessons.filter((l) => l.sectionId === s.id).map(withProgress) })),
      unsectioned: lessons.filter((l) => !l.sectionId).map(withProgress),
      liveSessions: liveSessions.map((s) => ({ ...s, joinUrl: joinUrl(s.roomName) })),
    };
  }

  /** One lesson to play, with the student's progress and the neighbours in reading order. */
  async lesson(user: AuthUser, lessonId: string) {
    const me = await this.students.current(user);
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, schoolId: me.schoolId }, include: lessonInclude });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài học');
    await this.enrolment(me, lesson.courseId);
    const [course, sections, lessons, progress] = await Promise.all([
      this.prisma.course.findUniqueOrThrow({ where: { id: lesson.courseId }, select: { id: true, title: true } }),
      this.prisma.courseSection.findMany({ where: { courseId: lesson.courseId }, select: { id: true, sortOrder: true } }),
      this.prisma.lesson.findMany({ where: { courseId: lesson.courseId }, select: { id: true, title: true, sectionId: true, sortOrder: true } }),
      this.prisma.lessonProgress.findUnique({ where: { lessonId_studentId: { lessonId, studentId: me.id } }, select: progressSelect }),
    ]);
    const order = flattenLessons(sections, lessons);
    const i = order.findIndex((l) => l.id === lessonId);
    const ref = (l?: { id: string; title: string }) => (l ? { id: l.id, title: l.title } : null);
    return { ...lesson, course, progress, previous: ref(order[i - 1]), next: ref(order[i + 1]) };
  }

  /** Adds time spent, marks the lesson started / completed, keeps SCORM data, and refreshes the course percentage. */
  async progress(user: AuthUser, lessonId: string, dto: ProgressDto) {
    const me = await this.students.current(user);
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, schoolId: me.schoolId }, select: { id: true, courseId: true } });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài học');
    await this.enrolment(me, lesson.courseId);
    const now = new Date();
    const completing = dto.status === 'COMPLETED';
    const existing = await this.prisma.lessonProgress.findUnique({ where: { lessonId_studentId: { lessonId, studentId: me.id } }, select: { status: true, completedAt: true } });
    const keepDone = existing?.status === ProgressStatus.COMPLETED;
    const row = await this.prisma.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId: me.id } },
      create: {
        lessonId,
        studentId: me.id,
        status: completing ? ProgressStatus.COMPLETED : ProgressStatus.IN_PROGRESS,
        secondsSpent: dto.secondsSpent ?? 0,
        completedAt: completing ? now : null,
        scormData: dto.scormData as Prisma.InputJsonValue | undefined,
        lastAt: now,
      },
      update: {
        // Once completed a lesson stays completed; re-watching only adds time.
        status: completing || keepDone ? ProgressStatus.COMPLETED : ProgressStatus.IN_PROGRESS,
        completedAt: completing && !keepDone ? now : undefined,
        secondsSpent: dto.secondsSpent ? { increment: dto.secondsSpent } : undefined,
        scormData: dto.scormData as Prisma.InputJsonValue | undefined,
        lastAt: now,
      },
      select: progressSelect,
    });
    const course = await recomputeCourseProgress(this.prisma, lesson.courseId, me.id);
    return { progress: row, ...course };
  }

  // ---- discussions ----

  async threads(user: AuthUser, courseId: string) {
    const me = await this.students.current(user);
    await this.enrolment(me, courseId);
    return this.discussions.listThreads(courseId);
  }

  async createThread(user: AuthUser, courseId: string, dto: CreateThreadDto) {
    const me = await this.students.current(user);
    await this.enrolment(me, courseId);
    return this.discussions.createThread(me.schoolId, courseId, user.userId, dto);
  }

  async thread(user: AuthUser, threadId: string) {
    const me = await this.students.current(user);
    const t = await this.discussions.thread(me.schoolId, threadId);
    await this.enrolment(me, t.courseId);
    return this.discussions.getThread(me.schoolId, threadId);
  }

  async reply(user: AuthUser, threadId: string, dto: CreatePostDto) {
    const me = await this.students.current(user);
    const t = await this.discussions.thread(me.schoolId, threadId);
    await this.enrolment(me, t.courseId);
    return this.discussions.addPost(me.schoolId, threadId, user.userId, dto);
  }

  // ---- live rooms ----

  async liveSessions(user: AuthUser, courseId?: string) {
    const me = await this.students.current(user);
    return this.live.forStudent(me.schoolId, me.id, courseId);
  }

  async joinLive(user: AuthUser, sessionId: string) {
    const me = await this.students.current(user);
    return this.live.join(me.schoolId, me.id, sessionId);
  }

  // ---- internals ----

  /** Open courses aimed at the student's class (or everyone) that they have not joined. */
  private availableWhere(me: { id: string; schoolId: string; class: { id: string } | null }): Prisma.CourseWhereInput {
    return {
      schoolId: me.schoolId,
      status: CourseStatus.PUBLISHED,
      OR: [{ classIds: { isEmpty: true } }, ...(me.class ? [{ classIds: { has: me.class.id } }] : [])],
      enrollments: { none: { studentId: me.id } },
    };
  }

  private async enrolment(me: { id: string; schoolId: string }, courseId: string) {
    const course = await this.prisma.course.findFirst({ where: { id: courseId, schoolId: me.schoolId }, select: { id: true } });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    const e = await this.prisma.courseEnrollment.findUnique({ where: { courseId_studentId: { courseId, studentId: me.id } } });
    if (!e) throw new ForbiddenException('Bạn chưa tham gia khóa học này');
    return e;
  }
}
