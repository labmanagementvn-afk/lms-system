import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, LeaveStatus, LeaveType, NotificationKind, Prisma } from '@prisma/client';
import { Page, pageArgs } from '../common/pagination';
import { normalizePhone } from '../common/phone';
import { rethrowPrismaError } from '../common/prisma-errors';
import { localDate } from '../common/time';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ContractDto,
  CreateEmployeeDto,
  DecideLeaveDto,
  DocumentDto,
  EmployeeQuery,
  ExpiringQuery,
  LeaveQuery,
  LeaveRequestDto,
  UpdateContractDto,
  UpdateDocumentDto,
  UpdateEmployeeDto,
  WorkHistoryDto,
} from './hr.dto';
import { daysUntil, toDay, workingDays } from './leave-days';

const DAY_MS = 86_400_000;
const TEACHER_DEPARTMENT = 'Giáo viên';
/** Statuses that count towards headcount. */
const CURRENT: EmployeeStatus[] = [EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE];
const LEAVE_TYPE_VN: Record<LeaveType, string> = {
  ANNUAL: 'Nghỉ phép năm',
  SICK: 'Nghỉ ốm',
  UNPAID: 'Nghỉ không lương',
  MATERNITY: 'Nghỉ thai sản',
  OTHER: 'Nghỉ việc riêng',
};
const LEAVE_STATUS_VN: Record<LeaveStatus, string> = { PENDING: 'chờ duyệt', APPROVED: 'đã duyệt', REJECTED: 'từ chối' };

const employeeSummary = {
  select: { id: true, code: true, fullName: true, department: true, position: true, status: true },
} satisfies Prisma.EmployeeDefaultArgs;

const employeeInclude = {
  teacher: { select: { id: true, code: true, status: true } },
  user: { select: { id: true, email: true, role: true, isActive: true } },
} satisfies Prisma.EmployeeInclude;

const detailInclude = {
  ...employeeInclude,
  documents: { orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }] },
  contracts: { orderBy: { startDate: 'desc' } },
  workHistory: { orderBy: { fromDate: 'desc' } },
  leaves: { orderBy: { createdAt: 'desc' }, take: 50 },
} satisfies Prisma.EmployeeInclude;

type EmployeeDetail = Prisma.EmployeeGetPayload<{ include: typeof detailInclude }>;

