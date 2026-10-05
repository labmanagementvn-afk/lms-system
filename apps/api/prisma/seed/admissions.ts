import { AdmissionRoundStatus, ApplicationSource, ApplicationStatus, Gender, GuardianRelationship, PrismaClient, RegistrationStatus } from '@prisma/client';
import { SeedContext } from './context';

// Demo data for the admissions module: an open round for next year's grade 6
// intake with applications in every state, a closed round of the current
// intake, and service registrations for a few 6A1 families.

type AppSeed = [string, Gender, string, string, GuardianRelationship, string, ApplicationSource, ApplicationStatus, number?, string?];

const OPEN_ROUND_APPS: AppSeed[] = [
  ['Nguyễn Minh Khang', Gender.MALE, '2016-03-12', 'Nguyễn Văn Hùng', GuardianRelationship.FATHER, '0903100001', ApplicationSource.ONLINE, ApplicationStatus.SUBMITTED],
  ['Trần Thảo Vy', Gender.FEMALE, '2016-07-25', 'Trần Thị Hoa', GuardianRelationship.MOTHER, '0903100002', ApplicationSource.ONLINE, ApplicationStatus.SCREENING],
  ['Lê Gia Bảo', Gender.MALE, '2016-01-08', 'Lê Văn Tâm', GuardianRelationship.FATHER, '0903100003', ApplicationSource.IMPORT, ApplicationStatus.ACCEPTED, 8.5, 'Phỏng vấn tốt, học bạ loại giỏi'],
  ['Phạm Ngọc Hân', Gender.FEMALE, '2016-11-30', 'Phạm Thị Lan', GuardianRelationship.MOTHER, '0903100004', ApplicationSource.IMPORT, ApplicationStatus.REJECTED, 4, 'Chưa đạt điểm sàn'],
  ['Hoàng Đức Anh', Gender.MALE, '2016-05-17', 'Hoàng Văn Sơn', GuardianRelationship.FATHER, '0903100005', ApplicationSource.MANUAL, ApplicationStatus.SUBMITTED],
  ['Vũ Khánh Linh', Gender.FEMALE, '2016-09-03', 'Vũ Thị Mai', GuardianRelationship.MOTHER, '0903100006', ApplicationSource.MANUAL, ApplicationStatus.ACCEPTED, 9, 'Có giải Toán cấp quận'],
];

const EXTRAS = ['CLB bóng đá', 'CLB tiếng Anh', 'CLB mỹ thuật', 'Bán trú thứ 7'];

