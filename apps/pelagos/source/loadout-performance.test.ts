import { describe, expect, it } from 'vitest';
import { ShipDynamics } from './core';
import {
  DIMENSION_MODULES,
  OAR_MODULES,
  PALETTE_MODULES,
  SAIL_MODULES,
  setActiveShipLoadout,
  setShipModule,
  type ShipLoadout
} from './ship-loadout';
import { performanceProfile } from './loadout-performance';

function loadout(
  dimensions: keyof typeof DIMENSION_MODULES,
  sails: keyof typeof SAIL_MODULES,
  oars: keyof typeof OAR_MODULES
): ShipLoadout {
  return {
    id: 'test',
    label: 'Test cutter',
    dimensions: { ...DIMENSION_MODULES[dimensions].value },
    palette: { ...PALETTE_MODULES.seafoam.value },
    sails: { ...SAIL_MODULES[sails].value },
    oars: { ...OAR_MODULES[oars].value }
  };
}

function simulateHull(dimensions: 'harbor' | 'highboard'): { speed: number; yawVelocity: number } {
  setActiveShipLoadout('long-cutter');
  setShipModule('dimensions', dimensions);
  const dynamics = new ShipDynamics();
  const wind = { direction: 0, speed: 0, gust: 0 };
  let time = 0;

  for (let frame = 0; frame < 240; frame += 1) {
    dynamics.update(1 / 60, time, { steer: 0, sail: 0.42, rowing: 1 }, wind, 0);
    time += 1 / 60;
  }
  const speed = Math.hypot(dynamics.state.velocityX, dynamics.state.velocityZ);

  for (let frame = 0; frame < 90; frame += 1) {
    dynamics.update(1 / 60, time, { steer: 1, sail: 0.42, rowing: 1 }, wind, 0);
    time += 1 / 60;
  }

  return { speed, yawVelocity: Math.abs(dynamics.state.yawVelocity) };
}

describe('PELAGOS modular performance', () => {
  it('keeps Long Cutter / Working Gaff / Balanced Sweeps as the exact handling reference', () => {
    const profile = performanceProfile(loadout('long', 'working-gaff', 'balanced-sweeps'));
    expect(profile.inertiaResponse).toBeCloseTo(1, 8);
    expect(profile.forwardDrag).toBeCloseTo(1, 8);
    expect(profile.lateralGrip).toBeCloseTo(1, 8);
    expect(profile.turnResponse).toBeCloseTo(1, 8);
    expect(profile.sailArea).toBeCloseTo(1, 8);
    expect(profile.oarPower).toBeCloseTo(1, 8);
  });

  it('makes small harbor hulls more responsive and heavy highboard hulls better in the sea', () => {
    const harbor = performanceProfile(loadout('harbor', 'working-gaff', 'balanced-sweeps'));
    const highboard = performanceProfile(loadout('highboard', 'working-gaff', 'balanced-sweeps'));
    expect(harbor.inertiaResponse).toBeGreaterThan(1.15);
    expect(highboard.inertiaResponse).toBeLessThan(0.82);
    expect(harbor.turnResponse).toBeGreaterThan(highboard.turnResponse + 0.35);
    expect(harbor.scores.agility).toBeGreaterThan(highboard.scores.agility + 20);
    expect(highboard.scores.seakeeping).toBeGreaterThan(harbor.scores.seakeeping + 12);
  });

  it('gives storm sails less drive and heavy sweeps more rowing authority', () => {
    const storm = performanceProfile(loadout('long', 'storm-gaff', 'balanced-sweeps'));
    const working = performanceProfile(loadout('long', 'working-gaff', 'balanced-sweeps'));
    const heavy = performanceProfile(loadout('long', 'working-gaff', 'heavy-sweeps'));
    const harborOars = performanceProfile(loadout('long', 'working-gaff', 'harbor-sweeps'));
    expect(storm.sailArea).toBeLessThan(0.60);
    expect(working.sailArea).toBeCloseTo(1, 8);
    expect(heavy.oarPower).toBeGreaterThan(1.15);
    expect(harborOars.oarPower).toBeLessThan(0.90);
    expect(heavy.scores.rowing).toBeGreaterThan(harborOars.scores.rowing + 12);
  });

  it('changes real fixed-step acceleration and helm response when the hull module changes', () => {
    const harbor = simulateHull('harbor');
    const highboard = simulateHull('highboard');
    setActiveShipLoadout('long-cutter');

    expect(harbor.speed).toBeGreaterThan(highboard.speed * 1.12);
    expect(harbor.yawVelocity).toBeGreaterThan(highboard.yawVelocity * 1.15);
  });
});
