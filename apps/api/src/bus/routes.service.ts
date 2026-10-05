import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BusStaffRole, Prisma } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { ReplaceAssignmentsDto, ReplaceStopsDto, RouteDto, UpdateRouteDto } from './bus.dto';

const staffSelect = { select: { id: true, fullName: true, phone: true, role: true, isActive: true } } as const;

const routeInclude = {
  vehicle: { select: { id: true, plateNumber: true, capacity: true, status: true } },
  driver: staffSelect,
  monitor: staffSelect,
  stops: { orderBy: { order: 'asc' } },
  _count: { select: { assignments: { where: { isActive: true } }, trips: true } },
} satisfies Prisma.BusRouteInclude;
type RouteRow = Prisma.BusRouteGetPayload<{ include: typeof routeInclude }>;

const presentRoute = ({ _count, ...r }: RouteRow) => ({ ...r, studentCount: _count.assignments, tripCount: _count.trips });

// Latest enrolment = the student's current class.
const studentSelect = {
  id: true,
  code: true,
  fullName: true,
  enrollments: { orderBy: { enrolledAt: 'desc' }, take: 1, select: { class: { select: { id: true, name: true } } } },
} satisfies Prisma.StudentSelect;
type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;
export const flatStudent = ({ enrollments, ...s }: StudentRow) => ({ ...s, class: enrollments[0]?.class ?? null });

