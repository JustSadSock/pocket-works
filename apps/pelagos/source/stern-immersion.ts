import type { ShipState, ShipTelemetry } from './core';
import { clamp, sampleWave } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const UNDERWATER_APPENDAGES = ['rudder-blade', 'refit-skeg'] as const;

export function appendageVisibility(
  minimumY: number,
  maximumY: number,
  waterHeight: number,
  exposureStart = 0.42,
  exposureFull = 0.82
): number {
  const span = Math.max(0.05, maximumY - minimumY);
  const exposedFraction = clamp((maximumY - waterHeight) / span, 0, 1);
  const t = clamp((exposedFraction - exposureStart) / Math.max(0.05, exposureFull - exposureStart), 0, 1);
  return t * t * (3 - 2 * t);
}

function hideAuthoredUnderwaterDuplicate(world: OceanWorld): void {
  // The Blender cutter contains a decorative PW_Sternpost running well below the transom.
  // Through the intentionally translucent ocean it reads as a second exposed rudder even when
  // the actual working blade is submerged. The closed authored transom already carries the
  // visible stern structure, so this redundant full-depth post is disabled at runtime.
  for (const mesh of world.scene.meshes) {
    if (mesh.name.toLowerCase() === 'pw_sternpost') mesh.setEnabled(false);
  }
}

function updateSternAppendageImmersion(
  world: OceanWorld,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  hideAuthoredUnderwaterDuplicate(world);

  const rudder = world.scene.getMeshByName('rudder-blade');
  if (rudder) {
    // The working blade lives behind the immersed transom. It should only become visually
    // readable when a genuinely severe trough exposes a large fraction of the blade, not merely
    // because transparent water lets the camera see through the surface.
    rudder.position.y = -1.58;
    rudder.scaling.y = 0.90;
  }

  for (const name of UNDERWATER_APPENDAGES) {
    const mesh = world.scene.getMeshByName(name);
    if (!mesh) continue;

    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    const center = bounds.centerWorld;
    const water = sampleWave(center.x + originX, center.z + originZ, time, environment.waveScale);

    // Whole-mesh visibility is based on the fraction actually above the live wave surface.
    // A few exposed centimetres at the stock no longer make a metre of submerged blade appear
    // through the translucent ocean. The skeg uses a slightly lower threshold because it is
    // shorter and can legitimately flash into view sooner in an extreme trough.
    mesh.visibility = name === 'rudder-blade'
      ? appendageVisibility(bounds.minimumWorld.y, bounds.maximumWorld.y, water.height, 0.46, 0.84)
      : appendageVisibility(bounds.minimumWorld.y, bounds.maximumWorld.y, water.height, 0.38, 0.76);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosSternImmersionV3?: boolean };
if (!prototype.__pelagosSternImmersionV3) {
  prototype.__pelagosSternImmersionV3 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function sternImmersionUpdate(
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
    updateSternAppendageImmersion(this, environment, time, originX, originZ);
  };
}
