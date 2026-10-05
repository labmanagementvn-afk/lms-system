import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssetStatus, AuditStatus, Prisma } from '@prisma/client';
import { Page, pageArgs, PageQuery } from '../common/pagination';
import { rethrowPrismaError } from '../common/prisma-errors';
import { localDate } from '../common/time';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssetQuery,
  AuditDto,
  AuditItemDto,
  CategoryDto,
  CreateAssetDto,
  DisposeDto,
  LoanDto,
  LoanQuery,
  MaintenanceDto,
  SupplierDto,
  UpdateAssetDto,
  UpdateCategoryDto,
  UpdateSupplierDto,
} from './assets.dto';
import { bookValue, schedule } from './depreciation';

const employeeSummary = { select: { id: true, code: true, fullName: true, department: true } } satisfies Prisma.EmployeeDefaultArgs;

const assetInclude = {
  category: { select: { id: true, name: true, usefulLifeYears: true } },
  supplier: { select: { id: true, name: true } },
  custodian: employeeSummary,
} satisfies Prisma.AssetInclude;

const loanInclude = {
  asset: { select: { id: true, code: true, name: true, status: true } },
  borrower: employeeSummary,
} satisfies Prisma.AssetLoanInclude;

type Valued = { purchasePrice: number | null; purchaseDate: Date | null; usefulLifeYears: number | null; category: { usefulLifeYears: number } };

