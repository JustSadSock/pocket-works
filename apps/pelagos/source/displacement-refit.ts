import type { ShipControls, ShipTelemetry, WindState } from './core';
import { ShipDynamics, clamp } from './core';
import { ACTIVE_SHIP } from './ship-config';

// core.ts predates modular hull classes and was tuned around a 3.2 tonne prototype. Keep its
// force model, but scale the resulting acceleration/rate changes to the selected vessel's actual
// displacement. Future hull classes therefore inherit believable inertia without duplicating the
// whole solver.
const CORE_REFERENCE_DISPLACEMENT = 3200;
const response = clamp(CORE_REFERENCE_DISPLACEMENT / ACTIVE_SHIP.definition.dimensions.displacementKg, 0.44, 1.35);
const angularResponse = Math.sqrt(response);

const previousUpdate = ShipDynamics.prototype.update;
ShipDynamics.prototype.update = function displacementUpdate(
  dt: number,
  time: number,
  controls: ShipControls,
  wind: WindState,
  waveScale: number
): ShipTelemetry {
  const state = this.state;
  const vx = state.velocityX;
  const vz = state.velocityZ;
  const vy = state.verticalVelocity;
  const yawRate = state.yawVelocity;
  const pitchRate = state.pitchVelocity;
  const rollRate = state.rollVelocity;

  const telemetry = previousUpdate.call(this, dt, time, controls, wind, waveScale);

  state.velocityX = vx + (state.velocityX - vx) * response;
  state.velocityZ = vz + (state.velocityZ - vz) * response;
  state.verticalVelocity = vy + (state.verticalVelocity - vy) * angularResponse;
  state.yawVelocity = yawRate + (state.yawVelocity - yawRate) * angularResponse;
  state.pitchVelocity = pitchRate + (state.pitchVelocity - pitchRate) * angularResponse;
  state.rollVelocity = rollRate + (state.rollVelocity - rollRate) * angularResponse;

  return telemetry;
};

document.documentElement.dataset.pelagosDisplacementTonnes = (ACTIVE_SHIP.definition.dimensions.displacementKg / 1000).toFixed(1);
