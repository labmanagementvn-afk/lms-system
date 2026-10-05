import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, StudentStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';

export const studentSelect = { id: true, code: true, fullName: true } as const;

export const HOMEROOM_ONLY = 'Bạn không phải giáo viên chủ nhiệm lớp này';

/** Class lookups and the "who may touch this class" rules shared by attendance and the logbook. */
@Injectable()
export class HomeroomAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The class of the caller's school, or 404. */
  async getClass(schoolId: string, classId: string) {
    const klass = await this.prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true, name: true, gradeLevel: true, academicYearId: true, homeroomTeacherId: true },
    });
    if (!klass) throw new NotFoundException('Không tìm thấy lớp');
    return klass;
  }

  /** The caller's teacher record; null for office accounts that have none. */
  teacherOf(user: AuthUser) {
    return this.prisma.teacher.findFirst({ where: { userId: user.userId, schoolId: user.schoolId }, select: { id: true, code: true, fullName: true } });
  }

  /** Office staff may act on any class; a teacher only on the classes they are homeroom teacher of. */
  async assertHomeroom(user: AuthUser, klass: { homeroomTeacherId: string | null }) {
    if (user.role !== Role.TEACHER) return;
    const teacher = await this.teacherOf(user);
    if (!teacher || klass.homeroomTeacherId !== teacher.id) throw new ForbiddenException(HOMEROOM_ONLY);
  }

  /** Students currently enrolled in the class, in roster order. */
  async roster(classId: string) {
    const rows = await this.prisma.enrollment.findMany({
      where: { classId, student: { status: StudentStatus.STUDYING } },
      select: { student: { select: studentSelect } },
      orderBy: { student: { fullName: 'asc' } },
    });
    return rows.map((r) => r.student);
  }
}
