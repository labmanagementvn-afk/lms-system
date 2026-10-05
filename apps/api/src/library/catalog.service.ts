import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CopyStatus, Prisma } from '@prisma/client';
import { Page, pageArgs } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { overdueDays } from './circulation';
import { AddCopiesDto, BookDto, BookQuery, UpdateBookDto, UpdateCopyDto } from './library.dto';

export const person = { select: { id: true, code: true, fullName: true } } as const;
export const activeLoan = {
  where: { returnedAt: null },
  include: { student: person, teacher: person },
  take: 1,
} satisfies Prisma.BookCopy$loansArgs;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listBooks(schoolId: string, query: BookQuery): Promise<Page<unknown>> {
    const where: Prisma.BookWhereInput = {
      schoolId,
      category: query.category || undefined,
      OR: query.q
        ? [
            { title: { contains: query.q, mode: 'insensitive' } },
            { author: { contains: query.q, mode: 'insensitive' } },
            { isbn: { contains: query.q } },
          ]
        : undefined,
    };
    const [books, total] = await this.prisma.$transaction([
      this.prisma.book.findMany({ where, orderBy: { title: 'asc' }, ...pageArgs(query) }),
      this.prisma.book.count({ where }),
    ]);
    const counts = await this.prisma.bookCopy.groupBy({
      by: ['bookId', 'status'],
      where: { bookId: { in: books.map((b) => b.id) } },
      _count: { _all: true },
    });
    const items = books.map((b) => {
      const mine = counts.filter((c) => c.bookId === b.id);
      const n = (s: CopyStatus) => mine.find((c) => c.status === s)?._count._all ?? 0;
      // Retired copies have left the collection; lost ones still count until written off.
      return { ...b, copies: { total: mine.reduce((s, c) => s + c._count._all, 0) - n('RETIRED'), available: n('AVAILABLE') } };
    });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async categories(schoolId: string) {
    const rows = await this.prisma.book.findMany({
      where: { schoolId, category: { not: null } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category);
  }

  async getBook(schoolId: string, id: string) {
    const book = await this.prisma.book.findFirst({
      where: { id, schoolId },
      include: {
        copies: { orderBy: { barcode: 'asc' }, include: { loans: activeLoan } },
        reservations: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, include: { student: person } },
      },
    });
    if (!book) throw new NotFoundException('Không tìm thấy đầu sách');
    return {
      ...book,
      copies: book.copies.map(({ loans, ...c }) => ({
        ...c,
        loan: loans[0] ? { ...loans[0], overdueDays: overdueDays(loans[0].dueAt) } : null,
      })),
    };
  }

  createBook(schoolId: string, dto: BookDto) {
    return this.prisma.book.create({ data: { ...dto, schoolId } });
  }

  async updateBook(schoolId: string, id: string, dto: UpdateBookDto) {
    await this.findBook(schoolId, id);
    return this.prisma.book.update({ where: { id }, data: dto });
  }

  async removeBook(schoolId: string, id: string) {
    await this.findBook(schoolId, id);
    if (await this.prisma.bookCopy.count({ where: { bookId: id, status: 'BORROWED' } })) {
      throw new ConflictException('Đầu sách còn bản đang được mượn');
    }
    await this.prisma.book.delete({ where: { id } });
  }

  async addCopies(schoolId: string, bookId: string, dto: AddCopiesDto) {
    await this.findBook(schoolId, bookId);
    const barcodes = dto.barcodes.map((b) => b.trim());
    const dupes = barcodes.filter((b, i) => barcodes.indexOf(b) !== i);
    if (dupes.length) throw new BadRequestException(`Mã vạch bị lặp: ${[...new Set(dupes)].join(', ')}`);
    const taken = await this.prisma.bookCopy.findMany({ where: { schoolId, barcode: { in: barcodes } }, select: { barcode: true } });
    if (taken.length) throw new ConflictException(`Mã vạch đã tồn tại: ${taken.map((t) => t.barcode).join(', ')}`);
    try {
      await this.prisma.bookCopy.createMany({ data: barcodes.map((barcode) => ({ schoolId, bookId, barcode, shelf: dto.shelf })) });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Mã vạch đã tồn tại');
      throw e;
    }
    return this.prisma.bookCopy.findMany({ where: { schoolId, barcode: { in: barcodes } }, orderBy: { barcode: 'asc' } });
  }

  async updateCopy(schoolId: string, id: string, dto: UpdateCopyDto) {
    const copy = await this.prisma.bookCopy.findFirst({ where: { id, schoolId } });
    if (!copy) throw new NotFoundException('Không tìm thấy bản sách');
    if (dto.status && copy.status === 'BORROWED') throw new BadRequestException('Bản sách đang được mượn, hãy nhận trả trước');
    // Conditional on the status we read so a concurrent loan isn't overwritten.
    const { count } = await this.prisma.bookCopy.updateMany({ where: { id, status: copy.status }, data: dto });
    if (!count) throw new ConflictException('Bản sách vừa thay đổi trạng thái, vui lòng thử lại');
    return this.prisma.bookCopy.findUniqueOrThrow({ where: { id } });
  }

  async byBarcode(schoolId: string, barcode: string) {
    const copy = await this.prisma.bookCopy.findUnique({
      where: { schoolId_barcode: { schoolId, barcode: barcode.trim() } },
      include: {
        book: { include: { reservations: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, include: { student: person } } } },
        loans: activeLoan,
      },
    });
    if (!copy) throw new NotFoundException('Không tìm thấy bản sách với mã vạch này');
    const { loans, ...rest } = copy;
    return { ...rest, loan: loans[0] ? { ...loans[0], overdueDays: overdueDays(loans[0].dueAt) } : null };
  }

  async stats(schoolId: string) {
    const now = new Date();
    const [titles, copies, onLoan, overdue, activeReservations] = await this.prisma.$transaction([
      this.prisma.book.count({ where: { schoolId } }),
      this.prisma.bookCopy.count({ where: { schoolId, status: { not: 'RETIRED' } } }),
      this.prisma.loan.count({ where: { schoolId, returnedAt: null } }),
      this.prisma.loan.count({ where: { schoolId, returnedAt: null, dueAt: { lt: now } } }),
      this.prisma.bookReservation.count({ where: { schoolId, status: 'ACTIVE' } }),
    ]);
    return { titles, copies, onLoan, overdue, activeReservations };
  }

  private async findBook(schoolId: string, id: string) {
    const book = await this.prisma.book.findFirst({ where: { id, schoolId } });
    if (!book) throw new NotFoundException('Không tìm thấy đầu sách');
    return book;
  }
}
