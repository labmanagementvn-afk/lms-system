import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bookValue } from '../src/assets/depreciation';
import { bearer, createApp, createSchool, prisma, runId } from './helpers';

// HR (nhân sự) and assets (tài sản) against a real Postgres.
describe('HR & assets (e2e)', () => {
  let app: INestApplication;
  let tokens: Awaited<ReturnType<typeof createSchool>>['tokens'];
  let otherTokens: typeof tokens;
  let schoolId: string;
  let teacherId: string;
  let teacherUserId: string;
  // Shared across the hr and assets blocks.
  let employeeId: string;
  let teacherEmployeeId: string;
  let docId: string;
  let leaveId: string;
  const run = runId();
  const api = () => request(app.getHttpServer());
  const admin = () => bearer(tokens.ADMIN);
  const staff = () => bearer(tokens.STAFF);
  const teacher = () => bearer(tokens.TEACHER);

  // School-local calendar dates, which is what daysLeft and book values are computed against.
  const vnDate = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + offsetDays * 86_400_000));

  beforeAll(async () => {
    app = await createApp();
    const code = `HR${run}`;
    const a = await createSchool(app, code);
    tokens = a.tokens;
    schoolId = a.school.id;
    otherTokens = (await createSchool(app, `HS${run}`)).tokens;

    // The TEACHER login gets a Teacher record so from-teachers can pick it up.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `TEACHER-${code}@test.vn`.toLowerCase() } });
    teacherUserId = user.id;
    teacherId = (await prisma.teacher.create({ data: { schoolId, code: 'GV01', fullName: 'Lê Thu Hà', gender: 'FEMALE', email: user.email, userId: user.id } })).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('hr', () => {
    let contractId: string;

    it('creates employees and forbids teachers', async () => {
      await api().get('/api/v1/hr/employees').set(teacher()).expect(403);
      await api().get('/api/v1/hr/summary').set(teacher()).expect(403);

      const res = await api()
        .post('/api/v1/hr/employees')
        .set(staff())
        .send({ fullName: 'Phạm Thị Thu', position: 'Kế toán', department: 'Hành chính', gender: 'FEMALE', dateOfBirth: '1988-03-12', phone: '+84 90 123 4567', hireDate: '2019-01-02' })
        .expect(201);
      employeeId = res.body.id;
      expect(res.body).toMatchObject({ code: 'NV001', phone: '0901234567', status: 'ACTIVE', employmentType: 'FULL_TIME', teacher: null, user: null });
      expect(res.body.dateOfBirth).toBe('1988-03-12T00:00:00.000Z');

      const second = await api().post('/api/v1/hr/employees').set(staff()).send({ fullName: 'Ngô Văn Sơn', position: 'Bảo vệ', department: 'Hành chính' }).expect(201);
      expect(second.body.code).toBe('NV002');
      await api().post('/api/v1/hr/employees').set(staff()).send({ code: 'NV001', fullName: 'Trùng', position: 'X' }).expect(409);
      await api().post('/api/v1/hr/employees').set(staff()).send({ fullName: 'A', position: 'B', salary: 1 }).expect(400);

      const patched = await api().patch(`/api/v1/hr/employees/${employeeId}`).set(staff()).send({ address: 'Hà Nội', employmentType: 'CONTRACT' }).expect(200);
      expect(patched.body).toMatchObject({ address: 'Hà Nội', employmentType: 'CONTRACT' });

      const list = await api().get('/api/v1/hr/employees').query({ q: 'thu' }).set(admin()).expect(200);
      expect(list.body.items.map((e: any) => e.code)).toEqual(['NV001']);
      const dept = await api().get('/api/v1/hr/employees').query({ department: 'Hành chính' }).set(admin()).expect(200);
      expect(dept.body.total).toBe(2);
    });

    it('creates employees from teachers and shares their login', async () => {
      const res = await api().post('/api/v1/hr/employees/from-teachers').set(admin()).expect(201);
      expect(res.body).toEqual({ created: 1 });
      expect((await api().post('/api/v1/hr/employees/from-teachers').set(admin()).expect(201)).body).toEqual({ created: 0 });

      const list = await api().get('/api/v1/hr/employees').query({ department: 'Giáo viên' }).set(staff()).expect(200);
      expect(list.body.items).toHaveLength(1);
      teacherEmployeeId = list.body.items[0].id;
      expect(list.body.items[0]).toMatchObject({
        code: 'GV01',
        fullName: 'Lê Thu Hà',
        gender: 'FEMALE',
        position: 'Giáo viên',
        teacherId,
        userId: teacherUserId,
        teacher: { code: 'GV01' },
        user: { role: 'TEACHER' },
      });
      // The teacher is already linked, so a second record cannot claim it.
      const dup = await api().post('/api/v1/hr/employees').set(staff()).send({ fullName: 'X', position: 'Y', teacherId }).expect(400);
      expect(dup.body.message).toBe('Giáo viên đã có hồ sơ nhân sự');
    });

    it('keeps documents, contracts and work history and lists what expires', async () => {
      const doc = await api()
        .post(`/api/v1/hr/employees/${employeeId}/documents`)
        .set(staff())
        .send({ kind: 'CERTIFICATE', name: 'Chứng chỉ kế toán trưởng', issuer: 'Bộ Tài chính', issuedAt: '2020-01-15', expiresAt: vnDate(20) })
        .expect(201);
      docId = doc.body.id;
      await api().post(`/api/v1/hr/employees/${employeeId}/documents`).set(staff()).send({ kind: 'DEGREE', name: 'Bằng cử nhân Kế toán' }).expect(201);
      await api().patch(`/api/v1/hr/documents/${docId}`).set(staff()).send({ issuer: 'Bộ Tài chính (cấp lại)' }).expect(200);

      const contract = await api()
        .post(`/api/v1/hr/employees/${employeeId}/contracts`)
        .set(staff())
        .send({ type: 'CONTRACT', startDate: '2025-01-02', endDate: vnDate(-10), salary: 12000000 })
        .expect(201);
      contractId = contract.body.id;
      await api().post(`/api/v1/hr/employees/${employeeId}/contracts`).set(staff()).send({ type: 'CONTRACT', startDate: '2026-01-02', endDate: '2025-01-01' }).expect(400);
      await api()
        .post(`/api/v1/hr/employees/${employeeId}/history`)
        .set(staff())
        .send({ fromDate: '2015-07-01', toDate: '2018-12-31', organization: 'Công ty CP Kế toán AAC', position: 'Kế toán viên' })
        .expect(201);

      const detail = await api().get(`/api/v1/hr/employees/${employeeId}`).set(admin()).expect(200);
      expect(detail.body.documents).toHaveLength(2);
      expect(detail.body.documents.find((d: any) => d.id === docId)).toMatchObject({ issuer: 'Bộ Tài chính (cấp lại)', daysLeft: 20 });
      expect(detail.body.contracts).toEqual([expect.objectContaining({ id: contractId, salary: 12000000, daysLeft: -10 })]);
      expect(detail.body.workHistory).toEqual([expect.objectContaining({ organization: 'Công ty CP Kế toán AAC' })]);

      const expiring = await api().get('/api/v1/hr/expiring').query({ days: 30 }).set(staff()).expect(200);
      expect(expiring.body.documents).toEqual([expect.objectContaining({ id: docId, daysLeft: 20, employee: expect.objectContaining({ code: 'NV001' }) })]);
      expect(expiring.body.contracts).toEqual([expect.objectContaining({ id: contractId, daysLeft: -10 })]);
      const tight = await api().get('/api/v1/hr/expiring').query({ days: 10 }).set(staff()).expect(200);
      expect(tight.body.documents).toHaveLength(0);
      expect(tight.body.contracts).toHaveLength(1);

      const summary = await api().get('/api/v1/hr/summary').set(admin()).expect(200);
      expect(summary.body).toMatchObject({ headcount: 3, byStatus: { ACTIVE: 3, RESIGNED: 0 }, pendingLeave: 0, expiring: { documents: 1, contracts: 1, total: 2 } });
      expect(summary.body.byDepartment).toEqual([
        { department: 'Hành chính', count: 2 },
        { department: 'Giáo viên', count: 1 },
      ]);

      // A renewal supersedes the expired contract; deleting it brings the alert back.
      const renewal = await api().post(`/api/v1/hr/employees/${employeeId}/contracts`).set(staff()).send({ type: 'FULL_TIME', startDate: vnDate(-9) }).expect(201);
      expect((await api().get('/api/v1/hr/expiring').set(staff()).expect(200)).body.contracts).toHaveLength(0);
      await api().delete(`/api/v1/hr/contracts/${renewal.body.id}`).set(staff()).expect(200);
      expect((await api().get('/api/v1/hr/expiring').set(staff()).expect(200)).body.contracts).toHaveLength(1);
      await api().delete('/api/v1/hr/documents/nope').set(staff()).expect(404);
    });

    it('handles leave requests: working days, overlap, decision and notification', async () => {
      // 2027-03-01 is a Monday.
      const body = { employeeId: teacherEmployeeId, type: 'ANNUAL', fromDate: '2027-03-01', toDate: '2027-03-05', reason: 'Việc gia đình' };
      await api().post('/api/v1/hr/leave').set(staff()).send({ ...body, fromDate: '2027-03-06', toDate: '2027-03-07' }).expect(400);
      await api().post('/api/v1/hr/leave').set(staff()).send({ ...body, toDate: '2027-02-26' }).expect(400);

      const leave = await api().post('/api/v1/hr/leave').set(staff()).send(body).expect(201);
      leaveId = leave.body.id;
      expect(leave.body).toMatchObject({ status: 'PENDING', days: 5, decidedBy: null, employee: { code: 'GV01' } });

      const clash = await api().post('/api/v1/hr/leave').set(staff()).send({ ...body, type: 'SICK', fromDate: '2027-03-05', toDate: '2027-03-09' }).expect(400);
      expect(clash.body.message).toContain('Trùng với đơn nghỉ 01/03/2027 - 05/03/2027');
      // Another employee may take the same days.
      await api().post('/api/v1/hr/leave').set(staff()).send({ ...body, employeeId, reason: 'Nghỉ phép năm' }).expect(201);

      const pending = await api().get('/api/v1/hr/leave').query({ status: 'PENDING' }).set(admin()).expect(200);
      expect(pending.body.total).toBe(2);
      expect((await api().get('/api/v1/hr/leave').query({ employeeId: teacherEmployeeId }).set(admin()).expect(200)).body.total).toBe(1);
      expect((await api().get('/api/v1/hr/summary').set(admin()).expect(200)).body.pendingLeave).toBe(2);

      const decided = await api().post(`/api/v1/hr/leave/${leaveId}/decide`).set(admin()).send({ status: 'APPROVED', note: 'Đồng ý' }).expect(200);
      expect(decided.body).toMatchObject({ status: 'APPROVED', decisionNote: 'Đồng ý', decidedBy: { fullName: 'ADMIN' } });
      expect(decided.body.decidedAt).toBeTruthy();
      await api().post(`/api/v1/hr/leave/${leaveId}/decide`).set(admin()).send({ status: 'REJECTED' }).expect(400);
      await api().post(`/api/v1/hr/leave/${leaveId}/decide`).set(admin()).send({ status: 'PENDING' }).expect(400);

      const notifications = await api().get('/api/v1/notifications').set(teacher()).expect(200);
      const note = notifications.body.items.find((n: any) => n.kind === 'LEAVE_DECIDED');
      expect(note).toMatchObject({ title: 'Đơn nghỉ phép đã được duyệt', data: { leaveRequestId: leaveId, status: 'APPROVED' } });
      expect(note.body).toContain('01/03/2027');
      expect(note.body).toContain('Đồng ý');

      // An approved leave keeps blocking overlapping requests.
      await api().post('/api/v1/hr/leave').set(staff()).send({ ...body, type: 'UNPAID', fromDate: '2027-03-04', toDate: '2027-03-04' }).expect(400);
    });

    it('lets a teacher see their own record and request leave', async () => {
      const me = await api().get('/api/v1/hr/me').set(teacher()).expect(200);
      expect(me.body).toMatchObject({ id: teacherEmployeeId, code: 'GV01', teacher: { code: 'GV01' } });
      expect(me.body.leaves).toHaveLength(1);

      const none = await api().get('/api/v1/hr/me').set(staff()).expect(404);
      expect(none.body.message).toBe('Chưa có hồ sơ nhân sự');
      await api().post('/api/v1/hr/me/leave').set(staff()).send({ type: 'SICK', fromDate: '2027-04-05', toDate: '2027-04-06', reason: 'Ốm' }).expect(404);

      // 2027-04-05 is a Monday.
      const mine = await api().post('/api/v1/hr/me/leave').set(teacher()).send({ type: 'SICK', fromDate: '2027-04-05', toDate: '2027-04-06', reason: 'Khám bệnh' }).expect(201);
      expect(mine.body).toMatchObject({ employeeId: teacherEmployeeId, days: 2, status: 'PENDING' });
      // employeeId is not accepted on the self-service route.
      await api().post('/api/v1/hr/me/leave').set(teacher()).send({ employeeId, type: 'SICK', fromDate: '2027-04-07', toDate: '2027-04-07', reason: 'x' }).expect(400);

      const list = await api().get('/api/v1/hr/me/leave').set(teacher()).expect(200);
      expect(list.body.items.map((l: any) => l.status)).toEqual(['PENDING', 'APPROVED']);
      await api().get('/api/v1/hr/leave').set(teacher()).expect(403);
      await api().post(`/api/v1/hr/leave/${mine.body.id}/decide`).set(teacher()).send({ status: 'APPROVED' }).expect(403);
    });
  });

  describe('assets', () => {
    let categoryId: string;
    let supplierId: string;
    let assetId: string;
    let asset2Id: string;
    let loanId: string;
    let auditId: string;

    it('manages categories and suppliers', async () => {
      await api().get('/api/v1/assets/categories').set(teacher()).expect(403);
      const cat = await api().post('/api/v1/assets/categories').set(staff()).send({ name: 'Máy tính', usefulLifeYears: 4 }).expect(201);
      categoryId = cat.body.id;
      await api().post('/api/v1/assets/categories').set(staff()).send({ name: 'Máy tính' }).expect(409);
      const furniture = await api().post('/api/v1/assets/categories').set(staff()).send({ name: 'Bàn ghế' }).expect(201);
      expect(furniture.body.usefulLifeYears).toBe(5);
      await api().patch(`/api/v1/assets/categories/${furniture.body.id}`).set(staff()).send({ usefulLifeYears: 8 }).expect(200);
      await api().delete(`/api/v1/assets/categories/${furniture.body.id}`).set(staff()).expect(200);
      expect((await api().get('/api/v1/assets/categories').set(staff()).expect(200)).body).toEqual([expect.objectContaining({ name: 'Máy tính', _count: { assets: 0 } })]);

      const supplier = await api().post('/api/v1/assets/suppliers').set(staff()).send({ name: 'Công ty CP Máy tính Hà Nội', phone: '02438123456', taxCode: '0101234567' }).expect(201);
      supplierId = supplier.body.id;
      await api().post('/api/v1/assets/suppliers').set(staff()).send({ name: 'Công ty CP Máy tính Hà Nội' }).expect(409);
      expect((await api().get('/api/v1/assets/suppliers').set(staff()).expect(200)).body).toHaveLength(1);
    });

    it('creates assets with auto codes, book values and a depreciation schedule', async () => {
      const res = await api()
        .post('/api/v1/assets')
        .set(staff())
        .send({ name: 'Máy tính xách tay Dell', categoryId, supplierId, serialNumber: 'DL-001', purchaseDate: '2024-03-15', purchasePrice: 12000000, location: 'Phòng Tin học', custodianEmployeeId: employeeId })
        .expect(201);
      assetId = res.body.id;
      expect(res.body).toMatchObject({ code: 'TS00001', status: 'IN_USE', usefulLifeYears: 4, depreciationYears: 4, category: { name: 'Máy tính' }, supplier: { id: supplierId }, custodian: { code: 'NV001' } });
      expect(res.body.bookValue).toBe(bookValue(12000000, '2024-03-15', 4, vnDate(0)));

      const second = await api().post('/api/v1/assets').set(staff()).send({ name: 'Máy chiếu Epson', categoryId, purchaseDate: '2025-01-01', purchasePrice: 9000000, usefulLifeYears: 3 }).expect(201);
      asset2Id = second.body.id;
      expect(second.body.code).toBe('TS00002');
      await api().post('/api/v1/assets').set(staff()).send({ name: 'Trùng', categoryId, code: 'TS00001' }).expect(409);
      await api().post('/api/v1/assets').set(staff()).send({ name: 'Sai danh mục', categoryId: 'nope' }).expect(400);
      await api().post('/api/v1/assets').set(staff()).send({ name: 'Sai trạng thái', categoryId, status: 'LENT' }).expect(400);
      await api().post('/api/v1/assets').set(staff()).send({ name: 'Sai người giữ', categoryId, custodianEmployeeId: 'nope' }).expect(400);
      await api().delete(`/api/v1/assets/categories/${categoryId}`).set(staff()).expect(409);

      const detail = await api().get(`/api/v1/assets/${assetId}`).set(admin()).expect(200);
      expect(detail.body.schedule[0]).toEqual({ year: 2024, depreciation: 2250000, bookValueEnd: 9750000 });
      expect(detail.body.schedule.reduce((sum: number, r: any) => sum + r.depreciation, 0)).toBe(12000000);
      expect(detail.body).toMatchObject({ openLoan: null, maintenance: [], loans: [], auditItems: [] });

      const expectedBook = bookValue(12000000, '2024-03-15', 4, vnDate(0)) + bookValue(9000000, '2025-01-01', 3, vnDate(0));
      const summary = await api().get('/api/v1/assets/summary').set(staff()).expect(200);
      expect(summary.body).toMatchObject({ total: 2, byStatus: { IN_USE: 2, DISPOSED: 0 }, totalPurchaseValue: 21000000, totalBookValue: expectedBook });
      expect(summary.body.byCategory).toEqual([{ id: categoryId, name: 'Máy tính', usefulLifeYears: 4, count: 2, purchaseValue: 21000000, bookValue: expectedBook }]);

      const list = await api().get('/api/v1/assets').query({ q: 'dell', status: 'IN_USE' }).set(staff()).expect(200);
      expect(list.body.items.map((a: any) => a.code)).toEqual(['TS00001']);
      const patched = await api().patch(`/api/v1/assets/${asset2Id}`).set(staff()).send({ location: 'Phòng 6A1', status: 'IN_STORAGE' }).expect(200);
      expect(patched.body).toMatchObject({ location: 'Phòng 6A1', status: 'IN_STORAGE' });
      expect((await api().get('/api/v1/assets').query({ location: '6a1' }).set(staff()).expect(200)).body.total).toBe(1);
    });

    it('lends and returns assets', async () => {
      await api().post(`/api/v1/assets/${assetId}/loans`).set(staff()).send({ dueAt: '2026-12-01' }).expect(400);
      const loan = await api().post(`/api/v1/assets/${assetId}/loans`).set(staff()).send({ borrowerEmployeeId: teacherEmployeeId, dueAt: '2026-12-01', note: 'Dạy thử' }).expect(201);
      loanId = loan.body.id;
      expect(loan.body).toMatchObject({ borrowerName: 'Lê Thu Hà', department: 'Giáo viên', returnedAt: null, asset: { code: 'TS00001', status: 'LENT' }, borrower: { id: teacherEmployeeId } });

      const again = await api().post(`/api/v1/assets/${assetId}/loans`).set(staff()).send({ borrowerName: 'Khách', dueAt: '2026-12-01' }).expect(400);
      expect(again.body.message).toBe('Tài sản đang cho mượn');
      await api().post(`/api/v1/assets/${assetId}/dispose`).set(staff()).send({}).expect(400);
      await api().patch(`/api/v1/assets/${assetId}`).set(staff()).send({ status: 'IN_STORAGE' }).expect(400);

      const open = await api().get('/api/v1/assets/loans').query({ open: true }).set(staff()).expect(200);
      expect(open.body.items.map((l: any) => l.id)).toEqual([loanId]);
      expect((await api().get(`/api/v1/assets/${assetId}`).set(staff()).expect(200)).body.openLoan.id).toBe(loanId);

      const returned = await api().post(`/api/v1/assets/loans/${loanId}/return`).set(staff()).expect(200);
      expect(returned.body.returnedAt).toBeTruthy();
      expect(returned.body.asset.status).toBe('IN_USE');
      await api().post(`/api/v1/assets/loans/${loanId}/return`).set(staff()).expect(400);
      expect((await api().get('/api/v1/assets/loans').query({ open: true }).set(staff()).expect(200)).body.total).toBe(0);
      expect((await api().get('/api/v1/assets/loans').set(staff()).expect(200)).body.total).toBe(1);
    });

    it('tracks maintenance', async () => {
      const row = await api()
        .post(`/api/v1/assets/${assetId}/maintenance`)
        .set(staff())
        .send({ date: '2026-10-01', description: 'Thay pin', cost: 1500000, vendor: 'Dell Việt Nam', inProgress: true })
        .expect(201);
      expect(row.body).toMatchObject({ assetId, cost: 1500000 });
      expect((await api().get(`/api/v1/assets/${assetId}`).set(staff()).expect(200)).body.status).toBe('UNDER_MAINTENANCE');
      const done = await api().post(`/api/v1/assets/maintenance/${row.body.id}/complete`).set(staff()).expect(200);
      expect(done.body.status).toBe('IN_USE');
      expect(done.body.maintenance).toHaveLength(1);
      await api().post('/api/v1/assets/maintenance/nope/complete').set(staff()).expect(404);
    });

    it('runs a stocktake', async () => {
      const audit = await api().post('/api/v1/assets/audits').set(staff()).send({ name: 'Kiểm kê cuối năm', date: vnDate(0) }).expect(201);
      auditId = audit.body.id;
      expect(audit.body.status).toBe('OPEN');
      expect(audit.body.items).toHaveLength(2);
      expect(audit.body.items.every((i: any) => i.found === null)).toBe(true);
      expect(audit.body.counts).toEqual({ total: 2, found: 0, missing: 0, unchecked: 2 });

      await api().put(`/api/v1/assets/audits/${auditId}/items/${assetId}`).set(staff()).send({ found: true, condition: 'Tốt' }).expect(200);
      await api().put(`/api/v1/assets/audits/${auditId}/items/${asset2Id}`).set(staff()).send({ found: false, note: 'Không thấy trong phòng' }).expect(200);
      const again = await api().put(`/api/v1/assets/audits/${auditId}/items/${assetId}`).set(staff()).send({ found: true, condition: 'Trầy xước nhẹ' }).expect(200);
      expect(again.body).toMatchObject({ found: true, condition: 'Trầy xước nhẹ', asset: { code: 'TS00001' } });
      await api().put(`/api/v1/assets/audits/${auditId}/items/nope`).set(staff()).send({ found: true }).expect(404);

      const detail = await api().get(`/api/v1/assets/audits/${auditId}`).set(admin()).expect(200);
      expect(detail.body.counts).toEqual({ total: 2, found: 1, missing: 1, unchecked: 0 });
      expect(detail.body.items.find((i: any) => i.assetId === asset2Id)).toMatchObject({ found: false, note: 'Không thấy trong phòng', asset: { code: 'TS00002' } });
      const list = await api().get('/api/v1/assets/audits').set(staff()).expect(200);
      expect(list.body.items).toEqual([expect.objectContaining({ id: auditId, checked: 2, found: 1, missing: 1 })]);

      // An asset bought after the audit opened is out of its scope.
      await api().post('/api/v1/assets').set(staff()).send({ name: 'Mua sau kiểm kê', categoryId }).expect(201);
      expect((await api().get(`/api/v1/assets/audits/${auditId}`).set(staff()).expect(200)).body.counts.total).toBe(2);

      const report = await api().post(`/api/v1/assets/audits/${auditId}/close`).set(admin()).expect(200);
      expect(report.body).toMatchObject({ id: auditId, status: 'CLOSED', total: 2, found: 1, unchecked: 0 });
      expect(report.body.missing.map((m: any) => m.asset.code)).toEqual(['TS00002']);
      await api().post(`/api/v1/assets/audits/${auditId}/close`).set(admin()).expect(400);
      await api().put(`/api/v1/assets/audits/${auditId}/items/${assetId}`).set(staff()).send({ found: false }).expect(400);
    });

    it('disposes assets and keeps schools apart', async () => {
      const res = await api().post(`/api/v1/assets/${asset2Id}/dispose`).set(staff()).send({ note: 'Hỏng không sửa được' }).expect(200);
      expect(res.body.status).toBe('DISPOSED');
      expect(res.body.disposedAt.slice(0, 10)).toBe(vnDate(0));
      expect(res.body.notes).toContain('Hỏng không sửa được');
      await api().post(`/api/v1/assets/${asset2Id}/dispose`).set(staff()).expect(400);
      await api().patch(`/api/v1/assets/${asset2Id}`).set(staff()).send({ name: 'x' }).expect(400);
      await api().post(`/api/v1/assets/${asset2Id}/loans`).set(staff()).send({ borrowerName: 'A', dueAt: '2026-12-01' }).expect(400);

      const summary = await api().get('/api/v1/assets/summary').set(staff()).expect(200);
      expect(summary.body).toMatchObject({ total: 2, byStatus: { DISPOSED: 1, IN_USE: 2 } });
      // A disposed asset stays on the closed audit it was counted in.
      expect((await api().get(`/api/v1/assets/audits/${auditId}`).set(staff()).expect(200)).body.counts).toEqual({ total: 2, found: 1, missing: 1, unchecked: 0 });

      const other = bearer(otherTokens.ADMIN);
      await api().get(`/api/v1/hr/employees/${employeeId}`).set(other).expect(404);
      await api().patch(`/api/v1/hr/documents/${docId}`).set(other).send({ name: 'x' }).expect(404);
      await api().post(`/api/v1/hr/leave/${leaveId}/decide`).set(other).send({ status: 'APPROVED' }).expect(404);
      await api().get(`/api/v1/assets/${assetId}`).set(other).expect(404);
      await api().get(`/api/v1/assets/audits/${auditId}`).set(other).expect(404);
      await api().post(`/api/v1/assets/loans/${loanId}/return`).set(other).expect(404);
      await api().post('/api/v1/assets').set(other).send({ name: 'Lạ', categoryId }).expect(400);
      expect((await api().get('/api/v1/hr/employees').set(other).expect(200)).body.total).toBe(0);
      expect((await api().get('/api/v1/hr/summary').set(other).expect(200)).body.headcount).toBe(0);
      expect((await api().get('/api/v1/assets').set(other).expect(200)).body.total).toBe(0);
      expect((await api().get('/api/v1/assets/summary').set(other).expect(200)).body.total).toBe(0);
    });
  });
});
