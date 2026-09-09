import { describe, expect, it } from 'vitest';
import { speedWaterProfile } from './speed-water-response';

describe('PELAGOS speed-aware water response', () => {
  it('keeps a drifting hull nearly free of extra wave drag', () => {
    const drift = speedWaterProfile(0.25, 0.82, 0.8);
    expect(drift.speedFactor).toBeLessThan(0.06);
    expect(drift.waveDragRate).toBeLessThan(0.002);
    expect(drift.squatAcceleration).toBeLessThan(0.001);
  });

  it('increases resistance and squat non-linearly with vessel speed', () => {
    const slow = speedWaterProfile(1.5, 1.08, 0.9);
    const fast = speedWaterProfile(5.0, 1.08, 0.9);
    expect(fast.waveDragRate).toBeGreaterThan(slow.waveDragRate * 4);
    expect(fast.squatAcceleration).toBeGreaterThan(slow.squatAcceleration * 8);
  });

  it('turns a fast rising bow encounter into a bounded slam response', () => {
    const calmEncounter = speedWaterProfile(4.6, 1.2, 0.15);
    const risingCrest = speedWaterProfile(4.6, 1.2, 1.8);
    expect(calmEncounter.slamAcceleration).toBe(0);
    expect(risingCrest.slamAcceleration).toBeGreaterThan(0.35);
    expect(risingCrest.slamAcceleration).toBeLessThan(0.75);
    expect(risingCrest.encounterFactor).toBeGreaterThan(calmEncounter.encounterFactor);
  });
});
