import { parseZktecoAttlog } from './zkteco';

describe('parseZktecoAttlog', () => {
  it('parses ATTLOG records in school-local time', () => {
    const body = '1001\t2026-10-05 07:02:11\t0\t15\t0\t0\n1002\t2026-10-05 16:40:00\t1\t1\t0\t0\n';
    const events = parseZktecoAttlog(body, 'Asia/Ho_Chi_Minh');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      externalEventId: '1001|2026-10-05 07:02:11',
      personId: '1001',
      method: 'FACE',
      direction: 'IN',
    });
    expect(events[0].occurredAt.toISOString()).toBe('2026-10-05T00:02:11.000Z');
    expect(events[1]).toMatchObject({ method: 'FINGERPRINT', direction: 'OUT' });
  });

  it('skips blank and malformed lines and tolerates unknown codes', () => {
    const events = parseZktecoAttlog('\nbad line\n2001\tnot-a-date\t0\t1\n2002\t2026-10-05 07:00:00\t255\t99\n', 'Asia/Ho_Chi_Minh');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ personId: '2002', method: 'UNKNOWN', direction: 'UNKNOWN' });
  });
});
