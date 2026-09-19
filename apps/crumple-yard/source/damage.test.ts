import { describe, expect, it } from 'vitest';
import { applyImpact, computeImpactSeverity, createDamageState, deriveDamageEffects, stepDrivetrainDamage, stepThermalDamage, type ImpactInput } from './damage';

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


describe('crash scenario matrix', () => {
  it('front offset distributes less symmetrically than a centered front hit', () => {
    const centered = createDamageState();
    const offset = createDamageState();
    applyImpact(centered, { ...base, relativeSpeed: 15, force: 26000, zone: 'front', contactArea: 1.1 });
    applyImpact(offset, { ...base, relativeSpeed: 15, force: 26000, zone: 'left', contactArea: 0.38, angleCos: 0.72 });
    expect(centered.components.engine).toBeLessThan(1);
    expect(offset.components.suspensionFL).toBeLessThan(1);
    expect(offset.components.sideGlassL).toBeLessThan(1);
    expect(offset.components.suspensionFR).toBe(1);
  });

  it('side and rear impacts damage different systems', () => {
    const side = createDamageState();
    const rear = createDamageState();
    applyImpact(side, { ...base, zone: 'right', relativeSpeed: 13, force: 22000, angleCos: 0.55, contactArea: 0.62 });
    applyImpact(rear, { ...base, zone: 'rear', relativeSpeed: 13, force: 22000, angleCos: 1, contactArea: 0.9 });
    expect(side.components.sideGlassR).toBeLessThan(1);
    expect(side.components.suspensionFR).toBeLessThan(1);
    expect(rear.components.taillightL).toBeLessThan(1);
    expect(rear.components.rearStructure).toBeLessThan(side.components.rearStructure);
  });

  it('another car transfers less concentrated loading than a rigid pole at the same speed', () => {
    const car = createDamageState();
    const pole = createDamageState();
    const carSeverity = computeImpactSeverity({
      ...base,
      relativeSpeed: 16,
      force: 26000,
      otherMass: 1490,
      obstacleStiffness: 1,
      contactArea: 0.9
    }, car);
    const poleSeverity = computeImpactSeverity({
      ...base,
      relativeSpeed: 16,
      force: 26000,
      otherMass: Number.POSITIVE_INFINITY,
      obstacleStiffness: 2.35,
      contactArea: 0.13
    }, pole);
    expect(poleSeverity).toBeGreaterThan(carSeverity);
  });

  it('severe wheel damage keeps degradation continuous before total failure', () => {
    const state = createDamageState();
    state.components.suspensionFR = 0.44;
    state.components.wheelFR = 0.31;
    const degraded = deriveDamageEffects(state);
    expect(degraded.wheelGrip[1]).toBeGreaterThan(0);
    expect(degraded.wheelGrip[1]).toBeLessThan(0.5);
    expect(degraded.steeringAuthority).toBeGreaterThan(0);
    expect(degraded.steeringAuthority).toBeLessThan(0.8);

    state.components.suspensionFR = 0.03;
    state.components.wheelFR = 0.01;
    const failed = deriveDamageEffects(state);
    expect(failed.wheelGrip[1]).toBeLessThan(degraded.wheelGrip[1]);
    expect(Math.abs(failed.steeringPull)).toBeGreaterThan(Math.abs(degraded.steeringPull));
  });
});


describe('mechanical depth 1.1', () => {
  it('turns suspension damage into persistent camber, toe and rolling drag', () => {
    const state = createDamageState();
    state.components.suspensionFL = 0.22;
    state.components.wheelFL = 0.48;
    const effects = deriveDamageEffects(state);
    expect(Math.abs(effects.wheelAlignment[0].camber)).toBeGreaterThan(0.35);
    expect(Math.abs(effects.wheelAlignment[0].toe)).toBeGreaterThan(0.08);
    expect(effects.wheelAlignment[0].drag).toBeGreaterThan(0.5);
    expect(effects.wheelAlignment[1].drag).toBeLessThan(0.05);
  });

  it('creates steering rack play before steering is completely lost', () => {
    const state = createDamageState();
    state.components.steering = 0.42;
    const effects = deriveDamageEffects(state);
    expect(effects.steeringPlay).toBeGreaterThan(0.2);
    expect(effects.steeringAuthority).toBeGreaterThan(0);
    expect(effects.steeringAuthority).toBeLessThan(0.8);
  });

  it('leaks coolant gradually after radiator damage and then overheats under load', () => {
    const state = createDamageState();
    state.components.cooling = 0.24;
    const initialCoolant = state.coolant;
    for (let i = 0; i < 1800; i += 1) stepThermalDamage(state, 1, 7, 1 / 60);
    expect(state.coolant).toBeLessThan(initialCoolant);
    expect(state.temperature).toBeGreaterThan(0.8);
    expect(deriveDamageEffects(state).radiatorLeak).toBeGreaterThan(0.7);
  });

  it('accumulates drivetrain stress under throttle when transmission is damaged', () => {
    const state = createDamageState();
    state.components.transmission = 0.35;
    for (let i = 0; i < 600; i += 1) stepDrivetrainDamage(state, 1, 4, 1 / 60);
    const effects = deriveDamageEffects(state);
    expect(state.drivetrainStress).toBeGreaterThan(0.4);
    expect(effects.transmissionShock).toBeGreaterThan(0.45);
    expect(effects.transmissionEfficiency).toBeLessThan(state.components.transmission);
  });

  it('makes engine output rough before total engine failure', () => {
    const state = createDamageState();
    state.components.engine = 0.38;
    state.temperature = 1.03;
    const effects = deriveDamageEffects(state);
    expect(effects.engineRoughness).toBeGreaterThan(0.4);
    expect(effects.enginePower).toBeGreaterThan(0);
  });
});
