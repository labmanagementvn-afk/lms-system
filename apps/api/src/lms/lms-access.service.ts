import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';

// Selects shared by the course, discussion, live and report services.
export const teacherSelect = { id: true, code: true, fullName: true } satisfies Prisma.TeacherSelect;
export const subjectSelect = { id: true, code: true, name: true } satisfies Prisma.SubjectSelect;
export const fileSelect = { id: true, name: true, mimeType: true, size: true, launchPath: true } satisfies Prisma.StoredFileSelect;
export const testSelect = { id: true, title: true, status: true } satisfies Prisma.TestSelect;
export const authorSelect = { id: true, fullName: true, role: true } satisfies Prisma.UserSelect;
export const lessonInclude = { file: { select: fileSelect }, test: { select: testSelect } } satisfies Prisma.LessonInclude;
/** A student with the class of their latest enrolment. */
export const studentSelect = {
  id: true,
  code: true,
  fullName: true,
  userId: true,
  enrollments: { orderBy: { enrolledAt: 'desc' }, take: 1, select: { class: { select: { id: true, name: true } } } },
} satisfies Prisma.StudentSelect;

export const studentRef = (s: Prisma.StudentGetPayload<{ select: typeof studentSelect }>) => ({
  id: s.id,
  code: s.code,
  fullName: s.fullName,
  class: s.enrollments[0]?.class ?? null,
});

/** Lookups every LMS service needs: the course behind an id and the teacher behind a login. */
@Injectable()
export class LmsAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async course(schoolId: string, id: string) {
    const course = await this.prisma.course.findFirst({ where: { id, schoolId } });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    return course;
  }

  /** The Teacher row of the signed-in user, if any. */
  async teacherOf(user: AuthUser): Promise<string | null> {
    const t = await this.prisma.teacher.findFirst({ where: { schoolId: user.schoolId, userId: user.userId }, select: { id: true } });
    return t?.id ?? null;
  }

  /** Who owns a new course: teachers always themselves; office staff whoever they pick (or themselves when they teach). */
  async resolveTeacherId(user: AuthUser, requested?: string): Promise<string> {
    const own = await this.teacherOf(user);
    if (user.role === Role.TEACHER) {
      if (!own) throw new BadRequestException('Tài khoản chưa được gắn với hồ sơ giáo viên');
      return own;
    }
    if (requested) {
      const t = await this.prisma.teacher.findFirst({ where: { id: requested, schoolId: user.schoolId }, select: { id: true } });
      if (!t) throw new BadRequestException('Không tìm thấy giáo viên');
      return t.id;
    }
    if (own) return own;
    throw new BadRequestException('Chưa chọn giáo viên phụ trách');
  }

  async currentYearId(schoolId: string): Promise<string | null> {
    const y = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } });
    return y?.id ?? null;
  }

  async school(schoolId: string) {
    return this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { id: true, code: true, timezone: true } });
  }
}
