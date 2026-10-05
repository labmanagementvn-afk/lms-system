import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BankTxnStatus, Invoice, InvoiceStatus, PaymentMethod, PaymentStatus, Prisma, SyncKind } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { receiptVoidVoucher, receiptVoucher } from '../accounting/misa-payloads';
import { AuthUser } from '../common/auth-user';
import { Page, pageArgs } from '../common/pagination';
import { localDate, zonedDayRange } from '../common/time';
import { AlertsService } from '../notifications/alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { extractPaymentRef, invoiceStatus } from './billing';
import { BankTxnQuery, CashPaymentDto, FinanceSettingsDto, PaymentQuery } from './finance.dto';
import { IncomingTransfer, PAYMENT_PROVIDERS, PaymentProvider } from './providers/payment-provider';
import { MockPaymentProvider } from './providers/mock.provider';
import { buildVietQr, toTransferText } from './vietqr';

type Tx = Prisma.TransactionClient;
const OPEN: InvoiceStatus[] = [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL];

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  paidAt?: Date;
  note?: string;
  collectedById?: string;
  /** Bank transfers may exceed the balance (the payer rounds up); cash may not. */
  allowOverpay?: boolean;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly alerts: AlertsService,
    @Inject(PAYMENT_PROVIDERS) private readonly providers: Map<string, PaymentProvider>,
  ) {}

  get defaultProvider(): PaymentProvider {
    return this.providers.get(process.env.PAYMENT_PROVIDER ?? 'mock') ?? [...this.providers.values()][0];
  }

  provider(name: string): PaymentProvider {
    const p = this.providers.get(name);
    if (!p) throw new NotFoundException('Unknown payment provider');
    return p;
  }

  /** Locks the invoice row so concurrent payments see each other's balance. */
  private async lockInvoice(tx: Tx, schoolId: string, invoiceId: string) {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, schoolId }, include: { student: true } });
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
    return invoice;
  }

  private async nextReceiptNo(tx: Tx, schoolId: string, timeZone: string) {
    const s = await tx.financeSettings.upsert({
      where: { schoolId },
      create: { schoolId, nextReceiptNo: 2 },
      update: { nextReceiptNo: { increment: 1 } },
    });
    const year = localDate(new Date(), timeZone).slice(0, 4);
    return `${s.receiptPrefix}${year}-${String(s.nextReceiptNo - 1).padStart(6, '0')}`;
  }

  /** Records a payment against an invoice, updates its balance and queues the receipt for accounting. */
  async record(tx: Tx, schoolId: string, input: RecordPaymentInput) {
    const invoice = await this.lockInvoice(tx, schoolId, input.invoiceId);
    if (!OPEN.includes(invoice.status)) {
      throw new BadRequestException(
        invoice.status === InvoiceStatus.CARRIED_OVER ? 'Hóa đơn đã chuyển nợ sang hóa đơn kỳ sau' : 'Hóa đơn không còn khoản phải thu',
      );
    }
    const remaining = invoice.total - invoice.paidAmount;
    if (!input.allowOverpay && input.amount > remaining) {
      throw new BadRequestException(`Số tiền vượt quá số còn phải thu (${remaining.toLocaleString('vi-VN')} ₫)`);
    }
    const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId } });
    const paidAmount = invoice.paidAmount + input.amount;
    await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount, status: invoiceStatus(invoice.total, paidAmount) } });
    const payment = await tx.payment.create({
      data: {
        schoolId,
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        receiptNo: await this.nextReceiptNo(tx, schoolId, school.timezone),
        method: input.method,
        amount: input.amount,
        paidAt: input.paidAt ?? new Date(),
        note: input.note,
        collectedById: input.collectedById,
      },
    });
    await this.accounting.enqueue(tx, schoolId, SyncKind.RECEIPT, payment.id, receiptVoucher({ ...payment, student: invoice.student, invoice }));
    return payment;
  }

  async recordCash(user: AuthUser, invoiceId: string, dto: CashPaymentDto) {
    const method = dto.method ?? PaymentMethod.CASH;
    if (method === PaymentMethod.QR) throw new BadRequestException('Thanh toán QR được ghi nhận tự động từ ngân hàng');
    const payment = await this.prisma.$transaction((tx) =>
      this.record(tx, user.schoolId, { invoiceId, amount: dto.amount, method, note: dto.note, collectedById: user.userId }),
    );
    await this.alerts.paymentReceived(user.schoolId, payment.id);
    return payment;
  }

  async void(user: AuthUser, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id, schoolId: user.schoolId }, include: { bankTransaction: true } });
      if (!payment) throw new NotFoundException('Không tìm thấy phiếu thu');
      if (payment.status === PaymentStatus.VOIDED) throw new BadRequestException('Phiếu thu đã bị hủy');
      const invoice = await this.lockInvoice(tx, user.schoolId, payment.invoiceId);
      if (invoice.status === InvoiceStatus.CARRIED_OVER) throw new BadRequestException('Hóa đơn đã chuyển nợ sang hóa đơn kỳ sau');
      const paidAmount = invoice.paidAmount - payment.amount;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount, status: invoice.status === InvoiceStatus.CANCELLED ? invoice.status : invoiceStatus(invoice.total, paidAmount) },
      });
      if (payment.bankTransaction) {
        await tx.bankTransaction.update({ where: { id: payment.bankTransaction.id }, data: { status: BankTxnStatus.UNMATCHED, paymentId: null } });
      }
      const voided = await tx.payment.update({
        where: { id },
        data: { status: PaymentStatus.VOIDED, voidedAt: new Date(), voidReason: reason },
      });
      await this.accounting.enqueue(
        tx,
        user.schoolId,
        SyncKind.RECEIPT_VOID,
        payment.id,
        receiptVoidVoucher({ ...payment, student: invoice.student, invoice }, reason),
      );
      return voided;
    });
  }

  async list(schoolId: string, query: PaymentQuery): Promise<Page<unknown>> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    const where: Prisma.PaymentWhereInput = {
      schoolId,
      method: query.method,
      paidAt: {
        gte: query.from ? zonedDayRange(query.from, school.timezone).start : undefined,
        lt: query.to ? zonedDayRange(query.to, school.timezone).end : undefined,
      },
      OR: query.q
        ? [
            { receiptNo: { contains: query.q, mode: 'insensitive' } },
            { student: { fullName: { contains: query.q, mode: 'insensitive' } } },
            { student: { code: { contains: query.q, mode: 'insensitive' } } },
          ]
        : undefined,
    };
    const [items, total, sum] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: { student: { select: { id: true, code: true, fullName: true } }, invoice: { select: { id: true, title: true, paymentRef: true } } },
        orderBy: { paidAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where: { ...where, status: PaymentStatus.CONFIRMED }, _sum: { amount: true } }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize, totalAmount: sum._sum.amount ?? 0 } as Page<unknown>;
  }

  // ---- QR and bank webhooks ----

  async paymentQr(schoolId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, schoolId }, include: { student: true } });
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
    if (!OPEN.includes(invoice.status)) throw new BadRequestException('Hóa đơn không còn khoản phải thu');
    const settings = await this.prisma.financeSettings.findUnique({ where: { schoolId } });
    if (!settings?.bankBin || !settings.bankAccountNo) throw new BadRequestException('Chưa cấu hình tài khoản nhận tiền của trường');
    const amount = invoice.total - invoice.paidAmount;
    const description = toTransferText(`${invoice.student.code} ${invoice.student.fullName}`, 20);
    const req = await this.defaultProvider.createPaymentRequest({
      bankBin: settings.bankBin,
      accountNo: settings.bankAccountNo,
      accountName: settings.bankAccountName,
      amount,
      paymentRef: invoice.paymentRef,
      description,
    });
    return {
      ...req,
      amount,
      paymentRef: invoice.paymentRef,
      transferNote: `${invoice.paymentRef} ${description}`,
      bankName: settings.bankName,
      bankAccountNo: settings.bankAccountNo,
      bankAccountName: settings.bankAccountName,
    };
  }

  /**
   * Stores transfers reported by a provider and settles the invoice whose payment
   * reference appears in the transfer note. Safe to replay: (provider, externalId) is unique.
   */
  async ingestTransfers(provider: string, transfers: IncomingTransfer[]) {
    const results: { externalId: string; status: 'matched' | 'unmatched' | 'duplicate' | 'unknown_account'; invoiceId?: string }[] = [];
    for (const t of transfers) {
      const settings = await this.prisma.financeSettings.findUnique({ where: { bankAccountNo: t.accountNo } });
      if (!settings) {
        results.push({ externalId: t.externalId, status: 'unknown_account' });
        continue;
      }
      const schoolId = settings.schoolId;
      try {
        const outcome = await this.prisma.$transaction(async (tx) => {
          const txn = await tx.bankTransaction.create({
            data: {
              schoolId,
              provider,
              externalId: t.externalId,
              amount: t.amount,
              description: t.description,
              occurredAt: Number.isNaN(t.occurredAt.getTime()) ? new Date() : t.occurredAt,
              status: BankTxnStatus.UNMATCHED,
              rawPayload: t.raw === undefined ? undefined : (t.raw as Prisma.InputJsonValue),
            },
          });
          const invoice = await this.findOpenInvoiceByRef(tx, schoolId, t.description);
          if (!invoice || t.amount <= 0) return { status: 'unmatched' as const };
          const payment = await this.record(tx, schoolId, {
            invoiceId: invoice.id,
            amount: t.amount,
            method: PaymentMethod.QR,
            paidAt: txn.occurredAt,
            note: `Chuyển khoản ${provider} #${t.externalId}`,
            allowOverpay: true,
          });
          await tx.bankTransaction.update({ where: { id: txn.id }, data: { status: BankTxnStatus.MATCHED, paymentId: payment.id } });
          return { status: 'matched' as const, invoiceId: invoice.id, paymentId: payment.id };
        });
        if (outcome.status === 'matched') await this.alerts.paymentReceived(schoolId, outcome.paymentId);
        results.push({ externalId: t.externalId, status: outcome.status, invoiceId: outcome.status === 'matched' ? outcome.invoiceId : undefined });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          results.push({ externalId: t.externalId, status: 'duplicate' });
        } else throw e;
      }
    }
    const count = (s: string) => results.filter((r) => r.status === s).length;
    return { matched: count('matched'), unmatched: count('unmatched'), duplicates: count('duplicate'), unknownAccount: count('unknown_account'), results };
  }

  /** Follows carry-over links so paying an old reference settles the invoice that now holds the debt. */
  private async findOpenInvoiceByRef(tx: Tx, schoolId: string, description: string): Promise<Invoice | null> {
    const ref = extractPaymentRef(description);
    if (!ref) return null;
    let invoice = await tx.invoice.findFirst({ where: { paymentRef: ref, schoolId } });
    for (let hops = 0; invoice?.carriedToInvoiceId && hops < 24; hops++) {
      invoice = await tx.invoice.findUnique({ where: { id: invoice.carriedToInvoiceId } });
    }
    return invoice && OPEN.includes(invoice.status) ? invoice : null;
  }

  async listBankTransactions(schoolId: string, query: BankTxnQuery): Promise<Page<unknown>> {
    const where: Prisma.BankTransactionWhereInput = {
      schoolId,
      status: query.status,
      description: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bankTransaction.findMany({
        where,
        omit: { rawPayload: true },
        include: { payment: { select: { id: true, receiptNo: true, invoice: { select: { id: true, title: true, student: { select: { code: true, fullName: true } } } } } } },
        orderBy: { occurredAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Accountant assigns an unmatched transfer to an invoice by hand. */
  async matchTransaction(user: AuthUser, id: string, invoiceId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const txn = await tx.bankTransaction.findFirst({ where: { id, schoolId: user.schoolId } });
      if (!txn) throw new NotFoundException('Không tìm thấy giao dịch');
      if (txn.status !== BankTxnStatus.UNMATCHED) throw new BadRequestException('Giao dịch đã được xử lý');
      const payment = await this.record(tx, user.schoolId, {
        invoiceId,
        amount: txn.amount,
        method: PaymentMethod.QR,
        paidAt: txn.occurredAt,
        note: `Đối soát thủ công giao dịch ${txn.provider} #${txn.externalId}`,
        collectedById: user.userId,
        allowOverpay: true,
      });
      return tx.bankTransaction.update({ where: { id }, data: { status: BankTxnStatus.MATCHED, paymentId: payment.id } });
    });
    await this.alerts.paymentReceived(user.schoolId, updated.paymentId!);
    return updated;
  }

  async ignoreTransaction(schoolId: string, id: string, note: string) {
    const txn = await this.prisma.bankTransaction.findFirstOrThrow({ where: { id, schoolId } });
    if (txn.status !== BankTxnStatus.UNMATCHED) throw new BadRequestException('Giao dịch đã được xử lý');
    return this.prisma.bankTransaction.update({ where: { id }, data: { status: BankTxnStatus.IGNORED, note } });
  }

  /** Sandbox only: simulates the bank notifying a transfer into the school's account. */
  async sandboxTransfer(schoolId: string, amount: number, description: string) {
    const mock = this.providers.get('mock');
    if (!(mock instanceof MockPaymentProvider)) throw new NotFoundException('Sandbox is disabled');
    const settings = await this.prisma.financeSettings.findUnique({ where: { schoolId } });
    if (!settings?.bankAccountNo) throw new BadRequestException('Chưa cấu hình tài khoản nhận tiền của trường');
    const body = {
      transactions: [{ id: `SBX${Date.now()}${Math.floor(Math.random() * 1000)}`, accountNo: settings.bankAccountNo, amount, description, occurredAt: new Date().toISOString() }],
    };
    return this.ingestTransfers(mock.name, mock.parseWebhook({ 'x-mock-signature': mock.sign(body) }, body));
  }

  // ---- Settings ----

  async settings(schoolId: string) {
    const s = await this.prisma.financeSettings.findUnique({ where: { schoolId } });
    return {
      bankBin: s?.bankBin ?? null,
      bankName: s?.bankName ?? null,
      bankAccountNo: s?.bankAccountNo ?? null,
      bankAccountName: s?.bankAccountName ?? null,
      receiptPrefix: s?.receiptPrefix ?? 'PT',
      paymentProvider: this.defaultProvider.name,
      sandbox: this.providers.has('mock'),
      sampleQr: s?.bankBin && s.bankAccountNo ? buildVietQr({ bankBin: s.bankBin, accountNo: s.bankAccountNo }) : null,
    };
  }

  async updateSettings(schoolId: string, dto: FinanceSettingsDto) {
    try {
      await this.prisma.financeSettings.upsert({ where: { schoolId }, create: { schoolId, ...dto }, update: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Số tài khoản đã được trường khác sử dụng');
      }
      throw e;
    }
    return this.settings(schoolId);
  }
}
