import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AcademicYearsService } from '../academic-years/academic-years';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { conflictMessages, findConflicts, Slot } from './conflicts';
import { PeriodDto, TimetableEntryDto, TimetableQuery, UpdateTimetableEntryDto } from './schedules.dto';

const include = {
  class: { select: { id: true, name: true } },
  subject: { select: { id: true, code: true, name: true } },
  teacher: { select: { id: true, code: true, fullName: true } },
};

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  periods(schoolId: string) {
    return this.prisma.period.findMany({ where: { schoolId }, orderBy: { number: 'asc' } });
  }

  async replacePeriods(schoolId: string, periods: PeriodDto[]) {
    const numbers = new Set(periods.map((p) => p.number));
    if (numbers.size !== periods.length) throw new BadRequestException('Số tiết bị trùng');
    for (const p of periods) {
      if (p.startTime >= p.endTime) throw new BadRequestException(`Tiết ${p.number}: giờ kết thúc phải sau giờ bắt đầu`);
    }
    await this.prisma.$transaction([
      this.prisma.period.deleteMany({ where: { schoolId } }),
      this.prisma.period.createMany({ data: periods.map((p) => ({ ...p, schoolId })) }),
    ]);
    return this.periods(schoolId);
  }

  async timetable(schoolId: string, query: TimetableQuery) {
    const academicYearId = query.academicYearId ?? (await this.years.current(schoolId)).id;
    return this.prisma.timetableEntry.findMany({
      where: { schoolId, academicYearId, semester: query.semester, classId: query.classId, teacherId: query.teacherId },
      include,
      orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
    });
  }

  async create(schoolId: string, dto: TimetableEntryDto) {
    const klass = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
    if (!klass) throw new BadRequestException('Lớp không hợp lệ');
    await this.assertRefs(schoolId, dto);
    const room = dto.room ?? klass.room;
    await this.assertNoConflicts(schoolId, klass.academicYearId, dto.semester, { ...dto, room });
    try {
      return await this.prisma.timetableEntry.create({
        data: { ...dto, room, schoolId, academicYearId: klass.academicYearId },
        include,
      });
    } catch (e) {
      rethrowPrismaError(e, 'Trùng lịch: lớp hoặc giáo viên đã có tiết vào thời điểm này');
    }
  }

  async update(schoolId: string, id: string, dto: UpdateTimetableEntryDto) {
    const existing = await this.prisma.timetableEntry.findFirstOrThrow({ where: { id, schoolId } });
    const next = { ...existing, ...dto, id };
    await this.assertRefs(schoolId, next);
    await this.assertNoConflicts(schoolId, existing.academicYearId, existing.semester, next);
    try {
      return await this.prisma.timetableEntry.update({ where: { id }, data: dto, include });
    } catch (e) {
      rethrowPrismaError(e, 'Trùng lịch: lớp hoặc giáo viên đã có tiết vào thời điểm này');
    }
  }

  async remove(schoolId: string, id: string) {
    await this.prisma.timetableEntry.findFirstOrThrow({ where: { id, schoolId } });
    await this.prisma.timetableEntry.delete({ where: { id } });
  }

  private async assertRefs(schoolId: string, dto: { subjectId: string; teacherId: string; periodNumber: number }) {
    const [subject, teacher, period] = await Promise.all([
      this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId } }),
      this.prisma.teacher.findFirst({ where: { id: dto.teacherId, schoolId } }),
      this.prisma.period.findFirst({ where: { number: dto.periodNumber, schoolId } }),
    ]);
    if (!subject) throw new BadRequestException('Môn học không hợp lệ');
    if (!teacher) throw new BadRequestException('Giáo viên không hợp lệ');
    if (teacher.status !== 'ACTIVE') throw new BadRequestException('Giáo viên không còn công tác');
    if (!period) throw new BadRequestException(`Chưa khai báo tiết ${dto.periodNumber}`);
  }

  private async assertNoConflicts(schoolId: string, academicYearId: string, semester: number, slot: Slot) {
    const existing = await this.prisma.timetableEntry.findMany({
      where: { schoolId, academicYearId, semester, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber },
    });
    const conflicts = findConflicts(slot, existing);
    if (conflicts.length) {
      throw new ConflictException({
        statusCode: 409,
        message: conflictMessages[conflicts[0].kind],
        conflicts,
      });
    }
  }
}
