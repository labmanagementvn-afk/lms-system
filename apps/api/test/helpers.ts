import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

export const prisma = new PrismaClient();
export const runId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function createApp(): Promise<INestApplication> {
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.ACCOUNTING_SYNC_INTERVAL_MS = '0';
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

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
