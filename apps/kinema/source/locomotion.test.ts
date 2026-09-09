import { describe, expect, it } from 'vitest';
import {
  MAX_SPEED,
  directionalWeights,
  gaitWeights,
  localMotionComponents,
  moveAngleTowards,
  shortestAngleDelta,
  speedFromMagnitude
} from './locomotion';

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

describe('directional body motion', () => {
  it('takes the shortest wrapped turn across the PI boundary', () => {
    const delta = shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1);
    expect(delta).toBeCloseTo(0.2, 6);
    expect(moveAngleTowards(0, Math.PI / 2, 0.25)).toBeCloseTo(0.25, 6);
  });

  it('projects world velocity into the facing basis', () => {
    expect(localMotionComponents(0, -1, 0)).toEqual({ forward: 1, right: 0 });
    expect(localMotionComponents(1, 0, 0).right).toBeCloseTo(1, 6);
    expect(localMotionComponents(0, 1, 0).forward).toBeCloseTo(-1, 6);
  });

  it('uses authored back, strafe and pivot blends at low speed and fades them while running', () => {
    const back = directionalWeights(-1, 0, 1, 0);
    expect(back.back).toBeGreaterThan(0.7);

    const strafe = directionalWeights(0, -1, 1, 0);
    expect(strafe.left).toBeGreaterThan(0.7);

    const pivot = directionalWeights(1, 0, 0.1, -1.2);
    expect(pivot.pivotLeft).toBeGreaterThan(0.5);

    const run = directionalWeights(0, 1, MAX_SPEED, 0);
    expect(run.forward).toBeCloseTo(1, 6);
    expect(run.left + run.right + run.back).toBeCloseTo(0, 6);
  });

  it('keeps every directional blend normalized', () => {
    for (const sample of [
      [1, 0, 0, 0],
      [-1, 0, 1, 0],
      [0, 1, 1.5, 0.5],
      [0.5, -0.8, 2.4, -0.4],
      [1, 0, 0.1, 1.5]
    ] as const) {
      const weights = directionalWeights(...sample);
      const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });
});
