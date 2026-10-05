import { generateOrderCode, mergeLines, stockChangeError } from './store-rules';

describe('store rules', () => {
  it('generates order codes without ambiguous characters', () => {
    for (let i = 0; i < 50; i++) expect(generateOrderCode()).toMatch(/^DH[A-HJ-NP-Z2-9]{8}$/);
  });

  it('merges repeated items', () => {
    expect(
      mergeLines([
        { itemId: 'a', quantity: 1 },
        { itemId: 'b', quantity: 2 },
        { itemId: 'a', quantity: 3 },
      ]),
    ).toEqual([
      { itemId: 'a', quantity: 4 },
      { itemId: 'b', quantity: 2 },
    ]);
  });

  it('validates stock changes', () => {
    expect(stockChangeError('IN', 5)).toBeNull();
    expect(stockChangeError('IN', -5)).toMatch(/lớn hơn 0/);
    expect(stockChangeError('ADJUST', -5)).toBeNull();
    expect(stockChangeError('ADJUST', 0)).toMatch(/khác 0/);
  });
});
