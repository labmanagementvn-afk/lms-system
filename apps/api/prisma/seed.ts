// Demo data for local development: one school with teachers, classes, students,
// a bell schedule, a sample timetable and one gate terminal.
import { Logger } from '@nestjs/common';
import { DeviceType, Direction, FeeUnit, Gender, GuardianRelationship, ItemCategory, MealType, PrismaClient, Role, Session } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { generateDeviceKey } from '../src/attendance/device-keys';
import { seedAdmissions } from './seed/admissions';
import { seedAnnouncements } from './seed/announcements';
import { seedAssessments } from './seed/assessments';
import { seedAssets } from './seed/assets';
import { seedBus } from './seed/bus';
import { seedConduct } from './seed/conduct';
import { loadContext, SeedContext } from './seed/context';
import { seedDistrict } from './seed/district';
import { seedEndOfYear } from './seed/end-of-year';
import { seedERecords } from './seed/erecords';
import { seedFinance } from './seed/finance';
import { seedGradebookControl } from './seed/gradebook-control';
import { seedGrades } from './seed/grades';
import { seedHomeroom } from './seed/homeroom';
import { seedHr } from './seed/hr';
import { seedLms } from './seed/lms';
import { seedMoetSync } from './seed/moet-sync';
import { seedParents } from './seed/parents';
import { seedSms } from './seed/sms';
import { seedStudentRecords } from './seed/student-records';
import { seedStudentAccounts } from './seed/students';

const prisma = new PrismaClient();
// The services seeders call log each sandbox send and each refusal they stage; print only real errors.
Logger.overrideLogger(['error']);

const SUBJECTS = [
  ['TOAN', 'Toán'],
  ['VAN', 'Ngữ văn'],
  ['ANH', 'Tiếng Anh'],
  ['KHTN', 'Khoa học tự nhiên'],
  ['LSDL', 'Lịch sử và Địa lý'],
  ['GDCD', 'Giáo dục công dân'],
  ['TIN', 'Tin học'],
  ['CN', 'Công nghệ'],
  ['GDTC', 'Giáo dục thể chất'],
  ['NT', 'Nghệ thuật'],
];

const TEACHERS: [string, string, Gender, string[]][] = [
  ['GV001', 'Nguyễn Thị Lan', Gender.FEMALE, ['TOAN']],
  ['GV002', 'Trần Văn Hùng', Gender.MALE, ['VAN']],
  ['GV003', 'Lê Thu Hà', Gender.FEMALE, ['ANH']],
  ['GV004', 'Phạm Quốc Bảo', Gender.MALE, ['KHTN', 'CN']],
  ['GV005', 'Hoàng Minh Tuấn', Gender.MALE, ['LSDL', 'GDCD']],
  ['GV006', 'Vũ Ngọc Mai', Gender.FEMALE, ['TIN']],
  ['GV007', 'Đặng Văn Long', Gender.MALE, ['GDTC']],
  ['GV008', 'Bùi Thanh Hương', Gender.FEMALE, ['NT', 'VAN']],
];

const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô'];
const MIDDLE = ['Minh', 'Gia', 'Bảo', 'Ngọc', 'Thanh', 'Đức', 'Khánh', 'Hải'];
const GIVEN = ['An', 'Anh', 'Châu', 'Dũng', 'Giang', 'Huy', 'Khoa', 'Linh', 'Nam', 'Phúc', 'Quân', 'Trang', 'Vy', 'Yến'];

