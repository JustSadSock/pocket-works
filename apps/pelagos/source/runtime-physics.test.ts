import { describe, expect, it } from 'vitest';
import './sea-profile';
import './marine-refit';
import './marine-tuning';
import './presence-physics';
import './displacement-refit';
import './hydrodynamics-refit';
import './ship-modules';
import { DEG, ShipDynamics } from './core';
import { ACTIVE_SHIP } from './ship-config';
import { sampleHullSupport } from './hydrodynamics-refit';

describe('PELAGOS production dynamics stack', () => {
  it('preserves right-helm/right-turn semantics through every physics wrapper', () => {
    const ship = new ShipDynamics();
    ship.state.velocityZ = 3.2;
    const calm = { direction: 0, speed: 0, gust: 0 };

    for (let i = 0; i < 300; i += 1) {
      ship.update(1 / 60, i / 60, { steer: 1, sail: 0.42, rowing: 0 }, calm, 0);
    }

    expect(ship.state.rudder).toBeGreaterThan(24 * DEG);
    expect(ship.state.yawVelocity).toBeGreaterThan(0);
    expect(ship.state.yaw).toBeGreaterThan(0.008);

    for (let i = 300; i < 480; i += 1) {
      ship.update(1 / 60, i / 60, { steer: 0, sail: 0.42, rowing: 0 }, calm, 0);
    }
    expect(Math.abs(ship.state.rudder)).toBeLessThan(6 * DEG);
  });

  it('keeps modular rowing as one water-contact-gated propulsion path', () => {
    const rowing = new ShipDynamics();
    const idle = new ShipDynamics();
    const calm = { direction: 0, speed: 0, gust: 0 };

    for (let i = 0; i < 900; i += 1) {
      const time = i / 60;
      rowing.update(1 / 60, time, { steer: 0, sail: 0.42, rowing: 1 }, calm, 0.18);
      idle.update(1 / 60, time, { steer: 0, sail: 0.42, rowing: 0 }, calm, 0.18);
    }

    expect(ACTIVE_SHIP.oars.stations.length).toBe(6);
    expect(rowing.telemetry.forwardSpeed).toBeGreaterThan(0.10);
    expect(rowing.state.distance).toBeGreaterThan(idle.state.distance + 0.8);
    expect(Math.abs(idle.telemetry.forwardSpeed)).toBeLessThan(0.06);
  });

  it('keeps the stern supported in rough water instead of launching the cutter', () => {
    const ship = new ShipDynamics();
    const wind = { direction: 110 * DEG, speed: 15, gust: 0.65 };
    let maxClearance = -Infinity;
    let maxSternExposure = 0;
    let maxPitch = 0;

    for (let i = 0; i < 7200; i += 1) {
      const time = i / 60;
      ship.update(1 / 60, time, { steer: Math.sin(time * 0.17) * 0.32, sail: 0.52, rowing: 0 }, wind, 1.18);
      const support = sampleHullSupport(ship.state, time, 1.18);
      maxClearance = Math.max(maxClearance, ship.state.y - (support.waterReference + 0.56));
      maxSternExposure = Math.max(maxSternExposure, support.sternExposure);
      maxPitch = Math.max(maxPitch, Math.abs(ship.state.pitch));
      expect(Number.isFinite(ship.state.y)).toBe(true);
      expect(Number.isFinite(ship.state.verticalVelocity)).toBe(true);
    }

    expect(maxClearance).toBeLessThan(0.62);
    expect(maxSternExposure).toBeLessThan(0.55);
    expect(maxPitch).toBeLessThan(10.6 * DEG);
  });
});
