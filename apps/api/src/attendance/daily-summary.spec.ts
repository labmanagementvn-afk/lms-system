import { summarizeDay } from './daily-summary';

const tz = 'Asia/Ho_Chi_Minh';
// 00:00Z == 07:00 in Vietnam
const at = (hhmm: string) => new Date(`2026-10-05T${String(+hhmm.slice(0, 2) - 7).padStart(2, '0')}:${hhmm.slice(3)}:00Z`);

describe('summarizeDay', () => {
  it('marks a student with no events absent', () => {
    expect(summarizeDay([], '07:15', tz).status).toBe('ABSENT');
  });

  it('marks an on-time arrival and the last check-out', () => {
    const s = summarizeDay(
      [
        { occurredAt: at('16:45'), direction: 'OUT' },
        { occurredAt: at('07:05'), direction: 'IN' },
        { occurredAt: at('07:06'), direction: 'IN' },
      ],
      '07:15',
      tz,
    );
    expect(s).toEqual({ status: 'ON_TIME', firstIn: at('07:05'), lastOut: at('16:45'), eventCount: 3 });
  });

  it('marks a late arrival', () => {
    expect(summarizeDay([{ occurredAt: at('07:20'), direction: 'IN' }], '07:15', tz).status).toBe('LATE');
  });

  it('infers leaving time when the terminal reports no direction', () => {
    const s = summarizeDay(
      [
        { occurredAt: at('07:01'), direction: 'UNKNOWN' },
        { occurredAt: at('11:30'), direction: 'UNKNOWN' },
      ],
      '07:15',
      tz,
    );
    expect(s.firstIn).toEqual(at('07:01'));
    expect(s.lastOut).toEqual(at('11:30'));
  });

  it('keeps arrival empty when only a check-out was recorded', () => {
    const s = summarizeDay([{ occurredAt: at('16:30'), direction: 'OUT' }], '07:15', tz);
    expect(s.firstIn).toBeNull();
    expect(s.lastOut).toEqual(at('16:30'));
  });
});
