import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, SyncKind, SyncStatus } from '@prisma/client';
import { Page, pageArgs, PageQuery } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNTING_ADAPTER, AccountingAdapter } from './accounting-adapter';

export const MAX_ATTEMPTS = 5;

/** Minutes to wait before attempt n+1 (1, 2, 4, 8...). */
export const backoffMinutes = (attempts: number) => 2 ** Math.max(0, attempts - 1);

type Tx = Prisma.TransactionClient;

export interface SyncJobQuery extends PageQuery {
  status?: SyncStatus;
  kind?: SyncKind;
}

/**
 * Transactional outbox for the accounting system. Business code calls `enqueue`
 * inside its own transaction; a timer (and the "sync now" button) pushes due jobs
 * through the configured adapter with exponential backoff.
 */
@Injectable()
export class AccountingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountingService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACCOUNTING_ADAPTER) private readonly adapter: AccountingAdapter,
  ) {}

  onModuleInit() {
    const every = Number(process.env.ACCOUNTING_SYNC_INTERVAL_MS ?? 60_000);
    if (every > 0) {
      this.timer = setInterval(() => void this.processDue().catch((e) => this.logger.error(e)), every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Adds a document to the outbox. A second call for the same (kind, entityId) is ignored. */
  async enqueue(tx: Tx, schoolId: string, kind: SyncKind, entityId: string, payload: object) {
    await tx.accountingSyncJob.createMany({
      data: [{ schoolId, kind, entityId, payload: payload as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
  }

  /** Pushes due jobs. With schoolId, only that school's jobs (manual "sync now"). */
  async processDue(schoolId?: string, limit = 50) {
    // The timer skips a tick while the previous one is still running; manual runs are scoped and always go.
    if (!schoolId) {
      if (this.running) return { processed: 0, succeeded: 0, failed: 0 };
      this.running = true;
    }
    let succeeded = 0;
    let failed = 0;
    try {
      const jobs = await this.prisma.accountingSyncJob.findMany({
        where: { schoolId, status: SyncStatus.PENDING, nextAttemptAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      for (const job of jobs) {
        // Claim the job so a concurrent worker skips it.
        const claimed = await this.prisma.accountingSyncJob.updateMany({
          where: { id: job.id, status: SyncStatus.PENDING, attempts: job.attempts },
          data: { attempts: { increment: 1 } },
        });
        if (!claimed.count) continue;
        const attempts = job.attempts + 1;
        try {
          const { externalRef } = await this.adapter.push({
            schoolId: job.schoolId,
            kind: job.kind,
            entityId: job.entityId,
            payload: job.payload as Record<string, unknown>,
          });
          await this.prisma.accountingSyncJob.update({
            where: { id: job.id },
            data: { status: SyncStatus.SUCCESS, externalRef, syncedAt: new Date(), lastError: null },
          });
          succeeded++;
        } catch (e) {
          const giveUp = attempts >= MAX_ATTEMPTS;
          await this.prisma.accountingSyncJob.update({
            where: { id: job.id },
            data: {
              status: giveUp ? SyncStatus.FAILED : SyncStatus.PENDING,
              lastError: (e as Error).message.slice(0, 1000),
              nextAttemptAt: new Date(Date.now() + backoffMinutes(attempts) * 60_000),
            },
          });
          failed++;
        }
      }
      return { processed: succeeded + failed, succeeded, failed };
    } finally {
      if (!schoolId) this.running = false;
    }
  }

  async list(schoolId: string, query: SyncJobQuery): Promise<Page<unknown>> {
    const where: Prisma.AccountingSyncJobWhereInput = { schoolId, status: query.status, kind: query.kind };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.accountingSyncJob.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.accountingSyncJob.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async summary(schoolId: string) {
    const rows = await this.prisma.accountingSyncJob.groupBy({ by: ['status'], where: { schoolId }, _count: true });
    const counts = { PENDING: 0, SUCCESS: 0, FAILED: 0 } as Record<SyncStatus, number>;
    for (const r of rows) counts[r.status] = r._count;
    return { provider: this.adapter.name, ...counts };
  }

  /** Puts a failed (or pending) job back in the queue immediately. */
  async retry(schoolId: string, id: string) {
    const job = await this.prisma.accountingSyncJob.findFirstOrThrow({ where: { id, schoolId } });
    if (job.status === SyncStatus.SUCCESS) return job;
    return this.prisma.accountingSyncJob.update({
      where: { id },
      data: { status: SyncStatus.PENDING, attempts: 0, nextAttemptAt: new Date() },
    });
  }
}
