import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import {
  attemptEndsAt,
  gradeAttempt,
  gradeQuestion,
  normalizeText,
  parseBoolean,
  parseNumber,
  pastGrace,
  remainingSec,
  shuffle,
  shuffledOptions,
  startBlockReason,
  summarizeGrading,
  validateQuestion,
} from './grading';

const abc = [
  { key: 'A', text: 'a' },
  { key: 'B', text: 'b' },
  { key: 'C', text: 'c' },
  { key: 'D', text: 'd' },
];
const q = (type: QuestionType, answer: unknown, options: unknown = null, points = 1, id = 'q') => ({ id, type, options, answer, points });

describe('normalisation', () => {
  it('strips Vietnamese diacritics, case and spacing', () => {
    expect(normalizeText('  Hà  Nội ')).toBe('ha noi');
    expect(normalizeText('Đà Nẵng')).toBe('da nang');
    expect(normalizeText('ĐƯỜNG')).toBe('duong');
    expect(normalizeText(null)).toBe('');
  });

  it('parses numbers with comma decimals', () => {
    expect(parseNumber('3,5')).toBe(3.5);
    expect(parseNumber('3.5')).toBe(3.5);
    expect(parseNumber('1.000,5')).toBe(1000.5);
    expect(parseNumber(' -2 ')).toBe(-2);
    expect(parseNumber(7)).toBe(7);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber(NaN)).toBeNull();
  });

  it('parses booleans in Vietnamese and English', () => {
    expect(parseBoolean(true)).toBe(true);
    expect(parseBoolean('Đúng')).toBe(true);
    expect(parseBoolean('sai')).toBe(false);
    expect(parseBoolean('false')).toBe(false);
    expect(parseBoolean('maybe')).toBeNull();
  });
});

