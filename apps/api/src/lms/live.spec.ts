import { LiveStatus } from '@prisma/client';
import { canJoin, compareSessions, joinUrl, makeRoomName } from './live';

describe('live rooms', () => {
  it('builds lms-<school>-<10 chars> room names from the school code', () => {
    const name = makeRoomName('DEMO', () => Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(name).toBe('lms-demo-abcdefghij');
    expect(makeRoomName('THCS-01')).toMatch(/^lms-thcs01-[a-z0-9]{10}$/);
    expect(joinUrl(name)).toBe('https://meet.jit.si/lms-demo-abcdefghij');
  });

  it('lets students into live rooms and scheduled ones 15 minutes early', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    const at = (min: number) => new Date(now.getTime() + min * 60_000);
    expect(canJoin({ status: LiveStatus.LIVE, startsAt: at(60) }, now)).toBe(true);
    expect(canJoin({ status: LiveStatus.SCHEDULED, startsAt: at(15) }, now)).toBe(true);
    expect(canJoin({ status: LiveStatus.SCHEDULED, startsAt: at(16) }, now)).toBe(false);
    expect(canJoin({ status: LiveStatus.SCHEDULED, startsAt: at(-5) }, now)).toBe(true);
    expect(canJoin({ status: LiveStatus.ENDED, startsAt: at(-5) }, now)).toBe(false);
    expect(canJoin({ status: LiveStatus.CANCELLED, startsAt: at(5) }, now)).toBe(false);
  });

  it('orders live first, then upcoming soonest first, then past latest first', () => {
    const d = (h: number) => new Date(Date.UTC(2026, 9, 5, h));
    const rows = [
      { id: 'ended-old', status: LiveStatus.ENDED, startsAt: d(1) },
      { id: 'sched-late', status: LiveStatus.SCHEDULED, startsAt: d(20) },
      { id: 'live', status: LiveStatus.LIVE, startsAt: d(9) },
      { id: 'ended-new', status: LiveStatus.ENDED, startsAt: d(8) },
      { id: 'sched-soon', status: LiveStatus.SCHEDULED, startsAt: d(11) },
    ];
    expect([...rows].sort(compareSessions).map((r) => r.id)).toEqual(['live', 'sched-soon', 'sched-late', 'ended-new', 'ended-old']);
  });
});
