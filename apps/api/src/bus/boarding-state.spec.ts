import { BoardingType } from '@prisma/client';
import { boardingState, boardingStates, boardingTransitionError, countStates } from './boarding-state';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 5, 0, minutes));
const board = (minutes: number, studentId = 's1') => ({ studentId, type: BoardingType.BOARD, occurredAt: at(minutes) });
const alight = (minutes: number, studentId = 's1') => ({ studentId, type: BoardingType.ALIGHT, occurredAt: at(minutes) });

describe('boardingState', () => {
  it('is NOT_BOARDED without events', () => {
    expect(boardingState([])).toBe('NOT_BOARDED');
  });

  it('follows the latest event by time, whatever the input order', () => {
    expect(boardingState([board(5)])).toBe('ON_BUS');
    expect(boardingState([board(5), alight(20)])).toBe('ALIGHTED');
    expect(boardingState([alight(20), board(5)])).toBe('ALIGHTED');
    // Boarded again after getting off (e.g. recorded by mistake and corrected).
    expect(boardingState([board(5), alight(6), board(7)])).toBe('ON_BUS');
  });

  it('keeps input order on equal timestamps', () => {
    expect(boardingState([board(5), alight(5)])).toBe('ALIGHTED');
    expect(boardingState([alight(5), board(5)])).toBe('ON_BUS');
  });
});

describe('boardingStates', () => {
  it('groups events per student', () => {
    const states = boardingStates([board(1, 'a'), board(2, 'b'), alight(3, 'a')]);
    expect(states.get('a')).toBe('ALIGHTED');
    expect(states.get('b')).toBe('ON_BUS');
    expect(states.has('c')).toBe(false);
  });
});

describe('boardingTransitionError', () => {
  it('allows one board and alighting only while on the bus', () => {
    expect(boardingTransitionError('NOT_BOARDED', BoardingType.BOARD)).toBeNull();
    expect(boardingTransitionError('ALIGHTED', BoardingType.BOARD)).toBeNull();
    expect(boardingTransitionError('ON_BUS', BoardingType.BOARD)).toBe('Học sinh đã lên xe');
    expect(boardingTransitionError('ON_BUS', BoardingType.ALIGHT)).toBeNull();
    expect(boardingTransitionError('NOT_BOARDED', BoardingType.ALIGHT)).toBe('Học sinh chưa lên xe');
    expect(boardingTransitionError('ALIGHTED', BoardingType.ALIGHT)).toBe('Học sinh chưa lên xe');
  });
});

describe('countStates', () => {
  it('counts boarded as on-bus plus alighted', () => {
    expect(countStates(['ON_BUS', 'ON_BUS', 'ALIGHTED', 'NOT_BOARDED'])).toEqual({ boarded: 3, onBus: 2, alighted: 1 });
    expect(countStates([])).toEqual({ boarded: 0, onBus: 0, alighted: 0 });
  });
});
