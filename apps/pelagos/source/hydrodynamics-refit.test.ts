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

  it('moves like a heavy displacement hull instead of hopping over rough water', () => {
    setActiveShipLoadout('long-cutter');
    const dynamics = new ShipDynamics();
    dynamics.reset();
    const wind = { direction: 42 * DEG, speed: 11, gust: 0.35 };
    let time = 0;
    let maximumSternUpPitch = 0;
    let minimumBowUpPitch = 0;
    let maximumAirGap = -Infinity;
    let maximumSternGap = -Infinity;
    let maximumVerticalSpeed = 0;
    let maximumSternGuard = 0;
    let minimumImmersionBias = Infinity;

    for (let step = 0; step < 1500; step += 1) {
      const dt = 1 / 60;
      time += dt;
      dynamics.update(dt, time, { steer: 0.55, sail: 0.62, rowing: step < 180 ? 0.75 : 0 }, wind, 1.95);
      expect(Number.isFinite(dynamics.state.y)).toBe(true);
      expect(Number.isFinite(dynamics.state.pitch)).toBe(true);
      expect(Number.isFinite(dynamics.state.roll)).toBe(true);
      maximumSternUpPitch = Math.max(maximumSternUpPitch, dynamics.state.pitch);
      minimumBowUpPitch = Math.min(minimumBowUpPitch, dynamics.state.pitch);
      maximumVerticalSpeed = Math.max(maximumVerticalSpeed, Math.abs(dynamics.state.verticalVelocity));
      const liveFrame = getHydrodynamicsFrame(dynamics);
      if (liveFrame) {
        maximumAirGap = Math.max(maximumAirGap, dynamics.state.y - liveFrame.targetY);
        maximumSternGap = Math.max(maximumSternGap, liveFrame.sternGap);
        maximumSternGuard = Math.max(maximumSternGuard, liveFrame.sternLiftGuard);
        minimumImmersionBias = Math.min(minimumImmersionBias, liveFrame.immersionBias);
      }
    }

    const frame = getHydrodynamicsFrame(dynamics);
    expect(frame).not.toBeNull();
    expect(maximumSternUpPitch).toBeLessThanOrEqual(3.5 * DEG + 1e-6);
    expect(minimumBowUpPitch).toBeGreaterThanOrEqual(-7.2 * DEG - 1e-6);
    expect(Math.abs(dynamics.state.roll)).toBeLessThanOrEqual(11.5 * DEG + 1e-6);
    expect(maximumVerticalSpeed).toBeLessThanOrEqual(0.66);
    expect(maximumAirGap).toBeLessThanOrEqual(0.26);
    expect(maximumSternGap).toBeLessThanOrEqual(0.22);
    expect(minimumImmersionBias).toBeGreaterThanOrEqual(0.099);
    expect(frame?.breachGuard ?? 0).toBeGreaterThanOrEqual(0);
    expect(frame?.breachGuard ?? 0).toBeLessThanOrEqual(1);
    expect(maximumSternGuard).toBeGreaterThanOrEqual(0);
    expect(maximumSternGuard).toBeLessThanOrEqual(1);
  });

  it('keeps every selectable hull size stable in rough water', () => {
    const wind = { direction: 57 * DEG, speed: 12.5, gust: 0.42 };
    for (const moduleId of ['harbor', 'long', 'bluewater', 'highboard']) {
      setActiveShipLoadout('long-cutter');
      expect(setShipModule('dimensions', moduleId)).toBe(true);
      const dynamics = new ShipDynamics();
      dynamics.reset();
      let time = 0;
      let maxVerticalSpeed = 0;
      let maxSternGap = -Infinity;

      for (let step = 0; step < 720; step += 1) {
        const dt = 1 / 60;
        time += dt;
        dynamics.update(dt, time, { steer: 0.42, sail: 0.58, rowing: step < 90 ? 0.5 : 0 }, wind, 1.72);
        maxVerticalSpeed = Math.max(maxVerticalSpeed, Math.abs(dynamics.state.verticalVelocity));
        const frame = getHydrodynamicsFrame(dynamics);
        if (frame) maxSternGap = Math.max(maxSternGap, frame.sternGap);
      }

      expect(Number.isFinite(dynamics.state.y)).toBe(true);
      expect(Number.isFinite(dynamics.state.pitch)).toBe(true);
      expect(Number.isFinite(dynamics.state.roll)).toBe(true);
      expect(maxVerticalSpeed).toBeLessThanOrEqual(0.80);
      expect(dynamics.state.pitch).toBeLessThanOrEqual(3.5 * DEG + 1e-6);
      expect(dynamics.state.pitch).toBeGreaterThanOrEqual(-7.2 * DEG - 1e-6);
      expect(Math.abs(dynamics.state.roll)).toBeLessThanOrEqual(11.5 * DEG + 1e-6);
      expect(maxSternGap).toBeLessThanOrEqual(0.32);
    }
    setActiveShipLoadout('long-cutter');
  });

  it('keeps a mostly submerged rudder visually occluded by translucent water', () => {
    expect(appendageVisibility(-1.8, -0.6, -1.2, 0.64, 0.96)).toBe(0);
    const partial = appendageVisibility(-1.8, -0.6, -1.45, 0.64, 0.96);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
    expect(appendageVisibility(-1.8, -0.6, -1.78, 0.64, 0.96)).toBeCloseTo(1, 5);
  });
});