describe('gradeQuestion', () => {
  it('SINGLE_CHOICE: full points or 0', () => {
    const question = q(QuestionType.SINGLE_CHOICE, { key: 'B' }, abc, 2);
    expect(gradeQuestion(question, { key: 'B' })).toEqual({ points: 2, max: 2, correct: true, manual: false });
    expect(gradeQuestion(question, { key: 'A' }).points).toBe(0);
    expect(gradeQuestion(question, undefined)).toEqual({ points: 0, max: 2, correct: false, manual: false });
  });

  it('MULTIPLE_CHOICE: all-or-nothing by set equality', () => {
    const question = q(QuestionType.MULTIPLE_CHOICE, { keys: ['A', 'C'] }, abc, 3);
    expect(gradeQuestion(question, { keys: ['C', 'A'] }).points).toBe(3);
    expect(gradeQuestion(question, { keys: ['A'] }).points).toBe(0);
    expect(gradeQuestion(question, { keys: ['A', 'C', 'D'] }).points).toBe(0);
    expect(gradeQuestion(question, { keys: 'A' }).points).toBe(0);
  });

  it('TRUE_FALSE accepts booleans and strings', () => {
    const question = q(QuestionType.TRUE_FALSE, { value: false });
    expect(gradeQuestion(question, { value: false }).correct).toBe(true);
    expect(gradeQuestion(question, { value: 'sai' }).correct).toBe(true);
    expect(gradeQuestion(question, { value: true }).correct).toBe(false);
  });

  it('FILL_BLANK: partial credit per blank with lenient text matching', () => {
    const question = q(QuestionType.FILL_BLANK, { blanks: [['Hà Nội'], ['4', 'bốn']] }, null, 2);
    expect(gradeQuestion(question, { blanks: ['ha noi', 'BỐN'] })).toEqual({ points: 2, max: 2, correct: true, manual: false });
    expect(gradeQuestion(question, { blanks: ['Huế', '4'] })).toEqual({ points: 1, max: 2, correct: false, manual: false });
    expect(gradeQuestion(question, { blanks: [] }).points).toBe(0);
  });

  it('FILL_BLANK rounds partial points to 2 decimals', () => {
    const question = q(QuestionType.FILL_BLANK, { blanks: [['a'], ['b'], ['c']] }, null, 1);
    expect(gradeQuestion(question, { blanks: ['a', 'x', 'x'] }).points).toBe(0.33);
  });

  it('SHORT_ANSWER: any accepted string, normalised', () => {
    const question = q(QuestionType.SHORT_ANSWER, { accepted: ['Thạch Sanh', 'thach sanh'] });
    expect(gradeQuestion(question, { text: ' THẠCH  SANH ' }).correct).toBe(true);
    expect(gradeQuestion(question, { text: 'Lý Thông' }).correct).toBe(false);
    expect(gradeQuestion(question, { text: '' }).correct).toBe(false);
  });

  it('NUMERIC: tolerance and comma decimals', () => {
    expect(gradeQuestion(q(QuestionType.NUMERIC, { value: 3.5 }), { value: '3,5' }).correct).toBe(true);
    expect(gradeQuestion(q(QuestionType.NUMERIC, { value: 3.5 }), { value: 3.51 }).correct).toBe(false);
    expect(gradeQuestion(q(QuestionType.NUMERIC, { value: 3.14, tolerance: 0.01 }), { value: 3.15 }).correct).toBe(true);
    expect(gradeQuestion(q(QuestionType.NUMERIC, { value: 3.14, tolerance: 0.01 }), { value: 3.16 }).correct).toBe(false);
    expect(gradeQuestion(q(QuestionType.NUMERIC, { value: 1 }), { value: 'x' }).correct).toBe(false);
  });

  it('MATCHING: points per correct pair', () => {
    const options = { left: [{ key: 'L1', text: '1/2' }, { key: 'L2', text: '1/4' }], right: [{ key: 'R1', text: '0,5' }, { key: 'R2', text: '0,25' }] };
    const question = q(QuestionType.MATCHING, { pairs: { L1: 'R1', L2: 'R2' } }, options, 4);
    expect(gradeQuestion(question, { pairs: { L1: 'R1', L2: 'R2' } }).points).toBe(4);
    expect(gradeQuestion(question, { pairs: { L1: 'R1', L2: 'R1' } })).toEqual({ points: 2, max: 4, correct: false, manual: false });
    expect(gradeQuestion(question, { pairs: {} }).points).toBe(0);
  });

  it('ORDERING: all-or-nothing', () => {
    const question = q(QuestionType.ORDERING, { order: ['C', 'A', 'B'] }, abc.slice(0, 3));
    expect(gradeQuestion(question, { order: ['C', 'A', 'B'] }).correct).toBe(true);
    expect(gradeQuestion(question, { order: ['A', 'B', 'C'] }).correct).toBe(false);
    expect(gradeQuestion(question, { order: ['C', 'A'] }).correct).toBe(false);
  });

  it('ESSAY needs manual grading', () => {
    expect(gradeQuestion(q(QuestionType.ESSAY, null, null, 5), { text: 'bài làm' })).toEqual({ points: null, max: 5, correct: null, manual: true });
  });

  it('never throws on malformed keys or answers', () => {
    expect(gradeQuestion(q(QuestionType.SINGLE_CHOICE, null, abc), 'B').points).toBe(0);
    expect(gradeQuestion(q(QuestionType.MATCHING, { pairs: 'x' }, {}), 42).points).toBe(0);
    expect(gradeQuestion(q(QuestionType.FILL_BLANK, { blanks: 'x' }), { blanks: 'y' }).points).toBe(0);
  });
});

describe('gradeAttempt', () => {
  const questions = [
    q(QuestionType.SINGLE_CHOICE, { key: 'A' }, abc, 1, 'q1'),
    q(QuestionType.NUMERIC, { value: 10 }, null, 2, 'q2'),
    q(QuestionType.FILL_BLANK, { blanks: [['x'], ['y']] }, null, 1, 'q3'),
    q(QuestionType.ESSAY, null, null, 3, 'q4'),
  ];

  it('sums auto points, reports max and flags essays', () => {
    const r = gradeAttempt(questions, { q1: { key: 'A' }, q2: { value: 10 }, q3: { blanks: ['x', 'no'] }, q4: { text: 'essay' } });
    expect(r.score).toBe(3.5);
    expect(r.maxScore).toBe(7);
    expect(r.needsGrading).toBe(true);
    expect(r.grading.q3).toEqual({ points: 0.5, max: 1, correct: false, manual: false });
    expect(r.grading.q4.points).toBeNull();
  });

  it('missing answers score 0 and no essay means no manual grading', () => {
    const r = gradeAttempt(questions.slice(0, 3), {});
    expect(r).toMatchObject({ score: 0, maxScore: 4, needsGrading: false });
    expect(gradeAttempt(questions.slice(0, 1), null).grading.q1.points).toBe(0);
  });

  it('summarizeGrading re-sums after manual points are filled', () => {
    const r = gradeAttempt(questions, { q1: { key: 'A' } });
    r.grading.q4 = { ...r.grading.q4, points: 2.5, correct: false };
    expect(summarizeGrading(r.grading)).toEqual({ score: 3.5, maxScore: 7, needsGrading: false });
  });
});

