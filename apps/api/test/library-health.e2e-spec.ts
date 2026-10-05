import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, createApp, createSchool, prisma, runId } from './helpers';

// Library circulation and school health, against a real Postgres (DATABASE_URL).
describe('Library & health (e2e)', () => {
  let app: INestApplication;
  const run = runId().toUpperCase();
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let classId: string;
  let teacherId: string;
  const s: string[] = [];

  const api = () => request(app.getHttpServer());
  const staff = () => bearer(tokens.STAFF);
  const post = (path: string, body: object, auth = staff()) => api().post(`/api/v1${path}`).set(auth).send(body);
  const get = (path: string, auth = staff()) => api().get(`/api/v1${path}`).set(auth);
  const bc = (n: string) => `${run}-${n}`;

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `L${run}`);
    tokens = a.tokens;
    otherTokens = (await createSchool(app, `M${run}`)).tokens;
    const year = await prisma.academicYear.findFirstOrThrow({ where: { schoolId: a.school.id } });
    classId = (await prisma.class.create({ data: { schoolId: a.school.id, academicYearId: year.id, name: '6A1', gradeLevel: 6 } })).id;
    for (let i = 1; i <= 5; i++) {
      const st = await prisma.student.create({
        data: { schoolId: a.school.id, code: `HS${i}`, fullName: `Học sinh ${i}`, enrollments: { create: { classId, academicYearId: year.id } } },
      });
      s.push(st.id);
    }
    teacherId = (await prisma.teacher.create({ data: { schoolId: a.school.id, code: 'GV1', fullName: 'Cô Lan' } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let book1: string;
  let book2: string;

  it('builds the catalogue with copies', async () => {
    book1 = (await post('/library/books', { title: 'Dế Mèn phiêu lưu ký', author: 'Tô Hoài', category: 'Văn học' }).expect(201)).body.id;
    book2 = (await post('/library/books', { title: 'Toán vui', category: 'Khoa học' }).expect(201)).body.id;
    await post(`/library/books/${book1}/copies`, { barcodes: [bc('A1'), bc('A2')], shelf: 'Kệ A' }).expect(201);
    await post(`/library/books/${book2}/copies`, { barcodes: [bc('B1'), bc('B2'), bc('B3'), bc('B4')] }).expect(201);
    await post(`/library/books/${book2}/copies`, { barcodes: [bc('A1')] }).expect(409);
    await post('/library/books', { title: 'X' }, bearer(tokens.TEACHER)).expect(403);

    const list = await get('/library/books?q=dế mèn', bearer(tokens.TEACHER)).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].copies).toEqual({ total: 2, available: 2 });
    const copy = await get(`/library/copies/by-barcode/${bc('A1')}`, bearer(tokens.TEACHER)).expect(200);
    expect(copy.body.book.title).toBe('Dế Mèn phiêu lưu ký');
    expect(copy.body.loan).toBeNull();
  });

  it('lends by barcode once and enforces the student loan limit', async () => {
    const loan = await post('/library/loans', { barcode: bc('A1'), studentId: s[0] }).expect(201);
    expect(loan.body.copy.book.id).toBe(book1);
    expect(new Date(loan.body.dueAt).getTime() - new Date(loan.body.borrowedAt).getTime()).toBe(14 * 86_400_000);
    await post('/library/loans', { barcode: bc('A1'), studentId: s[1] }).expect(409);
    await post('/library/loans', { barcode: bc('A2'), studentId: s[1], teacherId }).expect(400);
    await post('/library/loans', { barcode: bc('A2'), studentId: s[1], days: 61 }).expect(400);

    for (const b of ['B1', 'B2', 'B3']) await post('/library/loans', { barcode: bc(b), studentId: s[1] }).expect(201);
    const res = await post('/library/loans', { barcode: bc('B4'), studentId: s[1] }).expect(400);
    expect(res.body.message).toMatch(/tối đa 3/);
    const detail = await get(`/library/books/${book1}`).expect(200);
    expect(detail.body.copies.find((c: any) => c.barcode === bc('A1')).loan.student.id).toBe(s[0]);
  });

  it('holds returned copies for the earliest reservation', async () => {
    await post('/library/reservations', { bookId: book1, studentId: s[2] }).expect(400); // A2 still on the shelf
    await post('/library/loans', { barcode: bc('A2'), teacherId }).expect(201);
    await post('/library/reservations', { bookId: book1, studentId: s[2] }).expect(201);
    await post('/library/reservations', { bookId: book1, studentId: s[2] }).expect(409);
    await post('/library/reservations', { bookId: book1, studentId: s[3] }).expect(201);

    const loans = await get(`/library/loans?status=active&studentId=${s[0]}`).expect(200);
    const renew = await post(`/library/loans/${loans.body.items[0].id}/renew`, {}).expect(400);
    expect(renew.body.message).toMatch(/đặt trước/);

    const ret = await post('/library/returns', { barcode: bc('A1') }).expect(200);
    expect(ret.body.overdueDays).toBe(0);
    expect(ret.body.loan.returnedAt).toBeTruthy();
    expect(ret.body.nextReservation.student).toMatchObject({ id: s[2], code: 'HS3' });
    await post('/library/returns', { barcode: bc('A1') }).expect(400);

    const blocked = await post('/library/loans', { barcode: bc('A1'), studentId: s[3] }).expect(400);
    expect(blocked.body.message).toBe('Sách đang được giữ cho học sinh khác');
    await post('/library/loans', { barcode: bc('A1'), teacherId }).expect(400);
    await post('/library/loans', { barcode: bc('A1'), studentId: s[2] }).expect(201);

    const res = await get(`/library/reservations?bookId=${book1}`).expect(200);
    expect(res.body.map((r: any) => [r.student.id, r.status])).toEqual([
      [s[2], 'FULFILLED'],
      [s[3], 'ACTIVE'],
    ]);
    const cancelled = await post(`/library/reservations/${res.body[1].id}/cancel`, {}).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('renews up to twice, extending from the current due date', async () => {
    const { body } = await get(`/library/loans?status=active&studentId=${s[1]}`).expect(200);
    expect(body.total).toBe(3);
    const loan = body.items[0];
    const first = await post(`/library/loans/${loan.id}/renew`, {}).expect(200);
    expect(new Date(first.body.dueAt).getTime() - new Date(loan.dueAt).getTime()).toBe(14 * 86_400_000);
    expect(first.body.renewCount).toBe(1);
    await post(`/library/loans/${loan.id}/renew`, {}).expect(200);
    const third = await post(`/library/loans/${loan.id}/renew`, {}).expect(400);
    expect(third.body.message).toMatch(/tối đa 2/);
  });

  it('lists overdue loans and blocks overdue borrowers', async () => {
    const loan = await post('/library/loans', { barcode: bc('B4'), studentId: s[4] }).expect(201);
    await prisma.loan.update({ where: { id: loan.body.id }, data: { dueAt: new Date(Date.now() - 3 * 86_400_000 + 60_000) } });

    const overdue = await get('/library/loans?status=overdue').expect(200);
    expect(overdue.body.items.map((l: any) => [l.id, l.overdueDays])).toEqual([[loan.body.id, 3]]);
    await post(`/library/loans/${loan.body.id}/renew`, {}).expect(400);

    const book3 = (await post('/library/books', { title: 'Truyện cổ tích' }).expect(201)).body.id;
    await post(`/library/books/${book3}/copies`, { barcodes: [bc('C1')] }).expect(201);
    const blocked = await post('/library/loans', { barcode: bc('C1'), studentId: s[4] }).expect(400);
    expect(blocked.body.message).toMatch(/quá hạn/);

    const stats = await get('/library/stats').expect(200);
    expect(stats.body).toEqual({ titles: 3, copies: 7, onLoan: 6, overdue: 1, activeReservations: 0 });

    const ret = await post('/library/returns', { barcode: bc('B4') }).expect(200);
    expect(ret.body.overdueDays).toBe(3);
    expect(ret.body.nextReservation).toBeNull();
    const returned = await get(`/library/loans?status=returned&q=${encodeURIComponent('Toán')}`).expect(200);
    expect(returned.body.items[0].overdueDays).toBe(3);
  });

  it('protects copies and books that are on loan', async () => {
    const copy = await get(`/library/copies/by-barcode/${bc('A1')}`).expect(200);
    expect(copy.body.loan.student.id).toBe(s[2]);
    await api().patch(`/api/v1/library/copies/${copy.body.id}`).set(staff()).send({ status: 'LOST' }).expect(400);
    const b4 = await get(`/library/copies/by-barcode/${bc('B4')}`).expect(200);
    await api().patch(`/api/v1/library/copies/${b4.body.id}`).set(staff()).send({ status: 'RETIRED', shelf: 'Kho' }).expect(200);
    await api().delete(`/api/v1/library/books/${book1}`).set(staff()).expect(409);
  });

  it('keeps schools isolated', async () => {
    const other = bearer(otherTokens.ADMIN);
    await get(`/library/books/${book1}`, other).expect(404);
    await get(`/library/copies/by-barcode/${bc('A2')}`, other).expect(404);
    await post('/library/returns', { barcode: bc('A2') }, other).expect(404);
    expect((await get('/library/books', other).expect(200)).body.total).toBe(0);
    await post('/library/reservations', { bookId: book1, studentId: s[0] }, other).expect(400);
    await get(`/health/students/${s[0]}`, other).expect(404);
    await api().put(`/api/v1/health/students/${s[0]}/profile`).set(other).send({ bloodType: 'A' }).expect(400);
  });

  it('restricts health records to the school office', async () => {
    const teacher = bearer(tokens.TEACHER);
    await get(`/health/students/${s[0]}`, teacher).expect(403);
    await get('/health/incidents', teacher).expect(403);
    await post('/health/checks', { studentId: s[0], checkedAt: '2026-10-05' }, teacher).expect(403);
  });

  it('upserts the health profile and computes BMI', async () => {
    const put = (body: object) => api().put(`/api/v1/health/students/${s[0]}/profile`).set(staff()).send(body);
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await put({ insuranceNumber: '12345' }).expect(400);
    await put({ bloodType: 'O+', allergies: 'Hải sản', insuranceNumber: 'hs4797923456789', insuranceExpiry: soon }).expect(200);
    const updated = await put({ bloodType: 'A+', insuranceNumber: 'HS4797923456789', insuranceExpiry: soon }).expect(200);
    expect(updated.body).toMatchObject({ bloodType: 'A+', allergies: null, insuranceNumber: 'HS4797923456789' });
    await api().put(`/api/v1/health/students/${s[1]}/profile`).set(staff()).send({ insuranceNumber: '0123456789', insuranceExpiry: '2030-01-01' }).expect(200);

    const check = await post('/health/checks', { studentId: s[0], checkedAt: '2026-10-01', heightCm: 140, weightKg: 35, visionLeft: '10/10', conclusion: 'Loại I' }).expect(201);
    expect(check.body.bmi).toBe(17.9);
    const patched = await api().patch(`/api/v1/health/checks/${check.body.id}`).set(staff()).send({ weightKg: 40 }).expect(200);
    expect(patched.body.bmi).toBe(20.4);
    const noBmi = await post('/health/checks', { studentId: s[1], checkedAt: '2026-10-02', heightCm: 150 }).expect(201);
    expect(noBmi.body.bmi).toBeNull();
    await post('/health/checks', { studentId: s[2], checkedAt: '2026-08-01', heightCm: 150, weightKg: 40 }).expect(201);

    const byClass = await get(`/health/checks?classId=${classId}&from=2026-09-01&to=2026-10-31`).expect(200);
    expect(byClass.body.total).toBe(2);
    expect(byClass.body.items[0].student.class.name).toBe('6A1');
    await api().delete(`/api/v1/health/checks/${noBmi.body.id}`).set(staff()).expect(200);

    const vac = await post('/health/vaccinations', { studentId: s[0], vaccine: 'Sởi - Rubella', givenAt: '2026-09-15' }).expect(201);
    expect(vac.body.dose).toBe(1);
    const vac2 = await post('/health/vaccinations', { studentId: s[0], vaccine: 'Uốn ván', dose: 2, givenAt: '2026-09-20' }).expect(201);
    await api().delete(`/api/v1/health/vaccinations/${vac2.body.id}`).set(staff()).expect(200);
  });

  it('records incidents and lists them newest first', async () => {
    const minor = await post('/health/incidents', {
      studentId: s[0],
      occurredAt: '2026-10-05T02:30:00.000Z',
      severity: 'MINOR',
      description: 'Trầy đầu gối khi ra chơi',
      treatment: 'Sát trùng',
    }).expect(201);
    expect(minor.body.recordedById).toBeTruthy();
    expect(minor.body.guardianNotified).toBe(false);
    await post('/health/incidents', { studentId: s[1], occurredAt: '2026-10-04T02:30:00.000Z', severity: 'SERIOUS', description: 'Sốt cao' }).expect(201);
    await post('/health/incidents', { studentId: s[1], occurredAt: '2026-10-04T02:30:00.000Z', severity: 'BAD', description: 'x' }).expect(400);

    const all = await get('/health/incidents?from=2026-10-01&to=2026-10-05').expect(200);
    expect(all.body.items.map((i: any) => i.severity)).toEqual(['MINOR', 'SERIOUS']);
    expect(all.body.items[0].student).toMatchObject({ code: 'HS1', class: { name: '6A1' } });
    const serious = await get('/health/incidents?severity=SERIOUS').expect(200);
    expect(serious.body.total).toBe(1);
    expect((await get('/health/incidents?to=2026-10-04').expect(200)).body.total).toBe(1);

    const edited = await api().patch(`/api/v1/health/incidents/${minor.body.id}`).set(staff()).send({ guardianNotified: true }).expect(200);
    expect(edited.body.guardianNotified).toBe(true);

    const record = await get(`/health/students/${s[0]}`).expect(200);
    expect(record.body.student).toMatchObject({ code: 'HS1', class: { id: classId, name: '6A1' } });
    expect(record.body.profile.bloodType).toBe('A+');
    expect(record.body.checks).toHaveLength(1);
    expect(record.body.vaccinations).toHaveLength(1);
    expect(record.body.incidents).toHaveLength(1);
  });

  it('lists students whose health insurance is missing or expiring', async () => {
    const { body } = await get('/health/insurance-expiring?days=30&pageSize=50').expect(200);
    const ids = body.items.map((r: any) => r.student.id);
    expect(ids).toContain(s[0]);
    expect(ids).toContain(s[2]); // no profile
    expect(ids).not.toContain(s[1]); // valid until 2030
    expect(body.items.find((r: any) => r.student.id === s[0]).daysLeft).toBeGreaterThanOrEqual(9);
    expect(body.total).toBe(4);
  });
});
