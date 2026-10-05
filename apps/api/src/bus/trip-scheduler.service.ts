import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { localDate } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from './trips.service';

/**
 * Pre-creates today's PLANNED trips for every school with active routes, so the
 * live map and the parent app see the day's runs before anyone opens a list.
 * Interval from BUS_TRIP_SCHEDULER_MS (default 5 min; 0 disables, as in tests).
 */
@Injectable()
export class TripSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripSchedulerService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
  ) {}

  onModuleInit() {
    const every = Number(process.env.BUS_TRIP_SCHEDULER_MS ?? 300_000);
    if (every > 0) {
      this.timer = setInterval(() => void this.run().catch((e) => this.logger.error(e)), every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    const schools = await this.prisma.school.findMany({ where: { busRoutes: { some: { isActive: true } } }, select: { id: true, timezone: true } });
    let created = 0;
    for (const s of schools) created += await this.trips.ensureTrips(s.id, localDate(new Date(), s.timezone));
    return { schools: schools.length, created };
  }
}
