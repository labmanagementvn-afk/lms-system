import { findConflicts, Slot } from './conflicts';

const base: Slot = { classId: 'c1', teacherId: 't1', room: 'P.101', dayOfWeek: 2, periodNumber: 1 };

describe('findConflicts', () => {
  it('finds no conflict in a free slot', () => {
    expect(findConflicts(base, [{ ...base, id: 'x', dayOfWeek: 3 }])).toEqual([]);
  });

  it('detects a class that already has a lesson', () => {
    const res = findConflicts(base, [{ id: 'x', classId: 'c1', teacherId: 't2', room: null, dayOfWeek: 2, periodNumber: 1 }]);
    expect(res.map((c) => c.kind)).toEqual(['CLASS']);
  });

  it('detects a teacher teaching two classes at once', () => {
    const res = findConflicts(base, [{ id: 'x', classId: 'c2', teacherId: 't1', room: 'P.102', dayOfWeek: 2, periodNumber: 1 }]);
    expect(res.map((c) => c.kind)).toEqual(['TEACHER']);
  });

  it('detects a room clash ignoring case and spaces', () => {
    const res = findConflicts(base, [{ id: 'x', classId: 'c2', teacherId: 't2', room: ' p.101 ', dayOfWeek: 2, periodNumber: 1 }]);
    expect(res.map((c) => c.kind)).toEqual(['ROOM']);
  });

  it('ignores the entry being updated', () => {
    expect(findConflicts({ ...base, id: 'x' }, [{ ...base, id: 'x' }])).toEqual([]);
  });
});
