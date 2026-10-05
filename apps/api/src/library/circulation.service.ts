import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Page, pageArgs } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { person } from './catalog.service';
import { addDays, borrowBlockReason, canReserve, DEFAULT_LOAN_DAYS, holdCheck, overdueDays, RENEW_DAYS, renewBlockReason } from './circulation';
import { BorrowDto, LoanQuery, ReservationDto, ReservationQuery } from './library.dto';

const loanInclude = {
  copy: { select: { id: true, barcode: true, shelf: true, book: { select: { id: true, title: true, author: true } } } },
  student: person,
  teacher: person,
} satisfies Prisma.LoanInclude;

type LoanRow = Prisma.LoanGetPayload<{ include: typeof loanInclude }>;
const withOverdue = (l: LoanRow) => ({ ...l, overdueDays: overdueDays(l.dueAt, l.returnedAt ?? new Date()) });

@Injectable()
export class CirculationService {
  constructor(private readonly prisma: PrismaService) {}

  async borrow(schoolId: string, dto: BorrowDto) {
    if (!!dto.studentId === !!dto.teacherId) throw new BadRequestException('Chọn đúng một người mượn: học sinh hoặc giáo viên');
    const copy = await this.findCopy(schoolId, dto.barcode);
    if (copy.status === 'BORROWED') throw new ConflictException('Bản sách đang được mượn');
    if (copy.status !== 'AVAILABLE') throw new BadRequestException('Bản sách đã mất hoặc đã thanh lý');

    if (dto.studentId) {
      const student = await this.prisma.student.findFirst({ where: { id: dto.studentId, schoolId } });
      if (!student) throw new BadRequestException('Học sinh không hợp lệ');
      if (student.status !== 'STUDYING') throw new BadRequestException('Học sinh không còn theo học');
    } else if (!(await this.prisma.teacher.findFirst({ where: { id: dto.teacherId, schoolId } }))) {
      throw new BadRequestException('Giáo viên không hợp lệ');
    }

    const now = new Date();
    const borrower = dto.studentId ? { studentId: dto.studentId } : { teacherId: dto.teacherId };
    const [activeLoans, overdue, queue, available] = await this.prisma.$transaction([
      this.prisma.loan.count({ where: { schoolId, ...borrower, returnedAt: null } }),
      this.prisma.loan.count({ where: { schoolId, ...borrower, returnedAt: null, dueAt: { lt: now } } }),
      this.prisma.bookReservation.findMany({ where: { bookId: copy.bookId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } }),
      this.prisma.bookCopy.count({ where: { bookId: copy.bookId, status: 'AVAILABLE' } }),
    ]);
    const blocked = borrowBlockReason({ isStudent: !!dto.studentId, activeLoans, hasOverdue: overdue > 0 });
    if (blocked) throw new BadRequestException(blocked);
    const hold = holdCheck(
      queue.map((r) => r.studentId),
      available,
      dto.studentId,
    );
    if (!hold.allowed) throw new BadRequestException('Sách đang được giữ cho học sinh khác');

    const loan = await this.prisma.$transaction(async (tx) => {
      // Claiming the copy conditionally means a double scan can never lend it twice.
      const { count } = await tx.bookCopy.updateMany({ where: { id: copy.id, status: 'AVAILABLE' }, data: { status: 'BORROWED' } });
      if (!count) throw new ConflictException('Bản sách vừa được mượn');
      if (hold.fulfils >= 0) {
        await tx.bookReservation.updateMany({ where: { id: queue[hold.fulfils].id, status: 'ACTIVE' }, data: { status: 'FULFILLED', fulfilledAt: now } });
      }
      return tx.loan.create({
        data: { schoolId, copyId: copy.id, ...borrower, borrowedAt: now, dueAt: addDays(now, dto.days ?? DEFAULT_LOAN_DAYS) },
        include: loanInclude,
      });
    });
    return withOverdue(loan);
  }

