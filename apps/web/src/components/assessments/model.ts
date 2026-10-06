// Shapes of the question bank and test attempts as the API sends them, plus small
// helpers shared by the portal pages and the student app. The JSON shapes mirror
// apps/api/src/assessments/grading.ts.

export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'SHORT_ANSWER' | 'NUMERIC' | 'MATCHING' | 'ORDERING' | 'ESSAY';

export interface ChoiceOption {
  key: string;
  text: string;
}

export interface MatchingOptions {
  left: ChoiceOption[];
  right: ChoiceOption[];
}

/** A question as the student sees it: no answer key. */
export interface ShownQuestion {
  id: string;
  index?: number;
  type: QuestionType;
  content: string;
  options: unknown;
  points?: number;
}

export interface AttemptSummary {
  id: string;
  attemptNo: number;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED';
  score: number | null;
  maxScore: number;
  percent: number;
  submittedAt: string | null;
  durationSec: number | null;
  needsGrading: boolean;
}

export interface StudentRef {
  id: string;
  code: string;
  fullName: string;
  className: string | null;
}

export interface LeaderboardRow extends AttemptSummary {
  rank: number;
  student: StudentRef;
}

/** A test in the student app (GET /student/tests, /student/tests/:id, /student/contests). */
export interface StudentTest {
  id: string;
  kind: 'PRACTICE' | 'QUIZ' | 'EXAM' | 'CONTEST';
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  title: string;
  description: string | null;
  timeLimitMin: number | null;
  maxAttempts: number;
  passPercent: number | null;
  showResults: boolean;
  openAt: string | null;
  closeAt: string | null;
  course: { id: string; title: string } | null;
  subject: { id: string; code: string; name: string } | null;
  gradeLevel: number | null;
  questionCount: number;
  maxScore: number;
  myAttempts: AttemptSummary[];
  myBest: AttemptSummary | null;
  inProgressAttemptId: string | null;
  canStart: boolean;
  reason?: string;
}

export const choices = (options: unknown): ChoiceOption[] => (Array.isArray(options) ? (options as ChoiceOption[]) : []);
export const matching = (options: unknown): MatchingOptions => {
  const o = (options ?? {}) as Partial<MatchingOptions>;
  return { left: Array.isArray(o.left) ? o.left : [], right: Array.isArray(o.right) ? o.right : [] };
};

const rec = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});

/** The "___" blanks of a fill-in question. */
export const BLANK = /_{3,}/g;
export const countBlanks = (content: string) => (content.match(BLANK) ?? []).length;

/** "  Hà Nội " -> "ha noi", like the API's normalizeText, to colour fill-in answers. */
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

/** True when the student has given something for the question (used by the navigator). */
export function isAnswered(type: QuestionType, answer: unknown): boolean {
  if (answer === undefined || answer === null) return false;
  const a = rec(answer);
  switch (type) {
    case 'SINGLE_CHOICE':
      return !!a.key;
    case 'MULTIPLE_CHOICE':
      return Array.isArray(a.keys) && a.keys.length > 0;
    case 'TRUE_FALSE':
      return typeof a.value === 'boolean';
    case 'FILL_BLANK':
      return Array.isArray(a.blanks) && a.blanks.some((b: unknown) => String(b ?? '').trim());
    case 'SHORT_ANSWER':
    case 'ESSAY':
      return !!String(a.text ?? '').trim();
    case 'NUMERIC':
      return String(a.value ?? '').trim() !== '';
    case 'MATCHING':
      return Object.keys(rec(a.pairs)).length > 0;
    case 'ORDERING':
      return Array.isArray(a.order) && a.order.length > 0;
    default:
      return false;
  }
}

const optionText = (list: ChoiceOption[], key: unknown) => {
  const o = list.find((c) => c.key === key);
  return o ? `${o.key}. ${o.text}` : String(key ?? '');
};

/** One line describing an answer or an answer key, for tables and summaries. */
export function answerText(type: QuestionType, options: unknown, answer: unknown): string {
  if (answer === undefined || answer === null) return '';
  const a = rec(answer);
  switch (type) {
    case 'SINGLE_CHOICE':
      return optionText(choices(options), a.key);
    case 'MULTIPLE_CHOICE':
      return (Array.isArray(a.keys) ? a.keys : []).map((k: string) => optionText(choices(options), k)).join('; ');
    case 'TRUE_FALSE':
      return a.value === true ? 'Đúng' : a.value === false ? 'Sai' : '';
    case 'FILL_BLANK':
      return (Array.isArray(a.blanks) ? a.blanks : []).map((b: unknown) => (Array.isArray(b) ? b.join(' / ') : String(b ?? ''))).join(' | ');
    case 'SHORT_ANSWER':
      return Array.isArray(a.accepted) ? a.accepted.join(' / ') : String(a.text ?? '');
    case 'NUMERIC':
      return a.tolerance ? `${a.value} (± ${a.tolerance})` : String(a.value ?? '');
    case 'MATCHING': {
      const m = matching(options);
      return Object.entries(rec(a.pairs))
        .map(([l, r]) => `${m.left.find((x) => x.key === l)?.text ?? l} → ${m.right.find((x) => x.key === r)?.text ?? r}`)
        .join('; ');
    }
    case 'ORDERING':
      return (Array.isArray(a.order) ? a.order : []).map((k: string) => choices(options).find((c) => c.key === k)?.text ?? k).join(' → ');
    case 'ESSAY':
      return String(a.text ?? '');
    default:
      return '';
  }
}

/** Shuffles a copy of `list` so it differs from the given order whenever it can (used to store ordering items scrambled). */
export function scramble<T>(list: T[]): T[] {
  if (list.length < 2) return [...list];
  for (let tries = 0; tries < 10; tries++) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.some((x, i) => x !== list[i])) return out;
  }
  return [...list].reverse();
}

/** 9.5 -> "9,5"; scores keep up to two decimals. */
export const score = (n: number | null | undefined) => (n === null || n === undefined ? '—' : (Math.round(n * 100) / 100).toLocaleString('vi-VN'));

/** "12:05" from seconds; hours appear only when needed. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

export const DIFFICULTY_COLOR: Record<number, string> = { 1: 'green', 2: 'cyan', 3: 'blue', 4: 'geekblue', 5: 'purple', 6: 'magenta' };
export const KIND_COLOR: Record<string, string> = { PRACTICE: 'cyan', QUIZ: 'blue', EXAM: 'purple', CONTEST: 'gold' };
