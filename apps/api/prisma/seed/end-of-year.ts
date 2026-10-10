import { AssessmentType, Gender, GuardianRelationship, Prisma, PrismaClient, Role, ScoreKind } from '@prisma/client';
import { AcademicYearsService } from '../../src/academic-years/academic-years';
import { AuthUser } from '../../src/common/auth-user';
import { DEFAULT_SETTING, loadSettings, recomputeResults } from '../../src/grades/results';
import { YEAR } from '../../src/grades/tt22';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CompletionService } from '../../src/review/completion.service';
import { ConductRow, createConductAssessments } from './conduct';
import { SeedContext } from './context';
import { SUBJECTS } from './grades';

// Phase 7 (end of the school year): grade 9 class 9A1 with the whole year marked,
// conduct approved and the gradebook locked, so the summer review and the THCS
// completion review have a student in every situation. Round 1 of the completion
// review is decided; the retakes, summer training and round 2 are under way.

const CLASS = '9A1';
const CODE = (i: number) => `HS2023${String(i + 1).padStart(3, '0')}`;

interface Profile {
  name: string;
  gender: Gender;
  /** Score subjects sit around this year average, each with its own small tweak. */
  base: number;
  /** Year averages of the subjects a student fails. */
  fixed?: Record<string, number>;
  /** Comment subjects at Chưa đạt for the year. */
  failed?: string[];
  /** The homeroom teacher's conduct totals for HK1 and HK2 (Tốt from 90, Khá from 70, Đạt from 50). */
  conduct: [number, number];
  /** Sessions missed in the year, split between the semesters. */
  absentDays: number;
  comment?: string;
}

const PROFILES: Profile[] = [
  // Học sinh Xuất sắc.
  { name: 'Nguyễn Minh Khôi', gender: Gender.MALE, base: 9.4, conduct: [96, 97], absentDays: 0, comment: 'Học sinh xuất sắc, gương mẫu trong mọi hoạt động' },
  { name: 'Trần Bảo Ngọc', gender: Gender.FEMALE, base: 8.5, conduct: [93, 95], absentDays: 1 },
  { name: 'Lê Gia Hân', gender: Gender.FEMALE, base: 8.3, conduct: [86, 92], absentDays: 2 },
  // Complete in every way but the dossier (a birth certificate copy is missing).
  { name: 'Phạm Đức Thịnh', gender: Gender.MALE, base: 7.4, conduct: [82, 85], absentDays: 0 },
  { name: 'Hoàng Thu Trang', gender: Gender.FEMALE, base: 7.2, conduct: [91, 88], absentDays: 3 },
  { name: 'Vũ Quang Huy', gender: Gender.MALE, base: 7.8, conduct: [84, 91], absentDays: 1 },
  { name: 'Đặng Khánh Linh', gender: Gender.FEMALE, base: 6.0, conduct: [64, 76], absentDays: 4 },
  // Học tập Đạt, but Nghệ thuật at Chưa đạt holds back the completion review until a retake.
  { name: 'Bùi Tuấn Kiệt', gender: Gender.MALE, base: 6.8, failed: ['NT'], conduct: [62, 66], absentDays: 6 },
  // Học tập Chưa đạt: three retakes passed in the summer, so promoted and recognised in round 2.
  { name: 'Đỗ Hải Đăng', gender: Gender.MALE, base: 6.2, fixed: { TOAN: 4.0, ANH: 4.4, KHTN: 4.6 }, conduct: [78, 80], absentDays: 5 },
  // Học tập Chưa đạt: retakes registered, results not in yet.
  { name: 'Ngô Phương Thảo', gender: Gender.FEMALE, base: 5.6, fixed: { TOAN: 3.8, VAN: 4.5, ANH: 4.3 }, conduct: [58, 61], absentDays: 9, comment: 'Cần ôn tập kỹ các môn kiểm tra lại trong hè' },
  // Rèn luyện Chưa đạt: summer training set by the homeroom teacher, not evaluated yet.
  { name: 'Dương Văn Toàn', gender: Gender.MALE, base: 7.5, conduct: [44, 46], absentDays: 12, comment: 'Vi phạm nội quy nhiều lần, cần rèn luyện thêm trong hè' },
  // Absent more than 45 sessions: stays down whatever the results.
  { name: 'Lý Thanh Tâm', gender: Gender.FEMALE, base: 6.4, conduct: [55, 57], absentDays: 48, comment: 'Nghỉ học dài ngày do hoàn cảnh gia đình' },
];

