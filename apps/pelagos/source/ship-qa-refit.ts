import type { ShipState, ShipTelemetry } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';
import { ACTIVE_SHIP } from './ship-config';
import { sampleHullSupport } from './hydrodynamics-refit';

type ExtendedQa = Record<string, unknown> & {
  visibleOars?: number;
};

const qaWindow = window as Window & { __POCKET_WORKS_TEST_STATE__?: ExtendedQa };

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosShipQaV1?: boolean };
if (!prototype.__pelagosShipQaV1) {
  prototype.__pelagosShipQaV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function shipQaUpdate(
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
    const qa = qaWindow.__POCKET_WORKS_TEST_STATE__;
    if (!qa) return;
    const support = sampleHullSupport(state, time, environment.waveScale);
    qa.visibleOars = this.scene.meshes.filter((mesh) => mesh.name.startsWith('module-oar-blade-') && mesh.isEnabled() && mesh.visibility > 0.05).length;
    qa.shipClass = ACTIVE_SHIP.definition.id;
    qa.shipLengthMeters = ACTIVE_SHIP.definition.dimensions.hullLength;
    qa.shipBeamMeters = ACTIVE_SHIP.definition.dimensions.beam;
    qa.displacementKg = ACTIVE_SHIP.definition.dimensions.displacementKg;
    qa.hullPalette = ACTIVE_SHIP.palette.id;
    qa.sailPlan = ACTIVE_SHIP.sail.id;
    qa.oarSet = ACTIVE_SHIP.oars.id;
    qa.oarCount = ACTIVE_SHIP.oars.stations.length * 2;
    qa.sternExposure = Number(support.sternExposure.toFixed(4));
    qa.waterReference = Number(support.waterReference.toFixed(4));
    qa.heaveClearance = Number((state.y - (support.waterReference + 0.56)).toFixed(4));
  };
}
