import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import { parseCsv, serializeCsv } from '../admissions/csv';
import { Page, pageArgs } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto, QuestionQuery, UpdateQuestionDto } from './assessments.dto';
import { ChoiceOption, MatchingOptions, validateQuestion } from './grading';

const include = {
  subject: { select: { id: true, code: true, name: true } },
  _count: { select: { testQuestions: true } },
} satisfies Prisma.QuestionInclude;

type Row = Prisma.QuestionGetPayload<{ include: typeof include }>;

const CSV_COLUMNS = ['type', 'content', 'optionA', 'optionB', 'optionC', 'optionD', 'answer', 'difficulty', 'subjectCode', 'gradeLevel', 'tags', 'explanation'] as const;
type CsvColumn = (typeof CSV_COLUMNS)[number];
const OPTION_KEYS = ['A', 'B', 'C', 'D'];
/** Types whose options and answer fit the flat CSV columns. */
const CSV_TYPES = new Set<QuestionType>([
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
  QuestionType.FILL_BLANK,
  QuestionType.SHORT_ANSWER,
  QuestionType.NUMERIC,
  QuestionType.ORDERING,
  QuestionType.ESSAY,
]);

const toJson = (v: unknown) => (v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue));
const splitList = (s: string) => s.split(/[;|]/).map((x) => x.trim()).filter(Boolean);