const NO_DOSSIER = 3;
const PRIORITY = 4;
const RETAKES_PASSED = 8;
const RETAKES_PENDING = 9;
const TRAINING = 10;

/** A fixed spread across subjects so the marks do not all look alike. */
const TWEAK: Record<string, number> = { TOAN: 0.2, VAN: -0.2, ANH: 0.3, KHTN: -0.1, LSDL: 0, GDCD: 0.4, TIN: 0.1, CN: -0.3 };
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Marks of one semester that average exactly `avg`: regular marks half a point
 * either side, the mid-term a little higher and the end-of-term a little lower
 * (2 × 0.3 = 3 × 0.2), so the levels come out as the profile says.
 */
function semesterMarks(avg: number, regularCount: number): { kind: ScoreKind; index: number; value: number }[] {
  const o = avg <= 9.5 ? 0.5 : 0;
  const g = avg <= 9.7 ? 0.3 : 0;
  const paired = regularCount - (regularCount % 2);
  return [
    ...Array.from({ length: regularCount }, (_, k) => ({ kind: ScoreKind.TX, index: k + 1, value: round1(avg + (k < paired ? (k % 2 ? -o : o) : 0)) })),
    { kind: ScoreKind.GK, index: 1, value: round1(avg + g) },
    { kind: ScoreKind.CK, index: 1, value: round1(avg - (g * 2) / 3) },
  ];
}

