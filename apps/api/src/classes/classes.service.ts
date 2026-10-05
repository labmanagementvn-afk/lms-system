import { BadRequestException, Injectable } from '@nestjs/common';
import { AcademicYearsService } from '../academic-years/academic-years';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { ClassQuery, CreateClassDto, UpdateClassDto } from './classes.dto';

const include = {
  homeroomTeacher: { select: { id: true, code: true, fullName: true } },
  academicYear: { select: { id: true, name: true } },
  _count: { select: { enrollments: true } },
};

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  async list(schoolId: string, query: ClassQuery) {
    const academicYearId = query.academicYearId ?? (await this.years.current(schoolId)).id;
    return this.prisma.class.findMany({
      where: { schoolId, academicYearId, gradeLevel: query.gradeLevel },
      include,
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
  }

  get(schoolId: string, id: string) {
    return this.prisma.class.findFirstOrThrow({ where: { id, schoolId }, include });
  }

  async create(schoolId: string, dto: CreateClassDto) {
    const academicYearId = dto.academicYearId ?? (await this.years.current(schoolId)).id;
    await this.assertRefs(schoolId, academicYearId, dto.homeroomTeacherId);
    try {
      return await this.prisma.class.create({ data: { ...dto, academicYearId, schoolId }, include });
    } catch (e) {
      rethrowPrismaError(e, 'Tên lớp đã tồn tại trong năm học');
    }
  }

  async update(schoolId: string, id: string, dto: UpdateClassDto) {
    const existing = await this.prisma.class.findFirstOrThrow({ where: { id, schoolId } });
    if (dto.academicYearId && dto.academicYearId !== existing.academicYearId) {
      throw new BadRequestException('Không thể đổi năm học của lớp');
    }
    await this.assertRefs(schoolId, existing.academicYearId, dto.homeroomTeacherId);
    try {
      return await this.prisma.class.update({ where: { id }, data: dto, include });
    } catch (e) {
      rethrowPrismaError(e, 'Tên lớp đã tồn tại trong năm học');
    }
  }

  async remove(schoolId: string, id: string) {
    await this.prisma.class.findFirstOrThrow({ where: { id, schoolId } });
    await this.prisma.class.delete({ where: { id } });
  }

  async students(schoolId: string, id: string) {
    await this.prisma.class.findFirstOrThrow({ where: { id, schoolId } });
    const rows = await this.prisma.enrollment.findMany({
      where: { classId: id },
      include: { student: true },
      orderBy: { student: { fullName: 'asc' } },
    });
    return rows.map((r) => r.student);
  }

  /** Puts students into this class, moving them out of any other class of the same year. */
  async enroll(schoolId: string, id: string, studentIds: string[]) {
    const klass = await this.prisma.class.findFirstOrThrow({ where: { id, schoolId } });
    const ids = [...new Set(studentIds)];
    const count = await this.prisma.student.count({ where: { schoolId, id: { in: ids } } });
    if (count !== ids.length) throw new BadRequestException('Học sinh không hợp lệ');
    await this.prisma.$transaction(
      ids.map((studentId) =>
        this.prisma.enrollment.upsert({
          where: { studentId_academicYearId: { studentId, academicYearId: klass.academicYearId } },
          create: { studentId, classId: id, academicYearId: klass.academicYearId },
          update: { classId: id },
        }),
      ),
    );
    return this.students(schoolId, id);
  }

  async unenroll(schoolId: string, id: string, studentId: string) {
    await this.prisma.class.findFirstOrThrow({ where: { id, schoolId } });
    await this.prisma.enrollment.deleteMany({ where: { classId: id, studentId } });
  }

  private async assertRefs(schoolId: string, academicYearId: string, homeroomTeacherId?: string | null) {
    const year = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
    if (!year) throw new BadRequestException('Năm học không hợp lệ');
    if (homeroomTeacherId) {
      const teacher = await this.prisma.teacher.findFirst({ where: { id: homeroomTeacherId, schoolId } });
      if (!teacher) throw new BadRequestException('Giáo viên chủ nhiệm không hợp lệ');
    }
  }
}
