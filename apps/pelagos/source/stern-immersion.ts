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
    // The blade belongs below the transom. Lower it slightly and keep its full steering area so a
    // trough has to expose most of the blade before it becomes readable above the surface.
    rudder.position.y = -1.74;
    rudder.scaling.y = 0.94;
  }

  for (const name of UNDERWATER_APPENDAGES) {
    const mesh = world.scene.getMeshByName(name);
    if (!mesh) continue;

    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    const center = bounds.centerWorld;
    const water = sampleWave(center.x + originX, center.z + originZ, time, environment.waveScale);

    // Translucent water used to reveal the whole rudder as soon as a modest fraction crossed the
    // surface. Only genuinely exposed geometry should now fade in; normal rough-water motion keeps
    // the steering gear visually inside the sea.
    mesh.visibility = name === 'rudder-blade'
      ? appendageVisibility(bounds.minimumWorld.y, bounds.maximumWorld.y, water.height, 0.64, 0.96)
      : appendageVisibility(bounds.minimumWorld.y, bounds.maximumWorld.y, water.height, 0.50, 0.88);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosSternImmersionV4?: boolean };
if (!prototype.__pelagosSternImmersionV4) {
  prototype.__pelagosSternImmersionV4 = true;
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
