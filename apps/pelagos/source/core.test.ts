import { describe, expect, it } from 'vitest';
import {
  DEG,
  ShipDynamics,
  idealSailTrim,
  sailTrimEfficiency,
  sailingPolar,
  sampleWave,
  waveHeightAt,
  windSourceAngleFromFlow
} from './core';

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
  it('converts apparent airflow to the conventional wind-source angle', () => {
    expect(Math.abs(windSourceAngleFromFlow(0))).toBeCloseTo(Math.PI, 10);
    expect(windSourceAngleFromFlow(Math.PI)).toBeCloseTo(0, 10);
  });

  it('has a genuine headwind no-go zone and a strong reaching zone', () => {
    // Air moving toward the stern (π in the ship frame) comes from directly ahead.
    expect(sailingPolar(Math.PI)).toBeLessThan(0.05);
    expect(sailingPolar(90 * DEG)).toBeGreaterThan(0.95);
    // Air moving straight forward comes from astern and remains useful, but weaker than a reach.
    expect(sailingPolar(0)).toBeGreaterThan(0.45);
    expect(sailingPolar(0)).toBeLessThan(sailingPolar(90 * DEG));
  });

  it('rewards a correctly trimmed sail for the airflow convention used by telemetry', () => {
    const airflowAngle = -98 * DEG;
    const ideal = idealSailTrim(airflowAngle);
    expect(sailTrimEfficiency(ideal, ideal)).toBeCloseTo(1, 8);
    expect(sailTrimEfficiency(Math.min(1, ideal + 0.55), ideal)).toBeLessThan(0.2);
  });
});

describe('ship dynamics', () => {
  it('settles with real freeboard instead of floating with the deck at water level', () => {
    const ship = new ShipDynamics();
    const wind = { direction: 0, speed: 0, gust: 0 };
    for (let i = 0; i < 1800; i += 1) ship.update(1 / 60, i / 60, { steer: 0, sail: 0.42, rowing: 0 }, wind, 0);
    expect(ship.state.y).toBeGreaterThan(0.52);
    expect(ship.state.y).toBeLessThan(0.66);
    expect(Math.abs(ship.state.verticalVelocity)).toBeLessThan(0.02);
  });

  it('accelerates from forces instead of teleporting position', () => {
    const ship = new ShipDynamics();
    const airflowAngle = 90 * DEG;
    const wind = { direction: airflowAngle, speed: 10, gust: 0.2 };
    const trim = idealSailTrim(airflowAngle);
    ship.state.sailAngle = trim;
    for (let i = 0; i < 600; i += 1) ship.update(1 / 60, i / 60, { steer: 0, sail: trim, rowing: 0 }, wind, 1);
    expect(ship.telemetry.speed).toBeGreaterThan(0.25);
    expect(ship.state.distance).toBeGreaterThan(1);
    expect(ship.state.distance).toBeLessThan(300);
  });

  it('turns right for a right helm command', () => {
    const ship = new ShipDynamics();
    ship.state.velocityZ = 3;
    const wind = { direction: 0, speed: 0, gust: 0 };
    for (let i = 0; i < 180; i += 1) ship.update(1 / 60, i / 60, { steer: 1, sail: 0.5, rowing: 0 }, wind, 0);
    expect(ship.state.rudder).toBeGreaterThan(20 * DEG);
    expect(ship.state.yaw).toBeGreaterThan(0.004);
  });

  it('keeps the heavier hull response finite in rough water', () => {
    const ship = new ShipDynamics();
    const wind = { direction: 115 * DEG, speed: 18, gust: 0.8 };
    for (let i = 0; i < 2400; i += 1) ship.update(1 / 60, i / 60, { steer: Math.sin(i / 180), sail: 0.62, rowing: 0.1 }, wind, 2.1);
    for (const value of [ship.state.y, ship.state.pitch, ship.state.roll, ship.state.yaw, ship.telemetry.speed]) expect(Number.isFinite(value)).toBe(true);
    expect(Math.abs(ship.state.pitch)).toBeLessThanOrEqual(16 * DEG + 1e-6);
    expect(Math.abs(ship.state.roll)).toBeLessThanOrEqual(23 * DEG + 1e-6);
  });
});
