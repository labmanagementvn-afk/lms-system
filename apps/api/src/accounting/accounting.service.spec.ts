import { SyncStatus } from '@prisma/client';
import { AccountingAdapter } from './accounting-adapter';
import { AccountingService, backoffMinutes, MAX_ATTEMPTS } from './accounting.service';
import { MockMisaAdapter } from './mock-misa.adapter';
import { receiptVoidVoucher, receiptVoucher, stockVoucher } from './misa-payloads';

// Minimal in-memory stand-in for the prisma calls processDue makes.
function fakePrisma(jobs: any[]) {
  return {
    accountingSyncJob: {
      findMany: async () => jobs.filter((j) => j.status === SyncStatus.PENDING && j.nextAttemptAt <= new Date()).map((j) => ({ ...j })),
      updateMany: async ({ where, data }: any) => {
        const j = jobs.find((x) => x.id === where.id && x.status === where.status && x.attempts === where.attempts);
        if (!j) return { count: 0 };
        j.attempts += data.attempts.increment;
        return { count: 1 };
      },
      update: async ({ where, data }: any) => Object.assign(jobs.find((x) => x.id === where.id), data),
    },
  } as any;
}

const receipt = {
  receiptNo: 'PT2026-000001',
  paidAt: new Date('2026-10-05T03:00:00Z'),
  method: 'CASH' as const,
  amount: 1_500_000,
  student: { code: 'HS1', fullName: 'Trần Minh Anh' },
  invoice: { paymentRef: 'HPABCDEFGH', title: 'Học phí tháng 10' },
};

describe('accounting outbox', () => {
  it('backs off exponentially', () => {
    expect([1, 2, 3, 4].map(backoffMinutes)).toEqual([1, 2, 4, 8]);
  });

  it('marks pushed jobs as synced and retries failures until giving up', async () => {
    const ok = { id: 'a', schoolId: 's', kind: 'RECEIPT', entityId: 'p1', payload: receiptVoucher(receipt), status: SyncStatus.PENDING, attempts: 0, nextAttemptAt: new Date(0) };
    const bad = { id: 'b', schoolId: 's', kind: 'RECEIPT', entityId: 'p2', payload: { ...receiptVoucher(receipt), description: '[mock-fail]' }, status: SyncStatus.PENDING, attempts: MAX_ATTEMPTS - 2, nextAttemptAt: new Date(0) };
    const jobs = [ok, bad];
    const service = new AccountingService(fakePrisma(jobs), new MockMisaAdapter());

    expect(await service.processDue()).toEqual({ processed: 2, succeeded: 1, failed: 1 });
    expect(ok).toMatchObject({ status: SyncStatus.SUCCESS, externalRef: 'MISA-RECEIPT-PT2026-000001' });
    expect(bad).toMatchObject({ status: SyncStatus.PENDING, attempts: MAX_ATTEMPTS - 1 });
    expect(bad.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    bad.nextAttemptAt = new Date(0);
    await service.processDue();
    expect(bad).toMatchObject({ status: SyncStatus.FAILED, attempts: MAX_ATTEMPTS, lastError: 'MISA sandbox: simulated failure' });
  });

  it('does not push a job another worker already claimed', async () => {
    const pushes: string[] = [];
    const adapter: AccountingAdapter = { name: 't', push: async (d) => (pushes.push(d.entityId), { externalRef: 'x' }) };
    const job = { id: 'a', schoolId: 's', kind: 'RECEIPT', entityId: 'p1', payload: {}, status: SyncStatus.PENDING, attempts: 0, nextAttemptAt: new Date(0) };
    const prisma = fakePrisma([job]);
    const findMany = prisma.accountingSyncJob.findMany;
    prisma.accountingSyncJob.findMany = async () => {
      const rows = await findMany();
      job.attempts = 1; // claimed elsewhere between read and claim
      return rows;
    };
    await new AccountingService(prisma, adapter).processDue();
    expect(pushes).toEqual([]);
  });
});

describe('MISA vouchers', () => {
  it('books cash receipts against the student receivable', () => {
    const v = receiptVoucher(receipt);
    expect(v).toMatchObject({ voucherType: 'CASH_RECEIPT', accountObjectCode: 'HS1', totalAmount: 1_500_000 });
    expect(v.details).toEqual([{ debitAccount: '1111', creditAccount: '131', amount: 1_500_000, accountObjectCode: 'HS1' }]);
    expect(receiptVoucher({ ...receipt, method: 'QR' }).details[0].debitAccount).toBe('1121');
  });

  it('reverses a voided receipt', () => {
    const v = receiptVoidVoucher(receipt, 'Thu nhầm');
    expect(v).toMatchObject({ voucherNo: 'PT2026-000001-H', reversesVoucherNo: 'PT2026-000001', totalAmount: -1_500_000 });
  });

  it('builds stock vouchers with item codes', () => {
    const v = stockVoucher({
      kind: 'OUT',
      voucherNo: 'DH1',
      date: new Date(),
      description: 'Xuất đồng phục',
      lines: [{ sku: 'AO-S', name: 'Áo size S', unit: 'cái', quantity: 2, unitPrice: 120_000, accountingCode: 'VT-AO-S' }],
    });
    expect(v.totalAmount).toBe(240_000);
    expect(v.details[0]).toMatchObject({ inventoryItemCode: 'VT-AO-S', debitAccount: '632', creditAccount: '1561' });
  });
});
