import { Injectable, NotFoundException } from '@nestjs/common';
import { CourseStatus, LessonType, LiveStatus, ProgressStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { flattenLessons } from './lessons';
import { LmsAccessService, studentRef, studentSelect, subjectSelect, teacherSelect } from './lms-access.service';

/** Learning analytics: school overview, one course, one student. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LmsAccessService,
  ) {}

  async overview(schoolId: string) {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [byStatus, enrollments, completed, active, byType, upcoming, ended] = await Promise.all([
      this.prisma.course.groupBy({ by: ['status'], where: { schoolId }, _count: { _all: true } }),
      this.prisma.courseEnrollment.count({ where: { course: { schoolId } } }),
      this.prisma.courseEnrollment.count({ where: { course: { schoolId }, completedAt: { not: null } } }),
      this.prisma.lessonProgress.findMany({ where: { lesson: { schoolId }, lastAt: { gte: weekAgo } }, distinct: ['studentId'], select: { studentId: true } }),
      this.prisma.lesson.groupBy({ by: ['type'], where: { schoolId }, _count: { _all: true } }),
      this.prisma.liveSession.count({ where: { schoolId, status: { in: [LiveStatus.SCHEDULED, LiveStatus.LIVE] } } }),
      this.prisma.liveSession.count({ where: { schoolId, status: LiveStatus.ENDED } }),
    ]);
    const count = (status: CourseStatus) => byStatus.find((r) => r.status === status)?._count._all ?? 0;
    const lessonsByType = Object.fromEntries(Object.values(LessonType).map((t) => [t, byType.find((r) => r.type === t)?._count._all ?? 0]));
    return {
      courses: { total: byStatus.reduce((s, r) => s + r._count._all, 0), published: count(CourseStatus.PUBLISHED), draft: count(CourseStatus.DRAFT), archived: count(CourseStatus.ARCHIVED) },
      enrollments,
      completionRate: enrollments ? Math.round((completed / enrollments) * 100) : 0,
      activeStudents7d: active.length,
      lessonsByType,
      liveSessions: { upcoming, ended },
    };
  }

  /** Completion per lesson and progress per enrolled student. */
  async course(schoolId: string, courseId: string) {
    const course = await this.access.course(schoolId, courseId);
    const [sections, lessons, enrolments] = await Promise.all([
      this.prisma.courseSection.findMany({ where: { courseId }, select: { id: true, sortOrder: true } }),
      this.prisma.lesson.findMany({ where: { courseId }, select: { id: true, title: true, type: true, sectionId: true, sortOrder: true, isRequired: true } }),
      this.prisma.courseEnrollment.findMany({ where: { courseId }, include: { student: { select: studentSelect } }, orderBy: { student: { code: 'asc' } } }),
    ]);
    const progress = await this.prisma.lessonProgress.findMany({
      where: { lessonId: { in: lessons.map((l) => l.id) }, studentId: { in: enrolments.map((e) => e.studentId) } },
      select: { lessonId: true, studentId: true, status: true, secondsSpent: true, lastAt: true },
    });
    const lessonRows = flattenLessons(sections, lessons).map((l) => {
      const rows = progress.filter((p) => p.lessonId === l.id);
      const completed = rows.filter((p) => p.status === ProgressStatus.COMPLETED).length;
      const inProgress = rows.filter((p) => p.status === ProgressStatus.IN_PROGRESS).length;
      const seconds = rows.reduce((s, p) => s + p.secondsSpent, 0);
      return {
        id: l.id,
        title: l.title,
        type: l.type,
        isRequired: l.isRequired,
        completed,
        inProgress,
        notStarted: Math.max(0, enrolments.length - completed - inProgress),
        avgSeconds: rows.length ? Math.round(seconds / rows.length) : 0,
      };
    });
    const students = enrolments.map((e) => {
      const rows = progress.filter((p) => p.studentId === e.studentId);
      return {
        student: studentRef(e.student),
        progressPct: e.progressPct,
        completedAt: e.completedAt,
        secondsSpent: rows.reduce((s, p) => s + p.secondsSpent, 0),
        lessonsCompleted: rows.filter((p) => p.status === ProgressStatus.COMPLETED).length,
        lastAt: rows.reduce<Date | null>((m, p) => (!m || p.lastAt > m ? p.lastAt : m), null),
      };
    });
    return { course: { id: course.id, title: course.title, status: course.status }, lessonCount: lessons.length, lessons: lessonRows, students };
  }

  /** Every course the student is enrolled in, with how far they got. */
  async student(schoolId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId }, select: studentSelect });
    if (!student) throw new NotFoundException('Không tìm thấy học sinh');
    const enrolments = await this.prisma.courseEnrollment.findMany({
      where: { studentId },
      include: {
        course: { select: { id: true, title: true, status: true, subject: { select: subjectSelect }, teacher: { select: teacherSelect }, _count: { select: { lessons: true } } } },
      },
      orderBy: { enrolledAt: 'desc' },
    });
    const progress = await this.prisma.lessonProgress.findMany({
      where: { studentId, lesson: { courseId: { in: enrolments.map((e) => e.courseId) } } },
      select: { status: true, secondsSpent: true, lastAt: true, lesson: { select: { courseId: true } } },
    });
    return {
      student: studentRef(student),
      courses: enrolments.map((e) => {
        const rows = progress.filter((p) => p.lesson.courseId === e.courseId);
        const { _count, ...course } = e.course;
        return {
          course,
          lessonCount: _count.lessons,
          lessonsCompleted: rows.filter((p) => p.status === ProgressStatus.COMPLETED).length,
          progressPct: e.progressPct,
          completedAt: e.completedAt,
          enrolledAt: e.enrolledAt,
          secondsSpent: rows.reduce((s, p) => s + p.secondsSpent, 0),
          lastAt: rows.reduce<Date | null>((m, p) => (!m || p.lastAt > m ? p.lastAt : m), null),
        };
      }),
    };
  }
}
