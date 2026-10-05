// Pure billing rules shared by tuition campaigns, the store and payments.
import { DiscountKind, InvoiceStatus } from '@prisma/client';
import { randomInt } from 'crypto';

// No 0/O/1/I so references survive being typed into a banking app by hand.
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REF_PATTERN = /HP[A-HJ-NP-Z2-9]{8}/;

/** Transfer reference for an invoice, e.g. "HPK3XQ9Z7M". */
export function generatePaymentRef(): string {
  let s = 'HP';
  for (let i = 0; i < 8; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return s;
}

/** Finds a payment reference in a bank transfer description; banks often add spaces or dashes. */
export function extractPaymentRef(description: string): string | null {
  const compact = description.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return REF_PATTERN.exec(compact)?.[0] ?? null;
}

export function invoiceStatus(total: number, paid: number): InvoiceStatus {
  if (paid >= total) return InvoiceStatus.PAID;
  return paid > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.UNPAID;
}

export interface LineInput {
  feeItemId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface DiscountRule {
  feeItemId: string | null;
  kind: DiscountKind;
  value: number;
  validFrom?: Date | null;
  validTo?: Date | null;
}

export interface PricedLine extends LineInput {
  discount: number;
  amount: number;
}

/**
 * Applies a student's discounts to invoice lines. Percent discounts are taken off
 * the gross line, fixed amounts are added on top, and a line never goes below zero.
 * Discounts outside their validity window (checked against `on`) are ignored.
 */
export function priceLines(lines: LineInput[], discounts: DiscountRule[], on: Date): PricedLine[] {
  const active = discounts.filter((d) => (!d.validFrom || d.validFrom <= on) && (!d.validTo || d.validTo >= on));
  return lines.map((line) => {
    const gross = line.quantity * line.unitPrice;
    let discount = 0;
    if (line.feeItemId) {
      for (const d of active.filter((d) => d.feeItemId === null || d.feeItemId === line.feeItemId)) {
        discount += d.kind === DiscountKind.PERCENT ? Math.round((gross * Math.min(d.value, 100)) / 100) : d.value;
      }
    }
    discount = Math.min(discount, gross);
    return { ...line, discount, amount: gross - discount };
  });
}

export function totals(lines: PricedLine[]) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discount, 0);
  return { subtotal, discountTotal, total: subtotal - discountTotal };
}
