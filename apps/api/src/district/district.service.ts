import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, StudentStatus, TeacherStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../common/auth-user';
import { localDate } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { AlertRulesService } from '../stats/alert-rules.service';
import { addDays, aggregateStats, DailyStatsService } from '../stats/daily-stats.service';
import { lateRate } from '../stats/alert-rules';
import { CreateOfficerDto, UpdateOfficerDto, UpdateSchoolDto } from './district.dto';

const schoolSelect = { id: true, code: true, name: true, address: true, province: true, moetCode: true, timezone: true, lateAfter: true, districtId: true } as const;

/** Phòng / Sở GD&ĐT: cross-school dashboards for district officers, and the school's own district settings. */
@Injectable()
export class DistrictService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: DailyStatsService,
    private readonly alerts: AlertRulesService,
  ) {}

  // ---- school side ----

  districts() {
    return this.prisma.district.findMany({ orderBy: [{ level: 'desc' }, { name: 'asc' }], select: { id: true, code: true, name: true, level: true, province: true } });
  }

  async school(schoolId: string) {
    const s = await this.prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { ...schoolSelect, createdAt: true, district: { select: { id: true, code: true, name: true, level: true, province: true } } },
    });
    return s;
  }

  async updateSchool(schoolId: string, dto: UpdateSchoolDto) {
    if (dto.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone });
      } catch {
        throw new BadRequestException('Múi giờ không hợp lệ');
      }
    }
    if (dto.districtId) {
      const d = await this.prisma.district.findUnique({ where: { id: dto.districtId } });
      if (!d) throw new NotFoundException('Không tìm thấy Phòng/Sở GD&ĐT');
    }
    await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        name: dto.name,
        address: dto.address,
        timezone: dto.timezone,
        lateAfter: dto.lateAfter,
        districtId: dto.districtId === undefined ? undefined : dto.districtId || null,
        moetCode: dto.moetCode,
        province: dto.province,
      },
    });
    return this.school(schoolId);
  }

  // ---- district side ----

  /** The officer's district and the ids of its schools; a DISTRICT token without a district is rejected. */
  async scope(user: AuthUser) {
    if (user.role !== Role.DISTRICT || !user.districtId) throw new ForbiddenException();
    const district = await this.prisma.district.findUnique({ where: { id: user.districtId }, include: { schools: { select: schoolSelect, orderBy: { name: 'asc' } } } });
    if (!district) throw new ForbiddenException();
    return { district, schools: district.schools, schoolIds: district.schools.map((s) => s.id) };
  }

  /** Today in the district's zone: its schools' timezone (they share one), else Vietnam's. */
  private today(schools: { timezone: string }[]) {
    return localDate(new Date(), schools[0]?.timezone ?? 'Asia/Ho_Chi_Minh');
  }

  async overview(user: AuthUser, date?: string) {
    const { district, schools, schoolIds } = await this.scope(user);
    const day = date ?? this.today(schools);
    const [rows, open, students, teachers, classes] = await Promise.all([
      this.stats.forDay(schoolIds, day),
      this.alerts.openCount(schoolIds),
      this.prisma.student.groupBy({ by: ['schoolId'], where: { schoolId: { in: schoolIds }, status: StudentStatus.STUDYING }, _count: { _all: true } }),
      this.prisma.teacher.groupBy({ by: ['schoolId'], where: { schoolId: { in: schoolIds }, status: { not: TeacherStatus.RESIGNED } }, _count: { _all: true } }),
      this.prisma.class.groupBy({ by: ['schoolId'], where: { schoolId: { in: schoolIds }, academicYear: { isCurrent: true } }, _count: { _all: true } }),
    ]);
    const byId = new Map(rows.map((r) => [r.schoolId, r]));
    const count = (list: { schoolId: string; _count: { _all: number } }[]) => Object.fromEntries(list.map((r) => [r.schoolId, r._count._all]));
    const studentsBy = count(students);
    const teachersBy = count(teachers);
    const classesBy = count(classes);
    return {
      district: { id: district.id, code: district.code, name: district.name, level: district.level, province: district.province },
      date: day,
      totals: {
        ...aggregateStats(rows),
        // Head counts come from the registers, not from the (possibly missing) statistics rows.
        schools: schools.length,
        reported: rows.length,
        students: Object.values(studentsBy).reduce((a, b) => a + b, 0),
        teachers: Object.values(teachersBy).reduce((a, b) => a + b, 0),
        classes: Object.values(classesBy).reduce((a, b) => a + b, 0),
        openAlerts: Object.values(open).reduce((a, b) => a + b, 0),
      },
      schools: schools.map((s) => {
        const stat = byId.get(s.id);
        return {
          ...s,
          students: studentsBy[s.id] ?? 0,
          teachers: teachersBy[s.id] ?? 0,
          classes: classesBy[s.id] ?? 0,
          openAlerts: open[s.id] ?? 0,
          stat: stat ? { ...stat, lateRate: lateRate(stat) } : null,
        };
      }),
    };
  }

  async trend(user: AuthUser, days: number) {
    const { schools, schoolIds } = await this.scope(user);
    const to = this.today(schools);
    return { from: addDays(to, -(days - 1)), to, items: await this.stats.trend(schoolIds, to, days) };
  }

  async schoolDetail(user: AuthUser, schoolId: string, days: number) {
    const { schools } = await this.scope(user);
    const school = schools.find((s) => s.id === schoolId);
    if (!school) throw new NotFoundException('Trường không thuộc Phòng/Sở của bạn');
    const to = localDate(new Date(), school.timezone);
    const from = addDays(to, -(days - 1));
    const [stats, students, teachers, classes, alerts, admins] = await Promise.all([
      this.stats.range(schoolId, from, to),
      this.prisma.student.count({ where: { schoolId, status: StudentStatus.STUDYING } }),
      this.prisma.teacher.count({ where: { schoolId, status: { not: TeacherStatus.RESIGNED } } }),
      this.prisma.class.findMany({ where: { schoolId, academicYear: { isCurrent: true } }, select: { id: true, name: true, gradeLevel: true, _count: { select: { enrollments: true } } }, orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }] }),
      this.alerts.events({ schoolIds: [schoolId] }, { page: 1, pageSize: 20 }),
      this.prisma.user.findMany({ where: { schoolId, role: Role.ADMIN, isActive: true }, select: { fullName: true, email: true, phone: true } }),
    ]);
    return {
      school,
      counts: { students, teachers, classes: classes.length },
      contacts: admins,
      classes: classes.map((c) => ({ id: c.id, name: c.name, gradeLevel: c.gradeLevel, students: c._count.enrollments })),
      window: { from, to, ...aggregateStats(stats) },
      stats,
      alerts: alerts.items,
    };
  }

  // ---- officer accounts ----

  async officers(user: AuthUser) {
    const { district } = await this.scope(user);
    return this.prisma.user.findMany({
      where: { districtId: district.id, role: Role.DISTRICT },
      select: { id: true, email: true, fullName: true, isActive: true, mustChangePassword: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createOfficer(user: AuthUser, dto: CreateOfficerDto) {
    const { district } = await this.scope(user);
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email đã được sử dụng');
    const created = await this.prisma.user.create({
      data: { districtId: district.id, email, fullName: dto.fullName, role: Role.DISTRICT, passwordHash: await bcrypt.hash(dto.password, 10), mustChangePassword: true },
      select: { id: true, email: true, fullName: true, isActive: true, mustChangePassword: true, createdAt: true },
    });
    return created;
  }

  async updateOfficer(user: AuthUser, id: string, dto: UpdateOfficerDto) {
    const { district } = await this.scope(user);
    const target = await this.prisma.user.findFirst({ where: { id, districtId: district.id, role: Role.DISTRICT } });
    if (!target) throw new NotFoundException('Không tìm thấy tài khoản');
    if (id === user.userId && dto.isActive === false) throw new BadRequestException('Không thể khóa tài khoản của chính mình');
    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        email: dto.email?.trim().toLowerCase(),
        isActive: dto.isActive,
        ...(dto.password ? { passwordHash: await bcrypt.hash(dto.password, 10), mustChangePassword: true } : {}),
      },
      select: { id: true, email: true, fullName: true, isActive: true, mustChangePassword: true, createdAt: true },
    });
  }
}
