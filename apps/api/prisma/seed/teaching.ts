import { Gender, GuardianRelationship, LessonLogStatus, Prisma, PrismaClient, Role, StudentNoteKind } from '@prisma/client';
import { AcademicYearsService } from '../../src/academic-years/academic-years';
import { AuthUser } from '../../src/common/auth-user';
import { localDate } from '../../src/common/time';
import { GradeControlService } from '../../src/grades/control.service';
import { addDays, fromDbDate, mondayOf, semesterFor, toDbDate } from '../../src/homeroom/dates';
import { HomeroomAccessService } from '../../src/homeroom/homeroom-access.service';
import { HomeroomBookService } from '../../src/homeroom/homeroom-book.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AssignmentsService } from '../../src/teaching/assignments.service';
import { DutiesService } from '../../src/teaching/duties.service';
import { schoolWeek } from '../../src/teaching/workload';
import { SeedContext } from './context';
import { PRINCIPAL_EMAIL } from './erecords';
import { CONTENT } from './homeroom';

// Phase 10 (phân công chuyên môn): the school's two tổ chuyên môn, the principal and vice
// principal as teachers, who holds which position and duty under Thông tư 05/2025, who
// teaches what in each class each semester (6A1's taken from its timetable, the other
// classes by the programme's periods), GV001's lịch báo giảng for last week and this one,
// and the sổ chủ nhiệm of 6A1, kept by its homeroom teacher and checked by the principal.

const MATH_SCIENCE = 'Tổ Toán - Khoa học tự nhiên';
const LANGUAGE_SOCIAL = 'Tổ Ngữ văn - Khoa học xã hội';
const GROUP: Record<string, string> = {
  GV001: MATH_SCIENCE,
  GV004: MATH_SCIENCE,
  GV006: MATH_SCIENCE,
  GV007: MATH_SCIENCE,
  GV002: LANGUAGE_SOCIAL,
  GV003: LANGUAGE_SOCIAL,
  GV005: LANGUAGE_SOCIAL,
  GV008: LANGUAGE_SOCIAL,
};

/** The school's leaders teach too (Điều 8: 2 periods a week for the principal, 4 for a vice principal). */
const leaders = (principalName: string) => [
  { code: 'HT01', fullName: principalName, gender: Gender.FEMALE, born: '1975-04-12', hired: '2016-08-15', subject: 'GDCD', group: LANGUAGE_SOCIAL, email: PRINCIPAL_EMAIL, phone: '0912000001', position: 'Hiệu trưởng' },
  { code: 'PHT01', fullName: 'Đỗ Mạnh Cường', gender: Gender.MALE, born: '1979-11-03', hired: '2018-09-01', subject: 'TOAN', group: MATH_SCIENCE, email: 'phohieutruong@demo.edu.vn', phone: '0912000002', position: 'Phó hiệu trưởng' },
];

/** Positions and duties, all for the whole year: teacher, catalogue code, note. */
const DUTIES: [string, string, string?][] = [
  ['HT01', 'HT'],
  ['PHT01', 'PHT'],
  ['GV001', 'TTCM', MATH_SCIENCE],
  ['GV002', 'TTCM', LANGUAGE_SOCIAL],
  ['GV003', 'TKHD'],
  // With the homeroom class of 9A1 that is three duties, one over what the circular allows, so the demo shows the warning.
  ['GV004', 'TPCM', MATH_SCIENCE],
  ['GV004', 'PHBM', 'Phòng thực hành Khoa học tự nhiên'],
  ['GV005', 'TPCM', LANGUAGE_SOCIAL],
  ['GV005', 'TBTT'],
  ['GV006', 'CNTT', 'Gồm phụ trách phòng tin học'],
  ['GV006', 'PTB'],
  ['GV007', 'TPTD'],
  ['GV008', 'TV'],
];

