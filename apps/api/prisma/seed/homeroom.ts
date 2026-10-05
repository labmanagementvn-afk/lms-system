import { HomeroomStatus, LessonLogStatus, Prisma, PrismaClient } from '@prisma/client';
import { localDate } from '../../src/common/time';
import { addDays, dayOfWeek, eachDay, mondayOf, toDbDate } from '../../src/homeroom/dates';
import { SeedContext } from './context';

// Demo roll calls and lesson logbook entries for class 6A1.

const CONTENT: Record<string, string> = {
  TOAN: 'Bài 3: Phân số',
  VAN: 'Bài 4: Truyện cổ tích Thạch Sanh',
  ANH: 'Unit 3: My friends',
  KHTN: 'Bài 5: Tế bào - đơn vị cơ bản của sự sống',
  LSDL: 'Bài 2: Thời nguyên thủy',
  GDCD: 'Bài 2: Yêu thương con người',
  TIN: 'Bài 3: Thông tin trong máy tính',
  CN: 'Bài 2: Sử dụng đồ dùng gia đình an toàn',
  GDTC: 'Chạy ngắn 60m: kỹ thuật xuất phát',
  NT: 'Vẽ tranh đề tài trường em',
};
const COMMENTS = ['Lớp học sôi nổi, hoàn thành bài tập', 'Một số em chưa chuẩn bị bài', 'Trật tự, tích cực phát biểu', 'Cần nhắc nhở nói chuyện riêng'];

export async function seedHomeroom(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId } = ctx;
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  const classId = ctx.classes['6A1'];
  const students = ctx.studentIds.slice(0, 10);
  const today = localDate(new Date(), school.timezone);

  // ---- Roll call for the last 5 weekdays (today included when it is one) ----
  const days: string[] = [];
  for (let d = today; days.length < 5; d = addDays(d, -1)) if (dayOfWeek(d) <= 5) days.push(d);
  days.reverse();

  const attendance: Prisma.HomeroomAttendanceCreateManyInput[] = [];
  const absentByDay = new Map<string, string[]>();
  days.forEach((date, di) => {
    students.forEach((studentId, i) => {
      const n = di * 10 + i;
      let status: HomeroomStatus = HomeroomStatus.PRESENT;
      let note: string | null = null;
      if (n % 17 === 3) [status, note] = [HomeroomStatus.ABSENT, 'Không liên lạc được với phụ huynh'];
      else if (n % 13 === 5) [status, note] = [HomeroomStatus.EXCUSED, 'Phụ huynh xin phép nghỉ ốm'];
      else if (n % 11 === 7) [status, note] = [HomeroomStatus.LATE, 'Vào cổng lúc 07:25'];
      if (status === HomeroomStatus.ABSENT || status === HomeroomStatus.EXCUSED) absentByDay.set(date, [...(absentByDay.get(date) ?? []), studentId]);
      attendance.push({ schoolId, classId, studentId, date: toDbDate(date), status, note, recordedById: ctx.teacherUsers.GV001 });
    });
  });
  await prisma.homeroomAttendance.createMany({ data: attendance, skipDuplicates: true });

  // ---- Logbook for this week's past school days (last week when today is Monday), following the timetable ----
  const monday = mondayOf(today);
  let lessonDays = eachDay(monday, addDays(today, -1)).filter((d) => dayOfWeek(d) <= 5);
  if (!lessonDays.length) lessonDays = eachDay(addDays(monday, -7), addDays(monday, -3));
  const entries = await prisma.timetableEntry.findMany({
    where: { classId, academicYearId: ctx.academicYearId, semester: 1 },
    include: { subject: { select: { code: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
  });

  const logs: Prisma.LessonLogCreateManyInput[] = [];
  let n = 0;
  for (const date of lessonDays) {
    for (const e of entries.filter((e) => e.dayOfWeek === dayOfWeek(date))) {
      const cancelled = n === 4; // one period the teacher could not hold
      logs.push({
        schoolId,
        classId,
        subjectId: e.subjectId,
        teacherId: e.teacherId,
        date: toDbDate(date),
        periodNumber: e.periodNumber,
        semester: e.semester,
        content: cancelled ? 'Giáo viên đi tập huấn, lớp tự học' : (CONTENT[e.subject.code] ?? `Bài ${(n % 5) + 1}`),
        comment: cancelled ? null : COMMENTS[n % COMMENTS.length],
        rating: cancelled ? null : String(8 + (n % 3)),
        status: cancelled ? LessonLogStatus.CANCELLED : LessonLogStatus.DONE,
        absentStudentIds: cancelled ? [] : (absentByDay.get(date) ?? []),
      });
      n++;
    }
  }
  if (logs.length) await prisma.lessonLog.createMany({ data: logs, skipDuplicates: true });
}
