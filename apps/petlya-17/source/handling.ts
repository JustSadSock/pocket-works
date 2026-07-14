import { clamp, lerp } from './core';

export type VehicleDynamics = {
  speed: number;
  lateralSpeed: number;
  yawOffset: number;
  yawRate: number;
  slipAngle: number;
  grip: number;
  acceleration: number;
  bodyRoll: number;
  bodyPitch: number;
};

export type VehicleInput = {
  steer: number;
  throttle: number;
  brake: number;
  curvature: number;
  offroad: number;
  drafting: number;
  maxSpeed?: number;
  gripScale?: number;
};

export type VehicleStep = VehicleDynamics & {
  laneDelta: number;
  longitudinalMeters: number;
  lateralG: number;
  atLimit: boolean;
};

export type ContactResponse = {
  playerSpeedDelta: number;
  opponentSpeedDelta: number;
  playerLateralImpulse: number;
  opponentLateralImpulse: number;
  yawImpulse: number;
  severity: number;
};

export function createVehicleDynamics(speed = 0): VehicleDynamics {
  return {
    speed,
    lateralSpeed: 0,
    yawOffset: 0,
    yawRate: 0,
    slipAngle: 0,
    grip: 1,
    acceleration: 0,
    bodyRoll: 0,
    bodyPitch: 0
  };
}

export function stepVehicle(state: VehicleDynamics, input: VehicleInput, delta: number): VehicleStep {
  const dt = clamp(delta, 0, 0.05);
  const maxSpeed = input.maxSpeed ?? 322;
  const speedMps = Math.max(0, state.speed / 3.6);
  const speedRatio = clamp(state.speed / maxSpeed, 0, 1.25);
  const surfaceGrip = lerp(1, 0.34, clamp(input.offroad, 0, 1));
  const gripScale = clamp(input.gripScale ?? 1, 0.55, 1.25);

  const steeringAngle = clamp(input.steer, -1, 1) * lerp(0.43, 0.145, clamp(speedRatio, 0, 1));
  const pathYawRate = input.curvature * speedMps;
  const idealYawRate = Math.tan(steeringAngle) * speedMps / 2.85;
  const lateralDemandG = Math.abs(idealYawRate * speedMps) / 9.81;
  const gripBudgetG = 1.48 * surfaceGrip * gripScale;
  const saturation = lateralDemandG / Math.max(0.1, gripBudgetG);
  const brakeInstability = clamp(input.brake, 0, 1) * speedRatio * 0.16;
  const breakaway = clamp((saturation - 0.88) * 0.72 + brakeInstability, 0, 0.9);
  const grip = clamp(1 - breakaway * 0.88, 0.12, 1);

  const targetYawRate = pathYawRate + (idealYawRate - pathYawRate) * grip;
  const yawResponse = lerp(8.5, 3.1, breakaway);
  const yawRate = state.yawRate + (targetYawRate - state.yawRate) * Math.min(1, dt * yawResponse);

  let yawOffset = state.yawOffset + (yawRate - pathYawRate) * dt;
  yawOffset += input.steer * breakaway * speedRatio * 0.22 * dt;
  yawOffset *= Math.exp(-dt * lerp(5.8, 1.35, breakaway));
  yawOffset = clamp(yawOffset, -0.62, 0.62);

  const headingSideSpeed = Math.sin(yawOffset) * speedMps;
  const steeringSideForce = input.steer * speedMps * lerp(0.02, 0.052, breakaway) * grip;
  const lateralDamping = lerp(6.2, 1.55, breakaway) * surfaceGrip;
  let lateralSpeed = state.lateralSpeed + (headingSideSpeed + steeringSideForce - state.lateralSpeed * lateralDamping) * dt;
  lateralSpeed += input.steer * breakaway * speedMps * 0.16 * dt;
  lateralSpeed = clamp(lateralSpeed, -18, 18);

  const slipAngle = Math.atan2(lateralSpeed, Math.max(2.5, speedMps)) + yawOffset * 0.58;
  const slipLoss = clamp(Math.abs(slipAngle) * 2.4, 0, 0.7);

  const engineAcceleration = clamp(input.throttle, 0, 1) * (14.8 * (1 - clamp(speedRatio, 0, 1) * 0.52));
  const draftingAcceleration = clamp(input.drafting, 0, 1) * 1.45;
  const aerodynamicDrag = 0.34 + speedMps * 0.021 + speedMps * speedMps * 0.00055;
  const brakingAcceleration = clamp(input.brake, 0, 1) * (17.2 + grip * 3.8);
  const rollingLoss = input.offroad * (4.8 + speedMps * 0.055);
  const accelerationMps = engineAcceleration + draftingAcceleration - aerodynamicDrag - brakingAcceleration - rollingLoss - slipLoss * 2.2;
  const speed = clamp(state.speed + accelerationMps * 3.6 * dt, 0, maxSpeed + input.drafting * 18);
  const acceleration = state.acceleration + ((accelerationMps * 3.6) - state.acceleration) * Math.min(1, dt * 7);

  const lateralG = Math.abs(yawRate * speedMps) / 9.81;
  const bodyRollTarget = clamp(-(yawRate - pathYawRate) * speedMps * 0.012 - lateralSpeed * 0.025, -0.18, 0.18);
  const bodyPitchTarget = clamp(-accelerationMps * 0.012, -0.16, 0.2);
  const bodyRoll = state.bodyRoll + (bodyRollTarget - state.bodyRoll) * Math.min(1, dt * 8);
  const bodyPitch = state.bodyPitch + (bodyPitchTarget - state.bodyPitch) * Math.min(1, dt * 9);

  return {
    speed,
    lateralSpeed,
    yawOffset,
    yawRate,
    slipAngle,
    grip,
    acceleration,
    bodyRoll,
    bodyPitch,
    laneDelta: lateralSpeed * dt,
    longitudinalMeters: speed / 3.6 * dt,
    lateralG,
    atLimit: grip < 0.63 || Math.abs(slipAngle) > 0.16
  };
}

