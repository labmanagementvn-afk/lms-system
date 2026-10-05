// Builds accounting vouchers in the shape the MISA AMIS adapter expects.
// Account numbers follow Circular 200/2014 & 133/2016 defaults; schools can
// override revenue/stock accounts per fee item or inventory item (accountingCode).

export const ACCOUNTS = {
  cash: '1111',
  bank: '1121',
  receivable: '131',
  inventory: '1561',
  costOfGoods: '632',
} as const;

export interface ReceiptInput {
  receiptNo: string;
  paidAt: Date;
  method: 'CASH' | 'BANK_TRANSFER' | 'QR';
  amount: number;
  note?: string | null;
  student: { code: string; fullName: string };
  invoice: { paymentRef: string; title: string };
}

/** Phiếu thu (cash) or giấy báo có (bank): Dr 111/112, Cr 131 against the student. */
export function receiptVoucher(r: ReceiptInput) {
  const debit = r.method === 'CASH' ? ACCOUNTS.cash : ACCOUNTS.bank;
  return {
    voucherType: r.method === 'CASH' ? 'CASH_RECEIPT' : 'BANK_RECEIPT',
    voucherNo: r.receiptNo,
    voucherDate: r.paidAt.toISOString(),
    accountObjectCode: r.student.code,
    accountObjectName: r.student.fullName,
    description: `Thu ${r.invoice.title} - ${r.student.fullName}${r.note ? ` (${r.note})` : ''}`,
    reference: r.invoice.paymentRef,
    currency: 'VND',
    totalAmount: r.amount,
    details: [{ debitAccount: debit, creditAccount: ACCOUNTS.receivable, amount: r.amount, accountObjectCode: r.student.code }],
  };
}

/** Reverses a receipt: same voucher with negated amount and a link to the original. */
export function receiptVoidVoucher(r: ReceiptInput, reason: string) {
  const v = receiptVoucher(r);
  return {
    ...v,
    voucherNo: `${r.receiptNo}-H`,
    reversesVoucherNo: r.receiptNo,
    description: `Hủy phiếu thu ${r.receiptNo}: ${reason}`,
    totalAmount: -r.amount,
    details: v.details.map((d) => ({ ...d, amount: -d.amount })),
  };
}

export interface StockLine {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  accountingCode?: string | null;
}

/** Phiếu nhập kho / phiếu xuất kho. */
export function stockVoucher(input: {
  kind: 'IN' | 'OUT';
  voucherNo: string;
  date: Date;
  description: string;
  accountObjectCode?: string;
  lines: StockLine[];
}) {
  return {
    voucherType: input.kind === 'IN' ? 'STOCK_IN' : 'STOCK_OUT',
    voucherNo: input.voucherNo,
    voucherDate: input.date.toISOString(),
    accountObjectCode: input.accountObjectCode,
    description: input.description,
    currency: 'VND',
    totalAmount: input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    details: input.lines.map((l) => ({
      inventoryItemCode: l.accountingCode || l.sku,
      inventoryItemName: l.name,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.quantity * l.unitPrice,
      debitAccount: input.kind === 'IN' ? ACCOUNTS.inventory : ACCOUNTS.costOfGoods,
      creditAccount: input.kind === 'IN' ? ACCOUNTS.cash : ACCOUNTS.inventory,
    })),
  };
}
