import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { ShipState, ShipTelemetry } from './core';
import { clamp, lerp, sampleWave, smoothTo } from './core';
import { getActiveShipLoadout, getShipLoadoutRevision } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

export type OarVisualPose = {
  sweep: number;
  dip: number;
  power: number;
  recovery: number;
};

type OarVisualEntry = {
  pivot: TransformNode;
  shaft: Mesh;
  blade: Mesh;
  side: number;
  index: number;
};

type OarVisualMemory = {
  phase: number;
  deploy: number;
  previousPhase: number;
  revision: number;
  entries: OarVisualEntry[];
  splash: ParticleSystem | null;
};

const memories = new WeakMap<OceanWorld, OarVisualMemory>();

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function oarWaterlineDip(waterlineCenterY: number, verticalScale: number, shaftLength: number): number {
  // shipRoot.y is the configured centre above the sea. Convert that world-space offset back into
  // ship-local space, then solve the angle that places the blade centre on the waterline.
  const localWaterDrop = 0.49 + waterlineCenterY / Math.max(0.65, verticalScale);
  const bladeRadius = Math.max(1.8, shaftLength * 0.79);
  return Math.asin(clamp(localWaterDrop / bladeRadius, 0.16, 0.52));
}

export function oarVisualPose(phase: number, strokeAmplitude = 0.76, dipAmplitude = 0.50): OarVisualPose {
  const p = ((phase % 1) + 1) % 1;
  const strokeScale = clamp(strokeAmplitude / 0.76, 0.72, 1.26);
  const dipScale = clamp(dipAmplitude / 0.50, 0.76, 1.20);

  if (p < 0.62) {
    const t = smoothstep(p / 0.62);
    return {
      sweep: lerp(0.43, -0.36, t) * strokeScale,
      // This is a normalized stroke shape. updateVisibleOars scales its midpoint to the actual
      // waterline of the selected hull so highboard/harbor variants do not bury or float the blade.
      dip: (0.235 + Math.sin(t * Math.PI) * 0.060) * dipScale,
      power: Math.sin(t * Math.PI),
      recovery: 0
    };
  }

  const t = smoothstep((p - 0.62) / 0.38);
  return {
    sweep: lerp(-0.36, 0.43, t) * strokeScale,
    dip: (0.105 - Math.sin(t * Math.PI) * 0.045) * dipScale,
    power: 0,
    recovery: Math.sin(t * Math.PI)
  };
}

function collectEntries(world: OceanWorld): OarVisualEntry[] {
  const entries: OarVisualEntry[] = [];
  for (const pivot of world.scene.transformNodes) {
    const match = /^modular-oar-(-?1)-(\d+)$/.exec(pivot.name);
    if (!match) continue;
    const side = Number(match[1]);
    const index = Number(match[2]);
    const shaft = world.scene.getMeshByName(`modular-oar-shaft-${side}-${index}`) as Mesh | null;
    const blade = world.scene.getMeshByName(`modular-oar-blade-${side}-${index}`) as Mesh | null;
    if (!shaft || !blade) continue;
    entries.push({ pivot, shaft, blade, side, index });
  }
  return entries;
}

function memoryFor(world: OceanWorld): OarVisualMemory {
  const revision = getShipLoadoutRevision();
  const existing = memories.get(world);
  if (existing) {
    if (existing.revision !== revision || existing.entries.length === 0 || existing.entries.some((entry) => entry.pivot.isDisposed())) {
      existing.entries = collectEntries(world);
      existing.revision = revision;
    }
    return existing;
  }
  const splash = world.scene.particleSystems.find((system: { name: string }) => system.name === 'oar-splash') as ParticleSystem | undefined;
  const memory: OarVisualMemory = {
    phase: 0.08,
    deploy: 0,
    previousPhase: 0.08,
    revision,
    entries: collectEntries(world),
    splash: splash ?? null
  };
  memories.set(world, memory);
  return memory;
}

