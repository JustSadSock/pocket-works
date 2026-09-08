import type { ShipState, ShipTelemetry } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const adjusted = new WeakSet<OceanWorld>();

function adjustUnderbody(world: OceanWorld): void {
  if (adjusted.has(world)) return;
  const blade = world.scene.getMeshByName('rudder-blade');
  if (!blade) return;

  // The procedural steering blade remains the gameplay rudder even with the Blender hull. Its
  // old center sat almost at the static waterline, so a modest bow-down attitude revealed most of
  // the blade from the chase camera. Keep the hinge/tiller untouched and lower only the immersed
  // blade, matching a transom-hung cutter rudder whose working area stays below the stern.
  blade.position.y = -0.92;
  blade.scaling.y = 1.18;
  adjusted.add(world);
  document.documentElement.dataset.pelagosUnderbody = 'immersed';
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosUnderbodyRefitV1?: boolean };
if (!prototype.__pelagosUnderbodyRefitV1) {
  prototype.__pelagosUnderbodyRefitV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function underbodyUpdate(
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
    adjustUnderbody(this);
  };
}
