import { describe, expect, it } from 'vitest';
import { oarVisualPose } from './oar-visibility-refit';

describe('PELAGOS visible oar stroke', () => {
  it('keeps the power stroke shallow enough to remain readable beside the hull', () => {
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
});
