import { describe, expect, it } from 'vitest';
import {
  DIMENSION_MODULES,
  OAR_MODULES,
  PALETTE_MODULES,
  SAIL_MODULES,
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
});
