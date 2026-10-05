import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceSource, InvoiceStatus, Prisma, StockMovementType, StoreOrderStatus } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { stockVoucher } from '../accounting/misa-payloads';
import { Page, pageArgs, PageQuery } from '../common/pagination';
import { rethrowPrismaError } from '../common/prisma-errors';
import { generatePaymentRef, invoiceStatus } from '../finance/billing';
import { PrismaService } from '../prisma/prisma.service';
import { generateOrderCode, mergeLines, stockChangeError } from './store-rules';
import { CreateItemDto, CreateOrderDto, ItemQuery, OrderQuery, StockChangeDto, UpdateItemDto } from './store.dto';

const orderInclude = {
  student: { select: { id: true, code: true, fullName: true } },
  lines: { include: { item: { select: { id: true, sku: true, name: true, unit: true, category: true, accountingCode: true } } } },
  invoice: { select: { id: true, status: true, total: true, paidAmount: true, paymentRef: true } },
} satisfies Prisma.StoreOrderInclude;

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  // ---- Items ----

  async listItems(schoolId: string, query: ItemQuery): Promise<Page<unknown>> {
    const where: Prisma.InventoryItemWhereInput = {
      schoolId,
      category: query.category,
      isActive: query.isActive,
      stockQty: query.lowStock !== undefined ? { lte: query.lowStock } : undefined,
      OR: query.q
        ? [
            { sku: { contains: query.q, mode: 'insensitive' } },
            { name: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({ where, orderBy: [{ category: 'asc' }, { sku: 'asc' }], ...pageArgs(query) }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createItem(schoolId: string, dto: CreateItemDto) {
    try {
      return await this.prisma.inventoryItem.create({ data: { ...dto, schoolId } });
    } catch (e) {
      rethrowPrismaError(e, 'Mã hàng đã tồn tại');
    }
  }

  async updateItem(schoolId: string, id: string, dto: UpdateItemDto) {
    await this.findItem(schoolId, id);
    try {
      return await this.prisma.inventoryItem.update({ where: { id }, data: dto });
    } catch (e) {
      rethrowPrismaError(e, 'Mã hàng đã tồn tại');
    }
  }

  async removeItem(schoolId: string, id: string) {
    await this.findItem(schoolId, id);
    const [moves, lines] = await Promise.all([
      this.prisma.stockMovement.count({ where: { itemId: id } }),
      this.prisma.storeOrderLine.count({ where: { itemId: id } }),
    ]);
    if (moves || lines) throw new ConflictException('Mặt hàng đã phát sinh nhập xuất hoặc đơn cấp phát, hãy chuyển sang ngừng sử dụng');
    await this.prisma.inventoryItem.delete({ where: { id } });
  }

  async changeStock(schoolId: string, itemId: string, userId: string, dto: StockChangeDto) {
    const error = stockChangeError(dto.type, dto.quantity);
    if (error) throw new BadRequestException(error);
    const item = await this.findItem(schoolId, itemId);
    const q = dto.quantity;
    return this.prisma.$transaction(async (tx) => {
      if (q < 0) {
        // Conditional decrement so concurrent changes can never take stock below zero.
        const res = await tx.inventoryItem.updateMany({ where: { id: itemId, stockQty: { gte: -q } }, data: { stockQty: { increment: q } } });
        if (!res.count) throw new BadRequestException('Không đủ tồn kho');
      } else {
        await tx.inventoryItem.update({ where: { id: itemId }, data: { stockQty: { increment: q } } });
      }
      const movement = await tx.stockMovement.create({
        data: { schoolId, itemId, type: dto.type, quantity: q, unitCost: dto.unitCost, reason: dto.reason, createdById: userId },
      });
      if (dto.type === 'IN') {
        await this.accounting.enqueue(
          tx,
          schoolId,
          'STOCK_IN',
          movement.id,
          stockVoucher({
            kind: 'IN',
            voucherNo: `NK-${movement.id}`,
            date: movement.createdAt,
            description: `Nhập kho ${item.name}${dto.reason ? ` (${dto.reason})` : ''}`,
            lines: [{ ...item, quantity: q, unitPrice: dto.unitCost ?? item.price }],
          }),
        );
      }
      return tx.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    });
  }

  async movements(schoolId: string, itemId: string, query: PageQuery): Promise<Page<unknown>> {
    await this.findItem(schoolId, itemId);
    const where = { itemId, schoolId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: { order: { select: { id: true, code: true, student: { select: { code: true, fullName: true } } } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  // ---- Orders ----

  async listOrders(schoolId: string, query: OrderQuery): Promise<Page<unknown>> {
    const where: Prisma.StoreOrderWhereInput = {
      schoolId,
      status: query.status,
      studentId: query.studentId,
      OR: query.q
        ? [
            { code: { contains: query.q, mode: 'insensitive' } },
            { student: { fullName: { contains: query.q, mode: 'insensitive' } } },
            { student: { code: { contains: query.q, mode: 'insensitive' } } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.storeOrder.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.storeOrder.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  getOrder(schoolId: string, id: string) {
    return this.prisma.storeOrder.findFirstOrThrow({ where: { id, schoolId }, include: orderInclude });
  }

  async createOrder(schoolId: string, dto: CreateOrderDto) {
    const student = await this.prisma.student.findFirst({ where: { id: dto.studentId, schoolId } });
    if (!student) throw new BadRequestException('Học sinh không hợp lệ');
    const wanted = mergeLines(dto.lines);
    const items = await this.prisma.inventoryItem.findMany({ where: { schoolId, isActive: true, id: { in: wanted.map((l) => l.itemId) } } });
    if (items.length !== wanted.length) throw new BadRequestException('Mặt hàng không hợp lệ hoặc đã ngừng sử dụng');
    const byId = new Map(items.map((i) => [i.id, i]));
    const lines = wanted.map((l) => {
      const item = byId.get(l.itemId)!;
      return { item, quantity: l.quantity, unitPrice: item.price, amount: l.quantity * item.price };
    });
    const total = lines.reduce((s, l) => s + l.amount, 0);

    // Order code and payment reference are random; retry the rare unique collision.
    for (let attempt = 1; ; attempt++) {
      try {
        const order = await this.prisma.$transaction(async (tx) => {
          const invoice = await tx.invoice.create({
            data: {
              schoolId,
              studentId: student.id,
              source: InvoiceSource.STORE,
              title: `Cấp phát đồng phục, sách vở - ${student.fullName}`,
              paymentRef: generatePaymentRef(),
              status: invoiceStatus(total, 0),
              subtotal: total,
              total,
              lines: {
                create: lines.map((l) => ({ description: l.item.name, quantity: l.quantity, unitPrice: l.unitPrice, discount: 0, amount: l.amount })),
              },
            },
          });
          return tx.storeOrder.create({
            data: {
              schoolId,
              code: generateOrderCode(),
              studentId: student.id,
              total,
              invoiceId: invoice.id,
              note: dto.note,
              lines: { create: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount })) },
            },
          });
        });
        return this.getOrder(schoolId, order.id);
      } catch (e) {
        if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  async issueOrder(schoolId: string, id: string, userId: string) {
    const order = await this.getOrder(schoolId, id);
    if (order.status !== StoreOrderStatus.PENDING) throw new BadRequestException('Chỉ cấp phát được đơn đang chờ');
    const issuedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Claim the order first so two clicks cannot issue it twice.
      const claimed = await tx.storeOrder.updateMany({ where: { id, status: StoreOrderStatus.PENDING }, data: { status: StoreOrderStatus.ISSUED, issuedAt } });
      if (!claimed.count) throw new BadRequestException('Chỉ cấp phát được đơn đang chờ');
      for (const line of order.lines) {
        const res = await tx.inventoryItem.updateMany({
          where: { id: line.itemId, stockQty: { gte: line.quantity } },
          data: { stockQty: { decrement: line.quantity } },
        });
        if (!res.count) throw new BadRequestException(`Không đủ tồn kho: ${line.item.name}`);
      }
      await tx.stockMovement.createMany({
        data: order.lines.map((l) => ({
          schoolId,
          itemId: l.itemId,
          type: StockMovementType.OUT,
          quantity: -l.quantity,
          unitCost: l.unitPrice,
          reason: `Cấp phát đơn ${order.code}`,
          orderId: id,
          createdById: userId,
        })),
      });
      await this.accounting.enqueue(
        tx,
        schoolId,
        'STOCK_OUT',
        id,
        stockVoucher({
          kind: 'OUT',
          voucherNo: order.code,
          date: issuedAt,
          description: `Xuất kho cấp phát cho ${order.student.fullName} (${order.code})`,
          accountObjectCode: order.student.code,
          lines: order.lines.map((l) => ({ ...l.item, quantity: l.quantity, unitPrice: l.unitPrice })),
        }),
      );
    });
    return this.getOrder(schoolId, id);
  }

  async cancelOrder(schoolId: string, id: string) {
    const order = await this.getOrder(schoolId, id);
    if (order.status !== StoreOrderStatus.PENDING) throw new BadRequestException('Chỉ hủy được đơn đang chờ cấp phát');
    await this.prisma.$transaction(async (tx) => {
      if (order.invoiceId) {
        // Conditional on paidAmount 0 so a payment landing concurrently is never orphaned.
        const res = await tx.invoice.updateMany({ where: { id: order.invoiceId, paidAmount: 0 }, data: { status: InvoiceStatus.CANCELLED } });
        if (!res.count) throw new BadRequestException('Đơn đã thu tiền, hãy hủy phiếu thu trước');
      }
      const res = await tx.storeOrder.updateMany({ where: { id, status: StoreOrderStatus.PENDING }, data: { status: StoreOrderStatus.CANCELLED } });
      if (!res.count) throw new BadRequestException('Chỉ hủy được đơn đang chờ cấp phát');
    });
    return this.getOrder(schoolId, id);
  }

  private async findItem(schoolId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, schoolId } });
    if (!item) throw new NotFoundException('Không tìm thấy mặt hàng');
    return item;
  }
}
