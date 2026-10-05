// Demo data for local development: one school with teachers, classes, students,
// a bell schedule, a sample timetable and one gate terminal.
import { DeviceType, Direction, FeeUnit, Gender, GuardianRelationship, ItemCategory, MealType, PrismaClient, Role, Session } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { generateDeviceKey } from '../src/attendance/device-keys';
import { seedAdmissions } from './seed/admissions';
import { seedAnnouncements } from './seed/announcements';
import { seedAssets } from './seed/assets';
import { seedBus } from './seed/bus';
import { SeedContext } from './seed/context';
import { seedHomeroom } from './seed/homeroom';
import { seedHr } from './seed/hr';
import { seedParents } from './seed/parents';

const prisma = new PrismaClient();

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
  if (await prisma.school.findUnique({ where: { code: 'DEMO' } })) {
    console.log('Demo school already exists; nothing to do.');
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
  for (const seed of [seedParents, seedHomeroom, seedAnnouncements, seedBus, seedAdmissions, seedHr, seedAssets]) await seed(prisma, ctx);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
