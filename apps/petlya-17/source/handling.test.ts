import { describe, expect, it } from 'vitest';
import {
  cornerSpeedKmh,
  createVehicleDynamics,
  racingLineTarget,
  resolveVehicleContact,
  stepVehicle
} from './handling';

describe('Petlya 17 handling model', () => {
  it('accelerates and respects the configured speed ceiling', () => {
    let state = createVehicleDynamics();
    for (let i = 0; i < 2400; i += 1) {
      state = stepVehicle(state, {
        steer: 0,
        throttle: 1,
        brake: 0,
        curvature: 0,
        offroad: 0,
        drafting: 0,
        maxSpeed: 322
      }, 1 / 60);
    }
    expect(state.speed).toBeGreaterThan(250);
    expect(state.speed).toBeLessThanOrEqual(323);
  });

  it('loses grip when corner demand exceeds the tyre budget', () => {
    const stable = stepVehicle({ ...createVehicleDynamics(210) }, {
      steer: 0.12,
      throttle: 0.4,
      brake: 0,
      curvature: 0.006,
      offroad: 0,
      drafting: 0
    }, 1 / 30);
    const overloaded = stepVehicle({ ...createVehicleDynamics(285) }, {
      steer: 1,
      throttle: 0.7,
      brake: 0,
      curvature: 0.032,
      offroad: 0,
      drafting: 0
    }, 1 / 30);
    expect(stable.grip).toBeGreaterThan(overloaded.grip);
    expect(overloaded.atLimit).toBe(true);
  });

  it('moves the car laterally and develops a slip angle', () => {
    let state = createVehicleDynamics(190);
    let lane = 0;
    for (let i = 0; i < 90; i += 1) {
      const step = stepVehicle(state, {
        steer: 0.75,
        throttle: 0.5,
        brake: 0,
        curvature: 0.01,
        offroad: 0,
        drafting: 0
      }, 1 / 60);
      lane += step.laneDelta;
      state = step;
    }
    expect(Math.abs(lane)).toBeGreaterThan(0.2);
    expect(Math.abs(state.slipAngle)).toBeGreaterThan(0.01);
  });

  it('sets lower target speeds for tighter corners', () => {
    expect(cornerSpeedKmh(0.002)).toBeGreaterThan(cornerSpeedKmh(0.02));
    expect(cornerSpeedKmh(0)).toBe(312);
  });

  it('prepares outside and attacks the apex inside', () => {
    const beforeCorner = racingLineTarget(0.002, 0.02, 4.7, 0.7);
    const atApex = racingLineTarget(0.02, 0.014, 4.7, 0.7);
    expect(Math.sign(beforeCorner)).toBe(-Math.sign(atApex));
    expect(Math.abs(atApex)).toBeGreaterThan(1);
  });

  it('exchanges longitudinal and lateral momentum during contact', () => {
    const response = resolveVehicleContact(280, 230, 0.7, 0.8);
    expect(response.playerSpeedDelta).toBeLessThan(0);
    expect(response.opponentSpeedDelta).toBeGreaterThan(0);
    expect(response.playerLateralImpulse).toBeLessThan(0);
    expect(response.opponentLateralImpulse).toBeGreaterThan(0);
    expect(response.severity).toBeGreaterThan(0.5);
  });
});
