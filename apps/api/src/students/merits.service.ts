import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DisciplineMeasure, NotificationKind, Prisma, Role, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { fromDbDate, toDbDate } from '../canteen/canteen-rules';
import { AuthUser } from '../common/auth-user';
import { dmy } from '../homeroom/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AWARD_LABEL, MEASURE_LABEL, mayGiveAward, mayTakeMeasure, measureProblem } from './discipline-rules';
import { MovementsService } from './movements.service';
import { AwardDto, DisciplineDto, MeritQuery, UpdateDisciplineDto } from './records.dto';

const studentRef = { select: { id: true, code: true, fullName: true } } as const;
const classRef = { select: { id: true, name: true } } as const;

type Picked = { id: string; fullName: string; classId: string | null; className: string | null; gradeLevel: number | null; homeroomUserId: string | null };

/** Khen thưởng và kỷ luật học sinh (Thông tư 19/2025/TT-BGDĐT) during the school year. */
@Injectable()
export class MeritsService {
  private readonly logger = new Logger(MeritsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
    private readonly movements: MovementsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- lists ----

  async listAwards(schoolId: string, q: MeritQuery) {
    const rows = await this.prisma.studentAward.findMany({
      where: await this.listWhere(schoolId, q),
      include: { student: studentRef, class: classRef },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return this.withAuthors(rows.map((r) => ({ ...r, date: fromDbDate(r.date), label: AWARD_LABEL[r.form] })));
  }

  async listDiscipline(schoolId: string, q: MeritQuery) {
    const rows = await this.prisma.studentDiscipline.findMany({
      where: await this.listWhere(schoolId, q),
      include: { student: studentRef, class: classRef },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return this.presentDiscipline(rows);
  }

  private presentDiscipline(rows: Prisma.StudentDisciplineGetPayload<{ include: { student: typeof studentRef; class: typeof classRef } }>[]) {
    return this.withAuthors(rows.map((r) => ({ ...r, date: fromDbDate(r.date), familyConfirmedAt: r.familyConfirmedAt ? fromDbDate(r.familyConfirmedAt) : null, label: MEASURE_LABEL[r.measure] })));
  }

  /** The school year's commendations and discipline of one child, for the parent app. */
  async ofStudent(schoolId: string, studentId: string) {
    const year = await this.years.current(schoolId);
    const [awards, discipline] = await Promise.all([this.listAwards(schoolId, { studentId }), this.listDiscipline(schoolId, { studentId })]);
    const inYear = <T extends { academicYearId: string }>(rows: T[]) => rows.filter((r) => r.academicYearId === year.id);
    return { academicYear: { id: year.id, name: year.name }, awards: inYear(awards), discipline: inYear(discipline) };
  }

  // ---- commendations ----

  async award(user: AuthUser, dto: AwardDto) {
    if (!mayGiveAward(dto.form, user.role)) throw new ForbiddenException(`${AWARD_LABEL[dto.form]} do nhà trường quyết định (Thông tư 19/2025/TT-BGDĐT)`);
    const year = await this.years.current(user.schoolId);
    const date = await this.movements.dateOf(user.schoolId, dto.date);
    const students = await this.pick(user, dto.studentIds, year.id);
    await this.prisma.studentAward.createMany({
      data: students.map((s) => ({ schoolId: user.schoolId, studentId: s.id, academicYearId: year.id, classId: s.classId, form: dto.form, date: toDbDate(date), content: dto.content, issuer: dto.issuer || null, decisionNo: dto.decisionNo || null, createdById: user.userId })),
    });
    if (dto.notifyParents !== false) {
      for (const s of students) {
        await this.tell(user.schoolId, s, NotificationKind.STUDENT_AWARD, 'Con được khen thưởng', `${s.fullName} được ${AWARD_LABEL[dto.form].toLowerCase()} ngày ${dmy(date)}: ${dto.content}.`);
      }
    }
    return { count: students.length };
  }

  async removeAward(user: AuthUser, id: string) {
    const row = await this.prisma.studentAward.findFirst({ where: { id, schoolId: user.schoolId }, select: { createdById: true } });
    if (!row) throw new NotFoundException('Không tìm thấy khen thưởng');
    if (user.role !== Role.ADMIN && row.createdById !== user.userId) throw new ForbiddenException('Chỉ người ghi nhận hoặc ban giám hiệu được xóa');
    await this.prisma.studentAward.delete({ where: { id } });
  }

  // ---- discipline ----

  async discipline(user: AuthUser, dto: DisciplineDto) {
    const year = await this.years.current(user.schoolId);
    const date = await this.movements.dateOf(user.schoolId, dto.date);
    const students = await this.pick(user, dto.studentIds, year.id);
    const earlier = await this.prisma.studentDiscipline.findMany({ where: { studentId: { in: students.map((s) => s.id) }, academicYearId: year.id }, select: { studentId: true, measure: true } });
    for (const s of students) {
      if (!mayTakeMeasure(dto.measure, user.role, s.homeroomUserId === user.userId)) throw new ForbiddenException(`${MEASURE_LABEL[dto.measure]} do hiệu trưởng hoặc giáo viên chủ nhiệm thực hiện (Điều 17)`);
      if (s.gradeLevel === null) throw new BadRequestException(`${s.fullName} chưa được xếp lớp năm học ${year.name}`);
      const problem = measureProblem(dto.measure, dto.severity, s.gradeLevel, earlier.filter((e) => e.studentId === s.id).map((e) => e.measure));
      if (problem) throw new BadRequestException(`${s.fullName}: ${problem}`);
    }
    await this.prisma.studentDiscipline.createMany({
      data: students.map((s) => ({ schoolId: user.schoolId, studentId: s.id, academicYearId: year.id, classId: s.classId, measure: dto.measure, severity: dto.severity, date: toDbDate(date), violation: dto.violation, support: dto.support || null, createdById: user.userId })),
    });
    if (dto.notifyParents !== false) {
      const ask = dto.measure === DisciplineMeasure.SELF_REVIEW ? ' Gia đình vui lòng xem bản tự kiểm điểm của con, xác nhận và cùng nhà trường giúp con khắc phục.' : '';
      for (const s of students) {
        await this.tell(user.schoolId, s, NotificationKind.STUDENT_DISCIPLINE, 'Thông báo từ nhà trường', `Ngày ${dmy(date)}, ${s.fullName} vi phạm: ${dto.violation}. Biện pháp giáo dục: ${MEASURE_LABEL[dto.measure].toLowerCase()}.${ask}`);
      }
    }
    return { count: students.length };
  }

  async updateDiscipline(user: AuthUser, id: string, dto: UpdateDisciplineDto) {
    const row = await this.prisma.studentDiscipline.findFirst({ where: { id, schoolId: user.schoolId }, select: { id: true, measure: true, class: { select: { homeroomTeacher: { select: { userId: true } } } } } });
    if (!row) throw new NotFoundException('Không tìm thấy bản ghi kỷ luật');
    if (user.role !== Role.ADMIN && row.class?.homeroomTeacher?.userId !== user.userId) throw new ForbiddenException('Chỉ hiệu trưởng hoặc giáo viên chủ nhiệm được cập nhật');
    const data: Prisma.StudentDisciplineUpdateInput = {};
    if (dto.support !== undefined) data.support = dto.support || null;
    if (dto.familyConfirmed !== undefined) {
      if (row.measure !== DisciplineMeasure.SELF_REVIEW) throw new BadRequestException('Chỉ bản tự kiểm điểm cần gia đình xác nhận');
      data.familyConfirmedAt = dto.familyConfirmed ? toDbDate(await this.movements.dateOf(user.schoolId)) : null;
    }
    const updated = await this.prisma.studentDiscipline.update({ where: { id }, data, include: { student: studentRef, class: classRef } });
    return (await this.presentDiscipline([updated]))[0];
  }

  /** The family confirms a self-review from the parent app (Điều 15). */
  async confirmByFamily(user: AuthUser, id: string) {
    const row = await this.prisma.studentDiscipline.findFirst({
      where: { id, schoolId: user.schoolId, measure: DisciplineMeasure.SELF_REVIEW, student: { guardians: { some: { userId: user.userId } } } },
      select: { id: true, familyConfirmedAt: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy bản tự kiểm điểm');
    if (!row.familyConfirmedAt) await this.prisma.studentDiscipline.update({ where: { id }, data: { familyConfirmedAt: toDbDate(await this.movements.dateOf(user.schoolId)) } });
    return { id, confirmed: true };
  }

  async removeDiscipline(user: AuthUser, id: string) {
    const row = await this.prisma.studentDiscipline.findFirst({ where: { id, schoolId: user.schoolId }, select: { createdById: true } });
    if (!row) throw new NotFoundException('Không tìm thấy bản ghi kỷ luật');
    if (user.role !== Role.ADMIN && row.createdById !== user.userId) throw new ForbiddenException('Chỉ người ghi nhận hoặc ban giám hiệu được xóa');
    await this.prisma.studentDiscipline.delete({ where: { id } });
  }

  // ---- internals ----

  private async listWhere(schoolId: string, q: MeritQuery) {
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('Từ ngày phải trước đến ngày');
    return {
      schoolId,
      studentId: q.studentId,
      classId: q.classId,
      date: q.from || q.to ? { gte: q.from ? toDbDate(q.from) : undefined, lte: q.to ? toDbDate(q.to) : undefined } : undefined,
    };
  }

  /** Who wrote each record down. */
  private async withAuthors<T extends { createdById: string }>(rows: T[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, fullName: true } });
    const name = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({ ...r, createdBy: name.get(r.createdById) ?? null }));
  }

  /** Studying students of the school with their class of the year. */
  private async pick(user: AuthUser, ids: string[], academicYearId: string): Promise<Picked[]> {
    const rows = await this.prisma.student.findMany({
      where: { id: { in: ids }, schoolId: user.schoolId },
      select: {
        id: true,
        fullName: true,
        status: true,
        enrollments: { where: { academicYearId }, select: { class: { select: { id: true, name: true, gradeLevel: true, homeroomTeacher: { select: { userId: true } } } } } },
      },
    });
    if (rows.length !== new Set(ids).size) throw new NotFoundException('Không tìm thấy học sinh');
    const gone = rows.find((r) => r.status !== StudentStatus.STUDYING);
    if (gone) throw new BadRequestException(`${gone.fullName} không còn đang học`);
    return rows.map((r) => {
      const c = r.enrollments[0]?.class;
      return { id: r.id, fullName: r.fullName, classId: c?.id ?? null, className: c?.name ?? null, gradeLevel: c?.gradeLevel ?? null, homeroomUserId: c?.homeroomTeacher?.userId ?? null };
    });
  }

  private async tell(schoolId: string, s: Picked, kind: NotificationKind, title: string, body: string) {
    try {
      await this.notifications.notifyGuardians(schoolId, s.id, { kind, title, body, data: { studentId: s.id, classId: s.classId } });
    } catch (e) {
      // The record is saved already; a failed alert must not fail the request.
      this.logger.error(`merit alert failed for ${s.id}: ${(e as Error).message}`);
    }
  }
}
