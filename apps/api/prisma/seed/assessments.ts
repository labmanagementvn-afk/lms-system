import { AttemptStatus, Prisma, PrismaClient, QuestionType, TestKind, TestStatus } from '@prisma/client';
import { AnswerKey, ChoiceOption, GradeItem, gradeAttempt, QuestionOptions, round2, shuffle, summarizeGrading, validateQuestion } from '../../src/assessments/grading';
import { SeedContext } from './context';

// Demo question bank (grade 6), one published quiz for 6A1 with graded attempts,
// a school-wide contest, a draft mid-term exam and an open practice test (no attempts)
// that the demo student can start.

type Spec = { subject: 'TOAN' | 'VAN' | 'ANH' | 'KHTN'; type: QuestionType; difficulty: number; content: string; options?: unknown; answer?: unknown; explanation?: string; tags: string[] };

const choices = (...texts: string[]): ChoiceOption[] => texts.map((text, i) => ({ key: String.fromCharCode(65 + i), text }));
const TEACHER_OF: Record<Spec['subject'], string> = { TOAN: 'GV001', VAN: 'GV002', ANH: 'GV003', KHTN: 'GV004' };

const QUESTIONS: Spec[] = [
  // ---- Toán (16) ----
  { subject: 'TOAN', type: 'SINGLE_CHOICE', difficulty: 1, content: 'Phân số nào dưới đây bằng 1/2?', options: choices('2/4', '2/3', '3/5', '1/3'), answer: { key: 'A' }, explanation: '2/4 rút gọn cho 2 được 1/2.', tags: ['chương 1', 'phân số'] },
  { subject: 'TOAN', type: 'SINGLE_CHOICE', difficulty: 2, content: 'Kết quả của phép tính 1/2 + 1/3 là', options: choices('2/5', '5/6', '1/6', '3/5'), answer: { key: 'B' }, explanation: 'Quy đồng mẫu 6: 3/6 + 2/6 = 5/6.', tags: ['chương 1', 'phân số'] },
  { subject: 'TOAN', type: 'MULTIPLE_CHOICE', difficulty: 2, content: 'Những phân số nào nhỏ hơn 1?', options: choices('3/4', '5/4', '7/8', '9/9'), answer: { keys: ['A', 'C'] }, explanation: 'Phân số nhỏ hơn 1 khi tử nhỏ hơn mẫu.', tags: ['phân số'] },
  { subject: 'TOAN', type: 'TRUE_FALSE', difficulty: 1, content: 'Phân số 3/4 lớn hơn phân số 2/3.', answer: { value: true }, explanation: '3/4 = 9/12 > 8/12 = 2/3.', tags: ['phân số'] },
  { subject: 'TOAN', type: 'TRUE_FALSE', difficulty: 2, content: 'Số 0 là số nguyên tố.', answer: { value: false }, explanation: 'Số nguyên tố là số tự nhiên lớn hơn 1 chỉ có hai ước là 1 và chính nó.', tags: ['số tự nhiên'] },
  { subject: 'TOAN', type: 'FILL_BLANK', difficulty: 2, content: 'Rút gọn phân số 6/8 ta được phân số tối giản ___.', answer: { blanks: [['3/4']] }, tags: ['phân số'] },
  { subject: 'TOAN', type: 'FILL_BLANK', difficulty: 3, content: 'Số đối của 5 là ___ và số đối của -3 là ___.', answer: { blanks: [['-5'], ['3', '+3']] }, tags: ['số nguyên'] },
  { subject: 'TOAN', type: 'SHORT_ANSWER', difficulty: 1, content: 'Số tự nhiên nhỏ nhất có hai chữ số là số nào?', answer: { accepted: ['10', 'mười'] }, tags: ['số tự nhiên'] },
  { subject: 'TOAN', type: 'NUMERIC', difficulty: 2, content: 'Tính 3/4 của 80.', answer: { value: 60 }, explanation: '80 × 3/4 = 60.', tags: ['phân số'] },
  { subject: 'TOAN', type: 'NUMERIC', difficulty: 3, content: 'Tính giá trị biểu thức 2³ · 5 − 12 : 4.', answer: { value: 37 }, explanation: '8 · 5 − 3 = 37.', tags: ['số tự nhiên', 'lũy thừa'] },
  {
    subject: 'TOAN',
    type: 'MATCHING',
    difficulty: 2,
    content: 'Ghép mỗi phân số với số thập phân tương ứng.',
    options: { left: [{ key: 'L1', text: '1/2' }, { key: 'L2', text: '1/4' }, { key: 'L3', text: '3/5' }, { key: 'L4', text: '1/5' }], right: [{ key: 'R1', text: '0,5' }, { key: 'R2', text: '0,25' }, { key: 'R3', text: '0,6' }, { key: 'R4', text: '0,2' }] },
    answer: { pairs: { L1: 'R1', L2: 'R2', L3: 'R3', L4: 'R4' } },
    tags: ['phân số', 'số thập phân'],
  },
  { subject: 'TOAN', type: 'ORDERING', difficulty: 3, content: 'Sắp xếp các phân số theo thứ tự tăng dần.', options: choices('3/4', '1/2', '5/8', '1/4'), answer: { order: ['D', 'B', 'C', 'A'] }, explanation: '1/4 < 1/2 < 5/8 < 3/4 (quy đồng mẫu 8).', tags: ['phân số'] },
  {
    subject: 'TOAN',
    type: 'ORDERING',
    difficulty: 2,
    content: 'Sắp xếp các bước tìm BCNN của hai số theo đúng thứ tự.',
    options: choices('Lập tích các thừa số đã chọn, mỗi thừa số lấy số mũ lớn nhất', 'Phân tích mỗi số ra thừa số nguyên tố', 'Chọn ra các thừa số nguyên tố chung và riêng'),
    answer: { order: ['B', 'C', 'A'] },
    tags: ['số tự nhiên', 'BCNN'],
  },
  { subject: 'TOAN', type: 'SINGLE_CHOICE', difficulty: 4, content: 'Một lớp có 40 học sinh, trong đó 3/8 số học sinh là nữ. Số học sinh nam của lớp là', options: choices('15', '25', '24', '16'), answer: { key: 'B' }, explanation: 'Nữ: 40 × 3/8 = 15; nam: 40 − 15 = 25.', tags: ['phân số', 'bài toán thực tế'] },
  { subject: 'TOAN', type: 'MULTIPLE_CHOICE', difficulty: 4, content: 'Số nào chia hết cho cả 2, 3 và 5?', options: choices('30', '45', '60', '75'), answer: { keys: ['A', 'C'] }, explanation: 'Chia hết cho 2, 3, 5 nghĩa là chia hết cho 30.', tags: ['số tự nhiên', 'dấu hiệu chia hết'] },
  { subject: 'TOAN', type: 'ESSAY', difficulty: 5, content: 'Trình bày cách quy đồng mẫu số hai phân số 2/3 và 3/4, rồi so sánh hai phân số đó.', tags: ['phân số'] },
  // ---- Ngữ văn (8) ----
  { subject: 'VAN', type: 'SINGLE_CHOICE', difficulty: 1, content: 'Truyện "Thạch Sanh" thuộc thể loại nào?', options: choices('Truyện cổ tích', 'Truyện ngụ ngôn', 'Truyền thuyết', 'Truyện cười'), answer: { key: 'A' }, tags: ['truyện cổ tích'] },
  { subject: 'VAN', type: 'SINGLE_CHOICE', difficulty: 2, content: 'Nhân vật Lý Thông trong truyện "Thạch Sanh" tiêu biểu cho', options: choices('lòng dũng cảm', 'sự gian xảo, bội bạc', 'lòng hiếu thảo', 'trí thông minh'), answer: { key: 'B' }, tags: ['truyện cổ tích'] },
  { subject: 'VAN', type: 'MULTIPLE_CHOICE', difficulty: 2, content: 'Những tác phẩm nào dưới đây là truyện cổ tích?', options: choices('Thạch Sanh', 'Sơn Tinh, Thủy Tinh', 'Em bé thông minh', 'Thánh Gióng'), answer: { keys: ['A', 'C'] }, explanation: 'Sơn Tinh, Thủy Tinh và Thánh Gióng là truyền thuyết.', tags: ['truyện cổ tích'] },
  { subject: 'VAN', type: 'TRUE_FALSE', difficulty: 1, content: 'Truyện cổ tích thường có yếu tố kì ảo, hoang đường.', answer: { value: true }, tags: ['truyện cổ tích'] },
  { subject: 'VAN', type: 'FILL_BLANK', difficulty: 2, content: 'Danh từ là những từ chỉ ___, sự vật, hiện tượng, khái niệm.', answer: { blanks: [['người', 'con người']] }, tags: ['từ loại'] },
  { subject: 'VAN', type: 'SHORT_ANSWER', difficulty: 3, content: 'Trong câu "Mặt trời mọc ở đằng đông", chủ ngữ là từ nào?', answer: { accepted: ['mặt trời'] }, tags: ['ngữ pháp'] },
  { subject: 'VAN', type: 'ESSAY', difficulty: 5, content: 'Viết đoạn văn (5–7 câu) nêu cảm nghĩ của em về nhân vật Thạch Sanh.', tags: ['truyện cổ tích', 'viết'] },
  { subject: 'VAN', type: 'ESSAY', difficulty: 6, content: 'Kể lại một truyện cổ tích em yêu thích bằng lời văn của em, trong đó có sáng tạo một kết thúc khác.', tags: ['truyện cổ tích', 'viết'] },
  // ---- Tiếng Anh (8) ----
  { subject: 'ANH', type: 'SINGLE_CHOICE', difficulty: 1, content: 'Choose the correct word: She ___ a student.', options: choices('am', 'is', 'are', 'be'), answer: { key: 'B' }, tags: ['ngữ pháp', 'Unit 1'] },
  { subject: 'ANH', type: 'SINGLE_CHOICE', difficulty: 2, content: 'My friend ___ football every Sunday.', options: choices('play', 'plays', 'playing', 'played'), answer: { key: 'B' }, explanation: 'Present simple, third person singular adds -s.', tags: ['ngữ pháp', 'Unit 3'] },
  { subject: 'ANH', type: 'MULTIPLE_CHOICE', difficulty: 2, content: 'Which words are adjectives?', options: choices('happy', 'quickly', 'tall', 'run'), answer: { keys: ['A', 'C'] }, tags: ['từ vựng', 'Unit 3'] },
  { subject: 'ANH', type: 'TRUE_FALSE', difficulty: 1, content: '"Children" is the plural of "child".', answer: { value: true }, tags: ['ngữ pháp'] },
  { subject: 'ANH', type: 'FILL_BLANK', difficulty: 2, content: 'There ___ two books on the table and there ___ a pen.', answer: { blanks: [['are'], ['is']] }, tags: ['ngữ pháp', 'Unit 2'] },
  { subject: 'ANH', type: 'SHORT_ANSWER', difficulty: 1, content: 'What is the opposite of "big"?', answer: { accepted: ['small', 'little'] }, tags: ['từ vựng'] },
  {
    subject: 'ANH',
    type: 'MATCHING',
    difficulty: 2,
    content: 'Match each word with its Vietnamese meaning.',
    options: { left: [{ key: 'L1', text: 'teacher' }, { key: 'L2', text: 'library' }, { key: 'L3', text: 'lunch' }, { key: 'L4', text: 'bicycle' }], right: [{ key: 'R1', text: 'giáo viên' }, { key: 'R2', text: 'thư viện' }, { key: 'R3', text: 'bữa trưa' }, { key: 'R4', text: 'xe đạp' }] },
    answer: { pairs: { L1: 'R1', L2: 'R2', L3: 'R3', L4: 'R4' } },
    tags: ['từ vựng', 'Unit 1'],
  },
  { subject: 'ANH', type: 'ORDERING', difficulty: 3, content: 'Put the words in the correct order to make a sentence.', options: choices('is', 'My', 'kind', 'teacher'), answer: { order: ['B', 'D', 'A', 'C'] }, explanation: 'My teacher is kind.', tags: ['ngữ pháp'] },
  // ---- Khoa học tự nhiên (8) ----
  { subject: 'KHTN', type: 'SINGLE_CHOICE', difficulty: 1, content: 'Đơn vị cơ bản cấu tạo nên cơ thể sống là', options: choices('mô', 'tế bào', 'cơ quan', 'hệ cơ quan'), answer: { key: 'B' }, tags: ['tế bào'] },
  { subject: 'KHTN', type: 'SINGLE_CHOICE', difficulty: 2, content: 'Bộ phận nào của tế bào thực vật thực hiện quang hợp?', options: choices('Nhân', 'Màng tế bào', 'Lục lạp', 'Không bào'), answer: { key: 'C' }, tags: ['tế bào'] },
  { subject: 'KHTN', type: 'MULTIPLE_CHOICE', difficulty: 3, content: 'Những thành phần nào có ở cả tế bào động vật và tế bào thực vật?', options: choices('Màng tế bào', 'Thành tế bào', 'Tế bào chất', 'Lục lạp'), answer: { keys: ['A', 'C'] }, explanation: 'Thành tế bào và lục lạp chỉ có ở tế bào thực vật.', tags: ['tế bào'] },
  { subject: 'KHTN', type: 'TRUE_FALSE', difficulty: 1, content: 'Chất ở thể rắn có hình dạng xác định.', answer: { value: true }, tags: ['vật chất'] },
  { subject: 'KHTN', type: 'NUMERIC', difficulty: 2, content: 'Ở điều kiện thường, nước sôi ở bao nhiêu độ C?', answer: { value: 100 }, tags: ['vật chất'] },
  { subject: 'KHTN', type: 'NUMERIC', difficulty: 3, content: 'Một vật có khối lượng 2 kg. Trọng lượng của vật là bao nhiêu niutơn? (lấy g = 10 m/s²)', answer: { value: 20 }, explanation: 'P = 10 · m = 20 N.', tags: ['lực'] },
  {
    subject: 'KHTN',
    type: 'MATCHING',
    difficulty: 2,
    content: 'Ghép dụng cụ đo với đại lượng đo tương ứng.',
    options: { left: [{ key: 'L1', text: 'Cân' }, { key: 'L2', text: 'Thước' }, { key: 'L3', text: 'Nhiệt kế' }, { key: 'L4', text: 'Đồng hồ' }], right: [{ key: 'R1', text: 'Khối lượng' }, { key: 'R2', text: 'Chiều dài' }, { key: 'R3', text: 'Nhiệt độ' }, { key: 'R4', text: 'Thời gian' }] },
    answer: { pairs: { L1: 'R1', L2: 'R2', L3: 'R3', L4: 'R4' } },
    tags: ['đo lường'],
  },
  { subject: 'KHTN', type: 'SHORT_ANSWER', difficulty: 2, content: 'Quá trình chất chuyển từ thể lỏng sang thể khí gọi là gì?', answer: { accepted: ['bay hơi', 'sự bay hơi'] }, tags: ['vật chất'] },
];