const CLASSES = ['6A1', '6A2', '7A1', '9A1'];
/** Who teaches each subject, and in which classes. */
const TEACHES: [string, string, string[]][] = [
  ['TOAN', 'GV001', ['6A1', '6A2', '7A1']],
  ['TOAN', 'PHT01', ['9A1']],
  ['VAN', 'GV002', ['6A1', '6A2', '7A1']],
  ['VAN', 'GV008', ['9A1']],
  ['ANH', 'GV003', CLASSES],
  ['KHTN', 'GV004', CLASSES],
  ['LSDL', 'GV005', CLASSES],
  ['GDCD', 'GV005', ['6A1', '6A2']],
  ['GDCD', 'HT01', ['7A1', '9A1']],
  ['TIN', 'GV006', CLASSES],
  ['CN', 'GV006', CLASSES],
  ['GDTC', 'GV007', CLASSES],
  ['NT', 'GV008', CLASSES],
];
/** Periods a week from the yearly periods of the 2018 programme (140 a year: 4 a week). */
const PROGRAMME: Record<string, number> = { TOAN: 4, VAN: 4, ANH: 3, KHTN: 4, LSDL: 3, GDCD: 1, TIN: 1, CN: 1, GDTC: 2, NT: 2 };

/** Toán 6 (Kết nối tri thức với cuộc sống), tập 1, in the order of the kế hoạch dạy học: tiết 1 first. */
const TOAN6 = [
  'Bài 1. Tập hợp',
  'Bài 2. Cách ghi số tự nhiên',
  'Bài 3. Thứ tự trong tập hợp các số tự nhiên',
  'Bài 4. Phép cộng và phép trừ số tự nhiên (tiết 1)',
  'Bài 4. Phép cộng và phép trừ số tự nhiên (tiết 2)',
  'Bài 5. Phép nhân và phép chia số tự nhiên (tiết 1)',
  'Bài 5. Phép nhân và phép chia số tự nhiên (tiết 2)',
  'Luyện tập chung',
  'Bài 6. Lũy thừa với số mũ tự nhiên (tiết 1)',
  'Bài 6. Lũy thừa với số mũ tự nhiên (tiết 2)',
  'Bài 7. Thứ tự thực hiện các phép tính',
  'Luyện tập chung',
  'Bài tập cuối chương I',
  'Bài 8. Quan hệ chia hết và tính chất (tiết 1)',
  'Bài 8. Quan hệ chia hết và tính chất (tiết 2)',
  'Bài 9. Dấu hiệu chia hết (tiết 1)',
  'Bài 9. Dấu hiệu chia hết (tiết 2)',
  'Bài 10. Số nguyên tố (tiết 1)',
  'Bài 10. Số nguyên tố (tiết 2)',
  'Luyện tập chung',
  'Bài 11. Ước chung. Ước chung lớn nhất (tiết 1)',
  'Bài 11. Ước chung. Ước chung lớn nhất (tiết 2)',
  'Bài 12. Bội chung. Bội chung nhỏ nhất (tiết 1)',
  'Bài 12. Bội chung. Bội chung nhỏ nhất (tiết 2)',
  'Luyện tập chung',
  'Bài tập cuối chương II',
  'Kiểm tra giữa học kỳ I (tiết 1)',
  'Kiểm tra giữa học kỳ I (tiết 2)',
  'Bài 13. Tập hợp các số nguyên (tiết 1)',
  'Bài 13. Tập hợp các số nguyên (tiết 2)',
  'Bài 14. Phép cộng và phép trừ số nguyên (tiết 1)',
  'Bài 14. Phép cộng và phép trừ số nguyên (tiết 2)',
  'Bài 15. Quy tắc dấu ngoặc',
  'Luyện tập chung',
  'Bài 16. Phép nhân số nguyên',
  'Bài 17. Phép chia hết. Ước và bội của một số nguyên',
  'Luyện tập chung',
  'Bài tập cuối chương III',
];
const AIDS = ['SGK Toán 6 tập 1, máy chiếu, phiếu học tập', 'SGK, bảng phụ, thước thẳng'];

