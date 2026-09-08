import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { ShipState, ShipTelemetry } from './core';
import { clamp, hash2, sampleWave } from './core';
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

  // The first presence implementation used torus stamps. Keep its lifecycle intact so this
  // remains a small isolated refinement, but make those synthetic rings permanently invisible.
  for (const mesh of world.scene.meshes) {
    if (mesh.name.startsWith('presence-wake-')) mesh.setEnabled(false);
  }

  const material = new StandardMaterial('presence-broken-wake-material', world.scene);
  material.diffuseColor = new Color3(0.73, 0.86, 0.84);
  material.emissiveColor = new Color3(0.025, 0.045, 0.042);
  material.specularColor = new Color3(0, 0, 0);
  material.alpha = 0.23;
  material.backFaceCulling = false;

  const strips: WakeStrip[] = Array.from({ length: 56 }, (_, index) => {
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
  memory.next = time + 0.13 + (1 - speed) * 0.11;

  // Alternating broken streaks form a turbulent centreline and two faint diverging shoulders
  // instead of a repeated geometric symbol.
  for (let piece = 0; piece < 2; piece += 1) {
    const strip = memory.strips[memory.cursor++ % memory.strips.length];
    const side = strip.side;
    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);
    const jitter = (strip.seed - 0.5) * 0.22;
    const lateral = side * (0.22 + speed * 0.18) + jitter;
    const aft = 3.55 + piece * 0.38 + strip.seed * 0.34;
    strip.worldX = state.worldX - fwdX * aft + rightX * lateral;
    strip.worldZ = state.worldZ - fwdZ * aft + rightZ * lateral;
    strip.heading = state.yaw + side * (0.025 + speed * 0.035) + jitter * 0.03;
    strip.born = time;
    strip.strength = 0.22 + speed * 0.78;
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
    if (age > 7.8) {
      strip.active = false;
      strip.mesh.visibility = 0;
      continue;
    }

    const water = sampleWave(strip.worldX, strip.worldZ, time, environment.waveScale);
    strip.mesh.position.set(strip.worldX - originX, water.height + 0.020, strip.worldZ - originZ);
    strip.mesh.rotation.y = strip.heading;

    const breakup = 0.82 + Math.sin(age * 1.7 + strip.seed * 13.4) * 0.13;
    const widen = 1 + age * (0.18 + strip.strength * 0.12);
    const stretch = 1 + age * (0.34 + speed * 0.10);
    strip.mesh.scaling.set(widen, stretch, 1);
    strip.mesh.visibility = clamp(strip.strength * Math.exp(-age * 0.43) * breakup * 0.34, 0, 0.29);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosBrokenWakeV1?: boolean };
if (!prototype.__pelagosBrokenWakeV1) {
  prototype.__pelagosBrokenWakeV1 = true;
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
