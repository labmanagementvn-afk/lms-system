import { AbsenceRequestStatus, AwardForm, DisciplineMeasure, Gender, GuardianRelationship, HomeroomStatus, MovementKind, NotificationKind, PolicyGroup, Prisma, PrismaClient, Session, StudentStatus } from '@prisma/client';
import { localDate, zonedToUtc } from '../../src/common/time';
import { leaveDays, leaveNote } from '../../src/homeroom/absence.service';
import { addDays, dayOfWeek, dmy, fromDbDate, mondayOf, toDbDate } from '../../src/homeroom/dates';
import { AWARD_LABEL, MEASURE_LABEL } from '../../src/students/discipline-rules';
import { moveYearToClass } from '../../src/students/movements.service';
import { SeedContext } from './context';

// Phase 9 (hồ sơ học sinh): the rest of every student's record and family, how each one
// came to the school, this year's movements (a transfer in, a class change, a drop-out
// who came back, a transfer out), commendations and discipline under Thông tư 19/2025,
// and leave requests in 6A1: the approved ones behind its "có phép" roll calls, one
// declined, and two waiting for the homeroom teacher, one of them from the demo parent.

/** Where the families live, near the school: street, then ward of Hà Nội. */
const HOMES: [string, string][] = [
  ['Số 12 ngõ 68 Trần Thái Tông', 'Phường Cầu Giấy'],
  ['Số 5 ngõ 175 Xuân Thủy', 'Phường Cầu Giấy'],
  ['Số 21 Nguyễn Khang', 'Phường Yên Hòa'],
  ['Số 33 Hoàng Quốc Việt', 'Phường Nghĩa Đô'],
  ['Số 8 ngách 12 ngõ 105 Doãn Kế Thiện', 'Phường Cầu Giấy'],
  ['Số 17 ngõ 1 Trần Quốc Hoàn', 'Phường Cầu Giấy'],
  ['Số 46 Trung Kính', 'Phường Yên Hòa'],
  ['Số 9 ngõ 82 Chùa Láng', 'Phường Láng'],
  ['Số 120 Nghĩa Tân', 'Phường Nghĩa Đô'],
  ['Số 3 ngõ 29 Trần Cung', 'Phường Nghĩa Đô'],
  ['Số 64 Nguyễn Văn Huyên', 'Phường Nghĩa Đô'],
];
const HOMETOWNS = ['Hà Nội', 'Ninh Bình', 'Thanh Hóa', 'Nghệ An', 'Hưng Yên', 'Bắc Ninh', 'Hải Phòng', 'Phú Thọ', 'Hà Tĩnh', 'Thái Nguyên'];
const FATHER_JOBS = ['Kỹ sư xây dựng', 'Kinh doanh tự do', 'Công chức', 'Lái xe', 'Bác sĩ', 'Công nhân', 'Kỹ sư phần mềm', 'Quân nhân', 'Giảng viên', 'Nhân viên ngân hàng', 'Thợ điện'];
const MOTHER_JOBS = ['Giáo viên', 'Nhân viên văn phòng', 'Kế toán', 'Kinh doanh tự do', 'Điều dưỡng', 'Nội trợ', 'Công nhân may', 'Nhân viên ngân hàng', 'Dược sĩ'];
const MOTHER_FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đỗ', 'Bùi', 'Ngô', 'Đặng', 'Phan', 'Dương'];
const MOTHER_GIVEN = ['Thị Hoa', 'Thị Mai', 'Thu Hằng', 'Thị Lan', 'Thanh Hương', 'Thị Hà', 'Ngọc Anh', 'Thị Thủy', 'Minh Phương', 'Thị Nga', 'Thu Trang', 'Thị Hạnh', 'Thị Huyền'];

interface Particular {
  ethnicity?: string;
  religion?: string;
  birthPlace?: string;
  /** Province code that starts the 12-digit mã định danh (001 Hà Nội). */
  idProvince?: string;
  policyGroups?: PolicyGroup[];
  /** Nơi thường trú when it is not where the family lives now. */
  permanent?: [string, string, string];
  father?: string;
  mother?: string | null;
}