  async return(schoolId: string, barcode: string) {
    const copy = await this.findCopy(schoolId, barcode);
    const open = await this.prisma.loan.findFirst({ where: { copyId: copy.id, returnedAt: null } });
    if (!open) throw new BadRequestException('Bản sách này không có lượt mượn nào đang mở');
    const now = new Date();
    const loan = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.loan.updateMany({ where: { id: open.id, returnedAt: null }, data: { returnedAt: now } });
      if (!count) throw new ConflictException('Sách đã được nhận trả');
      await tx.bookCopy.updateMany({ where: { id: copy.id, status: 'BORROWED' }, data: { status: 'AVAILABLE' } });
      return tx.loan.findUniqueOrThrow({ where: { id: open.id }, include: loanInclude });
    });
    const next = await this.prisma.bookReservation.findFirst({
      where: { bookId: copy.bookId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      include: { student: person },
    });
    return {
      loan,
      overdueDays: overdueDays(loan.dueAt, now),
      nextReservation: next ? { id: next.id, createdAt: next.createdAt, student: next.student } : null,
    };
  }

  async renew(schoolId: string, id: string) {
    const loan = await this.prisma.loan.findFirst({ where: { id, schoolId }, include: { copy: true } });
    if (!loan) throw new NotFoundException('Không tìm thấy lượt mượn');
    const reservations = await this.prisma.bookReservation.count({ where: { bookId: loan.copy.bookId, status: 'ACTIVE' } });
    const blocked = renewBlockReason(loan, reservations > 0);
    if (blocked) throw new BadRequestException(blocked);
    const { count } = await this.prisma.loan.updateMany({
      where: { id, returnedAt: null, renewCount: loan.renewCount },
      data: { dueAt: addDays(loan.dueAt, RENEW_DAYS), renewCount: loan.renewCount + 1 },
    });
    if (!count) throw new ConflictException('Lượt mượn vừa thay đổi, vui lòng thử lại');
    return withOverdue(await this.prisma.loan.findUniqueOrThrow({ where: { id }, include: loanInclude }));
  }

  async listLoans(schoolId: string, query: LoanQuery): Promise<Page<unknown>> {
    const q = query.q ? { contains: query.q, mode: 'insensitive' as const } : undefined;
    const where: Prisma.LoanWhereInput = {
      schoolId,
      studentId: query.studentId,
      teacherId: query.teacherId,
      returnedAt: query.status === 'returned' ? { not: null } : query.status ? null : undefined,
      dueAt: query.status === 'overdue' ? { lt: new Date() } : undefined,
      OR: q
        ? [
            { student: { fullName: q } },
            { student: { code: q } },
            { teacher: { fullName: q } },
            { copy: { barcode: q } },
            { copy: { book: { title: q } } },
          ]
        : undefined,
    };
    const orderBy: Prisma.LoanOrderByWithRelationInput = query.status === 'returned' ? { returnedAt: 'desc' } : query.status ? { dueAt: 'asc' } : { borrowedAt: 'desc' };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.loan.findMany({ where, include: loanInclude, orderBy, ...pageArgs(query) }),
      this.prisma.loan.count({ where }),
    ]);
    return { items: items.map(withOverdue), total, page: query.page, pageSize: query.pageSize };
  }

  async reserve(schoolId: string, dto: ReservationDto) {
    const book = await this.prisma.book.findFirst({ where: { id: dto.bookId, schoolId } });
    if (!book) throw new BadRequestException('Đầu sách không hợp lệ');
    if (!(await this.prisma.student.findFirst({ where: { id: dto.studentId, schoolId } }))) throw new BadRequestException('Học sinh không hợp lệ');
    const [mine, borrowing, available, active] = await this.prisma.$transaction([
      this.prisma.bookReservation.count({ where: { bookId: book.id, studentId: dto.studentId, status: 'ACTIVE' } }),
      this.prisma.loan.count({ where: { studentId: dto.studentId, returnedAt: null, copy: { bookId: book.id } } }),
      this.prisma.bookCopy.count({ where: { bookId: book.id, status: 'AVAILABLE' } }),
      this.prisma.bookReservation.count({ where: { bookId: book.id, status: 'ACTIVE' } }),
    ]);
    if (mine) throw new ConflictException('Học sinh đã đặt trước sách này');
    if (borrowing) throw new BadRequestException('Học sinh đang mượn sách này');
    if (!canReserve(available, active)) throw new BadRequestException('Sách còn bản sẵn sàng, có thể mượn ngay');
    return this.prisma.bookReservation.create({
      data: { schoolId, bookId: book.id, studentId: dto.studentId },
      include: { book: { select: { id: true, title: true } }, student: person },
    });
  }

  listReservations(schoolId: string, query: ReservationQuery) {
    return this.prisma.bookReservation.findMany({
      where: { schoolId, bookId: query.bookId, studentId: query.studentId, status: query.status },
      include: { book: { select: { id: true, title: true } }, student: person },
      orderBy: { createdAt: 'asc' },
      take: query.limit,
    });
  }

  async cancelReservation(schoolId: string, id: string) {
    const r = await this.prisma.bookReservation.findFirst({ where: { id, schoolId } });
    if (!r) throw new NotFoundException('Không tìm thấy lượt đặt trước');
    if (r.status !== 'ACTIVE') throw new BadRequestException('Chỉ hủy được lượt đặt trước đang hiệu lực');
    return this.prisma.bookReservation.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  private async findCopy(schoolId: string, barcode: string) {
    const copy = await this.prisma.bookCopy.findUnique({ where: { schoolId_barcode: { schoolId, barcode: barcode.trim() } } });
    if (!copy) throw new NotFoundException('Không tìm thấy bản sách với mã vạch này');
    return copy;
  }
}
