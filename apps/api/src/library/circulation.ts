// Pure circulation rules, kept separate from Prisma so they can be unit tested.

export const DEFAULT_LOAN_DAYS = 14;
export const MAX_LOAN_DAYS = 60;
export const RENEW_DAYS = 14;
export const MAX_RENEWALS = 2;
export const STUDENT_LOAN_LIMIT = 3;

const DAY_MS = 86_400_000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/** Started days past the due date (0 when not overdue); a returned loan is measured at its return time. */
export function overdueDays(dueAt: Date, at: Date = new Date()): number {
  return Math.max(0, Math.ceil((at.getTime() - dueAt.getTime()) / DAY_MS));
}

/** Why a borrower may not take another book, or null. */
export function borrowBlockReason(b: { isStudent: boolean; activeLoans: number; hasOverdue: boolean }): string | null {
  if (b.hasOverdue) return 'Người mượn đang có sách quá hạn, cần trả trước khi mượn tiếp';
  if (b.isStudent && b.activeLoans >= STUDENT_LOAN_LIMIT) return `Học sinh chỉ được mượn tối đa ${STUDENT_LOAN_LIMIT} cuốn cùng lúc`;
  return null;
}

/**
 * Available copies are held for the earliest active reservations (one copy each).
 * `queue` is the reserving student ids, oldest first. Returns whether the borrower may take a copy
 * and the queue index of the reservation it fulfils, if any.
 */
export function holdCheck(queue: string[], availableCopies: number, studentId?: string): { allowed: boolean; fulfils: number } {
  const held = Math.min(queue.length, availableCopies);
  const pos = studentId ? queue.indexOf(studentId) : -1;
  if (pos >= 0 && pos < held) return { allowed: true, fulfils: pos };
  return { allowed: availableCopies > held, fulfils: -1 };
}

/** A reservation only makes sense when every available copy is already held for someone. */
export function canReserve(availableCopies: number, activeReservations: number): boolean {
  return availableCopies <= activeReservations;
}

/** Why a loan cannot be renewed, or null. */
export function renewBlockReason(loan: { dueAt: Date; renewCount: number; returnedAt: Date | null }, hasReservations: boolean, now = new Date()): string | null {
  if (loan.returnedAt) return 'Lượt mượn đã kết thúc';
  if (loan.renewCount >= MAX_RENEWALS) return `Chỉ được gia hạn tối đa ${MAX_RENEWALS} lần`;
  if (overdueDays(loan.dueAt, now) > 0) return 'Sách đã quá hạn, không thể gia hạn';
  if (hasReservations) return 'Sách đang có người đặt trước, không thể gia hạn';
  return null;
}