async function main() {
  const existing = await prisma.school.findUnique({ where: { code: 'DEMO' }, select: { id: true } });
  if (existing) {
    await topUp(existing.id);
    return;
  }

  const school = await prisma.school.create({
    data: { code: 'DEMO', name: 'Trường THCS Demo', address: 'Hà Nội', timezone: 'Asia/Ho_Chi_Minh', lateAfter: '07:15' },
  });
  const schoolId = school.id;
  const hash = (p: string) => bcrypt.hash(p, 10);

  await prisma.user.createMany({
    data: [
      { schoolId, email: 'admin@demo.edu.vn', fullName: 'Quản trị viên', role: Role.ADMIN, passwordHash: await hash('Admin@123') },
      { schoolId, email: 'baove@demo.edu.vn', fullName: 'Bảo vệ cổng', role: Role.STAFF, passwordHash: await hash('Staff@123') },
    ],
  });

  const subjects = Object.fromEntries(
    await Promise.all(
      SUBJECTS.map(async ([code, name]) => [code, (await prisma.subject.create({ data: { schoolId, code, name } })).id] as const),
    ),
  );

  const teacherPassword = await hash('Teacher@123');
  const teachers: Record<string, string> = {};
  const teacherUsers: Record<string, string> = {};
  for (const [code, fullName, gender, subjectCodes] of TEACHERS) {
    const email = `${code.toLowerCase()}@demo.edu.vn`;
    const user = await prisma.user.create({ data: { schoolId, email, fullName, role: Role.TEACHER, passwordHash: teacherPassword } });
    teacherUsers[code] = user.id;
    const t = await prisma.teacher.create({
      data: {
        schoolId,
        code,
        fullName,
        gender,
        email,
        phone: `09${code.slice(2).padStart(8, '1')}`,
        userId: user.id,
        subjects: { create: subjectCodes.map((c) => ({ subjectId: subjects[c] })) },
      },
    });
    teachers[code] = t.id;
  }

  await prisma.period.createMany({
    data: [
      [1, Session.MORNING, '07:30', '08:15'],
      [2, Session.MORNING, '08:20', '09:05'],
      [3, Session.MORNING, '09:25', '10:10'],
      [4, Session.MORNING, '10:15', '11:00'],
      [5, Session.MORNING, '11:05', '11:50'],
      [6, Session.AFTERNOON, '13:30', '14:15'],
      [7, Session.AFTERNOON, '14:20', '15:05'],
      [8, Session.AFTERNOON, '15:20', '16:05'],
    ].map(([number, session, startTime, endTime]) => ({ schoolId, number: number as number, session: session as Session, startTime: startTime as string, endTime: endTime as string })),
  });

  const year = await prisma.academicYear.create({
    data: { schoolId, name: '2026-2027', startDate: new Date('2026-09-05'), endDate: new Date('2027-05-31'), isCurrent: true },
  });

  const classDefs: [string, number, string, string][] = [
    ['6A1', 6, 'GV001', 'P.101'],
    ['6A2', 6, 'GV002', 'P.102'],
    ['7A1', 7, 'GV003', 'P.201'],
  ];
  const classes: Record<string, string> = {};
  for (const [name, gradeLevel, homeroom, room] of classDefs) {
    const c = await prisma.class.create({
      data: { schoolId, academicYearId: year.id, name, gradeLevel, homeroomTeacherId: teachers[homeroom], room },
    });
    classes[name] = c.id;
  }

  let n = 0;
  const studentIds: string[] = [];
  for (const [className, gradeLevel] of classDefs.map((c) => [c[0], c[1]] as const)) {
    for (let i = 0; i < 10; i++, n++) {
      const family = FAMILY[n % FAMILY.length];
      const fullName = `${family} ${MIDDLE[(n * 3) % MIDDLE.length]} ${GIVEN[(n * 5) % GIVEN.length]}`;
      const s = await prisma.student.create({
        data: {
          schoolId,
          code: `HS${2026}${String(n + 1).padStart(3, '0')}`,
          fullName,
          gender: n % 2 ? Gender.FEMALE : Gender.MALE,
          dateOfBirth: new Date(`${2026 - gradeLevel - 6}-0${(n % 9) + 1}-1${n % 9}`),
          guardians: {
            create: [
              {
                fullName: `${family} Văn ${GIVEN[(n + 7) % GIVEN.length]}`,
                relationship: GuardianRelationship.FATHER,
                phone: `098${String(1000000 + n).slice(-7)}`,
                isPrimary: true,
              },
            ],
          },
          enrollments: { create: { classId: classes[className], academicYearId: year.id } },
        },
      });
      studentIds.push(s.id);
    }
  }

  // Monday-Friday morning timetable for 6A1.
  const plan = [
    ['TOAN', 'GV001'], ['VAN', 'GV002'], ['ANH', 'GV003'], ['KHTN', 'GV004'], ['LSDL', 'GV005'],
    ['TIN', 'GV006'], ['TOAN', 'GV001'], ['GDTC', 'GV007'], ['NT', 'GV008'], ['VAN', 'GV002'],
  ];
  const entries = [];
  for (let day = 2; day <= 6; day++) {
    for (let period = 1; period <= 5; period++) {
      const [subject, teacher] = plan[(day * 5 + period) % plan.length];
      entries.push({ schoolId, academicYearId: year.id, semester: 1, classId: classes['6A1'], subjectId: subjects[subject], teacherId: teachers[teacher], dayOfWeek: day - 1, periodNumber: period, room: 'P.101' });
    }
  }
  await prisma.timetableEntry.createMany({ data: entries });

  const { key, prefix, hash: keyHash } = generateDeviceKey();
  await prisma.attendanceDevice.create({
    data: {
      schoolId,
      name: 'Cổng chính - máy nhận diện khuôn mặt',
      type: DeviceType.FACE,
      vendor: 'Generic',
      location: 'Cổng chính',
      defaultDirection: Direction.UNKNOWN,
      apiKeyPrefix: prefix,
      apiKeyHash: keyHash,
    },
  });

  // Card identities for every student (person ID 1001, 1002, ...); biometric needs consent so is left to the school.
  await prisma.attendanceIdentity.createMany({
    data: studentIds.map((studentId, i) => ({ schoolId, method: 'CARD' as const, externalId: String(1001 + i), studentId })),
  });

  // Phase 2: finance, store, canteen, library demo data.
  await prisma.financeSettings.create({
    data: { schoolId, bankBin: '970436', bankName: 'Vietcombank', bankAccountNo: '0011000999999', bankAccountName: 'TRUONG THCS DEMO' },
  });
  await prisma.feeItem.createMany({
    data: [
      { schoolId, code: 'HOCPHI', name: 'Học phí', unit: FeeUnit.MONTH, defaultAmount: 1_500_000, accountingCode: '5113' },
      { schoolId, code: 'BANTRU', name: 'Phí bán trú', unit: FeeUnit.MONTH, defaultAmount: 300_000, accountingCode: '5113' },
      { schoolId, code: 'BHYT', name: 'Bảo hiểm y tế', unit: FeeUnit.YEAR, defaultAmount: 884_520 },
    ],
  });
  await prisma.inventoryItem.createMany({
    data: [
      { schoolId, sku: 'AO-NAM-S', name: 'Áo đồng phục nam size S', category: ItemCategory.UNIFORM, price: 120_000, stockQty: 50 },
      { schoolId, sku: 'AO-NU-S', name: 'Áo đồng phục nữ size S', category: ItemCategory.UNIFORM, price: 120_000, stockQty: 50 },
      { schoolId, sku: 'SGK6', name: 'Bộ sách giáo khoa lớp 6', category: ItemCategory.BOOK, unit: 'bộ', price: 250_000, stockQty: 30 },
    ],
  });
  const monday = new Date();
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const menus = [['Cơm, thịt kho trứng, canh rau'], ['Cơm, cá sốt cà chua, canh bí'], ['Bún bò'], ['Cơm, gà rang, canh chua'], ['Phở gà']];
  await prisma.mealMenu.createMany({
    data: menus.map((dishes, i) => ({ schoolId, date: new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + i)), mealType: MealType.LUNCH, dishes, price: 30_000 })),
  });
  const book = await prisma.book.create({ data: { schoolId, title: 'Dế Mèn phiêu lưu ký', author: 'Tô Hoài', category: 'Văn học', isbn: '9786042088015' } });
  await prisma.bookCopy.createMany({ data: ['TV0001', 'TV0002', 'TV0003'].map((barcode) => ({ schoolId, bookId: book.id, barcode, shelf: 'A1' })) });

  // Phase 3: parent accounts, homeroom attendance, announcements, bus, admissions, HR and assets.
  const ctx: SeedContext = {
    schoolId,
    academicYearId: year.id,
    classes,
    teachers,
    teacherUsers,
    subjects,
    studentIds,
    adminUserId: (await prisma.user.findUniqueOrThrow({ where: { email: 'admin@demo.edu.vn' } })).id,
    staffUserId: (await prisma.user.findUniqueOrThrow({ where: { email: 'baove@demo.edu.vn' } })).id,
    hash,
  };
  console.log('Seeded demo school.');
  console.log('  admin@demo.edu.vn / Admin@123, baove@demo.edu.vn / Staff@123, gv001@demo.edu.vn / Teacher@123');
  console.log(`  Gate device API key (shown once): ${key}`);
  // Phase 3 then phase 4 seeders; each one is a file under prisma/seed.
  for (const seed of [seedFinance, seedParents, seedStudentAccounts, seedHomeroom, seedAnnouncements, seedBus, seedAdmissions, seedHr, seedAssets]) await seed(prisma, ctx);
  for (const seed of [seedConduct, seedGrades, seedAssessments, seedLms]) await seed(prisma, ctx);
  // Phase 5: the district, a second school, statistics and alerts.
  await seedDistrict(prisma, ctx);
  // Phase 6: gradebook control and the report letterhead.
  await seedGradebookControl(prisma, ctx, { fresh: true });
  // Phase 7: a grade 9 class at the end of the year, in the summer review and the THCS completion review.
  await seedEndOfYear(prisma, ctx);
  // Phase 8: SMS to parents and teachers, the education database sync history and 9A1's signed học bạ.
  for (const seed of [seedSms, seedMoetSync, seedERecords]) await seed(prisma, ctx);
  // Phase 9: student records, movements, commendations and discipline, and leave requests.
  await seedStudentRecords(prisma, ctx);
}

