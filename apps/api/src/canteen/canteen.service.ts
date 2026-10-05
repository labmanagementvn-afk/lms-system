import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MealType, Prisma, Role, StudentStatus } from '@prisma/client';
import { AcademicYearsService } from '../academic-years/academic-years';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { fromDbDate, isLocked, isValidDate, monthRange, toDbDate } from './canteen-rules';
import { DailyQuery, MenuDto, MenuQuery, MonthlyQuery, RegistrationDto } from './canteen.dto';

const NO_CLASS = 'Chưa xếp lớp';

@Injectable()
export class CanteenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly years: AcademicYearsService,
  ) {}

  // ---- Menus ----

  async listMenus(schoolId: string, query: MenuQuery) {
    const date = { gte: query.from ? toDbDate(query.from) : undefined, lte: query.to ? toDbDate(query.to) : undefined };
    const [menus, counts] = await Promise.all([
      this.prisma.mealMenu.findMany({ where: { schoolId, date }, orderBy: [{ date: 'asc' }, { mealType: 'asc' }] }),
      this.prisma.mealRegistration.groupBy({ by: ['date', 'mealType'], where: { schoolId, date, cancelledAt: null }, _count: { _all: true } }),
    ]);
    const key = (d: Date, t: MealType) => `${fromDbDate(d)}|${t}`;
    const countMap = new Map(counts.map((c) => [key(c.date, c.mealType), c._count._all]));
    return menus.map((m) => ({ ...m, date: fromDbDate(m.date), registered: countMap.get(key(m.date, m.mealType)) ?? 0 }));
  }

  async upsertMenu(schoolId: string, dto: MenuDto) {
    if (!isValidDate(dto.date)) throw new BadRequestException('Ngày không hợp lệ');
    const date = toDbDate(dto.date);
    const data = { dishes: dto.dishes, price: dto.price, cutoff: dto.cutoff };
    const menu = await this.prisma.mealMenu.upsert({
      where: { schoolId_date_mealType: { schoolId, date, mealType: dto.mealType } },
      create: { schoolId, date, mealType: dto.mealType, ...data },
      update: data,
    });
    return { ...menu, date: dto.date };
  }

  async removeMenu(schoolId: string, id: string) {
    const menu = await this.prisma.mealMenu.findFirst({ where: { id, schoolId } });
    if (!menu) throw new NotFoundException('Không tìm thấy thực đơn');
    const active = await this.prisma.mealRegistration.count({ where: { schoolId, date: menu.date, mealType: menu.mealType, cancelledAt: null } });
    if (active) throw new ConflictException(`Đã có ${active} học sinh đăng ký suất ăn này, hãy hủy đăng ký trước`);
    await this.prisma.mealMenu.delete({ where: { id } });
  }

  // ---- Registrations ----

  async register(user: AuthUser, dto: RegistrationDto) {
    const { schoolId } = user;
    if (!dto.studentIds?.length && !dto.classId) throw new BadRequestException('Chọn học sinh hoặc lớp');
    const dates = [...new Set(dto.dates)].sort();
    const invalid = dates.filter((d) => !isValidDate(d));
    if (invalid.length) throw new BadRequestException(`Ngày không hợp lệ: ${invalid.join(', ')}`);

    const studentIds = await this.resolveStudents(schoolId, dto);
    const menus = await this.prisma.mealMenu.findMany({ where: { schoolId, mealType: dto.mealType, date: { in: dates.map(toDbDate) } } });
    const cutoffs = new Map(menus.map((m) => [fromDbDate(m.date), m.cutoff]));
    const missing = dates.filter((d) => !cutoffs.has(d));
    if (missing.length) throw new BadRequestException(`Chưa có thực đơn cho ngày: ${missing.join(', ')}`);

    if (user.role !== Role.ADMIN) {
      const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
      const now = new Date();
      const locked = dates.filter((d) => isLocked(d, cutoffs.get(d)!, school.timezone, now));
      if (locked.length) throw new BadRequestException(`Đã quá giờ chốt đăng ký suất ăn ngày: ${locked.join(', ')}`);
    }

    const where: Prisma.MealRegistrationWhereInput = { studentId: { in: studentIds }, mealType: dto.mealType, date: { in: dates.map(toDbDate) } };
    const pairs = studentIds.length * dates.length;
    if (dto.action === 'CANCEL') {
      const res = await this.prisma.mealRegistration.updateMany({ where: { ...where, cancelledAt: null }, data: { cancelledAt: new Date() } });
      return { registered: 0, cancelled: res.count, skipped: pairs - res.count };
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.mealRegistration.findMany({ where, select: { id: true, studentId: true, date: true, cancelledAt: true } });
      const seen = new Set(existing.map((r) => `${r.studentId}|${fromDbDate(r.date)}`));
      const reactivate = existing.filter((r) => r.cancelledAt).map((r) => r.id);
      const created = await tx.mealRegistration.createMany({
        data: studentIds.flatMap((studentId) =>
          dates.filter((d) => !seen.has(`${studentId}|${d}`)).map((d) => ({ schoolId, studentId, date: toDbDate(d), mealType: dto.mealType })),
        ),
        skipDuplicates: true,
      });
      const revived = reactivate.length
        ? await tx.mealRegistration.updateMany({ where: { id: { in: reactivate } }, data: { cancelledAt: null } })
        : { count: 0 };
      const registered = created.count + revived.count;
      return { registered, cancelled: 0, skipped: pairs - registered };
    });
  }

  // ---- Reports ----

  async daily(schoolId: string, query: DailyQuery) {
    if (!isValidDate(query.date)) throw new BadRequestException('Ngày không hợp lệ');
    const date = toDbDate(query.date);
    const year = await this.years.current(schoolId);
    const [menu, regs] = await Promise.all([
      this.prisma.mealMenu.findUnique({ where: { schoolId_date_mealType: { schoolId, date, mealType: query.mealType } } }),
      this.prisma.mealRegistration.findMany({
        where: {
          schoolId,
          date,
          mealType: query.mealType,
          cancelledAt: null,
          student: query.classId ? { enrollments: { some: { classId: query.classId } } } : undefined,
        },
        include: { student: this.studentWithClass(year.id) },
      }),
    ]);
    const students = regs
      .map((r) => {
        const klass = r.student.enrollments[0]?.class;
        return { id: r.student.id, code: r.student.code, fullName: r.student.fullName, classId: klass?.id ?? null, className: klass?.name ?? NO_CLASS };
      })
      .sort((a, b) => a.className.localeCompare(b.className, 'vi') || a.fullName.localeCompare(b.fullName, 'vi'));
    const byClass = new Map<string, { classId: string | null; className: string; count: number }>();
    for (const s of students) {
      const k = s.classId ?? '';
      const row = byClass.get(k) ?? { classId: s.classId, className: s.className, count: 0 };
      row.count++;
      byClass.set(k, row);
    }
    return {
      date: query.date,
      mealType: query.mealType,
      menu: menu ? { ...menu, date: query.date } : null,
      total: students.length,
      byClass: [...byClass.values()],
      students,
    };
  }

  async monthly(schoolId: string, query: MonthlyQuery) {
    const { from, to } = monthRange(query.month);
    const year = await this.years.current(schoolId);
    const range = { gte: from, lt: to };
    const [menus, regs] = await Promise.all([
      this.prisma.mealMenu.findMany({ where: { schoolId, date: range } }),
      this.prisma.mealRegistration.findMany({
        where: {
          schoolId,
          date: range,
          cancelledAt: null,
          student: query.classId ? { enrollments: { some: { classId: query.classId } } } : undefined,
        },
        include: { student: this.studentWithClass(year.id) },
      }),
    ]);
    const price = new Map(menus.map((m) => [`${fromDbDate(m.date)}|${m.mealType}`, m.price]));
    const rows = new Map<string, { studentId: string; code: string; fullName: string; className: string; meals: number; cost: number; byMealType: Record<string, number> }>();
    for (const r of regs) {
      const s = r.student;
      const row = rows.get(s.id) ?? {
        studentId: s.id,
        code: s.code,
        fullName: s.fullName,
        className: s.enrollments[0]?.class.name ?? NO_CLASS,
        meals: 0,
        cost: 0,
        byMealType: {},
      };
      row.meals++;
      row.cost += price.get(`${fromDbDate(r.date)}|${r.mealType}`) ?? 0;
      row.byMealType[r.mealType] = (row.byMealType[r.mealType] ?? 0) + 1;
      rows.set(s.id, row);
    }
    const items = [...rows.values()].sort((a, b) => a.className.localeCompare(b.className, 'vi') || a.fullName.localeCompare(b.fullName, 'vi'));
    return {
      month: query.month,
      items,
      totals: { students: items.length, meals: items.reduce((s, i) => s + i.meals, 0), cost: items.reduce((s, i) => s + i.cost, 0) },
    };
  }

  private async resolveStudents(schoolId: string, dto: RegistrationDto): Promise<string[]> {
    const ids = new Set<string>();
    if (dto.studentIds?.length) {
      const wanted = [...new Set(dto.studentIds)];
      const found = await this.prisma.student.findMany({ where: { schoolId, id: { in: wanted } }, select: { id: true } });
      if (found.length !== wanted.length) throw new BadRequestException('Học sinh không hợp lệ');
      found.forEach((s) => ids.add(s.id));
    }
    if (dto.classId) {
      const klass = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
      if (!klass) throw new BadRequestException('Lớp không hợp lệ');
      const enrolled = await this.prisma.enrollment.findMany({
        where: { classId: klass.id, student: { status: StudentStatus.STUDYING } },
        select: { studentId: true },
      });
      enrolled.forEach((e) => ids.add(e.studentId));
    }
    if (!ids.size) throw new BadRequestException('Lớp chưa có học sinh');
    return [...ids];
  }

  private studentWithClass(academicYearId: string) {
    return {
      select: {
        id: true,
        code: true,
        fullName: true,
        enrollments: { where: { academicYearId }, select: { class: { select: { id: true, name: true } } } },
      },
    } satisfies Prisma.StudentDefaultArgs;
  }
}
