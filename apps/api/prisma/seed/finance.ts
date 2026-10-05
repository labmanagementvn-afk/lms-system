// Demo billing: one published tuition campaign for October with an invoice per
// student, so the finance pages and the parent app's fee tab have data to show.
import { CampaignStatus, InvoiceSource, InvoiceStatus, PaymentMethod, PrismaClient } from '@prisma/client';
import { generatePaymentRef } from '../../src/finance/billing';
import { SeedContext } from './context';

export async function seedFinance(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId, academicYearId, studentIds, staffUserId } = ctx;
  const items = await prisma.feeItem.findMany({ where: { schoolId, code: { in: ['HOCPHI', 'BANTRU'] } }, orderBy: { code: 'asc' } });
  if (items.length === 0) return;

  const campaign = await prisma.billingCampaign.create({
    data: {
      schoolId,
      academicYearId,
      name: 'Học phí tháng 10/2026',
      dueDate: new Date('2026-10-15'),
      status: CampaignStatus.PUBLISHED,
      items: { create: items.map((i) => ({ feeItemId: i.id, amount: i.defaultAmount, quantity: 1 })) },
    },
  });

  const lines = items.map((i) => ({ feeItemId: i.id, description: i.name, quantity: 1, unitPrice: i.defaultAmount, discount: 0, amount: i.defaultAmount }));
  const total = lines.reduce((s, l) => s + l.amount, 0);
  // First student pays part in cash, the next two pay in full by transfer; everyone else is still unpaid.
  const paid = new Map<string, { amount: number; method: PaymentMethod }>([
    [studentIds[0], { amount: 1_000_000, method: PaymentMethod.CASH }],
    [studentIds[1], { amount: total, method: PaymentMethod.BANK_TRANSFER }],
    [studentIds[2], { amount: total, method: PaymentMethod.QR }],
  ]);

  let receipt = 1;
  for (const studentId of studentIds) {
    const payment = paid.get(studentId);
    const paidAmount = payment?.amount ?? 0;
    const invoice = await prisma.invoice.create({
      data: {
        schoolId,
        studentId,
        campaignId: campaign.id,
        source: InvoiceSource.CAMPAIGN,
        title: campaign.name,
        paymentRef: generatePaymentRef(),
        subtotal: total,
        discountTotal: 0,
        total,
        paidAmount,
        status: paidAmount >= total ? InvoiceStatus.PAID : paidAmount > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.UNPAID,
        dueDate: campaign.dueDate,
        issuedAt: new Date('2026-10-01T01:00:00Z'),
        lines: { create: lines },
      },
    });
    if (payment) {
      await prisma.payment.create({
        data: {
          schoolId,
          invoiceId: invoice.id,
          studentId,
          receiptNo: `PT2026-${String(receipt++).padStart(6, '0')}`,
          method: payment.method,
          amount: payment.amount,
          paidAt: new Date('2026-10-03T02:30:00Z'),
          collectedById: payment.method === PaymentMethod.CASH ? staffUserId : null,
        },
      });
    }
  }
  await prisma.financeSettings.update({ where: { schoolId }, data: { nextReceiptNo: receipt } });
}
