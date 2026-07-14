import { describe, expect, it } from 'vitest';
import { catmullRomClosed, signedWrappedDelta, speedFeel, wrap } from './core';

const points = [
  [0, 0, 0],
  [10, 0, 0],
  [10, 0, 10],
  [0, 0, 10]
] as const;

describe('Petlya 17 core math', () => {
  it('wraps values deterministically', () => {
    expect(wrap(-1, 10)).toBe(9);
    expect(wrap(12, 10)).toBe(2);
  });

  it('keeps the closed spline continuous at the seam', () => {
    const start = catmullRomClosed(points, 0);
    const end = catmullRomClosed(points, 1);
    expect(end[0]).toBeCloseTo(start[0], 8);
    expect(end[1]).toBeCloseTo(start[1], 8);
    expect(end[2]).toBeCloseTo(start[2], 8);
  });

  it('maps speed to a monotonic perceptual coefficient', () => {
    expect(speedFeel(0)).toBe(0);
    expect(speedFeel(100)).toBeLessThan(speedFeel(200));
    expect(speedFeel(200)).toBeLessThan(speedFeel(320));
    expect(speedFeel(400)).toBe(1);
  });

  it('computes the shortest signed distance around a loop', () => {
    expect(signedWrappedDelta(5, 95, 100)).toBe(10);
    expect(signedWrappedDelta(95, 5, 100)).toBe(-10);
  });
});
