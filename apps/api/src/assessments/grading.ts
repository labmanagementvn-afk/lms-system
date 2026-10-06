// Pure rules of the question bank and test attempts: answer shapes, auto-grading,
// deterministic shuffling and the "may the student start" checks. No database here.
//
// JSON shapes stored in Question.options / Question.answer and sent as a student answer:
//
//   SINGLE_CHOICE    options [{ key: 'A', text }]           answer { key }                    student { key }
//   MULTIPLE_CHOICE  options [{ key, text }]                answer { keys: string[] }         student { keys }     all-or-nothing (set equality)
//   TRUE_FALSE       options null                           answer { value: boolean }         student { value }
//   FILL_BLANK       content has "___" blanks in order      answer { blanks: string[][] }     student { blanks: string[] }   points × correct/total
//   SHORT_ANSWER     options null                           answer { accepted: string[] }     student { text }     all-or-nothing
//   NUMERIC          options null                           answer { value, tolerance? }      student { value }    |diff| <= tolerance (default 0)
//   MATCHING         options { left: [{ key, text }], right: [{ key, text }] }
//                                                           answer { pairs: { [leftKey]: rightKey } }  student { pairs }   points × correct/total
//   ORDERING         options [{ key, text }]                answer { order: string[] }        student { order }    all-or-nothing
//   ESSAY            options null                           answer null                       student { text }     graded by the teacher
//
// Text answers (FILL_BLANK, SHORT_ANSWER) are compared after trimming, lower-casing and
// stripping Vietnamese diacritics, so "Hà Nội" matches "ha noi".

import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';

export interface ChoiceOption {
  key: string;
  text: string;
}
export interface MatchingOptions {
  left: ChoiceOption[];
  right: ChoiceOption[];
}
export type QuestionOptions = ChoiceOption[] | MatchingOptions | null;

export type SingleChoiceAnswer = { key: string };
export type MultipleChoiceAnswer = { keys: string[] };
export type TrueFalseAnswer = { value: boolean };
export type FillBlankKey = { blanks: string[][] };
export type FillBlankAnswer = { blanks: string[] };
export type ShortAnswerKey = { accepted: string[] };
export type ShortAnswer = { text: string };
export type NumericKey = { value: number; tolerance?: number };
export type NumericAnswer = { value: number | string };
export type MatchingAnswer = { pairs: Record<string, string> };
export type OrderingAnswer = { order: string[] };
export type EssayAnswer = { text: string };

export type AnswerKey = SingleChoiceAnswer | MultipleChoiceAnswer | TrueFalseAnswer | FillBlankKey | ShortAnswerKey | NumericKey | MatchingAnswer | OrderingAnswer | null;
export type StudentAnswer = SingleChoiceAnswer | MultipleChoiceAnswer | TrueFalseAnswer | FillBlankAnswer | ShortAnswer | NumericAnswer | MatchingAnswer | OrderingAnswer | EssayAnswer;

export interface GradableQuestion {
  id: string;
  type: QuestionType;
  options: unknown;
  answer: unknown;
  points: number;
}

/** Grading of one question inside TestAttempt.grading. */
export interface GradeItem {
  points: number | null;
  max: number;
  correct: boolean | null;
  manual: boolean;
}

export interface AttemptGrade {
  grading: Record<string, GradeItem>;
  /** Sum of the auto-graded (and already manually graded) points. */
  score: number;
  maxScore: number;
  /** True while at least one question still waits for the teacher. */
  needsGrading: boolean;
}

/** Seconds after the deadline during which autosaves and submissions are still accepted. */
export const GRACE_MS = 30_000;

export const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- text and number normalisation ----

/** "  Hà Nội " -> "ha noi": trim, lower-case, strip diacritics (đ included) and collapse spaces. */
export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parses a number; strings may use a comma decimal ("3,5") and dot thousands ("1.000,5"). */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let s = value.replace(/\s+/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** true / "true" / "đúng" / "1" -> true; false / "false" / "sai" / "0" -> false; anything else -> null. */
export function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== 'string') return null;
  const s = normalizeText(value);
  if (['true', 'dung', 'd', '1', 'yes', 't'].includes(s)) return true;
  if (['false', 'sai', 's', '0', 'no', 'f'].includes(s)) return false;
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const stringArray = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null);

// ---- per-type grading ----

