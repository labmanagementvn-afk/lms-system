import { progressPercent } from './progress';

describe('course progress', () => {
  it('rounds completed / required to a whole percentage', () => {
    expect(progressPercent(0, 4)).toBe(0);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
    expect(progressPercent(3, 3)).toBe(100);
  });

  it('is 0 without lessons and never above 100', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(7, 5)).toBe(100);
  });
});