/** Core students (by position) whose record has something particular. */
const PARTICULAR: Record<number, Particular> = {
  5: { religion: 'Công giáo' },
  6: { policyGroups: [PolicyGroup.POOR_HOUSEHOLD], father: 'Lao động tự do', mother: 'Buôn bán nhỏ' },
  12: { ethnicity: 'Tày', birthPlace: 'Tuyên Quang', idProvince: '008', policyGroups: [PolicyGroup.NEAR_POOR_HOUSEHOLD], permanent: ['Tổ dân phố 5', 'Phường Minh Xuân', 'Tuyên Quang'] },
  16: { religion: 'Phật giáo' },
  // Mồ côi mẹ: no mother on the record.
  17: { policyGroups: [PolicyGroup.ORPHAN], mother: null },
  24: { ethnicity: 'Mường', birthPlace: 'Phú Thọ', idProvince: '017', policyGroups: [PolicyGroup.DISABILITY], permanent: ['Tổ 3', 'Phường Hòa Bình', 'Phú Thọ'] },
  27: { birthPlace: 'Đà Nẵng', idProvince: '048', permanent: ['Số 45 Nguyễn Văn Linh', 'Phường Hải Châu', 'Đà Nẵng'] },
};

/** Days after the start of the school year (05/09), all school days but the Saturday sports award. */
const AWARDS: { i: number; form: AwardForm; day: number; content: string; by: string; issuer?: string; decisionNo?: string }[] = [
  { i: 0, form: AwardForm.CLASS_PRAISE, day: 20, content: 'Tích cực phát biểu xây dựng bài, giúp bạn cùng bàn tiến bộ môn Toán', by: 'GV001' },
  { i: 11, form: AwardForm.CLASS_PRAISE, day: 23, content: 'Đạt điểm 10 bài kiểm tra thường xuyên môn Ngữ văn', by: 'GV002' },
  { i: 3, form: AwardForm.CLASS_PRAISE, day: 25, content: 'Hoàn thành tốt nhiệm vụ lớp trưởng trong tháng 9', by: 'GV001' },
  { i: 22, form: AwardForm.LETTER, day: 27, content: 'Tiến bộ vượt bậc môn Tiếng Anh trong tháng 9', by: 'GV003' },
  { i: 25, form: AwardForm.OTHER, day: 28, content: 'Đạt giải Ba môn Cờ vua, Hội khỏe Phù Đổng cấp phường', by: 'admin', issuer: 'UBND phường Cầu Giấy', decisionNo: '1203/QĐ-UBND' },
  { i: 0, form: AwardForm.PRINCIPAL_CERTIFICATE, day: 30, content: 'Đạt giải Nhất cuộc thi "Rung chuông vàng" khối 6', by: 'admin', decisionNo: '52/QĐ-THCS' },
  { i: 21, form: AwardForm.SCHOOL_PRAISE, day: 30, content: 'Nhặt được ví tiền và trả lại người đánh rơi', by: 'admin' },
];

/**
 * Each student's measures follow Điều 14 and 15: a reminder first, criticism for a
 * repeat or a level 2 violation, a self-review after criticism or for level 3. The
 * demo parent's second child has a self-review waiting for the family to confirm.
 */
