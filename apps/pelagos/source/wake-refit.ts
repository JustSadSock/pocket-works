import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { ShipState, ShipTelemetry } from './core';
import { clamp, hash2, sampleWave } from './core';
import { getActiveShipLoadout } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type WakeStrip = {
  mesh: Mesh;
  worldX: number;
  worldZ: number;
  born: number;
  heading: number;
  side: number;
  strength: number;
  seed: number;
  beamScale: number;
  lengthScale: number;
  active: boolean;
};

type WakeMemory = {
  strips: WakeStrip[];
  cursor: number;
  next: number;
};

const memories = new WeakMap<OceanWorld, WakeMemory>();

function ensureWake(world: OceanWorld): WakeMemory {
  const existing = memories.get(world);
  if (existing) return existing;

  for (const mesh of world.scene.meshes) {
    if (mesh.name.startsWith('presence-wake-')) mesh.setEnabled(false);
  }

  const material = new StandardMaterial('presence-broken-wake-material', world.scene);
  material.diffuseColor = new Color3(0.73, 0.86, 0.84);
  material.emissiveColor = new Color3(0.025, 0.045, 0.042);
  material.specularColor = new Color3(0, 0, 0);
  material.alpha = 0.23;
  material.backFaceCulling = false;

  const strips: WakeStrip[] = Array.from({ length: 64 }, (_, index) => {
    const seed = hash2(index * 79 + 17, index * 131 + 23);
    const mesh = MeshBuilder.CreatePlane(`presence-broken-wake-${index}`, {
      width: 0.18 + seed * 0.10,
      height: 1.45 + seed * 0.85
    }, world.scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.material = material;
    mesh.visibility = 0;
    mesh.isPickable = false;
    return {
      mesh,
      worldX: 0,
      worldZ: 0,
      born: 0,
      heading: 0,
      side: index % 2 === 0 ? -1 : 1,
      strength: 0,
      seed,
      beamScale: 1,
      lengthScale: 1,
      active: false
    };
  });

  const memory = { strips, cursor: 0, next: 0 };
  memories.set(world, memory);
  return memory;
}

function spawnWake(memory: WakeMemory, state: ShipState, telemetry: ShipTelemetry, time: number): void {
  const speed = clamp(telemetry.speed / 6.4, 0, 1);
  if (speed < 0.075 || time < memory.next) return;
  const loadout = getActiveShipLoadout();
  const lengthScale = clamp(loadout.dimensions.length / 12.8, 0.82, 1.30);
  const beamScale = clamp(loadout.dimensions.beam / 3.9, 0.82, 1.22);
  memory.next = time + 0.12 + (1 - speed) * 0.10;

  // The wake starts at the actual transom, not at a hard-coded point inside the enlarged hull.
  // Width and divergence follow the selected beam so a 15.6 m cruiser leaves a broader track than
  // the 10.8 m harbor cutter.
  for (let piece = 0; piece < 2; piece += 1) {
    const strip = memory.strips[memory.cursor++ % memory.strips.length];
    const side = strip.side;
    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);
    const jitter = (strip.seed - 0.5) * 0.18 * beamScale;
    const lateral = side * (loadout.dimensions.beam * (0.075 + speed * 0.045)) + jitter;
    const aft = loadout.dimensions.length * 0.445 + piece * 0.28 * lengthScale + strip.seed * 0.20 * lengthScale;
    strip.worldX = state.worldX - fwdX * aft + rightX * lateral;
    strip.worldZ = state.worldZ - fwdZ * aft + rightZ * lateral;
    strip.heading = state.yaw + side * (0.022 + speed * 0.034) + jitter * 0.018;
    strip.born = time;
    strip.strength = 0.20 + speed * 0.80;
    strip.beamScale = beamScale;
    strip.lengthScale = lengthScale;
    strip.active = true;
  }
}

function updateWake(
  memory: WakeMemory,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  const speed = clamp(telemetry.speed / 6.4, 0, 1);
  for (const strip of memory.strips) {
    if (!strip.active) continue;
    const age = time - strip.born;
    if (age > 8.2) {
      strip.active = false;
      strip.mesh.visibility = 0;
      continue;
    }

    const water = sampleWave(strip.worldX, strip.worldZ, time, environment.waveScale);
    strip.mesh.position.set(strip.worldX - originX, water.height + 0.020, strip.worldZ - originZ);
    strip.mesh.rotation.y = strip.heading;

    const breakup = 0.82 + Math.sin(age * 1.7 + strip.seed * 13.4) * 0.13;
    const widen = strip.beamScale * (1 + age * (0.18 + strip.strength * 0.12));
    const stretch = strip.lengthScale * (1 + age * (0.34 + speed * 0.10));
    strip.mesh.scaling.set(widen, stretch, 1);
    strip.mesh.visibility = clamp(strip.strength * Math.exp(-age * 0.43) * breakup * 0.34, 0, 0.29);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosBrokenWakeV2?: boolean };
if (!prototype.__pelagosBrokenWakeV2) {
  prototype.__pelagosBrokenWakeV2 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function brokenWakeUpdate(
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
    const memory = ensureWake(this);
    spawnWake(memory, state, telemetry, time);
    updateWake(memory, telemetry, environment, time, originX, originZ);
  };
}
