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
};

const frames = new WeakMap<ShipDynamics, HydroFrame>();
const DEG = Math.PI / 180;

function hullResponse(wavelength: number, hullLength: number): number {
  // A long displacement hull averages short chop over its immersed volume instead of reacting
  // to every sub-metre crest as though each one lifted the entire vessel.
  const ratio = wavelength / Math.max(1, hullLength);
  return clamp(0.10 + ratio * 2.25, 0.10, 1);
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
  const { length, beam, waterlineCenterY } = loadout.dimensions;

  const longitudinalFractions = [-0.43, -0.22, 0, 0.22, 0.43] as const;
  const longitudinalWeights = [0.48, 0.92, 1.14, 0.96, 0.52] as const;
  const lateralFractions = [-0.36, 0, 0.36] as const;
  const lateralWeights = [0.84, 1.18, 0.84] as const;

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
  const stern = sampleLocal(state, -length * 0.43, 0, time, waveScale, length);
  const port = sampleLocal(state, 0, -beam * 0.38, time, waveScale, length);
  const starboard = sampleLocal(state, 0, beam * 0.38, time, waveScale, length);

  const targetY = meanHeight + waterlineCenterY;
  const targetPitch = clamp(Math.atan2(bow.height - stern.height, length * 0.86), -8.5 * DEG, 8.5 * DEG);
  const waveRoll = clamp(Math.atan2(port.height - starboard.height, beam * 0.82), -10.5 * DEG, 10.5 * DEG);
  // Preserve aerodynamic/turn heel from the base dynamics, but do not let a single local crest
  // kick the ship into a violent roll independently of the broader water plane.
  const retainedHeel = clamp(state.roll - waveRoll, -8.5 * DEG, 8.5 * DEG) * 0.58;
  const targetRoll = waveRoll + retainedHeel;

  const heaveError = targetY - state.y;
  const desiredVerticalVelocity = meanVelocity * 0.70 + heaveError * 0.92;
  state.verticalVelocity = smoothTo(state.verticalVelocity, desiredVerticalVelocity, 3.5, safeDt);
  state.verticalVelocity = clamp(state.verticalVelocity, -1.35, 1.08);

  // Position correction is intentionally slower than the velocity correction: the ship still
  // has mass and lag, but it cannot be catapulted metres clear of the surface by two stern samples.
  const allowedAirGap = 0.46 + clamp(waveScale - 1, 0, 1.4) * 0.14;
  const airGap = state.y - targetY;
  const breachGuard = clamp((airGap - 0.20) / Math.max(0.05, allowedAirGap - 0.20), 0, 1);
  const yRate = breachGuard > 0 ? 2.2 + breachGuard * 4.4 : 0.82;
  state.y = smoothTo(state.y, targetY, yRate, safeDt);
  if (state.y > targetY + allowedAirGap) {
    state.y = targetY + allowedAirGap;
    state.verticalVelocity = Math.min(state.verticalVelocity, 0.12);
  }

  const desiredPitchVelocity = (bow.velocityY - stern.velocityY) / Math.max(2, length * 0.86);
  const pitchVelocityTarget = desiredPitchVelocity + (targetPitch - state.pitch) * 1.35;
  state.pitchVelocity = smoothTo(state.pitchVelocity, pitchVelocityTarget, 3.8, safeDt);
  state.pitchVelocity = clamp(state.pitchVelocity, -0.25, 0.25);
  state.pitch = smoothTo(state.pitch, targetPitch, 0.72 + breachGuard * 1.25, safeDt);
  // Bow-down angles expose the stern/rudder first, so the negative limit is deliberately tighter.
  state.pitch = clamp(state.pitch, -8.5 * DEG, 11.5 * DEG);

  const desiredRollVelocity = ((port.velocityY - starboard.velocityY) / Math.max(1.5, beam * 0.82))
    + (targetRoll - state.roll) * 1.15;
  state.rollVelocity = smoothTo(state.rollVelocity, desiredRollVelocity, 2.7, safeDt);
  state.rollVelocity = clamp(state.rollVelocity, -0.34, 0.34);
  state.roll = smoothTo(state.roll, targetRoll, 0.52, safeDt);
  state.roll = clamp(state.roll, -16 * DEG, 16 * DEG);

  if (!Number.isFinite(state.y + state.verticalVelocity + state.pitch + state.roll)) {
    state.y = targetY;
    state.verticalVelocity = 0;
    state.pitch = targetPitch;
    state.pitchVelocity = 0;
    state.roll = targetRoll;
    state.rollVelocity = 0;
  }

  frames.set(this, {
    targetY,
    targetPitch,
    targetRoll,
    filteredWaterVelocity: meanVelocity,
    breachGuard
  });

  return { ...telemetry, heel: state.roll };
};
