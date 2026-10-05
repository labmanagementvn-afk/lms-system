import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Page, pageArgs } from '../common/pagination';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { DiscountDto, DiscountQuery, FeeItemDto, UpdateFeeItemDto } from './finance.dto';

@Injectable()
export class FeeItemsService {
  constructor(private readonly prisma: PrismaService) {}

  list(schoolId: string) {
    return this.prisma.feeItem.findMany({ where: { schoolId }, orderBy: [{ isActive: 'desc' }, { code: 'asc' }] });
  }

  async create(schoolId: string, dto: FeeItemDto) {
    try {
      return await this.prisma.feeItem.create({ data: { ...dto, schoolId } });
    } catch (e) {
      rethrowPrismaError(e, 'Mã khoản thu đã tồn tại');
    }
  }

  async update(schoolId: string, id: string, dto: UpdateFeeItemDto) {
    await this.prisma.feeItem.findFirstOrThrow({ where: { id, schoolId } });
    try {
      return await this.prisma.feeItem.update({ where: { id }, data: dto });
    } catch (e) {
      rethrowPrismaError(e, 'Mã khoản thu đã tồn tại');
    }
  }

  async remove(schoolId: string, id: string) {
    await this.prisma.feeItem.findFirstOrThrow({ where: { id, schoolId } });
    const used = await this.prisma.invoiceLine.count({ where: { feeItemId: id } });
    if (used || (await this.prisma.campaignItem.count({ where: { feeItemId: id } }))) {
      throw new ConflictException('Khoản thu đã được sử dụng; hãy ngừng áp dụng thay vì xóa');
    }
    await this.prisma.feeItem.delete({ where: { id } });
  }

  // ---- Discounts ----

  async discounts(schoolId: string, query: DiscountQuery): Promise<Page<unknown>> {
    const where: Prisma.StudentDiscountWhereInput = {
      schoolId,
      studentId: query.studentId,
      student: query.q
        ? { OR: [{ fullName: { contains: query.q, mode: 'insensitive' } }, { code: { contains: query.q, mode: 'insensitive' } }] }
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.studentDiscount.findMany({
        where,
        include: { student: { select: { id: true, code: true, fullName: true } }, feeItem: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.studentDiscount.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createDiscount(schoolId: string, dto: DiscountDto) {
    if (dto.kind === 'PERCENT' && dto.value > 100) throw new BadRequestException('Tỷ lệ giảm tối đa 100%');
    if (dto.validFrom && dto.validTo && dto.validFrom > dto.validTo) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    await this.prisma.student.findFirstOrThrow({ where: { id: dto.studentId, schoolId } });
    if (dto.feeItemId) await this.prisma.feeItem.findFirstOrThrow({ where: { id: dto.feeItemId, schoolId } });
    return this.prisma.studentDiscount.create({
      data: {
        ...dto,
        schoolId,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
      },
    });
  }

  async removeDiscount(schoolId: string, id: string) {
    await this.prisma.studentDiscount.findFirstOrThrow({ where: { id, schoolId } });
    await this.prisma.studentDiscount.delete({ where: { id } });
  }
}
