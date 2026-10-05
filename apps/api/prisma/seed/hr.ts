import { EmployeeDocumentKind, EmploymentType, Gender, LeaveStatus, LeaveType, PrismaClient } from '@prisma/client';
import { SeedContext } from './context';

const DAY_MS = 86_400_000;
const TEACHER_DEPARTMENT = 'Giáo viên';

/** UTC midnight of today (what @db.Date columns hold). */
const today = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const daysFromNow = (n: number) => new Date(today().getTime() + n * DAY_MS);
const date = (s: string) => new Date(`${s}T00:00:00Z`);
/** The Monday `weeks` weeks after the coming Monday (0 = next Monday, negative = past Mondays). */
const monday = (weeks: number) => daysFromNow((((8 - today().getUTCDay()) % 7) || 7) + weeks * 7);

// Demo personnel: one employee per teacher (same mapping as POST /hr/employees/from-teachers)
// plus two office staff, with documents, contracts, work history and leave requests.
export async function seedHr(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId } = ctx;
  const employees: Record<string, string> = {};

  const teachers = await prisma.teacher.findMany({ where: { id: { in: Object.values(ctx.teachers) } }, orderBy: { code: 'asc' } });
  for (const [i, t] of teachers.entries()) {
    const e = await prisma.employee.create({
      data: {
        schoolId,
        code: t.code,
        fullName: t.fullName,
        gender: t.gender,
        dateOfBirth: t.dateOfBirth ?? date(`${1980 + i * 2}-0${(i % 9) + 1}-15`),
        phone: t.phone,
        email: t.email,
        address: 'Hà Nội',
        department: TEACHER_DEPARTMENT,
        position: TEACHER_DEPARTMENT,
        employmentType: t.code === 'GV008' ? EmploymentType.CONTRACT : EmploymentType.FULL_TIME,
        hireDate: date(`${2014 + i}-09-01`),
        teacherId: t.id,
        userId: ctx.teacherUsers[t.code] ?? t.userId,
      },
    });
    employees[t.code] = e.id;
  }

  const office = [
    {
      code: 'NV001',
      fullName: 'Phạm Thị Thu',
      gender: Gender.FEMALE,
      dateOfBirth: date('1988-03-12'),
      idNumber: '001188012345',
      phone: '0901234567',
      email: 'ketoan@demo.edu.vn',
      department: 'Hành chính',
      position: 'Kế toán',
      hireDate: date('2019-01-02'),
    },
    {
      code: 'NV002',
      fullName: 'Ngô Văn Sơn',
      gender: Gender.MALE,
      dateOfBirth: date('1975-11-02'),
      idNumber: '001075054321',
      phone: '0912345678',
      email: 'baove@demo.edu.vn',
      department: 'Hành chính',
      position: 'Bảo vệ',
      employmentType: EmploymentType.CONTRACT,
      hireDate: date('2021-06-01'),
      userId: ctx.staffUserId,
    },
  ];
  for (const data of office) {
    employees[data.code] = (await prisma.employee.create({ data: { ...data, schoolId, address: 'Hà Nội' } })).id;
  }

  await prisma.employeeDocument.createMany({
    data: [
      {
        employeeId: employees.GV001,
        kind: EmployeeDocumentKind.DEGREE,
        name: 'Bằng cử nhân Sư phạm Toán',
        issuer: 'Đại học Sư phạm Hà Nội',
        issuedAt: date('2010-06-30'),
      },
      {
        employeeId: employees.GV003,
        kind: EmployeeDocumentKind.CERTIFICATE,
        name: 'Chứng chỉ IELTS 7.5',
        issuer: 'British Council',
        issuedAt: daysFromNow(20 - 730),
        expiresAt: daysFromNow(20),
      },
      {
        employeeId: employees.NV002,
        kind: EmployeeDocumentKind.LICENSE,
        name: 'Chứng chỉ nghiệp vụ bảo vệ',
        issuer: 'Công an TP Hà Nội',
        issuedAt: daysFromNow(-15 - 1825),
        expiresAt: daysFromNow(-15),
      },
    ],
  });

  await prisma.employmentContract.createMany({
    data: [
      { employeeId: employees.GV001, type: EmploymentType.FULL_TIME, startDate: date('2018-09-01'), salary: 15_000_000, notes: 'Hợp đồng không xác định thời hạn' },
      { employeeId: employees.GV008, type: EmploymentType.CONTRACT, startDate: date('2026-09-01'), endDate: date('2027-05-31'), salary: 9_000_000 },
      { employeeId: employees.NV001, type: EmploymentType.FULL_TIME, startDate: date('2019-01-02'), salary: 12_000_000 },
      { employeeId: employees.NV002, type: EmploymentType.CONTRACT, startDate: daysFromNow(-350), endDate: daysFromNow(15), salary: 7_500_000 },
    ],
  });

  await prisma.workHistory.createMany({
    data: [
      { employeeId: employees.GV002, fromDate: date('2012-09-01'), toDate: date('2018-08-31'), organization: 'Trường THCS Nguyễn Du', position: 'Giáo viên Ngữ văn' },
      { employeeId: employees.NV001, fromDate: date('2015-07-01'), toDate: date('2018-12-31'), organization: 'Công ty CP Kế toán AAC', position: 'Kế toán viên' },
    ],
  });

  await prisma.leaveRequest.createMany({
    data: [
      {
        schoolId,
        employeeId: employees.GV002,
        type: LeaveType.ANNUAL,
        fromDate: monday(0),
        toDate: new Date(monday(0).getTime() + 2 * DAY_MS),
        days: 3,
        reason: 'Việc gia đình',
        status: LeaveStatus.PENDING,
      },
      {
        schoolId,
        employeeId: employees.GV005,
        type: LeaveType.SICK,
        fromDate: monday(-3),
        toDate: new Date(monday(-3).getTime() + DAY_MS),
        days: 2,
        reason: 'Khám bệnh',
        status: LeaveStatus.APPROVED,
        decidedById: ctx.adminUserId,
        decidedAt: new Date(monday(-3).getTime() - 2 * DAY_MS),
        decisionNote: 'Đồng ý, nhờ GV Bảo dạy thay',
      },
    ],
  });
}