/** Share of the points earned for one auto-gradable question, 0..1. Malformed data scores 0, never throws. */
export function ratioFor(q: Pick<GradableQuestion, 'type' | 'options' | 'answer'>, student: unknown): number {
  const key = isRecord(q.answer) ? q.answer : {};
  const a = isRecord(student) ? student : {};
  switch (q.type) {
    case QuestionType.SINGLE_CHOICE: {
      const picked = typeof student === 'string' ? student : a.key;
      return typeof key.key === 'string' && picked === key.key ? 1 : 0;
    }
    case QuestionType.MULTIPLE_CHOICE: {
      const want = stringArray(key.keys);
      const got = stringArray(a.keys);
      if (!want || !got || !want.length) return 0;
      const ws = new Set(want);
      const gs = new Set(got);
      return ws.size === gs.size && [...ws].every((k) => gs.has(k)) ? 1 : 0;
    }
    case QuestionType.TRUE_FALSE: {
      const want = parseBoolean(key.value);
      const got = parseBoolean(typeof student === 'boolean' || typeof student === 'string' ? student : a.value);
      return want !== null && got === want ? 1 : 0;
    }
    case QuestionType.FILL_BLANK: {
      const blanks = Array.isArray(key.blanks) ? (key.blanks as unknown[]) : [];
      if (!blanks.length) return 0;
      const got = Array.isArray(a.blanks) ? (a.blanks as unknown[]) : [];
      let correct = 0;
      blanks.forEach((accepted, i) => {
        const list = stringArray(accepted) ?? [];
        if (list.map(normalizeText).includes(normalizeText(got[i]))) correct++;
      });
      return correct / blanks.length;
    }
    case QuestionType.SHORT_ANSWER: {
      const accepted = stringArray(key.accepted) ?? [];
      const text = typeof student === 'string' ? student : a.text;
      const got = normalizeText(text);
      return got && accepted.map(normalizeText).includes(got) ? 1 : 0;
    }
    case QuestionType.NUMERIC: {
      const want = parseNumber(key.value);
      const got = parseNumber(typeof student === 'number' || typeof student === 'string' ? student : a.value);
      if (want === null || got === null) return 0;
      const tolerance = Math.max(0, parseNumber(key.tolerance) ?? 0);
      return Math.abs(got - want) <= tolerance + 1e-9 ? 1 : 0;
    }
    case QuestionType.MATCHING: {
      const pairs = isRecord(key.pairs) ? key.pairs : {};
      const lefts = Object.keys(pairs);
      if (!lefts.length) return 0;
      const got = isRecord(a.pairs) ? a.pairs : {};
      const correct = lefts.filter((l) => got[l] === pairs[l]).length;
      return correct / lefts.length;
    }
    case QuestionType.ORDERING: {
      const want = stringArray(key.order);
      const got = stringArray(a.order);
      if (!want || !got || !want.length) return 0;
      return want.length === got.length && want.every((k, i) => got[i] === k) ? 1 : 0;
    }
    default:
      return 0;
  }
}

/** Grades one question; essays come back unscored and flagged for manual grading. */
export function gradeQuestion(q: GradableQuestion, student: unknown): GradeItem {
  const max = round2(Number(q.points) || 0);
  if (q.type === QuestionType.ESSAY) return { points: null, max, correct: null, manual: true };
  if (student === undefined || student === null) return { points: 0, max, correct: false, manual: false };
  const ratio = ratioFor(q, student);
  return { points: round2(max * ratio), max, correct: ratio >= 1, manual: false };
}

/** Grades a whole attempt. Missing answers score 0; `score` sums every graded question. */
export function gradeAttempt(questions: GradableQuestion[], answers: Record<string, unknown> | null | undefined): AttemptGrade {
  const grading: Record<string, GradeItem> = {};
  let score = 0;
  let maxScore = 0;
  let needsGrading = false;
  for (const q of questions) {
    const item = gradeQuestion(q, answers?.[q.id]);
    grading[q.id] = item;
    maxScore += item.max;
    if (item.points === null) needsGrading = true;
    else score += item.points;
  }
  return { grading, score: round2(score), maxScore: round2(maxScore), needsGrading };
}

/** TestAttempt.grading as stored (a JSON column) back into a typed map. */
export const asGrading = (v: unknown): Record<string, GradeItem> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, GradeItem>) : {});

