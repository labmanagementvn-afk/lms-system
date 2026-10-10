import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationChannel, SmsCampaignStatus, SyncStatus } from '@prisma/client';
import { backoffMinutes, MAX_ATTEMPTS } from '../accounting/accounting.service';
import { CHANNEL_ADAPTERS, ChannelAdapter } from '../notifications/channels/channel-adapter';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sends the texts of SMS campaigns through the SMS channel adapter once they are due,
 * with the outbox's retries (backoff 1/2/4/8 minutes, 5 attempts), and closes each
 * campaign when nothing is left to send.
 */
@Injectable()
export class SmsDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsDispatcher.name);
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

  /** The SMS gateway in use, e.g. "mock-sms"; null when SMS is not configured. */
  get provider(): string | null {
    return this.adapters.get(NotificationChannel.SMS)?.name ?? null;
  }

  async processDue(schoolId?: string, limit = 500) {
    if (!schoolId) {
      if (this.running) return { sent: 0, failed: 0 };
      this.running = true;
    }
    let sent = 0;
    let failed = 0;
    try {
      const now = new Date();
      await this.prisma.smsCampaign.updateMany({ where: { status: SmsCampaignStatus.SCHEDULED, scheduledAt: { lte: now }, ...(schoolId ? { schoolId } : {}) }, data: { status: SmsCampaignStatus.SENDING } });
      const due = await this.prisma.smsMessage.findMany({
        where: { status: SyncStatus.PENDING, nextAttemptAt: { lte: now }, campaign: { status: SmsCampaignStatus.SENDING }, ...(schoolId ? { schoolId } : {}) },
        orderBy: { nextAttemptAt: 'asc' },
        take: limit,
      });
      const adapter = this.adapters.get(NotificationChannel.SMS);
      const brandnames = new Map<string, string>();
      for (const m of due) {
        const claimed = await this.prisma.smsMessage.updateMany({ where: { id: m.id, status: SyncStatus.PENDING, attempts: m.attempts }, data: { attempts: { increment: 1 } } });
        if (!claimed.count) continue;
        const attempts = m.attempts + 1;
        try {
          if (!adapter) throw new Error('Kênh SMS chưa được cấu hình');
          if (!brandnames.has(m.schoolId)) {
            const s = await this.prisma.smsSetting.findUnique({ where: { schoolId: m.schoolId }, select: { brandname: true } });
            brandnames.set(m.schoolId, s?.brandname ?? '');
          }
          const { externalRef } = await adapter.send({ to: [m.phone], title: brandnames.get(m.schoolId) ?? '', body: m.body, data: { campaignId: m.campaignId } });
          await this.prisma.smsMessage.update({ where: { id: m.id }, data: { status: SyncStatus.SUCCESS, externalRef, sentAt: new Date(), lastError: null } });
          sent++;
        } catch (e) {
          const giveUp = attempts >= MAX_ATTEMPTS || !adapter;
          await this.prisma.smsMessage.update({
            where: { id: m.id },
            data: { status: giveUp ? SyncStatus.FAILED : SyncStatus.PENDING, lastError: (e as Error).message.slice(0, 500), nextAttemptAt: new Date(Date.now() + backoffMinutes(attempts) * 60_000) },
          });
          failed++;
        }
      }
      // A campaign is done once none of its texts waits any more.
      const sending = await this.prisma.smsCampaign.findMany({ where: { status: SmsCampaignStatus.SENDING, ...(schoolId ? { schoolId } : {}) }, select: { id: true } });
      for (const c of sending) {
        const pending = await this.prisma.smsMessage.count({ where: { campaignId: c.id, status: SyncStatus.PENDING } });
        if (!pending) await this.prisma.smsCampaign.updateMany({ where: { id: c.id, status: SmsCampaignStatus.SENDING }, data: { status: SmsCampaignStatus.SENT, finishedAt: new Date() } });
      }
      return { sent, failed };
    } finally {
      if (!schoolId) this.running = false;
    }
  }
}
