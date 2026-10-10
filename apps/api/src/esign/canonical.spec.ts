import { canonicalJson, contentHash, plainJson } from './canonical';
import { MockSignatureAdapter, signatureAdaptersFactory } from './signature-provider';

describe('canonical JSON', () => {
  it('sorts keys at every level and drops undefined fields', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"x":2,"y":1}]},"b":1}');
    expect(canonicalJson([undefined, 'é', null])).toBe('[null,"é",null]');
  });

  it('hashes the same content the same way whatever the key order', () => {
    const a = plainJson({ title: 'Học bạ', date: new Date('2027-05-25T02:00:00Z'), rows: [[1, 'Toán', 8.5]] });
    const b = { rows: [[1, 'Toán', 8.5]], date: '2027-05-25T02:00:00.000Z', title: 'Học bạ' };
    expect(contentHash(a)).toBe(contentHash(b));
    expect(contentHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash({ ...b, title: 'Học bạ ' })).not.toBe(contentHash(a));
  });
});

describe('sandbox signing', () => {
  const smartca = new MockSignatureAdapter('VNPT_SMARTCA');

  it('derives a certificate from the account', async () => {
    const cert = await smartca.certificate('079085001234', 'Phạm Quốc Bảo');
    expect(cert).toMatchObject({ subject: 'CN=Phạm Quốc Bảo, UID=CCCD:079085001234, C=VN', issuer: expect.stringContaining('VNPT SmartCA') });
    expect(cert.serial).toMatch(/^[0-9A-F]{32}$/);
    expect(await smartca.certificate('079085001234', 'Phạm Quốc Bảo')).toEqual(cert);
    await expect(smartca.certificate('mock-nocert', 'X')).rejects.toThrow('chưa được cấp chứng thư số VNPT SmartCA');
  });

  it('signs a digest and verifies only that digest with that certificate', async () => {
    const cert = await smartca.certificate('0912345678', 'Nguyễn Thị Hồng Hạnh');
    const digest = contentHash({ a: 1 });
    const s = await smartca.sign({ account: '0912345678', certificate: cert, digest, description: 'test' });
    expect(s.transactionId).toMatch(/^mock-smartca-[0-9a-f]{12}$/);
    expect(await smartca.verify(digest, s.signature, cert)).toBe(true);
    expect(await smartca.verify(contentHash({ a: 2 }), s.signature, cert)).toBe(false);
    expect(await smartca.verify(digest, s.signature, { serial: 'OTHER' })).toBe(false);
    expect(await new MockSignatureAdapter('VIETTEL_MYSIGN').verify(digest, s.signature, cert)).toBe(false);
    await expect(smartca.sign({ account: 'mock-fail', certificate: cert, digest, description: 'test' })).rejects.toThrow('từ chối');
  });

  it('builds the adapters named in ESIGN_PROVIDERS and refuses real ones', () => {
    const saved = process.env.ESIGN_PROVIDERS;
    try {
      delete process.env.ESIGN_PROVIDERS;
      expect([...signatureAdaptersFactory().keys()]).toEqual(['VNPT_SMARTCA', 'VIETTEL_MYSIGN']);
      process.env.ESIGN_PROVIDERS = 'VNPT_SMARTCA=real';
      expect(() => signatureAdaptersFactory()).toThrow('not implemented');
    } finally {
      if (saved === undefined) delete process.env.ESIGN_PROVIDERS;
      else process.env.ESIGN_PROVIDERS = saved;
    }
  });
});
