import { BadRequestException, Injectable } from '@nestjs/common';
import { EventMethod, IdentityMethod } from '@prisma/client';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIdentityDto, IdentityQuery } from './attendance.dto';

const include = {
  student: { select: { id: true, code: true, fullName: true } },
  teacher: { select: { id: true, code: true, fullName: true } },
};

/** Event methods that may be matched to an identity of the given kind. */
export const EVENT_METHODS_FOR: Record<IdentityMethod, EventMethod[]> = {
  BIOMETRIC: [EventMethod.FACE, EventMethod.FINGERPRINT, EventMethod.CARD, EventMethod.QR, EventMethod.UNKNOWN],
  CARD: [EventMethod.CARD, EventMethod.QR, EventMethod.UNKNOWN],
  QR: [EventMethod.CARD, EventMethod.QR, EventMethod.UNKNOWN],
};

@Injectable()
export class IdentitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(schoolId: string, query: IdentityQuery) {
    return this.prisma.attendanceIdentity.findMany({
      where: { schoolId, studentId: query.studentId, teacherId: query.teacherId, method: query.method },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(schoolId: string, dto: CreateIdentityDto) {
    if (!!dto.studentId === !!dto.teacherId) throw new BadRequestException('Chọn đúng một học sinh hoặc một giáo viên');
    if (dto.studentId) await this.prisma.student.findFirstOrThrow({ where: { id: dto.studentId, schoolId } });
    if (dto.teacherId) await this.prisma.teacher.findFirstOrThrow({ where: { id: dto.teacherId, schoolId } });

    // Decree 13/2023/ND-CP: biometric data is sensitive personal data and needs
    // explicit consent (from a parent or guardian for children).
    if (dto.method === IdentityMethod.BIOMETRIC && (!dto.consentGivenBy || !dto.consentAt)) {
      throw new BadRequestException('Cần ghi nhận sự đồng ý (người đồng ý và ngày đồng ý) trước khi đăng ký sinh trắc học');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const identity = await tx.attendanceIdentity.create({
          data: { ...dto, consentAt: dto.consentAt ? new Date(dto.consentAt) : undefined, schoolId },
          include,
        });
        // Link events that arrived before this person was mapped.
        await tx.gateEvent.updateMany({
          where: {
            schoolId,
            studentId: null,
            teacherId: null,
            externalPersonId: dto.externalId,
            method: { in: EVENT_METHODS_FOR[dto.method] },
          },
          data: { studentId: dto.studentId, teacherId: dto.teacherId },
        });
        return identity;
      });
    } catch (e) {
      rethrowPrismaError(e, 'Mã định danh này đã được gán cho người khác');
    }
  }

  /** Withdraws consent / deactivates the identity. Terminals must also delete the enrolled template. */
  async revoke(schoolId: string, id: string) {
    await this.prisma.attendanceIdentity.findFirstOrThrow({ where: { id, schoolId } });
    return this.prisma.attendanceIdentity.update({ where: { id }, data: { revokedAt: new Date() }, include });
  }

  async remove(schoolId: string, id: string) {
    await this.prisma.attendanceIdentity.findFirstOrThrow({ where: { id, schoolId } });
    await this.prisma.attendanceIdentity.delete({ where: { id } });
  }
}
