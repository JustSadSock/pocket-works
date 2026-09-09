import type { ShipState, ShipTelemetry } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';
import { getRowingDemand } from './rowing-state';

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosRowingRuntimeBridgeV1?: boolean };

if (!prototype.__pelagosRowingRuntimeBridgeV1) {
  prototype.__pelagosRowingRuntimeBridgeV1 = true;
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
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.pelagosWorldRowing = demand.toFixed(3);
    }
    previousUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, demand);
  };
}