// 6A1's sổ chủ nhiệm, by student code (the roster is sorted by name, so codes keep the demo stable).
const OFFICERS: [string, string][] = [
  ['Lớp trưởng', 'HS2026004'],
  ['Lớp phó học tập', 'HS2026001'],
  ['Lớp phó văn thể mỹ', 'HS2026006'],
  ['Lớp phó lao động', 'HS2026005'],
  ['Chi đội trưởng', 'HS2026003'],
];
/** Three tổ, each in its own dãy: name, tổ trưởng, members. */
const GROUPS: [string, string, string[]][] = [
  ['Tổ 1', 'HS2026010', ['HS2026004', 'HS2026008', 'HS2026003', 'HS2026010']],
  ['Tổ 2', 'HS2026006', ['HS2026001', 'HS2026007', 'HS2026006', 'HS2026014']],
  ['Tổ 3', 'HS2026009', ['HS2026005', 'HS2026002', 'HS2026009']],
];
/**
 * Three dãy of two desks for two, row 0 at the board: the student who talks in class sits at
 * the front beside the lớp trưởng, and the student from a poor household beside the lớp phó học tập.
 */
const SEATS: (string | null)[][] = [
  ['HS2026008', 'HS2026004', 'HS2026007', 'HS2026001', 'HS2026002', 'HS2026005'],
  ['HS2026003', 'HS2026010', 'HS2026006', 'HS2026014', 'HS2026009', null],
];
/** Ban đại diện cha mẹ học sinh: role, child, parent (the demo parent leads it). */
const COMMITTEE: [string, string, GuardianRelationship][] = [
  ['Trưởng ban', 'HS2026001', GuardianRelationship.FATHER],
  ['Phó trưởng ban', 'HS2026004', GuardianRelationship.MOTHER],
  ['Ủy viên', 'HS2026009', GuardianRelationship.MOTHER],
];

/** The principal's own account, which she also signs the học bạ with; null when it belongs to another school. */
async function principalUser(prisma: PrismaClient, ctx: SeedContext, fullName: string) {
  const user =
    (await prisma.user.findUnique({ where: { email: PRINCIPAL_EMAIL }, select: { id: true, schoolId: true } })) ??
    (await prisma.user.create({ data: { schoolId: ctx.schoolId, email: PRINCIPAL_EMAIL, fullName, role: Role.ADMIN, passwordHash: await ctx.hash('Admin@123') }, select: { id: true, schoolId: true } }));
  return user.schoolId === ctx.schoolId ? user : null;
}

