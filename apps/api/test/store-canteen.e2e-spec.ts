import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createApp, createSchool, prisma, runId } from './helpers';

// Store (cấp phát) and canteen (bán trú) against a real Postgres.
describe('Store & canteen (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let schoolId: string;
  let classId: string;
  let studentIds: string[];
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);

  // School-local dates that are certainly past / future relative to any cutoff.
  const vnDate = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + offsetDays * 86_400_000));
  const past = vnDate(-3);
  const future1 = vnDate(10);
  const future2 = vnDate(11);

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `SC${run}`);
    tokens = a.tokens;
    schoolId = a.school.id;
    otherTokens = (await createSchool(app, `SD${run}`)).tokens;

    const year = await prisma.academicYear.findFirstOrThrow({ where: { schoolId } });
    const klass = await prisma.class.create({ data: { schoolId, academicYearId: year.id, name: '6A', gradeLevel: 6 } });
    classId = klass.id;
    studentIds = [];
    for (const [i, name] of ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Châu'].entries()) {
      const s = await prisma.student.create({
        data: { schoolId, code: `HS${i + 1}`, fullName: name, enrollments: { create: { classId, academicYearId: year.id } } },
      });
      studentIds.push(s.id);
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('store', () => {
    let itemId: string;
    let item2Id: string;
    let orderId: string;

    it('manages items and forbids teachers', async () => {
      await api().get('/api/v1/store/items').set(bearer(tokens.TEACHER)).expect(403);
      const res = await api()
        .post('/api/v1/store/items')
        .set(staff())
        .send({ sku: 'AO-S', name: 'Áo đồng phục size S', category: 'UNIFORM', price: 120000 })
        .expect(201);
      itemId = res.body.id;
      expect(res.body).toMatchObject({ stockQty: 0, unit: 'cái' });
      await api().post('/api/v1/store/items').set(staff()).send({ sku: 'AO-S', name: 'Trùng', category: 'UNIFORM', price: 1 }).expect(409);
      item2Id = (
        await api().post('/api/v1/store/items').set(staff()).send({ sku: 'SGK-6', name: 'Bộ sách giáo khoa lớp 6', category: 'BOOK', unit: 'bộ', price: 250000 }).expect(201)
      ).body.id;
      await api().patch(`/api/v1/store/items/${item2Id}`).set(staff()).send({ price: 260000 }).expect(200);

      const list = await api().get('/api/v1/store/items').query({ q: 'sgk' }).set(staff()).expect(200);
      expect(list.body.items.map((i: any) => i.sku)).toEqual(['SGK-6']);
    });

    it('takes stock in and never lets an adjustment go negative', async () => {
      await api().post(`/api/v1/store/items/${itemId}/stock`).set(staff()).send({ type: 'IN', quantity: -1 }).expect(400);
      await api().post(`/api/v1/store/items/${itemId}/stock`).set(staff()).send({ type: 'ADJUST', quantity: 0 }).expect(400);
      const res = await api().post(`/api/v1/store/items/${itemId}/stock`).set(staff()).send({ type: 'IN', quantity: 10, unitCost: 90000 }).expect(200);
      expect(res.body.stockQty).toBe(10);
      await api().post(`/api/v1/store/items/${item2Id}/stock`).set(staff()).send({ type: 'IN', quantity: 1 }).expect(200);

      const neg = await api().post(`/api/v1/store/items/${itemId}/stock`).set(staff()).send({ type: 'ADJUST', quantity: -11 }).expect(400);
      expect(neg.body.message).toBe('Không đủ tồn kho');
      const adj = await api().post(`/api/v1/store/items/${itemId}/stock`).set(staff()).send({ type: 'ADJUST', quantity: -2, reason: 'Kiểm kê' }).expect(200);
      expect(adj.body.stockQty).toBe(8);

      const moves = await api().get(`/api/v1/store/items/${itemId}/movements`).set(staff()).expect(200);
      expect(moves.body.items.map((m: any) => m.quantity)).toEqual([-2, 10]);
      const jobs = await prisma.accountingSyncJob.findMany({ where: { schoolId, kind: 'STOCK_IN' } });
      expect(jobs).toHaveLength(2);

      const low = await api().get('/api/v1/store/items').query({ lowStock: 5 }).set(staff()).expect(200);
      expect(low.body.items.map((i: any) => i.sku)).toEqual(['SGK-6']);

      // Moved items cannot be deleted.
      await api().delete(`/api/v1/store/items/${itemId}`).set(staff()).expect(409);
    });

    it('creates an order with an invoice and issues it', async () => {
      await api()
        .post('/api/v1/store/orders')
        .set(staff())
        .send({ studentId: 'nope', lines: [{ itemId, quantity: 1 }] })
        .expect(400);
      const res = await api()
        .post('/api/v1/store/orders')
        .set(staff())
        .send({ studentId: studentIds[0], lines: [{ itemId, quantity: 2 }, { itemId: item2Id, quantity: 1 }, { itemId, quantity: 1 }] })
        .expect(201);
      orderId = res.body.id;
      expect(res.body.code).toMatch(/^DH[A-Z2-9]{8}$/);
      expect(res.body.total).toBe(3 * 120000 + 260000);
      expect(res.body.lines).toHaveLength(2);
      expect(res.body.invoice).toMatchObject({ status: 'UNPAID', total: res.body.total, paidAmount: 0 });
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: res.body.invoice.id }, include: { lines: true } });
      expect(invoice.source).toBe('STORE');
      expect(invoice.lines).toHaveLength(2);

      const issued = await api().post(`/api/v1/store/orders/${orderId}/issue`).set(staff()).expect(200);
      expect(issued.body.status).toBe('ISSUED');
      await api().post(`/api/v1/store/orders/${orderId}/issue`).set(staff()).expect(400);
      await api().post(`/api/v1/store/orders/${orderId}/cancel`).set(staff()).expect(400);

      const items = await prisma.inventoryItem.findMany({ where: { id: { in: [itemId, item2Id] } }, orderBy: { sku: 'asc' } });
      expect(items.map((i) => i.stockQty)).toEqual([5, 0]);
      const out = await prisma.stockMovement.findMany({ where: { orderId, type: 'OUT' } });
      expect(out.map((m) => m.quantity).sort()).toEqual([-1, -3]);
      const job = await prisma.accountingSyncJob.findUniqueOrThrow({ where: { kind_entityId: { kind: 'STOCK_OUT', entityId: orderId } } });
      expect(job.payload).toMatchObject({ voucherNo: issued.body.code, accountObjectCode: 'HS1' });

      const list = await api().get('/api/v1/store/orders').query({ q: 'Văn An', status: 'ISSUED' }).set(staff()).expect(200);
      expect(list.body.items.map((o: any) => o.id)).toEqual([orderId]);
    });

    it('refuses to issue without stock and applies cancel rules', async () => {
      const short = (await api().post('/api/v1/store/orders').set(staff()).send({ studentId: studentIds[1], lines: [{ itemId: item2Id, quantity: 1 }] }).expect(201)).body;
      const err = await api().post(`/api/v1/store/orders/${short.id}/issue`).set(staff()).expect(400);
      expect(err.body.message).toContain('Bộ sách giáo khoa lớp 6');
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: short.id } })).status).toBe('PENDING');

      // A paid order cannot be cancelled until the receipt is voided.
      await prisma.invoice.update({ where: { id: short.invoice.id }, data: { paidAmount: 100000, status: 'PARTIAL' } });
      const paid = await api().post(`/api/v1/store/orders/${short.id}/cancel`).set(staff()).expect(400);
      expect(paid.body.message).toBe('Đơn đã thu tiền, hãy hủy phiếu thu trước');
      await prisma.invoice.update({ where: { id: short.invoice.id }, data: { paidAmount: 0, status: 'UNPAID' } });

      const cancelled = await api().post(`/api/v1/store/orders/${short.id}/cancel`).set(staff()).expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
      expect(cancelled.body.invoice.status).toBe('CANCELLED');
    });

    it('keeps schools isolated', async () => {
      const other = bearer(otherTokens.ADMIN);
      await api().get(`/api/v1/store/orders/${orderId}`).set(other).expect(404);
      await api().patch(`/api/v1/store/items/${itemId}`).set(other).send({ price: 1 }).expect(404);
      await api().post(`/api/v1/store/items/${itemId}/stock`).set(other).send({ type: 'IN', quantity: 1 }).expect(404);
      await api().post('/api/v1/store/orders').set(other).send({ studentId: studentIds[0], lines: [{ itemId, quantity: 1 }] }).expect(400);
      expect((await api().get('/api/v1/store/items').set(other).expect(200)).body.total).toBe(0);
    });
  });

  describe('canteen', () => {
    it('manages menus (staff only)', async () => {
      await api().put('/api/v1/canteen/menus').set(bearer(tokens.TEACHER)).send({ date: future1, mealType: 'LUNCH', dishes: ['Cơm'], price: 30000 }).expect(403);
      for (const date of [past, future1, future2]) {
        await api()
          .put('/api/v1/canteen/menus')
          .set(staff())
          .send({ date, mealType: 'LUNCH', dishes: ['Cơm', 'Thịt kho trứng'], price: 25000 })
          .expect(200);
      }
      // Upsert: same day and meal updates the price.
      const res = await api().put('/api/v1/canteen/menus').set(staff()).send({ date: future2, mealType: 'LUNCH', dishes: ['Cơm', 'Cá kho'], price: 35000, cutoff: '09:00' }).expect(200);
      expect(res.body).toMatchObject({ date: future2, price: 35000, cutoff: '09:00' });
      const list = await api().get('/api/v1/canteen/menus').query({ from: past, to: future2 }).set(bearer(tokens.TEACHER)).expect(200);
      expect(list.body).toHaveLength(3);
    });

    it('registers a class and enforces the cutoff', async () => {
      const teacher = bearer(tokens.TEACHER);
      const missing = await api()
        .post('/api/v1/canteen/registrations')
        .set(teacher)
        .send({ mealType: 'BREAKFAST', dates: [future1], classId, action: 'REGISTER' })
        .expect(400);
      expect(missing.body.message).toContain(future1);
      await api().post('/api/v1/canteen/registrations').set(teacher).send({ mealType: 'LUNCH', dates: [future1], action: 'REGISTER' }).expect(400);

      const reg = await api()
        .post('/api/v1/canteen/registrations')
        .set(teacher)
        .send({ mealType: 'LUNCH', dates: [future1, future2], classId, action: 'REGISTER' })
        .expect(200);
      expect(reg.body).toEqual({ registered: 6, cancelled: 0, skipped: 0 });

      const cancel = await api()
        .post('/api/v1/canteen/registrations')
        .set(teacher)
        .send({ mealType: 'LUNCH', dates: [future2], studentIds: [studentIds[2]], action: 'CANCEL' })
        .expect(200);
      expect(cancel.body).toEqual({ registered: 0, cancelled: 1, skipped: 0 });

      const locked = await api()
        .post('/api/v1/canteen/registrations')
        .set(staff())
        .send({ mealType: 'LUNCH', dates: [past], classId, action: 'REGISTER' })
        .expect(400);
      expect(locked.body.message).toContain(past);
      const late = await api()
        .post('/api/v1/canteen/registrations')
        .set(admin())
        .send({ mealType: 'LUNCH', dates: [past], studentIds: studentIds.slice(0, 2), action: 'REGISTER' })
        .expect(200);
      expect(late.body.registered).toBe(2);

      // Re-registering is idempotent and revives cancelled rows.
      const again = await api()
        .post('/api/v1/canteen/registrations')
        .set(teacher)
        .send({ mealType: 'LUNCH', dates: [future2], classId, action: 'REGISTER' })
        .expect(200);
      expect(again.body).toEqual({ registered: 1, cancelled: 0, skipped: 2 });
      await api()
        .post('/api/v1/canteen/registrations')
        .set(teacher)
        .send({ mealType: 'LUNCH', dates: [future2], studentIds: [studentIds[2]], action: 'CANCEL' })
        .expect(200);

      // Menus with active registrations cannot be deleted.
      const menu = await prisma.mealMenu.findFirstOrThrow({ where: { schoolId, mealType: 'LUNCH', date: new Date(future1) } });
      await api().delete(`/api/v1/canteen/menus/${menu.id}`).set(staff()).expect(409);
    });

    it('reports daily counts and monthly cost', async () => {
      const daily = await api().get('/api/v1/canteen/daily').query({ date: future2, mealType: 'LUNCH' }).set(staff()).expect(200);
      expect(daily.body.total).toBe(2);
      expect(daily.body.byClass).toEqual([{ classId, className: '6A', count: 2 }]);
      expect(daily.body.students.map((s: any) => s.code).sort()).toEqual(['HS1', 'HS2']);
      expect(daily.body.menu.price).toBe(35000);

      const month = past.slice(0, 7);
      const monthly = await api().get('/api/v1/canteen/monthly').query({ month, classId }).set(staff()).expect(200);
      // Expected meals and cost for the dates that fall in this month.
      const meals: Record<string, { meals: number; cost: number }> = { HS1: { meals: 0, cost: 0 }, HS2: { meals: 0, cost: 0 }, HS3: { meals: 0, cost: 0 } };
      const add = (code: string, date: string, price: number) => {
        if (date.startsWith(month)) {
          meals[code].meals++;
          meals[code].cost += price;
        }
      };
      for (const code of ['HS1', 'HS2']) {
        add(code, past, 25000);
        add(code, future1, 25000);
        add(code, future2, 35000);
      }
      add('HS3', future1, 25000);
      const expected = Object.entries(meals)
        .filter(([, v]) => v.meals)
        .map(([code, v]) => ({ code, ...v }));
      const got = monthly.body.items.map((i: any) => ({ code: i.code, meals: i.meals, cost: i.cost }));
      expect(got.sort((a: any, b: any) => a.code.localeCompare(b.code))).toEqual(expected);
      expect(monthly.body.totals.cost).toBe(expected.reduce((s, e) => s + e.cost, 0));

      // Other schools see nothing.
      const other = await api().get('/api/v1/canteen/daily').query({ date: future2, mealType: 'LUNCH' }).set(bearer(otherTokens.ADMIN)).expect(200);
      expect(other.body.total).toBe(0);
      await api()
        .post('/api/v1/canteen/registrations')
        .set(bearer(otherTokens.ADMIN))
        .send({ mealType: 'LUNCH', dates: [future1], classId, action: 'REGISTER' })
        .expect(400);
    });
  });
});
