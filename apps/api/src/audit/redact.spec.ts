import { areaOf, auditBody, MAX_BODY_BYTES, redact } from './redact';

describe('audit redaction', () => {
  it('hides secret-looking keys at any depth', () => {
    expect(
      redact({ email: 'a@b.vn', password: 'Secret@123', nested: { apiKey: 'k', accessToken: 't', otp: '1234', note: 'ok' }, list: [{ pin: '1' }] }),
    ).toEqual({ email: 'a@b.vn', password: '[đã ẩn]', nested: { apiKey: '[đã ẩn]', accessToken: '[đã ẩn]', otp: '[đã ẩn]', note: 'ok' }, list: [{ pin: '[đã ẩn]' }] });
  });

  it('keeps ordinary values and cuts long strings', () => {
    const long = 'x'.repeat(600);
    const out = redact({ n: 1, ok: true, none: null, text: long }) as any;
    expect(out.n).toBe(1);
    expect(out.ok).toBe(true);
    expect(out.none).toBeNull();
    expect(out.text).toMatch(/^x{500}… \(600 ký tự\)$/);
  });

  it('drops empty bodies and caps big ones', () => {
    expect(auditBody(undefined)).toBeUndefined();
    expect(auditBody({})).toBeUndefined();
    expect(auditBody({ a: 1 })).toEqual({ a: 1 });
    const big = auditBody({ rows: Array.from({ length: 40 }, (_, i) => ({ i, text: 'y'.repeat(200) })) }) as any;
    expect(big._truncated).toBe(true);
    expect(big.bytes).toBeGreaterThan(MAX_BODY_BYTES);
    expect(big.preview.length).toBeLessThanOrEqual(MAX_BODY_BYTES);
  });

  it('names the module from the path', () => {
    expect(areaOf('/api/v1/finance/invoices/abc?x=1')).toBe('finance');
    expect(areaOf('/api/v1/auth/login')).toBe('auth');
    expect(areaOf('/iclock/cdata')).toBe('iclock');
    expect(areaOf('/')).toBe('');
  });
});