/** YYYY-MM-DD (or ISO) -> UTC midnight for @db.Date columns; null clears, undefined leaves unchanged. */
const day = (s?: string | null) => (s ? toDay(s) : s === null ? null : undefined);
const vnDate = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- Employees ----

  async listEmployees(schoolId: string, query: EmployeeQuery): Promise<Page<unknown>> {
    const where: Prisma.EmployeeWhereInput = {
      schoolId,
      department: query.department,
      status: query.status,
      OR: query.q
        ? [
            { code: { contains: query.q, mode: 'insensitive' } },
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, include: employeeInclude, orderBy: [{ status: 'asc' }, { code: 'asc' }], ...pageArgs(query) }),
      this.prisma.employee.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getEmployee(schoolId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, schoolId }, include: detailInclude });
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên');
    return this.withExpiry(employee, await this.today(schoolId));
  }

  async createEmployee(schoolId: string, dto: CreateEmployeeDto) {
    const { teacherId, code, ...rest } = dto;
    const teacher = teacherId ? await this.linkableTeacher(schoolId, teacherId) : null;
    const data = { ...this.employeeData(rest), schoolId, teacherId: teacher?.id, userId: teacher?.userId ?? undefined };
    // The auto-generated code is read-then-insert; retry the rare concurrent collision.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.employee.create({ data: { ...data, code: code ?? (await this.nextCode(schoolId)) }, include: employeeInclude });
      } catch (e) {
        if (!code && attempt < 3 && isUnique(e)) continue;
        rethrowPrismaError(e, 'Mã nhân viên đã tồn tại');
      }
    }
  }

  async updateEmployee(schoolId: string, id: string, dto: UpdateEmployeeDto) {
    const current = await this.findEmployee(schoolId, id);
    const { teacherId, code, ...rest } = dto;
    const data: Prisma.EmployeeUncheckedUpdateInput = { ...this.employeeData(rest), code };
    if (teacherId === null) {
      data.teacherId = null;
    } else if (teacherId !== undefined && teacherId !== current.teacherId) {
      const teacher = await this.linkableTeacher(schoolId, teacherId);
      data.teacherId = teacher.id;
      if (!current.userId && teacher.userId) data.userId = teacher.userId;
    }
    try {
      return await this.prisma.employee.update({ where: { id }, data, include: employeeInclude });
    } catch (e) {
      rethrowPrismaError(e, 'Mã nhân viên đã tồn tại');
    }
  }

  /** Creates an employee record for every teacher that has none, sharing the teacher's login. */
  async fromTeachers(schoolId: string) {
    const teachers = await this.prisma.teacher.findMany({
      where: { schoolId, employee: null },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        fullName: true,
        gender: true,
        dateOfBirth: true,
        phone: true,
        email: true,
        userId: true,
        user: { select: { employee: { select: { id: true } } } },
      },
    });
    if (!teachers.length) return { created: 0 };
    const taken = new Set((await this.prisma.employee.findMany({ where: { schoolId }, select: { code: true } })).map((e) => e.code));
    let next = Number((await this.nextCode(schoolId)).slice(2));
    await this.prisma.$transaction(async (tx) => {
      for (const t of teachers) {
        // Teachers keep their GV code unless an unrelated employee already uses it.
        const code = taken.has(t.code) ? `NV${String(next++).padStart(3, '0')}` : t.code;
        taken.add(code);
        await tx.employee.create({
          data: {
            schoolId,
            code,
            fullName: t.fullName,
            gender: t.gender,
            dateOfBirth: t.dateOfBirth,
            phone: t.phone,
            email: t.email,
            department: TEACHER_DEPARTMENT,
            position: TEACHER_DEPARTMENT,
            teacherId: t.id,
            // Leave the login unlinked if some other employee already owns that account.
            userId: t.user?.employee ? null : t.userId,
          },
        });
      }
    });
    return { created: teachers.length };
  }

  // ---- Documents ----

  async addDocument(schoolId: string, employeeId: string, dto: DocumentDto) {
    await this.findEmployee(schoolId, employeeId);
    return this.prisma.employeeDocument.create({ data: { ...dto, employeeId, issuedAt: day(dto.issuedAt), expiresAt: day(dto.expiresAt) } });
  }

  async updateDocument(schoolId: string, id: string, dto: UpdateDocumentDto) {
    if (!(await this.prisma.employeeDocument.findFirst({ where: { id, employee: { schoolId } } }))) throw new NotFoundException('Không tìm thấy giấy tờ');
    return this.prisma.employeeDocument.update({ where: { id }, data: { ...dto, issuedAt: day(dto.issuedAt), expiresAt: day(dto.expiresAt) } });
  }

  async removeDocument(schoolId: string, id: string) {
    const { count } = await this.prisma.employeeDocument.deleteMany({ where: { id, employee: { schoolId } } });
    if (!count) throw new NotFoundException('Không tìm thấy giấy tờ');
  }

  // ---- Contracts ----

  async addContract(schoolId: string, employeeId: string, dto: ContractDto) {
    await this.findEmployee(schoolId, employeeId);
    const endDate = day(dto.endDate);
    this.checkContractDates(dto.startDate, endDate);
    return this.prisma.employmentContract.create({ data: { ...dto, employeeId, startDate: toDay(dto.startDate), endDate } });
  }

  async updateContract(schoolId: string, id: string, dto: UpdateContractDto) {
    const current = await this.prisma.employmentContract.findFirst({ where: { id, employee: { schoolId } } });
    if (!current) throw new NotFoundException('Không tìm thấy hợp đồng');
    const endDate = dto.endDate === undefined ? current.endDate : day(dto.endDate);
    this.checkContractDates(dto.startDate ?? current.startDate, endDate);
    return this.prisma.employmentContract.update({
      where: { id },
      data: { ...dto, startDate: dto.startDate ? toDay(dto.startDate) : undefined, endDate: day(dto.endDate) },
    });
  }

  async removeContract(schoolId: string, id: string) {
    const { count } = await this.prisma.employmentContract.deleteMany({ where: { id, employee: { schoolId } } });
    if (!count) throw new NotFoundException('Không tìm thấy hợp đồng');
  }

  // ---- Work history ----

  async addHistory(schoolId: string, employeeId: string, dto: WorkHistoryDto) {
    await this.findEmployee(schoolId, employeeId);
    const toDate = day(dto.toDate);
    if (toDate && toDate < toDay(dto.fromDate)) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    return this.prisma.workHistory.create({ data: { ...dto, employeeId, fromDate: toDay(dto.fromDate), toDate } });
  }

  async removeHistory(schoolId: string, id: string) {
    const { count } = await this.prisma.workHistory.deleteMany({ where: { id, employee: { schoolId } } });
    if (!count) throw new NotFoundException('Không tìm thấy quá trình công tác');
  }

  // ---- Expiring documents and contracts ----

  /** Documents and each employee's latest contract that expire within `days` days (or already have). */
  async expiring(schoolId: string, query: ExpiringQuery) {
    const today = await this.today(schoolId);
    const limit = new Date(today.getTime() + query.days * DAY_MS);
    const employee = { schoolId, status: { in: CURRENT } };
    const [documents, contracts] = await Promise.all([
      this.prisma.employeeDocument.findMany({
        where: { employee, expiresAt: { lte: limit } },
        include: { employee: employeeSummary },
        orderBy: [{ expiresAt: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.employmentContract.findMany({ where: { employee }, include: { employee: employeeSummary }, orderBy: { startDate: 'asc' } }),
    ]);
    // A renewed contract supersedes the expired one, so only the latest per employee counts.
    const latest = new Map<string, (typeof contracts)[number]>();
    for (const c of contracts) latest.set(c.employeeId, c);
    const expiringContracts = [...latest.values()]
      .filter((c) => c.endDate && c.endDate <= limit)
      .sort((a, b) => a.endDate!.getTime() - b.endDate!.getTime());
    return {
      documents: documents.map((d) => ({ ...d, daysLeft: daysUntil(d.expiresAt!, today) })),
      contracts: expiringContracts.map((c) => ({ ...c, daysLeft: daysUntil(c.endDate!, today) })),
    };
  }

  // ---- Leave ----

  async listLeave(schoolId: string, query: LeaveQuery): Promise<Page<unknown>> {
    const where: Prisma.LeaveRequestWhereInput = {
      schoolId,
      status: query.status,
      employeeId: query.employeeId,
      employee: query.q
        ? { OR: [{ fullName: { contains: query.q, mode: 'insensitive' } }, { code: { contains: query.q, mode: 'insensitive' } }] }
        : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({ where, include: { employee: employeeSummary }, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return { items: await this.withDeciders(rows), total, page: query.page, pageSize: query.pageSize };
  }

  async createLeave(schoolId: string, employeeId: string, dto: LeaveRequestDto) {
    const employee = await this.findEmployee(schoolId, employeeId);
    if (!CURRENT.includes(employee.status)) throw new BadRequestException('Nhân viên đã nghỉ việc');
    const fromDate = toDay(dto.fromDate);
    const toDate = toDay(dto.toDate);
    if (toDate < fromDate) throw new BadRequestException('Ngày kết thúc phải từ ngày bắt đầu trở đi');
    const days = workingDays(fromDate, toDate);
    if (!days) throw new BadRequestException('Khoảng nghỉ không có ngày làm việc (thứ Hai đến thứ Sáu)');
    const clash = await this.prisma.leaveRequest.findFirst({
      where: { employeeId, status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] }, fromDate: { lte: toDate }, toDate: { gte: fromDate } },
    });
    if (clash) {
      throw new BadRequestException(`Trùng với đơn nghỉ ${vnDate(clash.fromDate)} - ${vnDate(clash.toDate)} (${LEAVE_STATUS_VN[clash.status]})`);
    }
    const leave = await this.prisma.leaveRequest.create({
      data: { schoolId, employeeId, type: dto.type, fromDate, toDate, days, reason: dto.reason },
      include: { employee: employeeSummary },
    });
    return { ...leave, decidedBy: null };
  }

  async decideLeave(schoolId: string, id: string, userId: string, dto: DecideLeaveDto) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, schoolId },
      include: { employee: { select: { ...employeeSummary.select, userId: true } } },
    });
    if (!leave) throw new NotFoundException('Không tìm thấy đơn nghỉ phép');
    if (leave.status !== LeaveStatus.PENDING) throw new BadRequestException('Đơn đã được xử lý');
    // Conditional on PENDING so two reviewers cannot both decide it.
    const res = await this.prisma.leaveRequest.updateMany({
      where: { id, status: LeaveStatus.PENDING },
      data: { status: dto.status, decidedById: userId, decidedAt: new Date(), decisionNote: dto.note },
    });
    if (!res.count) throw new BadRequestException('Đơn đã được xử lý');

    if (leave.employee.userId) {
      const approved = dto.status === LeaveStatus.APPROVED;
      await this.notifications.notifyUsers(schoolId, [leave.employee.userId], {
        kind: NotificationKind.LEAVE_DECIDED,
        title: approved ? 'Đơn nghỉ phép đã được duyệt' : 'Đơn nghỉ phép bị từ chối',
        body:
          `${LEAVE_TYPE_VN[leave.type]} từ ${vnDate(leave.fromDate)} đến ${vnDate(leave.toDate)} (${leave.days} ngày) ` +
          `${approved ? 'đã được duyệt' : 'không được duyệt'}${dto.note ? `. ${dto.note}` : '.'}`,
        data: { leaveRequestId: id, status: dto.status },
      });
    }
    const [updated] = await this.withDeciders([await this.prisma.leaveRequest.findUniqueOrThrow({ where: { id }, include: { employee: employeeSummary } })]);
    return updated;
  }

  // ---- Self-service ----

  async me(schoolId: string, userId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { schoolId, userId }, include: detailInclude });
    if (!employee) throw new NotFoundException('Chưa có hồ sơ nhân sự');
    return this.withExpiry(employee, await this.today(schoolId));
  }

  async myLeave(schoolId: string, userId: string, query: LeaveQuery) {
    const employee = await this.myEmployee(schoolId, userId);
    return this.listLeave(schoolId, { ...query, employeeId: employee.id });
  }

  async createMyLeave(schoolId: string, userId: string, dto: LeaveRequestDto) {
    const employee = await this.myEmployee(schoolId, userId);
    return this.createLeave(schoolId, employee.id, dto);
  }

  // ---- Summary ----

  async summary(schoolId: string) {
    const [byStatus, byDepartment, pendingLeave, expiring] = await Promise.all([
      this.prisma.employee.groupBy({ by: ['status'], where: { schoolId }, _count: { _all: true } }),
      this.prisma.employee.groupBy({ by: ['department'], where: { schoolId, status: { in: CURRENT } }, _count: { _all: true } }),
      this.prisma.leaveRequest.count({ where: { schoolId, status: LeaveStatus.PENDING } }),
      this.expiring(schoolId, { days: 30 }),
    ]);
    const statusCounts = Object.fromEntries(Object.values(EmployeeStatus).map((s) => [s, 0])) as Record<EmployeeStatus, number>;
    for (const row of byStatus) statusCounts[row.status] = row._count._all;
    return {
      headcount: CURRENT.reduce((sum, s) => sum + statusCounts[s], 0),
      byStatus: statusCounts,
      byDepartment: byDepartment
        .map((row) => ({ department: row.department ?? 'Chưa phân bộ phận', count: row._count._all }))
        .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department, 'vi')),
      pendingLeave,
      expiring: { documents: expiring.documents.length, contracts: expiring.contracts.length, total: expiring.documents.length + expiring.contracts.length },
    };
  }

  // ---- Helpers ----

  private async findEmployee(schoolId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, schoolId } });
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên');
    return employee;
  }

  private async myEmployee(schoolId: string, userId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { schoolId, userId } });
    if (!employee) throw new NotFoundException('Chưa có hồ sơ nhân sự');
    return employee;
  }

  /** A teacher of this school that no employee record is linked to yet. */
  private async linkableTeacher(schoolId: string, teacherId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, schoolId },
      select: { id: true, userId: true, employee: { select: { id: true } }, user: { select: { employee: { select: { id: true } } } } },
    });
    if (!teacher) throw new BadRequestException('Giáo viên không hợp lệ');
    if (teacher.employee) throw new BadRequestException('Giáo viên đã có hồ sơ nhân sự');
    if (teacher.user?.employee) throw new BadRequestException('Tài khoản của giáo viên đã gắn với nhân viên khác');
    return teacher;
  }

  /** Maps DTO strings onto column types; generic so a create keeps its required fields. */
  private employeeData<T extends Omit<UpdateEmployeeDto, 'teacherId' | 'code'>>(dto: T) {
    return {
      ...dto,
      phone: dto.phone === undefined ? undefined : dto.phone === null ? null : (normalizePhone(dto.phone) ?? dto.phone),
      dateOfBirth: day(dto.dateOfBirth),
      hireDate: day(dto.hireDate),
    };
  }

  private checkContractDates(startDate: string | Date, endDate?: Date | null) {
    if (endDate && endDate < toDay(startDate)) throw new BadRequestException('Ngày kết thúc hợp đồng phải sau ngày bắt đầu');
  }

  /** Next free NV### code (three digits, growing when the school passes 999 employees). */
  private async nextCode(schoolId: string) {
    const rows = await this.prisma.employee.findMany({ where: { schoolId, code: { startsWith: 'NV' } }, select: { code: true } });
    const max = rows.reduce((m, r) => (/^NV\d+$/.test(r.code) ? Math.max(m, Number(r.code.slice(2))) : m), 0);
    return `NV${String(max + 1).padStart(3, '0')}`;
  }

  /** Attaches the deciding user's name (LeaveRequest only stores the id). */
  private async withDeciders<T extends { decidedById: string | null }>(rows: T[]) {
    const ids = [...new Set(rows.map((r) => r.decidedById).filter((id): id is string => !!id))];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({ ...r, decidedBy: r.decidedById ? { id: r.decidedById, fullName: names.get(r.decidedById) ?? null } : null }));
  }

  private withExpiry(employee: EmployeeDetail, today: Date) {
    return {
      ...employee,
      documents: employee.documents.map((d) => ({ ...d, daysLeft: d.expiresAt ? daysUntil(d.expiresAt, today) : null })),
      contracts: employee.contracts.map((c) => ({ ...c, daysLeft: c.endDate ? daysUntil(c.endDate, today) : null })),
    };
  }

  /** UTC midnight of today's date in the school's timezone, comparable with @db.Date values. */
  private async today(schoolId: string) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    return new Date(localDate(new Date(), school.timezone));
  }
}
