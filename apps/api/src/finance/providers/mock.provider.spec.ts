import { MockPaymentProvider } from './mock.provider';

describe('MockPaymentProvider', () => {
  const provider = new MockPaymentProvider('test-secret');
  const body = { transactions: [{ id: 't1', accountNo: '0011', amount: 500000, description: 'HPABCDEFGH', occurredAt: '2026-10-05T03:00:00Z' }] };

  it('accepts correctly signed webhooks', () => {
    const [t] = provider.parseWebhook({ 'x-mock-signature': provider.sign(body) }, body);
    expect(t).toMatchObject({ externalId: 't1', accountNo: '0011', amount: 500000 });
    expect(t.occurredAt.toISOString()).toBe('2026-10-05T03:00:00.000Z');
  });

  it('rejects bad signatures', () => {
    expect(() => provider.parseWebhook({ 'x-mock-signature': 'nope' }, body)).toThrow('Invalid signature');
    expect(() => provider.parseWebhook({}, body)).toThrow();
    const other = new MockPaymentProvider('other');
    expect(() => provider.parseWebhook({ 'x-mock-signature': other.sign(body) }, body)).toThrow();
  });

  it('returns a VietQR payload for an invoice', async () => {
    const { qrPayload } = await provider.createPaymentRequest({ bankBin: '970436', accountNo: '0011', amount: 1000, paymentRef: 'HPABCDEFGH', description: 'Hoc phi' });
    expect(qrPayload).toContain('HPABCDEFGH');
  });
});
