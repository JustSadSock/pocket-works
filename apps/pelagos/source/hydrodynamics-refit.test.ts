import { describe, expect, it } from 'vitest';
import './sea-profile';
import './marine-refit';
import './marine-tuning';
import './presence-physics';
import './hydrodynamics-refit';
import { DEG, ShipDynamics } from './core';
import { getHydrodynamicsFrame } from './hydrodynamics-refit';
import { appendageVisibility } from './stern-immersion';
import {
  DIMENSION_MODULES,
  OAR_MODULES,
  PALETTE_MODULES,
  SAIL_MODULES,
  getActiveShipLoadout,
  getOarStations,
  getShipLoadoutSnapshot,
  getShipModuleSelection,
  setActiveShipLoadout,
  setShipModule,
  setShipModuleFromPreset,
  setShipPalette
} from './ship-loadout';

describe('PELAGOS modular hull and hydrodynamics', () => {
  it('uses a larger default hull with a denser configurable rowing bank', () => {
    expect(setActiveShipLoadout('long-cutter')).toBe(true);
    const loadout = getActiveShipLoadout();
    expect(loadout.dimensions.length).toBeCloseTo(12.8, 4);
    expect(loadout.dimensions.beam).toBeCloseTo(3.9, 4);
    expect(getOarStations(loadout.oars)).toHaveLength(6);
  });

  it('exposes a useful independent module catalog for the shipyard', () => {
    expect(Object.keys(DIMENSION_MODULES)).toHaveLength(4);
    expect(Object.keys(PALETTE_MODULES)).toHaveLength(5);
    expect(Object.keys(SAIL_MODULES)).toHaveLength(4);
    expect(Object.keys(OAR_MODULES)).toHaveLength(4);
    expect(DIMENSION_MODULES.highboard.value.length).toBeGreaterThan(DIMENSION_MODULES.harbor.value.length);
    expect(OAR_MODULES['harbor-sweeps'].value.stationsPerSide).toBe(8);
  });

  it('can swap hull size, paint, sails and oars independently instead of only whole presets', () => {
    expect(setActiveShipLoadout('long-cutter')).toBe(true);
    expect(setShipModule('dimensions', 'highboard')).toBe(true);
    expect(setShipModuleFromPreset('sails', 'storm-cutter')).toBe(true);
    expect(setShipModule('oars', 'harbor-sweeps')).toBe(true);
    expect(setShipModule('palette', 'navy')).toBe(true);
    setShipPalette({ hull: '#123456', sail: '#abcdef' });

    const custom = getShipLoadoutSnapshot();
    const selection = getShipModuleSelection();
    expect(custom.id).toBe('custom');
    expect(custom.dimensions.length).toBeCloseTo(15.6, 4);
    expect(custom.sails.id).toBe('storm-gaff');
    expect(custom.oars.id).toBe('harbor-sweeps');
    expect(getOarStations(custom.oars)).toHaveLength(8);
    expect(custom.palette.hull).toBe('#123456');
    expect(custom.palette.sail).toBe('#abcdef');
    expect(selection.dimensions).toBe('highboard');
    expect(selection.oars).toBe('harbor-sweeps');
    expect(selection.palette).toBe('custom');

    expect(setActiveShipLoadout('long-cutter')).toBe(true);
  });

  it('keeps a heavy hull coupled to the sea instead of lifting the transom clear of a crest', () => {
    setActiveShipLoadout('long-cutter');
    const dynamics = new ShipDynamics();
    dynamics.reset();
    const wind = { direction: 42 * DEG, speed: 11, gust: 0.35 };
    let time = 0;
    let minimumPitch = 0;
    let maximumAirGap = -Infinity;
    let maximumSternGuard = 0;

    for (let step = 0; step < 1200; step += 1) {
      const dt = 1 / 60;
      time += dt;
      dynamics.update(dt, time, { steer: 0.55, sail: 0.62, rowing: step < 180 ? 0.75 : 0 }, wind, 1.85);
      expect(Number.isFinite(dynamics.state.y)).toBe(true);
      expect(Number.isFinite(dynamics.state.pitch)).toBe(true);
      expect(Number.isFinite(dynamics.state.roll)).toBe(true);
      minimumPitch = Math.min(minimumPitch, dynamics.state.pitch);
      const liveFrame = getHydrodynamicsFrame(dynamics);
      if (liveFrame) {
        maximumAirGap = Math.max(maximumAirGap, dynamics.state.y - liveFrame.targetY);
        maximumSternGuard = Math.max(maximumSternGuard, liveFrame.sternLiftGuard);
      }
    }

    const frame = getHydrodynamicsFrame(dynamics);
    expect(frame).not.toBeNull();
    expect(minimumPitch).toBeGreaterThanOrEqual(-5.0 * DEG - 1e-6);
    expect(Math.abs(dynamics.state.roll)).toBeLessThanOrEqual(14.5 * DEG + 1e-6);
    expect(maximumAirGap).toBeLessThanOrEqual(0.49);
    expect(frame?.breachGuard ?? 0).toBeGreaterThanOrEqual(0);
    expect(frame?.breachGuard ?? 0).toBeLessThanOrEqual(1);
    expect(maximumSternGuard).toBeGreaterThanOrEqual(0);
    expect(maximumSternGuard).toBeLessThanOrEqual(1);
  });

  it('keeps a mostly submerged rudder visually occluded by translucent water', () => {
    expect(appendageVisibility(-1.8, -0.6, -0.72, 0.46, 0.84)).toBe(0);
    const partial = appendageVisibility(-1.8, -0.6, -1.28, 0.46, 0.84);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
    expect(appendageVisibility(-1.8, -0.6, -1.7, 0.46, 0.84)).toBeCloseTo(1, 5);
  });
});