export async function seedTeaching(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId, academicYearId, subjects } = ctx;
  const db = prisma as unknown as PrismaService;
  const years = new AcademicYearsService(db);
  const duties = new DutiesService(db, new AssignmentsService(db, years));
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true, principalName: true } });
  const year = await prisma.academicYear.findUniqueOrThrow({ where: { id: academicYearId }, select: { startDate: true, endDate: true } });
  const principalName = school.principalName ?? 'Nguyễn Thị Hồng Hạnh';

  // ---- tổ chuyên môn, and the principal and vice principal as teachers ----
  for (const [code, group] of Object.entries(GROUP)) {
    if (ctx.teachers[code]) await prisma.teacher.updateMany({ where: { id: ctx.teachers[code], subjectGroup: null }, data: { subjectGroup: group } });
  }
  // The Tin học teacher also teaches Công nghệ, as in many small schools.
  if (ctx.teachers.GV006 && subjects.CN) await prisma.teacherSubject.createMany({ data: [{ teacherId: ctx.teachers.GV006, subjectId: subjects.CN }], skipDuplicates: true });

  const teachers = { ...ctx.teachers };
  const principal = await principalUser(prisma, ctx, principalName);
  for (const l of leaders(principalName)) {
    let teacher = await prisma.teacher.findUnique({ where: { schoolId_code: { schoolId, code: l.code } }, select: { id: true } });
    let userId: string | null = null;
    if (!teacher) {
      // The principal logs in with her own account and sees her lịch báo giảng there.
      if (l.code === 'HT01' && principal && !(await prisma.teacher.findUnique({ where: { userId: principal.id }, select: { id: true } }))) userId = principal.id;
      teacher = await prisma.teacher.create({
        data: {
          schoolId,
          code: l.code,
          fullName: l.fullName,
          gender: l.gender,
          dateOfBirth: new Date(l.born),
          email: l.email,
          phone: l.phone,
          subjectGroup: l.group,
          userId,
          subjects: subjects[l.subject] ? { create: [{ subjectId: subjects[l.subject] }] } : undefined,
        },
        select: { id: true },
      });
    }
    teachers[l.code] = teacher.id;
    if (!(await prisma.employee.findFirst({ where: { OR: [{ teacherId: teacher.id }, { schoolId, code: l.code }] }, select: { id: true } }))) {
      const employeeUser = userId && !(await prisma.employee.findUnique({ where: { userId }, select: { id: true } })) ? userId : null;
      await prisma.employee.create({
        data: { schoolId, code: l.code, fullName: l.fullName, gender: l.gender, dateOfBirth: new Date(l.born), phone: l.phone, email: l.email, address: 'Hà Nội', department: 'Ban giám hiệu', position: l.position, hireDate: new Date(l.hired), teacherId: teacher.id, userId: employeeUser },
      });
    }
  }

  // ---- chức vụ and kiêm nhiệm, from the circular's catalogue ----
  const types = new Map((await duties.types(schoolId)).map((t) => [t.code, t.id]));
  for (const [code, duty, note] of DUTIES) {
    const teacherId = teachers[code];
    const dutyTypeId = types.get(duty);
    if (!teacherId || !dutyTypeId || (await prisma.teacherDuty.findFirst({ where: { academicYearId, teacherId, dutyTypeId }, select: { id: true } }))) continue;
    try {
      await duties.addDuty(schoolId, { teacherId, dutyTypeId, note }, academicYearId);
    } catch (e) {
      console.log(`Demo school: ${duty} of ${code} not added: ${(e as Error).message}`);
    }
  }

  // ---- phân công giảng dạy, the same in both semesters ----
  const classes = await prisma.class.findMany({ where: { schoolId, academicYearId, name: { in: CLASSES } }, select: { id: true, name: true } });
  const timetable = await prisma.timetableEntry.groupBy({ by: ['classId', 'subjectId', 'teacherId'], where: { schoolId, academicYearId, semester: 1 }, _count: { _all: true } });
  const cells: Omit<Prisma.TeachingAssignmentCreateManyInput, 'schoolId' | 'academicYearId' | 'semester'>[] = [];
  for (const klass of classes) {
    // A class with a timetable takes its assignment from it, as "Lấy từ thời khóa biểu" does; subjects not on it yet follow the programme.
    const timetabled = timetable.filter((t) => t.classId === klass.id);
    for (const t of timetabled) cells.push({ classId: klass.id, subjectId: t.subjectId, teacherId: t.teacherId, periodsPerWeek: t._count._all });
    for (const [subject, code, names] of TEACHES) {
      if (!names.includes(klass.name) || !subjects[subject] || !teachers[code] || timetabled.some((t) => t.subjectId === subjects[subject])) continue;
      cells.push({ classId: klass.id, subjectId: subjects[subject], teacherId: teachers[code], periodsPerWeek: PROGRAMME[subject] });
    }
  }
  for (const semester of [1, 2]) await prisma.teachingAssignment.createMany({ data: cells.map((c) => ({ ...c, schoolId, academicYearId, semester })), skipDuplicates: true });

  await seedCalendar(prisma, ctx, teachers.GV001, { timezone: school.timezone, startDate: fromDbDate(year.startDate), endDate: year.endDate });
  await seedBook(prisma, ctx, db, years, principal, { timezone: school.timezone, startDate: fromDbDate(year.startDate) });
}

