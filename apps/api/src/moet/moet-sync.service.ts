import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MoetExportKind, MoetSync, MoetSyncStatus, MoetTarget, Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { Page, pageArgs } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { MOET_GATEWAY, MoetGateway, MoetRowError } from './moet-gateway';
import { SyncDto, SyncQuery } from './moet.dto';
import { MoetService } from './moet.service';

/** Errors kept per submission; the counts stay exact beyond it. */
const MAX_ERRORS = 500;

/**
 * Đồng bộ CSDL ngành: pushes the same rows as the exchange files straight to the
 * ministry's or the Sở's database, signing in with the school's account for that
 * submission only, and keeps each submission with what the database refused.
 */
@Injectable()
export class MoetSyncService {
  private readonly logger = new Logger(MoetSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moet: MoetService,
    @Inject(MOET_GATEWAY) private readonly gateway: MoetGateway,
  ) {}

  get provider() {
    return this.gateway.name;
  }

  async sync(user: AuthUser, dto: SyncDto) {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { code: true, moetCode: true } });
    const schoolCode = school.moetCode ?? school.code;
    const year = await this.moet.resolveYear(user.schoolId, dto.academicYearId, dto.kind);
    const semester = dto.kind === MoetExportKind.TERM_RESULTS ? (dto.semester ?? 1) : null;
    const { header, rows } = await this.moet.build(user.schoolId, schoolCode, dto.kind, year, semester ?? 1);
    if (!rows.length) throw new BadRequestException('Không có dữ liệu để gửi');
    const base = {
      schoolId: user.schoolId,
      target: dto.target,
      kind: dto.kind,
      academicYearId: dto.kind === MoetExportKind.TEACHERS ? null : (year?.id ?? null),
      semester,
      username: dto.username.trim(),
      provider: this.gateway.name,
      total: rows.length,
      createdById: user.userId,
      startedAt: new Date(),
    };
    try {
      const r = await this.gateway.submit(
        { username: dto.username.trim(), password: dto.password },
        { target: dto.target, kind: dto.kind, schoolCode, academicYear: year?.name ?? null, semester, header, rows },
      );
      const status = !r.rejected.length ? MoetSyncStatus.SUCCESS : r.accepted ? MoetSyncStatus.PARTIAL : MoetSyncStatus.FAILED;
      const created = await this.prisma.moetSync.create({
        data: {
          ...base,
          status,
          accepted: r.accepted,
          rejected: r.rejected.length,
          errors: r.rejected.slice(0, MAX_ERRORS) as unknown as Prisma.InputJsonValue,
          externalRef: r.batchId,
          error: status === MoetSyncStatus.FAILED ? 'Cơ sở dữ liệu từ chối toàn bộ bản ghi' : null,
          finishedAt: new Date(),
        },
      });
      return this.format(created);
    } catch (e) {
      // A refused sign-in or an unreachable service is part of the history too.
      this.logger.warn(`sync ${dto.target} ${dto.kind} failed: ${(e as Error).message}`);
      const created = await this.prisma.moetSync.create({ data: { ...base, status: MoetSyncStatus.FAILED, rejected: 0, error: (e as Error).message.slice(0, 500), finishedAt: new Date() } });
      return this.format(created);
    }
  }

  async list(schoolId: string, query: SyncQuery): Promise<Page<unknown> & { provider: string; lastUsername: Record<MoetTarget, string | null> }> {
    const where: Prisma.MoetSyncWhereInput = { schoolId, target: query.target, kind: query.kind, status: query.status };
    const [items, total, lastMoet, lastProvince] = await this.prisma.$transaction([
      this.prisma.moetSync.findMany({ where, orderBy: { startedAt: 'desc' }, ...pageArgs(query), omit: { errors: true } }),
      this.prisma.moetSync.count({ where }),
      this.prisma.moetSync.findFirst({ where: { schoolId, target: MoetTarget.MOET }, orderBy: { startedAt: 'desc' }, select: { username: true } }),
      this.prisma.moetSync.findFirst({ where: { schoolId, target: MoetTarget.PROVINCE }, orderBy: { startedAt: 'desc' }, select: { username: true } }),
    ]);
    const [years, names] = await Promise.all([this.yearNames(items.map((i) => i.academicYearId)), this.userNames(items.map((i) => i.createdById))]);
    return {
      items: items.map((i) => ({ ...i, academicYear: i.academicYearId ? (years.get(i.academicYearId) ?? null) : null, createdBy: names.get(i.createdById) ?? null })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      provider: this.gateway.name,
      // To fill in the account next time; passwords are never kept.
      lastUsername: { MOET: lastMoet?.username ?? null, PROVINCE: lastProvince?.username ?? null },
    };
  }

  async get(schoolId: string, id: string) {
    const s = await this.prisma.moetSync.findFirst({ where: { id, schoolId } });
    if (!s) throw new NotFoundException('Không tìm thấy lần gửi dữ liệu');
    return this.format(s);
  }

  private async format(s: MoetSync) {
    const [years, names] = await Promise.all([this.yearNames([s.academicYearId]), this.userNames([s.createdById])]);
    return { ...s, errors: s.errors as unknown as MoetRowError[], academicYear: s.academicYearId ? (years.get(s.academicYearId) ?? null) : null, createdBy: names.get(s.createdById) ?? null };
  }

  private async yearNames(ids: (string | null)[]) {
    const years = await this.prisma.academicYear.findMany({ where: { id: { in: ids.filter((i): i is string => !!i) } }, select: { id: true, name: true } });
    return new Map(years.map((y) => [y.id, y.name]));
  }

  private async userNames(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, fullName: true } });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }
}
