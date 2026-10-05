import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('accepts local and international formats', () => {
    expect(normalizePhone('0987654321')).toBe('0987654321');
    expect(normalizePhone('+84 98 765 4321')).toBe('0987654321');
    expect(normalizePhone('84987654321')).toBe('0987654321');
    expect(normalizePhone('098.765.4321')).toBe('0987654321');
    expect(normalizePhone('02438123456')).toBe('02438123456');
  });

  it('rejects anything else', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});
