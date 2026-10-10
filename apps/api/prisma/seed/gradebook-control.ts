import { PrismaClient, ScoreEditSource, ScoreKind } from '@prisma/client';
import { recomputeResults } from '../../src/grades/results';
import { SeedContext } from './context';

/**
 * Phase 6 (gradebook control and reports): the report letterhead of the demo
 * school, entry windows with an edit limit, a locked mark column, a subject
 * exemption and a few logged edits. On a fresh seed a handful of 6A1 marks are
 * also left out, so entry monitoring has a make-up test to chase. On an existing
 * demo (`fresh` false) nothing is deleted.
 */
export async function seedGradebookControl(prisma: PrismaClient, ctx: SeedContext, { fresh }: { fresh: boolean }) {
  const { schoolId, academicYearId, classes, subjects, teacherUsers, studentIds, adminUserId } = ctx;
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { governingBody: true, principalName: true, locality: true } });
  await prisma.school.update({
    where: { id: schoolId },
    data: { governingBody: school.governingBody ?? 'UBND quận Cầu Giấy', principalName: school.principalName ?? 'Nguyễn Thị Hồng Hạnh', locality: school.locality ?? 'Hà Nội' },
  });

  await prisma.gradeEntryWindow.createMany({
    data: [
      { schoolId, academicYearId, semester: 1, opensAt: new Date('2026-09-05T00:00:00+07:00'), closesAt: new Date('2027-01-15T23:59:00+07:00'), maxEdits: 3 },
      { schoolId, academicYearId, semester: 2, opensAt: new Date('2027-01-18T00:00:00+07:00'), closesAt: new Date('2027-05-25T23:59:00+07:00'), maxEdits: 3 },
    ],
    skipDuplicates: true,
  });

  // The mid-term marks of grade 6 maths are final.
  await prisma.gradeColumnLock.create({ data: { schoolId, academicYearId, semester: 1, gradeLevel: 6, subjectId: subjects.TOAN, kind: ScoreKind.GK, index: 0, lockedById: adminUserId } });

  // A 6A1 student is exempt from PE for the year on a hospital note.
  const exempt = studentIds[3];
  await prisma.subjectExemption.upsert({
    where: { studentId_subjectId_academicYearId_semester: { studentId: exempt, subjectId: subjects.GDTC, academicYearId, semester: 0 } },
    create: { schoolId, academicYearId, semester: 0, studentId: exempt, subjectId: subjects.GDTC, reason: 'Giấy xác nhận của Bệnh viện Nhi Trung ương', createdById: adminUserId },
    update: {},
  });

  if (fresh) {
    // Three students missed the literature end-of-term test, and two English TX3 marks are not in yet.
    await prisma.score.deleteMany({
      where: {
        classId: classes['6A1'],
        semester: 1,
        OR: [
          { subjectId: subjects.VAN, kind: ScoreKind.CK, studentId: { in: studentIds.slice(6, 9) } },
          { subjectId: subjects.ANH, kind: ScoreKind.TX, index: 3, studentId: { in: studentIds.slice(8, 10) } },
        ],
      },
    });
  }

  // Logged changes to marks already entered: by the teachers, one from an Excel import, one late fix by the office.
  const edits: [number, string, ScoreKind, number, string, ScoreEditSource, string][] = [
    [1, 'TOAN', ScoreKind.TX, 2, teacherUsers.GV001, ScoreEditSource.MANUAL, '2026-10-02T09:14:00+07:00'],
    [2, 'TOAN', ScoreKind.GK, 1, teacherUsers.GV001, ScoreEditSource.MANUAL, '2026-10-03T15:40:00+07:00'],
    [4, 'VAN', ScoreKind.TX, 1, teacherUsers.GV002, ScoreEditSource.IMPORT, '2026-10-06T20:05:00+07:00'],
    [5, 'GDTC', ScoreKind.CK, 1, adminUserId, ScoreEditSource.MANUAL, '2026-10-08T10:30:00+07:00'],
  ];
  for (const [i, code, kind, index, editedById, source, at] of edits) {
    const score = await prisma.score.findFirst({ where: { studentId: studentIds[i], subjectId: subjects[code], academicYearId, semester: 1, kind, index } });
    if (!score) continue;
    const value = score.value === null ? null : Number(score.value);
    await prisma.scoreEdit.create({
      data: {
        schoolId,
        academicYearId,
        semester: 1,
        classId: classes['6A1'],
        studentId: studentIds[i],
        subjectId: subjects[code],
        kind,
        index,
        oldValue: value === null ? null : Math.max(0, value - 1),
        newValue: value,
        oldPassed: score.passed === null ? null : !score.passed,
        newPassed: score.passed,
        editedById,
        source,
        createdAt: new Date(at),
      },
    });
  }

  await recomputeResults(prisma, { schoolId, academicYearId, classId: classes['6A1'] });
}
