import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { authorSelect } from './lms-access.service';
import { CreatePostDto, CreateThreadDto, UpdateThreadDto } from './lms.dto';

const threadInclude = {
  author: { select: authorSelect },
  lesson: { select: { id: true, title: true } },
  _count: { select: { posts: true } },
  posts: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, author: { select: authorSelect } } },
} satisfies Prisma.DiscussionThreadInclude;

/** Course discussion boards; callers check that the user may see the course first. */
@Injectable()
export class DiscussionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pinned threads first, then the most recently created. */
  async listThreads(courseId: string) {
    const rows = await this.prisma.discussionThread.findMany({
      where: { courseId },
      include: threadInclude,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(({ _count, posts, ...t }) => ({ ...t, postCount: _count.posts, lastPost: posts[0] ?? null }));
  }

  async createThread(schoolId: string, courseId: string, authorId: string, dto: CreateThreadDto) {
    if (dto.lessonId) {
      const lesson = await this.prisma.lesson.findFirst({ where: { id: dto.lessonId, courseId }, select: { id: true } });
      if (!lesson) throw new BadRequestException('Bài học không thuộc khóa học này');
    }
    const t = await this.prisma.discussionThread.create({
      data: { schoolId, courseId, authorId, lessonId: dto.lessonId, title: dto.title.trim(), body: dto.body.trim() },
    });
    return this.getThread(schoolId, t.id);
  }

  /** The bare thread row (for enrolment checks). */
  async thread(schoolId: string, id: string) {
    const t = await this.prisma.discussionThread.findFirst({ where: { id, schoolId } });
    if (!t) throw new NotFoundException('Không tìm thấy chủ đề thảo luận');
    return t;
  }

  async getThread(schoolId: string, id: string) {
    const t = await this.prisma.discussionThread.findFirst({
      where: { id, schoolId },
      include: {
        author: { select: authorSelect },
        lesson: { select: { id: true, title: true } },
        course: { select: { id: true, title: true } },
        posts: { orderBy: { createdAt: 'asc' }, include: { author: { select: authorSelect } } },
      },
    });
    if (!t) throw new NotFoundException('Không tìm thấy chủ đề thảo luận');
    return t;
  }

  async addPost(schoolId: string, threadId: string, authorId: string, dto: CreatePostDto) {
    const t = await this.thread(schoolId, threadId);
    if (t.isLocked) throw new BadRequestException('Chủ đề đã bị khóa');
    const post = await this.prisma.discussionPost.create({ data: { threadId, authorId, body: dto.body.trim() }, include: { author: { select: authorSelect } } });
    await this.prisma.discussionThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
    return post;
  }

  async updateThread(schoolId: string, id: string, dto: UpdateThreadDto) {
    await this.thread(schoolId, id);
    await this.prisma.discussionThread.update({ where: { id }, data: { isPinned: dto.isPinned, isLocked: dto.isLocked } });
    return this.getThread(schoolId, id);
  }

  async removeThread(schoolId: string, id: string) {
    await this.thread(schoolId, id);
    await this.prisma.discussionThread.delete({ where: { id } });
    return { ok: true };
  }

  async removePost(schoolId: string, id: string) {
    const r = await this.prisma.discussionPost.deleteMany({ where: { id, thread: { schoolId } } });
    if (!r.count) throw new NotFoundException('Không tìm thấy bài viết');
    return { ok: true };
  }
}
