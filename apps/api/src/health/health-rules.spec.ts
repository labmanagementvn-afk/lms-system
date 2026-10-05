import { bmi, daysUntil, INSURANCE_NUMBER } from './health-rules';

describe('health rules', () => {
  it('computes BMI to one decimal only when both values are given', () => {
    expect(bmi(140, 35)).toBe(17.9);
    expect(bmi(152.5, 41.2)).toBe(17.7);
    expect(bmi(140, undefined)).toBeNull();
    expect(bmi(null, 35)).toBeNull();
    expect(bmi(0, 35)).toBeNull();
  });

  it('accepts 10 or 15 character insurance numbers', () => {
    expect(INSURANCE_NUMBER.test('0123456789')).toBe(true);
    expect(INSURANCE_NUMBER.test('HS4797923456789')).toBe(true);
    expect(INSURANCE_NUMBER.test('hs4797923456789')).toBe(true);
    expect(INSURANCE_NUMBER.test('012345678')).toBe(false);
    expect(INSURANCE_NUMBER.test('HS47979234567')).toBe(false);
    expect(INSURANCE_NUMBER.test('HS-4797923456')).toBe(false);
  });

  it('counts days until a date', () => {
    const now = new Date('2026-10-05T15:00:00Z');
    expect(daysUntil(new Date('2026-10-05'), now)).toBe(0);
    expect(daysUntil(new Date('2026-11-04'), now)).toBe(30);
    expect(daysUntil(new Date('2026-10-01'), now)).toBe(-4);
  });
});
