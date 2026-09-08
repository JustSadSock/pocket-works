import type { ShipControls, ShipTelemetry, WindState } from './core';
import { ShipDynamics, TAU, WAVE_COMPONENTS, clamp, smoothTo } from './core';
import { getActiveShipLoadout } from './ship-loadout';

type HullWave = {
  height: number;
  velocityY: number;
};

type HydroFrame = {
  targetY: number;
  targetPitch: number;
  targetRoll: number;
  filteredSurfaceHeight: number;
  filteredSternHeight: number;
  filteredWaterVelocity: number;
  immersionBias: number;
  sternGap: number;
  breachGuard: number;
  sternLiftGuard: number;
};

const frames = new WeakMap<ShipDynamics, HydroFrame>();
const DEG = Math.PI / 180;

function hullResponse(wavelength: number, hullLength: number): number {
  const ratio = wavelength / Math.max(1, hullLength);
  // Short chop runs around a displacement hull; only swell on the order of the hull length can
  // move the complete centre of mass appreciably. This keeps the vessel from reading like a buoy.
  return clamp(Math.pow(Math.max(0, ratio), 1.34) * 1.06, 0.035, 1);
}

function sampleHullWave(x: number, z: number, time: number, scale: number, hullLength: number): HullWave {
  let height = 0;
  let velocityY = 0;
  for (const wave of WAVE_COMPONENTS) {
    const response = hullResponse(wave.wavelength, hullLength);
    const k = TAU / wave.wavelength;
    const dx = Math.sin(wave.direction);
    const dz = Math.cos(wave.direction);
    const phase = k * (x * dx + z * dz) - wave.speed * k * time;
    const amplitude = wave.amplitude * scale * response;
    height += Math.sin(phase) * amplitude;
    velocityY += -Math.cos(phase) * amplitude * wave.speed * k;
  }
  return { height, velocityY };
}

function sampleLocal(
  state: ShipDynamics['state'],
  forward: number,
  right: number,
  time: number,
  scale: number,
  hullLength: number
): HullWave {
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  const x = state.worldX + sinYaw * forward + cosYaw * right;
  const z = state.worldZ + cosYaw * forward - sinYaw * right;
  return sampleHullWave(x, z, time, scale, hullLength);
}

export function getHydrodynamicsFrame(dynamics: ShipDynamics): HydroFrame | null {
  const frame = frames.get(dynamics);
  return frame ? { ...frame } : null;
}

function restingImmersionBias(draft: number): number {
  return clamp(0.075 + draft * 0.038, 0.10, 0.15);
}

const previousReset = ShipDynamics.prototype.reset;
ShipDynamics.prototype.reset = function hydrodynamicsReset(): void {
  frames.delete(this);
  previousReset.call(this);
  const dimensions = getActiveShipLoadout().dimensions;
  this.state.y = dimensions.waterlineCenterY - restingImmersionBias(dimensions.draft);
};

