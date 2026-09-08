import { describe, expect, it } from 'vitest';
import './sea-profile';
import { DEG, ShipDynamics } from './core';
import { getPresencePhysicsFrame, seaEnvelope } from './presence-physics';

describe('PELAGOS presence pass', () => {
  it('creates broad but bounded spatial wave groups', () => {
    const values: number[] = [];
    for (let x = -180; x <= 180; x += 45) {
      for (let z = -140; z <= 140; z += 40) values.push(seaEnvelope(x, z, 37));
    }
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0.76);
    expect(Math.max(...values)).toBeLessThanOrEqual(1.24);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.18);
  });

  it('filters helm input before a heavy hull develops turn rate', () => {
    const ship = new ShipDynamics();
    const wind = { direction: 1.1, speed: 10, gust: 0.2 };
    for (let i = 0; i < 5; i += 1) ship.update(1 / 60, i / 60, { steer: 1, sail: 0.48, rowing: 0 }, wind, 1);
    expect(Math.abs(ship.state.rudder)).toBeLessThan(2.0 * DEG);
    for (let i = 5; i < 150; i += 1) ship.update(1 / 60, i / 60, { steer: 1, sail: 0.48, rowing: 0 }, wind, 1);
    expect(Math.abs(ship.state.rudder)).toBeGreaterThan(8 * DEG);
    expect(Math.abs(ship.state.yawVelocity)).toBeLessThan(0.5);
  });

  it('stays finite through long grouped rough-water sailing', () => {
    const ship = new ShipDynamics();
    for (let i = 0; i < 7200; i += 1) {
      const time = i / 60;
      const controls = {
        steer: Math.sin(time * 0.21) * 0.82,
        sail: 0.28 + (Math.sin(time * 0.11) * 0.5 + 0.5) * 0.62,
        rowing: i % 900 > 760 ? 0.8 : 0
      };
      const wind = {
        direction: 0.8 + Math.sin(time * 0.035) * 0.6,
        speed: 8.5 + Math.sin(time * 0.17) * 4.2,
        gust: Math.sin(time * 0.61) * 0.5 + 0.5
      };
      ship.update(1 / 60, time, controls, wind, 1.48);
      const s = ship.state;
      expect(Number.isFinite(s.x + s.z + s.y + s.yaw + s.pitch + s.roll)).toBe(true);
      expect(Math.abs(s.pitch)).toBeLessThanOrEqual(16.01 * DEG);
      expect(Math.abs(s.roll)).toBeLessThanOrEqual(23.01 * DEG);
    }
    const frame = getPresencePhysicsFrame(ship);
    expect(frame.seaScale).toBeGreaterThan(0.7);
    expect(frame.seaScale).toBeLessThan(1.9);
    expect(frame.slam).toBeGreaterThanOrEqual(0);
    expect(frame.slam).toBeLessThanOrEqual(1);
  });
});