export async function seedAdmissions(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId, academicYearId, classes, studentIds, adminUserId } = ctx;
  const now = new Date();
  const day = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
  const yy = String(now.getUTCFullYear()).slice(-2);
  const code = (n: number) => `TS${yy}-${String(n).padStart(5, '0')}`;

  // Next year's intake needs its academic year (not current yet).
  const nextYear =
    (await prisma.academicYear.findFirst({ where: { schoolId, name: '2027-2028' } })) ??
    (await prisma.academicYear.create({ data: { schoolId, name: '2027-2028', startDate: new Date('2027-09-05'), endDate: new Date('2028-05-31') } }));

  const closedRound = await prisma.admissionRound.create({
    data: {
      schoolId,
      academicYearId,
      name: 'Tuyển sinh lớp 6 năm học 2026-2027',
      gradeLevel: 6,
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-07-31'),
      capacity: 80,
      description: 'Đợt tuyển sinh đầu cấp năm học 2026-2027 (đã kết thúc).',
      status: AdmissionRoundStatus.CLOSED,
    },
  });
  const openRound = await prisma.admissionRound.create({
    data: {
      schoolId,
      academicYearId: nextYear.id,
      name: 'Tuyển sinh lớp 6 năm học 2027-2028',
      gradeLevel: 6,
      startDate: day(-30),
      endDate: day(60),
      capacity: 90,
      description: 'Nhận hồ sơ trực tuyến cho học sinh sinh năm 2016. Phụ huynh nộp bản sao học bạ và giấy khai sinh tại văn phòng sau khi có kết quả.',
    },
  });

  // The closed round: one family already enrolled (the first 6A1 student) and one rejection.
  const first = await prisma.student.findUniqueOrThrow({ where: { id: studentIds[0] }, include: { guardians: true } });
  const guardian = first.guardians[0];
  await prisma.admissionApplication.create({
    data: {
      schoolId,
      roundId: closedRound.id,
      code: code(1),
      fullName: first.fullName,
      gender: first.gender,
      dateOfBirth: first.dateOfBirth ?? new Date('2014-01-10'),
      guardianName: guardian?.fullName ?? 'Phụ huynh',
      guardianPhone: guardian?.phone ?? '0981000000',
      guardianRelationship: guardian?.relationship ?? GuardianRelationship.GUARDIAN,
      source: ApplicationSource.ONLINE,
      status: ApplicationStatus.ENROLLED,
      score: 8,
      screeningNote: 'Đã nhập học lớp 6A1',
      classId: classes['6A1'],
      studentId: first.id,
      submittedAt: new Date('2026-05-10T02:00:00Z'),
    },
  });
  await prisma.admissionApplication.create({
    data: {
      schoolId,
      roundId: closedRound.id,
      code: code(2),
      fullName: 'Đỗ Thanh Tùng',
      gender: Gender.MALE,
      dateOfBirth: new Date('2015-08-21'),
      guardianName: 'Đỗ Văn Minh',
      guardianPhone: '0903100010',
      guardianRelationship: GuardianRelationship.FATHER,
      source: ApplicationSource.MANUAL,
      status: ApplicationStatus.REJECTED,
      score: 3.5,
      screeningNote: 'Thiếu hồ sơ',
      submittedAt: new Date('2026-05-12T03:00:00Z'),
    },
  });

  for (const [i, [fullName, gender, dob, guardianName, relationship, phone, source, status, score, note]] of OPEN_ROUND_APPS.entries()) {
    await prisma.admissionApplication.create({
      data: {
        schoolId,
        roundId: openRound.id,
        code: code(3 + i),
        fullName,
        gender,
        dateOfBirth: new Date(dob),
        address: ['Cầu Giấy, Hà Nội', 'Đống Đa, Hà Nội', 'Ba Đình, Hà Nội'][i % 3],
        previousSchool: ['Tiểu học Dịch Vọng', 'Tiểu học Kim Đồng', 'Tiểu học Nghĩa Tân'][i % 3],
        guardianName,
        guardianPhone: phone,
        guardianEmail: i % 2 ? `${phone}@example.com` : null,
        guardianRelationship: relationship,
        source,
        status,
        score: score ?? null,
        screeningNote: note ?? null,
        submittedAt: new Date(now.getTime() - (20 - i * 3) * 86_400_000),
      },
    });
  }

  // Service registrations for the first five 6A1 families (one already confirmed by the office).
  const registrations = [
    { canteen: true, bus: true, busStopNote: 'Cổng chợ Nghĩa Tân', uniform: { shirtSize: 'M', pantsSize: 'M', quantity: 2 }, extras: [EXTRAS[0]], status: RegistrationStatus.CONFIRMED },
    { canteen: true, bus: false, busStopNote: null, uniform: { shirtSize: 'S', pantsSize: 'S', quantity: 1 }, extras: [EXTRAS[1], EXTRAS[3]], status: RegistrationStatus.SUBMITTED },
    { canteen: false, bus: true, busStopNote: 'Ngã tư Hoàng Quốc Việt - Phạm Văn Đồng', uniform: null, extras: [EXTRAS[2]], status: RegistrationStatus.SUBMITTED },
    { canteen: true, bus: false, busStopNote: null, uniform: { shirtSize: 'L', pantsSize: 'M', quantity: 2 }, extras: null, note: 'Con dị ứng hải sản', status: RegistrationStatus.SUBMITTED },
    { canteen: true, bus: true, busStopNote: 'Số 15 Trần Cung', uniform: { shirtSize: 'M', pantsSize: 'L', quantity: 1 }, extras: [EXTRAS[0], EXTRAS[1]], status: RegistrationStatus.SUBMITTED },
  ];
  for (const [i, r] of registrations.entries()) {
    await prisma.serviceRegistration.create({
      data: {
        schoolId,
        studentId: studentIds[i],
        academicYearId,
        canteen: r.canteen,
        bus: r.bus,
        busStopNote: r.busStopNote,
        uniform: r.uniform ?? undefined,
        extras: r.extras ?? undefined,
        note: r.note ?? null,
        status: r.status,
        submittedByUserId: adminUserId,
      },
    });
  }
}
