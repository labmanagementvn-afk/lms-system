import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { generatePassword } from '../common/passwords';
import { normalizePhone } from '../common/phone';
import { rethrowPrismaError } from '../common/prisma-errors';
import { localDate } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import { daysLeft, fromDbDate, isExpiring, isValidDate, toDbDate } from './bus-rules';
import { BusStaffDto, UpdateBusStaffDto, UpdateVehicleDto, VehicleDto } from './bus.dto';

const vehicleInclude = { _count: { select: { routes: true } } } satisfies Prisma.VehicleInclude;
type VehicleRow = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

const staffInclude = {
  user: { select: { id: true, phone: true, isActive: true, mustChangePassword: true } },
  _count: { select: { drivingRoutes: true, monitorRoutes: true } },
} satisfies Prisma.BusStaffInclude;
type StaffRow = Prisma.BusStaffGetPayload<{ include: typeof staffInclude }>;

function presentVehicle({ _count, ...v }: VehicleRow, today: string) {
  const inspectionDaysLeft = daysLeft(v.inspectionExpiry, today);
  const insuranceDaysLeft = daysLeft(v.insuranceExpiry, today);
  return {
    ...v,
    inspectionExpiry: fromDbDate(v.inspectionExpiry),
    insuranceExpiry: fromDbDate(v.insuranceExpiry),
    routeCount: _count.routes,
    inspectionDaysLeft,
    insuranceDaysLeft,
    expiring: { inspection: isExpiring(inspectionDaysLeft), insurance: isExpiring(insuranceDaysLeft) },
  };
}

function presentStaff({ _count, ...s }: StaffRow, today: string) {
  const licenseDaysLeft = daysLeft(s.licenseExpiry, today);
  return {
    ...s,
    licenseExpiry: fromDbDate(s.licenseExpiry),
    licenseDaysLeft,
    licenseExpiring: isExpiring(licenseDaysLeft),
    routeCount: _count.drivingRoutes + _count.monitorRoutes,
  };
}

/** undefined = leave unchanged, null/'' = clear, otherwise a validated calendar date. */
function dateField(value: string | null | undefined, label: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  if (!isValidDate(value)) throw new BadRequestException(`${label} không hợp lệ`);
  return toDbDate(value);
}

const text = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() || null);

