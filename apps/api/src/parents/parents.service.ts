import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma, Role, StudentStatus, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { summarizeDay } from '../attendance/daily-summary';
import { CanteenService } from '../canteen/canteen.service';
import { fromDbDate, monthRange } from '../canteen/canteen-rules';
import { AuthUser } from '../common/auth-user';
import { Page, pageArgs } from '../common/pagination';
import { generatePassword } from '../common/passwords';
import { normalizePhone } from '../common/phone';
import { localDate, zonedDayRange, zonedToUtc } from '../common/time';
import { InvoicesService } from '../finance/invoices.service';
import { PaymentsService } from '../finance/payments.service';
import { HealthService } from '../health/health.service';
import { PrismaService } from '../prisma/prisma.service';
import { ParentAccessService } from './parent-access.service';
import { BulkParentAccountsDto, ParentAccountQuery, ParentMealDto } from './parents.dto';

const OPEN: InvoiceStatus[] = [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL];

const guardianInclude = {
  guardians: {
    select: {
      id: true,
      relationship: true,
      isPrimary: true,
      student: {
        select: {
          id: true,
          code: true,
          fullName: true,
          enrollments: { orderBy: { enrolledAt: 'desc' }, take: 1, select: { class: { select: { id: true, name: true } } } },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

type AccountRow = Prisma.UserGetPayload<{ include: typeof guardianInclude }>;

const presentAccount = ({ passwordHash: _hash, guardians, ...u }: AccountRow) => ({
  ...u,
  children: guardians.map((g) => ({
    guardianId: g.id,
    relationship: g.relationship,
    isPrimary: g.isPrimary,
    id: g.student.id,
    code: g.student.code,
    fullName: g.student.fullName,
    class: g.student.enrollments[0]?.class ?? null,
  })),
});

export interface CreatedAccount {
  user: ReturnType<typeof presentAccount>;
  /** First-time password; only returned once, when the account was just created or reset. */
  password: string | null;
  /** True when an existing account with the same phone was linked instead of created. */
  linked: boolean;
}

/**
 * Parent accounts (phone + password) and the parent-facing views of a child's
 * day: gate attendance, fees, health record and meal registrations.
 */
@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ParentAccessService,
    private readonly invoiceService: InvoicesService,
    private readonly payments: PaymentsService,
    private readonly health: HealthService,
    private readonly canteen: CanteenService,
  ) {}

  // ---- Accounts (school staff) ----

  async listAccounts(schoolId: string, query: ParentAccountQuery): Promise<Page<unknown>> {
    const where: Prisma.UserWhereInput = {
      schoolId,
      role: Role.PARENT,
      guardians: query.classId ? { some: { student: { enrollments: { some: { classId: query.classId } } } } } : undefined,
      OR: query.q
        ? [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: normalizePhone(query.q) ?? query.q } },
            { guardians: { some: { student: { OR: [{ code: { contains: query.q, mode: 'insensitive' } }, { fullName: { contains: query.q, mode: 'insensitive' } }] } } } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, include: guardianInclude, orderBy: { fullName: 'asc' }, ...pageArgs(query) }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map(presentAccount), total, page: query.page, pageSize: query.pageSize };
  }

  /** Guardians of studying students who have no account yet, grouped by phone so siblings share one login. */
  async pending(schoolId: string, classId?: string) {
    const guardians = await this.prisma.guardian.findMany({
      where: {
        userId: null,
        student: { schoolId, status: StudentStatus.STUDYING, enrollments: classId ? { some: { classId } } : undefined },
      },
      include: { student: { select: { id: true, code: true, fullName: true } } },
      orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }],
    });
    const byPhone = new Map<string, { phone: string; fullName: string; guardianIds: string[]; students: { id: string; code: string; fullName: string }[] }>();
    const invalid: { guardianId: string; fullName: string; phone: string; student: string }[] = [];
    for (const g of guardians) {
      const phone = normalizePhone(g.phone);
      if (!phone) {
        invalid.push({ guardianId: g.id, fullName: g.fullName, phone: g.phone, student: g.student.code });
        continue;
      }
      const row = byPhone.get(phone) ?? { phone, fullName: g.fullName, guardianIds: [], students: [] };
      row.guardianIds.push(g.id);
      if (!row.students.some((s) => s.id === g.student.id)) row.students.push(g.student);
      byPhone.set(phone, row);
    }
    return { items: [...byPhone.values()], invalid };
  }

  async createAccount(schoolId: string, guardianId: string): Promise<CreatedAccount> {
    const g = await this.prisma.guardian.findFirst({ where: { id: guardianId, student: { schoolId } } });
    if (!g) throw new NotFoundException('Không tìm thấy phụ huynh');
    if (g.userId) throw new ConflictException('Phụ huynh này đã có tài khoản');
    const phone = normalizePhone(g.phone);
    if (!phone) throw new BadRequestException(`Số điện thoại "${g.phone}" không hợp lệ`);
    return this.createForPhone(schoolId, phone, g.fullName);
  }

  /** Creates accounts for every primary guardian without one; returns the passwords to hand out. */
  async bulkCreate(schoolId: string, dto: BulkParentAccountsDto) {
    const { items, invalid } = await this.pending(schoolId, dto.classId);
    const created: { fullName: string; phone: string; password: string | null; linked: boolean; students: string[] }[] = [];
    for (const row of items) {
      const res = await this.createForPhone(schoolId, row.phone, row.fullName);
      created.push({ fullName: row.fullName, phone: row.phone, password: res.password, linked: res.linked, students: row.students.map((s) => s.code) });
    }
    return { created, invalid };
  }

  /** One account per phone: links every guardian record of the school carrying that number. */
  private async createForPhone(schoolId: string, phone: string, fullName: string): Promise<CreatedAccount> {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing && (existing.schoolId !== schoolId || existing.role !== Role.PARENT)) {
      throw new ConflictException(`Số điện thoại ${phone} đã được dùng cho một tài khoản khác`);
    }
    const password = existing ? null : generatePassword();
    const user = await this.prisma.$transaction(async (tx) => {
      const u =
        existing ??
        (await tx.user.create({
          data: { schoolId, phone, fullName, role: Role.PARENT, passwordHash: await bcrypt.hash(password!, 10), mustChangePassword: true },
        }));
      const guardians = await tx.guardian.findMany({ where: { userId: null, student: { schoolId } }, select: { id: true, phone: true } });
      const ids = guardians.filter((g) => normalizePhone(g.phone) === phone).map((g) => g.id);
      if (ids.length) await tx.guardian.updateMany({ where: { id: { in: ids } }, data: { userId: u.id } });
      return tx.user.findUniqueOrThrow({ where: { id: u.id }, include: guardianInclude });
    });
    return { user: presentAccount(user), password, linked: !!existing };
  }

  async resetPassword(schoolId: string, userId: string) {
    const user = await this.findAccount(schoolId, userId);
    const password = generatePassword();
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
    return { password };
  }

  async setActive(schoolId: string, userId: string, isActive: boolean) {
    const user = await this.findAccount(schoolId, userId);
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { isActive }, include: guardianInclude });
    return presentAccount(updated);
  }

  private async findAccount(schoolId: string, userId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, schoolId, role: Role.PARENT } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản phụ huynh');
    return user;
  }

  // ---- Parent app ----

  /** The parent's children with today's gate status and homeroom attendance. */
  async children(user: AuthUser) {
    const kids = await this.access.childrenOf(user);
    if (!kids.length) return [];
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId } });
    const today = localDate(new Date(), school.timezone);
    const { start, end } = zonedDayRange(today, school.timezone);
    const ids = kids.map((k) => k.id);
    const [events, homeroom] = await Promise.all([
      this.prisma.gateEvent.findMany({
        where: { studentId: { in: ids }, occurredAt: { gte: start, lt: end } },
        select: { studentId: true, occurredAt: true, direction: true },
      }),
      this.prisma.homeroomAttendance.findMany({ where: { studentId: { in: ids }, date: new Date(`${today}T00:00:00Z`) } }),
    ]);
    return kids.map((k) => {
      const day = summarizeDay(
        events.filter((e) => e.studentId === k.id),
        school.lateAfter,
        school.timezone,
      );
      const hr = homeroom.find((h) => h.studentId === k.id);
      return {
        ...k,
        today: {
          date: today,
          status: day.eventCount ? day.status : null,
          firstIn: day.firstIn,
          lastOut: day.lastOut,
          homeroom: hr ? { status: hr.status, note: hr.note } : null,
        },
      };
    });
  }

  /** Day-by-day gate and homeroom attendance for one month. */
  async attendance(user: AuthUser, studentId: string, month?: string) {
    const child = await this.access.assertChild(user, studentId);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId } });
    const m = month ?? localDate(new Date(), school.timezone).slice(0, 7);
    const { from, to } = monthRange(m);
    const start = zonedToUtc(`${fromDbDate(from)} 00:00:00`, school.timezone);
    const end = zonedToUtc(`${fromDbDate(to)} 00:00:00`, school.timezone);
    const [events, homeroom] = await Promise.all([
      this.prisma.gateEvent.findMany({ where: { studentId, occurredAt: { gte: start, lt: end } }, select: { occurredAt: true, direction: true } }),
      this.prisma.homeroomAttendance.findMany({ where: { studentId, date: { gte: from, lt: to } }, orderBy: { date: 'asc' } }),
    ]);
    const byDay = new Map<string, typeof events>();
    for (const e of events) {
      const d = localDate(e.occurredAt, school.timezone);
      byDay.set(d, [...(byDay.get(d) ?? []), e]);
    }
    const dates = new Set([...byDay.keys(), ...homeroom.map((h) => fromDbDate(h.date))]);
    const days = [...dates].sort().map((date) => {
      const gate = byDay.get(date);
      const hr = homeroom.find((h) => fromDbDate(h.date) === date);
      const summary = gate ? summarizeDay(gate, school.lateAfter, school.timezone) : null;
      return {
        date,
        gate: summary ? { status: summary.status, firstIn: summary.firstIn, lastOut: summary.lastOut } : null,
        homeroom: hr ? { status: hr.status, note: hr.note } : null,
      };
    });
    const count = (pred: (d: (typeof days)[number]) => boolean) => days.filter(pred).length;
    return {
      student: child,
      month: m,
      days,
      summary: {
        schoolDays: days.length,
        present: count((d) => d.homeroom?.status === 'PRESENT' || (!d.homeroom && d.gate?.status === 'ON_TIME')),
        late: count((d) => d.homeroom?.status === 'LATE' || (!d.homeroom && d.gate?.status === 'LATE')),
        absent: count((d) => d.homeroom?.status === 'ABSENT'),
        excused: count((d) => d.homeroom?.status === 'EXCUSED'),
      },
    };
  }

  async invoices(user: AuthUser, studentId: string) {
    const student = await this.access.assertChild(user, studentId);
    const items = await this.prisma.invoice.findMany({
      where: { schoolId: user.schoolId, studentId, status: { not: InvoiceStatus.CANCELLED } },
      include: { campaign: { select: { id: true, name: true } } },
      orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
    });
    const outstanding = items.filter((i) => OPEN.includes(i.status)).reduce((s, i) => s + i.total - i.paidAmount, 0);
    return { student, items, outstanding };
  }

  /** Invoice detail with the VietQR to pay it, when it is still open and the school has a receiving account. */
  async invoice(user: AuthUser, id: string) {
    const invoice = await this.invoiceService.get(user.schoolId, id);
    await this.access.assertChild(user, invoice.studentId);
    let qr: Awaited<ReturnType<PaymentsService['paymentQr']>> | null = null;
    if (OPEN.includes(invoice.status)) {
      try {
        qr = await this.payments.paymentQr(user.schoolId, id);
      } catch (e) {
        if (!(e instanceof BadRequestException)) throw e;
      }
    }
    return { ...invoice, qr };
  }

  async healthRecord(user: AuthUser, studentId: string) {
    await this.access.assertChild(user, studentId);
    return this.health.record(user.schoolId, studentId);
  }

  /** Menus of the month and which meals the child is registered for. */
  async meals(user: AuthUser, studentId: string, month?: string) {
    const student = await this.access.assertChild(user, studentId);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { timezone: true } });
    const m = month ?? localDate(new Date(), school.timezone).slice(0, 7);
    const { from, to } = monthRange(m);
    const [menus, regs] = await Promise.all([
      this.prisma.mealMenu.findMany({ where: { schoolId: user.schoolId, date: { gte: from, lt: to } }, orderBy: [{ date: 'asc' }, { mealType: 'asc' }] }),
      this.prisma.mealRegistration.findMany({ where: { studentId, date: { gte: from, lt: to }, cancelledAt: null }, select: { date: true, mealType: true } }),
    ]);
    return {
      student,
      month: m,
      timezone: school.timezone,
      menus: menus.map((x) => ({ ...x, date: fromDbDate(x.date) })),
      registrations: regs.map((r) => ({ date: fromDbDate(r.date), mealType: r.mealType })),
    };
  }

  async registerMeals(user: AuthUser, studentId: string, dto: ParentMealDto) {
    await this.access.assertChild(user, studentId);
    return this.canteen.register(user, { mealType: dto.mealType, dates: dto.dates, action: dto.action, studentIds: [studentId] });
  }
}
