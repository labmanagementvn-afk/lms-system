import { AlertKind, Direction, DistrictLevel, EventMethod, EventSource, Gender, Prisma, PrismaClient, Role } from '@prisma/client';
import { localDate, zonedToUtc } from '../../src/common/time';
import { addDays, toDbDate } from '../../src/homeroom/dates';
import { PrismaService } from '../../src/prisma/prisma.service';
import { evaluateRule, schoolDaysEndingAt } from '../../src/stats/alert-rules';
import { DailyStatsService } from '../../src/stats/daily-stats.service';
import { SeedContext } from './context';

// Phase 5: a Phòng GD&ĐT with two schools, two weeks of gate traffic and daily statistics,
// alert rules with the events they raised, and a few audit rows so every district page has data.

const DAYS = 14;

/** Deterministic pseudo-random in [0, 1) from a few integers. */
const noise = (...parts: number[]) => {
  let h = 2166136261;
  for (const p of parts) h = Math.imul(h ^ p, 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
};

export async function seedDistrict(prisma: PrismaClient, ctx: SeedContext) {
  const district = await prisma.district.create({
    data: { code: 'CAUGIAY', name: 'Phòng GD&ĐT Quận Cầu Giấy', level: DistrictLevel.PHONG, province: 'Hà Nội' },
  });
  await prisma.school.update({
    where: { id: ctx.schoolId },
    data: { districtId: district.id, moetCode: '01-0123-456', province: 'Hà Nội', address: 'Số 1 Trần Duy Hưng, Cầu Giấy, Hà Nội' },
  });
  await prisma.user.create({
    data: { districtId: district.id, email: 'pgd@caugiay.edu.vn', fullName: 'Chuyên viên Phòng GD&ĐT', role: Role.DISTRICT, passwordHash: await ctx.hash('District@123') },
  });

  // ---- A second school so the district pages compare something ----
  const school2 = await prisma.school.create({
    data: { code: 'DEMO2', name: 'Trường THCS Demo 2', address: 'Phố Dịch Vọng, Cầu Giấy, Hà Nội', districtId: district.id, moetCode: '01-0123-457', province: 'Hà Nội' },
  });
  await prisma.user.create({ data: { schoolId: school2.id, email: 'admin@demo2.edu.vn', fullName: 'Quản trị viên Demo 2', role: Role.ADMIN, passwordHash: await ctx.hash('Admin@123') } });
  const year2 = await prisma.academicYear.create({
    data: { schoolId: school2.id, name: '2026-2027', startDate: new Date('2026-09-05'), endDate: new Date('2027-05-31'), isCurrent: true },
  });
  const homeroom2 = await prisma.teacher.create({ data: { schoolId: school2.id, code: 'GV001', fullName: 'Ngô Thị Hạnh', gender: Gender.FEMALE } });
  const homeroom3 = await prisma.teacher.create({ data: { schoolId: school2.id, code: 'GV002', fullName: 'Đỗ Văn Khánh', gender: Gender.MALE } });
  const class2 = await prisma.class.create({ data: { schoolId: school2.id, academicYearId: year2.id, name: '6A1', gradeLevel: 6, homeroomTeacherId: homeroom2.id, room: 'P.101' } });
  const class3 = await prisma.class.create({ data: { schoolId: school2.id, academicYearId: year2.id, name: '7A1', gradeLevel: 7, homeroomTeacherId: homeroom3.id, room: 'P.201' } });
  const given = ['An', 'Bình', 'Chi', 'Dương', 'Hà', 'Khang', 'Lam', 'Minh', 'Ngân', 'Phong', 'Quỳnh', 'Sơn', 'Thảo', 'Uyên', 'Vinh'];
  const students2: string[] = [];
  for (const [cls, grade] of [[class2.id, 6], [class3.id, 7]] as const) {
    for (let i = 0; i < 15; i++) {
      const s = await prisma.student.create({
        data: {
          schoolId: school2.id,
          code: `HS${grade}${String(i + 1).padStart(3, '0')}`,
          fullName: `${['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng'][i % 5]} ${i % 2 ? 'Thị' : 'Văn'} ${given[i]}`,
          gender: i % 2 ? Gender.FEMALE : Gender.MALE,
          dateOfBirth: new Date(`${2026 - grade - 6}-0${(i % 9) + 1}-1${i % 9}`),
          enrollments: { create: { classId: cls, academicYearId: year2.id } },
        },
      });
      students2.push(s.id);
    }
  }

  // ---- Two weeks of gate traffic for both schools ----
  const school = await prisma.school.findUniqueOrThrow({ where: { id: ctx.schoolId } });
  const today = localDate(new Date(), school.timezone);
  const days = schoolDaysEndingAt(today, DAYS);
  const device = await prisma.attendanceDevice.findFirst({ where: { schoolId: ctx.schoolId } });
  const events: Prisma.GateEventCreateManyInput[] = [];
  const traffic = (schoolId: string, studentIds: string[], seed: number, deviceId?: string) => {
    studentIds.forEach((studentId, i) => {
      days.forEach((date, di) => {
        // The last two students of the first school stay home for the final four school days (an absence streak).
        const streak = seed === 1 && i >= studentIds.length - 2 && di >= days.length - 4;
        const r = noise(seed, i, di);
        if (streak || r < 0.06) return;
        const late = r > 0.9;
        const minute = late ? 20 + Math.floor(noise(seed, di, i) * 30) : Math.floor(noise(di, seed, i) * 40);
        const hour = late ? 7 : 6 + (minute >= 30 ? 1 : 0);
        const mm = late ? minute : minute >= 30 ? minute - 30 : minute + 20;
        const inAt = zonedToUtc(`${date} ${String(hour).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(Math.floor(r * 60)).padStart(2, '0')}`, school.timezone);
        events.push({ schoolId, deviceId, studentId, method: EventMethod.CARD, direction: Direction.IN, occurredAt: inAt, source: EventSource.DEVICE, externalEventId: deviceId ? `seed-${seed}-${i}-${di}-in` : undefined });
        events.push({ schoolId, deviceId, studentId, method: EventMethod.CARD, direction: Direction.OUT, occurredAt: new Date(inAt.getTime() + (4 * 60 + 35) * 60_000), source: EventSource.DEVICE, externalEventId: deviceId ? `seed-${seed}-${i}-${di}-out` : undefined });
      });
    });
  };
  traffic(ctx.schoolId, ctx.studentIds, 1, device?.id);
  traffic(school2.id, students2, 2);
  // Today's events must not be in the future: drop anything later than now.
  const now = Date.now();
  await prisma.gateEvent.createMany({ data: events.filter((e) => (e.occurredAt as Date).getTime() <= now) });

  // ---- Daily statistics from the real tables, then the alert rules ----
  const stats = new DailyStatsService(prisma as unknown as PrismaService);
  for (const schoolId of [ctx.schoolId, school2.id]) for (const date of days) await stats.computeDay(schoolId, date);
  // A few overdue invoices at school 2 so the fee rule has something to say.
  const fee = await prisma.feeItem.create({ data: { schoolId: school2.id, code: 'HOCPHI', name: 'Học phí', unit: 'MONTH', defaultAmount: 1_500_000 } });
  for (const [i, studentId] of students2.slice(0, 12).entries()) {
    await prisma.invoice.create({
      data: {
        schoolId: school2.id,
        studentId,
        source: 'MANUAL',
        title: 'Học phí tháng 9/2026',
        paymentRef: `DEMO2${String(i + 1).padStart(4, '0')}`,
        status: i < 4 ? 'PAID' : 'UNPAID',
        subtotal: 1_500_000,
        total: 1_500_000,
        paidAmount: i < 4 ? 1_500_000 : 0,
        dueDate: toDbDate(addDays(today, -10)),
        issuedAt: zonedToUtc(`${addDays(today, -20)} 08:00:00`, school.timezone),
        lines: { create: { feeItemId: fee.id, description: 'Học phí tháng 9/2026', quantity: 1, unitPrice: 1_500_000, amount: 1_500_000 } },
      },
    });
  }
  for (const date of days.slice(-10)) await stats.computeDay(school2.id, date);

  const rules = await Promise.all([
    prisma.alertRule.create({ data: { districtId: district.id, kind: AlertKind.ATTENDANCE_RATE_BELOW, name: 'Chuyên cần dưới 90%', threshold: 90 } }),
    prisma.alertRule.create({ data: { districtId: district.id, kind: AlertKind.LATE_RATE_ABOVE, name: 'Đi muộn trên 10%', threshold: 10 } }),
    prisma.alertRule.create({ data: { districtId: district.id, kind: AlertKind.ABSENT_STREAK, name: 'Vắng 3 ngày học liên tiếp', threshold: 3 } }),
    prisma.alertRule.create({ data: { schoolId: ctx.schoolId, kind: AlertKind.HEALTH_INCIDENTS_ABOVE, name: 'Trên 2 sự cố y tế một ngày', threshold: 2 } }),
    prisma.alertRule.create({ data: { schoolId: school2.id, kind: AlertKind.OVERDUE_FEES_ABOVE, name: 'Công nợ quá hạn trên 10 triệu', threshold: 10_000_000 } }),
  ]);
  for (const schoolId of [ctx.schoolId, school2.id]) {
    const rows = await prisma.dailyStat.findMany({ where: { schoolId }, orderBy: { date: 'asc' } });
    for (const row of rows) {
      const date = row.date.toISOString().slice(0, 10);
      if (date === today) continue; // today is only finalised tonight
      for (const rule of rules.filter((r) => r.districtId === district.id || r.schoolId === schoolId)) {
        const ctxRule = rule.kind === AlertKind.ABSENT_STREAK ? { absentStreak: await stats.absentStreak(schoolId, date, Number(rule.threshold)) } : {};
        const result = evaluateRule({ kind: rule.kind, threshold: Number(rule.threshold) }, { ...row, attendanceRate: Number(row.attendanceRate) }, ctxRule);
        if (!result.fired) continue;
        await prisma.alertEvent.create({
          data: {
            ruleId: rule.id,
            schoolId,
            date: row.date,
            kind: rule.kind,
            value: result.value,
            threshold: rule.threshold,
            message: result.message,
            // Older events were already looked at.
            acknowledgedAt: date < addDays(today, -3) ? new Date() : null,
            acknowledgedById: date < addDays(today, -3) ? ctx.adminUserId : null,
            createdAt: zonedToUtc(`${addDays(date, 1)} 00:05:00`, school.timezone),
          },
        });
      }
    }
  }

  // ---- A handful of audit rows (the interceptor records the real ones from here on) ----
  const audit: Prisma.AuditLogCreateManyInput[] = [
    { schoolId: ctx.schoolId, userId: ctx.adminUserId, userRole: Role.ADMIN, method: 'PATCH', path: '/api/v1/school', area: 'school', statusCode: 200, body: { moetCode: '01-0123-456', province: 'Hà Nội' }, durationMs: 18 },
    { schoolId: ctx.schoolId, userId: ctx.adminUserId, userRole: Role.ADMIN, method: 'POST', path: '/api/v1/alerts/rules', area: 'alerts', statusCode: 201, body: { kind: 'HEALTH_INCIDENTS_ABOVE', name: 'Trên 2 sự cố y tế một ngày', threshold: 2 }, durationMs: 12 },
    { schoolId: ctx.schoolId, userId: ctx.staffUserId, userRole: Role.STAFF, method: 'POST', path: '/api/v1/attendance/manual', area: 'attendance', statusCode: 201, body: { studentId: ctx.studentIds[0], direction: 'IN', note: 'Quên thẻ, bảo vệ xác nhận' }, durationMs: 25 },
    { schoolId: ctx.schoolId, userRole: null, method: 'POST', path: '/api/v1/auth/login', area: 'auth', statusCode: 401, body: { email: 'admin@demo.edu.vn', password: '[đã ẩn]' }, ip: '203.0.113.7', durationMs: 90 },
    { schoolId: ctx.schoolId, userId: ctx.adminUserId, userRole: Role.ADMIN, method: 'POST', path: '/api/v1/moet/exports', area: 'moet', statusCode: 201, body: { kind: 'STUDENTS' }, durationMs: 140 },
    { districtId: district.id, userRole: Role.DISTRICT, method: 'POST', path: '/api/v1/district/rules', area: 'district', statusCode: 201, body: { kind: 'ATTENDANCE_RATE_BELOW', name: 'Chuyên cần dưới 90%', threshold: 90 }, durationMs: 15 },
  ];
  const officer = await prisma.user.findUniqueOrThrow({ where: { email: 'pgd@caugiay.edu.vn' } });
  await prisma.auditLog.createMany({
    data: audit.map((a, i) => ({ ...a, userId: a.userId ?? (a.districtId ? officer.id : null), ip: a.ip ?? '10.0.0.12', userAgent: 'Mozilla/5.0 (seed)', createdAt: new Date(Date.now() - (audit.length - i) * 37 * 60_000) })),
  });

  console.log('  District: pgd@caugiay.edu.vn / District@123 (Phòng GD&ĐT Quận Cầu Giấy), second school admin@demo2.edu.vn / Admin@123');
}
