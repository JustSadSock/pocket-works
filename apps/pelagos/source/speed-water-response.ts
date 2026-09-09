import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { ShipControls, ShipState, ShipTelemetry, WindState } from './core';
import { ShipDynamics, clamp, sampleWave } from './core';
import { getActiveShipLoadout } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

export type SpeedWaterProfile = {
  froude: number;
  speedFactor: number;
  roughness: number;
  encounterFactor: number;
  waveDragRate: number;
  squatAcceleration: number;
  slamAcceleration: number;
  releaseAcceleration: number;
};

type Encounter = {
  height: number;
  rate: number;
};

type DynamicsMemory = {
  lastEncounterRate: number;
  lastSeaLoad: number;
  lastSlam: number;
};

type VisualMemory = {
  spray: ParticleSystem | null;
  hullFoam: Mesh[];
  transomFoam: Mesh[];
};

const dynamicsMemory = new WeakMap<ShipDynamics, DynamicsMemory>();
const visualMemory = new WeakMap<OceanWorld, VisualMemory>();
const GRAVITY = 9.81;
const REFERENCE_LENGTH = 12.8;

/**
 * Converts absolute speed into a displacement-hull speed regime. Using Froude number means the
 * 10.8 m harbor hull starts paying wave-making resistance sooner than the 15.6 m cruiser instead of
 * every hull hitting the same arbitrary metres-per-second threshold.
 */
export function speedWaterProfile(
  speed: number,
  waveScale: number,
  relativeBowRise: number,
  hullLength = REFERENCE_LENGTH
): SpeedWaterProfile {
  const safeSpeed = Math.max(0, speed);
  const safeLength = clamp(hullLength, 8, 22);
  const froude = safeSpeed / Math.sqrt(GRAVITY * safeLength);
  // Fn ~= 0.46 on the reference cutter maps almost exactly to the old 5.2 m/s full-response point,
  // preserving the tuned baseline while making the threshold physically scale with waterline length.
  const speedFactor = clamp(froude / 0.46, 0, 1.25);
  const roughness = clamp((waveScale - 0.45) / 1.55, 0, 1.15);
  const encounterFactor = clamp(Math.abs(relativeBowRise) / 2.25, 0, 1.25);
  const slam = clamp((relativeBowRise - 0.28) / 1.55, 0, 1.15) * speedFactor;
  const release = clamp((-relativeBowRise - 0.34) / 1.75, 0, 1.05) * speedFactor;
  return {
    froude,
    speedFactor,
    roughness,
    encounterFactor,
    waveDragRate: Math.pow(speedFactor, 1.55) * (roughness * 0.030 + encounterFactor * 0.018),
    squatAcceleration: Math.pow(speedFactor, 2) * (0.025 + roughness * 0.034),
    slamAcceleration: slam * (0.22 + roughness * 0.42),
    releaseAcceleration: release * (0.13 + roughness * 0.16)
  };
}

function encounterAt(
  state: ShipState,
  forwardDistance: number,
  time: number,
  waveScale: number,
  probe = 0.09
): Encounter {
  const fwdX = Math.sin(state.yaw);
  const fwdZ = Math.cos(state.yaw);
  const x = state.worldX + fwdX * forwardDistance;
  const z = state.worldZ + fwdZ * forwardDistance;
  const now = sampleWave(x, z, time, waveScale);
  const future = sampleWave(
    x + state.velocityX * probe,
    z + state.velocityZ * probe,
    time + probe,
    waveScale
  );
  return {
    height: now.height,
    rate: (future.height - now.height) / probe
  };
}

