import { extractPaymentRef, generatePaymentRef, invoiceStatus, priceLines, totals } from './billing';

describe('billing rules', () => {
  it('generates references that can be found again in messy transfer notes', () => {
    const ref = generatePaymentRef();
    expect(ref).toMatch(/^HP[A-Z2-9]{8}$/);
    expect(extractPaymentRef(`MBVCB.123 ${ref.slice(0, 4)} ${ref.slice(4).toLowerCase()} chuyen tien hoc phi`)).toBe(ref);
    expect(extractPaymentRef('chuyen tien hoc phi')).toBeNull();
  });

  it('derives invoice status from the amount paid', () => {
    expect(invoiceStatus(100, 0)).toBe('UNPAID');
    expect(invoiceStatus(100, 40)).toBe('PARTIAL');
    expect(invoiceStatus(100, 100)).toBe('PAID');
    expect(invoiceStatus(100, 120)).toBe('PAID');
    expect(invoiceStatus(0, 0)).toBe('PAID');
  });

  it('applies item and blanket discounts within their validity window', () => {
    const on = new Date('2026-10-15');
    const lines = priceLines(
      [
        { feeItemId: 'tuition', description: 'Học phí', quantity: 1, unitPrice: 2_000_000 },
        { feeItemId: 'meal', description: 'Tiền ăn', quantity: 20, unitPrice: 30_000 },
        { description: 'Nợ kỳ trước', quantity: 1, unitPrice: 150_000 },
      ],
      [
        { feeItemId: 'tuition', kind: 'PERCENT', value: 50 },
        { feeItemId: null, kind: 'AMOUNT', value: 100_000 },
        { feeItemId: 'meal', kind: 'AMOUNT', value: 999_999, validTo: new Date('2026-09-30') },
      ],
      on,
    );
    expect(lines.map((l) => [l.discount, l.amount])).toEqual([
      [1_100_000, 900_000],
      [100_000, 500_000],
      [0, 150_000],
    ]);
    expect(totals(lines)).toEqual({ subtotal: 2_750_000, discountTotal: 1_200_000, total: 1_550_000 });
  });

  it('never discounts a line below zero', () => {
    const [line] = priceLines([{ feeItemId: 'x', description: 'x', quantity: 1, unitPrice: 50_000 }], [{ feeItemId: 'x', kind: 'PERCENT', value: 150 }], new Date());
    expect(line.amount).toBe(0);
  });
});
