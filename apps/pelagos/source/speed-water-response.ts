import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { ShipControls, ShipState, ShipTelemetry, WindState } from './core';
import { ShipDynamics, clamp, sampleWave } from './core';
import { getActiveShipLoadout } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

export type SpeedWaterProfile = {
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

const dynamicsMemory = new WeakMap<ShipDynamics, DynamicsMemory>();

export function speedWaterProfile(speed: number, waveScale: number, relativeBowRise: number): SpeedWaterProfile {
  const safeSpeed = Math.max(0, speed);
  const speedFactor = clamp(safeSpeed / 5.2, 0, 1.25);
  const roughness = clamp((waveScale - 0.45) / 1.55, 0, 1.15);
  const encounterFactor = clamp(Math.abs(relativeBowRise) / 2.25, 0, 1.25);
  const slam = clamp((relativeBowRise - 0.28) / 1.55, 0, 1.15) * speedFactor;
  const release = clamp((-relativeBowRise - 0.34) / 1.75, 0, 1.05) * speedFactor;
  return {
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
  const profile = speedWaterProfile(Math.abs(telemetry.forwardSpeed), waveScale, relativeBowRise);

  const fwdX = Math.sin(state.yaw);
  const fwdZ = Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);
  let forwardVelocity = state.velocityX * fwdX + state.velocityZ * fwdZ;
  let lateralVelocity = state.velocityX * rightX + state.velocityZ * rightZ;

  // Resistance from crossing a moving wave field is separate from the hull's calm-water drag.
  // It rises non-linearly with both vessel speed and encounter rate, so accelerating into chop now
  // produces a visibly and physically different result from drifting through the same sea.
  forwardVelocity *= Math.exp(-profile.waveDragRate * safeDt);
  lateralVelocity *= Math.exp(-profile.waveDragRate * 0.42 * safeDt);
  state.velocityX = fwdX * forwardVelocity + rightX * lateralVelocity;
  state.velocityZ = fwdZ * forwardVelocity + rightZ * lateralVelocity;

  // Dynamic squat increases with speed while fast-rising bow water produces a short supported lift.
  // A falling surface releases the bow again. These are bounded accelerations layered on top of the
  // long-hull buoyancy solver rather than a second position solver.
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
  }
}

const dynamicsPrototype = ShipDynamics.prototype as typeof ShipDynamics.prototype & { __pelagosSpeedWaterV1?: boolean };
if (!dynamicsPrototype.__pelagosSpeedWaterV1) {
  dynamicsPrototype.__pelagosSpeedWaterV1 = true;
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

function updateSpeedWaterVisuals(
  world: OceanWorld,
  state: ShipState,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number
): void {
  const loadout = getActiveShipLoadout();
  const bow = encounterAt(state, loadout.dimensions.length * 0.46, time, environment.waveScale);
  const relativeBowRise = bow.rate - state.verticalVelocity;
  const profile = speedWaterProfile(Math.abs(telemetry.forwardSpeed), environment.waveScale, relativeBowRise);
  const speed = Math.max(0, telemetry.speed);

  const spray = world.scene.particleSystems.find((system: { name: string }) => system.name === 'bow-spray') as ParticleSystem | undefined;
  if (spray) {
    const motionGate = clamp((speed - 0.18) / 0.55, 0, 1);
    const sprayLoad = clamp(
      profile.speedFactor * profile.speedFactor * (0.50 + profile.roughness * 0.52)
      + profile.slamAcceleration * 1.45,
      0,
      1.65
    );
    const desiredRate = motionGate * (5 + speed * speed * 5.4 + sprayLoad * 92);
    spray.emitRate = Math.max(spray.emitRate * 0.52, desiredRate);

    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);
    const trail = 1.0 + speed * 0.44;
    const spread = 0.72 + speed * 0.11;
    const lift = 1.15 + sprayLoad * 1.25;
    spray.direction1 = new Vector3(
      -fwdX * trail - rightX * spread,
      lift,
      -fwdZ * trail - rightZ * spread
    );
    spray.direction2 = new Vector3(
      -fwdX * (trail * 0.72) + rightX * spread,
      lift + 1.15 + profile.slamAcceleration * 0.7,
      -fwdZ * (trail * 0.72) + rightZ * spread
    );
    spray.minEmitPower = 0.85 + speed * 0.16;
    spray.maxEmitPower = 2.4 + speed * 0.46 + profile.slamAcceleration * 1.8;
  }

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.pelagosBowSpraySpeed = profile.speedFactor.toFixed(3);
  }
}

const worldPrototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosSpeedWaterVisualV1?: boolean };
if (!worldPrototype.__pelagosSpeedWaterVisualV1) {
  worldPrototype.__pelagosSpeedWaterVisualV1 = true;
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
