import { AccountingAdapter, AccountingDocument } from './accounting-adapter';

/**
 * Sandbox stand-in for MISA AMIS. Validates the voucher shape the real adapter
 * would send and returns a deterministic voucher reference. Documents whose
 * description contains "[mock-fail]" are rejected, to exercise the retry path.
 */
export class MockMisaAdapter implements AccountingAdapter {
  readonly name = 'mock-misa';
  readonly received = new Map<string, AccountingDocument>();

  async push(doc: AccountingDocument): Promise<{ externalRef: string }> {
    const p = doc.payload as { voucherNo?: string; voucherDate?: string; description?: string; details?: unknown[] };
    if (!p.voucherNo || !p.voucherDate || !Array.isArray(p.details) || p.details.length === 0) {
      throw new Error('MISA: chứng từ thiếu số, ngày hoặc chi tiết');
    }
    if (p.description?.includes('[mock-fail]')) throw new Error('MISA sandbox: simulated failure');
    this.received.set(`${doc.kind}:${doc.entityId}`, doc);
    return { externalRef: `MISA-${doc.kind}-${p.voucherNo}` };
  }
}
