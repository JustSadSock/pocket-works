import { describe, expect, it } from 'vitest';
import { applyImpact, computeImpactSeverity, createDamageState, deriveDamageEffects, type ImpactInput } from './damage';

const base: ImpactInput = {
  force: 18000,
  dt: 1 / 60,
  relativeSpeed: 11.11,
  ownMass: 1490,
  otherMass: 1e9,
  obstacleStiffness: 1.8,
  contactArea: 0.8,
  angleCos: 1,
  zone: 'front',
  crushResistance: 1
};

describe('dynamic damage', () => {
  it('distinguishes low and high speed impacts', () => {
    const state = createDamageState();
    const low = computeImpactSeverity({ ...base, relativeSpeed: 2.78, force: 5500 }, state);
    const mid = computeImpactSeverity(base, state);
    const high = computeImpactSeverity({ ...base, relativeSpeed: 24, force: 46000 }, state);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(low).toBeLessThan(0.08);
    expect(high).toBeGreaterThan(0.45);
  });

  it('makes a repeated hit into a weakened zone more severe', () => {
    const state = createDamageState();
    const first = applyImpact(state, base);
    const second = applyImpact(state, base);
    expect(second).toBeGreaterThan(first);
    expect(state.zoneDamage.front).toBeGreaterThan(0);
    expect(state.components.engine).toBeLessThan(1);
  });

  it('concentrates pole impacts more than broad wall impacts', () => {
    const wallState = createDamageState();
    const poleState = createDamageState();
    const wall = computeImpactSeverity({ ...base, contactArea: 1.8 }, wallState);
    const pole = computeImpactSeverity({ ...base, contactArea: 0.16 }, poleState);
    expect(pole).toBeGreaterThan(wall);
  });

  it('turns suspension asymmetry into steering pull', () => {
    const state = createDamageState();
    state.components.suspensionFL = 0.18;
    state.components.wheelFL = 0.3;
    const effects = deriveDamageEffects(state);
    expect(Math.abs(effects.steeringPull)).toBeGreaterThan(0.1);
    expect(effects.steeringAuthority).toBeLessThan(0.7);
  });
});
