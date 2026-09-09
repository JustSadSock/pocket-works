import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { ShipState, ShipTelemetry } from './core';
import { clamp, lerp, sampleWave, smoothTo } from './core';
import { getActiveShipLoadout } from './ship-loadout';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

export type OarVisualPose = {
  sweep: number;
  dip: number;
  power: number;
  recovery: number;
};

type OarVisualMemory = {
  phase: number;
  deploy: number;
  previousPhase: number;
};

const memories = new WeakMap<OceanWorld, OarVisualMemory>();

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function oarVisualPose(phase: number, strokeAmplitude = 0.76, dipAmplitude = 0.50): OarVisualPose {
  const p = ((phase % 1) + 1) % 1;
  const strokeScale = clamp(strokeAmplitude / 0.76, 0.72, 1.26);
  const dipScale = clamp(dipAmplitude / 0.50, 0.76, 1.20);

  if (p < 0.62) {
    const t = smoothstep(p / 0.62);
    return {
      sweep: lerp(0.43, -0.36, t) * strokeScale,
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

function memoryFor(world: OceanWorld): OarVisualMemory {
  const existing = memories.get(world);
  if (existing) return existing;
  const memory = { phase: 0.08, deploy: 0, previousPhase: 0.08 };
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
    // A full stroke at roughly 1.25 Hz remains readable on a phone. The physics pulse can be
    // higher-frequency internally; the visible bank deliberately moves like human rowers instead
    // of becoming a motion-blurred propeller.
    memory.phase = (memory.phase + safeDt * (0.94 + active * 0.34)) % 1;
  }
  memory.deploy = smoothTo(memory.deploy, active > 0.02 ? 1 : 0, active > 0.02 ? 5.8 : 3.2, safeDt);

  const loadout = getActiveShipLoadout();
  const visible = clamp(memory.deploy * 1.65, 0, 1);
  let visibleCount = 0;
  let strongestPower = 0;
  let splashPoint: Vector3 | null = null;

  for (const pivot of world.scene.transformNodes) {
    const match = /^modular-oar-(-?1)-(\d+)$/.exec(pivot.name);
    if (!match) continue;
    const side = Number(match[1]);
    const index = Number(match[2]);
    const phase = (memory.phase + index * 0.022 + (side > 0 ? 0.010 : 0)) % 1;
    const pose = oarVisualPose(phase, loadout.oars.strokeAmplitude, loadout.oars.dipAmplitude);

    // Fix the fulcrum at the gunwale. The previous rig translated the whole pivot outward and then
    // translated the shaft a second time; on a loaded cutter that put most of the blade below the
    // opaque ocean. Now only the oar rotates around a real oarlock.
    pivot.position.x = side * 1.46;
    pivot.position.y = 0.60;
    pivot.rotation.x = 0;
    pivot.rotation.y = side * pose.sweep * memory.deploy;
    pivot.rotation.z = -side * pose.dip * memory.deploy;

    const shaft = world.scene.getMeshByName(`modular-oar-shaft-${side}-${index}`);
    if (shaft) {
      shaft.position.x = side * loadout.oars.shaftLength * 0.23;
      shaft.scaling.y = 1;
      shaft.visibility = visible;
      shaft.setEnabled(visible > 0.015);
    }

    const blade = world.scene.getMeshByName(`modular-oar-blade-${side}-${index}`);
    if (blade) {
      blade.position.x = side * loadout.oars.shaftLength * 0.79;
      blade.rotation.x = pose.recovery * 1.34 * memory.deploy;
      blade.visibility = visible;
      blade.setEnabled(visible > 0.015);
      if (visible > 0.30) visibleCount += 1;

      if (pose.power > strongestPower && visible > 0.72) {
        const point = blade.getAbsolutePosition();
        const water = sampleWave(point.x + originX, point.z + originZ, time, environment.waveScale);
        const immersion = water.height - point.y;
        // Choose a blade close to the surface for the shared particle emitter. Power strokes stay
        // shallow enough to remain visible while still intersecting the water.
        if (immersion > -0.30 && immersion < 0.34) {
          strongestPower = pose.power;
          splashPoint = new Vector3(point.x, water.height + 0.018, point.z);
        }
      }
    }
  }

  const splash = world.scene.particleSystems.find((system: { name: string }) => system.name === 'oar-splash') as ParticleSystem | undefined;
  if (splashPoint && splash && strongestPower > 0.52 && active > 0.35) {
    if (splash.emitter instanceof Vector3) splash.emitter.copyFrom(splashPoint);
    const wrapped = memory.phase < memory.previousPhase;
    splash.manualEmitCount = Math.max(splash.manualEmitCount, wrapped ? 8 : 2 + Math.round(strongestPower * 3));
  }

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.pelagosOarDeploy = memory.deploy.toFixed(3);
    document.documentElement.dataset.pelagosVisibleOars = String(visibleCount);
    document.documentElement.dataset.pelagosOarVisualPhase = memory.phase.toFixed(3);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosOarVisibilityV1?: boolean };
if (!prototype.__pelagosOarVisibilityV1) {
  prototype.__pelagosOarVisibilityV1 = true;
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
