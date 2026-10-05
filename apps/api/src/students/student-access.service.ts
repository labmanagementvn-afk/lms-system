import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';

const studentSelect = {
  id: true,
  code: true,
  fullName: true,
  gender: true,
  dateOfBirth: true,
  status: true,
  schoolId: true,
  enrollments: {
    orderBy: { enrolledAt: 'desc' },
    take: 1,
    select: {
      academicYearId: true,
      class: { select: { id: true, name: true, gradeLevel: true, homeroomTeacher: { select: { id: true, fullName: true } } } },
      academicYear: { select: { id: true, name: true, isCurrent: true } },
    },
  },
} satisfies Prisma.StudentSelect;

type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

export interface CurrentStudent {
  id: string;
  code: string;
  fullName: string;
  gender: string | null;
  dateOfBirth: Date | null;
  status: string;
  schoolId: string;
  /** Latest enrolment: the class the student belongs to and its academic year. */
  class: { id: string; name: string; gradeLevel: number; homeroomTeacher: { id: string; fullName: string } | null } | null;
  academicYear: { id: string; name: string; isCurrent: boolean } | null;
}

const flatten = ({ enrollments, ...s }: StudentRow): CurrentStudent => ({
  ...s,
  class: enrollments[0]?.class ?? null,
  academicYear: enrollments[0]?.academicYear ?? null,
});

/**
 * Resolves the student behind a STUDENT login. Every student-facing endpoint
 * (grades, courses, tests, conduct) goes through `current()` so a student only
 * ever sees their own records.
 */
@Injectable()
export class StudentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in student's profile with their current class; 403 for any other role. */
  async current(user: AuthUser): Promise<CurrentStudent> {
    if (user.role !== Role.STUDENT) throw new ForbiddenException('Chỉ dành cho tài khoản học sinh');
    const s = await this.prisma.student.findFirst({ where: { userId: user.userId, schoolId: user.schoolId }, select: studentSelect });
    if (!s) throw new NotFoundException('Tài khoản chưa được gắn với hồ sơ học sinh');
    return flatten(s);
  }

  /**
   * A student record the caller may read: the student's own record, a child of a
   * parent, or any student of the school for staff and teachers.
   */
  async assertStudent(user: AuthUser, studentId: string): Promise<CurrentStudent> {
    const where: Prisma.StudentWhereInput = { id: studentId, schoolId: user.schoolId };
    if (user.role === Role.STUDENT) where.userId = user.userId;
    else if (user.role === Role.PARENT) where.guardians = { some: { userId: user.userId } };
    else if (user.role === Role.DRIVER) throw new ForbiddenException();
    const s = await this.prisma.student.findFirst({ where, select: studentSelect });
    if (!s) throw new NotFoundException('Không tìm thấy học sinh');
    return flatten(s);
  }
}
