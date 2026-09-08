import { describe, expect, it } from 'vitest';
import './sea-profile';
import './marine-refit';
import './marine-tuning';
import './presence-physics';
import './hydrodynamics-refit';
import { DEG, ShipDynamics } from './core';
import { getHydrodynamicsFrame } from './hydrodynamics-refit';
import { getActiveShipLoadout, getOarStations, setActiveShipLoadout } from './ship-loadout';

describe('PELAGOS modular hull and hydrodynamics', () => {
  it('uses a larger default hull with a denser configurable rowing bank', () => {
    expect(setActiveShipLoadout('long-cutter')).toBe(true);
    const loadout = getActiveShipLoadout();
    expect(loadout.dimensions.length).toBeCloseTo(12.8, 4);
    expect(loadout.dimensions.beam).toBeCloseTo(3.9, 4);
    expect(getOarStations(loadout.oars)).toHaveLength(6);
  });

  it('keeps a heavy hull coupled to the sea instead of launching the stern clear of the water', () => {
    setActiveShipLoadout('long-cutter');
    const dynamics = new ShipDynamics();
    dynamics.reset();
    const wind = { direction: 42 * DEG, speed: 11, gust: 0.35 };
    let time = 0;

    for (let step = 0; step < 900; step += 1) {
      const dt = 1 / 60;
      time += dt;
      dynamics.update(dt, time, { steer: 0.55, sail: 0.62, rowing: step < 180 ? 0.75 : 0 }, wind, 1.65);
      expect(Number.isFinite(dynamics.state.y)).toBe(true);
      expect(Number.isFinite(dynamics.state.pitch)).toBe(true);
      expect(Number.isFinite(dynamics.state.roll)).toBe(true);
    }

    const frame = getHydrodynamicsFrame(dynamics);
    expect(frame).not.toBeNull();
    expect(Math.abs(dynamics.state.pitch)).toBeLessThanOrEqual(11.5 * DEG + 1e-6);
    expect(Math.abs(dynamics.state.roll)).toBeLessThanOrEqual(16 * DEG + 1e-6);
    expect(dynamics.state.y - (frame?.targetY ?? dynamics.state.y)).toBeLessThanOrEqual(0.7);
    expect(frame?.breachGuard ?? 0).toBeGreaterThanOrEqual(0);
    expect(frame?.breachGuard ?? 0).toBeLessThanOrEqual(1);
  });
});