export async function seedEndOfYear(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId, academicYearId, subjects, teachers, teacherUsers, adminUserId } = ctx;
  const codes = PROFILES.map((_, i) => CODE(i));
  if (await prisma.student.findFirst({ where: { schoolId, code: { in: codes } }, select: { id: true } })) {
    console.log(`Demo school: students ${codes[0]}... already exist; end-of-year data not added.`);
    return;
  }
  const homeroomUser = teacherUsers.GV004 ?? adminUserId;
  const klass = await prisma.class.create({ data: { schoolId, academicYearId, name: CLASS, gradeLevel: 9, homeroomTeacherId: teachers.GV004 ?? null, room: 'P.301' } });

  const students: { id: string; name: string }[] = [];
  for (const [i, p] of PROFILES.entries()) {
    const family = p.name.split(' ')[0];
    const s = await prisma.student.create({
      data: {
        schoolId,
        code: codes[i],
        fullName: p.name,
        gender: p.gender,
        dateOfBirth: new Date(`2012-${String((i % 12) + 1).padStart(2, '0')}-${String(((i * 7) % 27) + 1).padStart(2, '0')}`),
        guardians: {
          create: [
            {
              fullName: `${family} Văn ${['Hùng', 'Dũng', 'Thắng', 'Sơn', 'Hải', 'Long', 'Tùng', 'Cường', 'Minh', 'Phong', 'Quang', 'Tiến'][i]}`,
              relationship: GuardianRelationship.FATHER,
              phone: `0912${String(300100 + i)}`,
              isPrimary: true,
            },
          ],
        },
        enrollments: { create: { classId: klass.id, academicYearId } },
      },
    });
    students.push({ id: s.id, name: p.name });
  }

  // The whole year of marks, as each subject is set up in the school.
  const settings = await loadSettings(prisma, schoolId);
  const scores: Prisma.ScoreCreateManyInput[] = [];
  for (const [i, p] of PROFILES.entries()) {
    for (const code of Object.keys(SUBJECTS).filter((c) => subjects[c])) {
      const subjectId = subjects[code];
      const { assessment, regularCount } = settings.get(subjectId) ?? DEFAULT_SETTING;
      const teacherId = teachers[SUBJECTS[code][3]] ?? null;
      const base = { schoolId, academicYearId, classId: klass.id, studentId: students[i].id, subjectId, teacherId };
      if (assessment === AssessmentType.COMMENT) {
        const fails = p.failed?.includes(code) ?? false;
        for (const semester of [1, 2]) {
          for (let k = 1; k <= regularCount; k++) scores.push({ ...base, semester, kind: ScoreKind.TX, index: k, passed: !(fails && k === 2) });
          scores.push({ ...base, semester, kind: ScoreKind.GK, index: 1, passed: true });
          scores.push({ ...base, semester, kind: ScoreKind.CK, index: 1, passed: !fails, note: fails && semester === 2 ? 'Chưa hoàn thành sản phẩm cuối kỳ' : null });
        }
        continue;
      }
      // ĐTBmcn = (HK1 + 2 × HK2) / 3: HK1 0.6 below the year and HK2 0.3 above it.
      const year = p.fixed?.[code] ?? round1(p.base + (TWEAK[code] ?? 0));
      const d = year + 0.3 <= 10 ? 0.3 : 0;
      for (const [semester, avg] of [
        [1, round1(year - 2 * d)],
        [2, round1(year + d)],
      ] as const) {
        for (const m of semesterMarks(avg, regularCount)) scores.push({ ...base, semester, ...m });
      }
    }
  }
  await prisma.score.createMany({ data: scores });

  // Conduct approved for both semesters, the absences of each semester and the year's comments.
  const conduct: ConductRow[] = PROFILES.flatMap((p, i) =>
    ([1, 2] as const).map((semester) => {
      const teacherTotal = p.conduct[semester - 1];
      return {
        classId: klass.id,
        studentId: students[i].id,
        semester,
        seed: i + semester,
        selfTotal: Math.min(100, teacherTotal + 3),
        teacherTotal,
        reviewedById: homeroomUser,
        approved: true,
        approvedAt: semester === 1 ? new Date('2027-01-12T02:00:00Z') : new Date('2027-05-20T02:00:00Z'),
      };
    }),
  );
  await createConductAssessments(prisma, ctx, conduct);
  await prisma.$transaction(
    PROFILES.flatMap((p, i) => {
      const hk1 = Math.floor(p.absentDays * 0.4);
      return [
        [1, hk1],
        [2, p.absentDays - hk1],
      ].map(([semester, absentDays]) => prisma.termResult.update({ where: { studentId_academicYearId_semester: { studentId: students[i].id, academicYearId, semester } }, data: { absentDays } }));
    }),
  );
  await prisma.termResult.createMany({
    data: PROFILES.map((p, i) => ({ schoolId, academicYearId, semester: YEAR, classId: klass.id, studentId: students[i].id, absentDays: p.absentDays, homeroomComment: p.comment ?? null })),
  });
  await prisma.gradeLock.createMany({ data: [1, 2].map((semester) => ({ schoolId, academicYearId, semester, classId: klass.id, lockedById: adminUserId, lockedAt: new Date(semester === 1 ? '2027-01-15T10:00:00Z' : '2027-05-26T10:00:00Z') })) });

  // Every class of the year: subject results, levels, titles and promotion (7A1's year conduct included).
  const classes = await prisma.class.findMany({ where: { schoolId, academicYearId }, select: { id: true } });
  for (const { id } of classes) await recomputeResults(prisma, { schoolId, academicYearId, classId: id });

  // THCS completion, round 1 at the end of May: the council meets on 18/05 and the decision of 25/05
  // recognises everyone who met every condition then (one student's dossier still lacks a paper).
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { principalName: true } });
  const chair = school.principalName ?? 'Nguyễn Thị Hồng Hạnh';
  const staff = await prisma.teacher.findMany({ where: { schoolId, code: { in: ['GV001', 'GV002', 'GV003', 'GV004', 'GV005', 'GV006'] } }, select: { code: true, fullName: true } });
  const nameOf = (code: string) => staff.find((t) => t.code === code)?.fullName;
  const members = [
    { name: chair, position: 'Hiệu trưởng', role: 'Chủ tịch' },
    { name: nameOf('GV002'), position: 'Tổ trưởng tổ Ngữ văn', role: 'Phó Chủ tịch' },
    { name: nameOf('GV001'), position: 'Tổ trưởng tổ Toán', role: 'Ủy viên' },
    { name: nameOf('GV003'), position: 'Giáo viên Tiếng Anh', role: 'Ủy viên' },
    { name: nameOf('GV004'), position: `Giáo viên chủ nhiệm lớp ${CLASS}`, role: 'Ủy viên' },
    { name: nameOf('GV005'), position: 'Giáo viên Lịch sử và Địa lý', role: 'Ủy viên' },
    { name: nameOf('GV006'), position: 'Giáo viên Tin học', role: 'Thư ký' },
  ].filter((m): m is { name: string; position: string; role: string } => !!m.name);
  const council = { councilDecisionNo: '15/QĐ-THCS', councilDecidedOn: new Date('2027-05-05'), meetingPlace: 'Phòng họp Hội đồng sư phạm', members };
  const first = await prisma.completionRound.create({ data: { schoolId, academicYearId, round: 1, ...council, meetingAt: new Date('2027-05-18T08:00:00+07:00') } });
  await prisma.completionRecord.createMany({
    data: [
      { schoolId, academicYearId, classId: klass.id, studentId: students[NO_DOSSIER].id, dossierComplete: false, note: 'Thiếu bản sao giấy khai sinh' },
      { schoolId, academicYearId, classId: klass.id, studentId: students[PRIORITY].id, priority: 'Con thương binh' },
    ],
  });
  // The decision as the principal records it (register numbers, who was left out), dated back to 25/05.
  const completion = new CompletionService(prisma as unknown as PrismaService, new AcademicYearsService(prisma as unknown as PrismaService));
  const admin: AuthUser = { userId: adminUserId, schoolId, districtId: null, role: Role.ADMIN, email: 'admin@demo.edu.vn' };
  await completion.recognize(admin, 1, { decisionNo: '25/QĐ-HĐXCN', decidedOn: '2027-05-25' });
  const decidedAt = new Date('2027-05-25T09:00:00+07:00');
  await prisma.completionRound.update({ where: { id: first.id }, data: { recognizedAt: decidedAt } });
  await prisma.completionRecord.updateMany({ where: { roundId: first.id }, data: { recognizedAt: decidedAt } });

  // The summer: three retakes passed, three waiting for their results, and one student in summer training.
  const passed: [string, number, string][] = [
    ['TOAN', 5.5, 'GV001'],
    ['ANH', 6.0, 'GV003'],
    ['KHTN', 5.0, 'GV004'],
  ];
  await prisma.subjectRetake.createMany({
    data: [
      ...passed
        .filter(([code]) => subjects[code])
        .map(([code, score, teacher]) => ({
          schoolId,
          academicYearId,
          classId: klass.id,
          studentId: students[RETAKES_PASSED].id,
          subjectId: subjects[code],
          score,
          createdById: adminUserId,
          createdAt: new Date('2027-06-01T02:00:00Z'),
          enteredById: teacherUsers[teacher] ?? adminUserId,
          enteredAt: new Date('2027-06-20T08:00:00Z'),
        })),
      ...['TOAN', 'VAN', 'ANH']
        .filter((code) => subjects[code])
        .map((code) => ({ schoolId, academicYearId, classId: klass.id, studentId: students[RETAKES_PENDING].id, subjectId: subjects[code], createdById: adminUserId, createdAt: new Date('2027-06-01T02:00:00Z') })),
    ],
  });
  await prisma.summerTraining.create({
    data: {
      schoolId,
      academicYearId,
      classId: klass.id,
      studentId: students[TRAINING].id,
      tasks: 'Tham gia lao động vệ sinh khu dân cư 2 buổi mỗi tuần; viết bản tự kiểm điểm có xác nhận của gia đình; báo cáo giáo viên chủ nhiệm vào ngày 15 hằng tháng.',
      assignedById: homeroomUser,
      assignedAt: new Date('2027-06-02T02:00:00Z'),
    },
  });
  // Promotion after the summer review so far.
  await recomputeResults(prisma, { schoolId, academicYearId, classId: klass.id });

  // Round 2 in August, same council, not decided yet.
  await prisma.completionRound.create({ data: { schoolId, academicYearId, round: 2, ...council, meetingAt: new Date('2027-08-10T08:00:00+07:00') } });
}
