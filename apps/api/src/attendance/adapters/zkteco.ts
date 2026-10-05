import { Direction, EventMethod } from '@prisma/client';
import { zonedToUtc } from '../../common/time';
import { NormalizedEvent } from './normalized-event';

// ZKTeco "PUSH"/ADMS protocol: terminals POST /iclock/cdata?SN=<serial>&table=ATTLOG
// with one tab-separated record per line:
//   PIN  YYYY-MM-DD HH:mm:ss  STATUS  VERIFY  WORKCODE  ...
// Times are device-local, so they are interpreted in the school's timezone.

const STATUS_DIRECTION: Record<string, Direction> = {
  '0': Direction.IN, // check-in
  '1': Direction.OUT, // check-out
  '2': Direction.OUT, // break-out
  '3': Direction.IN, // break-in
  '4': Direction.IN, // overtime-in
  '5': Direction.OUT, // overtime-out
};

const VERIFY_METHOD: Record<string, EventMethod> = {
  '1': EventMethod.FINGERPRINT,
  '2': EventMethod.CARD,
  '4': EventMethod.CARD,
  '15': EventMethod.FACE,
};

export function parseZktecoAttlog(body: string, timeZone: string): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  for (const line of body.split(/\r?\n/)) {
    const cols = line.split('\t').map((c) => c.trim());
    if (cols.length < 2 || !cols[0] || !cols[1]) continue;
    const [pin, time, status = '', verify = ''] = cols;
    let occurredAt: Date;
    try {
      occurredAt = zonedToUtc(time, timeZone);
    } catch {
      continue;
    }
    events.push({
      externalEventId: `${pin}|${time}`,
      personId: pin,
      method: VERIFY_METHOD[verify] ?? EventMethod.UNKNOWN,
      direction: STATUS_DIRECTION[status] ?? Direction.UNKNOWN,
      occurredAt,
      raw: { line },
    });
  }
  return events;
}
