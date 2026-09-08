import { describe, expect, it } from 'vitest';
import { ACTIVE_SHIP, DEFAULT_LOADOUT, SHIPS, resolveShip } from './ship-config';

describe('PELAGOS modular vessel definitions', () => {
  it('defines the current cutter at an explicit 30-foot scale', () => {
    const ship = ACTIVE_SHIP.definition;
    expect(ship.id).toBe('pelagos-cutter-9m');
    expect(ship.dimensions.hullLength).toBeCloseTo(9.13, 2);
    expect(ship.dimensions.beam).toBeCloseTo(3.48, 2);
    expect(ship.dimensions.overallLength).toBeGreaterThan(ship.dimensions.hullLength);
    expect(ship.dimensions.displacementKg).toBeGreaterThan(5000);
  });

  it('ships with a twelve-oar default and multiple swappable modules', () => {
    expect(ACTIVE_SHIP.oars.stations.length * 2).toBe(12);
    expect(ACTIVE_SHIP.definition.palettes.length).toBeGreaterThanOrEqual(3);
    expect(ACTIVE_SHIP.definition.sails.length).toBeGreaterThanOrEqual(3);
    expect(ACTIVE_SHIP.definition.oarSets.length).toBeGreaterThanOrEqual(3);
  });

  it('resolves invalid persisted equipment back to a coherent ship', () => {
    const resolved = resolveShip({
      shipId: 'missing-hull',
      paletteId: 'missing-paint',
      sailPlanId: 'missing-sail',
      oarSetId: 'missing-oars'
    });
    expect(resolved.definition).toBe(SHIPS[0]);
    expect(resolved.palette).toBe(SHIPS[0].palettes[0]);
    expect(resolved.sail).toBe(SHIPS[0].sails[0]);
    expect(resolved.oars).toBe(SHIPS[0].oarSets[0]);
    expect(resolved.loadout).toEqual(DEFAULT_LOADOUT);
  });
});
