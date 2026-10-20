import { describe, expect, it } from 'vitest';
import { longitudinalIntent } from './drivetrain';

describe('brake to reverse', () => {
  it('brakes normally at road speed', () => {
    expect(longitudinalIntent('drive', 18, 0, 1)).toEqual({ gear: 'drive', reverse: 0, brake: 1 });
  });
  it('enters reverse only after decelerating near a stop', () => {
    const result = longitudinalIntent('drive', 0.75, 0, 0.95);
    expect(result.gear).toBe('reverse');
    expect(result.reverse).toBeCloseTo(0.6175);
    expect(result.brake).toBe(0);
  });
  it('holds reverse through increasing reverse speed instead of pulsing', () => {
    let gear: 'drive' | 'reverse' = 'drive';
    for (const speed of [0.8, 1.3, 3.2, 5.9, 8]) {
      const state = longitudinalIntent(gear, speed, 0, 1);
      gear = state.gear;
      expect(state.reverse).toBeGreaterThan(0.6);
      expect(state.brake).toBe(0);
    }
  });
  it('forward acceleration exits reverse immediately', () => {
    expect(longitudinalIntent('reverse', 4, 0.8, 0)).toEqual({ gear: 'drive', reverse: 0, brake: 0 });
  });
  it('does not invent thrust or brake pressure at rest', () => {
    expect(longitudinalIntent('drive', 0, 0, 0)).toEqual({ gear: 'drive', reverse: 0, brake: 0 });
    expect(longitudinalIntent('reverse', 0.1, 0, 0)).toEqual({ gear: 'reverse', reverse: 0, brake: 0 });
  });
  it('clamps malformed analog input instead of overdriving the physics solver', () => {
    expect(longitudinalIntent('reverse', 2.1, 0, 9).reverse).toBeLessThanOrEqual(0.65);
    expect(longitudinalIntent('drive', 20, 0, -4).brake).toBe(0);
  });
});
