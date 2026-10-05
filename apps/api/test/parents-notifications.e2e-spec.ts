import { INestApplication } from '@nestjs/common';
import * as http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { bearer, createApp, createParent, createSchool, prisma, runId } from './helpers';

// Parent accounts, the parent app endpoints and the notification outbox against a real Postgres.
describe('Parents & notifications (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let schoolId: string;
  let classId: string;
  let s1: string;
  let s2: string;
  let guardian1: string;
  const run = runId();
  const phone1 = `+84 9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);

  let parentToken: string; // account created by staff from guardian1
  let parentPassword: string;

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `PN${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    otherTokens = (await createSchool(app, `PO${run}`)).tokens;

    const year = await prisma.academicYear.findFirstOrThrow({ where: { schoolId } });
    const klass = await prisma.class.create({ data: { schoolId, academicYearId: year.id, name: '6A', gradeLevel: 6 } });
    classId = klass.id;
    const st1 = await prisma.student.create({
      data: {
        schoolId,
        code: 'HS1',
        fullName: 'Nguyễn Văn An',
        enrollments: { create: { classId, academicYearId: year.id } },
        guardians: { create: { fullName: 'Nguyễn Văn Bố', relationship: 'FATHER', phone: phone1, isPrimary: true } },
      },
      include: { guardians: true },
    });
    s1 = st1.id;
    guardian1 = st1.guardians[0].id;
    const st2 = await prisma.student.create({
      data: { schoolId, code: 'HS2', fullName: 'Trần Thị Bình', enrollments: { create: { classId, academicYearId: year.id } } },
    });
    s2 = st2.id;
  });

  afterAll(async () => {
    // An SSE response can outlive its client; drop sockets so close() does not wait on them.
    (app.getHttpServer() as http.Server).closeAllConnections?.();
    await app.close();
    await prisma.$disconnect();
  });

  describe('accounts', () => {
    it('staff creates an account from a guardian; the parent logs in by phone', async () => {
      const res = await api().post('/api/v1/parents/accounts').set(staff()).send({ guardianId: guardian1 }).expect(201);
      expect(res.body.linked).toBe(false);
      expect(res.body.password).toHaveLength(8);
      expect(res.body.user.phone).toBe(phone1.replace(/\D/g, '').replace(/^84/, '0'));
      expect(res.body.user.children[0].code).toBe('HS1');
      parentPassword = res.body.password;

      const login = await api().post('/api/v1/auth/login').send({ phone: phone1, password: parentPassword }).expect(200);
      expect(login.body.user.role).toBe('PARENT');
      expect(login.body.user.mustChangePassword).toBe(true);
      parentToken = login.body.accessToken;

      // Creating it twice is refused; portal routes are closed to parents.
      await api().post('/api/v1/parents/accounts').set(staff()).send({ guardianId: guardian1 }).expect(409);
      await api().get('/api/v1/students').set(bearer(parentToken)).expect(403);
    });

    it('lists guardians without an account and creates them in bulk, one account per phone', async () => {
      const phone = `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
      await prisma.guardian.create({ data: { studentId: s2, fullName: 'Trần Văn Cha', relationship: 'FATHER', phone, isPrimary: true } });
      // A sibling-style second record with the same phone joins the same account.
      await prisma.guardian.create({ data: { studentId: s1, fullName: 'Trần Văn Cha', relationship: 'GUARDIAN', phone: `+84${phone.slice(1)}`, isPrimary: false } });

      const pending = await api().get('/api/v1/parents/accounts/pending').set(admin()).expect(200);
      expect(pending.body.items).toHaveLength(1);
      expect(pending.body.items[0].students.map((s: any) => s.code).sort()).toEqual(['HS1', 'HS2']);

      const bulk = await api().post('/api/v1/parents/accounts/bulk').set(admin()).send({}).expect(201);
      expect(bulk.body.created).toHaveLength(1);
      expect(bulk.body.created[0].phone).toBe(phone);
      expect(bulk.body.created[0].password).toHaveLength(8);

      expect((await api().get('/api/v1/parents/accounts/pending').set(admin()).expect(200)).body.items).toHaveLength(0);
      const list = await api().get('/api/v1/parents/accounts').set(admin()).expect(200);
      expect(list.body.total).toBe(2);
      const linked = await api().get('/api/v1/parents/accounts').set(admin()).query({ q: phone }).expect(200);
      expect(linked.body.items[0].children).toHaveLength(2);

      // Another school sees nothing.
      expect((await api().get('/api/v1/parents/accounts').set(bearer(otherTokens.ADMIN)).expect(200)).body.total).toBe(0);
    });

    it('changing the password clears the first-login flag', async () => {
      await api().post('/api/v1/auth/change-password').set(bearer(parentToken)).send({ currentPassword: 'wrong', newPassword: 'NewPass@123' }).expect(400);
      await api().post('/api/v1/auth/change-password').set(bearer(parentToken)).send({ currentPassword: parentPassword, newPassword: 'NewPass@123' }).expect(200);
      const me = await api().get('/api/v1/auth/me').set(bearer(parentToken)).expect(200);
      expect(me.body.mustChangePassword).toBe(false);
      await api().post('/api/v1/auth/login').send({ phone: phone1, password: parentPassword }).expect(401);
      await api().post('/api/v1/auth/login').send({ phone: phone1, password: 'NewPass@123' }).expect(200);
    });

    it('resets the password and locks the account', async () => {
      const userId = (await prisma.user.findFirstOrThrow({ where: { schoolId, role: 'PARENT', guardians: { some: { id: guardian1 } } } })).id;
      const reset = await api().post(`/api/v1/parents/accounts/${userId}/reset-password`).set(staff()).expect(200);
      const login = await api().post('/api/v1/auth/login').send({ phone: phone1, password: reset.body.password }).expect(200);
      expect(login.body.user.mustChangePassword).toBe(true);
      parentToken = login.body.accessToken;

      await api().patch(`/api/v1/parents/accounts/${userId}`).set(staff()).send({ isActive: false }).expect(200);
      await api().post('/api/v1/auth/login').send({ phone: phone1, password: reset.body.password }).expect(401);
      await api().patch(`/api/v1/parents/accounts/${userId}`).set(staff()).send({ isActive: true }).expect(200);
      parentToken = (await api().post('/api/v1/auth/login').send({ phone: phone1, password: reset.body.password }).expect(200)).body.accessToken;
    });
  });

  describe('parent app', () => {
    let invoiceId: string;

    it('shows only the parent’s own children', async () => {
      const kids = await api().get('/api/v1/parent/children').set(bearer(parentToken)).expect(200);
      expect(kids.body.map((k: any) => k.code)).toEqual(['HS1']);
      expect(kids.body[0].class.name).toBe('6A');
      expect(kids.body[0].today.status).toBeNull();
      await api().get(`/api/v1/parent/children/${s2}/attendance`).set(bearer(parentToken)).expect(404);
      await api().get(`/api/v1/parent/children/${s1}/attendance`).set(bearer(otherTokens.ADMIN)).expect(403);
    });

    it('a gate event alerts the parent and shows in today’s status', async () => {
      await api().post('/api/v1/attendance/manual').set(staff()).send({ studentId: s1, direction: 'IN' }).expect(201);
      const list = await api().get('/api/v1/notifications').set(bearer(parentToken)).expect(200);
      expect(list.body.items[0].kind).toBe('GATE_IN');
      expect(list.body.items[0].body).toContain('Nguyễn Văn An');
      expect(list.body.items[0].student.code).toBe('HS1');
      expect((await api().get('/api/v1/notifications/unread-count').set(bearer(parentToken)).expect(200)).body.unread).toBe(1);

      const kids = await api().get('/api/v1/parent/children').set(bearer(parentToken)).expect(200);
      expect(['ON_TIME', 'LATE']).toContain(kids.body[0].today.status);
      expect(kids.body[0].today.firstIn).toBeTruthy();
      const month = new Date().toISOString().slice(0, 7);
      const att = await api().get(`/api/v1/parent/children/${s1}/attendance`).set(bearer(parentToken)).query({ month }).expect(200);
      expect(att.body.days.length).toBeGreaterThanOrEqual(1);
      expect(att.body.days.at(-1).gate.firstIn).toBeTruthy();

      await api().post(`/api/v1/notifications/${list.body.items[0].id}/read`).set(bearer(parentToken)).expect(200);
      expect((await api().get('/api/v1/notifications/unread-count').set(bearer(parentToken)).expect(200)).body.unread).toBe(0);
    });

    it('an invoice and its payment alert the parent; the QR appears once the bank account is set', async () => {
      const inv = await api()
        .post('/api/v1/finance/invoices')
        .set(admin())
        .send({ studentId: s1, title: 'Phí dã ngoại', lines: [{ description: 'Dã ngoại', unitPrice: 150_000 }] })
        .expect(201);
      invoiceId = inv.body.id;
      const mine = await api().get(`/api/v1/parent/children/${s1}/invoices`).set(bearer(parentToken)).expect(200);
      expect(mine.body.outstanding).toBe(150_000);
      expect(mine.body.items[0].id).toBe(invoiceId);

      let detail = await api().get(`/api/v1/parent/invoices/${invoiceId}`).set(bearer(parentToken)).expect(200);
      expect(detail.body.qr).toBeNull();
      await api()
        .put('/api/v1/finance/settings')
        .set(admin())
        .send({ bankBin: '970436', bankName: 'Vietcombank', bankAccountNo: `${Date.now()}${Math.floor(Math.random() * 100)}`, bankAccountName: 'TRUONG PN' })
        .expect(200);
      detail = await api().get(`/api/v1/parent/invoices/${invoiceId}`).set(bearer(parentToken)).expect(200);
      expect(detail.body.qr.qrPayload).toMatch(/^000201/);
      expect(detail.body.qr.amount).toBe(150_000);

      await api().post(`/api/v1/finance/invoices/${invoiceId}/payments`).set(staff()).send({ amount: 150_000 }).expect(201);
      const kinds = (await api().get('/api/v1/notifications').set(bearer(parentToken)).expect(200)).body.items.map((n: any) => n.kind);
      expect(kinds).toContain('INVOICE_ISSUED');
      expect(kinds).toContain('PAYMENT_RECEIVED');
      // Paid in full: no QR any more, and the other parent of HS2 saw nothing about it.
      expect((await api().get(`/api/v1/parent/invoices/${invoiceId}`).set(bearer(parentToken)).expect(200)).body.qr).toBeNull();
    });

    it('a health incident alerts the parent and the record is readable', async () => {
      await api()
        .post('/api/v1/health/incidents')
        .set(staff())
        .send({ studentId: s1, occurredAt: new Date().toISOString(), severity: 'MINOR', description: 'Trầy đầu gối', treatment: 'Băng bó' })
        .expect(201);
      const top = (await api().get('/api/v1/notifications').set(bearer(parentToken)).expect(200)).body.items[0];
      expect(top.kind).toBe('HEALTH_INCIDENT');
      expect(top.body).toContain('Băng bó');
      const record = await api().get(`/api/v1/parent/children/${s1}/health`).set(bearer(parentToken)).expect(200);
      expect(record.body.incidents).toHaveLength(1);
    });

    it('registers and cancels meals for the child', async () => {
      const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      await prisma.mealMenu.create({ data: { schoolId, date: new Date(`${day}T00:00:00Z`), mealType: 'LUNCH', dishes: ['Cơm gà'], price: 30_000 } });
      const reg = await api().post(`/api/v1/parent/children/${s1}/meals`).set(bearer(parentToken)).send({ mealType: 'LUNCH', dates: [day], action: 'REGISTER' }).expect(200);
      expect(reg.body.registered).toBe(1);
      const meals = await api().get(`/api/v1/parent/children/${s1}/meals`).set(bearer(parentToken)).query({ month: day.slice(0, 7) }).expect(200);
      expect(meals.body.registrations).toEqual([{ date: day, mealType: 'LUNCH' }]);
      expect(meals.body.menus.some((m: any) => m.date === day)).toBe(true);
      const cancel = await api().post(`/api/v1/parent/children/${s1}/meals`).set(bearer(parentToken)).send({ mealType: 'LUNCH', dates: [day], action: 'CANCEL' }).expect(200);
      expect(cancel.body.cancelled).toBe(1);
      await api().post(`/api/v1/parent/children/${s2}/meals`).set(bearer(parentToken)).send({ mealType: 'LUNCH', dates: [day], action: 'REGISTER' }).expect(404);
    });
  });

  describe('outbox and stream', () => {
    it('queues deliveries on enabled channels and the sandbox adapter sends them', async () => {
      await api().put('/api/v1/notifications/settings').set(staff()).send({ channels: ['SMS'] }).expect(403);
      const settings = await api().put('/api/v1/notifications/settings').set(admin()).send({ channels: ['SMS', 'EMAIL'] }).expect(200);
      expect(settings.body.channels).toEqual(['IN_APP', 'SMS', 'EMAIL']);

      await api().post('/api/v1/attendance/manual').set(staff()).send({ studentId: s1, direction: 'OUT' }).expect(201);
      const run1 = await api().post('/api/v1/notifications/deliveries/run').set(admin()).expect(200);
      // The parent has a phone but no email: SMS goes out, email fails without retry.
      expect(run1.body.sent).toBeGreaterThanOrEqual(1);
      expect(run1.body.failed).toBeGreaterThanOrEqual(1);
      const ok = await api().get('/api/v1/notifications/deliveries').set(admin()).query({ status: 'SUCCESS', channel: 'SMS' }).expect(200);
      expect(ok.body.items[0].externalRef).toMatch(/^mock-sms-/);
      expect(ok.body.items[0].notification.kind).toBe('GATE_OUT');
      const summary = await api().get('/api/v1/notifications/deliveries/summary').set(admin()).expect(200);
      expect(summary.body.providers.SMS).toBe('mock-sms');

      // A provider error keeps the delivery pending with backoff.
      await api().post('/api/v1/notifications/test').set(admin()).send({ title: 'Thử', body: 'xin chào [mock-fail]' }).expect(201);
      const run2 = await api().post('/api/v1/notifications/deliveries/run').set(admin()).expect(200);
      expect(run2.body.failed).toBeGreaterThanOrEqual(1);
      const pending = await api().get('/api/v1/notifications/deliveries').set(admin()).query({ status: 'PENDING', channel: 'EMAIL' }).expect(200);
      expect(pending.body.items[0].attempts).toBe(1);
      expect(pending.body.items[0].lastError).toContain('mock');
      // Not due yet, so a second run leaves it alone.
      expect((await api().post('/api/v1/notifications/deliveries/run').set(admin()).expect(200)).body.processed).toBe(0);
    });

    it('rejects unknown channels', async () => {
      await api().put('/api/v1/notifications/settings').set(admin()).send({ channels: ['FAX'] }).expect(400);
    });

    it('the SSE stream accepts the token as a query parameter; other routes do not', async () => {
      await api().get('/api/v1/notifications/unread-count').query({ access_token: parentToken }).expect(401);
      await api().get('/api/v1/notifications/stream').expect(401);

      const server: http.Server = app.getHttpServer();
      if (!server.listening) await new Promise<void>((resolve) => server.listen(0, resolve));
      const { port } = server.address() as AddressInfo;
      const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/v1/notifications/stream?access_token=${parentToken}`, resolve).on('error', reject);
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      // A new event is pushed to the open stream (after the initial keepalive bytes).
      const event = new Promise<string>((resolve, reject) => {
        let buffer = '';
        const timer = setTimeout(() => reject(new Error(`no event on stream, got: ${JSON.stringify(buffer)}`)), 10_000);
        res.on('data', (d) => {
          buffer += d.toString();
          if (buffer.includes('GATE_IN')) {
            clearTimeout(timer);
            resolve(buffer);
          }
        });
      });
      try {
        await api().post('/api/v1/attendance/manual').set(staff()).send({ studentId: s1, direction: 'IN', note: 'stream' }).expect(201);
        expect(await event).toContain('"kind":"GATE_IN"');
      } finally {
        res.destroy();
      }
    });
  });
});
