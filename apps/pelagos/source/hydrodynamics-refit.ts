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
  filteredWaterVelocity: number;
  breachGuard: number;
  sternLiftGuard: number;
};

const frames = new WeakMap<ShipDynamics, HydroFrame>();
const DEG = Math.PI / 180;

function hullResponse(wavelength: number, hullLength: number): number {
  const ratio = wavelength / Math.max(1, hullLength);
  return clamp(Math.pow(Math.max(0, ratio), 1.22) * 1.14, 0.055, 1);
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

const previousReset = ShipDynamics.prototype.reset;
ShipDynamics.prototype.reset = function hydrodynamicsReset(): void {
  frames.delete(this);
  previousReset.call(this);
  this.state.y = getActiveShipLoadout().dimensions.waterlineCenterY;
};

const previousUpdate = ShipDynamics.prototype.update;
ShipDynamics.prototype.update = function hydrodynamicsUpdate(
  dt: number,
  time: number,
  controls: ShipControls,
  wind: WindState,
  waveScale: number
): ShipTelemetry {
  const telemetry = previousUpdate.call(this, dt, time, controls, wind, waveScale);
  const safeDt = clamp(dt, 1 / 240, 1 / 30);
  const state = this.state;
  const loadout = getActiveShipLoadout();
  const { length, beam, waterlineCenterY, displacementKg } = loadout.dimensions;
  const massFactor = clamp(Math.sqrt(displacementKg / 5200), 0.78, 1.38);

  const longitudinalFractions = [-0.43, -0.22, 0, 0.22, 0.43] as const;
  const longitudinalWeights = [0.42, 0.98, 1.22, 1.00, 0.46] as const;
  const lateralFractions = [-0.36, 0, 0.36] as const;
  const lateralWeights = [0.82, 1.22, 0.82] as const;

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
  const bowInner = sampleLocal(state, length * 0.29, 0, time, waveScale, length);
  const stern = sampleLocal(state, -length * 0.43, 0, time, waveScale, length);
  const sternInner = sampleLocal(state, -length * 0.29, 0, time, waveScale, length);
  const port = sampleLocal(state, 0, -beam * 0.38, time, waveScale, length);
  const starboard = sampleLocal(state, 0, beam * 0.38, time, waveScale, length);

  const bowPlaneHeight = bow.height * 0.44 + bowInner.height * 0.56;
  const sternPlaneHeight = stern.height * 0.30 + sternInner.height * 0.70;
  const bowPlaneVelocity = bow.velocityY * 0.42 + bowInner.velocityY * 0.58;
  const sternPlaneVelocity = stern.velocityY * 0.28 + sternInner.velocityY * 0.72;

  const targetY = meanHeight + waterlineCenterY;

  // Babylon rotation.x raises the stern when pitch is positive and raises the bow when pitch is
  // negative. The previous refit used the opposite sign, so a crest under the bow could command
  // the renderer to lift the transom. Derive pitch in the same convention as the actual transform.
  let pitchPlane = Math.atan2(sternPlaneHeight - bowPlaneHeight, length * 0.80);
  // Stern-up motion is the visually dangerous direction for a displacement cutter, so it follows
  // local wave slope less aggressively than bow-up motion.
  if (pitchPlane > 0) pitchPlane *= 0.56;
  const targetPitch = clamp(pitchPlane, -7.8 * DEG, 4.6 * DEG);

  const waveRoll = clamp(Math.atan2(port.height - starboard.height, beam * 0.82), -9.5 * DEG, 9.5 * DEG);
  const retainedHeel = clamp(state.roll - waveRoll, -8.0 * DEG, 8.0 * DEG) * 0.55;
  const targetRoll = waveRoll + retainedHeel;

  const heaveError = targetY - state.y;
  const desiredVerticalVelocity = meanVelocity * 0.62 + heaveError * (0.88 / massFactor);
  state.verticalVelocity = smoothTo(state.verticalVelocity, desiredVerticalVelocity, 3.2 / massFactor, safeDt);
  state.verticalVelocity = clamp(state.verticalVelocity, -1.18 / massFactor, 0.86 / massFactor);

  const allowedAirGap = 0.34 + clamp(waveScale - 1, 0, 1.4) * 0.10;
  const airGap = state.y - targetY;
  const breachGuard = clamp((airGap - 0.16) / Math.max(0.05, allowedAirGap - 0.16), 0, 1);
  const yRate = breachGuard > 0 ? 2.7 + breachGuard * 5.1 : 0.76 / massFactor;
  state.y = smoothTo(state.y, targetY, yRate, safeDt);
  if (state.y > targetY + allowedAirGap) {
    state.y = targetY + allowedAirGap;
    state.verticalVelocity = Math.min(state.verticalVelocity, 0.06);
  }

  // For a stern point at negative local Z, Babylon's X rotation adds +L*sin(pitch) to world Y.
  // Compare that actual geometric stern waterline with the local filtered water plane. This catches
  // the transom leaving the sea even if the global heave remains perfectly reasonable.
  const sternReferenceY = state.y - waterlineCenterY + length * 0.40 * Math.sin(state.pitch);
  const sternGap = sternReferenceY - sternPlaneHeight;
  const sternLiftGuard = clamp((sternGap - 0.08) / 0.24, 0, 1);
  const guardedTargetPitch = targetPitch > 0
    ? targetPitch * (1 - sternLiftGuard * 0.84)
    : targetPitch;

  let desiredPitchVelocity = (sternPlaneVelocity - bowPlaneVelocity) / Math.max(2, length * 0.80);
  if (desiredPitchVelocity > 0) desiredPitchVelocity *= 0.50;
  const pitchVelocityTarget = desiredPitchVelocity + (guardedTargetPitch - state.pitch) * (1.42 + sternLiftGuard * 1.8);
  state.pitchVelocity = smoothTo(state.pitchVelocity, pitchVelocityTarget, (3.45 + sternLiftGuard * 4.2) / massFactor, safeDt);
  state.pitchVelocity = clamp(state.pitchVelocity, -0.20 / massFactor, 0.12 / massFactor);
  state.pitch = smoothTo(state.pitch, guardedTargetPitch, 0.62 / massFactor + sternLiftGuard * 3.8, safeDt);
  state.pitch = clamp(state.pitch, -9.5 * DEG, 5.0 * DEG);

  const desiredRollVelocity = ((port.velocityY - starboard.velocityY) / Math.max(1.5, beam * 0.82))
    + (targetRoll - state.roll) * 1.10;
  state.rollVelocity = smoothTo(state.rollVelocity, desiredRollVelocity, 2.5 / massFactor, safeDt);
  state.rollVelocity = clamp(state.rollVelocity, -0.31 / massFactor, 0.31 / massFactor);
  state.roll = smoothTo(state.roll, targetRoll, 0.48 / massFactor, safeDt);
  state.roll = clamp(state.roll, -14.5 * DEG, 14.5 * DEG);

  if (!Number.isFinite(state.y + state.verticalVelocity + state.pitch + state.roll)) {
    state.y = targetY;
    state.verticalVelocity = 0;
    state.pitch = guardedTargetPitch;
    state.pitchVelocity = 0;
    state.roll = targetRoll;
    state.rollVelocity = 0;
  }

  frames.set(this, {
    targetY,
    targetPitch: guardedTargetPitch,
    targetRoll,
    filteredWaterVelocity: meanVelocity,
    breachGuard,
    sternLiftGuard
  });

  return { ...telemetry, heel: state.roll };
};