describe('shuffle', () => {
  it('is deterministic for a seed and keeps every element', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(items, 'attempt1:q1');
    expect(shuffle(items, 'attempt1:q1')).toEqual(a);
    expect([...a].sort()).toEqual([...items].sort());
    expect(shuffle(items, 'attempt1:q2')).not.toEqual(a);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('shuffledOptions touches only what the type allows', () => {
    const choices = shuffledOptions({ type: QuestionType.SINGLE_CHOICE, options: abc }, 'seed') as typeof abc;
    expect(choices.map((o) => o.key).sort()).toEqual(['A', 'B', 'C', 'D']);
    const matching = shuffledOptions({ type: QuestionType.MATCHING, options: { left: abc.slice(0, 2), right: abc.slice(2) } }, 'seed') as { left: unknown; right: unknown[] };
    expect(matching.left).toEqual(abc.slice(0, 2));
    expect(matching.right).toHaveLength(2);
    expect(shuffledOptions({ type: QuestionType.TRUE_FALSE, options: null }, 'seed')).toBeNull();
  });
});

describe('validateQuestion', () => {
  const bad = (input: Parameters<typeof validateQuestion>[0]) => expect(() => validateQuestion(input)).toThrow(BadRequestException);

  it('accepts and cleans every type', () => {
    expect(validateQuestion({ type: QuestionType.SINGLE_CHOICE, content: 'c', options: abc, answer: { key: ' B ' } }).answer).toEqual({ key: 'B' });
    expect(validateQuestion({ type: QuestionType.MULTIPLE_CHOICE, content: 'c', options: abc, answer: { keys: ['A', 'A', 'C'] } }).answer).toEqual({ keys: ['A', 'C'] });
    expect(validateQuestion({ type: QuestionType.TRUE_FALSE, content: 'c', answer: { value: 'đúng' } })).toEqual({ options: null, answer: { value: true } });
    expect(validateQuestion({ type: QuestionType.FILL_BLANK, content: '1 + ___ = ___', answer: { blanks: [['1'], ['2', ' hai ']] } }).answer).toEqual({ blanks: [['1'], ['2', 'hai']] });
    expect(validateQuestion({ type: QuestionType.SHORT_ANSWER, content: 'c', answer: { accepted: ['x', ''] } }).answer).toEqual({ accepted: ['x'] });
    expect(validateQuestion({ type: QuestionType.NUMERIC, content: 'c', answer: { value: '3,5', tolerance: '0,1' } }).answer).toEqual({ value: 3.5, tolerance: 0.1 });
    expect(validateQuestion({ type: QuestionType.NUMERIC, content: 'c', answer: { value: 2 } }).answer).toEqual({ value: 2 });
    const m = validateQuestion({ type: QuestionType.MATCHING, content: 'c', options: { left: abc.slice(0, 2), right: abc.slice(2) }, answer: { pairs: { A: 'C', B: 'D' } } });
    expect(m.answer).toEqual({ pairs: { A: 'C', B: 'D' } });
    expect(validateQuestion({ type: QuestionType.ORDERING, content: 'c', options: abc.slice(0, 3), answer: { order: ['C', 'A', 'B'] } }).answer).toEqual({ order: ['C', 'A', 'B'] });
    expect(validateQuestion({ type: QuestionType.ESSAY, content: 'c', options: abc, answer: { key: 'A' } })).toEqual({ options: null, answer: null });
  });

  it('rejects wrong shapes with a 400', () => {
    bad({ type: QuestionType.SINGLE_CHOICE, content: 'c', options: abc.slice(0, 1), answer: { key: 'A' } });
    bad({ type: QuestionType.SINGLE_CHOICE, content: 'c', options: abc, answer: { key: 'Z' } });
    bad({ type: QuestionType.SINGLE_CHOICE, content: 'c', options: [...abc, { key: 'A', text: 'dup' }], answer: { key: 'A' } });
    bad({ type: QuestionType.SINGLE_CHOICE, content: 'c', options: [{ key: 'A' }, { key: 'B', text: 'b' }], answer: { key: 'A' } });
    bad({ type: QuestionType.MULTIPLE_CHOICE, content: 'c', options: abc, answer: { keys: [] } });
    bad({ type: QuestionType.MULTIPLE_CHOICE, content: 'c', options: abc, answer: { keys: ['A', 'Z'] } });
    bad({ type: QuestionType.TRUE_FALSE, content: 'c', answer: { value: 'maybe' } });
    bad({ type: QuestionType.FILL_BLANK, content: 'no blanks', answer: { blanks: [['1']] } });
    bad({ type: QuestionType.FILL_BLANK, content: '___ and ___', answer: { blanks: [['1']] } });
    bad({ type: QuestionType.FILL_BLANK, content: '___', answer: { blanks: [[]] } });
    bad({ type: QuestionType.SHORT_ANSWER, content: 'c', answer: { accepted: [] } });
    bad({ type: QuestionType.NUMERIC, content: 'c', answer: { value: 'abc' } });
    bad({ type: QuestionType.NUMERIC, content: 'c', answer: { value: 1, tolerance: -1 } });
    bad({ type: QuestionType.MATCHING, content: 'c', options: { left: abc.slice(0, 2), right: abc.slice(2) }, answer: { pairs: { A: 'C' } } });
    bad({ type: QuestionType.MATCHING, content: 'c', options: { left: abc.slice(0, 1), right: abc.slice(2) }, answer: { pairs: { A: 'C' } } });
    bad({ type: QuestionType.ORDERING, content: 'c', options: abc.slice(0, 3), answer: { order: ['A', 'B'] } });
    bad({ type: QuestionType.ORDERING, content: 'c', options: abc.slice(0, 3), answer: { order: ['A', 'A', 'B'] } });
  });
});

describe('attempt rules', () => {
  const now = new Date('2026-10-05T08:00:00Z');
  const base = { status: 'PUBLISHED' as const, openAt: null, closeAt: null, maxAttempts: 2 };

  it('startBlockReason covers status, window and attempt count', () => {
    expect(startBlockReason(base, 0, now)).toBeNull();
    expect(startBlockReason(base, 1, now)).toBeNull();
    expect(startBlockReason(base, 2, now)).toMatch(/số lần/);
    expect(startBlockReason({ ...base, status: 'DRAFT' }, 0, now)).toMatch(/chưa được giao/);
    expect(startBlockReason({ ...base, status: 'CLOSED' }, 0, now)).toMatch(/đã đóng/);
    expect(startBlockReason({ ...base, openAt: new Date('2026-10-06T00:00:00Z') }, 0, now)).toMatch(/Chưa đến/);
    expect(startBlockReason({ ...base, closeAt: new Date('2026-10-04T00:00:00Z') }, 0, now)).toMatch(/hết hạn/);
    expect(startBlockReason({ ...base, openAt: new Date('2026-10-04T00:00:00Z'), closeAt: new Date('2026-10-06T00:00:00Z') }, 0, now)).toBeNull();
  });

  it('attemptEndsAt is the earlier of start + limit and closeAt', () => {
    expect(attemptEndsAt(now, 15, null)).toEqual(new Date('2026-10-05T08:15:00Z'));
    expect(attemptEndsAt(now, null, null)).toBeNull();
    const close = new Date('2026-10-05T08:10:00Z');
    expect(attemptEndsAt(now, 15, close)).toEqual(close);
    expect(attemptEndsAt(now, null, close)).toEqual(close);
    expect(attemptEndsAt(now, 5, close)).toEqual(new Date('2026-10-05T08:05:00Z'));
  });

  it('remainingSec and pastGrace', () => {
    const ends = new Date('2026-10-05T08:15:00Z');
    expect(remainingSec(ends, now)).toBe(900);
    expect(remainingSec(ends, new Date('2026-10-05T09:00:00Z'))).toBe(0);
    expect(remainingSec(null, now)).toBeNull();
    expect(pastGrace(ends, new Date('2026-10-05T08:15:20Z'))).toBe(false);
    expect(pastGrace(ends, new Date('2026-10-05T08:15:31Z'))).toBe(true);
    expect(pastGrace(null, now)).toBe(false);
  });
});
