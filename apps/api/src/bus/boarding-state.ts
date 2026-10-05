// Pure helpers that derive a student's position from the boarding events of one trip.
import { BoardingType } from '@prisma/client';

export type BoardingState = 'NOT_BOARDED' | 'ON_BUS' | 'ALIGHTED';

export interface BoardingLike {
  type: BoardingType;
  occurredAt: Date;
}

/** State after the latest event; events are compared by time, ties keep input order. */
export function boardingState(events: BoardingLike[]): BoardingState {
  let last: BoardingLike | undefined;
  for (const e of events) {
    if (!last || e.occurredAt.getTime() >= last.occurredAt.getTime()) last = e;
  }
  if (!last) return 'NOT_BOARDED';
  return last.type === BoardingType.BOARD ? 'ON_BUS' : 'ALIGHTED';
}

/** Per-student state from every event of a trip. Students without events are absent from the map. */
export function boardingStates<T extends BoardingLike & { studentId: string }>(events: T[]): Map<string, BoardingState> {
  const byStudent = new Map<string, T[]>();
  for (const e of events) byStudent.set(e.studentId, [...(byStudent.get(e.studentId) ?? []), e]);
  return new Map([...byStudent].map(([studentId, list]) => [studentId, boardingState(list)]));
}

/** Why `type` cannot be recorded from `state`, or null when it can (board once, alight only while on the bus). */
export function boardingTransitionError(state: BoardingState, type: BoardingType): string | null {
  if (type === BoardingType.BOARD && state === 'ON_BUS') return 'Học sinh đã lên xe';
  if (type === BoardingType.ALIGHT && state !== 'ON_BUS') return 'Học sinh chưa lên xe';
  return null;
}

export interface BoardingCounts {
  /** Students who boarded at some point during the trip (on the bus or already dropped off). */
  boarded: number;
  onBus: number;
  alighted: number;
}

export function countStates(states: Iterable<BoardingState>): BoardingCounts {
  const c: BoardingCounts = { boarded: 0, onBus: 0, alighted: 0 };
  for (const s of states) {
    if (s === 'ON_BUS') c.onBus++;
    else if (s === 'ALIGHTED') c.alighted++;
  }
  c.boarded = c.onBus + c.alighted;
  return c;
}
