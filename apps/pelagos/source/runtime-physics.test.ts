import { describe, expect, it } from 'vitest';
import './sea-profile';
import './marine-refit';
import './marine-tuning';
import './presence-physics';
import { DEG, ShipDynamics } from './core';

describe('PELAGOS production dynamics stack', () => {
  it('preserves right-helm/right-turn semantics through every physics wrapper', () => {
    const ship = new ShipDynamics();
    ship.state.velocityZ = 3.2;
    const calm = { direction: 0, speed: 0, gust: 0 };

    for (let i = 0; i < 240; i += 1) {
      ship.update(1 / 60, i / 60, { steer: 1, sail: 0.42, rowing: 0 }, calm, 0);
    }

    expect(ship.state.rudder).toBeGreaterThan(24 * DEG);
    expect(ship.state.yawVelocity).toBeGreaterThan(0);
    expect(ship.state.yaw).toBeGreaterThan(0.01);

    for (let i = 240; i < 390; i += 1) {
      ship.update(1 / 60, i / 60, { steer: 0, sail: 0.42, rowing: 0 }, calm, 0);
    }
    expect(Math.abs(ship.state.rudder)).toBeLessThan(6 * DEG);
  });

  it('keeps rowing as one water-contact-gated propulsion path', () => {
    const rowing = new ShipDynamics();
    const idle = new ShipDynamics();
    const calm = { direction: 0, speed: 0, gust: 0 };

    for (let i = 0; i < 720; i += 1) {
      const time = i / 60;
      rowing.update(1 / 60, time, { steer: 0, sail: 0.42, rowing: 1 }, calm, 0);
      idle.update(1 / 60, time, { steer: 0, sail: 0.42, rowing: 0 }, calm, 0);
    }

    expect(rowing.telemetry.forwardSpeed).toBeGreaterThan(0.12);
    expect(rowing.state.distance).toBeGreaterThan(idle.state.distance + 1.0);
    expect(Math.abs(idle.telemetry.forwardSpeed)).toBeLessThan(0.03);
  });
});
