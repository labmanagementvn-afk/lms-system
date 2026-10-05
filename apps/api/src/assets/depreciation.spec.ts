import { bookValue, monthsElapsed, schedule } from './depreciation';

describe('depreciation', () => {
  it('counts only full months', () => {
    expect(monthsElapsed('2024-03-15', '2026-10-05')).toBe(30);
    expect(monthsElapsed('2024-03-15', '2026-10-15')).toBe(31);
    expect(monthsElapsed('2024-03-15', '2024-04-14')).toBe(0);
    expect(monthsElapsed('2024-03-15', '2024-04-15')).toBe(1);
    expect(monthsElapsed('2024-03-15', '2024-03-01')).toBe(0);
  });

  it('depreciates straight-line per month and never below zero', () => {
    expect(bookValue(12_000_000, '2024-03-15', 4, '2026-10-05')).toBe(4_500_000);
    expect(bookValue(12_000_000, '2024-03-15', 4, '2024-03-20')).toBe(12_000_000);
    expect(bookValue(12_000_000, '2020-01-01', 4, '2026-10-05')).toBe(0);
    expect(bookValue(12_000_000, '2030-01-01', 4, '2026-10-05')).toBe(12_000_000);
    expect(bookValue(10_000_000, '2024-01-01', 3, '2025-07-01')).toBe(5_000_000);
  });

  it('does not depreciate assets without a useful life', () => {
    expect(bookValue(5_000_000, '2020-01-01', 0, '2026-10-05')).toBe(5_000_000);
    expect(schedule(5_000_000, '2020-01-01', 0)).toEqual([]);
  });

  it('builds a per-year schedule that sums to the purchase price', () => {
    expect(schedule(12_000_000, '2024-03-15', 4)).toEqual([
      { year: 2024, depreciation: 2_250_000, bookValueEnd: 9_750_000 },
      { year: 2025, depreciation: 3_000_000, bookValueEnd: 6_750_000 },
      { year: 2026, depreciation: 3_000_000, bookValueEnd: 3_750_000 },
      { year: 2027, depreciation: 3_000_000, bookValueEnd: 750_000 },
      { year: 2028, depreciation: 750_000, bookValueEnd: 0 },
    ]);
    expect(schedule(10_000_000, '2024-01-01', 4).map((r) => r.depreciation)).toEqual([2_500_000, 2_500_000, 2_500_000, 2_500_000]);

    const odd = schedule(9_999_999, '2024-05-20', 3);
    expect(odd.reduce((s, r) => s + r.depreciation, 0)).toBe(9_999_999);
    expect(odd[odd.length - 1].bookValueEnd).toBe(0);
    expect(odd[0].year).toBe(2024);
  });
});
