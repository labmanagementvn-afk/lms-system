import { SyncKind } from '@prisma/client';

export const ACCOUNTING_ADAPTER = Symbol('ACCOUNTING_ADAPTER');

export interface AccountingDocument {
  schoolId: string;
  kind: SyncKind;
  entityId: string;
  payload: Record<string, unknown>;
}

/**
 * Pushes a business document (receipt, stock movement) to the accounting system.
 * Implementations must be idempotent on (kind, entityId): the outbox may retry a
 * document after a timeout even if the first attempt reached the other side.
 */
export interface AccountingAdapter {
  readonly name: string;
  push(doc: AccountingDocument): Promise<{ externalRef: string }>;
}
