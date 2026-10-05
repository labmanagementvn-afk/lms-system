import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { activePoints, DEFAULT_CRITERIA } from './conduct-rules';
import { CriterionDto, SaveCriteriaDto, UpdateCriterionDto } from './conduct.dto';

export const criterionSelect = {
  id: true,
  code: true,
  name: true,
  maxPoints: true,
  groupName: true,
  sortOrder: true,
  isActive: true,
  _count: { select: { items: true } },
} satisfies Prisma.ConductCriterionSelect;

type CriterionRow = Prisma.ConductCriterionGetPayload<{ select: typeof criterionSelect }>;

export type Criterion = Omit<CriterionRow, '_count'> & { itemCount: number };

const flatten = ({ _count, ...c }: CriterionRow): Criterion => ({ ...c, itemCount: _count.items });

const ORDER: Prisma.ConductCriterionOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { code: 'asc' }];
const CODE_TAKEN = 'Mã tiêu chí đã tồn tại';

/** A school's conduct criteria; the active ones must always add up to 100 points. */
@Injectable()
export class CriteriaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every criterion of the school; the defaults are created on first use. */
  async list(schoolId: string): Promise<Criterion[]> {
    let rows = await this.prisma.conductCriterion.findMany({ where: { schoolId }, select: criterionSelect, orderBy: ORDER });
    if (!rows.length) {
      await this.prisma.conductCriterion.createMany({ data: DEFAULT_CRITERIA.map((c) => ({ ...c, schoolId })), skipDuplicates: true });
      rows = await this.prisma.conductCriterion.findMany({ where: { schoolId }, select: criterionSelect, orderBy: ORDER });
    }
    return rows.map(flatten);
  }

  /** Only the criteria students and teachers score against. */
  async active(schoolId: string): Promise<Criterion[]> {
    return (await this.list(schoolId)).filter((c) => c.isActive);
  }

  async create(schoolId: string, dto: CriterionDto) {
    const existing = await this.list(schoolId);
    this.assertSum([...existing, { maxPoints: dto.maxPoints, isActive: dto.isActive ?? true }]);
    try {
      const row = await this.prisma.conductCriterion.create({
        data: { schoolId, ...dto, sortOrder: dto.sortOrder ?? existing.length + 1, isActive: dto.isActive ?? true },
        select: criterionSelect,
      });
      return flatten(row);
    } catch (e) {
      rethrowPrismaError(e, CODE_TAKEN);
    }
  }

  async update(schoolId: string, id: string, dto: UpdateCriterionDto) {
    const existing = await this.list(schoolId);
    const current = existing.find((c) => c.id === id);
    if (!current) throw new NotFoundException('Không tìm thấy tiêu chí');
    this.assertSum(existing.map((c) => (c.id === id ? { maxPoints: dto.maxPoints ?? c.maxPoints, isActive: dto.isActive ?? c.isActive } : c)));
    try {
      const row = await this.prisma.conductCriterion.update({ where: { id }, data: dto, select: criterionSelect });
      return flatten(row);
    } catch (e) {
      rethrowPrismaError(e, CODE_TAKEN);
    }
  }

  /** Deletes an unused criterion; one that already has scores is only deactivated so history stays readable. */
  async remove(schoolId: string, id: string) {
    const existing = await this.list(schoolId);
    const current = existing.find((c) => c.id === id);
    if (!current) throw new NotFoundException('Không tìm thấy tiêu chí');
    this.assertSum(existing.filter((c) => c.id !== id));
    if (current.itemCount > 0) {
      await this.prisma.conductCriterion.update({ where: { id }, data: { isActive: false } });
      return { deleted: false, deactivated: true };
    }
    await this.prisma.conductCriterion.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  /**
   * Replaces the whole list in one go so the office can move points between criteria
   * without ever leaving the active set at something other than 100.
   */
  async saveAll(schoolId: string, dto: SaveCriteriaDto): Promise<Criterion[]> {
    const existing = await this.list(schoolId);
    const byId = new Map(existing.map((c) => [c.id, c]));
    for (const row of dto.criteria) if (row.id && !byId.has(row.id)) throw new NotFoundException('Không tìm thấy tiêu chí');
    const codes = dto.criteria.map((c) => c.code);
    if (new Set(codes).size !== codes.length) throw new BadRequestException(CODE_TAKEN);
    this.assertSum(dto.criteria.map((c) => ({ maxPoints: c.maxPoints, isActive: c.isActive ?? true })));

    const keep = new Set(dto.criteria.map((c) => c.id).filter(Boolean));
    const gone = existing.filter((c) => !keep.has(c.id));
    try {
      await this.prisma.$transaction(async (tx) => {
        // Rows left out of the list go away, unless scores reference them.
        await tx.conductCriterion.deleteMany({ where: { id: { in: gone.filter((c) => c.itemCount === 0).map((c) => c.id) } } });
        await tx.conductCriterion.updateMany({ where: { id: { in: gone.filter((c) => c.itemCount > 0).map((c) => c.id) } }, data: { isActive: false } });
        // Free the codes of updated rows first so two rows may swap codes.
        for (const [i, row] of dto.criteria.entries()) {
          if (row.id) await tx.conductCriterion.update({ where: { id: row.id }, data: { code: `~${i}~${row.id}`.slice(0, 50) } });
        }
        for (const [i, row] of dto.criteria.entries()) {
          const data = { code: row.code, name: row.name, maxPoints: row.maxPoints, groupName: row.groupName ?? null, sortOrder: row.sortOrder ?? i + 1, isActive: row.isActive ?? true };
          if (row.id) await tx.conductCriterion.update({ where: { id: row.id }, data });
          else await tx.conductCriterion.create({ data: { schoolId, ...data } });
        }
      });
    } catch (e) {
      rethrowPrismaError(e, CODE_TAKEN);
    }
    return this.list(schoolId);
  }

  // ---- internals ----

  private assertSum(criteria: { maxPoints: number; isActive?: boolean }[]) {
    const sum = activePoints(criteria);
    if (sum !== 100) throw new BadRequestException(`Tổng điểm các tiêu chí đang áp dụng phải bằng 100 (hiện là ${sum})`);
  }
}
