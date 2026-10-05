import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Page, pageArgs } from '../common/pagination';
import { localDate, zonedDayRange } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { bmi, daysUntil } from './health-rules';
import {
  HealthCheckDto,
  HealthCheckQuery,
  HealthProfileDto,
  IncidentDto,
  IncidentQuery,
  InsuranceQuery,
  UpdateHealthCheckDto,
  UpdateIncidentDto,
  VaccinationDto,
} from './health.dto';

// Latest enrolment = the student's current class.
const student = {
  select: {
    id: true,
    code: true,
    fullName: true,
    enrollments: { orderBy: { enrolledAt: 'desc' }, take: 1, select: { class: { select: { id: true, name: true } } } },
  },
} satisfies Prisma.StudentDefaultArgs;

type StudentRow = Prisma.StudentGetPayload<typeof student>;
const flat = ({ enrollments, ...s }: StudentRow) => ({ ...s, class: enrollments[0]?.class ?? null });
const date = (d?: string) => (d ? new Date(d) : undefined);

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async record(schoolId: string, studentId: string) {
    const s = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: {
        ...student.select,
        healthProfile: true,
        healthChecks: { orderBy: { checkedAt: 'desc' } },
        vaccinations: { orderBy: { givenAt: 'desc' } },
        healthIncidents: { orderBy: { occurredAt: 'desc' } },
      },
    });
    if (!s) throw new NotFoundException('Không tìm thấy học sinh');
    const { healthProfile, healthChecks, vaccinations, healthIncidents, ...rest } = s;
    return { student: flat(rest), profile: healthProfile, checks: healthChecks, vaccinations, incidents: healthIncidents };
  }

  async saveProfile(schoolId: string, studentId: string, dto: HealthProfileDto) {
    await this.findStudent(schoolId, studentId);
    // PUT replaces the whole profile, so omitted fields are cleared.
    const data = {
      bloodType: dto.bloodType ?? null,
      allergies: dto.allergies ?? null,
      chronicConditions: dto.chronicConditions ?? null,
      insuranceNumber: dto.insuranceNumber?.toUpperCase() ?? null,
      insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : null,
      notes: dto.notes ?? null,
    };
    return this.prisma.healthProfile.upsert({ where: { studentId }, create: { ...data, schoolId, studentId }, update: data });
  }

  async createCheck(schoolId: string, dto: HealthCheckDto) {
    await this.findStudent(schoolId, dto.studentId);
    return this.prisma.healthCheck.create({
      data: { ...dto, schoolId, checkedAt: new Date(dto.checkedAt), bmi: bmi(dto.heightCm, dto.weightKg) },
    });
  }

  async updateCheck(schoolId: string, id: string, dto: UpdateHealthCheckDto) {
    const check = await this.prisma.healthCheck.findFirst({ where: { id, schoolId } });
    if (!check) throw new NotFoundException('Không tìm thấy lượt khám');
    return this.prisma.healthCheck.update({
      where: { id },
      data: {
        ...dto,
        checkedAt: date(dto.checkedAt),
        bmi: bmi(dto.heightCm ?? check.heightCm, dto.weightKg ?? check.weightKg),
      },
    });
  }

  async removeCheck(schoolId: string, id: string) {
    const { count } = await this.prisma.healthCheck.deleteMany({ where: { id, schoolId } });
    if (!count) throw new NotFoundException('Không tìm thấy lượt khám');
  }

  async listChecks(schoolId: string, query: HealthCheckQuery): Promise<Page<unknown>> {
    const where: Prisma.HealthCheckWhereInput = {
      schoolId,
      studentId: query.studentId,
      checkedAt: query.from || query.to ? { gte: date(query.from), lte: date(query.to) } : undefined,
      student: {
        enrollments: query.classId ? { some: { classId: query.classId } } : undefined,
        OR: query.q
          ? [{ fullName: { contains: query.q, mode: 'insensitive' } }, { code: { contains: query.q, mode: 'insensitive' } }]
          : undefined,
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.healthCheck.findMany({
        where,
        include: { student },
        orderBy: [{ checkedAt: 'desc' }, { student: { fullName: 'asc' } }],
        ...pageArgs(query),
      }),
      this.prisma.healthCheck.count({ where }),
    ]);
    return { items: items.map((i) => ({ ...i, student: flat(i.student) })), total, page: query.page, pageSize: query.pageSize };
  }

  async createVaccination(schoolId: string, dto: VaccinationDto) {
    await this.findStudent(schoolId, dto.studentId);
    return this.prisma.vaccination.create({ data: { ...dto, schoolId, givenAt: new Date(dto.givenAt) } });
  }

  async removeVaccination(schoolId: string, id: string) {
    const { count } = await this.prisma.vaccination.deleteMany({ where: { id, schoolId } });
    if (!count) throw new NotFoundException('Không tìm thấy mũi tiêm');
  }

  async createIncident(schoolId: string, userId: string, dto: IncidentDto) {
    await this.findStudent(schoolId, dto.studentId);
    const incident = await this.prisma.healthIncident.create({
      data: { ...dto, schoolId, occurredAt: new Date(dto.occurredAt), recordedById: userId },
      include: { student },
    });
    return { ...incident, student: flat(incident.student) };
  }

  async updateIncident(schoolId: string, id: string, dto: UpdateIncidentDto) {
    if (!(await this.prisma.healthIncident.findFirst({ where: { id, schoolId } }))) throw new NotFoundException('Không tìm thấy sự cố');
    const incident = await this.prisma.healthIncident.update({
      where: { id },
      data: { ...dto, occurredAt: date(dto.occurredAt) },
      include: { student },
    });
    return { ...incident, student: flat(incident.student) };
  }

  async listIncidents(schoolId: string, query: IncidentQuery): Promise<Page<unknown>> {
    const tz = await this.timezone(schoolId);
    const where: Prisma.HealthIncidentWhereInput = {
      schoolId,
      studentId: query.studentId,
      severity: query.severity,
      occurredAt:
        query.from || query.to
          ? {
              gte: query.from ? zonedDayRange(query.from.slice(0, 10), tz).start : undefined,
              lt: query.to ? zonedDayRange(query.to.slice(0, 10), tz).end : undefined,
            }
          : undefined,
      student: query.q
        ? { OR: [{ fullName: { contains: query.q, mode: 'insensitive' } }, { code: { contains: query.q, mode: 'insensitive' } }] }
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.healthIncident.findMany({ where, include: { student }, orderBy: { occurredAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.healthIncident.count({ where }),
    ]);
    return { items: items.map((i) => ({ ...i, student: flat(i.student) })), total, page: query.page, pageSize: query.pageSize };
  }

  /** Studying students whose BHYT card is missing, expired, or expires within `days`. */
  async insuranceExpiring(schoolId: string, query: InsuranceQuery): Promise<Page<unknown>> {
    const today = new Date(localDate(new Date(), await this.timezone(schoolId)));
    const limit = new Date(today.getTime() + query.days * 86_400_000);
    const where: Prisma.StudentWhereInput = {
      schoolId,
      status: 'STUDYING',
      enrollments: query.classId ? { some: { classId: query.classId } } : undefined,
      AND: [
        {
          OR: [
            { healthProfile: { is: null } },
            { healthProfile: { insuranceNumber: null } },
            { healthProfile: { insuranceExpiry: null } },
            { healthProfile: { insuranceExpiry: { lte: limit } } },
          ],
        },
        query.q
          ? { OR: [{ fullName: { contains: query.q, mode: 'insensitive' } }, { code: { contains: query.q, mode: 'insensitive' } }] }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: { ...student.select, healthProfile: { select: { insuranceNumber: true, insuranceExpiry: true } } },
        orderBy: [{ healthProfile: { insuranceExpiry: { sort: 'asc', nulls: 'first' } } }, { code: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.student.count({ where }),
    ]);
    const items = rows.map(({ healthProfile, ...s }) => ({
      student: flat(s),
      insuranceNumber: healthProfile?.insuranceNumber ?? null,
      insuranceExpiry: healthProfile?.insuranceExpiry ?? null,
      daysLeft: healthProfile?.insuranceExpiry ? daysUntil(healthProfile.insuranceExpiry, today) : null,
    }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private async findStudent(schoolId: string, id: string) {
    const s = await this.prisma.student.findFirst({ where: { id, schoolId } });
    if (!s) throw new BadRequestException('Học sinh không hợp lệ');
    return s;
  }

  private async timezone(schoolId: string) {
    return (await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } })).timezone;
  }
}
