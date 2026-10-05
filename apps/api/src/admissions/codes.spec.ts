import { Prisma } from '@prisma/client';
import { applicationCode, isUniqueViolation, nextStudentCode } from './codes';

describe('codes', () => {
  it('formats application codes', () => {
    expect(applicationCode(2026, 1)).toBe('TS26-00001');
    expect(applicationCode(2027, 12345)).toBe('TS27-12345');
    expect(applicationCode(2026, 123456)).toBe('TS26-123456');
  });

  it('continues the student numbering of the intake year', () => {
    expect(nextStudentCode(2026, [])).toBe('HS2026001');
    expect(nextStudentCode(2026, ['HS2026001', 'HS2026030', 'HS2025999', 'HS2026ABC', 'XX'])).toBe('HS2026031');
    expect(nextStudentCode(2026, ['HS2026999'])).toBe('HS20261000');
    expect(nextStudentCode(2026, ['HS2026005'], 2)).toBe('HS2026008');
  });

  it('recognises unique violations on a field', () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['schoolId', 'code'] } });
    expect(isUniqueViolation(err, 'code')).toBe(true);
    expect(isUniqueViolation(err, 'guardianPhone')).toBe(false);
    expect(isUniqueViolation(new Error('x'), 'code')).toBe(false);
  });
});
