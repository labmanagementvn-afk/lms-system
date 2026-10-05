import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceSource, InvoiceStatus, Prisma } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { Page, pageArgs } from '../common/pagination';
import { AlertsService } from '../notifications/alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { generatePaymentRef, invoiceStatus, priceLines, totals } from './billing';
import { InvoiceQuery, ManualInvoiceDto } from './finance.dto';

const studentSelect = {
  id: true,
  code: true,
  fullName: true,
  enrollments: { select: { class: { select: { id: true, name: true } } }, orderBy: { enrolledAt: 'desc' }, take: 1 },
} satisfies Prisma.StudentSelect;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
    private readonly alerts: AlertsService,
  ) {}

  private where(schoolId: string, query: InvoiceQuery): Prisma.InvoiceWhereInput {
    const status = query.status === undefined ? undefined : Array.isArray(query.status) ? query.status : [query.status];
    return {
      schoolId,
      status: status ? { in: status } : undefined,
      source: query.source,
      campaignId: query.campaignId,
      studentId: query.studentId,
      student: {
        enrollments: query.classId ? { some: { classId: query.classId } } : undefined,
        OR: query.q
          ? [{ fullName: { contains: query.q, mode: 'insensitive' } }, { code: { contains: query.q, mode: 'insensitive' } }]
          : undefined,
      },
    };
  }

  async list(schoolId: string, query: InvoiceQuery): Promise<Page<unknown>> {
    const where = this.where(schoolId, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, include: { student: { select: studentSelect } }, orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }], ...pageArgs(query) }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(schoolId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, schoolId },
      include: {
        student: { select: { ...studentSelect, guardians: { where: { isPrimary: true }, select: { fullName: true, phone: true } } } },
        campaign: { select: { id: true, name: true } },
        lines: { orderBy: { id: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
        carriedTo: { select: { id: true, title: true, paymentRef: true } },
        carriedFrom: { select: { id: true, title: true, paymentRef: true, total: true, paidAmount: true } },
        storeOrder: { select: { id: true, code: true, status: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
    return invoice;
  }

  async createManual(schoolId: string, dto: ManualInvoiceDto) {
    const student = await this.prisma.student.findFirst({ where: { id: dto.studentId, schoolId } });
    if (!student) throw new BadRequestException('Học sinh không hợp lệ');
    const feeIds = dto.lines.map((l) => l.feeItemId).filter((x): x is string => !!x);
    if (feeIds.length && (await this.prisma.feeItem.count({ where: { schoolId, id: { in: feeIds } } })) !== new Set(feeIds).size) {
      throw new BadRequestException('Khoản thu không hợp lệ');
    }
    const discounts = await this.prisma.studentDiscount.findMany({ where: { schoolId, studentId: student.id } });
    const priced = priceLines(
      dto.lines.map((l) => ({ feeItemId: l.feeItemId, description: l.description, quantity: l.quantity ?? 1, unitPrice: l.unitPrice })),
      discounts,
      dto.dueDate ? new Date(dto.dueDate) : new Date(),
    );
    const t = totals(priced);
    const invoice = await this.prisma.invoice.create({
      data: {
        schoolId,
        studentId: student.id,
        source: InvoiceSource.MANUAL,
        title: dto.title,
        paymentRef: generatePaymentRef(),
        ...t,
        status: invoiceStatus(t.total, 0),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        lines: { create: priced },
      },
      include: { lines: true },
    });
    await this.alerts.invoiceIssued(schoolId, invoice.id);
    return invoice;
  }

  /** Cancels an invoice nothing has been paid on, and gives carried-over debts back to their original invoices. */
  async cancel(schoolId: string, id: string) {
    const invoice = await this.get(schoolId, id);
    if (invoice.storeOrder) throw new BadRequestException('Hóa đơn cấp phát được hủy qua phiếu cấp phát');
    if (invoice.status === InvoiceStatus.CANCELLED) return invoice;
    if (invoice.paidAmount > 0 || invoice.status === InvoiceStatus.CARRIED_OVER) {
      throw new BadRequestException('Hóa đơn đã thu tiền hoặc đã chuyển nợ; hãy hủy phiếu thu trước');
    }
    await this.prisma.$transaction(async (tx) => {
      for (const p of invoice.carriedFrom) {
        await tx.invoice.update({ where: { id: p.id }, data: { carriedToInvoiceId: null, status: invoiceStatus(p.total, p.paidAmount) } });
      }
      await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.CANCELLED } });
    });
    return this.get(schoolId, id);
  }

  /** Billed / collected / outstanding totals, overall and per class, for a campaign or the whole year. */
  async summary(schoolId: string, campaignId?: string) {
    const year = await this.years.current(schoolId);
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, campaignId, status: { not: InvoiceStatus.CANCELLED } },
      select: {
        status: true,
        total: true,
        paidAmount: true,
        student: { select: { enrollments: { where: { academicYearId: year.id }, select: { class: { select: { id: true, name: true } } } } } },
      },
    });
    const overall = { invoices: 0, billed: 0, collected: 0, outstanding: 0, byStatus: {} as Record<string, number> };
    const byClass = new Map<string, { classId: string | null; className: string; invoices: number; billed: number; collected: number; outstanding: number }>();
    for (const i of invoices) {
      const cls = i.student.enrollments[0]?.class;
      const key = cls?.id ?? '-';
      const row = byClass.get(key) ?? { classId: cls?.id ?? null, className: cls?.name ?? 'Chưa xếp lớp', invoices: 0, billed: 0, collected: 0, outstanding: 0 };
      // A carried-over invoice keeps only what was paid on it; its balance is billed again on the newer invoice.
      const billed = i.status === InvoiceStatus.CARRIED_OVER ? i.paidAmount : i.total;
      const outstanding = Math.max(0, billed - i.paidAmount);
      for (const r of [overall, row]) {
        r.invoices++;
        r.billed += billed;
        r.collected += i.paidAmount;
        r.outstanding += outstanding;
      }
      overall.byStatus[i.status] = (overall.byStatus[i.status] ?? 0) + 1;
      byClass.set(key, row);
    }
    return { ...overall, byClass: [...byClass.values()].sort((a, b) => a.className.localeCompare(b.className, 'vi')) };
  }
}