const DISCIPLINE: { i: number; measure: DisciplineMeasure; severity: number; day: number; violation: string; by: string; support?: string; confirmedDay?: number }[] = [
  { i: 7, measure: DisciplineMeasure.REMINDER, severity: 1, day: 11, violation: 'Nói chuyện riêng nhiều lần trong giờ học', by: 'GV001' },
  { i: 1, measure: DisciplineMeasure.REMINDER, severity: 1, day: 17, violation: 'Sử dụng điện thoại di động trong giờ học', by: 'GV001' },
  { i: 14, measure: DisciplineMeasure.REMINDER, severity: 1, day: 19, violation: 'Không mang sách vở môn Tiếng Anh', by: 'GV003' },
  { i: 7, measure: DisciplineMeasure.CRITICISM, severity: 2, day: 24, violation: 'Xô đẩy bạn trong giờ ra chơi', by: 'GV001' },
  { i: 1, measure: DisciplineMeasure.CRITICISM, severity: 1, day: 25, violation: 'Tiếp tục sử dụng điện thoại di động trong giờ học sau khi đã được nhắc nhở', by: 'GV001' },
  { i: 23, measure: DisciplineMeasure.REMINDER, severity: 1, day: 26, violation: 'Không mặc đồng phục theo quy định', by: 'GV003' },
  {
    i: 26,
    measure: DisciplineMeasure.SELF_REVIEW,
    severity: 3,
    day: 30,
    violation: 'Đăng ảnh chế giễu bạn cùng lớp lên mạng xã hội',
    by: 'admin',
    support: 'Tư vấn tâm lý học đường; nhà trường phối hợp với gia đình hướng dẫn con sử dụng mạng xã hội an toàn',
    confirmedDay: 31,
  },
  { i: 7, measure: DisciplineMeasure.SELF_REVIEW, severity: 2, day: 31, violation: 'Đánh nhau với bạn cùng lớp trong giờ ra chơi', by: 'GV001', support: 'Giáo viên chủ nhiệm gặp gia đình; học sinh được tư vấn tâm lý học đường', confirmedDay: 32 },
  {
    i: 1,
    measure: DisciplineMeasure.SELF_REVIEW,
    severity: 2,
    day: 32,
    violation: 'Quay video bạn trong lớp và gửi lên nhóm chat khi chưa được bạn đồng ý',
    by: 'GV001',
    support: 'Giáo viên chủ nhiệm trao đổi với gia đình về việc quản lý điện thoại của con',
  },
];

/** Reasons of the approved requests behind 6A1's "có phép" roll calls, oldest first; the second was phoned in. */
const LEAVE_REASONS = [
  'Gia đình có việc hiếu ở quê, xin cho con nghỉ học',
  'Phụ huynh gọi điện báo con bị đau bụng',
  'Con bị sốt, gia đình xin cho con nghỉ để đi khám',
  'Con bị đau họng, gia đình cho con ở nhà theo dõi',
];

const digits = (n: number, len: number) => String(n).padStart(len, '0').slice(-len);
/** A 12-digit mã định danh: province, century and sex, year of birth, then six digits. */
const idNumber = (province: string, female: boolean, year: number, n: number) => `${province}${year >= 2000 ? (female ? 3 : 2) : female ? 1 : 0}${digits(year % 100, 2)}${digits(100000 + ((n * 48271 + 13579) % 900000), 6)}`;

