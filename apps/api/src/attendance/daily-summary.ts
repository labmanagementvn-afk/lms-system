import { Direction } from '@prisma/client';
import { localTime } from '../common/time';

export type DayStatus = 'ON_TIME' | 'LATE' | 'ABSENT';

export interface DayEvent {
  occurredAt: Date;
  direction: Direction;
}

export interface DaySummary {
  status: DayStatus;
  firstIn: Date | null;
  lastOut: Date | null;
  eventCount: number;
}

/**
 * Summarises one person's gate events for one school day.
 * Arrival is the first IN (or direction-less) event; leaving is the last OUT,
 * or for terminals that don't report direction, the last later event.
 */
export function summarizeDay(events: DayEvent[], lateAfter: string, timeZone: string): DaySummary {
  if (!events.length) return { status: 'ABSENT', firstIn: null, lastOut: null, eventCount: 0 };
  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const arrival = sorted.find((e) => e.direction !== Direction.OUT) ?? sorted[0];
  const outs = sorted.filter((e) => e.direction === Direction.OUT);
  const unknownLater = sorted.filter((e) => e.direction === Direction.UNKNOWN && e.occurredAt > arrival.occurredAt);
  const leaving = outs.at(-1) ?? unknownLater.at(-1) ?? null;

  return {
    status: localTime(arrival.occurredAt, timeZone) > lateAfter ? 'LATE' : 'ON_TIME',
    firstIn: arrival.direction === Direction.OUT ? null : arrival.occurredAt,
    lastOut: leaving?.occurredAt ?? null,
    eventCount: sorted.length,
  };
}
