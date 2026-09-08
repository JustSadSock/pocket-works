import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { ShipState, ShipTelemetry } from './core';
import { clamp, sampleWave } from './core';
import { getActiveShipLoadout, getShipScale, type ShipLoadout } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const BASE_CONTACT_POINTS = [
  { x: -0.62, z: 4.18 }, { x: 0.62, z: 4.18 },
  { x: -1.26, z: 2.85 }, { x: 1.26, z: 2.85 },
  { x: -1.55, z: 1.15 }, { x: 1.55, z: 1.15 },
  { x: -1.58, z: -0.75 }, { x: 1.58, z: -0.75 },
  { x: -1.34, z: -2.55 }, { x: 1.34, z: -2.55 }
] as const;

type ContactMemory = {
  sternFoam: Mesh[];
  sideMeniscus: Mesh[];
  transomMeniscus: Mesh;
};

const memories = new WeakMap<OceanWorld, ContactMemory>();

function worldPoint(state: ShipState, localX: number, localZ: number): { x: number; z: number } {
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  return {
    x: state.x + localX * cosYaw + localZ * sinYaw,
    z: state.z - localX * sinYaw + localZ * cosYaw
  };
}

function loadedWaterlineY(state: ShipState, telemetry: ShipTelemetry, loadout: ShipLoadout): number {
  // Mirror the loaded-trim envelope from the authoritative hydrodynamics pass. This is only used to
  // stop a decorative contact ribbon from following a short raw trough far below the supported hull;
  // it never moves the ship or the ocean simulation.
  const restingBias = clamp(0.14 + loadout.dimensions.draft * 0.055, 0.18, 0.25);
  const immersionBias = clamp(restingBias + telemetry.speed * 0.008, 0.18, 0.27);
  return state.y - loadout.dimensions.waterlineCenterY + immersionBias;
}

