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
