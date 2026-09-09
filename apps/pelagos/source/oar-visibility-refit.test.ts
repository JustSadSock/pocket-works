import { describe, expect, it } from 'vitest';
import { oarVisualPose, oarWaterlineDip } from './oar-visibility-refit';

describe('PELAGOS visible oar stroke', () => {
  it('keeps the normalized power stroke readable beside the hull', () => {
    const start = oarVisualPose(0.04);
    const middle = oarVisualPose(0.31);
    const end = oarVisualPose(0.60);
    expect(start.sweep).toBeGreaterThan(middle.sweep);
    expect(middle.sweep).toBeGreaterThan(end.sweep);
    expect(middle.dip).toBeGreaterThan(0.22);
    expect(middle.dip).toBeLessThan(0.32);
    expect(middle.power).toBeGreaterThan(0.9);
  });

  it('lifts and feathers the blade during recovery instead of burying it', () => {
    const power = oarVisualPose(0.31);
    const recovery = oarVisualPose(0.81);
    expect(recovery.dip).toBeLessThan(power.dip - 0.12);
    expect(recovery.recovery).toBeGreaterThan(0.9);
    expect(recovery.power).toBe(0);
  });

  it('solves a realistic waterline dip for low and high-board hulls', () => {
    const longCutter = oarWaterlineDip(0.57, 1.08, 3.62);
    const highboard = oarWaterlineDip(0.47, 1.23, 3.62);
    expect(longCutter).toBeGreaterThan(0.33);
    expect(longCutter).toBeLessThan(0.39);
    expect(highboard).toBeGreaterThan(0.28);
    expect(highboard).toBeLessThan(longCutter);
  });
});