/** Routes, their ordered stops and which students ride them. */
@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  async list(schoolId: string) {
    const rows = await this.prisma.busRoute.findMany({
      where: { schoolId },
      include: routeInclude,
      orderBy: [{ direction: 'asc' }, { startTime: 'asc' }, { name: 'asc' }],
    });
    return rows.map(presentRoute);
  }

  async get(schoolId: string, id: string) {
    const r = await this.prisma.busRoute.findFirst({ where: { id, schoolId }, include: routeInclude });
    if (!r) throw new NotFoundException('Không tìm thấy tuyến xe');
    return presentRoute(r);
  }

  async create(schoolId: string, dto: RouteDto) {
    await this.assertRefs(schoolId, dto);
    try {
      const r = await this.prisma.busRoute.create({
        data: {
          schoolId,
          name: dto.name.trim(),
          direction: dto.direction,
          startTime: dto.startTime,
          vehicleId: dto.vehicleId ?? null,
          driverId: dto.driverId ?? null,
          monitorId: dto.monitorId ?? null,
          isActive: dto.isActive,
        },
        include: routeInclude,
      });
      return presentRoute(r);
    } catch (e) {
      rethrowPrismaError(e, 'Tên tuyến đã tồn tại');
    }
  }

  async update(schoolId: string, id: string, dto: UpdateRouteDto) {
    await this.get(schoolId, id);
    await this.assertRefs(schoolId, dto);
    try {
      const r = await this.prisma.busRoute.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          direction: dto.direction,
          startTime: dto.startTime,
          vehicleId: dto.vehicleId,
          driverId: dto.driverId,
          monitorId: dto.monitorId,
          isActive: dto.isActive,
        },
        include: routeInclude,
      });
      return presentRoute(r);
    } catch (e) {
      rethrowPrismaError(e, 'Tên tuyến đã tồn tại');
    }
  }

  async remove(schoolId: string, id: string) {
    const r = await this.get(schoolId, id);
    if (r.tripCount) throw new ConflictException('Tuyến đã có chuyến đi, hãy ngừng hoạt động thay vì xóa');
    // Stops and assignments cascade.
    await this.prisma.busRoute.delete({ where: { id } });
    return { ok: true };
  }

  /** Replaces the ordered stop list. Stops sent with their id are updated in place so their assignments survive. */
  async replaceStops(schoolId: string, routeId: string, dto: ReplaceStopsDto) {
    const route = await this.get(schoolId, routeId);
    const existing = new Set(route.stops.map((s) => s.id));
    const kept = dto.stops.filter((s) => s.id && existing.has(s.id)).map((s) => s.id!);
    if (new Set(kept).size !== kept.length) throw new BadRequestException('Điểm đón bị trùng trong danh sách');
    const keptSet = new Set(kept);

    await this.prisma.$transaction(async (tx) => {
      await tx.busStop.deleteMany({ where: { routeId, id: { notIn: kept } } });
      // Park kept stops on negative orders first so reordering never collides on [routeId, order].
      for (const [i, s] of dto.stops.entries()) {
        if (s.id && keptSet.has(s.id)) await tx.busStop.update({ where: { id: s.id }, data: { order: -(i + 1) } });
      }
      for (const [i, s] of dto.stops.entries()) {
        const data = { order: i + 1, name: s.name.trim(), address: s.address?.trim() || null, lat: s.lat, lng: s.lng, plannedTime: s.plannedTime || null };
        if (s.id && keptSet.has(s.id)) await tx.busStop.update({ where: { id: s.id }, data });
        else await tx.busStop.create({ data: { ...data, routeId } });
      }
    });
    return this.get(schoolId, routeId);
  }

  async listAssignments(schoolId: string, routeId: string) {
    await this.get(schoolId, routeId);
    const rows = await this.prisma.busAssignment.findMany({
      where: { routeId, isActive: true },
      include: { student: { select: studentSelect }, stop: { select: { id: true, name: true, order: true, plannedTime: true } } },
      orderBy: [{ stop: { order: 'asc' } }, { student: { fullName: 'asc' } }],
    });
    return rows.map(({ student, ...a }) => ({ ...a, student: flatStudent(student) }));
  }

  /** Replaces the roster for the current academic year. A student rides at most one route per direction. */
  async replaceAssignments(schoolId: string, routeId: string, dto: ReplaceAssignmentsDto) {
    const route = await this.get(schoolId, routeId);
    const year = await this.years.current(schoolId);
    const stopIds = new Set(route.stops.map((s) => s.id));
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (!stopIds.has(item.stopId)) throw new BadRequestException('Điểm đón không thuộc tuyến này');
      if (seen.has(item.studentId)) throw new BadRequestException('Học sinh bị trùng trong danh sách');
      seen.add(item.studentId);
    }
    const ids = [...seen];
    if (ids.length) {
      const found = await this.prisma.student.count({ where: { id: { in: ids }, schoolId } });
      if (found !== ids.length) throw new BadRequestException('Học sinh không hợp lệ');
      const clash = await this.prisma.busAssignment.findFirst({
        where: { schoolId, studentId: { in: ids }, isActive: true, routeId: { not: routeId }, route: { direction: route.direction, isActive: true } },
        include: { student: { select: { fullName: true } }, route: { select: { name: true } } },
      });
      if (clash) throw new BadRequestException(`${clash.student.fullName} đã ở tuyến "${clash.route.name}"`);
    }
    await this.prisma.$transaction([
      this.prisma.busAssignment.deleteMany({ where: { routeId } }),
      this.prisma.busAssignment.createMany({
        data: dto.items.map((item) => ({ schoolId, routeId, stopId: item.stopId, studentId: item.studentId, academicYearId: year.id })),
      }),
    ]);
    return this.listAssignments(schoolId, routeId);
  }

  async removeAssignment(schoolId: string, routeId: string, studentId: string) {
    const { count } = await this.prisma.busAssignment.deleteMany({ where: { schoolId, routeId, studentId } });
    if (!count) throw new NotFoundException('Không tìm thấy phân tuyến');
    return { ok: true };
  }

  /** Vehicle, driver and monitor must belong to the school and hold the matching role. */
  private async assertRefs(schoolId: string, dto: UpdateRouteDto) {
    if (dto.vehicleId && !(await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, schoolId } }))) {
      throw new BadRequestException('Xe không hợp lệ');
    }
    if (dto.driverId && !(await this.prisma.busStaff.findFirst({ where: { id: dto.driverId, schoolId, role: BusStaffRole.DRIVER } }))) {
      throw new BadRequestException('Lái xe không hợp lệ');
    }
    if (dto.monitorId && !(await this.prisma.busStaff.findFirst({ where: { id: dto.monitorId, schoolId, role: BusStaffRole.MONITOR } }))) {
      throw new BadRequestException('Phụ xe không hợp lệ');
    }
  }
}