function applySpeedWaterDynamics(
  dynamics: ShipDynamics,
  telemetry: ShipTelemetry,
  waveScale: number,
  time: number,
  dt: number
): void {
  const state = dynamics.state;
  const loadout = getActiveShipLoadout();
  const length = loadout.dimensions.length;
  const safeDt = clamp(dt, 1 / 240, 1 / 30);
  const bow = encounterAt(state, length * 0.44, time, waveScale);
  const stern = encounterAt(state, -length * 0.38, time, waveScale);
  const bowHullRate = state.verticalVelocity - state.pitchVelocity * length * 0.40;
  const sternHullRate = state.verticalVelocity + state.pitchVelocity * length * 0.34;
  const relativeBowRise = bow.rate - bowHullRate;
  const relativeSternRise = stern.rate - sternHullRate;
  const profile = speedWaterProfile(Math.abs(telemetry.forwardSpeed), waveScale, relativeBowRise, length);

  const fwdX = Math.sin(state.yaw);
  const fwdZ = Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);
  let forwardVelocity = state.velocityX * fwdX + state.velocityZ * fwdZ;
  let lateralVelocity = state.velocityX * rightX + state.velocityZ * rightZ;

  // This is encounter resistance, not another generic drag curve. The faster the hull crosses the
  // moving wave field, the more energy it loses pushing through each crest. Froude scaling keeps
  // the transition tied to the selected waterline length.
  forwardVelocity *= Math.exp(-profile.waveDragRate * safeDt);
  lateralVelocity *= Math.exp(-profile.waveDragRate * 0.42 * safeDt);
  state.velocityX = fwdX * forwardVelocity + rightX * lateralVelocity;
  state.velocityZ = fwdZ * forwardVelocity + rightZ * lateralVelocity;

  const verticalAcceleration = profile.slamAcceleration
    - profile.releaseAcceleration
    - profile.squatAcceleration;
  state.verticalVelocity += verticalAcceleration * safeDt;

  const differentialEncounter = clamp((relativeBowRise - relativeSternRise) / 3.6, -1, 1);
  const bowLiftPitchAcceleration = -profile.slamAcceleration * 0.034
    + profile.releaseAcceleration * 0.018
    - differentialEncounter * profile.speedFactor * 0.010;
  state.pitchVelocity += bowLiftPitchAcceleration * safeDt;

  state.verticalVelocity = clamp(state.verticalVelocity, -0.72, 0.30);
  state.pitchVelocity = clamp(state.pitchVelocity, -0.145, 0.060);

  const seaLoad = clamp(
    profile.roughness * 0.42
    + profile.encounterFactor * 0.38
    + profile.speedFactor * 0.20,
    0,
    1.25
  );
  dynamicsMemory.set(dynamics, {
    lastEncounterRate: relativeBowRise,
    lastSeaLoad: seaLoad,
    lastSlam: profile.slamAcceleration
  });

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.pelagosEncounterRate = relativeBowRise.toFixed(3);
    document.documentElement.dataset.pelagosSeaLoad = seaLoad.toFixed(3);
    document.documentElement.dataset.pelagosWaveDrag = profile.waveDragRate.toFixed(4);
    document.documentElement.dataset.pelagosSlam = profile.slamAcceleration.toFixed(3);
    document.documentElement.dataset.pelagosFroude = profile.froude.toFixed(4);
  }
}

const dynamicsPrototype = ShipDynamics.prototype as typeof ShipDynamics.prototype & { __pelagosSpeedWaterV2?: boolean };
if (!dynamicsPrototype.__pelagosSpeedWaterV2) {
  dynamicsPrototype.__pelagosSpeedWaterV2 = true;
  const previousUpdate = ShipDynamics.prototype.update;
  ShipDynamics.prototype.update = function speedWaterDynamicsUpdate(
    dt: number,
    time: number,
    controls: ShipControls,
    wind: WindState,
    waveScale: number
  ): ShipTelemetry {
    const telemetry = previousUpdate.call(this, dt, time, controls, wind, waveScale);
    applySpeedWaterDynamics(this, telemetry, waveScale, time, dt);
    return telemetry;
  };
}

