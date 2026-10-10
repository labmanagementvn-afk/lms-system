import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AbsenceRequestStatus, MovementKind, Prisma, StudentStatus } from '@prisma/client';
import { fromDbDate, isValidDate, toDbDate } from '../canteen/canteen-rules';
import { AuthUser } from '../common/auth-user';
import { localDate } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { DropOutDto, MoveClassDto, MovementQuery, ReadmitDto, TransferOutDto } from './records.dto';

/**
 * Moves a student's school year to another class: the enrolment, every mark, result,
 * conduct assessment and end-of-year record of that year, and the leave requests still
 * to come, so the new homeroom and subject teachers see the whole year. Roll calls and
 * the edit log stay with the class they were taken in.
 */
export async function moveYearToClass(tx: Prisma.TransactionClient, a: { studentId: string; academicYearId: string; toClassId: string; date: string }) {
  const where = { studentId: a.studentId, academicYearId: a.academicYearId };
  const data = { classId: a.toClassId };
  await tx.enrollment.update({ where: { studentId_academicYearId: where }, data });
  await tx.score.updateMany({ where, data });
  await tx.subjectResult.updateMany({ where, data });
  await tx.termResult.updateMany({ where, data });
  await tx.conductAssessment.updateMany({ where, data });
  await tx.subjectRetake.updateMany({ where, data });
  await tx.summerTraining.updateMany({ where, data });
  await tx.completionRecord.updateMany({ where, data });
  await tx.absenceRequest.updateMany({
    where: {
      studentId: a.studentId,
      class: { academicYearId: a.academicYearId },
      OR: [{ status: AbsenceRequestStatus.PENDING }, { status: AbsenceRequestStatus.APPROVED, toDate: { gte: toDbDate(a.date) } }],
    },
    data,
  });
}

const classRef = { select: { id: true, name: true, gradeLevel: true } } as const;