const previousUpdate = ShipDynamics.prototype.update;
ShipDynamics.prototype.update = function hydrodynamicsUpdate(
  dt: number,
  time: number,
  controls: ShipControls,
  wind: WindState,
  waveScale: number
): ShipTelemetry {
  // Preserve the six-DOF components owned by this pass. The legacy core is still useful for sail
  // drive, rowing, lateral resistance, rudder and yaw, but its original 9 m point-buoyancy solver
  // must not run in series with the long-hull solver below. Restoring these values makes this pass
  // the single authority for heave, pitch and roll instead of correcting another solver afterward.
  const beforeMotion = {
    y: this.state.y,
    verticalVelocity: this.state.verticalVelocity,
    pitch: this.state.pitch,
    pitchVelocity: this.state.pitchVelocity,
    roll: this.state.roll,
    rollVelocity: this.state.rollVelocity
  };

  const telemetry = previousUpdate.call(this, dt, time, controls, wind, waveScale);
  const safeDt = clamp(dt, 1 / 240, 1 / 30);
  const state = this.state;
  state.y = beforeMotion.y;
  state.verticalVelocity = beforeMotion.verticalVelocity;
  state.pitch = beforeMotion.pitch;
  state.pitchVelocity = beforeMotion.pitchVelocity;
  state.roll = beforeMotion.roll;
  state.rollVelocity = beforeMotion.rollVelocity;

  const loadout = getActiveShipLoadout();
  const { length, beam, draft, waterlineCenterY, displacementKg } = loadout.dimensions;
  const massFactor = clamp(Math.sqrt(displacementKg / 5200), 0.78, 1.42);
  const previousFrame = frames.get(this);

  const longitudinalFractions = [-0.43, -0.22, 0, 0.22, 0.43] as const;
  const longitudinalWeights = [0.34, 0.96, 1.30, 0.98, 0.36] as const;
  const lateralFractions = [-0.36, 0, 0.36] as const;
  const lateralWeights = [0.78, 1.28, 0.78] as const;

  let weightedHeight = 0;
  let weightedVelocity = 0;
  let totalWeight = 0;
  for (let zi = 0; zi < longitudinalFractions.length; zi += 1) {
    for (let xi = 0; xi < lateralFractions.length; xi += 1) {
      const forward = longitudinalFractions[zi] * length;
      const right = lateralFractions[xi] * beam;
      const weight = longitudinalWeights[zi] * lateralWeights[xi];
      const water = sampleLocal(state, forward, right, time, waveScale, length);
      weightedHeight += water.height * weight;
      weightedVelocity += water.velocityY * weight;
      totalWeight += weight;
    }
  }

  const meanHeight = weightedHeight / Math.max(0.001, totalWeight);
  const meanVelocity = weightedVelocity / Math.max(0.001, totalWeight);
  const bow = sampleLocal(state, length * 0.43, 0, time, waveScale, length);
  const bowInner = sampleLocal(state, length * 0.28, 0, time, waveScale, length);
  const stern = sampleLocal(state, -length * 0.43, 0, time, waveScale, length);
  const sternInner = sampleLocal(state, -length * 0.28, 0, time, waveScale, length);
  const port = sampleLocal(state, 0, -beam * 0.38, time, waveScale, length);
  const starboard = sampleLocal(state, 0, beam * 0.38, time, waveScale, length);

  const bowPlaneHeight = bow.height * 0.38 + bowInner.height * 0.62;
  const sternPlaneHeight = stern.height * 0.24 + sternInner.height * 0.76;
  const bowPlaneVelocity = bow.velocityY * 0.34 + bowInner.velocityY * 0.66;
  const sternPlaneVelocity = stern.velocityY * 0.22 + sternInner.velocityY * 0.78;

  const surfaceRate = 0.72 / massFactor;
  const filteredSurfaceHeight = previousFrame
    ? smoothTo(previousFrame.filteredSurfaceHeight, meanHeight, surfaceRate, safeDt)
    : meanHeight;
  const filteredWaterVelocity = previousFrame
    ? clamp((filteredSurfaceHeight - previousFrame.filteredSurfaceHeight) / safeDt, -0.52, 0.52)
    : clamp(meanVelocity * 0.08, -0.18, 0.18);

  // The stern cannot articulate down into a single trough like a raft. The filtered support plane
  // represents the span of hull still supported by water ahead of the transom.
  const sternSupportRaw = sternPlaneHeight * 0.28 + filteredSurfaceHeight * 0.72;
  const filteredSternHeight = previousFrame
    ? smoothTo(previousFrame.filteredSternHeight, sternSupportRaw, 1.10 / massFactor, safeDt)
    : sternSupportRaw;

  const immersionBias = clamp(restingImmersionBias(draft) + telemetry.speed * 0.0065, 0.10, 0.18);
  const targetY = filteredSurfaceHeight + waterlineCenterY - immersionBias;

  // Babylon rotation.x raises the stern when pitch is positive and raises the bow when negative.
  let pitchPlane = Math.atan2(sternPlaneHeight - bowPlaneHeight, length * 0.84);
  if (pitchPlane > 0) pitchPlane *= 0.40;
  const rawTargetPitch = clamp(pitchPlane, -6.2 * DEG, 3.15 * DEG);
  const targetPitch = previousFrame
    ? smoothTo(previousFrame.targetPitch, rawTargetPitch, 1.08 / massFactor, safeDt)
    : rawTargetPitch;

  const rawWaveRoll = clamp(Math.atan2(port.height - starboard.height, beam * 0.86), -8.2 * DEG, 8.2 * DEG);
  const waveRoll = previousFrame
    ? smoothTo(previousFrame.targetRoll, rawWaveRoll, 1.34 / massFactor, safeDt)
    : rawWaveRoll;
  const retainedHeel = clamp(state.roll - waveRoll, -6.5 * DEG, 6.5 * DEG) * 0.48;
  const targetRoll = waveRoll + retainedHeel;

  // Heave is a damped mass-spring response, not direct interpolation of position. Broad swell can
  // push the hull upward, but upward acceleration is deliberately weaker than gravity/settling and
  // gets weaker again as displacement rises. This is the physical cue that makes several tonnes of
  // vessel feel planted rather than visually glued to the wave shader.
  const heaveError = targetY - state.y;
  const airGapBefore = state.y - targetY;
  const allowedAirGap = 0.18 + clamp(waveScale - 1, 0, 1.5) * 0.032;
  const breachGuard = clamp((airGapBefore - 0.055) / Math.max(0.06, allowedAirGap - 0.055), 0, 1);
  const deepGuard = clamp((targetY - state.y - 0.16) / 0.22, 0, 1);
  const supportVelocity = filteredWaterVelocity * 0.10;
  const relativeHeaveVelocity = state.verticalVelocity - supportVelocity;

  let heaveAcceleration = heaveError * (1.48 / massFactor)
    - relativeHeaveVelocity * (1.95 + massFactor * 0.34);
  if (heaveAcceleration > 0) heaveAcceleration *= 0.60 / massFactor;
  heaveAcceleration += deepGuard * (0.52 / massFactor);
  heaveAcceleration -= breachGuard * (0.82 + Math.max(0, state.verticalVelocity) * 2.7);
  heaveAcceleration = clamp(heaveAcceleration, -1.15, 0.58 / massFactor);

  state.verticalVelocity += heaveAcceleration * safeDt;
  state.verticalVelocity = clamp(state.verticalVelocity, -0.50 / massFactor, 0.28 / massFactor);
  state.y += state.verticalVelocity * safeDt;
  if (state.y > targetY + allowedAirGap) {
    state.y = targetY + allowedAirGap;
    state.verticalVelocity = Math.min(0, state.verticalVelocity);
  }

  let sternReferenceY = state.y - waterlineCenterY + length * 0.40 * Math.sin(state.pitch);
  let sternGap = sternReferenceY - filteredSternHeight;
  const sternLiftGuard = clamp((sternGap - 0.018) / 0.15, 0, 1);
  const guardedTargetPitch = targetPitch > 0
    ? targetPitch * (1 - sternLiftGuard * 0.94)
    : targetPitch;

  if (sternLiftGuard > 0) {
    const maximumRootY = filteredSternHeight + waterlineCenterY - length * 0.40 * Math.sin(state.pitch) + 0.045;
    if (state.y > maximumRootY) {
      // The filtered water plane does the physical work; this is only a final geometric guard for a
      // rare frame where a transparent wave would otherwise reveal the whole steering appendage.
      state.y = Math.min(state.y, maximumRootY + 0.075);
      state.verticalVelocity = Math.min(state.verticalVelocity, -0.015 * sternLiftGuard);
    }
  }

  let desiredPitchVelocity = (sternPlaneVelocity - bowPlaneVelocity) / Math.max(2, length * 0.84);
  if (desiredPitchVelocity > 0) desiredPitchVelocity *= 0.30;
  else desiredPitchVelocity *= 0.64;
  const pitchVelocityTarget = desiredPitchVelocity + (guardedTargetPitch - state.pitch) * (1.10 + sternLiftGuard * 2.1);
  state.pitchVelocity = smoothTo(state.pitchVelocity, pitchVelocityTarget, (2.45 + sternLiftGuard * 4.8) / massFactor, safeDt);
  state.pitchVelocity = clamp(state.pitchVelocity, -0.135 / massFactor, 0.064 / massFactor);
  state.pitch = smoothTo(state.pitch, guardedTargetPitch, 0.42 / massFactor + sternLiftGuard * 4.4, safeDt);
  state.pitch = clamp(state.pitch, -7.0 * DEG, 3.25 * DEG);

  const desiredRollVelocity = ((port.velocityY - starboard.velocityY) / Math.max(1.5, beam * 0.86)) * 0.54
    + (targetRoll - state.roll) * 0.80;
  state.rollVelocity = smoothTo(state.rollVelocity, desiredRollVelocity, 1.86 / massFactor, safeDt);
  state.rollVelocity = clamp(state.rollVelocity, -0.21 / massFactor, 0.21 / massFactor);
  state.roll = smoothTo(state.roll, targetRoll, 0.36 / massFactor, safeDt);
  state.roll = clamp(state.roll, -10.8 * DEG, 10.8 * DEG);

  sternReferenceY = state.y - waterlineCenterY + length * 0.40 * Math.sin(state.pitch);
  sternGap = sternReferenceY - filteredSternHeight;

  if (!Number.isFinite(state.y + state.verticalVelocity + state.pitch + state.roll)) {
    state.y = targetY;
    state.verticalVelocity = 0;
    state.pitch = guardedTargetPitch;
    state.pitchVelocity = 0;
    state.roll = targetRoll;
    state.rollVelocity = 0;
    sternGap = 0;
  }

  frames.set(this, {
    targetY,
    targetPitch: guardedTargetPitch,
    targetRoll,
    filteredSurfaceHeight,
    filteredSternHeight,
    filteredWaterVelocity,
    immersionBias,
    sternGap,
    breachGuard,
    sternLiftGuard
  });

  return { ...telemetry, heel: state.roll };
};
