import { PrismaClient } from '@prisma/client';

/** What the core seed created, handed to each module's seeder. */
export interface SeedContext {
  schoolId: string;
  academicYearId: string;
  /** Class name -> id (6A1, 6A2, 7A1). */
  classes: Record<string, string>;
  /** Teacher code -> teacher id (GV001 ... GV008). */
  teachers: Record<string, string>;
  /** Teacher code -> user id. */
  teacherUsers: Record<string, string>;
  /** Subject code -> id (TOAN, VAN, ANH, ...). */
  subjects: Record<string, string>;
  /** Student ids in creation order: 10 per class, 6A1 first, then 6A2, then 7A1. */
  studentIds: string[];
  adminUserId: string;
  staffUserId: string;
  /** bcrypt hash for a demo password. */
  hash: (password: string) => Promise<string>;
}

export type Seeder = (prisma: PrismaClient, ctx: SeedContext) => Promise<void>;
