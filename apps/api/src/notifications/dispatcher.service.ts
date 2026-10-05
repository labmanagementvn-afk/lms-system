import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationChannel, Prisma, SyncStatus } from '@prisma/client';
import { backoffMinutes, MAX_ATTEMPTS } from '../accounting/accounting.service';
import { Page, pageArgs } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CHANNEL_ADAPTERS, ChannelAdapter } from './channels/channel-adapter';
import { DeliveryQuery } from './notifications.dto';

/** Outbox worker for push / Zalo / SMS / email deliveries, with the same backoff as the accounting sync. */
@Injectable()
export class DispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatcherService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: Map<NotificationChannel, ChannelAdapter>,
  ) {}

  onModuleInit() {
    const every = Number(process.env.NOTIFY_DISPATCH_INTERVAL_MS ?? 15_000);
    if (every > 0) {
      this.timer = setInterval(() => void this.processDue().catch((e) => this.logger.error(e)), every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  get providers() {
    return Object.fromEntries([...this.adapters].map(([channel, a]) => [channel, a.name]));
  }

  async processDue(schoolId?: string, limit = 200) {
    if (!schoolId) {
      if (this.running) return { processed: 0, sent: 0, failed: 0 };
      this.running = true;
    }
    let sent = 0;
    let failed = 0;
    try {
      const due = await this.prisma.notificationDelivery.findMany({
        where: { status: SyncStatus.PENDING, nextAttemptAt: { lte: new Date() }, notification: schoolId ? { schoolId } : undefined },
        include: { notification: { include: { user: { select: { phone: true, email: true, pushTokens: { select: { token: true } } } } } } },
        orderBy: { nextAttemptAt: 'asc' },
        take: limit,
      });
      for (const d of due) {
        const claimed = await this.prisma.notificationDelivery.updateMany({
          where: { id: d.id, status: SyncStatus.PENDING, attempts: d.attempts },
          data: { attempts: { increment: 1 } },
        });
        if (!claimed.count) continue;
        const attempts = d.attempts + 1;
        const adapter = this.adapters.get(d.channel);
        const to = this.destination(d.channel, d.notification.user);
        try {
          if (!adapter) throw new Error(`Kênh ${d.channel} chưa được cấu hình`);
          if (!to.length) {
            // No phone/email/device: nothing will ever change, so don't retry.
            await this.prisma.notificationDelivery.update({
              where: { id: d.id },
              data: { status: SyncStatus.FAILED, lastError: 'Người nhận chưa có thông tin liên hệ cho kênh này' },
            });
            failed++;
            continue;
          }
          const { externalRef } = await adapter.send({
            to,
            title: d.notification.title,
            body: d.notification.body,
            data: (d.notification.data ?? undefined) as Record<string, unknown> | undefined,
          });
          await this.prisma.notificationDelivery.update({
            where: { id: d.id },
            data: { status: SyncStatus.SUCCESS, externalRef, sentAt: new Date(), lastError: null },
          });
          sent++;
        } catch (e) {
          const giveUp = attempts >= MAX_ATTEMPTS;
          await this.prisma.notificationDelivery.update({
            where: { id: d.id },
            data: {
              status: giveUp ? SyncStatus.FAILED : SyncStatus.PENDING,
              lastError: (e as Error).message.slice(0, 1000),
              nextAttemptAt: new Date(Date.now() + backoffMinutes(attempts) * 60_000),
            },
          });
          failed++;
        }
      }
      return { processed: sent + failed, sent, failed };
    } finally {
      if (!schoolId) this.running = false;
    }
  }

  private destination(channel: NotificationChannel, user: { phone: string | null; email: string | null; pushTokens: { token: string }[] }): string[] {
    switch (channel) {
      case NotificationChannel.PUSH:
        return user.pushTokens.map((t) => t.token);
      case NotificationChannel.ZALO:
      case NotificationChannel.SMS:
        return user.phone ? [user.phone] : [];
      case NotificationChannel.EMAIL:
        return user.email ? [user.email] : [];
      default:
        return [];
    }
  }

  async list(schoolId: string, query: DeliveryQuery): Promise<Page<unknown>> {
    const where: Prisma.NotificationDeliveryWhereInput = { status: query.status, channel: query.channel, notification: { schoolId } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationDelivery.findMany({
        where,
        include: { notification: { select: { id: true, kind: true, title: true, createdAt: true, user: { select: { fullName: true, role: true } } } } },
        orderBy: { nextAttemptAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async summary(schoolId: string) {
    const rows = await this.prisma.notificationDelivery.groupBy({ by: ['channel', 'status'], where: { notification: { schoolId } }, _count: true });
    return { providers: this.providers, rows: rows.map((r) => ({ channel: r.channel, status: r.status, count: r._count })) };
  }
}
