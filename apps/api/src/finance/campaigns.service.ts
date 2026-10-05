import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { CampaignStatus, InvoiceSource, InvoiceStatus, Prisma, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { PrismaService } from '../prisma/prisma.service';
import { generatePaymentRef, invoiceStatus, LineInput, priceLines, totals } from './billing';
import { CampaignDto, UpdateCampaignDto } from './finance.dto';

const include = {
  academicYear: { select: { id: true, name: true } },
  items: { include: { feeItem: { select: { id: true, code: true, name: true, unit: true } } } },
} satisfies Prisma.BillingCampaignInclude;

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  async list(schoolId: string) {
    const campaigns = await this.prisma.billingCampaign.findMany({ where: { schoolId }, include, orderBy: { createdAt: 'desc' } });
    const stats = await this.prisma.invoice.groupBy({
      by: ['campaignId'],
      where: { schoolId, campaignId: { in: campaigns.map((c) => c.id) }, status: { not: InvoiceStatus.CANCELLED } },
      _count: true,
      _sum: { total: true, paidAmount: true },
    });
    return campaigns.map((c) => {
      const s = stats.find((x) => x.campaignId === c.id);
      return { ...c, invoiceCount: s?._count ?? 0, billed: s?._sum.total ?? 0, collected: s?._sum.paidAmount ?? 0 };
    });
  }

  get(schoolId: string, id: string) {
    return this.prisma.billingCampaign.findFirstOrThrow({ where: { id, schoolId }, include });
  }

  private async itemsData(schoolId: string, items: CampaignDto['items']) {
    const ids = [...new Set(items.map((i) => i.feeItemId))];
    if (ids.length !== items.length) throw new BadRequestException('Khoản thu bị lặp');
    const feeItems = await this.prisma.feeItem.findMany({ where: { schoolId, id: { in: ids } } });
    if (feeItems.length !== ids.length) throw new BadRequestException('Khoản thu không hợp lệ');
    return items.map((i) => ({
      feeItemId: i.feeItemId,
      amount: i.amount ?? feeItems.find((f) => f.id === i.feeItemId)!.defaultAmount,
      quantity: i.quantity ?? 1,
    }));
  }

  private async assertClasses(schoolId: string, academicYearId: string, classIds?: string[]) {
    if (!classIds?.length) return;
    const n = await this.prisma.class.count({ where: { schoolId, academicYearId, id: { in: classIds } } });
    if (n !== new Set(classIds).size) throw new BadRequestException('Lớp không thuộc năm học của đợt thu');
  }

  async create(schoolId: string, dto: CampaignDto) {
    const academicYearId = dto.academicYearId ?? (await this.years.current(schoolId)).id;
    await this.prisma.academicYear.findFirstOrThrow({ where: { id: academicYearId, schoolId } });
    await this.assertClasses(schoolId, academicYearId, dto.classIds);
    const items = await this.itemsData(schoolId, dto.items);
    return this.prisma.billingCampaign.create({
      data: {
        schoolId,
        academicYearId,
        name: dto.name,
        dueDate: new Date(dto.dueDate),
        gradeLevels: dto.gradeLevels ?? [],
        classIds: dto.classIds ?? [],
        carryOverDebt: dto.carryOverDebt ?? true,
        items: { create: items },
      },
      include,
    });
  }

  async update(schoolId: string, id: string, dto: UpdateCampaignDto) {
    const existing = await this.prisma.billingCampaign.findFirstOrThrow({ where: { id, schoolId } });
    if (existing.status !== CampaignStatus.DRAFT) throw new BadRequestException('Chỉ sửa được đợt thu ở trạng thái nháp');
    if (dto.academicYearId && dto.academicYearId !== existing.academicYearId) throw new BadRequestException('Không thể đổi năm học');
    await this.assertClasses(schoolId, existing.academicYearId, dto.classIds);
    const items = dto.items ? await this.itemsData(schoolId, dto.items) : undefined;
    return this.prisma.$transaction(async (tx) => {
      if (items) await tx.campaignItem.deleteMany({ where: { campaignId: id } });
      return tx.billingCampaign.update({
        where: { id },
        data: {
          name: dto.name,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          gradeLevels: dto.gradeLevels,
          classIds: dto.classIds,
          carryOverDebt: dto.carryOverDebt,
          items: items ? { create: items } : undefined,
        },
        include,
      });
    });
  }

  async remove(schoolId: string, id: string) {
    const c = await this.prisma.billingCampaign.findFirstOrThrow({ where: { id, schoolId } });
    if (c.status !== CampaignStatus.DRAFT) throw new ConflictException('Đợt thu đã phát hành; hãy đóng đợt thu thay vì xóa');
    await this.prisma.billingCampaign.delete({ where: { id } });
  }

  /** Students the campaign bills: studying, enrolled in the campaign's year, matching its grade/class filter. */
  private targets(schoolId: string, c: { academicYearId: string; gradeLevels: number[]; classIds: string[] }) {
    return this.prisma.student.findMany({
      where: {
        schoolId,
        status: StudentStatus.STUDYING,
        enrollments: {
          some: {
            academicYearId: c.academicYearId,
            classId: c.classIds.length ? { in: c.classIds } : undefined,
            class: c.gradeLevels.length ? { gradeLevel: { in: c.gradeLevels } } : undefined,
          },
        },
      },
      select: { id: true, code: true, fullName: true },
      orderBy: { code: 'asc' },
    });
  }

  async preview(schoolId: string, id: string) {
    const c = await this.get(schoolId, id);
    const students = await this.targets(schoolId, c);
    const invoiced = await this.prisma.invoice.count({ where: { campaignId: id } });
    const perStudent = c.items.reduce((s, i) => s + i.amount * i.quantity, 0);
    return { students: students.length, alreadyInvoiced: invoiced, perStudentBeforeDiscount: perStudent };
  }

  /**
   * Issues one invoice per target student, applying their discounts and (optionally)
   * moving unpaid balances of earlier invoices onto the new one. Re-running only
   * bills students added since the last run.
   */
  async generate(schoolId: string, id: string) {
    const c = await this.get(schoolId, id);
    if (c.status === CampaignStatus.CLOSED) throw new BadRequestException('Đợt thu đã đóng');
    const students = await this.targets(schoolId, c);
    const done = new Set((await this.prisma.invoice.findMany({ where: { campaignId: id }, select: { studentId: true } })).map((i) => i.studentId));
    const todo = students.filter((s) => !done.has(s.id));
    const discounts = await this.prisma.studentDiscount.findMany({ where: { schoolId, studentId: { in: todo.map((s) => s.id) } } });

    let created = 0;
    for (const student of todo) {
      const lines: LineInput[] = c.items.map((i) => ({ feeItemId: i.feeItemId, description: i.feeItem.name, quantity: i.quantity, unitPrice: i.amount }));
      await this.prisma.$transaction(async (tx) => {
        const priced = priceLines(lines, discounts.filter((d) => d.studentId === student.id), c.dueDate);
        const prior = c.carryOverDebt
          ? await tx.invoice.findMany({
              where: { schoolId, studentId: student.id, source: InvoiceSource.CAMPAIGN, status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] } },
              orderBy: { issuedAt: 'asc' },
            })
          : [];
        for (const p of prior) {
          const due = p.total - p.paidAmount;
          priced.push({ description: `Nợ kỳ trước: ${p.title}`, quantity: 1, unitPrice: due, discount: 0, amount: due });
        }
        const t = totals(priced);
        const invoice = await tx.invoice.create({
          data: {
            schoolId,
            studentId: student.id,
            campaignId: c.id,
            source: InvoiceSource.CAMPAIGN,
            title: c.name,
            paymentRef: generatePaymentRef(),
            ...t,
            status: invoiceStatus(t.total, 0),
            dueDate: c.dueDate,
            lines: { create: priced.map(({ feeItemId, description, quantity, unitPrice, discount, amount }) => ({ feeItemId, description, quantity, unitPrice, discount, amount })) },
          },
        });
        if (prior.length) {
          await tx.invoice.updateMany({
            where: { id: { in: prior.map((p) => p.id) } },
            data: { status: InvoiceStatus.CARRIED_OVER, carriedToInvoiceId: invoice.id },
          });
        }
      });
      created++;
    }
    if (c.status === CampaignStatus.DRAFT) {
      await this.prisma.billingCampaign.update({ where: { id }, data: { status: CampaignStatus.PUBLISHED } });
    }
    return { created, skipped: students.length - todo.length };
  }

  async close(schoolId: string, id: string) {
    const c = await this.prisma.billingCampaign.findFirstOrThrow({ where: { id, schoolId } });
    if (c.status !== CampaignStatus.PUBLISHED) throw new BadRequestException('Chỉ đóng được đợt thu đã phát hành');
    return this.prisma.billingCampaign.update({ where: { id }, data: { status: CampaignStatus.CLOSED }, include });
  }
}
