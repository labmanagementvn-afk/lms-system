import { Injectable } from '@nestjs/common';
import { AttendanceDevice, AttendanceIdentity, Direction, EventMethod, EventSource, IdentityMethod, Prisma, School } from '@prisma/client';
import { zonedToUtc } from '../common/time';
import { AlertsService } from '../notifications/alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizedEvent } from './adapters/normalized-event';
import { IngestEventDto } from './attendance.dto';

export type IngestStatus = 'accepted' | 'duplicate' | 'unmatched' | 'rejected';

export interface IngestResult {
  eventId: string;
  status: IngestStatus;
  reason?: string;
}

// Which identity kinds an event may match, in order of preference.
// Face/fingerprint events only match BIOMETRIC identities, which require consent.
const MATCH_ORDER: Record<EventMethod, IdentityMethod[]> = {
  FACE: [IdentityMethod.BIOMETRIC],
  FINGERPRINT: [IdentityMethod.BIOMETRIC],
  CARD: [IdentityMethod.CARD, IdentityMethod.QR, IdentityMethod.BIOMETRIC],
  QR: [IdentityMethod.QR, IdentityMethod.CARD, IdentityMethod.BIOMETRIC],
  UNKNOWN: [IdentityMethod.BIOMETRIC, IdentityMethod.CARD, IdentityMethod.QR],
  MANUAL: [],
};

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

type DeviceWithSchool = AttendanceDevice & { school: School };

@Injectable()
export class IngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  /** Converts the generic JSON API payload into normalized events. */
  fromGeneric(events: IngestEventDto[], timeZone: string): NormalizedEvent[] {
    return events.map((e) => {
      const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(e.occurredAt);
      const occurredAt = hasOffset ? new Date(e.occurredAt) : zonedToUtc(e.occurredAt.replace(/\.\d+$/, ''), timeZone);
      return {
        externalEventId: e.eventId ?? `${e.personId}|${occurredAt.toISOString()}`,
        personId: e.personId,
        method: e.method ?? EventMethod.UNKNOWN,
        direction: e.direction ?? Direction.UNKNOWN,
        occurredAt,
        raw: e.raw,
      };
    });
  }

  /**
   * Stores events from a terminal. Idempotent per (device, externalEventId);
   * events from people not yet mapped are kept as "unmatched" and linked later.
   */
  async ingest(device: DeviceWithSchool, events: NormalizedEvent[]) {
    const results: IngestResult[] = [];
    const now = Date.now();

    const valid = events.filter((e) => {
      if (Number.isNaN(e.occurredAt.getTime())) {
        results.push({ eventId: e.externalEventId, status: 'rejected', reason: 'invalid time' });
        return false;
      }
      if (e.occurredAt.getTime() - now > MAX_CLOCK_SKEW_MS) {
        results.push({ eventId: e.externalEventId, status: 'rejected', reason: 'time is in the future; check device clock' });
        return false;
      }
      if (e.method === EventMethod.MANUAL) {
        results.push({ eventId: e.externalEventId, status: 'rejected', reason: 'MANUAL is not a device method' });
        return false;
      }
      return true;
    });

    const existing = new Set(
      (
        await this.prisma.gateEvent.findMany({
          where: { deviceId: device.id, externalEventId: { in: valid.map((e) => e.externalEventId) } },
          select: { externalEventId: true },
        })
      ).map((e) => e.externalEventId),
    );

    const identities = await this.prisma.attendanceIdentity.findMany({
      where: { schoolId: device.schoolId, revokedAt: null, externalId: { in: [...new Set(valid.map((e) => e.personId))] } },
    });

    const seen = new Set<string>();
    const rows: Prisma.GateEventCreateManyInput[] = [];
    for (const e of valid) {
      if (existing.has(e.externalEventId) || seen.has(e.externalEventId)) {
        results.push({ eventId: e.externalEventId, status: 'duplicate' });
        continue;
      }
      seen.add(e.externalEventId);
      const identity = this.match(identities, e);
      rows.push({
        schoolId: device.schoolId,
        deviceId: device.id,
        externalEventId: e.externalEventId,
        externalPersonId: e.personId,
        studentId: identity?.studentId,
        teacherId: identity?.teacherId,
        method: e.method,
        direction: e.direction !== Direction.UNKNOWN ? e.direction : device.defaultDirection,
        occurredAt: e.occurredAt,
        source: EventSource.DEVICE,
        rawPayload: e.raw === undefined ? undefined : (e.raw as Prisma.InputJsonValue),
      });
      results.push({ eventId: e.externalEventId, status: identity ? 'accepted' : 'unmatched' });
    }

    await this.prisma.$transaction([
      this.prisma.gateEvent.createMany({ data: rows, skipDuplicates: true }),
      this.prisma.attendanceDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }),
    ]);
    await this.alerts.gateEvents(
      device.schoolId,
      rows.filter((r) => r.studentId).map((r) => ({ studentId: r.studentId!, direction: r.direction!, occurredAt: r.occurredAt as Date })),
    );

    const count = (s: IngestStatus) => results.filter((r) => r.status === s).length;
    return {
      accepted: count('accepted'),
      unmatched: count('unmatched'),
      duplicates: count('duplicate'),
      rejected: count('rejected'),
      results,
    };
  }

  private match(identities: AttendanceIdentity[], e: NormalizedEvent) {
    for (const method of MATCH_ORDER[e.method]) {
      const hit = identities.find((i) => i.method === method && i.externalId === e.personId);
      if (hit) return hit;
    }
    return null;
  }
}
