import { Role } from '@prisma/client';
import { isEmptyAudience, parseAudience, recipientWhere, summarizeRecipients, teacherAudienceError } from './audience';

describe('parseAudience', () => {
  it('normalises a stored audience and drops junk', () => {
    expect(parseAudience({ roles: ['PARENT', 'PARENT', 'NOPE', 3], classIds: ['c1', '', 'c1'], gradeLevels: [6, '7', 6.5] })).toEqual({
      roles: ['PARENT'],
      classIds: ['c1'],
      gradeLevels: [6],
    });
  });

  it('tolerates missing or malformed input', () => {
    expect(parseAudience(null)).toEqual({ roles: [], classIds: [], gradeLevels: [] });
    expect(parseAudience(['x'])).toEqual({ roles: [], classIds: [], gradeLevels: [] });
    expect(isEmptyAudience(parseAudience({}))).toBe(true);
    expect(isEmptyAudience(parseAudience({ gradeLevels: [6] }))).toBe(false);
  });
});

describe('teacherAudienceError', () => {
  it('allows only the teacher\'s own homeroom classes', () => {
    expect(teacherAudienceError(parseAudience({ classIds: ['c1'] }), ['c1', 'c2'])).toBeNull();
    expect(teacherAudienceError(parseAudience({ classIds: ['c3'] }), ['c1'])).toBe('Bạn không phải giáo viên chủ nhiệm lớp này');
    expect(teacherAudienceError(parseAudience({ classIds: [] }), ['c1'])).toBe('Chọn lớp nhận thông báo');
  });

  it('refuses roles and grade levels', () => {
    expect(teacherAudienceError(parseAudience({ roles: ['PARENT'], classIds: ['c1'] }), ['c1'])).toMatch(/chủ nhiệm/);
    expect(teacherAudienceError(parseAudience({ gradeLevels: [6] }), ['c1'])).toMatch(/chủ nhiệm/);
  });
});

describe('recipientWhere', () => {
  it('is null for an empty audience', () => {
    expect(recipientWhere('s1', 'y1', parseAudience({}))).toBeNull();
  });

  it('matches roles directly', () => {
    expect(recipientWhere('s1', 'y1', parseAudience({ roles: ['TEACHER', 'STAFF'] }))).toEqual({
      schoolId: 's1',
      isActive: true,
      OR: [{ role: { in: ['TEACHER', 'STAFF'] } }],
    });
  });

  it('reaches the parents, students and homeroom teachers of classes and grades', () => {
    const where = recipientWhere('s1', 'y1', parseAudience({ classIds: ['c1'], gradeLevels: [6] }))!;
    const klass = { schoolId: 's1', OR: [{ id: { in: ['c1'] } }, { gradeLevel: { in: [6] }, academicYearId: 'y1' }] };
    expect(where.OR).toEqual([
      { role: Role.PARENT, guardians: { some: { student: { enrollments: { some: { class: klass } } } } } },
      { role: Role.STUDENT, student: { enrollments: { some: { class: klass } } } },
      { role: Role.TEACHER, teacher: { homeroomClasses: { some: klass } } },
    ]);
  });
});

describe('summarizeRecipients', () => {
  it('de-duplicates users and counts per role', () => {
    const { users, byRole } = summarizeRecipients([
      { id: 'u1', role: Role.PARENT },
      { id: 'u1', role: Role.PARENT },
      { id: 'u2', role: Role.PARENT },
      { id: 'u3', role: Role.TEACHER },
    ]);
    expect(users.map((u) => u.id)).toEqual(['u1', 'u2', 'u3']);
    expect(byRole).toEqual({ PARENT: 2, TEACHER: 1 });
  });
});