function ensureContact(world: OceanWorld): ContactMemory {
  const existing = memories.get(world);
  if (existing) return existing;

  const foamMaterial = new StandardMaterial('pelagos-transom-contact-foam', world.scene);
  foamMaterial.diffuseColor = new Color3(0.78, 0.90, 0.88);
  foamMaterial.emissiveColor = new Color3(0.045, 0.070, 0.064);
  foamMaterial.specularColor = new Color3(0.01, 0.01, 0.01);
  foamMaterial.alpha = 0.64;
  foamMaterial.backFaceCulling = false;

  const sternFoam = [-1, 1].map((side) => {
    const mesh = MeshBuilder.CreatePlane(`pelagos-transom-foam-${side}`, { width: 0.78, height: 0.17 }, world.scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.material = foamMaterial;
    mesh.visibility = 0;
    mesh.isPickable = false;
    return mesh;
  });

  // A displacement hull carries a thin band of disturbed water before it produces actual white
  // foam. Thin 3D ribbons intersect the planking instead of lying flat on the ocean; this makes the
  // waterline readable from a chase camera without drawing a glowing outline around the vessel.
  const meniscusMaterial = new StandardMaterial('pelagos-waterline-meniscus', world.scene);
  meniscusMaterial.diffuseColor = new Color3(0.54, 0.72, 0.71);
  meniscusMaterial.emissiveColor = new Color3(0.012, 0.034, 0.033);
  meniscusMaterial.specularColor = new Color3(0.045, 0.065, 0.062);
  meniscusMaterial.specularPower = 42;
  meniscusMaterial.alpha = 0.52;
  meniscusMaterial.backFaceCulling = false;

  const sideMeniscus = BASE_CONTACT_POINTS.map((_, index) => {
    const mesh = MeshBuilder.CreateBox(`pelagos-waterline-meniscus-${index}`, {
      width: 0.14,
      height: 0.085,
      depth: 1.28
    }, world.scene);
    mesh.material = meniscusMaterial;
    mesh.visibility = 0;
    mesh.isPickable = false;
    return mesh;
  });

  const transomMeniscus = MeshBuilder.CreateBox('pelagos-transom-meniscus', {
    width: 1.58,
    height: 0.09,
    depth: 0.16
  }, world.scene);
  transomMeniscus.material = meniscusMaterial;
  transomMeniscus.visibility = 0;
  transomMeniscus.isPickable = false;

  const memory = { sternFoam, sideMeniscus, transomMeniscus };
  memories.set(world, memory);
  return memory;
}

function updateScaledSideContact(
  world: OceanWorld,
  memory: ContactMemory,
  state: ShipState,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  const loadout = getActiveShipLoadout();
  const scale = getShipScale(loadout);
  const speed = clamp(telemetry.speed / 6.2, 0, 1);
  const halfLength = loadout.dimensions.length * 0.5;
  const supportedWater = loadedWaterlineY(state, telemetry, loadout);

  for (let index = 0; index < BASE_CONTACT_POINTS.length; index += 1) {
    const source = BASE_CONTACT_POINTS[index];
    const localX = source.x * scale.x;
    const localZ = source.z * scale.z;
    const point = worldPoint(state, localX, localZ);
    const water = sampleWave(point.x + originX, point.z + originZ, time, environment.waveScale);
    const hullY = state.y - 0.52 * scale.y + Math.sin(state.pitch) * localZ - Math.sin(state.roll) * localX;
    const contact = clamp((water.height - hullY + 0.14 * scale.y) / (0.31 * scale.y), 0, 1);
    const bowBias = clamp((localZ + halfLength * 0.56) / Math.max(1, halfLength * 1.30), 0.28, 1);
    const motion = clamp(
      Math.abs(state.verticalVelocity)
      + Math.abs(state.pitchVelocity * localZ) * 0.44
      + Math.abs(state.rollVelocity * localX) * 0.52,
      0,
      1.5
    );

    const foam = world.scene.getMeshByName(`presence-hull-foam-${index}`);
    if (foam) {
      foam.position.set(point.x, water.height + 0.024, point.z);
      foam.rotation.y = state.yaw;
      foam.scaling.x = scale.x * (0.72 + speed * 1.16 + bowBias * 0.20);
      foam.scaling.y = 0.80 + contact * 0.44;
      foam.visibility = clamp(contact * (0.12 + speed * 0.78) * (0.46 + environment.waveScale * 0.24), 0, 0.72);
    }

    const meniscus = memory.sideMeniscus[index];
    const side = Math.sign(source.x) || 1;
    // Never let a tiny raw trough pull the contact strip far below the displacement support plane.
    // Crests can still rise naturally; only the visually impossible downward separation is clipped.
    const displayWater = Math.max(water.height, supportedWater - 0.065);
    meniscus.position.set(point.x - side * 0.018 * scale.x, displayWater + 0.004, point.z);
    meniscus.rotation.y = state.yaw + side * clamp(localZ / Math.max(1, halfLength), -1, 1) * 0.045;
    meniscus.scaling.set(
      scale.x * (0.86 + contact * 0.14),
      0.82 + motion * 0.12,
      scale.z * (0.88 + speed * 0.16 + motion * 0.06)
    );
    meniscus.visibility = clamp(
      (0.12 + contact * 0.18 + environment.waveScale * 0.035 + speed * 0.10 + motion * 0.16),
      0.12,
      0.42
    );
  }

  const wetMaterial = world.scene.getMaterialByName('presence-wet-wood');
  if (wetMaterial instanceof StandardMaterial) {
    wetMaterial.alpha = clamp(0.50 + environment.rain * 0.12 + environment.waveScale * 0.025, 0.50, 0.68);
  }
}

function updateTransomContact(
  world: OceanWorld,
  memory: ContactMemory,
  state: ShipState,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  const loadout = getActiveShipLoadout();
  const scale = getShipScale(loadout);
  const speed = clamp(telemetry.speed / 6.2, 0, 1);
  const localZ = -4.42 * scale.z;
  const supportedWater = loadedWaterlineY(state, telemetry, loadout);
  let transomContact = 0;
  let transomWater = 0;

  for (let index = 0; index < memory.sternFoam.length; index += 1) {
    const side = index === 0 ? -1 : 1;
    const localX = side * 0.62 * scale.x;
    const point = worldPoint(state, localX, localZ);
    const water = sampleWave(point.x + originX, point.z + originZ, time, environment.waveScale);
    const hullY = state.y - 0.58 * scale.y + Math.sin(state.pitch) * localZ - Math.sin(state.roll) * localX;
    const contact = clamp((water.height - hullY + 0.12 * scale.y) / (0.28 * scale.y), 0, 1);
    transomContact += contact * 0.5;
    transomWater += Math.max(water.height, supportedWater - 0.055) * 0.5;

    const mesh = memory.sternFoam[index];
    mesh.position.set(point.x, water.height + 0.022, point.z);
    mesh.rotation.y = state.yaw + side * 0.035;
    mesh.scaling.x = scale.x * (0.88 + speed * 0.68);
    mesh.scaling.y = 0.82 + contact * 0.38;
    mesh.visibility = clamp(contact * (0.05 + speed * 0.48 + Math.max(0, environment.waveScale - 0.7) * 0.10), 0, 0.50);
  }

  const center = worldPoint(state, 0, localZ);
  const motion = clamp(Math.abs(state.verticalVelocity) + Math.abs(state.pitchVelocity * localZ) * 0.52, 0, 1.5);
  memory.transomMeniscus.position.set(center.x, transomWater + 0.002, center.z);
  memory.transomMeniscus.rotation.y = state.yaw;
  memory.transomMeniscus.scaling.set(
    scale.x * (1.02 + speed * 0.12),
    0.86 + motion * 0.12,
    scale.z * (0.90 + motion * 0.06)
  );
  memory.transomMeniscus.visibility = clamp(
    0.14 + transomContact * 0.17 + environment.waveScale * 0.03 + speed * 0.10 + motion * 0.17,
    0.14,
    0.40
  );
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosWaterContactV3?: boolean };
if (!prototype.__pelagosWaterContactV3) {
  prototype.__pelagosWaterContactV3 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function scaleAwareWaterContactUpdate(
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
    previousUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, rowing);
    const memory = ensureContact(this);
    updateScaledSideContact(this, memory, state, telemetry, environment, time, originX, originZ);
    updateTransomContact(this, memory, state, telemetry, environment, time, originX, originZ);
  };
}