type Bank = { id: string; type: QuestionType; options: QuestionOptions; answer: AnswerKey; points: number };

/** A deterministic answer: right, partly right or wrong depending on the student's "skill" and the question. */
function answerFor(q: Bank, studentIdx: number, qIdx: number): unknown {
  const roll = (studentIdx * 31 + qIdx * 17 + 5) % 10;
  const skill = 4 + (studentIdx % 6); // 4..9 of 10
  if (roll === 9 && studentIdx % 3 === 1) return undefined; // left blank
  const right = roll < skill;
  const key = (q.answer ?? {}) as Record<string, any>;
  switch (q.type) {
    case 'SINGLE_CHOICE': {
      const opts = q.options as ChoiceOption[];
      return { key: right ? key.key : opts.find((o) => o.key !== key.key)!.key };
    }
    case 'MULTIPLE_CHOICE':
      return { keys: right ? key.keys : [key.keys[0]] };
    case 'TRUE_FALSE':
      return { value: right ? key.value : !key.value };
    case 'FILL_BLANK':
      return { blanks: (key.blanks as string[][]).map((b, i) => (right || i === 0 ? b[0] : 'không nhớ')) };
    case 'SHORT_ANSWER':
      return { text: right ? key.accepted[0] : 'không biết' };
    case 'NUMERIC':
      return { value: right ? key.value : key.value + 1 };
    case 'MATCHING': {
      const pairs = key.pairs as Record<string, string>;
      const lefts = Object.keys(pairs);
      const rights = lefts.map((l) => pairs[l]);
      return { pairs: Object.fromEntries(lefts.map((l, i) => [l, right ? pairs[l] : rights[(i + 1) % rights.length]])) };
    }
    case 'ORDERING':
      return { order: right ? key.order : [...key.order].reverse() };
    case 'ESSAY':
      return { text: right ? 'Quy đồng mẫu số chung là 12: 2/3 = 8/12, 3/4 = 9/12. Vì 8/12 < 9/12 nên 2/3 < 3/4.' : 'Em quy đồng rồi so sánh tử số.' };
    default:
      return undefined;
  }
}

