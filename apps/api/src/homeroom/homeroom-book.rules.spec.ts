import { bookSpan, cleanCommittee, cleanGroups, cleanOfficers, cleanSeating, jsonSeating, mergePlan, Roster } from './homeroom-book.rules';

const roster: Roster = new Map([
  ['s1', 'Nguyễn Minh An'],
  ['s2', 'Trần Bảo Châu'],
  ['s3', 'Lê Gia Huy'],
]);

describe('cleanOfficers', () => {
  it('keeps roles of students in the class, trimmed, without blanks or repeats', () => {
    expect(
      cleanOfficers(
        [
          { role: ' Lớp trưởng ', studentId: 's1' },
          { role: 'lớp trưởng', studentId: 's1' },
          { role: '  ', studentId: 's2' },
          { role: 'Lớp phó học tập', studentId: 's2' },
        ],
        roster,
      ),
    ).toEqual([
      { role: 'Lớp trưởng', studentId: 's1' },
      { role: 'Lớp phó học tập', studentId: 's2' },
    ]);
  });

  it('refuses a student of another class', () => {
    expect(() => cleanOfficers([{ role: 'Lớp trưởng', studentId: 'x' }], roster)).toThrow('Lớp trưởng: học sinh không thuộc lớp');
  });
});

describe('cleanCommittee', () => {
  it('takes parents of the class, each in one role', () => {
    const guardians = new Set(['g1', 'g2']);
    expect(cleanCommittee([{ role: 'Trưởng ban', guardianId: 'g1' }], guardians)).toEqual([{ role: 'Trưởng ban', guardianId: 'g1' }]);
    expect(() => cleanCommittee([{ role: 'Phó ban', guardianId: 'g9' }], guardians)).toThrow('không phải cha mẹ của học sinh trong lớp');
    expect(() =>
      cleanCommittee(
        [
          { role: 'Trưởng ban', guardianId: 'g1' },
          { role: 'Ủy viên', guardianId: 'g1' },
        ],
        guardians,
      ),
    ).toThrow('Mỗi phụ huynh chỉ giữ một chức vụ');
  });
});

describe('cleanGroups', () => {
  it('keeps each student in one tổ with a leader from its members', () => {
    expect(
      cleanGroups(
        [
          { name: 'Tổ 1', leaderId: 's1', studentIds: ['s1', 's2', 's1'] },
          { name: 'Tổ 2', leaderId: '', studentIds: ['s3'] },
        ],
        roster,
      ),
    ).toEqual([
      { name: 'Tổ 1', leaderId: 's1', studentIds: ['s1', 's2'] },
      { name: 'Tổ 2', leaderId: null, studentIds: ['s3'] },
    ]);
  });

  it('refuses a student in two tổ, a repeated name and a leader from outside', () => {
    expect(() =>
      cleanGroups(
        [
          { name: 'Tổ 1', studentIds: ['s1'] },
          { name: 'Tổ 2', studentIds: ['s1'] },
        ],
        roster,
      ),
    ).toThrow('Nguyễn Minh An đã ở Tổ 1');
    expect(() =>
      cleanGroups(
        [
          { name: 'Tổ 1', studentIds: [] },
          { name: 'tổ 1', studentIds: [] },
        ],
        roster,
      ),
    ).toThrow('Trùng tên tổ');
    expect(() => cleanGroups([{ name: 'Tổ 1', leaderId: 's3', studentIds: ['s1'] }], roster)).toThrow('tổ trưởng phải là thành viên');
  });
});

describe('cleanSeating', () => {
  const grid = { columns: 2, rows: 1, seatsPerDesk: 2 };

  it('takes a full grid with each student at most once', () => {
    expect(cleanSeating({ ...grid, seats: [['s1', '', null, 's2']] }, roster).seats).toEqual([['s1', null, null, 's2']]);
  });

  it('refuses a grid of the wrong size, a student seated twice or one of another class', () => {
    expect(() => cleanSeating({ ...grid, seats: [['s1', null, null]] }, roster)).toThrow('1 hàng bàn, mỗi hàng 4 chỗ');
    expect(() => cleanSeating({ ...grid, seats: [['s1', null, 's1', null]] }, roster)).toThrow('Nguyễn Minh An được xếp hai chỗ');
    expect(() => cleanSeating({ ...grid, seats: [['x', null, null, null]] }, roster)).toThrow('không thuộc lớp');
  });

  it('reads back only a well-formed chart', () => {
    expect(jsonSeating(null)).toBeNull();
    expect(jsonSeating({ columns: 0, rows: 1, seatsPerDesk: 2, seats: [] })).toBeNull();
    expect(jsonSeating({ ...grid, seats: [[null, null, null, null]] })).not.toBeNull();
  });
});

describe('mergePlan', () => {
  it('replaces the parts sent, clears blank ones and keeps the rest', () => {
    expect(mergePlan({ goals: 'Cũ', targets: 'Giữ', measures: 'Xóa' }, { goals: ' Mới ', measures: '' })).toEqual({ goals: 'Mới', targets: 'Giữ' });
    expect(mergePlan({ goals: 'Cũ' }, { goals: null })).toEqual({});
  });
});

describe('bookSpan', () => {
  it('runs from the first school day to the end of the summer after it', () => {
    expect(bookSpan({ startDate: '2026-09-05', endDate: '2027-05-31' })).toEqual({ from: '2026-09-05', to: '2027-08-31' });
  });
});
