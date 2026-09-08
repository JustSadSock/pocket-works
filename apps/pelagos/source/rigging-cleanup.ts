import type { ShipState, ShipTelemetry } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

const UNSUPPORTED_LINES = ['refit-rigging-3', 'refit-rigging-4'] as const;

function removeUnsupportedRigging(world: OceanWorld): void {
  // These two legacy diagonals terminated in open space above the deck and visually read as
  // halyards for sails that do not exist. Keep only the shrouds/stay paths that actually connect
  // the mast, deck and bowsprit to the physical sail plan.
  for (const name of UNSUPPORTED_LINES) world.scene.getMeshByName(name)?.setEnabled(false);
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosRiggingCleanupV1?: boolean };
if (!prototype.__pelagosRiggingCleanupV1) {
  prototype.__pelagosRiggingCleanupV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function riggingCleanupUpdate(
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
    removeUnsupportedRigging(this);
  };
}
