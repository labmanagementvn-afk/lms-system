import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';

/** Sends scheduled announcements when their time comes; ANNOUNCE_SCHEDULER_MS sets the poll interval (0 disables). */
@Injectable()
export class AnnouncementsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementsScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly service: AnnouncementsService) {}

  onModuleInit() {
    const every = Number(process.env.ANNOUNCE_SCHEDULER_MS ?? 30_000);
    if (every > 0) {
      this.timer = setInterval(() => void this.tick(), every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const { sent } = await this.service.runScheduled();
      if (sent) this.logger.log(`Sent ${sent} scheduled announcement(s)`);
    } catch (e) {
      this.logger.error(`scheduler failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