/** Ngân hàng câu hỏi: CRUD, CSV import/export and tag listing, scoped to the school. */
@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  private where(schoolId: string, query: QuestionQuery): Prisma.QuestionWhereInput {
    return {
      schoolId,
      isActive: query.isActive ?? true,
      subjectId: query.subjectId,
      gradeLevel: query.gradeLevel,
      type: query.type,
      difficulty: query.difficulty,
      tags: query.tag ? { has: query.tag } : undefined,
      content: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    };
  }

  private present({ _count, ...q }: Row) {
    return { ...q, usedIn: _count.testQuestions };
  }

  async list(schoolId: string, query: QuestionQuery): Promise<Page<ReturnType<QuestionsService['present']>>> {
    const where = this.where(schoolId, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.question.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.question.count({ where }),
    ]);
    return { items: items.map((q) => this.present(q)), total, page: query.page, pageSize: query.pageSize };
  }

  async get(schoolId: string, id: string) {
    const q = await this.prisma.question.findFirst({ where: { id, schoolId }, include });
    if (!q) throw new NotFoundException('Không tìm thấy câu hỏi');
    return this.present(q);
  }

  /** Distinct tags of the school's bank, sorted. */
  async tags(schoolId: string): Promise<string[]> {
    const rows = await this.prisma.question.findMany({ where: { schoolId }, select: { tags: true } });
    return [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'vi'));
  }

  private async assertSubject(schoolId: string, subjectId: string | null | undefined) {
    if (!subjectId) return;
    const s = await this.prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true } });
    if (!s) throw new BadRequestException('Không tìm thấy môn học');
  }

  async create(schoolId: string, userId: string, dto: CreateQuestionDto) {
    await this.assertSubject(schoolId, dto.subjectId);
    const { options, answer } = validateQuestion(dto);
    const q = await this.prisma.question.create({
      data: {
        schoolId,
        type: dto.type,
        content: dto.content.trim(),
        subjectId: dto.subjectId ?? null,
        gradeLevel: dto.gradeLevel ?? null,
        difficulty: dto.difficulty ?? 1,
        options: toJson(options),
        answer: toJson(answer),
        explanation: dto.explanation?.trim() || null,
        tags: [...new Set((dto.tags ?? []).map((t) => t.trim()).filter(Boolean))],
        isActive: dto.isActive ?? true,
        createdById: userId,
      },
      include,
    });
    return this.present(q);
  }

  async update(schoolId: string, id: string, dto: UpdateQuestionDto) {
    const existing = await this.prisma.question.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException('Không tìm thấy câu hỏi');
    await this.assertSubject(schoolId, dto.subjectId);
    // Options and answer are re-validated against the (possibly new) type and content.
    const merged = {
      type: dto.type ?? existing.type,
      content: (dto.content ?? existing.content).trim(),
      options: dto.options !== undefined ? dto.options : existing.options,
      answer: dto.answer !== undefined ? dto.answer : existing.answer,
    };
    const { options, answer } = validateQuestion(merged);
    const q = await this.prisma.question.update({
      where: { id },
      data: {
        type: merged.type,
        content: merged.content,
        subjectId: dto.subjectId === undefined ? undefined : dto.subjectId,
        gradeLevel: dto.gradeLevel === undefined ? undefined : dto.gradeLevel,
        difficulty: dto.difficulty,
        options: toJson(options),
        answer: toJson(answer),
        explanation: dto.explanation === undefined ? undefined : dto.explanation.trim() || null,
        tags: dto.tags === undefined ? undefined : [...new Set(dto.tags.map((t) => t.trim()).filter(Boolean))],
        isActive: dto.isActive,
      },
      include,
    });
    return this.present(q);
  }

  /** Questions already placed in a test are only hidden (isActive = false); unused ones are deleted. */
  async remove(schoolId: string, id: string) {
    const q = await this.prisma.question.findFirst({ where: { id, schoolId }, include });
    if (!q) throw new NotFoundException('Không tìm thấy câu hỏi');
    if (q._count.testQuestions > 0) {
      await this.prisma.question.update({ where: { id }, data: { isActive: false } });
      return { deleted: false, deactivated: true };
    }
    await this.prisma.question.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  // ---- CSV ----

  /** Turns one CSV row into a question DTO; throws a BadRequestException on a bad row. */
  private rowToDto(cells: Record<CsvColumn, string>, subjects: Map<string, string>): CreateQuestionDto {
    const type = cells.type.trim().toUpperCase().replace(/[\s-]+/g, '_') as QuestionType;
    if (!(type in QuestionType)) throw new BadRequestException(`Loại câu hỏi không hợp lệ: "${cells.type}"`);
    if (!CSV_TYPES.has(type)) throw new BadRequestException(`Loại ${type} không hỗ trợ nhập từ CSV`);
    const content = cells.content.trim();
    if (!content) throw new BadRequestException('Thiếu nội dung câu hỏi');
    const options: ChoiceOption[] = OPTION_KEYS.map((key) => ({ key, text: cells[`option${key}` as CsvColumn].trim() })).filter((o) => o.text);
    const raw = cells.answer.trim();
    let answer: unknown = null;
    let opts: unknown = null;
    switch (type) {
      case QuestionType.SINGLE_CHOICE:
        opts = options;
        answer = { key: raw.toUpperCase() };
        break;
      case QuestionType.MULTIPLE_CHOICE:
        opts = options;
        answer = { keys: splitList(raw.toUpperCase()) };
        break;
      case QuestionType.ORDERING:
        opts = options;
        answer = { order: splitList(raw.toUpperCase()) };
        break;
      case QuestionType.TRUE_FALSE:
        answer = { value: raw };
        break;
      case QuestionType.FILL_BLANK:
        // One group per blank separated by "|", alternatives inside a group by ";".
        answer = { blanks: raw.split('|').map((g) => g.split(';').map((s) => s.trim()).filter(Boolean)) };
        break;
      case QuestionType.SHORT_ANSWER:
        answer = { accepted: splitList(raw) };
        break;
      case QuestionType.NUMERIC: {
        // "3,5" or "3,5;0,1" (value;tolerance).
        const [value, tolerance] = raw.split(';').map((s) => s.trim());
        answer = { value, tolerance: tolerance || undefined };
        break;
      }
      default:
        break;
    }
    const subjectCode = cells.subjectCode.trim().toUpperCase();
    const subjectId = subjectCode ? subjects.get(subjectCode) : undefined;
    if (subjectCode && !subjectId) throw new BadRequestException(`Không tìm thấy môn học có mã "${subjectCode}"`);
    const difficulty = cells.difficulty.trim() ? Number(cells.difficulty) : 1;
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 6) throw new BadRequestException('Mức độ phải từ 1 đến 6');
    const gradeLevel = cells.gradeLevel.trim() ? Number(cells.gradeLevel) : undefined;
    if (gradeLevel !== undefined && (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 12)) throw new BadRequestException('Khối phải từ 1 đến 12');
    return {
      type,
      content,
      options: opts,
      answer,
      difficulty,
      subjectId,
      gradeLevel,
      tags: splitList(cells.tags),
      explanation: cells.explanation.trim() || undefined,
    };
  }

  /** Imports questions from CSV text; bad rows are reported by line and skipped. */
  async importCsv(schoolId: string, userId: string, csv: string): Promise<{ created: number; errors: { line: number; message: string }[] }> {
    const rows = parseCsv(csv);
    if (!rows.length) throw new BadRequestException('Nội dung CSV trống');
    const header = rows[0].map((h) => h.trim().replace(/^﻿/, ''));
    const index = new Map<CsvColumn, number>();
    for (const col of CSV_COLUMNS) {
      const i = header.findIndex((h) => h.toLowerCase() === col.toLowerCase());
      if (i >= 0) index.set(col, i);
    }
    if (!index.has('type') || !index.has('content')) throw new BadRequestException('Dòng tiêu đề cần có ít nhất các cột "type" và "content"');
    const subjects = new Map((await this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, code: true } })).map((s) => [s.code.toUpperCase(), s.id]));

    const data: Prisma.QuestionCreateManyInput[] = [];
    const errors: { line: number; message: string }[] = [];
    rows.slice(1).forEach((row, i) => {
      const line = i + 2;
      const cells = Object.fromEntries(CSV_COLUMNS.map((c) => [c, index.has(c) ? (row[index.get(c)!] ?? '') : ''])) as Record<CsvColumn, string>;
      try {
        const dto = this.rowToDto(cells, subjects);
        const { options, answer } = validateQuestion(dto);
        data.push({
          schoolId,
          type: dto.type,
          content: dto.content,
          subjectId: dto.subjectId ?? null,
          gradeLevel: dto.gradeLevel ?? null,
          difficulty: dto.difficulty ?? 1,
          options: toJson(options),
          answer: toJson(answer),
          explanation: dto.explanation ?? null,
          tags: dto.tags ?? [],
          createdById: userId,
        });
      } catch (e) {
        errors.push({ line, message: e instanceof BadRequestException ? e.message : 'Dòng không hợp lệ' });
      }
    });
    const created = data.length ? (await this.prisma.question.createMany({ data })).count : 0;
    return { created, errors };
  }

  /** Flattens a question's options / answer into the CSV columns (inverse of rowToDto where possible). */
  private toCsvRow(q: Row): (string | number)[] {
    const o = q.options as unknown;
    const a = (q.answer ?? {}) as Record<string, unknown>;
    const opt = ['', '', '', ''];
    let answer = '';
    const fill = (list: ChoiceOption[]) => list.slice(0, 4).forEach((c, i) => (opt[i] = c.text));
    switch (q.type) {
      case QuestionType.SINGLE_CHOICE:
        fill((o as ChoiceOption[]) ?? []);
        answer = String(a.key ?? '');
        break;
      case QuestionType.MULTIPLE_CHOICE:
        fill((o as ChoiceOption[]) ?? []);
        answer = ((a.keys as string[]) ?? []).join(';');
        break;
      case QuestionType.ORDERING:
        fill((o as ChoiceOption[]) ?? []);
        answer = ((a.order as string[]) ?? []).join(';');
        break;
      case QuestionType.TRUE_FALSE:
        answer = a.value ? 'true' : 'false';
        break;
      case QuestionType.FILL_BLANK:
        answer = ((a.blanks as string[][]) ?? []).map((g) => g.join(';')).join('|');
        break;
      case QuestionType.SHORT_ANSWER:
        answer = ((a.accepted as string[]) ?? []).join(';');
        break;
      case QuestionType.NUMERIC:
        answer = a.tolerance ? `${a.value};${a.tolerance}` : String(a.value ?? '');
        break;
      case QuestionType.MATCHING: {
        const m = (o ?? { left: [], right: [] }) as MatchingOptions;
        opt[0] = m.left.map((c) => `${c.key}: ${c.text}`).join(' | ');
        opt[1] = m.right.map((c) => `${c.key}: ${c.text}`).join(' | ');
        answer = Object.entries((a.pairs as Record<string, string>) ?? {})
          .map(([l, r]) => `${l}-${r}`)
          .join(';');
        break;
      }
      default:
        break;
    }
    return [q.type, q.content, ...opt, answer, q.difficulty, q.subject?.code ?? '', q.gradeLevel ?? '', q.tags.join(';'), q.explanation ?? ''];
  }

  async exportCsv(schoolId: string, query: QuestionQuery): Promise<string> {
    const items = await this.prisma.question.findMany({ where: this.where(schoolId, query), include, orderBy: { createdAt: 'asc' } });
    return serializeCsv([[...CSV_COLUMNS], ...items.map((q) => this.toCsvRow(q))], { bom: true });
  }
}