export async function seedStudentRecords(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId, academicYearId, classes, teacherUsers, adminUserId } = ctx;
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
  const year = await prisma.academicYear.findUniqueOrThrow({ where: { id: academicYearId }, select: { startDate: true } });
  const tz = school.timezone;
  const now = new Date();
  const today = localDate(now, tz);
  const start = fromDbDate(year.startDate);
  const startYear = Number(start.slice(0, 4));
  /** A school day `n` days into the year, never later than today. */
  const on = (n: number) => (addDays(start, n) < today ? addDays(start, n) : today);
  /** A local wall-clock time, never later than a minute ago. */
  const at = (date: string, time: string) => {
    const t = zonedToUtc(`${date} ${time}`, tz);
    return t.getTime() < now.getTime() - 60_000 ? t : new Date(now.getTime() - 60_000);
  };
  const userOf = (by: string) => (by === 'admin' ? adminUserId : (teacherUsers[by] ?? adminUserId));

  // ---- The record and the family ----
  const ninth = await prisma.student.findMany({ where: { schoolId, code: { startsWith: 'HS2023' } }, select: { id: true }, orderBy: { code: 'asc' } });
  const ids = [...ctx.studentIds, ...ninth.map((s) => s.id)];
  const students = new Map((await prisma.student.findMany({ where: { id: { in: ids } }, include: { guardians: true } })).map((s) => [s.id, s]));
  for (const [i, id] of ids.entries()) {
    const s = students.get(id);
    if (!s || s.idNumber) continue;
    const p = PARTICULAR[i] ?? {};
    // The two children of the demo parent are brother and sister: one home, one family.
    const f = i === 1 ? 0 : i;
    const [street, ward] = HOMES[f % HOMES.length];
    const born = s.dateOfBirth?.getUTCFullYear() ?? 2014;
    await prisma.student.update({
      where: { id },
      data: {
        idNumber: idNumber(p.idProvince ?? '001', s.gender === Gender.FEMALE, born, i + 1),
        moetCode: `01${digits(40210000 + i * 1373, 8)}`,
        birthPlace: p.birthPlace ?? 'Hà Nội',
        hometown: HOMETOWNS[(f * 3) % HOMETOWNS.length],
        ethnicity: p.ethnicity ?? 'Kinh',
        religion: p.religion ?? null,
        nationality: 'Việt Nam',
        address: s.address && s.address !== 'Hà Nội' ? s.address : street,
        currentWard: ward,
        currentProvince: 'Hà Nội',
        permanentAddress: p.permanent?.[0] ?? street,
        permanentWard: p.permanent?.[1] ?? ward,
        permanentProvince: p.permanent?.[2] ?? 'Hà Nội',
        policyGroups: p.policyGroups ?? [],
        youngPioneer: true,
      },
    });
    for (const g of s.guardians.filter((g) => g.relationship === GuardianRelationship.FATHER && !g.occupation)) {
      const born = 1976 + ((f * 7) % 12);
      await prisma.guardian.update({ where: { id: g.id }, data: { birthYear: born, occupation: p.father ?? FATHER_JOBS[f % FATHER_JOBS.length], idNumber: idNumber('001', false, born, f + 101) } });
    }
    if (p.mother !== null && !s.guardians.some((g) => g.relationship === GuardianRelationship.MOTHER)) {
      const born = 1979 + ((f * 5) % 10);
      await prisma.guardian.create({
        data: {
          studentId: id,
          fullName: `${MOTHER_FAMILY[(f + 3) % MOTHER_FAMILY.length]} ${MOTHER_GIVEN[f % MOTHER_GIVEN.length]}`,
          relationship: GuardianRelationship.MOTHER,
          phone: `0976${digits(100000 + f * 1371, 6)}`,
          isPrimary: false,
          birthYear: born,
          occupation: p.mother ?? MOTHER_JOBS[(f * 2) % MOTHER_JOBS.length],
          idNumber: idNumber('001', true, born, f + 201),
        },
      });
    }
  }

  // ---- How each student came to the school, and this year's movements ----
  const enrolment = async (studentId: string) =>
    (await prisma.enrollment.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId } }, select: { classId: true } }))?.classId ?? null;
  const movement = (studentId: string, kind: MovementKind, date: string, rest: Partial<Prisma.StudentMovementUncheckedCreateInput> = {}) =>
    prisma.studentMovement.create({ data: { schoolId, studentId, kind, date: toDbDate(date), createdById: adminUserId, createdAt: at(date, '09:30'), ...rest } });
  const TRANSFERRED_IN: Record<number, { date: string; from: string; reason: string; documentNo: string }> = {
    15: { date: on(9), from: 'Trường THCS Thanh Xuân Nam, Hà Nội', reason: 'Gia đình chuyển nơi ở', documentNo: '45/GGT' },
    27: { date: `${startYear}-08-20`, from: 'Trường THCS Lê Quý Đôn, Đà Nẵng', reason: 'Gia đình chuyển nơi ở ra Hà Nội', documentNo: '112/GGT' },
  };
  for (const [i, id] of ids.entries()) {
    const t = TRANSFERRED_IN[i];
    if (t) await movement(id, MovementKind.TRANSFER_IN, t.date, { academicYearId, toClassId: await enrolment(id), otherSchool: t.from, reason: t.reason, documentNo: t.documentNo });
    // Grade 6 came in this year; 7A1 a year ago and 9A1 three years ago, before the demo's first school year.
    else if (i < 20) await movement(id, MovementKind.ENROLLED, start, { academicYearId, toClassId: await enrolment(id) });
    else await movement(id, MovementKind.ENROLLED, `${i < 30 ? startYear - 1 : startYear - 3}-${start.slice(5)}`);
  }

  const [moving, dropping, leaving] = [ids[13], ids[18], ids[29]];
  // Chuyển lớp: a 6A2 student joins 6A1 at the family's request and is on 6A1's roll calls from then on.
  const from = await enrolment(moving);
  if (from && from === classes['6A2'] && classes['6A1']) {
    const date = on(16);
    await prisma.$transaction((tx) => moveYearToClass(tx, { studentId: moving, academicYearId, toClassId: classes['6A1'], date }));
    await movement(moving, MovementKind.CLASS_CHANGE, date, { academicYearId, fromClassId: from, toClassId: classes['6A1'], reason: 'Theo nguyện vọng của gia đình' });
    const days = await prisma.homeroomAttendance.findMany({ where: { classId: classes['6A1'], date: { gte: toDbDate(date) } }, distinct: ['date'], select: { date: true, recordedById: true } });
    await prisma.homeroomAttendance.createMany({
      data: days.map((d) => ({ schoolId, classId: classes['6A1'], studentId: moving, date: d.date, status: HomeroomStatus.PRESENT, recordedById: d.recordedById })),
      skipDuplicates: true,
    });
  }
  // Thôi học, then back to the same class after the family settled.
  const dropClass = await enrolment(dropping);
  if (dropClass) {
    await movement(dropping, MovementKind.DROPPED, on(20), { academicYearId, fromClassId: dropClass, reason: 'Gia đình gặp khó khăn, con theo bố mẹ về quê' });
    await movement(dropping, MovementKind.RETURNED, on(31), { academicYearId, fromClassId: dropClass, toClassId: dropClass, reason: 'Gia đình đã ổn định, xin cho con đi học lại' });
  }
  // Chuyển đi: the school's letter of introduction prints from the student's record.
  const leaver = await prisma.student.findUnique({ where: { id: leaving }, select: { status: true, userId: true } });
  const leaveClass = await enrolment(leaving);
  if (leaver?.status === StudentStatus.STUDYING && leaveClass) {
    await prisma.student.update({ where: { id: leaving }, data: { status: StudentStatus.TRANSFERRED } });
    if (leaver.userId) await prisma.user.update({ where: { id: leaver.userId }, data: { isActive: false } });
    await movement(leaving, MovementKind.TRANSFER_OUT, on(30), { academicYearId, fromClassId: leaveClass, otherSchool: 'Trường THCS Trần Phú, Hải Phòng', reason: 'Gia đình chuyển nơi ở về Hải Phòng', documentNo: '27/GGT' });
  }

  // ---- Commendations and discipline, each told to the parents as the app does ----
  const parentsOf = async (studentId: string) => (await prisma.guardian.findMany({ where: { studentId, userId: { not: null }, user: { isActive: true } }, select: { userId: true } })).map((g) => g.userId as string);
  const tell = async (studentId: string, kind: NotificationKind, title: string, body: string, when: Date, read: boolean, data: Prisma.InputJsonValue) => {
    const users = [...new Set(await parentsOf(studentId))];
    if (users.length) await prisma.notification.createMany({ data: users.map((userId) => ({ schoolId, userId, kind, title, body, data, studentId, createdAt: when, readAt: read ? new Date(when.getTime() + 2 * 3600_000) : null })) });
  };
  const studying = new Map((await prisma.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, status: true } })).map((s) => [s.id, s]));
  for (const a of AWARDS) {
    const s = studying.get(ids[a.i]);
    const classId = s?.status === StudentStatus.STUDYING ? await enrolment(s.id) : null;
    if (!s || !classId) continue;
    const date = on(a.day);
    const when = at(date, '10:15');
    await prisma.studentAward.create({ data: { schoolId, studentId: s.id, academicYearId, classId, form: a.form, date: toDbDate(date), content: a.content, issuer: a.issuer ?? null, decisionNo: a.decisionNo ?? null, createdById: userOf(a.by), createdAt: when } });
    await tell(s.id, NotificationKind.STUDENT_AWARD, 'Con được khen thưởng', `${s.fullName} được ${AWARD_LABEL[a.form].toLowerCase()} ngày ${dmy(date)}: ${a.content}.`, when, true, { studentId: s.id, classId });
  }
  for (const d of DISCIPLINE) {
    const s = studying.get(ids[d.i]);
    const classId = s?.status === StudentStatus.STUDYING ? await enrolment(s.id) : null;
    if (!s || !classId) continue;
    const date = on(d.day);
    const when = at(date, '15:40');
    const confirmed = d.confirmedDay !== undefined ? on(d.confirmedDay) : null;
    await prisma.studentDiscipline.create({
      data: { schoolId, studentId: s.id, academicYearId, classId, measure: d.measure, severity: d.severity, date: toDbDate(date), violation: d.violation, support: d.support ?? null, familyConfirmedAt: confirmed ? toDbDate(confirmed) : null, createdById: userOf(d.by), createdAt: when },
    });
    const ask = d.measure === DisciplineMeasure.SELF_REVIEW ? ' Gia đình vui lòng xem bản tự kiểm điểm của con, xác nhận và cùng nhà trường giúp con khắc phục.' : '';
    const waiting = d.measure === DisciplineMeasure.SELF_REVIEW && !confirmed;
    await tell(s.id, NotificationKind.STUDENT_DISCIPLINE, 'Thông báo từ nhà trường', `Ngày ${dmy(date)}, ${s.fullName} vi phạm: ${d.violation}. Biện pháp giáo dục: ${MEASURE_LABEL[d.measure].toLowerCase()}.${ask}`, when, !waiting, { studentId: s.id, classId });
  }

  // ---- Leave requests in 6A1 ----
  const classId = classes['6A1'];
  const homeroomUser = teacherUsers.GV001;
  if (!classId || !homeroomUser) return;
  const klass = await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true } });
  const nameOf = async (userId: string) => (await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }))?.fullName ?? '';
  const inClass = async (i: number) => (studying.get(ids[i])?.status === StudentStatus.STUDYING && (await enrolment(ids[i])) === classId ? ids[i] : null);
  type Leave = { studentId: string; fromDate: string; toDate: string; session?: Session; reason: string; status: AbsenceRequestStatus; requestedById: string; createdAt: Date; decidedAt?: Date; decisionNote?: string };
  const create = async (r: Leave) => {
    const row = await prisma.absenceRequest.create({
      data: {
        schoolId,
        classId,
        studentId: r.studentId,
        fromDate: toDbDate(r.fromDate),
        toDate: toDbDate(r.toDate),
        session: r.session ?? null,
        reason: r.reason,
        status: r.status,
        requestedById: r.requestedById,
        decidedById: r.decidedAt ? homeroomUser : null,
        decidedAt: r.decidedAt ?? null,
        decisionNote: r.decisionNote ?? null,
        createdAt: r.createdAt,
      },
    });
    const days = leaveDays({ fromDate: r.fromDate, toDate: r.toDate, session: r.session ?? null });
    const student = studying.get(r.studentId)!.fullName;
    if (r.status === AbsenceRequestStatus.PENDING) {
      await prisma.notification.create({
        data: { schoolId, userId: homeroomUser, kind: NotificationKind.ABSENCE_REQUEST, title: `Đơn xin nghỉ học lớp ${klass.name}`, body: `Phụ huynh ${await nameOf(r.requestedById)} xin cho ${student} nghỉ học ${days}. Lý do: ${r.reason}`, data: { requestId: row.id, studentId: r.studentId, classId }, studentId: r.studentId, createdAt: r.createdAt },
      });
    } else if (r.decidedAt) {
      const body =
        r.requestedById === homeroomUser
          ? `Nhà trường đã ghi nhận đơn xin nghỉ học của ${student} ${days}.`
          : `Đơn xin nghỉ học của ${student} ${days} ${r.status === AbsenceRequestStatus.APPROVED ? 'đã được giáo viên chủ nhiệm duyệt' : 'không được duyệt'}.${r.decisionNote ? ` Ghi chú: ${r.decisionNote}` : ''}`;
      await tell(r.studentId, NotificationKind.ABSENCE_DECIDED, 'Đơn xin nghỉ học', body, r.decidedAt, true, { requestId: row.id, studentId: r.studentId, classId, status: r.status });
    }
  };

  // The "có phép" roll calls of the last school days came with a request, approved before class.
  const excused = (await prisma.homeroomAttendance.findMany({ where: { classId, status: HomeroomStatus.EXCUSED }, orderBy: { date: 'desc' }, take: LEAVE_REASONS.length, select: { id: true, studentId: true, date: true } })).reverse();
  for (const [k, e] of excused.entries()) {
    const date = fromDbDate(e.date);
    const [parent] = await parentsOf(e.studentId);
    const reason = LEAVE_REASONS[k];
    if (!studying.has(e.studentId)) continue;
    const phoned = k === 1 || !parent;
    await create({
      studentId: e.studentId,
      fromDate: date,
      toDate: date,
      reason,
      status: AbsenceRequestStatus.APPROVED,
      requestedById: phoned ? homeroomUser : parent,
      createdAt: phoned ? at(date, '06:40') : at(addDays(date, -1), '20:15'),
      decidedAt: at(date, '06:45'),
    });
    await prisma.homeroomAttendance.update({ where: { id: e.id }, data: { note: leaveNote(reason) } });
  }

  // The next school days: two requests waiting for the homeroom teacher, one declined, one withdrawn.
  const nextSchoolDay = (d: string) => {
    let n = addDays(d, 1);
    while (dayOfWeek(n) > 5) n = addDays(n, 1);
    return n;
  };
  const first = nextSchoolDay(today);
  const later = nextSchoolDay(first);
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  const [a, b, c, d] = await Promise.all([0, 6, 2, 1].map(inClass));
  const parentOf = async (id: string | null) => (id ? (await parentsOf(id))[0] : undefined);
  const [pa, pb, pc] = await Promise.all([parentOf(a), parentOf(b), parentOf(c)]);
  if (a && pa) await create({ studentId: a, fromDate: first, toDate: first, session: Session.MORNING, reason: 'Con đi khám răng theo lịch hẹn của bệnh viện', status: AbsenceRequestStatus.PENDING, requestedById: pa, createdAt: ago(35) });
  if (b && pb) await create({ studentId: b, fromDate: later, toDate: nextSchoolDay(later), reason: 'Gia đình đưa con về quê dự đám cưới của cô ruột', status: AbsenceRequestStatus.PENDING, requestedById: pb, createdAt: ago(190) });
  if (c && pc) {
    const monday = addDays(mondayOf(today), 14);
    await create({
      studentId: c,
      fromDate: monday,
      toDate: addDays(monday, 2),
      reason: 'Gia đình cho con đi du lịch cùng bố mẹ',
      status: AbsenceRequestStatus.REJECTED,
      requestedById: pc,
      createdAt: ago(26 * 60),
      decidedAt: ago(21 * 60),
      decisionNote: 'Tuần này lớp kiểm tra giữa học kỳ. Đề nghị gia đình sắp xếp lịch khác để con không lỡ bài kiểm tra.',
    });
  }
  if (d && pa) await create({ studentId: d, fromDate: first, toDate: first, session: Session.AFTERNOON, reason: 'Gia đình có việc riêng', status: AbsenceRequestStatus.CANCELLED, requestedById: pa, createdAt: ago(2 * 24 * 60) });
}