export function cornerSpeedKmh(curvature: number, pace = 1, gripScale = 1, maximum = 312): number {
  const magnitude = Math.abs(curvature);
  if (magnitude < 0.00045) return maximum;
  const lateralAcceleration = 14.2 * clamp(gripScale, 0.65, 1.2);
  const metersPerSecond = Math.sqrt(lateralAcceleration / magnitude);
  return clamp(metersPerSecond * 3.6 * clamp(pace, 0.82, 1.08), 88, maximum);
}

export function racingLineTarget(
  curvatureNow: number,
  curvatureAhead: number,
  halfWidth: number,
  aggression = 0.5
): number {
  const dominant = Math.abs(curvatureAhead) > Math.abs(curvatureNow) ? curvatureAhead : curvatureNow;
  if (Math.abs(dominant) < 0.0012) return 0;
  const direction = Math.sign(dominant);
  const preparing = Math.abs(curvatureAhead) > Math.abs(curvatureNow) * 1.22;
  const width = halfWidth * lerp(0.42, 0.66, clamp(aggression, 0, 1));
  return (preparing ? direction : -direction) * width;
}

export function resolveVehicleContact(
  playerSpeedKmh: number,
  opponentSpeedKmh: number,
  lateralOffset: number,
  overlap: number
): ContactResponse {
  const relativeSpeed = (playerSpeedKmh - opponentSpeedKmh) / 3.6;
  const severity = clamp(Math.abs(relativeSpeed) / 28 + clamp(overlap, 0, 1) * 0.52, 0.12, 1);
  const side = lateralOffset === 0 ? 1 : Math.sign(lateralOffset);
  const longitudinalExchange = relativeSpeed * 0.17 * severity;
  const lateralImpulse = side * lerp(1.2, 4.8, severity);
  return {
    playerSpeedDelta: -longitudinalExchange * 3.6 - severity * 4.5,
    opponentSpeedDelta: longitudinalExchange * 3.6 * 0.7 - severity * 1.5,
    playerLateralImpulse: -lateralImpulse,
    opponentLateralImpulse: lateralImpulse * 0.72,
    yawImpulse: -side * lerp(0.035, 0.19, severity),
    severity
  };
}
