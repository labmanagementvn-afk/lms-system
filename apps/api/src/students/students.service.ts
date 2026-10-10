import { BadRequestException, Injectable } from '@nestjs/common';
import { MovementKind, Prisma, Role, StudentStatus } from '@prisma/client';
import { toDbDate } from '../canteen/canteen-rules';
import { AuthUser } from '../common/auth-user';
import { Page, pageArgs } from '../common/pagination';
import { normalizePhone } from '../common/phone';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { moveYearToClass, MovementsService } from './movements.service';
import { CreateStudentDto, GuardianDto, StudentQuery, UpdateStudentDto } from './students.dto';

const include = {
  guardians: { orderBy: { isPrimary: 'desc' } },
  enrollments: {
    include: { class: { select: { id: true, name: true, gradeLevel: true } }, academicYear: { select: { id: true, name: true } } },
    orderBy: { enrolledAt: 'desc' },
  },
} satisfies Prisma.StudentInclude;

const LEAVING: StudentStatus[] = [StudentStatus.TRANSFERRED, StudentStatus.DROPPED];

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: MovementsService,
  ) {}

  async list(schoolId: string, query: StudentQuery): Promise<Page<unknown>> {
    const where: Prisma.StudentWhereInput = {
      schoolId,
      status: query.status,
      enrollments: query.classId ? { some: { classId: query.classId } } : undefined,
      policyGroups: query.policyGroup ? { has: query.policyGroup } : undefined,
      OR: query.q
        ? [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({ where, include, orderBy: { code: 'asc' }, ...pageArgs(query) }),
      this.prisma.student.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  get(schoolId: string, id: string) {
    return this.prisma.student.findFirstOrThrow({
      where: { id, schoolId },
      include: {
        ...include,
        identities: { select: { id: true, method: true, externalId: true, consentAt: true, revokedAt: true } },
      },
    });
  }

  async create(user: AuthUser, dto: CreateStudentDto) {
    const schoolId = user.schoolId;
    const { guardians, classId, dateOfBirth, entryKind, entryDate, previousSchool, ...data } = dto;
    const klass = classId ? await this.findClass(schoolId, classId) : null;
    if (entryKind === MovementKind.TRANSFER_IN && !previousSchool) throw new BadRequestException('Nhập trường học sinh chuyển đến từ');
    const date = entryKind ? await this.movements.dateOf(schoolId, entryDate) : null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: {
            ...data,
            schoolId,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            enrollments: klass ? { create: { classId: klass.id, academicYearId: klass.academicYearId } } : undefined,
          },
        });
        if (guardians?.length) await this.saveGuardians(tx, schoolId, student.id, guardians);
        if (entryKind && date) {
          await tx.studentMovement.create({
            data: { schoolId, studentId: student.id, kind: entryKind, date: toDbDate(date), academicYearId: klass?.academicYearId ?? null, toClassId: klass?.id ?? null, otherSchool: previousSchool || null, createdById: user.userId },
          });
        }
        return tx.student.findUniqueOrThrow({ where: { id: student.id }, include });
      });
    } catch (e) {
      rethrowPrismaError(e, 'Mã học sinh đã tồn tại');
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateStudentDto) {
    const schoolId = user.schoolId;
    const current = await this.prisma.student.findFirstOrThrow({ where: { id, schoolId }, select: { id: true, status: true } });
    const { guardians, classId, dateOfBirth, ...data } = dto;
    const klass = classId ? await this.findClass(schoolId, classId) : null;
    const enrolled = klass ? await this.prisma.enrollment.findUnique({ where: { studentId_academicYearId: { studentId: id, academicYearId: klass.academicYearId } }, select: { classId: true, class: { select: { gradeLevel: true, name: true } } } }) : null;
    // Leaving and coming back are movements: they go through their own actions so the sổ đăng bộ records them.
    if (data.status && data.status !== current.status && (LEAVING.includes(data.status) || LEAVING.includes(current.status))) {
      throw new BadRequestException('Dùng chức năng Chuyển trường, Thôi học hoặc Tiếp nhận trở lại để đổi tình trạng học sinh');
    }
    if (klass && enrolled && enrolled.classId !== klass.id && enrolled.class.gradeLevel !== klass.gradeLevel) {
      throw new BadRequestException(`Học sinh đang học lớp ${enrolled.class.name}: chỉ chuyển sang lớp cùng khối`);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (guardians) await this.saveGuardians(tx, schoolId, id, guardians);
        if (klass && !enrolled) await tx.enrollment.create({ data: { studentId: id, classId: klass.id, academicYearId: klass.academicYearId } });
        if (klass && enrolled && enrolled.classId !== klass.id) {
          // Changing the class here is a chuyển lớp: the year's marks follow the student.
          const date = await this.movements.dateOf(schoolId);
          await moveYearToClass(tx, { studentId: id, academicYearId: klass.academicYearId, toClassId: klass.id, date });
          await tx.studentMovement.create({
            data: { schoolId, studentId: id, kind: MovementKind.CLASS_CHANGE, date: toDbDate(date), academicYearId: klass.academicYearId, fromClassId: enrolled.classId, toClassId: klass.id, createdById: user.userId },
          });
        }
        return tx.student.update({
          where: { id },
          data: { ...data, dateOfBirth: dateOfBirth === null ? null : dateOfBirth ? new Date(dateOfBirth) : undefined },
          include,
        });
      });
    } catch (e) {
      rethrowPrismaError(e, 'Mã học sinh đã tồn tại');
    }
  }

  async remove(schoolId: string, id: string) {
    await this.prisma.student.findFirstOrThrow({ where: { id, schoolId } });
    await this.prisma.student.delete({ where: { id } });
  }

  /**
   * Replaces the student's guardians with the given list. Guardians sent with their id
   * are updated in place, so the parent account linked to them keeps seeing the child;
   * new ones are linked to the school's parent account with the same phone, if any.
   */
  private async saveGuardians(tx: Prisma.TransactionClient, schoolId: string, studentId: string, guardians: GuardianDto[]) {
    const existing = await tx.guardian.findMany({ where: { studentId }, select: { id: true } });
    const known = new Set(existing.map((g) => g.id));
    const unknown = guardians.find((g) => g.id && !known.has(g.id));
    if (unknown) throw new BadRequestException('Phụ huynh không thuộc học sinh này');
    const kept = new Set(guardians.flatMap((g) => (g.id ? [g.id] : [])));
    await tx.guardian.deleteMany({ where: { studentId, id: { notIn: [...kept] } } });
    const accounts = await tx.user.findMany({ where: { schoolId, role: Role.PARENT, phone: { in: guardians.flatMap((g) => normalizePhone(g.phone) ?? []) } }, select: { id: true, phone: true } });
    for (const { id, ...g } of guardians) {
      if (id) await tx.guardian.update({ where: { id }, data: g });
      else await tx.guardian.create({ data: { ...g, studentId, userId: accounts.find((a) => a.phone === normalizePhone(g.phone))?.id ?? null } });
    }
  }

  private async findClass(schoolId: string, classId: string) {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!klass) throw new BadRequestException('Lớp không hợp lệ');
    return klass;
  }
}
