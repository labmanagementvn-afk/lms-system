import { Injectable, UnauthorizedException } from '@nestjs/common';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeviceDto, UpdateDeviceDto } from './attendance.dto';
import { generateDeviceKey, parseDeviceKey, verifyDeviceKey } from './device-keys';

const select = {
  id: true,
  name: true,
  type: true,
  vendor: true,
  serialNumber: true,
  location: true,
  defaultDirection: true,
  apiKeyPrefix: true,
  isActive: true,
  lastSeenAt: true,
  createdAt: true,
};

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  list(schoolId: string) {
    return this.prisma.attendanceDevice.findMany({ where: { schoolId }, select, orderBy: { name: 'asc' } });
  }

  /** Creates a device and returns its API key. The key is shown only once. */
  async create(schoolId: string, dto: CreateDeviceDto) {
    const { key, prefix, hash } = generateDeviceKey();
    try {
      const device = await this.prisma.attendanceDevice.create({
        data: { ...dto, schoolId, apiKeyPrefix: prefix, apiKeyHash: hash },
        select,
      });
      return { ...device, apiKey: key };
    } catch (e) {
      rethrowPrismaError(e, 'Số serial thiết bị đã được đăng ký');
    }
  }

  async update(schoolId: string, id: string, dto: UpdateDeviceDto) {
    await this.prisma.attendanceDevice.findFirstOrThrow({ where: { id, schoolId } });
    try {
      return await this.prisma.attendanceDevice.update({ where: { id }, data: dto, select });
    } catch (e) {
      rethrowPrismaError(e, 'Số serial thiết bị đã được đăng ký');
    }
  }

  async rotateKey(schoolId: string, id: string) {
    await this.prisma.attendanceDevice.findFirstOrThrow({ where: { id, schoolId } });
    const { key, prefix, hash } = generateDeviceKey();
    const device = await this.prisma.attendanceDevice.update({
      where: { id },
      data: { apiKeyPrefix: prefix, apiKeyHash: hash },
      select,
    });
    return { ...device, apiKey: key };
  }

  async remove(schoolId: string, id: string) {
    await this.prisma.attendanceDevice.findFirstOrThrow({ where: { id, schoolId } });
    await this.prisma.attendanceDevice.delete({ where: { id } });
  }

  async authenticateKey(key: string | undefined) {
    const prefix = key ? parseDeviceKey(key) : null;
    const device = prefix ? await this.prisma.attendanceDevice.findUnique({ where: { apiKeyPrefix: prefix }, include: { school: true } }) : null;
    if (!device || !device.isActive || !verifyDeviceKey(key!, device.apiKeyHash)) {
      throw new UnauthorizedException('Invalid device key');
    }
    return device;
  }

  async authenticateSerial(serialNumber: string | undefined) {
    const device = serialNumber
      ? await this.prisma.attendanceDevice.findUnique({ where: { serialNumber }, include: { school: true } })
      : null;
    if (!device || !device.isActive) throw new UnauthorizedException('Unknown device');
    return device;
  }
}
