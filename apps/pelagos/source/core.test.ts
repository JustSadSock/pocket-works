import { describe, expect, it } from 'vitest';
import { DEG, ShipDynamics, idealSailTrim, sailTrimEfficiency, sailingPolar, sampleWave, waveHeightAt } from './core';

describe('wave field', () => {
  it('uses the same height function as the full sampler', () => {
    for (const [x, z, t, scale] of [[0, 0, 0, 1], [12.5, -8.3, 4.2, 1.4], [-91, 55, 22, 0.6]] as const) {
      expect(sampleWave(x, z, t, scale).height).toBeCloseTo(waveHeightAt(x, z, t, scale), 10);
    }
  });

  it('returns normalized surface normals', () => {
    const sample = sampleWave(17, -31, 9.4, 1.8);
    expect(Math.hypot(sample.normalX, sample.normalY, sample.normalZ)).toBeCloseTo(1, 7);
    expect(sample.normalY).toBeGreaterThan(0.45);
  });
});

describe('sailing model', () => {
  it('has a genuine no-go zone and a strong reaching zone', () => {
    expect(sailingPolar(10 * DEG)).toBeLessThan(0.05);
    expect(sailingPolar(90 * DEG)).toBeGreaterThan(0.95);
    expect(sailingPolar(180 * DEG)).toBeLessThan(sailingPolar(100 * DEG));
  });

  it('rewards a correctly trimmed sail', () => {
    const angle = 82 * DEG;
    const ideal = idealSailTrim(angle);
    expect(sailTrimEfficiency(ideal, ideal)).toBeCloseTo(1, 8);
    expect(sailTrimEfficiency(Math.min(1, ideal + 0.55), ideal)).toBeLessThan(0.2);
  });
});

describe('ship dynamics', () => {
  it('accelerates from forces instead of teleporting position', () => {
    const ship = new ShipDynamics();
    const wind = { direction: 90 * DEG, speed: 10, gust: 0.2 };
    for (let i = 0; i < 600; i += 1) ship.update(1 / 60, i / 60, { steer: 0, sail: 0.42, rowing: 0 }, wind, 1);
    expect(ship.telemetry.speed).toBeGreaterThan(0.25);
    expect(ship.state.distance).toBeGreaterThan(1);
    expect(ship.state.distance).toBeLessThan(300);
  });

  it('keeps the hull response finite in rough water', () => {
    const ship = new ShipDynamics();
    const wind = { direction: 115 * DEG, speed: 18, gust: 0.8 };
    for (let i = 0; i < 2400; i += 1) ship.update(1 / 60, i / 60, { steer: Math.sin(i / 180), sail: 0.62, rowing: 0.1 }, wind, 2.1);
    for (const value of [ship.state.y, ship.state.pitch, ship.state.roll, ship.state.yaw, ship.telemetry.speed]) expect(Number.isFinite(value)).toBe(true);
    expect(Math.abs(ship.state.pitch)).toBeLessThanOrEqual(24 * DEG + 1e-6);
    expect(Math.abs(ship.state.roll)).toBeLessThanOrEqual(31 * DEG + 1e-6);
  });
});
