import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';

// Latest enrolment = the student's current class.
export const childSelect = {
  id: true,
  code: true,
  fullName: true,
  gender: true,
  dateOfBirth: true,
  status: true,
  enrollments: { orderBy: { enrolledAt: 'desc' }, take: 1, select: { class: { select: { id: true, name: true, gradeLevel: true } } } },
} satisfies Prisma.StudentSelect;

type ChildRow = Prisma.StudentGetPayload<{ select: typeof childSelect }>;
export type Child = Omit<ChildRow, 'enrollments'> & { class: ChildRow['enrollments'][number]['class'] | null };

export const flattenChild = ({ enrollments, ...s }: ChildRow): Child => ({ ...s, class: enrollments[0]?.class ?? null });

/**
 * Which students a signed-in user may see. Parents see the children their
 * guardian records are linked to; school staff see every student of their school.
 */
@Injectable()
export class ParentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async childrenOf(user: AuthUser): Promise<Child[]> {
    const rows = await this.prisma.student.findMany({
      where: { schoolId: user.schoolId, guardians: { some: { userId: user.userId } } },
      select: childSelect,
      orderBy: { fullName: 'asc' },
    });
    return rows.map(flattenChild);
  }

  /** Returns the student, or throws when the user may not see them. */
  async assertChild(user: AuthUser, studentId: string): Promise<Child> {
    if (user.role === Role.DRIVER) throw new ForbiddenException();
    const row = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        schoolId: user.schoolId,
        ...(user.role === Role.PARENT ? { guardians: { some: { userId: user.userId } } } : {}),
      },
      select: childSelect,
    });
    if (!row) throw new NotFoundException('Không tìm thấy học sinh');
    return flattenChild(row);
  }
}