function updateVisibleOars(
  world: OceanWorld,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number,
  dt: number,
  originX: number,
  originZ: number,
  rowing: number
): void {
  const memory = memoryFor(world);
  const active = clamp(rowing, 0, 1);
  const safeDt = clamp(dt, 1 / 240, 1 / 24);
  memory.previousPhase = memory.phase;
  if (active > 0.02) {
    memory.phase = (memory.phase + safeDt * (0.94 + active * 0.34)) % 1;
  }
  memory.deploy = smoothTo(memory.deploy, active > 0.02 ? 1 : 0, active > 0.02 ? 5.8 : 3.2, safeDt);

  const loadout = getActiveShipLoadout();
  const visible = clamp(memory.deploy * 1.65, 0, 1);
  const waterlineDip = oarWaterlineDip(
    loadout.dimensions.waterlineCenterY,
    loadout.dimensions.verticalScale,
    loadout.oars.shaftLength
  );
  const dipScale = clamp(loadout.oars.dipAmplitude / 0.50, 0.76, 1.20);
  const referenceMidDip = 0.295 * dipScale;
  const desiredMidDip = waterlineDip + 0.030 + (dipScale - 1) * 0.045;
  const waterlinePoseScale = clamp(desiredMidDip / Math.max(0.08, referenceMidDip), 0.82, 1.62);
  let visibleCount = 0;
  let strongestPower = 0;
  let splashPoint: Vector3 | null = null;

  for (const entry of memory.entries) {
    const { pivot, shaft, blade, side, index } = entry;
    const phase = (memory.phase + index * 0.022 + (side > 0 ? 0.010 : 0)) % 1;
    const pose = oarVisualPose(phase, loadout.oars.strokeAmplitude, loadout.oars.dipAmplitude);
    const dip = pose.dip * waterlinePoseScale;

    // Use the modelled oar port as the actual fulcrum. Only the oar rotates; shaft and blade remain
    // contiguous, so no disappearing gap can open between the handle and blade while deployed.
    pivot.position.x = side * 1.46;
    pivot.position.y = 0.49;
    pivot.rotation.x = 0;
    pivot.rotation.y = side * pose.sweep * memory.deploy;
    pivot.rotation.z = -side * dip * memory.deploy;

    shaft.position.x = side * loadout.oars.shaftLength * 0.23;
    shaft.scaling.y = 1;
    shaft.visibility = visible;
    shaft.setEnabled(visible > 0.015);

    blade.position.x = side * loadout.oars.shaftLength * 0.79;
    blade.rotation.x = pose.recovery * 1.34 * memory.deploy;
    blade.visibility = visible;
    blade.setEnabled(visible > 0.015);
    if (visible > 0.30) visibleCount += 1;

    if (pose.power > strongestPower && visible > 0.72) {
      const point = blade.getAbsolutePosition();
      const water = sampleWave(point.x + originX, point.z + originZ, time, environment.waveScale);
      const immersion = water.height - point.y;
      // Accept a shallow +/- 35 cm contact band: the centre is near the surface while the long
      // blade itself visibly crosses it, instead of disappearing one metre below the shader plane.
      if (immersion > -0.34 && immersion < 0.38) {
        strongestPower = pose.power;
        splashPoint = new Vector3(point.x, water.height + 0.018, point.z);
      }
    }
  }

  if (splashPoint && memory.splash && strongestPower > 0.48 && active > 0.35) {
    if (memory.splash.emitter instanceof Vector3) memory.splash.emitter.copyFrom(splashPoint);
    const wrapped = memory.phase < memory.previousPhase;
    memory.splash.manualEmitCount = Math.max(memory.splash.manualEmitCount, wrapped ? 8 : 2 + Math.round(strongestPower * 3));
  }

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.pelagosOarDeploy = memory.deploy.toFixed(3);
    document.documentElement.dataset.pelagosVisibleOars = String(visibleCount);
    document.documentElement.dataset.pelagosOarVisualPhase = memory.phase.toFixed(3);
    document.documentElement.dataset.pelagosOarWaterlineDip = waterlineDip.toFixed(3);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosOarVisibilityV3?: boolean };
if (!prototype.__pelagosOarVisibilityV3) {
  prototype.__pelagosOarVisibilityV3 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function oarVisibilityUpdate(
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
    updateVisibleOars(this, state, environment, time, dt, originX, originZ, rowing);
  };
}
