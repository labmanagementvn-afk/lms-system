import { Prisma, PrismaClient, ProgressStatus } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Course completion as a whole percentage: completed required lessons over
 * required lessons. A course without required lessons counts every lesson;
 * one without lessons is 0 %.
 */
export function progressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/**
 * Recomputes CourseEnrollment.progressPct for one student from their
 * LessonProgress rows and stamps completedAt when the course is done (cleared
 * again when it drops below 100). The assessments module marks QUIZ lessons
 * complete with the same LessonProgress rows, so this formula is the single
 * source of truth for course completion.
 */
export async function recomputeCourseProgress(db: Db, courseId: string, studentId: string): Promise<{ progressPct: number; completedAt: Date | null }> {
  const lessons = await db.lesson.findMany({ where: { courseId }, select: { id: true, isRequired: true } });
  const counted = lessons.some((l) => l.isRequired) ? lessons.filter((l) => l.isRequired) : lessons;
  const done = counted.length
    ? await db.lessonProgress.count({ where: { studentId, status: ProgressStatus.COMPLETED, lessonId: { in: counted.map((l) => l.id) } } })
    : 0;
  const progressPct = progressPercent(done, counted.length);
  const enrolment = await db.courseEnrollment.findUnique({ where: { courseId_studentId: { courseId, studentId } }, select: { completedAt: true } });
  if (!enrolment) return { progressPct, completedAt: null };
  const completedAt = progressPct === 100 ? (enrolment.completedAt ?? new Date()) : null;
  await db.courseEnrollment.update({ where: { courseId_studentId: { courseId, studentId } }, data: { progressPct, completedAt } });
  return { progressPct, completedAt };
}
