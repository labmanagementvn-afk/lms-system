import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegistrationStatus, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { Page, pageArgs } from '../common/pagination';
import { ParentAccessService } from '../parents/parent-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceQuery, ServiceRegistrationDto, UNIFORM_SIZES } from './admissions.dto';
import { serializeCsv } from './csv';

export interface Uniform {
  shirtSize?: string;
  pantsSize?: string;
  quantity?: number;
}

const CONFIRMED_MESSAGE = 'Đăng ký đã được nhà trường xác nhận, liên hệ văn phòng để thay đổi';
const STATUS_LABELS: Record<RegistrationStatus, string> = { SUBMITTED: 'Đã gửi', CONFIRMED: 'Đã xác nhận' };

/** Start-of-year service registrations (bán trú, xe, đồng phục...), one per student per academic year. */
@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
    private readonly access: ParentAccessService,
  ) {}

  // ---- Parent ----

  async forParent(user: AuthUser, studentId: string) {
    await this.access.assertChild(user, studentId);
    const year = await this.years.current(user.schoolId);
    const registration = await this.prisma.serviceRegistration.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: year.id } } });
    return { academicYear: { id: year.id, name: year.name }, registration };
  }

  async submitByParent(user: AuthUser, studentId: string, dto: ServiceRegistrationDto) {
    await this.access.assertChild(user, studentId);
    const year = await this.years.current(user.schoolId);
    const existing = await this.prisma.serviceRegistration.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: year.id } } });
    if (existing?.status === RegistrationStatus.CONFIRMED) throw new BadRequestException(CONFIRMED_MESSAGE);
    const data = this.data(dto);
    return this.prisma.serviceRegistration.upsert({
      where: { studentId_academicYearId: { studentId, academicYearId: year.id } },
      create: { ...data, schoolId: user.schoolId, studentId, academicYearId: year.id, status: RegistrationStatus.SUBMITTED, submittedByUserId: user.userId },
      update: { ...data, status: RegistrationStatus.SUBMITTED, submittedByUserId: user.userId },
    });
  }

  // ---- Staff ----

  /** Studying students of the current year with their registration (null when none yet). */
  async list(schoolId: string, query: ServiceQuery): Promise<Page<unknown>> {
    const year = await this.years.current(schoolId);
    const where: Prisma.StudentWhereInput = {
      schoolId,
      status: StudentStatus.STUDYING,
      enrollments: { some: { academicYearId: year.id, classId: query.classId } },
      serviceRegistrations:
        query.status === 'NONE'
          ? { none: { academicYearId: year.id } }
          : query.status
            ? { some: { academicYearId: year.id, status: query.status } }
            : undefined,
      OR: query.q
        ? [{ fullName: { contains: query.q, mode: 'insensitive' } }, { code: { contains: query.q, mode: 'insensitive' } }]
        : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          code: true,
          fullName: true,
          enrollments: { where: { academicYearId: year.id }, select: { class: { select: { id: true, name: true } } } },
          serviceRegistrations: { where: { academicYearId: year.id } },
        },
        orderBy: { code: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.student.count({ where }),
    ]);
    const items = rows.map(({ enrollments, serviceRegistrations, ...s }) => ({
      student: { ...s, class: enrollments[0]?.class ?? null },
      registration: serviceRegistrations[0] ?? null,
    }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async summary(schoolId: string, classId?: string) {
    const year = await this.years.current(schoolId);
    const enrolled: Prisma.StudentWhereInput = { schoolId, status: StudentStatus.STUDYING, enrollments: { some: { academicYearId: year.id, classId } } };
    const [students, regs] = await Promise.all([
      this.prisma.student.count({ where: enrolled }),
      this.prisma.serviceRegistration.findMany({ where: { schoolId, academicYearId: year.id, student: enrolled } }),
    ]);
    const bySize: Record<string, number> = Object.fromEntries(UNIFORM_SIZES.map((s) => [s, 0]));
    const pantsBySize: Record<string, number> = Object.fromEntries(UNIFORM_SIZES.map((s) => [s, 0]));
    const extras: Record<string, number> = {};
    let quantity = 0;
    let uniformCount = 0;
    for (const r of regs) {
      const u = r.uniform as Uniform | null;
      if (u && (u.shirtSize || u.pantsSize)) {
        uniformCount++;
        quantity += u.quantity ?? 1;
        if (u.shirtSize) bySize[u.shirtSize] = (bySize[u.shirtSize] ?? 0) + 1;
        if (u.pantsSize) pantsBySize[u.pantsSize] = (pantsBySize[u.pantsSize] ?? 0) + 1;
      }
      for (const name of (r.extras as string[] | null) ?? []) extras[name] = (extras[name] ?? 0) + 1;
    }
    return {
      academicYear: { id: year.id, name: year.name },
      students,
      registered: regs.length,
      submitted: regs.filter((r) => r.status === RegistrationStatus.SUBMITTED).length,
      confirmed: regs.filter((r) => r.status === RegistrationStatus.CONFIRMED).length,
      canteen: regs.filter((r) => r.canteen).length,
      bus: regs.filter((r) => r.bus).length,
      uniform: { count: uniformCount, bySize, pantsBySize, quantity },
      extras,
    };
  }

  /** Staff edit on behalf of a family; the status is left as it is. */
  async saveByStaff(user: AuthUser, studentId: string, dto: ServiceRegistrationDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId } });
    if (!student) throw new NotFoundException('Không tìm thấy học sinh');
    const year = await this.years.current(user.schoolId);
    const data = this.data(dto);
    return this.prisma.serviceRegistration.upsert({
      where: { studentId_academicYearId: { studentId, academicYearId: year.id } },
      create: { ...data, schoolId: user.schoolId, studentId, academicYearId: year.id, submittedByUserId: user.userId },
      update: data,
    });
  }

  async confirm(schoolId: string, id: string) {
    const reg = await this.prisma.serviceRegistration.findFirst({ where: { id, schoolId } });
    if (!reg) throw new NotFoundException('Không tìm thấy đăng ký');
    return this.prisma.serviceRegistration.update({ where: { id }, data: { status: RegistrationStatus.CONFIRMED } });
  }

  async exportCsv(schoolId: string, classId?: string): Promise<string> {
    const year = await this.years.current(schoolId);
    const rows = await this.prisma.student.findMany({
      where: { schoolId, status: StudentStatus.STUDYING, enrollments: { some: { academicYearId: year.id, classId } } },
      select: {
        code: true,
        fullName: true,
        enrollments: { where: { academicYearId: year.id }, select: { class: { select: { name: true } } } },
        serviceRegistrations: { where: { academicYearId: year.id } },
      },
      orderBy: { code: 'asc' },
    });
    const header = ['Mã HS', 'Họ tên', 'Lớp', 'Bán trú', 'Xe đưa đón', 'Điểm đón', 'Size áo', 'Size quần', 'Số bộ', 'Dịch vụ khác', 'Ghi chú', 'Trạng thái'];
    const yesNo = (b: boolean) => (b ? 'Có' : 'Không');
    const body = rows.map((s) => {
      const r = s.serviceRegistrations[0];
      const u = (r?.uniform as Uniform | null) ?? null;
      return [
        s.code,
        s.fullName,
        s.enrollments[0]?.class.name,
        r ? yesNo(r.canteen) : '',
        r ? yesNo(r.bus) : '',
        r?.busStopNote,
        u?.shirtSize,
        u?.pantsSize,
        u && (u.shirtSize || u.pantsSize) ? (u.quantity ?? 1) : '',
        ((r?.extras as string[] | null) ?? []).join('; '),
        r?.note,
        r ? STATUS_LABELS[r.status] : 'Chưa đăng ký',
      ];
    });
    return serializeCsv([header, ...body], { bom: true });
  }

  /** Normalises the form into column values; empty uniform/extras are stored as NULL. */
  private data(dto: ServiceRegistrationDto) {
    const u = dto.uniform;
    const uniform = u && (u.shirtSize || u.pantsSize) ? { shirtSize: u.shirtSize ?? null, pantsSize: u.pantsSize ?? null, quantity: u.quantity ?? 1 } : Prisma.DbNull;
    const extras = [...new Set((dto.extras ?? []).map((e) => e.trim()).filter(Boolean))];
    return {
      canteen: dto.canteen,
      bus: dto.bus,
      busStopNote: dto.bus ? (dto.busStopNote?.trim() || null) : null,
      uniform,
      extras: extras.length ? extras : Prisma.DbNull,
      note: dto.note?.trim() || null,
    };
  }
}
