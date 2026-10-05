import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Page, pageArgs } from '../common/pagination';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto, StudentQuery, UpdateStudentDto } from './students.dto';

const include = {
  guardians: { orderBy: { isPrimary: 'desc' } },
  enrollments: {
    include: { class: { select: { id: true, name: true, gradeLevel: true } }, academicYear: { select: { id: true, name: true } } },
    orderBy: { enrolledAt: 'desc' },
  },
} satisfies Prisma.StudentInclude;

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, query: StudentQuery): Promise<Page<unknown>> {
    const where: Prisma.StudentWhereInput = {
      schoolId,
      status: query.status,
      enrollments: query.classId ? { some: { classId: query.classId } } : undefined,
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

  async create(schoolId: string, dto: CreateStudentDto) {
    const { guardians, classId, dateOfBirth, ...data } = dto;
    const klass = classId ? await this.findClass(schoolId, classId) : null;
    try {
      return await this.prisma.student.create({
        data: {
          ...data,
          schoolId,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          guardians: guardians ? { create: guardians } : undefined,
          enrollments: klass ? { create: { classId: klass.id, academicYearId: klass.academicYearId } } : undefined,
        },
        include,
      });
    } catch (e) {
      rethrowPrismaError(e, 'Mã học sinh đã tồn tại');
    }
  }

  async update(schoolId: string, id: string, dto: UpdateStudentDto) {
    await this.prisma.student.findFirstOrThrow({ where: { id, schoolId } });
    const { guardians, classId, dateOfBirth, ...data } = dto;
    const klass = classId ? await this.findClass(schoolId, classId) : null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (guardians) {
          await tx.guardian.deleteMany({ where: { studentId: id } });
          await tx.guardian.createMany({ data: guardians.map((g) => ({ ...g, studentId: id })) });
        }
        if (klass) {
          await tx.enrollment.upsert({
            where: { studentId_academicYearId: { studentId: id, academicYearId: klass.academicYearId } },
            create: { studentId: id, classId: klass.id, academicYearId: klass.academicYearId },
            update: { classId: klass.id },
          });
        }
        return tx.student.update({
          where: { id },
          data: { ...data, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined },
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

  private async findClass(schoolId: string, classId: string) {
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!klass) throw new BadRequestException('Lớp không hợp lệ');
    return klass;
  }
}
