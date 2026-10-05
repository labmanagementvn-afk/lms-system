import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdmissionRoundStatus, ApplicationStatus, Prisma } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { rethrowPrismaError } from '../common/prisma-errors';
import { localDate } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { RoundDto, UpdateRoundDto } from './admissions.dto';

const include = { academicYear: { select: { id: true, name: true } } } satisfies Prisma.AdmissionRoundInclude;

const STATUSES = Object.values(ApplicationStatus);

/** A date-only column holds UTC midnight, so "today" must be built the same way. */
const dateOnly = (s: string) => new Date(s.slice(0, 10));

@Injectable()
export class RoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  /** School-local calendar date as a UTC-midnight Date, comparable with @db.Date columns. */
  async today(schoolId: string): Promise<Date> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    return new Date(localDate(new Date(), school.timezone));
  }

  /** Every round with its applications counted by status and the seats taken against the capacity. */
  async list(schoolId: string) {
    const [rounds, grouped, today] = await Promise.all([
      this.prisma.admissionRound.findMany({ where: { schoolId }, include, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.admissionApplication.groupBy({ by: ['roundId', 'status'], where: { schoolId }, _count: true }),
      this.today(schoolId),
    ]);
    return rounds.map((r) => {
      const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
      for (const g of grouped) if (g.roundId === r.id) counts[g.status] = g._count;
      const total = STATUSES.reduce((s, k) => s + counts[k], 0);
      return {
        ...r,
        counts,
        total,
        acceptedCount: counts.ACCEPTED + counts.ENROLLED,
        acceptingNow: r.status === AdmissionRoundStatus.OPEN && r.startDate <= today && r.endDate >= today,
      };
    });
  }

  async find(schoolId: string, id: string) {
    const round = await this.prisma.admissionRound.findFirst({ where: { id, schoolId }, include });
    if (!round) throw new NotFoundException('Không tìm thấy đợt tuyển sinh');
    return round;
  }

  /** Open rounds whose date range includes today; what the public form offers. */
  async openRounds(schoolId: string) {
    const today = await this.today(schoolId);
    return this.prisma.admissionRound.findMany({
      where: { schoolId, status: AdmissionRoundStatus.OPEN, startDate: { lte: today }, endDate: { gte: today } },
      select: { id: true, name: true, gradeLevel: true, startDate: true, endDate: true, description: true, academicYear: { select: { name: true } } },
      orderBy: [{ gradeLevel: 'asc' }, { startDate: 'asc' }],
    });
  }

  async create(schoolId: string, dto: RoundDto) {
    if (dto.startDate.slice(0, 10) > dto.endDate.slice(0, 10)) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    const academicYearId = dto.academicYearId ?? (await this.years.current(schoolId)).id;
    if (!(await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } }))) throw new BadRequestException('Năm học không hợp lệ');
    try {
      return await this.prisma.admissionRound.create({
        data: {
          schoolId,
          academicYearId,
          name: dto.name.trim(),
          gradeLevel: dto.gradeLevel,
          startDate: dateOnly(dto.startDate),
          endDate: dateOnly(dto.endDate),
          capacity: dto.capacity ?? null,
          description: dto.description ?? null,
        },
        include,
      });
    } catch (e) {
      rethrowPrismaError(e, 'Tên đợt tuyển sinh đã tồn tại');
    }
  }

  async update(schoolId: string, id: string, dto: UpdateRoundDto) {
    const existing = await this.find(schoolId, id);
    const start = dto.startDate ? dateOnly(dto.startDate) : existing.startDate;
    const end = dto.endDate ? dateOnly(dto.endDate) : existing.endDate;
    if (start > end) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    if (dto.academicYearId && dto.academicYearId !== existing.academicYearId) {
      if (!(await this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, schoolId } }))) throw new BadRequestException('Năm học không hợp lệ');
    }
    try {
      return await this.prisma.admissionRound.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          gradeLevel: dto.gradeLevel,
          startDate: dto.startDate ? start : undefined,
          endDate: dto.endDate ? end : undefined,
          capacity: dto.capacity,
          description: dto.description,
          academicYearId: dto.academicYearId,
        },
        include,
      });
    } catch (e) {
      rethrowPrismaError(e, 'Tên đợt tuyển sinh đã tồn tại');
    }
  }

  async close(schoolId: string, id: string) {
    const round = await this.find(schoolId, id);
    if (round.status === AdmissionRoundStatus.CLOSED) throw new BadRequestException('Đợt tuyển sinh đã đóng');
    return this.prisma.admissionRound.update({ where: { id }, data: { status: AdmissionRoundStatus.CLOSED }, include });
  }

  async remove(schoolId: string, id: string) {
    await this.find(schoolId, id);
    const n = await this.prisma.admissionApplication.count({ where: { roundId: id } });
    if (n) throw new ConflictException('Đợt tuyển sinh đã có hồ sơ; hãy đóng đợt thay vì xóa');
    await this.prisma.admissionRound.delete({ where: { id } });
  }
}
