import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { ShipState, ShipTelemetry } from './core';
import { clamp, sampleWave } from './core';
import { getActiveShipLoadout, getShipScale } from './ship-loadout';
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

function ensureContact(world: OceanWorld): ContactMemory {
  const existing = memories.get(world);
  if (existing) return existing;

  const material = new StandardMaterial('pelagos-transom-contact-foam', world.scene);
  material.diffuseColor = new Color3(0.78, 0.90, 0.88);
  material.emissiveColor = new Color3(0.045, 0.070, 0.064);
  material.specularColor = new Color3(0.01, 0.01, 0.01);
  material.alpha = 0.64;
  material.backFaceCulling = false;

  const sternFoam = [-1, 1].map((side) => {
    const mesh = MeshBuilder.CreatePlane(`pelagos-transom-foam-${side}`, { width: 0.78, height: 0.17 }, world.scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.material = material;
    mesh.visibility = 0;
    mesh.isPickable = false;
    return mesh;
  });

  const memory = { sternFoam };
  memories.set(world, memory);
  return memory;
}

function updateScaledSideContact(
  world: OceanWorld,
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

  for (let index = 0; index < BASE_CONTACT_POINTS.length; index += 1) {
    const source = BASE_CONTACT_POINTS[index];
    const localX = source.x * scale.x;
    const localZ = source.z * scale.z;
    const point = worldPoint(state, localX, localZ);
    const water = sampleWave(point.x + originX, point.z + originZ, time, environment.waveScale);
    const hullY = state.y - 0.52 * scale.y + Math.sin(state.pitch) * localZ - Math.sin(state.roll) * localX;
    const contact = clamp((water.height - hullY + 0.14 * scale.y) / (0.31 * scale.y), 0, 1);
    const bowBias = clamp((localZ + halfLength * 0.56) / Math.max(1, halfLength * 1.30), 0.28, 1);
    const mesh = world.scene.getMeshByName(`presence-hull-foam-${index}`);
    if (!mesh) continue;
    mesh.position.set(point.x, water.height + 0.024, point.z);
    mesh.rotation.y = state.yaw;
    mesh.scaling.x = scale.x * (0.72 + speed * 1.16 + bowBias * 0.20);
    mesh.scaling.y = 0.80 + contact * 0.44;
    mesh.visibility = clamp(contact * (0.12 + speed * 0.78) * (0.46 + environment.waveScale * 0.24), 0, 0.72);
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

  for (let index = 0; index < memory.sternFoam.length; index += 1) {
    const side = index === 0 ? -1 : 1;
    const localX = side * 0.62 * scale.x;
    const point = worldPoint(state, localX, localZ);
    const water = sampleWave(point.x + originX, point.z + originZ, time, environment.waveScale);
    const hullY = state.y - 0.58 * scale.y + Math.sin(state.pitch) * localZ - Math.sin(state.roll) * localX;
    const contact = clamp((water.height - hullY + 0.12 * scale.y) / (0.28 * scale.y), 0, 1);
    const mesh = memory.sternFoam[index];
    mesh.position.set(point.x, water.height + 0.022, point.z);
    mesh.rotation.y = state.yaw + side * 0.035;
    mesh.scaling.x = scale.x * (0.88 + speed * 0.68);
    mesh.scaling.y = 0.82 + contact * 0.38;
    mesh.visibility = clamp(contact * (0.05 + speed * 0.48 + Math.max(0, environment.waveScale - 0.7) * 0.10), 0, 0.50);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosWaterContactV1?: boolean };
if (!prototype.__pelagosWaterContactV1) {
  prototype.__pelagosWaterContactV1 = true;
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
    updateScaledSideContact(this, state, telemetry, environment, time, originX, originZ);
    updateTransomContact(this, memory, state, telemetry, environment, time, originX, originZ);
  };
}
