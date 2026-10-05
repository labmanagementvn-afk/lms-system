import { addDays, dayOfWeek, daysBetween, eachDay, mondayOf, semesterFor } from './dates';

describe('homeroom dates', () => {
  it('numbers weekdays Monday=1 ... Sunday=7', () => {
    expect(dayOfWeek('2026-10-05')).toBe(1); // Monday
    expect(dayOfWeek('2026-10-10')).toBe(6); // Saturday
    expect(dayOfWeek('2026-10-11')).toBe(7); // Sunday
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(daysBetween('2026-10-05', '2026-10-18')).toBe(13);
    expect(daysBetween('2026-10-18', '2026-10-05')).toBe(-13);
  });

  it('lists every day of a range inclusive', () => {
    expect(eachDay('2026-10-05', '2026-10-07')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(eachDay('2026-10-05', '2026-10-05')).toEqual(['2026-10-05']);
    expect(eachDay('2026-10-06', '2026-10-05')).toEqual([]);
  });

  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-08')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
  });

  it('switches to semester 2 on 15 January of the ending year', () => {
    const year = { endDate: new Date('2027-05-31T00:00:00Z') };
    expect(semesterFor('2026-09-07', year)).toBe(1);
    expect(semesterFor('2027-01-14', year)).toBe(1);
    expect(semesterFor('2027-01-15', year)).toBe(2);
    expect(semesterFor('2027-05-20', year)).toBe(2);
  });
});
