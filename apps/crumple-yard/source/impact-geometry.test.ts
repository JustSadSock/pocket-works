import { describe, it, expect } from 'vitest';
import { wheelContactLoad } from './impact-geometry';
import { applyImpact, createDamageState, type ImpactInput } from './damage';

const car = { width: 1.86, wheelBase: 2.82, wheelRadius: 0.335 };
const strike: ImpactInput = {
  force: 300000, dt: 1 / 90, relativeSpeed: 30 / 3.6,
  ownMass: 1490, otherMass: Number.POSITIVE_INFINITY, obstacleStiffness: 2.05,
  contactArea: 1.1, angleCos: 1, zone: 'front', crushResistance: 1
};

describe('localized damage regression', () => {
  it('a 30 km/h frontal wall impact produces meaningful body damage, not one percent', () => {
    const state = createDamageState();
    const severity = applyImpact(state, strike);
    expect(severity).toBeGreaterThan(0.2);
    expect(state.zoneDamage.front).toBeGreaterThan(0.13);
    expect(state.components.frontStructure).toBeLessThan(0.84);
  });
  it('a centered front impact does not damage any wheel or strut', () => {
    const state = createDamageState();
    applyImpact(state, strike);
    expect(state.components.wheelFL).toBe(1);
    expect(state.components.wheelFR).toBe(1);
    expect(state.components.wheelRL).toBe(1);
    expect(state.components.wheelRR).toBe(1);
    expect(state.components.suspensionFL).toBe(1);
    expect(state.components.suspensionFR).toBe(1);
    expect(wheelContactLoad({x:0,z:car.wheelBase}, car, 0.5)).toBe(0);
  });
  it('an arch strike loads one near axle, with no need to bend opposite wheels', () => {
    const nose = wheelContactLoad({x:-0.88,z:car.wheelBase/2},car,0.4);
    const center = wheelContactLoad({x:0,z:car.wheelBase/2},car,0.4);
    const frontTip = wheelContactLoad({x:-0.88,z:car.wheelBase},car,0.4);
    expect(nose).toBeGreaterThan(0.8);
    expect(center).toBe(0);
    expect(frontTip).toBe(0);
  });
  it('deep oblique crushing can reach an axle from beyond the arch', () => {
    expect(wheelContactLoad({x:0.89,z:car.wheelBase},car,0.85)).toBeGreaterThan(0.2);
  });
});
