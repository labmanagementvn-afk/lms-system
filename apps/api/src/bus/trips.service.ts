import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BoardingType, BusDirection, BusStaff, BusStaffRole, BusTripStatus, NotificationKind, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { localDate, localTime } from '../common/time';
import { NotificationsService } from '../notifications/notifications.service';
import { ParentAccessService } from '../parents/parent-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { boardingState, boardingStates, boardingTransitionError, countStates } from './boarding-state';
import { fromDbDate, isValidDate, toDbDate } from './bus-rules';
import { BoardingDto, DateQuery, LocationDto } from './bus.dto';
import { flatStudent } from './routes.service';

const staffSelect = { select: { id: true, fullName: true, phone: true } } as const;
const vehicleSelect = { select: { id: true, plateNumber: true, capacity: true } } as const;

const routeSelect = {
  id: true,
  name: true,
  direction: true,
  startTime: true,
  isActive: true,
  vehicle: vehicleSelect,
  driver: staffSelect,
  monitor: staffSelect,
  _count: { select: { assignments: { where: { isActive: true } } } },
} satisfies Prisma.BusRouteSelect;

const tripInclude = {
  route: { select: routeSelect },
  vehicle: vehicleSelect,
  driver: staffSelect,
  boardings: { select: { studentId: true, type: true, occurredAt: true } },
} satisfies Prisma.BusTripInclude;
type TripRow = Prisma.BusTripGetPayload<{ include: typeof tripInclude }>;

const studentSelect = {
  id: true,
  code: true,
  fullName: true,
  enrollments: { orderBy: { enrolledAt: 'desc' }, take: 1, select: { class: { select: { id: true, name: true } } } },
} satisfies Prisma.StudentSelect;

const detailInclude = {
  route: {
    select: {
      ...routeSelect,
      stops: { orderBy: { order: 'asc' } },
      assignments: { where: { isActive: true }, select: { stopId: true, student: { select: studentSelect } } },
    },
  },
  vehicle: vehicleSelect,
  driver: staffSelect,
  boardings: {
    include: { student: { select: { id: true, code: true, fullName: true } }, stop: { select: { id: true, name: true } } },
    orderBy: { occurredAt: 'asc' },
  },
} satisfies Prisma.BusTripInclude;
type DetailRow = Prisma.BusTripGetPayload<{ include: typeof detailInclude }>;

const lastLocation = (t: { lastLat: number | null; lastLng: number | null; lastLocationAt: Date | null }) =>
  t.lastLat !== null && t.lastLng !== null ? { lat: t.lastLat, lng: t.lastLng, at: t.lastLocationAt } : null;

/** A trip snapshots its vehicle and driver when it starts; before that the route's plan is shown. */
function presentTrip({ route, boardings, vehicle, driver, ...trip }: TripRow) {
  return {
    ...trip,
    date: fromDbDate(trip.date),
    route: { id: route.id, name: route.name, direction: route.direction, startTime: route.startTime, isActive: route.isActive },
    vehicle: vehicle ?? route.vehicle,
    driver: driver ?? route.driver,
    monitor: route.monitor,
    counts: { total: route._count.assignments, ...countStates(boardingStates(boardings).values()) },
    lastLocation: lastLocation(trip),
  };
}