/** Re-sums a grading after the teacher filled in manual points. */
export function summarizeGrading(grading: Record<string, GradeItem>): { score: number; maxScore: number; needsGrading: boolean } {
  let score = 0;
  let maxScore = 0;
  let needsGrading = false;
  for (const g of Object.values(grading)) {
    maxScore += g.max;
    if (g.points === null) needsGrading = true;
    else score += g.points;
  }
  return { score: round2(score), maxScore: round2(maxScore), needsGrading };
}

export const percentOf = (score: number | null | undefined, max: number) => (max > 0 ? Math.round(((score ?? 0) / max) * 1000) / 10 : 0);

// ---- deterministic shuffling ----

/** FNV-1a hash of a string into a 32-bit seed. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle driven by `seed`; the same seed always gives the same order. */
export function shuffle<T>(array: readonly T[], seed: number | string): T[] {
  const rnd = mulberry32(typeof seed === 'string' ? hashSeed(seed) : seed);
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Options as shown to one student: choices and ordering items shuffled, matching keeps the left column. */
export function shuffledOptions(question: { type: QuestionType; options: unknown }, seed: string): unknown {
  const o = question.options;
  switch (question.type) {
    case QuestionType.SINGLE_CHOICE:
    case QuestionType.MULTIPLE_CHOICE:
    case QuestionType.ORDERING:
      return Array.isArray(o) ? shuffle(o, seed) : o;
    case QuestionType.MATCHING:
      return isRecord(o) && Array.isArray(o.right) ? { ...o, right: shuffle(o.right, seed) } : o;
    default:
      return o;
  }
}

// ---- question validation (portal create / update / import) ----

const OPTION_TYPES = new Set<QuestionType>([QuestionType.SINGLE_CHOICE, QuestionType.MULTIPLE_CHOICE, QuestionType.ORDERING]);

function cleanChoices(raw: unknown, what: string): ChoiceOption[] {
  if (!Array.isArray(raw) || raw.length < 2) throw new BadRequestException(`${what} cần ít nhất 2 phương án`);
  const out: ChoiceOption[] = raw.map((o) => {
    const key = isRecord(o) && typeof o.key === 'string' ? o.key.trim() : '';
    const text = isRecord(o) && (typeof o.text === 'string' || typeof o.text === 'number') ? String(o.text).trim() : '';
    if (!key || !text) throw new BadRequestException(`${what}: mỗi phương án cần có mã và nội dung`);
    return { key, text };
  });
  if (new Set(out.map((o) => o.key)).size !== out.length) throw new BadRequestException(`${what}: mã phương án bị trùng`);
  return out;
}

const cleanStrings = (raw: unknown) => (Array.isArray(raw) ? raw.map((s) => String(s ?? '').trim()).filter(Boolean) : []);

/** Number of "___" blanks in a FILL_BLANK content. */
export const countBlanks = (content: string) => (content.match(/_{3,}/g) ?? []).length;

/**
 * Checks options and answer against the question type and returns them cleaned.
 * Throws a 400 with a Vietnamese message when the shape is wrong.
 */
export function validateQuestion(input: { type: QuestionType; content: string; options?: unknown; answer?: unknown }): { options: QuestionOptions; answer: AnswerKey } {
  const { type } = input;
  const answer = isRecord(input.answer) ? input.answer : {};
  if (OPTION_TYPES.has(type)) {
    const options = cleanChoices(input.options, 'Câu hỏi');
    const keys = new Set(options.map((o) => o.key));
    if (type === QuestionType.SINGLE_CHOICE) {
      const key = typeof answer.key === 'string' ? answer.key.trim() : '';
      if (!keys.has(key)) throw new BadRequestException('Đáp án đúng phải là một trong các phương án');
      return { options, answer: { key } };
    }
    if (type === QuestionType.MULTIPLE_CHOICE) {
      const picked = [...new Set(cleanStrings(answer.keys))];
      if (!picked.length) throw new BadRequestException('Cần chọn ít nhất một đáp án đúng');
      if (picked.some((k) => !keys.has(k))) throw new BadRequestException('Đáp án đúng không nằm trong các phương án');
      return { options, answer: { keys: picked } };
    }
    const order = cleanStrings(answer.order);
    if (order.length !== options.length || new Set(order).size !== order.length || order.some((k) => !keys.has(k))) {
      throw new BadRequestException('Thứ tự đúng phải chứa đúng các phương án, mỗi phương án một lần');
    }
    return { options, answer: { order } };
  }
  switch (type) {
    case QuestionType.TRUE_FALSE: {
      const value = parseBoolean(answer.value);
      if (value === null) throw new BadRequestException('Đáp án Đúng/Sai phải là true hoặc false');
      return { options: null, answer: { value } };
    }
    case QuestionType.FILL_BLANK: {
      const n = countBlanks(input.content ?? '');
      if (!n) throw new BadRequestException('Nội dung cần có ít nhất một chỗ trống "___"');
      const blanks = Array.isArray(answer.blanks) ? (answer.blanks as unknown[]).map(cleanStrings) : [];
      if (blanks.length !== n) throw new BadRequestException(`Số đáp án (${blanks.length}) phải bằng số chỗ trống (${n})`);
      if (blanks.some((b) => !b.length)) throw new BadRequestException('Mỗi chỗ trống cần ít nhất một đáp án được chấp nhận');
      return { options: null, answer: { blanks } };
    }
    case QuestionType.SHORT_ANSWER: {
      const accepted = cleanStrings(answer.accepted);
      if (!accepted.length) throw new BadRequestException('Cần ít nhất một đáp án được chấp nhận');
      return { options: null, answer: { accepted } };
    }
    case QuestionType.NUMERIC: {
      const value = parseNumber(answer.value);
      if (value === null) throw new BadRequestException('Đáp án số không hợp lệ');
      const tolerance = answer.tolerance === undefined || answer.tolerance === null || answer.tolerance === '' ? 0 : parseNumber(answer.tolerance);
      if (tolerance === null || tolerance < 0) throw new BadRequestException('Sai số cho phép phải là số không âm');
      return { options: null, answer: tolerance ? { value, tolerance } : { value } };
    }
    case QuestionType.MATCHING: {
      const raw = isRecord(input.options) ? input.options : {};
      const left = cleanChoices(raw.left, 'Cột trái');
      const right = cleanChoices(raw.right, 'Cột phải');
      const rightKeys = new Set(right.map((o) => o.key));
      const given = isRecord(answer.pairs) ? answer.pairs : {};
      const pairs: Record<string, string> = {};
      for (const l of left) {
        const r = typeof given[l.key] === 'string' ? (given[l.key] as string).trim() : '';
        if (!rightKeys.has(r)) throw new BadRequestException(`Mục "${l.text}" chưa được ghép với một mục bên phải`);
        pairs[l.key] = r;
      }
      return { options: { left, right }, answer: { pairs } };
    }
    case QuestionType.ESSAY:
      return { options: null, answer: null };
    default:
      throw new BadRequestException('Loại câu hỏi không hợp lệ');
  }
}

// ---- attempt rules ----

export interface StartableTest {
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  openAt: Date | null;
  closeAt: Date | null;
  maxAttempts: number;
}

/** Why a student may not start a new attempt right now, or null when they may. */
export function startBlockReason(test: StartableTest, finishedAttempts: number, now = new Date()): string | null {
  if (test.status === 'DRAFT') return 'Bài kiểm tra chưa được giao';
  if (test.status === 'CLOSED') return 'Bài kiểm tra đã đóng';
  if (test.openAt && now < test.openAt) return 'Chưa đến thời gian mở bài';
  if (test.closeAt && now > test.closeAt) return 'Đã hết hạn làm bài';
  if (finishedAttempts >= test.maxAttempts) return 'Đã hết số lần làm bài';
  return null;
}

/** When an attempt must be handed in: start + time limit, never later than the test's closeAt. */
export function attemptEndsAt(startedAt: Date, timeLimitMin: number | null, closeAt: Date | null): Date | null {
  const byLimit = timeLimitMin ? new Date(startedAt.getTime() + timeLimitMin * 60_000) : null;
  if (byLimit && closeAt) return byLimit < closeAt ? byLimit : closeAt;
  return byLimit ?? closeAt;
}

export const remainingSec = (endsAt: Date | null, now = new Date()) => (endsAt ? Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000)) : null);

/** True once the deadline plus the grace period has passed. */
export const pastGrace = (endsAt: Date | null, now = new Date()) => !!endsAt && now.getTime() > endsAt.getTime() + GRACE_MS;

/** First `max` characters of a question for tables and statistics. */
export const shortText = (s: string, max = 80) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
