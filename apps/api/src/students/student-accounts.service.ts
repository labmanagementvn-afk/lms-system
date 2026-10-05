import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, StudentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Page, pageArgs } from '../common/pagination';
import { generatePassword } from '../common/passwords';
import { PrismaService } from '../prisma/prisma.service';
import { BulkStudentAccountsDto, StudentAccountQuery } from './student-accounts.dto';

const accountSelect = {
  id: true,
  code: true,
  fullName: true,
  status: true,
  enrollments: { orderBy: { enrolledAt: 'desc' }, take: 1, select: { class: { select: { id: true, name: true } } } },
  user: { select: { id: true, username: true, isActive: true, mustChangePassword: true, createdAt: true } },
} satisfies Prisma.StudentSelect;

type AccountRow = Prisma.StudentGetPayload<{ select: typeof accountSelect }>;

const present = ({ enrollments, user, ...s }: AccountRow) => ({ ...s, class: enrollments[0]?.class ?? null, account: user });

export interface CreatedStudentAccount {
  student: ReturnType<typeof present>;
  /** First-time password; returned once. */
  password: string;
}

/** Student logins: one account per student, username = student code (lower-case). */
@Injectable()
export class StudentAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(schoolId: string, query: StudentAccountQuery): Promise<Page<unknown>> {
    const where: Prisma.StudentWhereInput = {
      schoolId,
      userId: { not: null },
      enrollments: query.classId ? { some: { classId: query.classId } } : undefined,
      OR: query.q ? [{ fullName: { contains: query.q, mode: 'insensitive' } }, { code: { contains: query.q, mode: 'insensitive' } }] : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({ where, select: accountSelect, orderBy: { code: 'asc' }, ...pageArgs(query) }),
      this.prisma.student.count({ where }),
    ]);
    return { items: items.map(present), total, page: query.page, pageSize: query.pageSize };
  }

  /** Studying students who have no login yet. */
  async pending(schoolId: string, classId?: string) {
    const items = await this.prisma.student.findMany({
      where: { schoolId, userId: null, status: StudentStatus.STUDYING, enrollments: classId ? { some: { classId } } : undefined },
      select: accountSelect,
      orderBy: { code: 'asc' },
    });
    return { items: items.map(present) };
  }

  async create(schoolId: string, studentId: string): Promise<CreatedStudentAccount> {
    const s = await this.prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true, code: true, fullName: true, userId: true } });
    if (!s) throw new NotFoundException('Không tìm thấy học sinh');
    if (s.userId) throw new ConflictException('Học sinh này đã có tài khoản');
    return this.createFor(schoolId, s);
  }

  async bulkCreate(schoolId: string, dto: BulkStudentAccountsDto) {
    const { items } = await this.pending(schoolId, dto.classId);
    const created: { code: string; fullName: string; username: string; password: string; class: string | null }[] = [];
    for (const row of items) {
      const res = await this.createFor(schoolId, row);
      created.push({ code: row.code, fullName: row.fullName, username: res.student.account!.username!, password: res.password, class: row.class?.name ?? null });
    }
    return { created };
  }

  async resetPassword(schoolId: string, userId: string) {
    const user = await this.findAccount(schoolId, userId);
    const password = generatePassword();
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
    return { password };
  }

  async setActive(schoolId: string, userId: string, isActive: boolean) {
    const user = await this.findAccount(schoolId, userId);
    await this.prisma.user.update({ where: { id: user.id }, data: { isActive } });
    const s = await this.prisma.student.findFirstOrThrow({ where: { userId: user.id }, select: accountSelect });
    return present(s);
  }

  /** The student code as username; a school-code suffix keeps it unique when another school uses the same code. */
  async usernameFor(schoolId: string, code: string) {
    const base = code.trim().toLowerCase();
    const taken = await this.prisma.user.findUnique({ where: { username: base }, select: { id: true } });
    if (!taken) return base;
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { code: true } });
    return `${base}.${school.code.toLowerCase()}`;
  }

  private async createFor(schoolId: string, s: { id: string; code: string; fullName: string }): Promise<CreatedStudentAccount> {
    const username = await this.usernameFor(schoolId, s.code);
    const password = generatePassword();
    const student = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { schoolId, username, fullName: s.fullName, role: Role.STUDENT, passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
      });
      await tx.student.update({ where: { id: s.id }, data: { userId: user.id } });
      return tx.student.findUniqueOrThrow({ where: { id: s.id }, select: accountSelect });
    });
    return { student: present(student), password };
  }

  private async findAccount(schoolId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, schoolId, role: Role.STUDENT } });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản học sinh');
    return user;
  }
}