/** YYYY-MM-DD (or ISO) -> UTC midnight for @db.Date columns; null clears, undefined leaves unchanged. */
const toDay = (s: string) => {
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const day = (s?: string | null) => (s ? toDay(s) : s === null ? null : undefined);
const vnDate = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
/** The useful life the asset actually depreciates over: its own override, else the category default. */
const lifeOf = (a: Valued) => a.usefulLifeYears ?? a.category.usefulLifeYears;
/** Book value at `at`; null without a price, the full price when the purchase date is unknown. */
const valueOf = (a: Valued, at: Date) => (a.purchasePrice == null ? null : a.purchaseDate ? bookValue(a.purchasePrice, a.purchaseDate, lifeOf(a), at) : a.purchasePrice);

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Categories ----

  listCategories(schoolId: string) {
    return this.prisma.assetCategory.findMany({ where: { schoolId }, include: { _count: { select: { assets: true } } }, orderBy: { name: 'asc' } });
  }

  async createCategory(schoolId: string, dto: CategoryDto) {
    try {
      return await this.prisma.assetCategory.create({ data: { ...dto, schoolId } });
    } catch (e) {
      rethrowPrismaError(e, 'Danh mục đã tồn tại');
    }
  }

  async updateCategory(schoolId: string, id: string, dto: UpdateCategoryDto) {
    await this.findCategory(schoolId, id);
    try {
      return await this.prisma.assetCategory.update({ where: { id }, data: dto });
    } catch (e) {
      rethrowPrismaError(e, 'Danh mục đã tồn tại');
    }
  }

  async removeCategory(schoolId: string, id: string) {
    await this.findCategory(schoolId, id);
    if (await this.prisma.asset.count({ where: { categoryId: id } })) throw new ConflictException('Danh mục đang có tài sản, không thể xóa');
    await this.prisma.assetCategory.delete({ where: { id } });
  }

  // ---- Suppliers ----

  listSuppliers(schoolId: string) {
    return this.prisma.supplier.findMany({ where: { schoolId }, include: { _count: { select: { assets: true } } }, orderBy: { name: 'asc' } });
  }

  async createSupplier(schoolId: string, dto: SupplierDto) {
    try {
      return await this.prisma.supplier.create({ data: { ...dto, schoolId } });
    } catch (e) {
      rethrowPrismaError(e, 'Nhà cung cấp đã tồn tại');
    }
  }

  async updateSupplier(schoolId: string, id: string, dto: UpdateSupplierDto) {
    await this.findSupplier(schoolId, id);
    try {
      return await this.prisma.supplier.update({ where: { id }, data: dto });
    } catch (e) {
      rethrowPrismaError(e, 'Nhà cung cấp đã tồn tại');
    }
  }

  async removeSupplier(schoolId: string, id: string) {
    await this.findSupplier(schoolId, id);
    if (await this.prisma.asset.count({ where: { supplierId: id } })) throw new ConflictException('Nhà cung cấp đang gắn với tài sản, không thể xóa');
    await this.prisma.supplier.delete({ where: { id } });
  }

  // ---- Assets ----

  async listAssets(schoolId: string, query: AssetQuery): Promise<Page<unknown>> {
    const where: Prisma.AssetWhereInput = {
      schoolId,
      status: query.status,
      categoryId: query.categoryId,
      location: query.location ? { contains: query.location, mode: 'insensitive' } : undefined,
      OR: query.q
        ? [
            { code: { contains: query.q, mode: 'insensitive' } },
            { name: { contains: query.q, mode: 'insensitive' } },
            { serialNumber: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({ where, include: assetInclude, orderBy: { code: 'asc' }, ...pageArgs(query) }),
      this.prisma.asset.count({ where }),
    ]);
    const today = await this.today(schoolId);
    return { items: rows.map((a) => this.decorate(a, today)), total, page: query.page, pageSize: query.pageSize };
  }

  async summary(schoolId: string) {
    const today = await this.today(schoolId);
    const rows = await this.prisma.asset.findMany({
      where: { schoolId },
      select: { status: true, purchasePrice: true, purchaseDate: true, usefulLifeYears: true, category: { select: { id: true, name: true, usefulLifeYears: true } } },
    });
    const byStatus = Object.fromEntries(Object.values(AssetStatus).map((s) => [s, 0])) as Record<AssetStatus, number>;
    const byCategory = new Map<string, { id: string; name: string; count: number; purchaseValue: number; bookValue: number }>();
    let totalPurchaseValue = 0;
    let totalBookValue = 0;
    for (const a of rows) {
      byStatus[a.status]++;
      if (a.status === AssetStatus.DISPOSED) continue;
      const price = a.purchasePrice ?? 0;
      const value = valueOf(a, today) ?? 0;
      totalPurchaseValue += price;
      totalBookValue += value;
      const c = byCategory.get(a.category.id) ?? { ...a.category, count: 0, purchaseValue: 0, bookValue: 0 };
      c.count++;
      c.purchaseValue += price;
      c.bookValue += value;
      byCategory.set(a.category.id, c);
    }
    return {
      total: rows.length - byStatus.DISPOSED,
      byStatus,
      totalPurchaseValue,
      totalBookValue,
      byCategory: [...byCategory.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    };
  }

  async getAsset(schoolId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, schoolId },
      include: {
        ...assetInclude,
        maintenance: { orderBy: { date: 'desc' } },
        loans: { include: { borrower: employeeSummary }, orderBy: { lentAt: 'desc' } },
        auditItems: { include: { audit: { select: { id: true, name: true, date: true, status: true } } }, orderBy: { audit: { date: 'desc' } } },
      },
    });
    if (!asset) throw new NotFoundException('Không tìm thấy tài sản');
    const today = await this.today(schoolId);
    return {
      ...this.decorate(asset, today),
      schedule: asset.purchasePrice != null && asset.purchaseDate ? schedule(asset.purchasePrice, asset.purchaseDate, lifeOf(asset)) : [],
      openLoan: asset.loans.find((l) => !l.returnedAt) ?? null,
    };
  }

  async createAsset(schoolId: string, dto: CreateAssetDto) {
    const { code, ...rest } = dto;
    const category = await this.findCategory(schoolId, dto.categoryId);
    await this.checkRefs(schoolId, dto);
    const data = { ...rest, schoolId, purchaseDate: day(dto.purchaseDate), usefulLifeYears: dto.usefulLifeYears ?? category.usefulLifeYears };
    // The auto-generated code is read-then-insert; retry the rare concurrent collision.
    for (let attempt = 1; ; attempt++) {
      try {
        const asset = await this.prisma.asset.create({ data: { ...data, code: code ?? (await this.nextCode(schoolId)) }, include: assetInclude });
        return this.decorate(asset, await this.today(schoolId));
      } catch (e) {
        if (!code && attempt < 3 && isUnique(e)) continue;
        rethrowPrismaError(e, 'Mã tài sản đã tồn tại');
      }
    }
  }

  async updateAsset(schoolId: string, id: string, dto: UpdateAssetDto) {
    const current = await this.findAsset(schoolId, id);
    if (current.status === AssetStatus.DISPOSED) throw new BadRequestException('Tài sản đã thanh lý, không thể sửa');
    if (dto.status && dto.status !== current.status && current.status === AssetStatus.LENT) throw new BadRequestException('Tài sản đang cho mượn, hãy nhận lại trước');
    if (dto.categoryId) await this.findCategory(schoolId, dto.categoryId);
    await this.checkRefs(schoolId, dto);
    try {
      const asset = await this.prisma.asset.update({ where: { id }, data: { ...dto, purchaseDate: day(dto.purchaseDate) }, include: assetInclude });
      return this.decorate(asset, await this.today(schoolId));
    } catch (e) {
      rethrowPrismaError(e, 'Mã tài sản đã tồn tại');
    }
  }

  async dispose(schoolId: string, id: string, dto: DisposeDto) {
    const asset = await this.findAsset(schoolId, id);
    if (asset.status === AssetStatus.DISPOSED) throw new BadRequestException('Tài sản đã thanh lý');
    if (asset.status === AssetStatus.LENT) throw new BadRequestException('Tài sản đang cho mượn, hãy nhận lại trước');
    const today = await this.today(schoolId);
    const notes = dto.note ? [asset.notes, `Thanh lý ${vnDate(today)}: ${dto.note}`].filter(Boolean).join('\n') : asset.notes;
    const updated = await this.prisma.asset.update({ where: { id }, data: { status: AssetStatus.DISPOSED, disposedAt: today, notes }, include: assetInclude });
    return this.decorate(updated, today);
  }

  // ---- Maintenance ----

  async addMaintenance(schoolId: string, assetId: string, dto: MaintenanceDto) {
    const asset = await this.findAsset(schoolId, assetId);
    if (asset.status === AssetStatus.DISPOSED) throw new BadRequestException('Tài sản đã thanh lý');
    if (dto.inProgress && asset.status === AssetStatus.LENT) throw new BadRequestException('Tài sản đang cho mượn, hãy nhận lại trước');
    const { inProgress, ...rest } = dto;
    const [row] = await this.prisma.$transaction([
      this.prisma.assetMaintenance.create({ data: { ...rest, assetId, date: toDay(dto.date), nextDueDate: day(dto.nextDueDate) } }),
      ...(inProgress ? [this.prisma.asset.update({ where: { id: assetId }, data: { status: AssetStatus.UNDER_MAINTENANCE } })] : []),
    ]);
    return row;
  }

  /** Marks the repair done: the asset goes back into use (the row itself has no completion flag). */
  async completeMaintenance(schoolId: string, id: string) {
    const row = await this.prisma.assetMaintenance.findFirst({ where: { id, asset: { schoolId } }, include: { asset: { select: { id: true, status: true } } } });
    if (!row) throw new NotFoundException('Không tìm thấy lượt bảo trì');
    if (row.asset.status === AssetStatus.UNDER_MAINTENANCE) {
      await this.prisma.asset.update({ where: { id: row.assetId }, data: { status: AssetStatus.IN_USE } });
    }
    return this.getAsset(schoolId, row.assetId);
  }

  // ---- Loans ----

  async lend(schoolId: string, assetId: string, dto: LoanDto) {
    const asset = await this.findAsset(schoolId, assetId);
    if (asset.status === AssetStatus.LENT) throw new BadRequestException('Tài sản đang cho mượn');
    if (asset.status === AssetStatus.DISPOSED) throw new BadRequestException('Tài sản đã thanh lý');
    if (!dto.borrowerEmployeeId && !dto.borrowerName?.trim()) throw new BadRequestException('Cần chọn nhân viên mượn hoặc nhập tên người mượn');
    const borrower = dto.borrowerEmployeeId ? await this.findEmployee(schoolId, dto.borrowerEmployeeId) : null;
    return this.prisma.$transaction(async (tx) => {
      // Claim the asset first so two clicks cannot lend it twice.
      const claimed = await tx.asset.updateMany({
        where: { id: assetId, status: { notIn: [AssetStatus.LENT, AssetStatus.DISPOSED] } },
        data: { status: AssetStatus.LENT },
      });
      if (!claimed.count) throw new BadRequestException('Tài sản đang cho mượn');
      return tx.assetLoan.create({
        data: {
          schoolId,
          assetId,
          borrowerEmployeeId: borrower?.id,
          borrowerName: dto.borrowerName?.trim() || borrower?.fullName,
          department: dto.department ?? borrower?.department ?? undefined,
          dueAt: new Date(dto.dueAt),
          note: dto.note,
        },
        include: loanInclude,
      });
    });
  }

  async returnLoan(schoolId: string, loanId: string) {
    const loan = await this.prisma.assetLoan.findFirst({ where: { id: loanId, schoolId } });
    if (!loan) throw new NotFoundException('Không tìm thấy phiếu mượn');
    if (loan.returnedAt) throw new BadRequestException('Phiếu mượn đã được trả');
    // The asset goes back into use first so the returned loan already shows the new status.
    const [, updated] = await this.prisma.$transaction([
      this.prisma.asset.updateMany({ where: { id: loan.assetId, status: AssetStatus.LENT }, data: { status: AssetStatus.IN_USE } }),
      this.prisma.assetLoan.update({ where: { id: loanId }, data: { returnedAt: new Date() }, include: loanInclude }),
    ]);
    return updated;
  }

  async listLoans(schoolId: string, query: LoanQuery): Promise<Page<unknown>> {
    const where: Prisma.AssetLoanWhereInput = {
      schoolId,
      returnedAt: query.open === true ? null : query.open === false ? { not: null } : undefined,
      OR: query.q
        ? [
            { asset: { code: { contains: query.q, mode: 'insensitive' } } },
            { asset: { name: { contains: query.q, mode: 'insensitive' } } },
            { borrowerName: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assetLoan.findMany({ where, include: loanInclude, orderBy: { lentAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.assetLoan.count({ where }),
    ]);
    const now = Date.now();
    const items = rows.map((l) => ({ ...l, overdue: !l.returnedAt && !!l.dueAt && l.dueAt.getTime() < now }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  // ---- Audits (kiểm kê) ----

  async createAudit(schoolId: string, dto: AuditDto) {
    const audit = await this.prisma.assetAudit.create({ data: { schoolId, name: dto.name, date: toDay(dto.date) } });
    return this.auditDetail(schoolId, audit);
  }

  async listAudits(schoolId: string, query: PageQuery): Promise<Page<unknown>> {
    const where: Prisma.AssetAuditWhereInput = { schoolId, name: query.q ? { contains: query.q, mode: 'insensitive' } : undefined };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assetAudit.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], ...pageArgs(query) }),
      this.prisma.assetAudit.count({ where }),
    ]);
    const groups = await this.prisma.assetAuditItem.groupBy({ by: ['auditId', 'found'], where: { auditId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
    const items = rows.map((audit) => {
      const found = groups.find((g) => g.auditId === audit.id && g.found)?._count._all ?? 0;
      const missing = groups.find((g) => g.auditId === audit.id && !g.found)?._count._all ?? 0;
      return { ...audit, checked: found + missing, found, missing };
    });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getAudit(schoolId: string, id: string) {
    return this.auditDetail(schoolId, await this.findAudit(schoolId, id));
  }

  async setAuditItem(schoolId: string, auditId: string, assetId: string, dto: AuditItemDto) {
    const audit = await this.findAudit(schoolId, auditId);
    if (audit.status === AuditStatus.CLOSED) throw new BadRequestException('Đợt kiểm kê đã chốt');
    await this.findAsset(schoolId, assetId);
    // PUT replaces the whole check, so an omitted condition or note is cleared.
    const data = { found: dto.found, condition: dto.condition ?? null, note: dto.note ?? null };
    return this.prisma.assetAuditItem.upsert({
      where: { auditId_assetId: { auditId, assetId } },
      create: { auditId, assetId, ...data },
      update: data,
      include: { asset: { select: { id: true, code: true, name: true } } },
    });
  }

  async closeAudit(schoolId: string, id: string) {
    const audit = await this.findAudit(schoolId, id);
    if (audit.status === AuditStatus.CLOSED) throw new BadRequestException('Đợt kiểm kê đã chốt');
    const closed = await this.prisma.assetAudit.update({ where: { id }, data: { status: AuditStatus.CLOSED } });
    const detail = await this.auditDetail(schoolId, closed);
    return {
      id: closed.id,
      name: closed.name,
      date: closed.date,
      status: closed.status,
      total: detail.counts.total,
      found: detail.counts.found,
      missing: detail.items.filter((i) => i.found === false),
      unchecked: detail.counts.unchecked,
    };
  }

  /**
   * The audit's scope is every asset that existed when it was created and was not yet
   * disposed on the audit date. AssetAuditItem.found is not nullable, so an asset has an
   * item row only once it has been checked; "unchecked" is the absence of a row.
   */
  private async auditDetail(schoolId: string, audit: { id: string; name: string; date: Date; status: AuditStatus; createdAt: Date; schoolId: string }) {
    const [assets, items] = await Promise.all([
      this.prisma.asset.findMany({
        where: {
          schoolId,
          createdAt: { lte: audit.createdAt },
          OR: [{ status: { not: AssetStatus.DISPOSED } }, { disposedAt: { gte: audit.date } }, { auditItems: { some: { auditId: audit.id } } }],
        },
        include: { category: { select: { id: true, name: true } }, custodian: employeeSummary },
        orderBy: { code: 'asc' },
      }),
      this.prisma.assetAuditItem.findMany({ where: { auditId: audit.id } }),
    ]);
    const byAsset = new Map(items.map((i) => [i.assetId, i]));
    const rows = assets.map((asset) => {
      const item = byAsset.get(asset.id);
      return { assetId: asset.id, asset, found: item ? item.found : null, condition: item?.condition ?? null, note: item?.note ?? null };
    });
    const counts = {
      total: rows.length,
      found: rows.filter((r) => r.found === true).length,
      missing: rows.filter((r) => r.found === false).length,
      unchecked: rows.filter((r) => r.found === null).length,
    };
    return { ...audit, items: rows, counts };
  }

  // ---- Helpers ----

  private decorate<T extends Valued>(asset: T, today: Date) {
    return { ...asset, depreciationYears: lifeOf(asset), bookValue: valueOf(asset, today) };
  }

  private async checkRefs(schoolId: string, dto: { supplierId?: string | null; custodianEmployeeId?: string | null }) {
    if (dto.supplierId) await this.findSupplier(schoolId, dto.supplierId);
    if (dto.custodianEmployeeId) await this.findEmployee(schoolId, dto.custodianEmployeeId);
  }

  private async findAsset(schoolId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id, schoolId } });
    if (!asset) throw new NotFoundException('Không tìm thấy tài sản');
    return asset;
  }

  private async findCategory(schoolId: string, id: string) {
    const category = await this.prisma.assetCategory.findFirst({ where: { id, schoolId } });
    if (!category) throw new BadRequestException('Danh mục không hợp lệ');
    return category;
  }

  private async findSupplier(schoolId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, schoolId } });
    if (!supplier) throw new BadRequestException('Nhà cung cấp không hợp lệ');
    return supplier;
  }

  private async findEmployee(schoolId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, schoolId } });
    if (!employee) throw new BadRequestException('Nhân viên không hợp lệ');
    return employee;
  }

  private async findAudit(schoolId: string, id: string) {
    const audit = await this.prisma.assetAudit.findFirst({ where: { id, schoolId } });
    if (!audit) throw new NotFoundException('Không tìm thấy đợt kiểm kê');
    return audit;
  }

  /** Next free TS##### code. */
  private async nextCode(schoolId: string) {
    const rows = await this.prisma.asset.findMany({ where: { schoolId, code: { startsWith: 'TS' } }, select: { code: true } });
    const max = rows.reduce((m, r) => (/^TS\d+$/.test(r.code) ? Math.max(m, Number(r.code.slice(2))) : m), 0);
    return `TS${String(max + 1).padStart(5, '0')}`;
  }

  /** UTC midnight of today's date in the school's timezone, comparable with @db.Date values. */
  private async today(schoolId: string) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
    return new Date(localDate(new Date(), school.timezone));
  }
}
