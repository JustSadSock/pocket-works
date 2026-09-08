import type { ShipState, ShipTelemetry } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const adjusted = new WeakSet<OceanWorld>();

function adjustUnderbody(world: OceanWorld): void {
  if (adjusted.has(world)) return;
  const blade = world.scene.getMeshByName('rudder-blade');
  if (!blade) return;

  // The procedural steering blade remains the gameplay rudder even with the Blender hull. Its
  // original upper edge sat above the static waterline, so every bow-down pulse exposed a large
  // rectangular steering surface. A real transom-hung cutter can show its stock/tiller, but the
  // working blade remains immersed. Keep the hinge/tiller untouched and sink the blade itself so
  // its top sits around the static water plane while its lower edge stays inside the 1.65 m draft.
  blade.position.y = -1.15;
  blade.scaling.y = 1.10;
  adjusted.add(world);
  document.documentElement.dataset.pelagosUnderbody = 'immersed';
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosUnderbodyRefitV2?: boolean };
if (!prototype.__pelagosUnderbodyRefitV2) {
  prototype.__pelagosUnderbodyRefitV2 = true;
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