/**
 * GV001's lịch báo giảng: every period of last week and this week but the last, which she
 * has not written yet, so the reminder on her dashboard shows. The lessons follow Toán 6
 * from tiết 1 in the first week of school, and the sổ đầu bài of those periods, where the
 * demo wrote it, now names the lesson taught, as a teacher's would.
 */
async function seedCalendar(prisma: PrismaClient, ctx: SeedContext, teacherId: string | undefined, year: { timezone: string; startDate: string; endDate: Date }) {
  if (!teacherId) return;
  const { schoolId, academicYearId } = ctx;
  const entries = await prisma.timetableEntry.findMany({
    where: { teacherId, academicYearId, semester: 1 },
    select: { classId: true, subjectId: true, dayOfWeek: true, periodNumber: true, class: { select: { gradeLevel: true } }, subject: { select: { code: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
  });
  const end = fromDbDate(year.endDate);
  const monday = mondayOf(localDate(new Date(), year.timezone));
  const lessons: (Prisma.LessonPlanCreateManyInput & { lessonNo: number; subjectCode: string; planned: boolean })[] = [];
  for (const weekStart of [addDays(monday, -7), monday]) {
    const week = schoolWeek(weekStart, year.startDate);
    if (week < 1) continue;
    const slots = entries.map((e) => ({ e, date: addDays(weekStart, e.dayOfWeek - 1) })).filter(({ date }) => date >= year.startDate && date <= end && semesterFor(date, year) === 1);
    const counted = new Map<string, number>();
    slots.forEach(({ e, date }, i) => {
      const key = `${e.classId}-${e.subjectId}`;
      const k = (counted.get(key) ?? 0) + 1;
      counted.set(key, k);
      const lessonNo = (week - 1) * entries.filter((x) => x.classId === e.classId && x.subjectId === e.subjectId).length + k;
      const title = e.subject.code === 'TOAN' && e.class.gradeLevel === 6 ? (TOAN6[lessonNo - 1] ?? 'Ôn tập học kỳ I') : `Bài ${Math.ceil(lessonNo / 2)}`;
      lessons.push({
        schoolId,
        teacherId,
        classId: e.classId,
        subjectId: e.subjectId,
        date: toDbDate(date),
        periodNumber: e.periodNumber,
        lessonNo,
        title,
        aids: AIDS[lessonNo % AIDS.length],
        note: title === 'Luyện tập chung' ? 'Kiểm tra thường xuyên 15 phút cuối giờ' : null,
        subjectCode: e.subject.code,
        planned: !(weekStart === monday && i === slots.length - 1),
      });
    });
  }
  await prisma.lessonPlan.createMany({ data: lessons.filter((l) => l.planned).map(({ subjectCode, planned, ...plan }) => plan), skipDuplicates: true });
  for (const l of lessons) {
    if (!CONTENT[l.subjectCode]) continue;
    await prisma.lessonLog.updateMany({
      where: { classId: l.classId, subjectId: l.subjectId, teacherId, date: l.date, periodNumber: l.periodNumber, status: LessonLogStatus.DONE, content: CONTENT[l.subjectCode] },
      data: { content: `Tiết ${l.lessonNo}: ${l.title}` },
    });
  }
}

/** 6A1's sổ chủ nhiệm, written through the service as its homeroom teacher, and the principal's check of it. */
async function seedBook(prisma: PrismaClient, ctx: SeedContext, db: PrismaService, years: AcademicYearsService, principal: { id: string } | null, year: { timezone: string; startDate: string }) {
  const { schoolId, academicYearId } = ctx;
  const klass = await prisma.class.findFirst({
    where: { schoolId, academicYearId, name: '6A1' },
    select: { id: true, homeroomTeacher: { select: { fullName: true, gender: true, user: { select: { id: true, email: true, role: true } } } } },
  });
  const access = new HomeroomAccessService(db);
  const roster = klass ? await access.roster(klass.id) : [];
  const byCode = new Map(roster.map((s) => [s.code, s]));
  const codes = [...OFFICERS.map(([, c]) => c), ...GROUPS.flatMap(([, , m]) => m), ...COMMITTEE.map(([, c]) => c)];
  if (!klass || codes.some((c) => !byCode.has(c))) {
    console.log('Demo school: class 6A1 was changed; its sổ chủ nhiệm not added.');
    return;
  }
  const classId = klass.id;
  const id = (code: string) => byCode.get(code)!.id;
  const name = (code: string) => byCode.get(code)!.fullName;
  const guardians = await prisma.guardian.findMany({ where: { studentId: { in: roster.map((s) => s.id) } }, select: { id: true, studentId: true, relationship: true, fullName: true } });
  const parent = (code: string, relationship: GuardianRelationship) => guardians.find((g) => g.studentId === id(code) && g.relationship === relationship) ?? guardians.find((g) => g.studentId === id(code))!;
  const committee = COMMITTEE.map(([role, code, relationship]) => ({ role, guardian: parent(code, relationship) })).filter((m) => m.guardian);

  const homeroomUser = klass.homeroomTeacher?.user;
  const writer: AuthUser = homeroomUser
    ? { userId: homeroomUser.id, schoolId, districtId: null, role: homeroomUser.role, email: homeroomUser.email ?? '' }
    : { userId: ctx.adminUserId, schoolId, districtId: null, role: Role.ADMIN, email: 'admin@demo.edu.vn' };
  const book = new HomeroomBookService(db, access, new GradeControlService(db, years));
  const today = localDate(new Date(), year.timezone);
  /** A day `n` days into the school year, never later than today. */
  const on = (n: number) => {
    const d = addDays(year.startDate, n);
    return d < today || today < year.startDate ? d : today;
  };
  const startYear = Number(year.startDate.slice(0, 4));

  await book.save(writer, {
    classId,
    officers: OFFICERS.map(([role, code]) => ({ role, studentId: id(code) })),
    parentCommittee: committee.map((m) => ({ role: m.role, guardianId: m.guardian.id })),
    groups: GROUPS.map(([groupName, leader, members]) => ({ name: groupName, leaderId: id(leader), studentIds: members.map(id) })),
    seating: { columns: 3, rows: 2, seatsPerDesk: 2, seats: SEATS.map((row) => row.map((code) => (code ? id(code) : null))) },
    yearPlan: {
      situation:
        'Thuận lợi: lớp có sĩ số nhỏ, đa số học sinh ngoan, chăm học; cha mẹ học sinh quan tâm, phối hợp tốt với giáo viên chủ nhiệm. Ban cán sự lớp nhiệt tình.\n' +
        'Khó khăn: học sinh mới vào lớp 6, chưa quen học nhiều môn với nhiều giáo viên; một số em còn nói chuyện riêng, dùng điện thoại trong giờ học; một học sinh thuộc hộ nghèo cần được hỗ trợ; một học sinh mới chuyển từ lớp khác đến.',
      goals: 'Xây dựng tập thể lớp đoàn kết, có nề nếp, tự quản tốt; giúp học sinh thích nghi với cách học ở cấp trung học cơ sở. Phát triển phẩm chất chăm chỉ, trung thực, trách nhiệm và năng lực tự học theo Chương trình giáo dục phổ thông 2018.',
      targets:
        'Học tập: 100% học sinh đạt mức Đạt trở lên, từ 40% đạt mức Tốt.\n' +
        'Rèn luyện: 100% học sinh đạt mức Khá trở lên, từ 80% đạt mức Tốt.\n' +
        'Chuyên cần: tỷ lệ đi học đầy đủ từ 98%, không có học sinh bỏ học.\n' +
        'Thi đua: chi đội mạnh, tập thể lớp tiên tiến.',
      measures:
        '- Kiện toàn ban cán sự lớp, chia lớp thành 3 tổ; sinh hoạt lớp cuối tuần nhận xét thi đua của từng tổ.\n' +
        '- Phối hợp với giáo viên bộ môn theo dõi việc học; tổ chức đôi bạn cùng tiến cho học sinh học chưa tốt.\n' +
        '- Liên lạc thường xuyên với cha mẹ học sinh qua ứng dụng của nhà trường; họp cha mẹ học sinh mỗi học kỳ.\n' +
        '- Theo dõi riêng học sinh cần quan tâm, giúp đỡ; cùng Ban đại diện cha mẹ học sinh hỗ trợ học sinh có hoàn cảnh khó khăn.\n' +
        '- Hưởng ứng các phong trào của Liên đội và nhà trường.',
    },
  });

  await book.saveMonth(writer, {
    classId,
    month: `${startYear}-09`,
    theme: 'Ổn định nề nếp, mừng năm học mới',
    tasks:
      '- Ổn định tổ chức lớp: bầu ban cán sự, chia tổ, xếp chỗ ngồi.\n' +
      '- Phổ biến nội quy nhà trường và quy định sử dụng điện thoại trong giờ học.\n' +
      '- Hoàn thiện hồ sơ học sinh, lập danh sách học sinh có hoàn cảnh khó khăn.\n' +
      '- Họp cha mẹ học sinh đầu năm học, bầu Ban đại diện cha mẹ học sinh lớp.\n' +
      '- Tham gia Lễ khai giảng và Tết Trung thu.',
    review: `Lớp đã ổn định nề nếp, ban cán sự hoạt động tích cực, chuyên cần tốt. Còn một số em nói chuyện riêng, dùng điện thoại trong giờ học: đã nhắc nhở, phê bình và trao đổi với gia đình. Em ${name('HS2026001')} đạt giải Nhất cuộc thi "Rung chuông vàng" khối 6.`,
  });
  await book.saveMonth(writer, {
    classId,
    month: `${startYear}-10`,
    theme: 'Chăm ngoan, học giỏi; mừng ngày Phụ nữ Việt Nam 20/10',
    tasks:
      '- Duy trì nề nếp, đẩy mạnh phong trào "Đôi bạn cùng tiến", ôn tập chuẩn bị kiểm tra giữa học kỳ I.\n' +
      '- Làm thiệp và tiết mục văn nghệ chào mừng ngày Phụ nữ Việt Nam 20/10.\n' +
      `- Tiếp tục theo dõi, giúp đỡ các em ${name('HS2026008')}, ${name('HS2026002')}; phối hợp với gia đình.\n` +
      '- Tham gia Hội khỏe Phù Đổng cấp trường.',
  });

  const honorific: Partial<Record<GuardianRelationship, string>> = { FATHER: 'ông ', MOTHER: 'bà ' };
  await book.addMeeting(writer, {
    classId,
    date: on(15),
    title: `Họp cha mẹ học sinh đầu năm học ${startYear}-${startYear + 1}`,
    invited: roster.length,
    attended: roster.length - 1,
    content:
      '1. Giáo viên chủ nhiệm báo cáo tình hình lớp đầu năm học, kế hoạch năm học của nhà trường và của lớp.\n' +
      '2. Phổ biến quy định đánh giá học sinh theo Thông tư 22/2021/TT-BGDĐT, nội quy nhà trường và quy định sử dụng điện thoại.\n' +
      '3. Thông báo các khoản thu theo quy định; hướng dẫn cài ứng dụng phụ huynh để theo dõi điểm danh, điểm số và học phí.\n' +
      '4. Bầu Ban đại diện cha mẹ học sinh lớp.',
    opinions:
      '- Đề nghị nhà trường thông báo lịch kiểm tra giữa kỳ qua ứng dụng.\n' +
      '- Một số phụ huynh đề nghị lớp lập nhóm học tập để các em giúp nhau.\n' +
      '- Phụ huynh nhất trí với các khoản thu và kế hoạch của lớp.',
    conclusions:
      `Hội nghị thống nhất bầu Ban đại diện cha mẹ học sinh lớp gồm ${committee.length} thành viên: ${committee.map((m) => `${honorific[m.guardian.relationship] ?? ''}${m.guardian.fullName} (${m.role})`).join(', ')}. ` +
      'Cha mẹ học sinh phối hợp với giáo viên chủ nhiệm quản lý việc dùng điện thoại của con.',
  });

  const notes: { code: string; day: number; kind: StudentNoteKind; content: string; action?: string; result?: string }[] = [
    {
      code: 'HS2026007',
      day: 3,
      kind: StudentNoteKind.ATTENTION,
      content: 'Gia đình thuộc hộ nghèo, em còn thiếu sách giáo khoa và đồ dùng học tập.',
      action: `Lập hồ sơ miễn học phí theo chế độ; vận động Ban đại diện cha mẹ học sinh tặng sách vở; xếp em ngồi cạnh bạn ${name('HS2026001')} để bạn kèm thêm môn Toán (đôi bạn cùng tiến).`,
      result: 'Em đã nhận đủ sách giáo khoa, vở và đồ dùng học tập do Ban đại diện trao tặng.',
    },
    {
      code: 'HS2026008',
      day: 12,
      kind: StudentNoteKind.ATTENTION,
      content: 'Hay nói chuyện riêng, chưa tập trung trong giờ học; xô đẩy bạn trong giờ ra chơi.',
      action: `Xếp em ngồi bàn đầu cạnh bạn lớp trưởng ${name('HS2026004')}; giáo viên chủ nhiệm gặp gia đình, phối hợp tư vấn tâm lý học đường.`,
      result: 'Đang theo dõi; em đã viết bản tự kiểm điểm.',
    },
    {
      code: 'HS2026002',
      day: 18,
      kind: StudentNoteKind.ATTENTION,
      content: 'Dùng điện thoại di động trong giờ học, đã bị nhắc nhở rồi phê bình.',
      action: 'Trao đổi với gia đình về việc quản lý điện thoại của con; đầu giờ em gửi điện thoại cho giáo viên chủ nhiệm.',
    },
    {
      code: 'HS2026014',
      day: 23,
      kind: StudentNoteKind.PROGRESS,
      content: 'Em mới chuyển từ lớp 6A2 sang theo nguyện vọng gia đình, được xếp vào tổ 2.',
      action: `Giao bạn tổ trưởng ${name('HS2026006')} giúp em làm quen nề nếp của lớp.`,
      result: 'Em đã hòa nhập tốt, tích cực tham gia hoạt động của lớp.',
    },
    {
      code: 'HS2026001',
      day: 25,
      kind: StudentNoteKind.OUTSTANDING,
      content: 'Đạt giải Nhất cuộc thi "Rung chuông vàng" khối 6; học tốt môn Toán, tích cực giúp đỡ bạn.',
      action: 'Đề nghị nhà trường khen thưởng; giới thiệu vào đội tuyển học sinh giỏi Toán 6.',
      result: 'Được Hiệu trưởng tặng giấy khen.',
    },
  ];
  for (const n of notes) await book.addNote(writer, { classId, studentId: id(n.code), date: on(n.day), kind: n.kind, content: n.content, action: n.action ?? null, result: n.result ?? null });

  if (principal) {
    const asPrincipal: AuthUser = { userId: principal.id, schoolId, districtId: null, role: Role.ADMIN, email: PRINCIPAL_EMAIL };
    // "cô Lan", "thầy Hùng": how the principal addresses the homeroom teacher.
    const homeroom = klass.homeroomTeacher;
    const addressed = homeroom?.gender ? `${homeroom.gender === Gender.FEMALE ? 'cô' : 'thầy'} ${homeroom.fullName.split(' ').pop()}` : 'giáo viên chủ nhiệm';
    await book.addReview(asPrincipal, {
      classId,
      date: on(30),
      content: `Sổ ghi chép đầy đủ, rõ ràng; kế hoạch năm học và kế hoạch tháng cụ thể, sát tình hình lớp. Đề nghị ${addressed} tiếp tục phối hợp với gia đình theo dõi các học sinh cần quan tâm, giúp đỡ và ghi đánh giá kết quả tháng 10.`,
    });
  }
}