/** Biến động học sinh: class changes, transfers out, dropping out and coming back, with the record of each. */
@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, q: MovementQuery) {
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('Từ ngày phải trước đến ngày');
    const rows = await this.prisma.studentMovement.findMany({
      where: {
        schoolId,
        kind: q.kind,
        studentId: q.studentId,
        date: q.from || q.to ? { gte: q.from ? toDbDate(q.from) : undefined, lte: q.to ? toDbDate(q.to) : undefined } : undefined,
        ...(q.classId ? { OR: [{ fromClassId: q.classId }, { toClassId: q.classId }] } : {}),
      },
      include: { student: { select: { id: true, code: true, fullName: true, status: true } }, fromClass: classRef, toClass: classRef },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return rows.map((r) => ({ ...r, date: fromDbDate(r.date) }));
  }

  /** Chuyển lớp within the school year; a student with no class that year is simply placed. */
  async moveClass(user: AuthUser, dto: MoveClassDto) {
    const target = await this.prisma.class.findFirst({ where: { id: dto.toClassId, schoolId: user.schoolId }, select: { id: true, name: true, gradeLevel: true, academicYearId: true } });
    if (!target) throw new NotFoundException('Không tìm thấy lớp');
    const date = await this.dateOf(user.schoolId, dto.date);
    const students = await this.prisma.student.findMany({
      where: { id: { in: dto.studentIds }, schoolId: user.schoolId },
      select: { id: true, fullName: true, status: true, enrollments: { where: { academicYearId: target.academicYearId }, select: { classId: true, class: classRef } } },
    });
    this.assertAllFound(students, dto.studentIds);
    for (const s of students) {
      if (s.status !== StudentStatus.STUDYING) throw new BadRequestException(`${s.fullName} không còn đang học`);
      const from = s.enrollments[0]?.class;
      if (from && from.gradeLevel !== target.gradeLevel) throw new BadRequestException(`${s.fullName} đang học lớp ${from.name}: chỉ chuyển sang lớp cùng khối`);
    }
    const moving = students.filter((s) => s.enrollments[0] && s.enrollments[0].classId !== target.id);
    const placing = students.filter((s) => !s.enrollments[0]);
    await this.prisma.$transaction(async (tx) => {
      for (const s of placing) await tx.enrollment.create({ data: { studentId: s.id, classId: target.id, academicYearId: target.academicYearId } });
      for (const s of moving) {
        await moveYearToClass(tx, { studentId: s.id, academicYearId: target.academicYearId, toClassId: target.id, date });
        await tx.studentMovement.create({
          data: { schoolId: user.schoolId, studentId: s.id, kind: MovementKind.CLASS_CHANGE, date: toDbDate(date), academicYearId: target.academicYearId, fromClassId: s.enrollments[0].classId, toClassId: target.id, reason: dto.reason || null, createdById: user.userId },
        });
      }
    });
    return { moved: moving.length, placed: placing.length, unchanged: students.length - moving.length - placing.length, class: { id: target.id, name: target.name } };
  }

  /** Chuyển đi: the students leave for another school; their logins stop working. */
  transferOut(user: AuthUser, dto: TransferOutDto) {
    return this.leave(user, dto.studentIds, StudentStatus.TRANSFERRED, MovementKind.TRANSFER_OUT, dto.date, { otherSchool: dto.otherSchool, reason: dto.reason || null, documentNo: dto.documentNo || null });
  }

  /** Thôi học. */
  dropOut(user: AuthUser, dto: DropOutDto) {
    return this.leave(user, dto.studentIds, StudentStatus.DROPPED, MovementKind.DROPPED, dto.date, { reason: dto.reason });
  }

  /** Trở lại học: a student who transferred out or dropped out comes back to a class. */
  async readmit(user: AuthUser, studentId: string, dto: ReadmitDto) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId }, select: { id: true, fullName: true, status: true, userId: true } });
    if (!student) throw new NotFoundException('Không tìm thấy học sinh');
    if (student.status !== StudentStatus.TRANSFERRED && student.status !== StudentStatus.DROPPED) throw new BadRequestException('Chỉ tiếp nhận trở lại học sinh đã chuyển đi hoặc thôi học');
    const klass = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId: user.schoolId }, select: { id: true, academicYearId: true } });
    if (!klass) throw new NotFoundException('Không tìm thấy lớp');
    const date = await this.dateOf(user.schoolId, dto.date);
    const enrolled = await this.prisma.enrollment.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: klass.academicYearId } }, select: { classId: true } });
    await this.prisma.$transaction(async (tx) => {
      if (!enrolled) await tx.enrollment.create({ data: { studentId, classId: klass.id, academicYearId: klass.academicYearId } });
      else if (enrolled.classId !== klass.id) await moveYearToClass(tx, { studentId, academicYearId: klass.academicYearId, toClassId: klass.id, date });
      await tx.student.update({ where: { id: studentId }, data: { status: StudentStatus.STUDYING } });
      if (student.userId) await tx.user.update({ where: { id: student.userId }, data: { isActive: true } });
      await tx.studentMovement.create({
        data: { schoolId: user.schoolId, studentId, kind: MovementKind.RETURNED, date: toDbDate(date), academicYearId: klass.academicYearId, fromClassId: enrolled?.classId ?? null, toClassId: klass.id, reason: dto.reason || null, createdById: user.userId },
      });
    });
    return { id: studentId, status: StudentStatus.STUDYING };
  }

  private async leave(user: AuthUser, ids: string[], status: StudentStatus, kind: MovementKind, when: string | undefined, details: { otherSchool?: string; reason: string | null; documentNo?: string | null }) {
    const date = await this.dateOf(user.schoolId, when);
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids }, schoolId: user.schoolId },
      select: { id: true, fullName: true, status: true, userId: true, enrollments: { orderBy: { enrolledAt: 'desc' }, take: 1, select: { classId: true, academicYearId: true } } },
    });
    this.assertAllFound(students, ids);
    const gone = students.find((s) => s.status !== StudentStatus.STUDYING);
    if (gone) throw new BadRequestException(`${gone.fullName} không còn đang học`);
    await this.prisma.$transaction(async (tx) => {
      for (const s of students) {
        await tx.student.update({ where: { id: s.id }, data: { status } });
        if (s.userId) await tx.user.update({ where: { id: s.userId }, data: { isActive: false } });
        await tx.absenceRequest.updateMany({ where: { studentId: s.id, status: AbsenceRequestStatus.PENDING }, data: { status: AbsenceRequestStatus.CANCELLED } });
        const e = s.enrollments[0];
        await tx.studentMovement.create({
          data: { schoolId: user.schoolId, studentId: s.id, kind, date: toDbDate(date), academicYearId: e?.academicYearId ?? null, fromClassId: e?.classId ?? null, createdById: user.userId, ...details },
        });
      }
    });
    return { count: students.length, status };
  }

  /** The given day, or today at the school. */
  async dateOf(schoolId: string, date?: string) {
    if (date) {
      if (!isValidDate(date)) throw new BadRequestException('Ngày không hợp lệ');
      return date;
    }
    const { timezone } = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    return localDate(new Date(), timezone);
  }

  private assertAllFound(found: { id: string }[], ids: string[]) {
    if (found.length !== new Set(ids).size) throw new NotFoundException('Không tìm thấy học sinh');
  }
}
