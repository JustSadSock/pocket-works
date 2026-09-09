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
const GRAVITY = 9.81;

function ensureWake(world: OceanWorld): WakeMemory {
  const existing = memories.get(world);
  if (existing) return existing;

  for (const mesh of world.scene.meshes) {
    if (mesh.name.startsWith('presence-wake-')) mesh.setEnabled(false);
  }

  const material = new StandardMaterial('presence-broken-wake-material', world.scene);
  material.diffuseColor = new Color3(0.76, 0.89, 0.87);
  material.emissiveColor = new Color3(0.030, 0.052, 0.048);
  material.specularColor = new Color3(0, 0, 0);
  material.alpha = 0.30;
  material.backFaceCulling = false;

  const strips: WakeStrip[] = Array.from({ length: 88 }, (_, index) => {
    const seed = hash2(index * 79 + 17, index * 131 + 23);
    const mesh = MeshBuilder.CreatePlane(`presence-broken-wake-${index}`, {
      width: 0.20 + seed * 0.13,
      height: 1.55 + seed * 1.0
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
  const loadout = getActiveShipLoadout();
  const hullLength = loadout.dimensions.length;
  const froude = Math.max(0, telemetry.speed) / Math.sqrt(GRAVITY * Math.max(8, hullLength));
  const speed = clamp(froude / 0.46, 0, 1.25);
  if (speed < 0.045 || time < memory.next) return;
  const lengthScale = clamp(hullLength / 12.8, 0.82, 1.30);
  const beamScale = clamp(loadout.dimensions.beam / 3.9, 0.82, 1.22);
  const cadence = 0.17 - clamp(speed, 0, 1) * 0.105;
  memory.next = time + Math.max(0.055, cadence);

  // Wake energy is keyed to the displacement speed regime. The small harbor hull starts opening a
  // strong V sooner than a 15.6 m cruiser at the same m/s, matching the Froude-scaled pressure wave.
  for (let piece = 0; piece < 2; piece += 1) {
    const strip = memory.strips[memory.cursor++ % memory.strips.length];
    const side = strip.side;
    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);
    const jitter = (strip.seed - 0.5) * 0.22 * beamScale;
    const lateral = side * (loadout.dimensions.beam * (0.055 + speed * 0.090)) + jitter;
    const aft = hullLength * 0.445 + piece * 0.30 * lengthScale + strip.seed * 0.24 * lengthScale;
    strip.worldX = state.worldX - fwdX * aft + rightX * lateral;
    strip.worldZ = state.worldZ - fwdZ * aft + rightZ * lateral;
    strip.heading = state.yaw + side * (0.018 + speed * 0.070) + jitter * 0.020;
    strip.born = time;
    strip.strength = clamp(0.10 + Math.pow(speed, 1.35) * 0.92, 0.10, 1.20);
    strip.beamScale = beamScale;
    strip.lengthScale = lengthScale;
    strip.active = true;
  }

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.pelagosWakeFroude = froude.toFixed(4);
    document.documentElement.dataset.pelagosWakeRegime = speed.toFixed(3);
  }
}

function updateWake(
  memory: WakeMemory,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  for (const strip of memory.strips) {
    if (!strip.active) continue;
    const age = time - strip.born;
    const life = 5.8 + strip.strength * 4.8;
    if (age > life) {
      strip.active = false;
      strip.mesh.visibility = 0;
      continue;
    }

    const water = sampleWave(strip.worldX, strip.worldZ, time, environment.waveScale);
    strip.mesh.position.set(strip.worldX - originX, water.height + 0.022, strip.worldZ - originZ);
    strip.mesh.rotation.y = strip.heading;

    const breakup = 0.82 + Math.sin(age * 1.55 + strip.seed * 13.4) * 0.15;
    const widen = strip.beamScale * (1 + age * (0.15 + strip.strength * 0.19));
    const stretch = strip.lengthScale * (1 + age * (0.29 + strip.strength * 0.18));
    strip.mesh.scaling.set(widen, stretch, 1);
    strip.mesh.visibility = clamp(
      strip.strength * Math.exp(-age * (0.36 - clamp(strip.strength, 0, 1) * 0.08)) * breakup * 0.42,
      0,
      0.42
    );
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosBrokenWakeV4?: boolean };
if (!prototype.__pelagosBrokenWakeV4) {
  prototype.__pelagosBrokenWakeV4 = true;
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
    updateWake(memory, environment, time, originX, originZ);
  };
}
