import type { ShipState, ShipTelemetry } from './core';
import { clamp, sampleWave } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const UNDERWATER_APPENDAGES = ['rudder-blade', 'refit-skeg'] as const;

function updateSternAppendageImmersion(
  world: OceanWorld,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  const rudder = world.scene.getMeshByName('rudder-blade');
  if (rudder) {
    // The old blade was centred high enough that a passing stern trough could expose most of it.
    // Seat it behind the immersed transom; the tiller/stock stay untouched above the waterline.
    rudder.position.y = -1.42;
    rudder.scaling.y = 0.94;
  }

  for (const name of UNDERWATER_APPENDAGES) {
    const mesh = world.scene.getMeshByName(name);
    if (!mesh) continue;

    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    const center = bounds.centerWorld;
    const water = sampleWave(center.x + originX, center.z + originZ, time, environment.waveScale);
    const exposedTop = bounds.maximumWorld.y - water.height;

    // The ocean shader is intentionally translucent at grazing angles, which used to make fully
    // submerged steering hardware look as if it were hanging in open air. Treat the water surface
    // as the visual occluder for appendages: they fade in only if the real wave surface exposes them.
    mesh.visibility = clamp((exposedTop + 0.015) / 0.16, 0, 1);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosSternImmersionV1?: boolean };
if (!prototype.__pelagosSternImmersionV1) {
  prototype.__pelagosSternImmersionV1 = true;
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
