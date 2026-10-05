import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GuardianRelationship, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

export const prisma = new PrismaClient();
export const runId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function createApp(): Promise<INestApplication> {
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.ACCOUNTING_SYNC_INTERVAL_MS = '0';
  process.env.NOTIFY_DISPATCH_INTERVAL_MS = '0';
  process.env.ANNOUNCE_SCHEDULER_MS = '0';
  process.env.BUS_TRIP_SCHEDULER_MS = '0';
  process.env.STATS_SCHEDULER_MS = '0';
  process.env.RATE_LIMIT_PER_MIN = '0';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** Creates a school with a current academic year and returns a token for a user of the given role. */
export async function createSchool(app: INestApplication, code: string) {
  const school = await prisma.school.create({ data: { code, name: `Trường ${code}` } });
  await prisma.academicYear.create({
    data: { schoolId: school.id, name: '2026-2027', startDate: new Date('2026-09-05'), endDate: new Date('2027-05-31'), isCurrent: true },
  });
  const tokens = {} as Record<Role, string>;
  for (const role of [Role.ADMIN, Role.STAFF, Role.TEACHER]) {
    const email = `${role}-${code}@test.vn`.toLowerCase();
    await prisma.user.create({ data: { schoolId: school.id, email, fullName: role, role, passwordHash: await bcrypt.hash('Secret@123', 4) } });
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Secret@123' }).expect(200);
    tokens[role] = res.body.accessToken;
  }
  return { school, tokens };
}

/** A random Vietnamese mobile number (phones are unique across users, and test files run in parallel). */
export const uniquePhone = () => `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

/** Creates a user of any role who logs in by phone (parents, drivers) and returns their token. */
export async function createPhoneUser(app: INestApplication, schoolId: string, role: Role, fullName: string = role, phone = uniquePhone()) {
  const user = await prisma.user.create({ data: { schoolId, phone, fullName, role, passwordHash: await bcrypt.hash('Secret@123', 4) } });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone, password: 'Secret@123' }).expect(200);
  return { user, phone, token: res.body.accessToken as string };
}

/** Creates a parent account linked (as guardian) to each of the students and returns their token. */
export async function createParent(app: INestApplication, schoolId: string, studentIds: string[], fullName = 'Phụ huynh') {
  const p = await createPhoneUser(app, schoolId, Role.PARENT, fullName);
  for (const studentId of studentIds) {
    await prisma.guardian.create({
      data: { studentId, fullName, relationship: GuardianRelationship.MOTHER, phone: p.phone, isPrimary: true, userId: p.user.id },
    });
  }
  return p;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

let studentSeq = 0;
/**
 * Creates a student (enrolled in `classId` for the school's current year when given)
 * with a STUDENT login and returns the student, the user and a token.
 */
export async function createStudent(app: INestApplication, schoolId: string, opts: { classId?: string; fullName?: string; code?: string } = {}) {
  const code = opts.code ?? `HS${runId()}${++studentSeq}`;
  const username = code.toLowerCase();
  const user = await prisma.user.create({
    data: { schoolId, username, fullName: opts.fullName ?? `Học sinh ${code}`, role: Role.STUDENT, passwordHash: await bcrypt.hash('Secret@123', 4) },
  });
  const student = await prisma.student.create({ data: { schoolId, code, fullName: opts.fullName ?? `Học sinh ${code}`, userId: user.id } });
  if (opts.classId) {
    const cls = await prisma.class.findUniqueOrThrow({ where: { id: opts.classId }, select: { academicYearId: true } });
    await prisma.enrollment.create({ data: { classId: opts.classId, studentId: student.id, academicYearId: cls.academicYearId } });
  }
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password: 'Secret@123' }).expect(200);
  return { student, user, token: res.body.accessToken as string };
}

/** Creates a Phòng GD&ĐT with one officer account and returns the district and the officer's token. */
export async function createDistrict(app: INestApplication, code: string) {
  const district = await prisma.district.create({ data: { code, name: `Phòng GD&ĐT ${code}`, province: 'Hà Nội' } });
  const email = `district-${code}@test.vn`.toLowerCase();
  const user = await prisma.user.create({ data: { districtId: district.id, email, fullName: 'Chuyên viên PGD', role: Role.DISTRICT, passwordHash: await bcrypt.hash('Secret@123', 4) } });
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'Secret@123' }).expect(200);
  return { district, user, token: res.body.accessToken as string, login: res.body };
}

/** Polls `check` until it returns a truthy value (audit rows are written after the response is sent). */
export async function waitFor<T>(check: () => Promise<T | null | undefined | false>, timeoutMs = 3000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await check();
    if (v) return v as T;
    if (Date.now() > until) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Creates a class in the school's current academic year (with a homeroom teacher when given). */
export async function createClass(schoolId: string, name: string, gradeLevel = 6, homeroomTeacherId?: string) {
  const year = await prisma.academicYear.findFirstOrThrow({ where: { schoolId, isCurrent: true } });
  return prisma.class.create({ data: { schoolId, academicYearId: year.id, name, gradeLevel, homeroomTeacherId } });
}
