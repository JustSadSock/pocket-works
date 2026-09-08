import type { ShipControls, ShipTelemetry, WindState } from './core';
import { ShipDynamics, clamp, sailingPolar } from './core';
import { getActiveShipLoadout, type ShipLoadout } from './ship-loadout';

export type ShipPerformanceProfile = {
  inertiaResponse: number;
  forwardDrag: number;
  lateralGrip: number;
  turnResponse: number;
  sailArea: number;
  oarPower: number;
  scores: {
    speed: number;
    agility: number;
    seakeeping: number;
    rowing: number;
  };
};

const BASE_LENGTH = 12.8;
const BASE_BEAM = 3.9;
const BASE_DRAFT = 1.18;
const BASE_DISPLACEMENT = 5200;
const BASE_PHYSICS_MASS = 3200;
const BASE_MAIN_AREA = 1.08 * 1.10;
const BASE_JIB_AREA = 1.06 * 1.08;
const BASE_WEIGHTED_SAIL_AREA = BASE_MAIN_AREA + BASE_JIB_AREA * 0.62;
const BASE_OAR_POWER = 6 * 0.74 * 0.24 * Math.pow(3.62, 0.35);

function performanceScore(factor: number): number {
  return Math.round(clamp(65 + (factor - 1) * 55, 35, 95));
}

export function performanceProfile(loadout: ShipLoadout): ShipPerformanceProfile {
  const dimensions = loadout.dimensions;
  const sails = loadout.sails;
  const oars = loadout.oars;

  const lengthRatio = dimensions.length / BASE_LENGTH;
  const beamRatio = dimensions.beam / BASE_BEAM;
  const draftRatio = dimensions.draft / BASE_DRAFT;
  const displacementRatio = dimensions.displacementKg / BASE_DISPLACEMENT;

  const inertiaResponse = clamp(Math.sqrt(1 / displacementRatio), 0.78, 1.22);
  const forwardDrag = clamp(
    Math.pow(beamRatio, 0.55) * Math.pow(draftRatio, 0.20) / Math.pow(lengthRatio, 0.42),
    0.88,
    1.16
  );
  const lateralGrip = clamp(
    Math.pow(draftRatio, 0.35) * Math.pow(lengthRatio, 0.18) / Math.pow(beamRatio, 0.15),
    0.86,
    1.16
  );
  const rawTurn = Math.pow(1 / lengthRatio, 0.75) * Math.pow(1 / beamRatio, 0.15) * inertiaResponse;
  const turnResponse = clamp(rawTurn, 0.72, 1.30);

  const weightedSailArea = sails.mainHeightScale * sails.mainChordScale
    + sails.jibHeightScale * sails.jibChordScale * 0.62;
  const sailArea = clamp(weightedSailArea / BASE_WEIGHTED_SAIL_AREA, 0.52, 1.18);

  const rawOarPower = oars.stationsPerSide * oars.bladeLength * oars.bladeWidth * Math.pow(oars.shaftLength, 0.35);
  const oarPower = clamp(rawOarPower / BASE_OAR_POWER, 0.78, 1.24);

  const driveFactor = inertiaResponse * (0.62 + sailArea * 0.38) / forwardDrag;
  const seaFactor = Math.pow(displacementRatio, 0.24)
    * Math.pow(beamRatio, 0.24)
    * Math.pow(draftRatio, 0.18);
  const rowFactor = inertiaResponse * oarPower;

  return {
    inertiaResponse,
    forwardDrag,
    lateralGrip,
    turnResponse,
    sailArea,
    oarPower,
    scores: {
      speed: performanceScore(driveFactor),
      agility: performanceScore(turnResponse),
      seakeeping: performanceScore(seaFactor),
      rowing: performanceScore(rowFactor)
    }
  };
}

