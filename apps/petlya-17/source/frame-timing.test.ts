import { describe, expect, it } from 'vitest';
import { frameTiming, measuredFps, MAX_PHYSICS_STEP, MAX_FRAME_CATCHUP } from './frame-timing';
import { createVehicleDynamics, stepVehicle } from './handling';

describe('frame timing', () => {
  it('keeps one simulated second at normal and low render rates', () => {
    for (const fps of [4, 5, 10, 20, 30, 60, 120]) {
      const t = frameTiming(1000 / fps);
      expect(t.stepSeconds).toBeLessThanOrEqual(MAX_PHYSICS_STEP + 1e-12);
      expect(t.steps * t.stepSeconds * fps).toBeCloseTo(1, 10);
      expect(measuredFps(fps, t.elapsed * fps)).toBeCloseTo(fps, 10);
    }
  });

  it('bounds catch-up after a suspension or extreme stall', () => {
    const t = frameTiming(20_000);
    expect(t.simulated).toBe(MAX_FRAME_CATCHUP);
    expect(t.steps).toBe(5);
    expect(t.elapsed).toBe(20);
    for (const invalid of [NaN, Infinity, -1, 0]) {
      expect(frameTiming(invalid).steps).toBe(0);
    }
  });

  it('preserves acceleration at ten frames per second', () => {
    const input = {steer:0, throttle:1, brake:0, curvature:0, offroad:0, drafting:0};
    const run = (fps: number) => {
      let state = createVehicleDynamics();
      for (let frame=0; frame<fps*8; frame++) {
        const t=frameTiming(1000/fps);
        for(let i=0;i<t.steps;i++) state=stepVehicle(state,input,t.stepSeconds);
      }
      return state.speed;
    };
    expect(run(10)).toBeGreaterThan(110);
    expect(Math.abs(run(10)-run(60))).toBeLessThan(6);
  });

  it('uses wall-clock throughput rather than the average instantaneous FPS', () => {
    expect(measuredFps(2, 0.05 + 0.15)).toBeCloseTo(10);
    expect(measuredFps(0,0)).toBe(0);
  });
});
