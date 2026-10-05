import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Page, pageArgs } from '../common/pagination';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto, TeacherQuery, UpdateTeacherDto } from './teachers.dto';

const include = {
  subjects: { include: { subject: true } },
  user: { select: { id: true, email: true, isActive: true } },
  homeroomClasses: { select: { id: true, name: true, academicYearId: true } },
} satisfies Prisma.TeacherInclude;

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, query: TeacherQuery): Promise<Page<unknown>> {
    const where: Prisma.TeacherWhereInput = {
      schoolId,
      status: query.status,
      subjects: query.subjectId ? { some: { subjectId: query.subjectId } } : undefined,
      OR: query.q
        ? [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.teacher.findMany({ where, include, orderBy: { code: 'asc' }, ...pageArgs(query) }),
      this.prisma.teacher.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  get(schoolId: string, id: string) {
    return this.prisma.teacher.findFirstOrThrow({ where: { id, schoolId }, include });
  }

  async create(schoolId: string, dto: CreateTeacherDto) {
    const { subjectIds, password, dateOfBirth, ...data } = dto;
    await this.assertSubjects(schoolId, subjectIds);
    if (password && !dto.email) throw new BadRequestException('Cần email để tạo tài khoản đăng nhập');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = password
          ? await tx.user.create({
              data: {
                schoolId,
                email: dto.email!.toLowerCase(),
                fullName: dto.fullName,
                role: Role.TEACHER,
                passwordHash: await bcrypt.hash(password, 10),
              },
            })
          : null;
        return tx.teacher.create({
          data: {
            ...data,
            schoolId,
            userId: user?.id,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            subjects: subjectIds ? { create: subjectIds.map((subjectId) => ({ subjectId })) } : undefined,
          },
          include,
        });
      });
    } catch (e) {
      rethrowPrismaError(e, 'Mã giáo viên hoặc email đã tồn tại');
    }
  }

  async update(schoolId: string, id: string, dto: UpdateTeacherDto) {
    const existing = await this.prisma.teacher.findFirstOrThrow({ where: { id, schoolId } });
    const { subjectIds, password, dateOfBirth, ...data } = dto;
    await this.assertSubjects(schoolId, subjectIds);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (password) {
          const passwordHash = await bcrypt.hash(password, 10);
          if (existing.userId) {
            await tx.user.update({ where: { id: existing.userId }, data: { passwordHash } });
          } else {
            const email = (dto.email ?? existing.email)?.toLowerCase();
            if (!email) throw new BadRequestException('Cần email để tạo tài khoản đăng nhập');
            const user = await tx.user.create({
              data: { schoolId, email, fullName: dto.fullName ?? existing.fullName, role: Role.TEACHER, passwordHash },
            });
            await tx.teacher.update({ where: { id }, data: { userId: user.id } });
          }
        }
        if (subjectIds) {
          await tx.teacherSubject.deleteMany({ where: { teacherId: id } });
          await tx.teacherSubject.createMany({ data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId })) });
        }
        return tx.teacher.update({
          where: { id },
          data: { ...data, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined },
          include,
        });
      });
    } catch (e) {
      rethrowPrismaError(e, 'Mã giáo viên hoặc email đã tồn tại');
    }
  }

  async remove(schoolId: string, id: string) {
    const teacher = await this.prisma.teacher.findFirstOrThrow({ where: { id, schoolId } });
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.teacher.delete({ where: { id } });
        if (teacher.userId) await tx.user.delete({ where: { id: teacher.userId } });
      });
    } catch (e) {
      rethrowPrismaError(e, 'Giáo viên đang có lịch dạy hoặc chủ nhiệm lớp; hãy chuyển trạng thái thay vì xóa');
    }
  }

  private async assertSubjects(schoolId: string, subjectIds?: string[]) {
    if (!subjectIds?.length) return;
    const count = await this.prisma.subject.count({ where: { schoolId, id: { in: subjectIds } } });
    if (count !== new Set(subjectIds).size) throw new BadRequestException('Môn học không hợp lệ');
  }
}