function applyLoadoutCorrection(
  dynamics: ShipDynamics,
  telemetry: ShipTelemetry,
  controls: ShipControls,
  wind: WindState,
  dt: number,
  beforeVelocityX: number,
  beforeVelocityZ: number,
  beforeYawVelocity: number
): void {
  const loadout = getActiveShipLoadout();
  const profile = performanceProfile(loadout);
  const state = dynamics.state;
  const safeDt = clamp(dt, 0.001, 1 / 30);

  // The base simulator is calibrated to Long Cutter. Scaling its acceleration delta by the
  // selected displacement gives heavier hulls genuine inertia while preserving their momentum;
  // light harbor hulls answer the controls sooner instead of merely looking smaller.
  state.velocityX = beforeVelocityX + (state.velocityX - beforeVelocityX) * profile.inertiaResponse;
  state.velocityZ = beforeVelocityZ + (state.velocityZ - beforeVelocityZ) * profile.inertiaResponse;
  state.yawVelocity = beforeYawVelocity
    + (state.yawVelocity - beforeYawVelocity) * profile.turnResponse;

  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  const forwardX = sinYaw;
  const forwardZ = cosYaw;
  const rightX = cosYaw;
  const rightZ = -sinYaw;

  // Add only the difference from the baseline sail plan. The original ShipDynamics force stays
  // the canonical 1.0 reference, so changing modules cannot double-apply the normal sail force.
  const polar = sailingPolar(telemetry.windAngle);
  const absWind = Math.abs(telemetry.windAngle);
  const liftFactor = Math.sin(clamp(absWind, 0, Math.PI) * 2) * 0.5 + 0.5;
  const sideSign = Math.sign(Math.sin(telemetry.windAngle)) || 1;
  const baseSailForce = telemetry.apparentWindSpeed * telemetry.apparentWindSpeed
    * 13.0
    * telemetry.sailEfficiency
    * (0.86 + wind.gust * 0.16);
  const sailDelta = baseSailForce * (profile.sailArea - 1);
  const sailForwardDelta = sailDelta * (0.58 + polar * 0.38 + liftFactor * 0.12);
  const sailSideDelta = sideSign * sailDelta * (0.25 + liftFactor * 0.16);

  // Match the baseline resistance equations and apply only the loadout multiplier delta.
  const forwardSpeed = telemetry.forwardSpeed;
  const lateralSpeed = telemetry.lateralSpeed;
  const baseForwardDrag = -forwardSpeed
    * (62 + Math.abs(forwardSpeed) * 92 + forwardSpeed * forwardSpeed * 7.0);
  const baseLateralResistance = -lateralSpeed
    * (390 + Math.abs(lateralSpeed) * 610 + Math.abs(forwardSpeed) * 118)
    - lateralSpeed * Math.abs(forwardSpeed) * 190;
  const dragForwardDelta = baseForwardDrag * (profile.forwardDrag - 1);
  const gripSideDelta = baseLateralResistance * (profile.lateralGrip - 1);

  const stroke = Math.max(0, Math.sin(state.rowingPhase * Math.PI * 2));
  const baseRowingForce = clamp(controls.rowing, 0, 1)
    * (1450 + Math.max(0, 2.0 - Math.abs(forwardSpeed)) * 320)
    * (0.42 + stroke * 0.78);
  const rowingDelta = baseRowingForce * (profile.oarPower - 1);

  const forwardCorrection = sailForwardDelta + dragForwardDelta + rowingDelta;
  const sideCorrection = sailSideDelta + gripSideDelta;
  const correctionScale = profile.inertiaResponse / BASE_PHYSICS_MASS * safeDt;
  state.velocityX += (forwardX * forwardCorrection + rightX * sideCorrection) * correctionScale;
  state.velocityZ += (forwardZ * forwardCorrection + rightZ * sideCorrection) * correctionScale;

  document.documentElement.dataset.pelagosPerformance = [
    profile.scores.speed,
    profile.scores.agility,
    profile.scores.seakeeping,
    profile.scores.rowing
  ].join('-');
  document.documentElement.dataset.pelagosSailArea = profile.sailArea.toFixed(3);
  document.documentElement.dataset.pelagosOarPower = profile.oarPower.toFixed(3);
  document.documentElement.dataset.pelagosTurnResponse = profile.turnResponse.toFixed(3);
}

const prototype = ShipDynamics.prototype as typeof ShipDynamics.prototype & { __pelagosLoadoutPerformanceV1?: boolean };
if (!prototype.__pelagosLoadoutPerformanceV1) {
  prototype.__pelagosLoadoutPerformanceV1 = true;
  const previousUpdate = ShipDynamics.prototype.update;
  ShipDynamics.prototype.update = function loadoutPerformanceUpdate(
    dt: number,
    time: number,
    controls: ShipControls,
    wind: WindState,
    waveScale: number
  ): ShipTelemetry {
    const beforeVelocityX = this.state.velocityX;
    const beforeVelocityZ = this.state.velocityZ;
    const beforeYawVelocity = this.state.yawVelocity;
    const telemetry = previousUpdate.call(this, dt, time, controls, wind, waveScale);
    applyLoadoutCorrection(
      this,
      telemetry,
      controls,
      wind,
      dt,
      beforeVelocityX,
      beforeVelocityZ,
      beforeYawVelocity
    );
    return telemetry;
  };
}