/** Vehicles and the drivers / monitors who crew them, with their driver-app logins. */
@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Vehicles ----

  async listVehicles(schoolId: string) {
    const [today, rows] = await Promise.all([
      this.today(schoolId),
      this.prisma.vehicle.findMany({ where: { schoolId }, include: vehicleInclude, orderBy: { plateNumber: 'asc' } }),
    ]);
    return rows.map((v) => presentVehicle(v, today));
  }

  async createVehicle(schoolId: string, dto: VehicleDto) {
    try {
      const v = await this.prisma.vehicle.create({
        data: {
          schoolId,
          plateNumber: dto.plateNumber.trim().toUpperCase(),
          model: text(dto.model) ?? null,
          capacity: dto.capacity,
          inspectionExpiry: dateField(dto.inspectionExpiry, 'Hạn đăng kiểm') ?? null,
          insuranceExpiry: dateField(dto.insuranceExpiry, 'Hạn bảo hiểm') ?? null,
          status: dto.status,
          notes: text(dto.notes) ?? null,
        },
        include: vehicleInclude,
      });
      return presentVehicle(v, await this.today(schoolId));
    } catch (e) {
      rethrowPrismaError(e, 'Biển số xe đã tồn tại');
    }
  }

  async updateVehicle(schoolId: string, id: string, dto: UpdateVehicleDto) {
    await this.findVehicle(schoolId, id);
    try {
      const v = await this.prisma.vehicle.update({
        where: { id },
        data: {
          plateNumber: dto.plateNumber?.trim().toUpperCase(),
          model: text(dto.model),
          capacity: dto.capacity,
          inspectionExpiry: dateField(dto.inspectionExpiry, 'Hạn đăng kiểm'),
          insuranceExpiry: dateField(dto.insuranceExpiry, 'Hạn bảo hiểm'),
          status: dto.status,
          notes: text(dto.notes),
        },
        include: vehicleInclude,
      });
      return presentVehicle(v, await this.today(schoolId));
    } catch (e) {
      rethrowPrismaError(e, 'Biển số xe đã tồn tại');
    }
  }

  async removeVehicle(schoolId: string, id: string) {
    const v = await this.findVehicle(schoolId, id);
    if (v._count.routes) throw new ConflictException('Xe đang được gán cho tuyến, hãy gỡ khỏi tuyến trước');
    if (await this.prisma.busTrip.count({ where: { vehicleId: id } })) {
      throw new ConflictException('Xe đã có chuyến đi, hãy chuyển sang "Ngừng sử dụng" thay vì xóa');
    }
    await this.prisma.vehicle.delete({ where: { id } });
    return { ok: true };
  }

  private async findVehicle(schoolId: string, id: string) {
    const v = await this.prisma.vehicle.findFirst({ where: { id, schoolId }, include: vehicleInclude });
    if (!v) throw new NotFoundException('Không tìm thấy xe');
    return v;
  }

  // ---- Staff ----

  async listStaff(schoolId: string) {
    const [today, rows] = await Promise.all([
      this.today(schoolId),
      this.prisma.busStaff.findMany({ where: { schoolId }, include: staffInclude, orderBy: [{ role: 'asc' }, { fullName: 'asc' }] }),
    ]);
    return rows.map((s) => presentStaff(s, today));
  }

  async createStaff(schoolId: string, dto: BusStaffDto) {
    const s = await this.prisma.busStaff.create({
      data: {
        schoolId,
        fullName: dto.fullName.trim(),
        phone: this.phone(dto.phone),
        role: dto.role,
        licenseNumber: text(dto.licenseNumber) ?? null,
        licenseExpiry: dateField(dto.licenseExpiry, 'Hạn giấy phép lái xe') ?? null,
        isActive: dto.isActive,
      },
      include: staffInclude,
    });
    return presentStaff(s, await this.today(schoolId));
  }

  async updateStaff(schoolId: string, id: string, dto: UpdateBusStaffDto) {
    const staff = await this.findStaff(schoolId, id);
    const s = await this.prisma.$transaction(async (tx) => {
      // Deactivating a driver also locks their login.
      if (dto.isActive !== undefined && staff.userId) await tx.user.update({ where: { id: staff.userId }, data: { isActive: dto.isActive } });
      return tx.busStaff.update({
        where: { id },
        data: {
          fullName: dto.fullName?.trim(),
          phone: dto.phone === undefined ? undefined : this.phone(dto.phone),
          role: dto.role,
          licenseNumber: text(dto.licenseNumber),
          licenseExpiry: dateField(dto.licenseExpiry, 'Hạn giấy phép lái xe'),
          isActive: dto.isActive,
        },
        include: staffInclude,
      });
    });
    return presentStaff(s, await this.today(schoolId));
  }

  /** Creates the driver-app login for a crew member; the first-time password is returned once. */
  async createAccount(schoolId: string, id: string) {
    const staff = await this.findStaff(schoolId, id);
    if (staff.userId) throw new ConflictException('Nhân viên này đã có tài khoản');
    const phone = this.phone(staff.phone);
    if (await this.prisma.user.findUnique({ where: { phone } })) {
      throw new ConflictException(`Số điện thoại ${phone} đã được dùng cho một tài khoản khác`);
    }
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { schoolId, phone, fullName: staff.fullName, role: Role.DRIVER, passwordHash, mustChangePassword: true, isActive: staff.isActive },
        });
        await tx.busStaff.update({ where: { id }, data: { userId: user.id } });
      });
    } catch (e) {
      rethrowPrismaError(e, `Số điện thoại ${phone} đã được dùng cho một tài khoản khác`);
    }
    return { phone, password };
  }

  async resetPassword(schoolId: string, id: string) {
    const staff = await this.findStaff(schoolId, id);
    if (!staff.userId) throw new NotFoundException('Nhân viên này chưa có tài khoản');
    const password = generatePassword();
    await this.prisma.user.update({ where: { id: staff.userId }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
    return { password };
  }

  private async findStaff(schoolId: string, id: string) {
    const s = await this.prisma.busStaff.findFirst({ where: { id, schoolId } });
    if (!s) throw new NotFoundException('Không tìm thấy nhân viên xe');
    return s;
  }

  private phone(raw: string): string {
    const phone = normalizePhone(raw);
    if (!phone) throw new BadRequestException(`Số điện thoại "${raw}" không hợp lệ`);
    return phone;
  }

  private async today(schoolId: string) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    return localDate(new Date(), school.timezone);
  }
}