/** Roster grouped by stop, each student with their state on this trip, plus the event log. */
function presentDetail({ route, boardings, vehicle, driver, ...trip }: DetailRow) {
  const states = boardingStates(boardings);
  const last = new Map<string, DetailRow['boardings'][number]>();
  for (const e of boardings) last.set(e.studentId, e);
  return {
    ...trip,
    date: fromDbDate(trip.date),
    route: { id: route.id, name: route.name, direction: route.direction, startTime: route.startTime, isActive: route.isActive },
    vehicle: vehicle ?? route.vehicle,
    driver: driver ?? route.driver,
    monitor: route.monitor,
    counts: { total: route.assignments.length, ...countStates(states.values()) },
    lastLocation: lastLocation(trip),
    stops: route.stops.map((s) => ({
      ...s,
      students: route.assignments
        .filter((a) => a.stopId === s.id)
        .map((a) => {
          const e = last.get(a.student.id);
          return {
            ...flatStudent(a.student),
            state: states.get(a.student.id) ?? 'NOT_BOARDED',
            lastEvent: e ? { type: e.type, occurredAt: e.occurredAt, stop: e.stop } : null,
          };
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')),
    })),
    events: boardings,
  };
}

/** Daily trips: the school's list and live map, the driver app, and what a parent sees of their child's ride. */
@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly access: ParentAccessService,
  ) {}

  /** Creates the day's PLANNED trip for every active route (or the given ones) that has none yet. */
  async ensureTrips(schoolId: string, date: string, routeIds?: string[]) {
    const routes = await this.prisma.busRoute.findMany({
      where: { schoolId, isActive: true, id: routeIds ? { in: routeIds } : undefined },
      select: { id: true, vehicleId: true, driverId: true },
    });
    if (!routes.length) return 0;
    const { count } = await this.prisma.busTrip.createMany({
      data: routes.map((r) => ({ schoolId, routeId: r.id, date: toDbDate(date), vehicleId: r.vehicleId, driverId: r.driverId })),
      skipDuplicates: true,
    });
    return count;
  }

  // ---- School staff ----

  async list(schoolId: string, query: DateQuery) {
    const date = await this.resolveDate(schoolId, query.date);
    await this.ensureTrips(schoolId, date);
    const items = await this.prisma.busTrip.findMany({
      where: { schoolId, date: toDbDate(date) },
      include: tripInclude,
      orderBy: [{ route: { startTime: 'asc' } }, { route: { name: 'asc' } }],
    });
    return { date, items: items.map(presentTrip) };
  }

  async detail(schoolId: string, id: string, routeIds?: string[]) {
    const t = await this.prisma.busTrip.findFirst({
      where: { id, schoolId, routeId: routeIds ? { in: routeIds } : undefined },
      include: detailInclude,
    });
    if (!t) throw new NotFoundException('Không tìm thấy chuyến xe');
    return presentDetail(t);
  }

  async cancel(schoolId: string, id: string) {
    const t = await this.find(schoolId, id);
    if (t.status === BusTripStatus.DONE) throw new BadRequestException('Chuyến đã hoàn thành');
    if (t.status === BusTripStatus.CANCELLED) throw new BadRequestException('Chuyến đã hủy');
    await this.prisma.busTrip.update({ where: { id }, data: { status: BusTripStatus.CANCELLED, endedAt: t.startedAt ? new Date() : null } });
    return this.detail(schoolId, id);
  }

  /** Today's running trips for the live map. */
  async live(schoolId: string) {
    const date = await this.resolveDate(schoolId);
    const items = await this.prisma.busTrip.findMany({
      where: { schoolId, date: toDbDate(date), status: BusTripStatus.RUNNING },
      include: tripInclude,
      orderBy: { startedAt: 'asc' },
    });
    return { date, items: items.map(presentTrip) };
  }

  async locations(schoolId: string, id: string) {
    await this.find(schoolId, id);
    return this.prisma.busLocation.findMany({
      where: { tripId: id },
      select: { lat: true, lng: true, speed: true, heading: true, recordedAt: true },
      orderBy: { recordedAt: 'asc' },
    });
  }

  // ---- Driver app ----

  /** The crew member behind a DRIVER login. */
  async staffOf(user: AuthUser): Promise<BusStaff> {
    const staff = await this.prisma.busStaff.findFirst({ where: { userId: user.userId, schoolId: user.schoolId } });
    if (!staff) throw new ForbiddenException('Tài khoản chưa gắn với nhân viên xe');
    if (!staff.isActive) throw new ForbiddenException('Nhân viên xe đã ngừng hoạt động');
    return staff;
  }

  async driverTrips(user: AuthUser, query: DateQuery) {
    const staff = await this.staffOf(user);
    const date = await this.resolveDate(user.schoolId, query.date);
    const routes = await this.prisma.busRoute.findMany({
      where: { schoolId: user.schoolId, isActive: true, OR: [{ driverId: staff.id }, { monitorId: staff.id }] },
      select: { id: true, driverId: true },
    });
    const ids = routes.map((r) => r.id);
    await this.ensureTrips(user.schoolId, date, ids);
    const items = ids.length
      ? await this.prisma.busTrip.findMany({
          where: { schoolId: user.schoolId, date: toDbDate(date), routeId: { in: ids } },
          include: tripInclude,
          orderBy: [{ route: { startTime: 'asc' } }, { route: { name: 'asc' } }],
        })
      : [];
    return {
      date,
      staff: { id: staff.id, fullName: staff.fullName, role: staff.role },
      items: items.map((t) => ({ ...presentTrip(t), myRole: routes.find((r) => r.id === t.routeId)?.driverId === staff.id ? 'DRIVER' : 'MONITOR' })),
    };
  }

  async driverTrip(user: AuthUser, id: string) {
    const staff = await this.staffOf(user);
    return this.detail(user.schoolId, id, await this.routeIdsOf(staff));
  }

  async start(user: AuthUser, id: string) {
    const staff = await this.staffOf(user);
    const t = await this.mine(user, staff, id);
    if (t.status !== BusTripStatus.PLANNED) {
      throw new BadRequestException(t.status === BusTripStatus.RUNNING ? 'Chuyến đã bắt đầu' : 'Chuyến đã kết thúc');
    }
    await this.prisma.busTrip.update({
      where: { id },
      data: {
        status: BusTripStatus.RUNNING,
        startedAt: new Date(),
        vehicleId: t.route.vehicleId,
        driverId: t.route.driverId ?? (staff.role === BusStaffRole.DRIVER ? staff.id : null),
      },
    });
    return this.detail(user.schoolId, id);
  }

  /** Ends the run. Students still marked on the bus are left as they are for the office to review. */
  async end(user: AuthUser, id: string) {
    const staff = await this.staffOf(user);
    const t = await this.mine(user, staff, id);
    this.assertRunning(t);
    await this.prisma.busTrip.update({ where: { id }, data: { status: BusTripStatus.DONE, endedAt: new Date() } });
    return this.detail(user.schoolId, id);
  }

  async location(user: AuthUser, id: string, dto: LocationDto) {
    const staff = await this.staffOf(user);
    const t = await this.mine(user, staff, id);
    this.assertRunning(t);
    const recordedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.busLocation.create({ data: { tripId: id, lat: dto.lat, lng: dto.lng, speed: dto.speed ?? null, heading: dto.heading ?? null, recordedAt } }),
      this.prisma.busTrip.update({ where: { id }, data: { lastLat: dto.lat, lastLng: dto.lng, lastLocationAt: recordedAt } }),
    ]);
    return { ok: true, recordedAt };
  }

  async boarding(user: AuthUser, id: string, dto: BoardingDto) {
    const staff = await this.staffOf(user);
    const t = await this.mine(user, staff, id);
    this.assertRunning(t);
    const assignment = await this.prisma.busAssignment.findFirst({
      where: { routeId: t.routeId, studentId: dto.studentId, isActive: true },
      include: { student: { select: { id: true, fullName: true } }, stop: { select: { id: true, name: true } } },
    });
    if (!assignment) throw new BadRequestException('Học sinh không thuộc tuyến này');
    const history = await this.prisma.boardingEvent.findMany({ where: { tripId: id, studentId: dto.studentId }, select: { type: true, occurredAt: true } });
    const error = boardingTransitionError(boardingState(history), dto.type);
    if (error) throw new BadRequestException(error);

    let stop: { id: string; name: string } | null = null;
    if (dto.stopId) {
      stop = await this.prisma.busStop.findFirst({ where: { id: dto.stopId, routeId: t.routeId }, select: { id: true, name: true } });
      if (!stop) throw new BadRequestException('Điểm đón không thuộc tuyến này');
    } else if ((t.route.direction === BusDirection.PICKUP) === (dto.type === BoardingType.BOARD)) {
      // The roadside end of the ride: boarding on a pickup run, alighting on a drop-off run.
      stop = assignment.stop;
    }
    const event = await this.prisma.boardingEvent.create({
      data: {
        schoolId: user.schoolId,
        tripId: id,
        studentId: dto.studentId,
        type: dto.type,
        stopId: stop?.id ?? null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        recordedById: user.userId,
        note: dto.note?.trim() || null,
      },
      include: { student: { select: { id: true, code: true, fullName: true } }, stop: { select: { id: true, name: true } } },
    });
    await this.notifyBoarding(user.schoolId, t, assignment.student, event);
    return { ...event, state: boardingState([...history, event]) };
  }

  private async notifyBoarding(
    schoolId: string,
    trip: { id: string; routeId: string; route: { name: string } },
    student: { id: string; fullName: string },
    event: { type: BoardingType; occurredAt: Date; stop: { id: string; name: string } | null },
  ) {
    try {
      const board = event.type === BoardingType.BOARD;
      const time = localTime(event.occurredAt, await this.timezone(schoolId));
      await this.notifications.notifyGuardians(schoolId, student.id, {
        kind: board ? NotificationKind.BUS_BOARD : NotificationKind.BUS_ALIGHT,
        title: board ? 'Con đã lên xe' : 'Con đã xuống xe',
        body: `${student.fullName} đã ${board ? 'lên' : 'xuống'} xe tuyến ${trip.route.name} lúc ${time}${event.stop ? ` tại ${event.stop.name}` : ''}.`,
        data: { tripId: trip.id, routeId: trip.routeId, stopId: event.stop?.id ?? null, type: event.type, occurredAt: event.occurredAt.toISOString() },
      });
    } catch (e) {
      // The boarding stays recorded even when the alert cannot be sent.
      this.logger.error(`bus alert failed: ${(e as Error).message}`);
    }
  }

  // ---- Parent app ----

  /** The child's routes and stops, and today's trips with their boarding events. */
  async childBus(user: AuthUser, studentId: string) {
    const student = await this.access.assertChild(user, studentId);
    const date = await this.resolveDate(user.schoolId);
    const assignments = await this.prisma.busAssignment.findMany({
      where: { schoolId: user.schoolId, studentId, isActive: true, route: { isActive: true } },
      include: {
        route: {
          select: {
            id: true,
            name: true,
            direction: true,
            startTime: true,
            vehicle: { select: { plateNumber: true } },
            driver: { select: { fullName: true, phone: true } },
          },
        },
        stop: true,
      },
      orderBy: { route: { startTime: 'asc' } },
    });
    const routeIds = assignments.map((a) => a.routeId);
    const include = {
      vehicle: { select: { plateNumber: true } },
      driver: { select: { fullName: true, phone: true } },
      boardings: { where: { studentId }, include: { stop: { select: { id: true, name: true } } }, orderBy: { occurredAt: 'asc' } },
    } satisfies Prisma.BusTripInclude;
    let trips: Prisma.BusTripGetPayload<{ include: typeof include }>[] = [];
    if (routeIds.length) {
      await this.ensureTrips(user.schoolId, date, routeIds);
      trips = await this.prisma.busTrip.findMany({
        where: { schoolId: user.schoolId, date: toDbDate(date), routeId: { in: routeIds } },
        include,
        orderBy: { route: { startTime: 'asc' } },
      });
    }
    const byRoute = new Map(assignments.map((a) => [a.routeId, a]));
    const route = (a: (typeof assignments)[number]) => ({ id: a.route.id, name: a.route.name, direction: a.route.direction, startTime: a.route.startTime });
    return {
      student,
      date,
      assignments: assignments.map((a) => ({
        route: route(a),
        stop: { id: a.stop.id, order: a.stop.order, name: a.stop.name, address: a.stop.address, plannedTime: a.stop.plannedTime, lat: a.stop.lat, lng: a.stop.lng },
        vehicle: a.route.vehicle,
        driver: a.route.driver,
      })),
      today: trips.map((t) => {
        const a = byRoute.get(t.routeId)!;
        return {
          trip: { id: t.id, status: t.status, startedAt: t.startedAt, endedAt: t.endedAt, lastLat: t.lastLat, lastLng: t.lastLng, lastLocationAt: t.lastLocationAt },
          route: route(a),
          vehicle: t.vehicle ?? a.route.vehicle,
          driver: t.driver ?? a.route.driver,
          state: boardingState(t.boardings),
          events: t.boardings.map((e) => ({ id: e.id, type: e.type, occurredAt: e.occurredAt, stop: e.stop })),
        };
      }),
    };
  }

  // ---- Helpers ----

  private async find(schoolId: string, id: string) {
    const t = await this.prisma.busTrip.findFirst({ where: { id, schoolId } });
    if (!t) throw new NotFoundException('Không tìm thấy chuyến xe');
    return t;
  }

  /** A trip on one of the crew member's routes (active or not, so a run can still be closed). */
  private async mine(user: AuthUser, staff: BusStaff, id: string) {
    const t = await this.prisma.busTrip.findFirst({
      where: { id, schoolId: user.schoolId, route: { OR: [{ driverId: staff.id }, { monitorId: staff.id }] } },
      include: { route: { select: { id: true, name: true, direction: true, vehicleId: true, driverId: true } } },
    });
    if (!t) throw new NotFoundException('Không tìm thấy chuyến xe');
    return t;
  }

  private async routeIdsOf(staff: BusStaff) {
    const routes = await this.prisma.busRoute.findMany({
      where: { schoolId: staff.schoolId, OR: [{ driverId: staff.id }, { monitorId: staff.id }] },
      select: { id: true },
    });
    return routes.map((r) => r.id);
  }

  private assertRunning(t: { status: BusTripStatus }) {
    if (t.status === BusTripStatus.PLANNED) throw new BadRequestException('Chuyến chưa bắt đầu');
    if (t.status !== BusTripStatus.RUNNING) throw new BadRequestException('Chuyến đã kết thúc');
  }

  private async resolveDate(schoolId: string, date?: string) {
    if (date && !isValidDate(date)) throw new BadRequestException('Ngày không hợp lệ');
    return date ?? localDate(new Date(), await this.timezone(schoolId));
  }

  private async timezone(schoolId: string) {
    return (await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } })).timezone;
  }
}
