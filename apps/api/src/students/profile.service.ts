import { Injectable, NotFoundException } from '@nestjs/common';
import { HomeroomStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { fromDbDate } from '../canteen/canteen-rules';
import { YEAR } from '../grades/tt22';
import { PrismaService } from '../prisma/prisma.service';
import { AWARD_LABEL, MEASURE_LABEL } from './discipline-rules';

const classRef = { select: { id: true, name: true } } as const;

/**
 * Hồ sơ học sinh in one read: the record itself, the family, each school year with
 * its class and result, the movements, commendations and discipline, exemptions and
 * this year's attendance with the latest leave requests.
 */
@Injectable()
export class StudentProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  async profile(schoolId: string, studentId: string) {
    const s = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      include: {
        guardians: { orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }] },
        enrollments: {
          select: {
            enrolledAt: true,
            class: { select: { id: true, name: true, gradeLevel: true, homeroomTeacher: { select: { id: true, fullName: true } } } },
            academicYear: { select: { id: true, name: true, startDate: true, endDate: true } },
          },
        },
        user: { select: { username: true, isActive: true } },
      },
    });
    if (!s) throw new NotFoundException('Không tìm thấy học sinh');
    const current = await this.years.current(schoolId);
    const [results, movements, awards, discipline, exemptions, attendance, requests] = await Promise.all([
      this.prisma.termResult.findMany({
        where: { studentId, semester: YEAR },
        select: { academicYearId: true, academic: true, conduct: true, title: true, promotion: true, absentDays: true, academicAfterRetake: true, conductAfterTraining: true, homeroomComment: true },
      }),
      this.prisma.studentMovement.findMany({ where: { studentId }, include: { fromClass: classRef, toClass: classRef }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.studentAward.findMany({ where: { studentId }, include: { class: classRef }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.studentDiscipline.findMany({ where: { studentId }, include: { class: classRef }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.subjectExemption.findMany({ where: { studentId }, select: { id: true, academicYearId: true, semester: true, reason: true, subject: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.homeroomAttendance.groupBy({
        by: ['status'],
        where: { studentId, date: { gte: current.startDate, lte: current.endDate }, status: { not: HomeroomStatus.PRESENT } },
        _count: { _all: true },
      }),
      this.prisma.absenceRequest.findMany({ where: { studentId }, include: { class: classRef }, orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }], take: 10 }),
    ]);
    const yearName = new Map(s.enrollments.map((e) => [e.academicYear.id, e.academicYear.name]));
    const result = new Map(results.map((r) => [r.academicYearId, r]));
    const count = (status: HomeroomStatus) => attendance.find((a) => a.status === status)?._count._all ?? 0;
    const { enrollments, user, ...student } = s;
    const latest = [...enrollments].sort((a, b) => b.academicYear.startDate.getTime() - a.academicYear.startDate.getTime());
    return {
      student: { ...student, dateOfBirth: student.dateOfBirth ? fromDbDate(student.dateOfBirth) : null, account: user },
      class: latest[0] ? { ...latest[0].class, academicYear: { id: latest[0].academicYear.id, name: latest[0].academicYear.name } } : null,
      years: latest.map((e) => {
        const r = result.get(e.academicYear.id);
        return {
          academicYear: { id: e.academicYear.id, name: e.academicYear.name, isCurrent: e.academicYear.id === current.id },
          class: e.class,
          result: r
            ? { academic: r.academicAfterRetake ?? r.academic, conduct: r.conductAfterTraining ?? r.conduct, title: r.title, promotion: r.promotion, absentDays: r.absentDays, homeroomComment: r.homeroomComment }
            : null,
        };
      }),
      movements: movements.map((m) => ({ ...m, date: fromDbDate(m.date), academicYear: m.academicYearId ? (yearName.get(m.academicYearId) ?? null) : null })),
      awards: awards.map((a) => ({ ...a, date: fromDbDate(a.date), label: AWARD_LABEL[a.form], academicYear: yearName.get(a.academicYearId) ?? null })),
      discipline: discipline.map((d) => ({
        ...d,
        date: fromDbDate(d.date),
        familyConfirmedAt: d.familyConfirmedAt ? fromDbDate(d.familyConfirmedAt) : null,
        label: MEASURE_LABEL[d.measure],
        academicYear: yearName.get(d.academicYearId) ?? null,
      })),
      exemptions: exemptions.map((e) => ({ ...e, academicYear: yearName.get(e.academicYearId) ?? null })),
      attendance: { academicYear: { id: current.id, name: current.name }, excused: count(HomeroomStatus.EXCUSED), absent: count(HomeroomStatus.ABSENT), late: count(HomeroomStatus.LATE) },
      absenceRequests: requests.map((r) => ({ ...r, fromDate: fromDbDate(r.fromDate), toDate: fromDbDate(r.toDate) })),
    };
  }
}
