import type { ShipState, ShipTelemetry } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';
import { updateModularRowing } from './ship-modularity';
import { getRowingDemand } from './rowing-state';

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosRowingRuntimeBridgeV2?: boolean };

if (!prototype.__pelagosRowingRuntimeBridgeV2) {
  prototype.__pelagosRowingRuntimeBridgeV2 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function rowingRuntimeBridgeUpdate(
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
    const demand = Math.max(Number.isFinite(rowing) ? rowing : 0, getRowingDemand());
    previousUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, demand);
    // Run the selected bank after every other visual wrapper. This makes the final pose authoritative
    // and prevents legacy sail/oar compatibility passes from hiding the blades later in the frame.
    updateModularRowing(this, state, environment, time, dt, originX, originZ, demand);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.pelagosWorldRowing = demand.toFixed(3);
      document.documentElement.dataset.pelagosRowOwner = 'modular-final';
    }
  };
}
