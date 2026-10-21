import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { impactSpeeds, velocityAtPoint, type BodyMotion } from './impact-kinematics';

const still: BodyMotion = { position: Vector3.Zero(), linear: Vector3.Zero(), angular: Vector3.Zero() };
const moving = (speed: number): BodyMotion => ({
  position: Vector3.Zero(), linear: new Vector3(0, 0, speed), angular: Vector3.Zero()
});

describe('pre-solver contact-point impact kinematics', () => {
  it('preserves 30 km/h wall impact even when the solver stops the car', () => {
    const before = impactSpeeds(moving(30 / 3.6), still, new Vector3(0, 0, 2), Vector3.Zero(), Vector3.Forward());
    expect(before.normalSpeed * 3.6).toBeCloseTo(30, 5);
    const after = impactSpeeds(moving(0), still, Vector3.Zero(), Vector3.Zero(), Vector3.Forward());
    expect(after.normalSpeed).toBe(0);
  });
  it('ignores tangential scraping when judging collision severity', () => {
    const hit = impactSpeeds(moving(15), still, Vector3.Zero(), Vector3.Zero(), Vector3.Right());
    expect(hit.normalSpeed).toBe(0);
    expect(hit.incidence).toBe(0);
  });
  it('sees velocity at the front corner when the center is stationary but spinning', () => {
    const spinning: BodyMotion = { position: Vector3.Zero(), linear: Vector3.Zero(), angular: new Vector3(0, 2, 0) };
    const point = new Vector3(1, 0, 2);
    expect(velocityAtPoint(spinning, point).z).toBeCloseTo(-2);
    expect(impactSpeeds(spinning, still, point, point, Vector3.Forward()).normalSpeed).toBeCloseTo(2);
  });
  it('reports relative head-on speed between two moving vehicles', () => {
    expect(impactSpeeds(moving(8), moving(-7), Vector3.Zero(), Vector3.Zero(), Vector3.Forward()).normalSpeed).toBeCloseTo(15);
  });
});
