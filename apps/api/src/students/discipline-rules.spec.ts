import { AwardForm, DisciplineMeasure, Role } from '@prisma/client';
import { mayGiveAward, mayTakeMeasure, measureProblem, measuresFor } from './discipline-rules';

const { REMINDER, CRITICISM, SELF_REVIEW, APOLOGY } = DisciplineMeasure;

describe('measuresFor', () => {
  it('gives primary students a reminder or an apology, older students a reminder, criticism or self-review', () => {
    expect(measuresFor(3)).toEqual([REMINDER, APOLOGY]);
    expect(measuresFor(7)).toEqual([REMINDER, CRITICISM, SELF_REVIEW]);
  });
});

describe('measureProblem', () => {
  it('always allows a reminder', () => {
    expect(measureProblem(REMINDER, 1, 8, [])).toBeNull();
    expect(measureProblem(REMINDER, 3, 8, [])).toBeNull();
  });
  it('allows criticism for a level 2 violation, or a level 1 one after a reminder', () => {
    expect(measureProblem(CRITICISM, 2, 8, [])).toBeNull();
    expect(measureProblem(CRITICISM, 1, 8, [REMINDER])).toBeNull();
    expect(measureProblem(CRITICISM, 1, 8, [])).toMatch(/Điều 15/);
  });
  it('allows a self-review for a level 3 violation, or a level 2 one after criticism', () => {
    expect(measureProblem(SELF_REVIEW, 3, 9, [])).toBeNull();
    expect(measureProblem(SELF_REVIEW, 2, 9, [REMINDER, CRITICISM])).toBeNull();
    expect(measureProblem(SELF_REVIEW, 2, 9, [REMINDER])).toMatch(/đã bị phê bình/);
    expect(measureProblem(SELF_REVIEW, 1, 9, [CRITICISM])).not.toBeNull();
  });
  it('keeps the primary and secondary measures apart', () => {
    expect(measureProblem(APOLOGY, 2, 8, [])).toMatch(/tiểu học/);
    expect(measureProblem(CRITICISM, 2, 4, [])).toMatch(/tiểu học/);
    expect(measureProblem(APOLOGY, 1, 4, [REMINDER])).toBeNull();
    expect(measureProblem(APOLOGY, 1, 4, [])).toMatch(/Điều 14/);
  });
});

describe('who may act', () => {
  it('lets only the principal and the homeroom teacher criticise or ask for a self-review', () => {
    expect(mayTakeMeasure(CRITICISM, Role.ADMIN, false)).toBe(true);
    expect(mayTakeMeasure(SELF_REVIEW, Role.TEACHER, true)).toBe(true);
    expect(mayTakeMeasure(CRITICISM, Role.TEACHER, false)).toBe(false);
    expect(mayTakeMeasure(SELF_REVIEW, Role.STAFF, false)).toBe(false);
    expect(mayTakeMeasure(REMINDER, Role.TEACHER, false)).toBe(true);
    expect(mayTakeMeasure(REMINDER, Role.PARENT, false)).toBe(false);
  });
  it('lets a teacher praise before the class or send a letter, and the office record the rest', () => {
    expect(mayGiveAward(AwardForm.CLASS_PRAISE, Role.TEACHER)).toBe(true);
    expect(mayGiveAward(AwardForm.LETTER, Role.TEACHER)).toBe(true);
    expect(mayGiveAward(AwardForm.PRINCIPAL_CERTIFICATE, Role.TEACHER)).toBe(false);
    expect(mayGiveAward(AwardForm.PRINCIPAL_CERTIFICATE, Role.STAFF)).toBe(true);
  });
});
