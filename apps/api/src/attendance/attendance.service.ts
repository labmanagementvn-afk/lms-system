import { BadRequestException, Injectable } from '@nestjs/common';
import { EventMethod, EventSource, Prisma, StudentStatus, TeacherStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { pageArgs } from '../common/pagination';
import { localDate, zonedDayRange } from '../common/time';
import { AlertsService } from '../notifications/alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { DailyQuery, EventsQuery, ManualEventDto } from './attendance.dto';
import { summarizeDay } from './daily-summary';

const person = { select: { id: true, code: true, fullName: true } };

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  async manual(user: AuthUser, dto: ManualEventDto) {
    if (!!dto.studentId === !!dto.teacherId) throw new BadRequestException('Chọn đúng một học sinh hoặc một giáo viên');
    if (dto.studentId) await this.prisma.student.findFirstOrThrow({ where: { id: dto.studentId, schoolId: user.schoolId } });
    if (dto.teacherId) await this.prisma.teacher.findFirstOrThrow({ where: { id: dto.teacherId, schoolId: user.schoolId } });
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + 60_000) throw new BadRequestException('Thời gian không được ở tương lai');
    const event = await this.prisma.gateEvent.create({
      data: {
        schoolId: user.schoolId,
        studentId: dto.studentId,
        teacherId: dto.teacherId,
        direction: dto.direction,
        occurredAt,
        method: EventMethod.MANUAL,
        source: EventSource.MANUAL,
        recordedById: user.userId,
        note: dto.note,
      },
      include: { student: person, teacher: person },
    });
    if (event.studentId) await this.alerts.gateEvents(user.schoolId, [{ studentId: event.studentId, direction: event.direction, occurredAt }]);
    return event;
  }

  async events(schoolId: string, query: EventsQuery) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    const { start, end } = zonedDayRange(query.date ?? localDate(new Date(), school.timezone), school.timezone);
    const where: Prisma.GateEventWhereInput = {
      schoolId,
      occurredAt: { gte: start, lt: end },
      deviceId: query.deviceId,
      studentId: query.studentId,
      teacherId: query.teacherId,
      ...(query.unmatched ? { studentId: null, teacherId: null } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.gateEvent.findMany({
        where,
        include: { student: person, teacher: person, device: { select: { id: true, name: true, location: true } } },
        orderBy: { occurredAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.gateEvent.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Per-person arrival/leaving and on-time/late/absent status for one school day. */
  async daily(schoolId: string, query: DailyQuery) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    const date = query.date ?? localDate(new Date(), school.timezone);
    const { start, end } = zonedDayRange(date, school.timezone);
    const window = { occurredAt: { gte: start, lt: end } };

    let people: { id: string; code: string; fullName: string; className?: string }[];
    let events: { studentId: string | null; teacherId: string | null; occurredAt: Date; direction: any }[];

    if (query.personType === 'TEACHER') {
      people = await this.prisma.teacher.findMany({
        where: { schoolId, status: { not: TeacherStatus.RESIGNED } },
        select: { id: true, code: true, fullName: true },
        orderBy: { fullName: 'asc' },
      });
      events = await this.prisma.gateEvent.findMany({
        where: { schoolId, teacherId: { not: null }, ...window },
        select: { studentId: true, teacherId: true, occurredAt: true, direction: true },
      });
    } else {
      const students = await this.prisma.student.findMany({
        where: {
          schoolId,
          status: StudentStatus.STUDYING,
          enrollments: query.classId ? { some: { classId: query.classId } } : undefined,
        },
        select: {
          id: true,
          code: true,
          fullName: true,
          enrollments: { select: { class: { select: { name: true } } }, orderBy: { enrolledAt: 'desc' }, take: 1 },
        },
        orderBy: { fullName: 'asc' },
      });
      people = students.map((s) => ({ id: s.id, code: s.code, fullName: s.fullName, className: s.enrollments[0]?.class.name }));
      events = await this.prisma.gateEvent.findMany({
        where: { schoolId, studentId: { in: people.map((p) => p.id) }, ...window },
        select: { studentId: true, teacherId: true, occurredAt: true, direction: true },
      });
    }

    const byPerson = new Map<string, typeof events>();
    for (const e of events) {
      const id = (e.studentId ?? e.teacherId)!;
      byPerson.set(id, [...(byPerson.get(id) ?? []), e]);
    }

    const rows = people.map((p) => ({ person: p, ...summarizeDay(byPerson.get(p.id) ?? [], school.lateAfter, school.timezone) }));
    return {
      date,
      lateAfter: school.lateAfter,
      timezone: school.timezone,
      summary: {
        total: rows.length,
        onTime: rows.filter((r) => r.status === 'ON_TIME').length,
        late: rows.filter((r) => r.status === 'LATE').length,
        absent: rows.filter((r) => r.status === 'ABSENT').length,
      },
      rows,
    };
  }
}