/**
 * Adds the data of phases built after the demo school was seeded, once each, so a
 * running demo picks up new features on its next deploy. Never deletes anything,
 * and a failure only logs: the demo must still start.
 */
async function topUp(schoolId: string) {
  try {
    const ctx = await loadContext(prisma, schoolId, (p) => bcrypt.hash(p, 10));
    if (!ctx) {
      console.log('Demo school already exists and was changed too much to top up; nothing to do.');
      return;
    }
    let added = false;
    if (!(await prisma.gradeEntryWindow.findFirst({ where: { schoolId }, select: { id: true } }))) {
      await seedGradebookControl(prisma, ctx, { fresh: false });
      console.log('Demo school: added gradebook control data (phase 6).');
      added = true;
    }
    if (!ctx.classes['9A1'] && !(await prisma.completionRound.findFirst({ where: { schoolId }, select: { id: true } }))) {
      await seedEndOfYear(prisma, ctx);
      console.log('Demo school: added class 9A1 with the summer review and the THCS completion review (phase 7).');
      added = true;
    }
    if (!(await prisma.smsTemplate.findFirst({ where: { schoolId }, select: { id: true } })) && !(await prisma.smsCampaign.findFirst({ where: { schoolId }, select: { id: true } }))) {
      await seedSms(prisma, ctx);
      console.log('Demo school: added SMS templates and texts (phase 8).');
      added = true;
    }
    if (!(await prisma.moetSync.findFirst({ where: { schoolId }, select: { id: true } }))) {
      await seedMoetSync(prisma, ctx);
      console.log('Demo school: added the education database sync history (phase 8).');
      added = true;
    }
    if (!(await prisma.eRecord.findFirst({ where: { schoolId }, select: { id: true } })) && (await seedERecords(prisma, ctx))) {
      console.log('Demo school: added the signed học bạ số of class 9A1 (phase 8).');
      added = true;
    }
    if (!(await prisma.studentMovement.findFirst({ where: { schoolId }, select: { id: true } })) && !(await prisma.absenceRequest.findFirst({ where: { schoolId }, select: { id: true } }))) {
      await seedStudentRecords(prisma, ctx);
      console.log('Demo school: added student records, movements, commendations, discipline and leave requests (phase 9).');
      added = true;
    }
    if (!added) console.log('Demo school already exists; nothing to do.');
  } catch (e) {
    console.warn('Demo top-up skipped:', (e as Error).message);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