export async function seedAssessments(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId } = ctx;
  const now = Date.now();
  const DAY = 86_400_000;

  // ---- question bank ----
  const data: Prisma.QuestionCreateManyInput[] = QUESTIONS.map((s) => {
    const { options, answer } = validateQuestion({ type: s.type, content: s.content, options: s.options, answer: s.answer });
    return {
      schoolId,
      subjectId: ctx.subjects[s.subject],
      gradeLevel: 6,
      type: s.type,
      difficulty: s.difficulty,
      content: s.content,
      options: options === null ? Prisma.JsonNull : (options as unknown as Prisma.InputJsonValue),
      answer: answer === null ? Prisma.JsonNull : (answer as unknown as Prisma.InputJsonValue),
      explanation: s.explanation ?? null,
      tags: s.tags,
      createdById: ctx.teacherUsers[TEACHER_OF[s.subject]],
    };
  });
  const created = await prisma.question.createManyAndReturn({ data, select: { id: true, content: true, type: true, options: true, answer: true, subjectId: true, difficulty: true } });
  const byContent = new Map(created.map((q) => [q.content, q]));
  const bank = (s: Spec, points: number): Bank => {
    const q = byContent.get(s.content)!;
    return { id: q.id, type: q.type, options: q.options as QuestionOptions, answer: q.answer as AnswerKey, points };
  };
  const toan = QUESTIONS.filter((s) => s.subject === 'TOAN');
  const van = QUESTIONS.filter((s) => s.subject === 'VAN');

  // ---- (1) 15-minute quiz for 6A1: 9 objective questions + 1 essay, 1 point each ----
  const quizSpecs = [toan[0], toan[1], toan[2], toan[3], toan[5], toan[8], toan[10], toan[11], toan[13], toan[15]];
  const quizQuestions = quizSpecs.map((s) => bank(s, 1));
  const quiz = await prisma.test.create({
    data: {
      schoolId,
      subjectId: ctx.subjects.TOAN,
      gradeLevel: 6,
      kind: TestKind.QUIZ,
      title: 'Kiểm tra 15 phút – Phân số',
      description: 'Ôn tập chương 1: phân số, so sánh và các phép tính với phân số.',
      status: TestStatus.PUBLISHED,
      timeLimitMin: 15,
      maxAttempts: 2,
      shuffleQuestions: true,
      shuffleOptions: true,
      showResults: true,
      passPercent: 50,
      closeAt: new Date(now + 7 * DAY),
      classIds: [ctx.classes['6A1']],
      createdById: ctx.teacherUsers.GV001,
      questions: { create: quizQuestions.map((q, sortOrder) => ({ questionId: q.id, points: q.points, sortOrder })) },
    },
  });

  const attempts: Prisma.TestAttemptCreateManyInput[] = [];
  const buildAttempt = (test: { id: string; shuffleQuestions: boolean }, questions: Bank[], studentIdx: number, attemptNo: number, finishedAgoMs: number, grader?: string) => {
    const studentId = ctx.studentIds[studentIdx];
    const order = test.shuffleQuestions ? shuffle(questions.map((q) => q.id), `${test.id}:${studentId}:${attemptNo}`) : questions.map((q) => q.id);
    const answers: Record<string, unknown> = {};
    questions.forEach((q, i) => {
      const a = answerFor(q, studentIdx + attemptNo * 7, i);
      if (a !== undefined) answers[q.id] = a;
    });
    const result = gradeAttempt(questions, answers);
    const grading: Record<string, GradeItem> = { ...result.grading };
    let { score, needsGrading } = result;
    if (grader && needsGrading) {
      // The teacher graded the essay already.
      for (const [qid, g] of Object.entries(grading)) {
        if (g.points === null) grading[qid] = { ...g, points: round2(g.max * [1, 0.5, 0.75][studentIdx % 3]), correct: studentIdx % 3 === 0, manual: true };
      }
      ({ score, needsGrading } = summarizeGrading(grading));
    }
    const durationSec = 300 + ((studentIdx * 97 + attemptNo * 53) % 500);
    const submittedAt = new Date(now - finishedAgoMs);
    attempts.push({
      testId: test.id,
      studentId,
      attemptNo,
      status: needsGrading ? AttemptStatus.SUBMITTED : AttemptStatus.GRADED,
      startedAt: new Date(submittedAt.getTime() - durationSec * 1000),
      submittedAt,
      questionOrder: order,
      answers: answers as Prisma.InputJsonValue,
      grading: grading as unknown as Prisma.InputJsonValue,
      score,
      maxScore: result.maxScore,
      needsGrading,
      durationSec,
      gradedById: needsGrading ? null : (grader ?? null),
      gradedAt: needsGrading ? null : new Date(submittedAt.getTime() + 3 * 3_600_000),
    });
  };
  // Six 6A1 students graded (the first one used both attempts), a seventh still waiting for the essay mark.
  for (let i = 0; i < 6; i++) buildAttempt(quiz, quizQuestions, i, 1, (i % 4) * DAY + (i + 1) * 3_600_000, ctx.teacherUsers.GV001);
  buildAttempt(quiz, quizQuestions, 0, 2, 2 * 3_600_000, ctx.teacherUsers.GV001);
  buildAttempt(quiz, quizQuestions, 6, 1, 5 * 3_600_000);

  // ---- (2) school-wide contest: the 15 objective Toán questions, harder ones worth more ----
  const contestQuestions = toan.filter((s) => s.type !== 'ESSAY').map((s) => bank(s, s.difficulty >= 3 ? 2 : 1));
  const contest = await prisma.test.create({
    data: {
      schoolId,
      subjectId: ctx.subjects.TOAN,
      gradeLevel: 6,
      kind: TestKind.CONTEST,
      title: 'Olympic Toán tháng 10',
      description: 'Cuộc thi toàn trường, mỗi học sinh làm một lần trong 30 phút. Xếp hạng theo điểm, rồi theo thời gian làm bài.',
      status: TestStatus.PUBLISHED,
      timeLimitMin: 30,
      maxAttempts: 1,
      shuffleQuestions: true,
      shuffleOptions: true,
      showResults: true,
      passPercent: 60,
      openAt: new Date(now - 2 * DAY),
      closeAt: new Date(now + 10 * DAY),
      classIds: [],
      createdById: ctx.teacherUsers.GV001,
      questions: { create: contestQuestions.map((q, sortOrder) => ({ questionId: q.id, points: q.points, sortOrder })) },
    },
  });
  for (const i of [0, 1, 2, 10, 11, 12, 13, 20, 21, 22]) buildAttempt(contest, contestQuestions, i, 1, (i % 2) * DAY + ((i * 5) % 20) * 3_600_000);

  await prisma.testAttempt.createMany({ data: attempts });

  // ---- (3) draft mid-term exam for Ngữ văn, 6A1 and 6A2 ----
  await prisma.test.create({
    data: {
      schoolId,
      subjectId: ctx.subjects.VAN,
      gradeLevel: 6,
      kind: TestKind.EXAM,
      title: 'Kiểm tra giữa kỳ 1 – Ngữ văn',
      description: 'Phần trắc nghiệm 4 điểm, phần tự luận 6 điểm.',
      status: TestStatus.DRAFT,
      timeLimitMin: 90,
      maxAttempts: 1,
      shuffleQuestions: false,
      shuffleOptions: true,
      showResults: false,
      passPercent: 50,
      classIds: [ctx.classes['6A1'], ctx.classes['6A2']],
      createdById: ctx.teacherUsers.GV002,
      questions: { create: van.map((s, sortOrder) => ({ questionId: byContent.get(s.content)!.id, points: s.type === 'ESSAY' ? (s.difficulty === 6 ? 4 : 2) : 1, sortOrder })) },
    },
  });

  // ---- (4) practice for 6A1 and 6A2, one question of each auto-graded type, nobody has started it ----
  const practiceSpecs = [toan[13], toan[14], toan[4], toan[6], toan[7], toan[9], toan[10], toan[12]];
  await prisma.test.create({
    data: {
      schoolId,
      subjectId: ctx.subjects.TOAN,
      gradeLevel: 6,
      kind: TestKind.PRACTICE,
      title: 'Luyện tập – Ôn tập chương 1',
      description: 'Bài luyện tập có đủ các dạng câu hỏi: trắc nghiệm, đúng/sai, điền chỗ trống, ghép đôi và sắp xếp. Em được làm tối đa 5 lần.',
      status: TestStatus.PUBLISHED,
      timeLimitMin: 20,
      maxAttempts: 5,
      shuffleQuestions: false,
      shuffleOptions: true,
      showResults: true,
      passPercent: 50,
      closeAt: new Date(now + 14 * DAY),
      classIds: [ctx.classes['6A1'], ctx.classes['6A2']],
      createdById: ctx.teacherUsers.GV001,
      questions: { create: practiceSpecs.map((s, sortOrder) => ({ questionId: byContent.get(s.content)!.id, points: s.difficulty >= 3 ? 1.5 : 1, sortOrder })) },
    },
  });
}
