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
  // A displacement hull follows long swell, but short chop mostly runs around the hull instead of
  // throwing the whole vessel vertically. Keep the response deliberately conservative below one
  // hull length so the boat reads as several tonnes of timber rather than a buoyant toy.
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
  const telemetry = previousUpdate.call(this, dt, time, controls, wind, waveScale);
  const safeDt = clamp(dt, 1 / 240, 1 / 30);
  const state = this.state;
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

  // Do not slave the hull centre directly to the instantaneous wave height. A heavy hull has
  // memory: a crest can run past the bow and quarter while the centre of mass keeps moving on a
  // much slower path. This low-pass surface is the biggest difference between "floating" and
  // "being thrown around by the shader".
  const surfaceRate = 0.72 / massFactor;
  const filteredSurfaceHeight = previousFrame
    ? smoothTo(previousFrame.filteredSurfaceHeight, meanHeight, surfaceRate, safeDt)
    : meanHeight;
  const filteredWaterVelocity = previousFrame
    ? clamp((filteredSurfaceHeight - previousFrame.filteredSurfaceHeight) / safeDt, -0.52, 0.52)
    : clamp(meanVelocity * 0.08, -0.18, 0.18);

  // A 13 m displacement hull bridges a local trough under the quarter; it does not articulate down
  // into that trough like a raft. Blend the local stern sample strongly toward the hull-wide support
  // plane and filter it in time before using it as a hard immersion reference.
  const sternSupportRaw = sternPlaneHeight * 0.28 + filteredSurfaceHeight * 0.72;
  const filteredSternHeight = previousFrame
    ? smoothTo(previousFrame.filteredSternHeight, sternSupportRaw, 1.10 / massFactor, safeDt)
    : sternSupportRaw;

  // Sit the vessel a little deeper than the old visual waterline and add a small speed-dependent
  // squat. This keeps the transom and steering gear planted without making the deck look flooded.
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

  // Heave is intentionally asymmetric. A heavy cutter may be lifted by broad swell, but it must
  // settle into a falling trough faster than it can "launch" upward. That removes the airborne
  // stern flashes which were still visible after the pitch-sign fix.
  const heaveError = targetY - state.y;
  const airGapBefore = state.y - targetY;
  const allowedAirGap = 0.19 + clamp(waveScale - 1, 0, 1.5) * 0.035;
  const breachGuard = clamp((airGapBefore - 0.07) / Math.max(0.06, allowedAirGap - 0.07), 0, 1);
  const heaveRate = breachGuard > 0
    ? 1.55 + breachGuard * 4.4
    : heaveError > 0
      ? 0.38 / massFactor
      : 0.82 / massFactor;

  const beforeY = state.y;
  state.y = smoothTo(state.y, targetY, heaveRate, safeDt);
  if (state.y > targetY + allowedAirGap) state.y = targetY + allowedAirGap;
  const geometricVerticalVelocity = (state.y - beforeY) / safeDt;
  const verticalVelocityTarget = geometricVerticalVelocity + filteredWaterVelocity * 0.08;
  state.verticalVelocity = smoothTo(state.verticalVelocity, verticalVelocityTarget, 1.45 / massFactor, safeDt);
  state.verticalVelocity = clamp(state.verticalVelocity, -0.62 / massFactor, 0.38 / massFactor);

  // Compare the actual stern waterline with the hull-supported stern plane. This catches genuine
  // whole-hull emergence without making the vessel chase every instantaneous trough under the rudder.
  let sternReferenceY = state.y - waterlineCenterY + length * 0.40 * Math.sin(state.pitch);
  let sternGap = sternReferenceY - filteredSternHeight;
  const sternLiftGuard = clamp((sternGap - 0.025) / 0.17, 0, 1);
  const guardedTargetPitch = targetPitch > 0
    ? targetPitch * (1 - sternLiftGuard * 0.92)
    : targetPitch;

  if (sternLiftGuard > 0) {
    const maximumRootY = filteredSternHeight + waterlineCenterY - length * 0.40 * Math.sin(state.pitch) + 0.055;
    if (state.y > maximumRootY) {
      state.y = smoothTo(state.y, maximumRootY, 5.2 + sternLiftGuard * 4.6, safeDt);
      // A tiny residual clearance is fine, but a rare solver transient must not be allowed to turn
      // into a visible "hop". This ceiling is at most a few centimetres of correction per normal
      // frame after the filtered support plane has done the real work.
      state.y = Math.min(state.y, maximumRootY + 0.13);
      state.verticalVelocity = Math.min(state.verticalVelocity, 0.02);
    }
  }

  let desiredPitchVelocity = (sternPlaneVelocity - bowPlaneVelocity) / Math.max(2, length * 0.84);
  if (desiredPitchVelocity > 0) desiredPitchVelocity *= 0.34;
  else desiredPitchVelocity *= 0.68;
  const pitchVelocityTarget = desiredPitchVelocity + (guardedTargetPitch - state.pitch) * (1.18 + sternLiftGuard * 2.0);
  state.pitchVelocity = smoothTo(state.pitchVelocity, pitchVelocityTarget, (2.7 + sternLiftGuard * 4.8) / massFactor, safeDt);
  state.pitchVelocity = clamp(state.pitchVelocity, -0.15 / massFactor, 0.075 / massFactor);
  state.pitch = smoothTo(state.pitch, guardedTargetPitch, 0.46 / massFactor + sternLiftGuard * 4.2, safeDt);
  state.pitch = clamp(state.pitch, -7.2 * DEG, 3.5 * DEG);

  const desiredRollVelocity = ((port.velocityY - starboard.velocityY) / Math.max(1.5, beam * 0.86)) * 0.58
    + (targetRoll - state.roll) * 0.84;
  state.rollVelocity = smoothTo(state.rollVelocity, desiredRollVelocity, 2.0 / massFactor, safeDt);
  state.rollVelocity = clamp(state.rollVelocity, -0.23 / massFactor, 0.23 / massFactor);
  state.roll = smoothTo(state.roll, targetRoll, 0.40 / massFactor, safeDt);
  state.roll = clamp(state.roll, -11.5 * DEG, 11.5 * DEG);

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
