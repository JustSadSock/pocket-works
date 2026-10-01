import { describe, expect, it } from 'vitest';
import { canUseOath, clampPercent, hasProgress, healthPercent } from './core';

describe('third-oath core helpers', () => {
  it('clamps HUD percentages safely', () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(healthPercent(2.5, 5)).toBe(50);
    expect(healthPercent(2, 0)).toBe(0);
  });

  it('detects meaningful campaign progress', () => {
    expect(hasProgress({}, [], 0)).toBe(false);
    expect(hasProgress({ secretDoorOpen: true }, [], 0)).toBe(true);
    expect(hasProgress({}, ['sun-letter'], 0)).toBe(true);
    expect(hasProgress({}, [], 6)).toBe(true);
  });

  it('checks oath ability cost at the boundary', () => {
    expect(canUseOath(39)).toBe(false);
    expect(canUseOath(40)).toBe(true);
  });
});
