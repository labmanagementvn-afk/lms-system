// Pure rules for the store: order codes and order line handling.
import { randomInt } from 'crypto';

// Same alphabet as payment references: no 0/O/1/I.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Order code such as "DH7KQ2XM9P". */
export function generateOrderCode(): string {
  let s = 'DH';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** Merges lines that repeat the same item so each item appears once with the summed quantity. */
export function mergeLines(lines: { itemId: string; quantity: number }[]): { itemId: string; quantity: number }[] {
  const byItem = new Map<string, number>();
  for (const l of lines) byItem.set(l.itemId, (byItem.get(l.itemId) ?? 0) + l.quantity);
  return [...byItem].map(([itemId, quantity]) => ({ itemId, quantity }));
}

/** Validates a manual stock change; returns an error message or null. */
export function stockChangeError(type: 'IN' | 'ADJUST', quantity: number): string | null {
  if (!Number.isInteger(quantity) || quantity === 0) return 'Số lượng phải khác 0';
  if (type === 'IN' && quantity < 0) return 'Số lượng nhập kho phải lớn hơn 0';
  return null;
}
