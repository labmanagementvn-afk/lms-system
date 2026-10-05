import { buildVietQr, crc16, toTransferText } from './vietqr';

describe('VietQR', () => {
  it('computes CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('builds a dynamic QR with amount and note', () => {
    const qr = buildVietQr({ bankBin: '970436', accountNo: '0011001234567', amount: 1_500_000, message: 'HPK3XQ9Z7M Trần Minh Anh' });
    expect(qr.startsWith('000201010212')).toBe(true);
    expect(qr).toContain('0010A000000727');
    expect(qr).toContain('0006970436');
    expect(qr).toContain('01130011001234567');
    expect(qr).toContain('0208QRIBFTTA');
    expect(qr).toContain('5303704');
    expect(qr).toContain('54071500000');
    expect(qr).toContain('5802VN');
    expect(qr).toContain('62280824HPK3XQ9Z7M Tran Minh Anh');
    expect(qr.slice(-4)).toBe(crc16(qr.slice(0, -4)));
  });

  it('builds a static QR without amount', () => {
    const qr = buildVietQr({ bankBin: '970436', accountNo: '123' });
    expect(qr.startsWith('000201010211')).toBe(true);
    expect(qr).not.toContain('5404');
  });

  it('cleans transfer text', () => {
    expect(toTransferText('Học phí – Đặng Thị Ánh!')).toBe('Hoc phi Dang Thi Anh');
  });

  it('rejects bad bank data', () => {
    expect(() => buildVietQr({ bankBin: '97043', accountNo: '1' })).toThrow();
  });
});
