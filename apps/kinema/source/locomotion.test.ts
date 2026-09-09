import { describe, expect, it } from 'vitest';
import { MAX_SPEED, gaitWeights, speedFromMagnitude } from './locomotion';

describe('analog locomotion curve', () => {
  it('keeps a real dead zone and reaches full running speed', () => {
    expect(speedFromMagnitude(0.05)).toBe(0);
    expect(speedFromMagnitude(1)).toBeCloseTo(MAX_SPEED, 6);
  });

  it('is monotonic from walk to run', () => {
    const samples = [0.1, 0.25, 0.5, 0.75, 1].map(speedFromMagnitude);
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeGreaterThan(samples[i - 1]);
  });

  it('always normalizes gait blend weights', () => {
    for (const speed of [0, 0.4, 1.55, 2.3, 3.05, 4.1, MAX_SPEED]) {
      const weights = gaitWeights(speed);
      expect(weights.idle + weights.walk + weights.jog + weights.run).toBeCloseTo(1, 6);
    }
  });
});
