import { BusDirection, BusStaffRole, PrismaClient, Role } from '@prisma/client';
import { SeedContext } from './context';

// Pickup points around Cầu Giấy, Hà Nội: name, address, lat, lng.
const STOPS: [string, string, number, number][] = [
  ['Ngã tư Cầu Giấy', '304 Cầu Giấy, Dịch Vọng', 21.0305, 105.8012],
  ['Công viên Nghĩa Đô', '69 Nguyễn Văn Huyên, Nghĩa Đô', 21.0437, 105.8043],
  ['Chợ Nghĩa Tân', 'Phố Nghĩa Tân, Cầu Giấy', 21.0443, 105.7916],
  ['Đại học Sư phạm Hà Nội', '136 Xuân Thủy, Cầu Giấy', 21.0375, 105.7825],
];

const date = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const daysFromNow = (days: number) => date(new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10));

/** "06:15" + 20 minutes -> "06:35". */
function plus(hhmm: string, minutes: number) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * Demo bus data: two vehicles, a driver with a driver-app login (0912000001 / Driver@123)
 * and a monitor, one route in both directions with four stops, and the first eight
 * students of 6A1 riding it (two per stop).
 */
export async function seedBus(prisma: PrismaClient, ctx: SeedContext) {
  const { schoolId } = ctx;

  const bus1 = await prisma.vehicle.create({
    data: { schoolId, plateNumber: '29B-123.45', model: 'Ford Transit 16 chỗ', capacity: 16, inspectionExpiry: date('2027-03-31'), insuranceExpiry: date('2027-01-15') },
  });
  await prisma.vehicle.create({
    // Inspection lapses soon so the fleet page shows a warning.
    data: { schoolId, plateNumber: '29B-678.90', model: 'Hyundai County 29 chỗ', capacity: 29, inspectionExpiry: daysFromNow(12), insuranceExpiry: date('2027-06-30') },
  });

  const driverUser = await prisma.user.create({
    data: { schoolId, phone: '0912000001', fullName: 'Nguyễn Văn Tài', role: Role.DRIVER, passwordHash: await ctx.hash('Driver@123'), mustChangePassword: false },
  });
  const driver = await prisma.busStaff.create({
    data: { schoolId, fullName: 'Nguyễn Văn Tài', phone: '0912000001', role: BusStaffRole.DRIVER, licenseNumber: '010123456789', licenseExpiry: date('2028-06-30'), userId: driverUser.id },
  });
  const monitor = await prisma.busStaff.create({ data: { schoolId, fullName: 'Trần Thị Hoa', phone: '0912000002', role: BusStaffRole.MONITOR } });

  const crew = { vehicleId: bus1.id, driverId: driver.id, monitorId: monitor.id };
  const stops = (startTime: string, reversed: boolean) =>
    (reversed ? [...STOPS].reverse() : STOPS).map(([name, address, lat, lng], i) => ({ order: i + 1, name, address, lat, lng, plannedTime: plus(startTime, i * 10) }));
  const include = { stops: { orderBy: { order: 'asc' as const } } };
  const pickup = await prisma.busRoute.create({
    data: { schoolId, name: 'Tuyến 1 - Cầu Giấy', direction: BusDirection.PICKUP, startTime: '06:15', ...crew, stops: { create: stops('06:15', false) } },
    include,
  });
  const dropoff = await prisma.busRoute.create({
    data: { schoolId, name: 'Tuyến 1 - Cầu Giấy (chiều về)', direction: BusDirection.DROPOFF, startTime: '16:30', ...crew, stops: { create: stops('16:30', true) } },
    include,
  });

  // Two students per stop, dropped off where they were picked up.
  const students = ctx.studentIds.slice(0, 8);
  await prisma.busAssignment.createMany({
    data: students.flatMap((studentId, i) => {
      const stopName = STOPS[Math.floor(i / 2)][0];
      return [pickup, dropoff].map((route) => ({
        schoolId,
        routeId: route.id,
        stopId: route.stops.find((s) => s.name === stopName)!.id,
        studentId,
        academicYearId: ctx.academicYearId,
      }));
    }),
  });
}
