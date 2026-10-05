import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MockPaymentProvider } from '../src/finance/providers/mock.provider';
import { bearer, createApp, createSchool, prisma, runId } from './helpers';

// Tuition flow: fee items -> campaign -> invoices (discounts, carried-over debt)
// -> cash and QR payments -> reconciliation -> accounting outbox.
describe('Finance (e2e)', () => {
  let app: INestApplication;
  let admin: string;
  let staff: string;
  let teacher: string;
  let other: string;
  const run = runId();
  const accountNo = `9${Date.now()}`.slice(0, 15);
  const api = () => request(app.getHttpServer());
  const mock = new MockPaymentProvider('mock-secret');

  let classA: string;
  let s1: string;
  let s2: string;
  let s3: string;
  let tuition: string;
  let meals: string;

  beforeAll(async () => {
    app = await createApp();
    const a = await createSchool(app, `FA${run}`);
    ({ ADMIN: admin, STAFF: staff, TEACHER: teacher } = a.tokens);
    other = (await createSchool(app, `FB${run}`)).tokens.ADMIN;

    classA = (await api().post('/api/v1/classes').set(bearer(admin)).send({ name: '6A1', gradeLevel: 6 }).expect(201)).body.id;
    const classB = (await api().post('/api/v1/classes').set(bearer(admin)).send({ name: '7A1', gradeLevel: 7 }).expect(201)).body.id;
    s1 = (await api().post('/api/v1/students').set(bearer(admin)).send({ code: 'HS1', fullName: 'Trần Minh Anh', classId: classA }).expect(201)).body.id;
    s2 = (await api().post('/api/v1/students').set(bearer(admin)).send({ code: 'HS2', fullName: 'Lê Gia Huy', classId: classA }).expect(201)).body.id;
    s3 = (await api().post('/api/v1/students').set(bearer(admin)).send({ code: 'HS3', fullName: 'Phạm Thu Hà', classId: classB }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('restricts finance to admin and staff', async () => {
    await api().get('/api/v1/finance/fee-items').set(bearer(teacher)).expect(403);
    await api().get('/api/v1/finance/fee-items').set(bearer(staff)).expect(200);
  });

  it('configures fee items, discounts and the bank account', async () => {
    tuition = (await api().post('/api/v1/finance/fee-items').set(bearer(staff)).send({ code: 'HOCPHI', name: 'Học phí', defaultAmount: 2_000_000 }).expect(201)).body.id;
    meals = (await api().post('/api/v1/finance/fee-items').set(bearer(staff)).send({ code: 'TIENAN', name: 'Tiền ăn bán trú', defaultAmount: 30_000 }).expect(201)).body.id;
    await api().post('/api/v1/finance/fee-items').set(bearer(staff)).send({ code: 'HOCPHI', name: 'x', defaultAmount: 1 }).expect(409);

    await api().post('/api/v1/finance/discounts').set(bearer(staff)).send({ studentId: s2, feeItemId: tuition, kind: 'PERCENT', value: 50, reason: 'Con cán bộ' }).expect(201);
    await api().post('/api/v1/finance/discounts').set(bearer(other)).send({ studentId: s2, kind: 'PERCENT', value: 50, reason: 'x' }).expect(404);

    await api().get(`/api/v1/finance/settings`).set(bearer(admin)).expect(200);
    await api().put('/api/v1/finance/settings').set(bearer(staff)).send({ bankBin: '970436' }).expect(403);
    const settings = await api()
      .put('/api/v1/finance/settings')
      .set(bearer(admin))
      .send({ bankBin: '970436', bankName: 'Vietcombank', bankAccountNo: accountNo, bankAccountName: 'TRUONG DEMO' })
      .expect(200);
    expect(settings.body.sampleQr).toMatch(/^000201/);
  });

  let october: string;
  let inv1: any;

  it('issues campaign invoices with discounts and is idempotent', async () => {
    october = (
      await api()
        .post('/api/v1/finance/campaigns')
        .set(bearer(staff))
        .send({ name: 'Học phí tháng 10/2026', dueDate: '2026-10-15', gradeLevels: [6], items: [{ feeItemId: tuition }, { feeItemId: meals, quantity: 20 }] })
        .expect(201)
    ).body.id;
    const preview = await api().get(`/api/v1/finance/campaigns/${october}/preview`).set(bearer(staff)).expect(200);
    expect(preview.body).toEqual({ students: 2, alreadyInvoiced: 0, perStudentBeforeDiscount: 2_600_000 });

    expect((await api().post(`/api/v1/finance/campaigns/${october}/generate`).set(bearer(staff)).expect(200)).body).toEqual({ created: 2, skipped: 0 });
    expect((await api().post(`/api/v1/finance/campaigns/${october}/generate`).set(bearer(staff)).expect(200)).body).toEqual({ created: 0, skipped: 2 });
    await api().patch(`/api/v1/finance/campaigns/${october}`).set(bearer(staff)).send({ name: 'x' }).expect(400);

    const list = await api().get('/api/v1/finance/invoices').query({ campaignId: october }).set(bearer(staff)).expect(200);
    expect(list.body.total).toBe(2);
    const byStudent = Object.fromEntries(list.body.items.map((i: any) => [i.student.code, i]));
    expect(byStudent.HS1).toMatchObject({ total: 2_600_000, status: 'UNPAID' });
    expect(byStudent.HS2).toMatchObject({ subtotal: 2_600_000, discountTotal: 1_000_000, total: 1_600_000 });
    expect(byStudent.HS1.student.enrollments[0].class.name).toBe('6A1');
    inv1 = byStudent.HS1;

    const campaigns = await api().get('/api/v1/finance/campaigns').set(bearer(staff)).expect(200);
    expect(campaigns.body[0]).toMatchObject({ status: 'PUBLISHED', invoiceCount: 2, billed: 4_200_000, collected: 0 });
    await api().get(`/api/v1/finance/invoices/${inv1.id}`).set(bearer(other)).expect(404);
  });

  it('takes cash payments with sequential receipts and blocks overpayment', async () => {
    const p = await api().post(`/api/v1/finance/invoices/${inv1.id}/payments`).set(bearer(staff)).send({ amount: 1_000_000 }).expect(201);
    expect(p.body.receiptNo).toMatch(/^PT\d{4}-000001$/);
    await api().post(`/api/v1/finance/invoices/${inv1.id}/payments`).set(bearer(staff)).send({ amount: 5_000_000 }).expect(400);
    await api().post(`/api/v1/finance/invoices/${inv1.id}/payments`).set(bearer(staff)).send({ amount: 1, method: 'QR' }).expect(400);
    const inv = await api().get(`/api/v1/finance/invoices/${inv1.id}`).set(bearer(staff)).expect(200);
    expect(inv.body).toMatchObject({ status: 'PARTIAL', paidAmount: 1_000_000 });
    const job = await prisma.accountingSyncJob.findUnique({ where: { kind_entityId: { kind: 'RECEIPT', entityId: p.body.id } } });
    expect(job).toMatchObject({ status: 'PENDING', payload: expect.objectContaining({ voucherType: 'CASH_RECEIPT', totalAmount: 1_000_000, accountObjectCode: 'HS1' }) });
  });

  let november: string;
  let novInv1: any;

  it('carries unpaid balances onto the next campaign', async () => {
    november = (
      await api().post('/api/v1/finance/campaigns').set(bearer(staff)).send({ name: 'Học phí tháng 11/2026', dueDate: '2026-11-15', classIds: [classA], items: [{ feeItemId: tuition }] }).expect(201)
    ).body.id;
    await api().post(`/api/v1/finance/campaigns/${november}/generate`).set(bearer(staff)).expect(200);
    const list = await api().get('/api/v1/finance/invoices').query({ campaignId: november, q: 'HS1' }).set(bearer(staff)).expect(200);
    novInv1 = list.body.items[0];
    expect(novInv1.total).toBe(2_000_000 + 1_600_000);
    const old = await api().get(`/api/v1/finance/invoices/${inv1.id}`).set(bearer(staff)).expect(200);
    expect(old.body).toMatchObject({ status: 'CARRIED_OVER', carriedTo: { id: novInv1.id } });
    await api().post(`/api/v1/finance/invoices/${inv1.id}/payments`).set(bearer(staff)).send({ amount: 1000 }).expect(400);

    const summary = await api().get('/api/v1/finance/summary').set(bearer(staff)).expect(200);
    // Oct: HS1 keeps 1.0M paid (rest carried), HS2 1.6M; Nov: HS1 3.6M, HS2 1.0M + 1.6M carried
    expect(summary.body).toMatchObject({ billed: 1_000_000 + 3_600_000 + 2_600_000, collected: 1_000_000, outstanding: 3_600_000 + 2_600_000 });
  });

  it('settles invoices from signed bank webhooks, including old references', async () => {
    const qr = await api().get(`/api/v1/finance/invoices/${novInv1.id}/payment-qr`).set(bearer(staff)).expect(200);
    expect(qr.body).toMatchObject({ amount: 3_600_000, paymentRef: novInv1.paymentRef, bankAccountNo: accountNo });
    expect(qr.body.qrPayload).toContain(novInv1.paymentRef);

    // The parent pays with the October reference: the money lands on the November invoice that holds the debt.
    const body = {
      transactions: [
        { id: `T1-${run}`, accountNo, amount: 1_600_000, description: `MBVCB ${inv1.paymentRef.slice(0, 5)} ${inv1.paymentRef.slice(5)} HS1`, occurredAt: new Date().toISOString() },
        { id: `T2-${run}`, accountNo, amount: 300_000, description: 'ung ho quy lop', occurredAt: new Date().toISOString() },
        { id: `T3-${run}`, accountNo: '000', amount: 1, description: 'x', occurredAt: new Date().toISOString() },
      ],
    };
    await api().post('/api/v1/payments/webhooks/mock').set('X-Mock-Signature', 'bad').send(body).expect(401);
    await api().post('/api/v1/payments/webhooks/nope').send(body).expect(404);
    const res = await api().post('/api/v1/payments/webhooks/mock').set('X-Mock-Signature', mock.sign(body)).send(body).expect(200);
    expect(res.body).toMatchObject({ matched: 1, unmatched: 1, unknownAccount: 1, duplicates: 0 });
    const replay = await api().post('/api/v1/payments/webhooks/mock').set('X-Mock-Signature', mock.sign(body)).send(body).expect(200);
    expect(replay.body).toMatchObject({ matched: 0, duplicates: 2 });

    const inv = await api().get(`/api/v1/finance/invoices/${novInv1.id}`).set(bearer(staff)).expect(200);
    expect(inv.body).toMatchObject({ status: 'PARTIAL', paidAmount: 1_600_000 });
    expect(inv.body.payments[0]).toMatchObject({ method: 'QR', amount: 1_600_000 });

    // The unmatched transfer is reconciled by hand.
    const txns = await api().get('/api/v1/finance/bank-transactions').query({ status: 'UNMATCHED' }).set(bearer(staff)).expect(200);
    expect(txns.body.total).toBe(1);
    await api().get('/api/v1/finance/bank-transactions').query({ status: 'UNMATCHED' }).set(bearer(other)).expect(200).expect((r) => expect(r.body.total).toBe(0));
    await api().post(`/api/v1/finance/bank-transactions/${txns.body.items[0].id}/match`).set(bearer(staff)).send({ invoiceId: novInv1.id }).expect(200);
    await api().post(`/api/v1/finance/bank-transactions/${txns.body.items[0].id}/ignore`).set(bearer(staff)).send({ note: 'x' }).expect(400);
  });

  it('simulates transfers in the sandbox and voids receipts', async () => {
    const before = await api().get(`/api/v1/finance/invoices/${novInv1.id}`).set(bearer(staff)).expect(200);
    const remaining = before.body.total - before.body.paidAmount;
    const sbx = await api().post('/api/v1/finance/sandbox/transfers').set(bearer(staff)).send({ amount: remaining, description: `${novInv1.paymentRef} hoc phi` }).expect(200);
    expect(sbx.body.matched).toBe(1);
    const paid = await api().get(`/api/v1/finance/invoices/${novInv1.id}`).set(bearer(staff)).expect(200);
    expect(paid.body.status).toBe('PAID');
    await api().get(`/api/v1/finance/invoices/${novInv1.id}/payment-qr`).set(bearer(staff)).expect(400);

    const receipt = paid.body.payments[0];
    await api().post(`/api/v1/finance/payments/${receipt.id}/void`).set(bearer(staff)).send({ reason: 'Thu nhầm' }).expect(403);
    await api().post(`/api/v1/finance/payments/${receipt.id}/void`).set(bearer(admin)).send({ reason: 'Thu nhầm' }).expect(200);
    const after = await api().get(`/api/v1/finance/invoices/${novInv1.id}`).set(bearer(staff)).expect(200);
    expect(after.body).toMatchObject({ status: 'PARTIAL', paidAmount: before.body.paidAmount });
    const unmatched = await api().get('/api/v1/finance/bank-transactions').query({ status: 'UNMATCHED' }).set(bearer(staff)).expect(200);
    expect(unmatched.body.total).toBe(1);

    const payments = await api().get('/api/v1/finance/payments').set(bearer(staff)).expect(200);
    expect(payments.body.items.some((p: any) => p.status === 'VOIDED')).toBe(true);
  });

  it('pushes receipts to the accounting sandbox', async () => {
    const run1 = await api().post('/api/v1/accounting/sync/run').set(bearer(staff)).expect(200);
    expect(run1.body.failed).toBe(0);
    expect(run1.body.succeeded).toBeGreaterThanOrEqual(4);
    const summary = await api().get('/api/v1/accounting/sync/summary').set(bearer(staff)).expect(200);
    expect(summary.body).toMatchObject({ provider: 'mock-misa', PENDING: 0, FAILED: 0 });
    const jobs = await api().get('/api/v1/accounting/sync').query({ kind: 'RECEIPT_VOID' }).set(bearer(staff)).expect(200);
    expect(jobs.body.items[0]).toMatchObject({ status: 'SUCCESS', externalRef: expect.stringMatching(/^MISA-RECEIPT_VOID-PT/) });
    await api().get('/api/v1/accounting/sync').set(bearer(teacher)).expect(403);
  });

  it('cancels unpaid invoices and restores carried debt', async () => {
    const s2Nov = (await api().get('/api/v1/finance/invoices').query({ campaignId: november, studentId: s2 }).set(bearer(staff)).expect(200)).body.items[0];
    await api().post(`/api/v1/finance/invoices/${s2Nov.id}/cancel`).set(bearer(staff)).expect(200);
    const s2Oct = (await api().get('/api/v1/finance/invoices').query({ campaignId: october, studentId: s2 }).set(bearer(staff)).expect(200)).body.items[0];
    expect(s2Oct).toMatchObject({ status: 'UNPAID', carriedToInvoiceId: null });
    await api().post(`/api/v1/finance/invoices/${novInv1.id}/cancel`).set(bearer(staff)).expect(400);

    const manual = await api()
      .post('/api/v1/finance/invoices')
      .set(bearer(staff))
      .send({ studentId: s3, title: 'Phí dã ngoại', lines: [{ description: 'Dã ngoại Ba Vì', unitPrice: 350_000 }] })
      .expect(201);
    expect(manual.body).toMatchObject({ source: 'MANUAL', total: 350_000, status: 'UNPAID' });
  });
});