function visualFor(world: OceanWorld): VisualMemory {
  const existing = visualMemory.get(world);
  if (existing && existing.hullFoam.length > 0) return existing;
  const next: VisualMemory = {
    spray: (world.scene.particleSystems.find((system: { name: string }) => system.name === 'bow-spray') as ParticleSystem | undefined) ?? null,
    hullFoam: world.scene.meshes.filter((mesh) => mesh.name.startsWith('presence-hull-foam-')) as Mesh[],
    transomFoam: world.scene.meshes.filter((mesh) => mesh.name.startsWith('pelagos-transom-foam-')) as Mesh[]
  };
  visualMemory.set(world, next);
  return next;
}

function updateSpeedWaterVisuals(
  world: OceanWorld,
  state: ShipState,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number
): void {
  const loadout = getActiveShipLoadout();
  const length = loadout.dimensions.length;
  const bow = encounterAt(state, length * 0.46, time, environment.waveScale);
  const relativeBowRise = bow.rate - state.verticalVelocity;
  const profile = speedWaterProfile(Math.abs(telemetry.forwardSpeed), environment.waveScale, relativeBowRise, length);
  const speed = Math.max(0, telemetry.speed);
  const sprayLoad = clamp(
    profile.speedFactor * profile.speedFactor * (0.50 + profile.roughness * 0.52)
    + profile.slamAcceleration * 1.45,
    0,
    1.65
  );
  const visuals = visualFor(world);

  if (visuals.spray) {
    const motionGate = clamp((profile.froude - 0.012) / 0.050, 0, 1);
    const desiredRate = motionGate * (5 + speed * speed * 5.4 + sprayLoad * 92);
    visuals.spray.emitRate = Math.max(visuals.spray.emitRate * 0.52, desiredRate);

    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);
    const trail = 1.0 + speed * 0.44;
    const spread = 0.72 + profile.speedFactor * 0.58;
    const lift = 1.15 + sprayLoad * 1.25;
    visuals.spray.direction1 = new Vector3(
      -fwdX * trail - rightX * spread,
      lift,
      -fwdZ * trail - rightZ * spread
    );
    visuals.spray.direction2 = new Vector3(
      -fwdX * (trail * 0.72) + rightX * spread,
      lift + 1.15 + profile.slamAcceleration * 0.7,
      -fwdZ * (trail * 0.72) + rightZ * spread
    );
    visuals.spray.minEmitPower = 0.85 + profile.speedFactor * 0.84;
    visuals.spray.maxEmitPower = 2.4 + profile.speedFactor * 2.55 + profile.slamAcceleration * 1.8;
  }

  // Cache the contact meshes once. The contact pass owns their exact waterline position; this pass
  // changes only their energy so a fast hull produces stronger shoulder wash and transom boil.
  const contactGain = clamp(0.62 + Math.pow(profile.speedFactor, 1.45) * 1.18 + sprayLoad * 0.22, 0.62, 2.15);
  for (const mesh of visuals.hullFoam) {
    mesh.visibility = clamp(mesh.visibility * contactGain, 0, 0.82);
    mesh.scaling.x *= 0.92 + profile.speedFactor * 0.26;
    mesh.scaling.z *= 0.96 + profile.speedFactor * 0.12;
  }
  for (const mesh of visuals.transomFoam) {
    mesh.visibility = clamp(mesh.visibility * (0.72 + profile.speedFactor * 1.10), 0, 0.66);
    mesh.scaling.x *= 0.94 + profile.speedFactor * 0.20;
  }

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.pelagosBowSpraySpeed = profile.speedFactor.toFixed(3);
    document.documentElement.dataset.pelagosContactGain = contactGain.toFixed(3);
  }
}

const worldPrototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosSpeedWaterVisualV3?: boolean };
if (!worldPrototype.__pelagosSpeedWaterVisualV3) {
  worldPrototype.__pelagosSpeedWaterVisualV3 = true;
  const previousWorldUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function speedWaterVisualUpdate(
    state: ShipState,
    telemetry: ShipTelemetry,
    environment: EnvironmentFrame,
    time: number,
    dt: number,
    originX: number,
    originZ: number,
    lookYaw: number,
    lookPitch: number,
    rowing: number
  ): void {
    previousWorldUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, rowing);
    updateSpeedWaterVisuals(this, state, telemetry, environment, time);
  };
}
