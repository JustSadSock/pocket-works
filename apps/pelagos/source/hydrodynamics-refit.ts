import type { ShipControls, ShipState, ShipTelemetry, WindState } from './core';
import { DEG, ShipDynamics, clamp, sampleWave, smoothTo } from './core';
import { ACTIVE_SHIP } from './ship-config';

export type HullSupportFrame = {
  waterReference: number;
  bowWater: number;
  sternWater: number;
  portWater: number;
  starboardWater: number;
  pitchTarget: number;
  rollTarget: number;
  sternExposure: number;
};

type HydroMemory = {
  waterReference: number;
  sternExposure: number;
};

const memory = new WeakMap<ShipDynamics, HydroMemory>();

function hullPoint(state: ShipState, forward: number, right: number): { x: number; z: number } {
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  return {
    x: state.worldX + sinYaw * forward + cosYaw * right,
    z: state.worldZ + cosYaw * forward - sinYaw * right
  };
}

function waterAt(state: ShipState, forward: number, right: number, time: number, waveScale: number): number {
  const point = hullPoint(state, forward, right);
  return sampleWave(point.x, point.z, time, waveScale).height;
}

/**
 * Samples the water under the actual 9.13 m cutter footprint. A trimmed mean is used for heave:
 * one sharp crest under a single station should pitch the hull, not launch the whole vessel.
 */
export function sampleHullSupport(state: ShipState, time: number, waveScale: number): HullSupportFrame {
  const dimensions = ACTIVE_SHIP.definition.dimensions;
  const fore = dimensions.hullLength * 0.41;
  const aft = -dimensions.hullLength * 0.40;
  const shoulder = dimensions.beam * 0.39;

  const bowPort = waterAt(state, fore, -shoulder * 0.56, time, waveScale);
  const bowStarboard = waterAt(state, fore, shoulder * 0.56, time, waveScale);
  const sternPort = waterAt(state, aft, -shoulder * 0.66, time, waveScale);
  const sternStarboard = waterAt(state, aft, shoulder * 0.66, time, waveScale);
  const portWater = waterAt(state, 0.05, -shoulder, time, waveScale);
  const starboardWater = waterAt(state, 0.05, shoulder, time, waveScale);
  const centerWater = waterAt(state, 0, 0, time, waveScale);

  const bowWater = (bowPort + bowStarboard) * 0.5;
  const sternWater = (sternPort + sternStarboard) * 0.5;
  const heights = [bowPort, bowStarboard, sternPort, sternStarboard, portWater, starboardWater, centerWater].sort((a, b) => a - b);
  const middle = heights.slice(1, -1);
  const waterReference = middle.reduce((sum, value) => sum + value, 0) / middle.length;

  const pitchTarget = clamp(
    Math.atan2(bowWater - sternWater, Math.max(1, fore - aft)) * 0.58,
    -6.2 * DEG,
    6.2 * DEG
  );
  const rollTarget = clamp(
    Math.atan2(portWater - starboardWater, Math.max(1, shoulder * 2)) * 0.48,
    -7.8 * DEG,
    7.8 * DEG
  );

  // The upper shoulder of the rudder/skeg should remain masked by the stern and water. Negative
  // pitch used to lift this point far above the local stern surface, exposing the whole steering
  // gear whenever one short crest passed under the bow.
  const sternShoulderY = state.y - 0.72 + aft * Math.sin(state.pitch);
  const sternExposure = Math.max(0, sternShoulderY - (sternWater - 0.06));

  return { waterReference, bowWater, sternWater, portWater, starboardWater, pitchTarget, rollTarget, sternExposure };
}

export function getHydrodynamicsDebug(dynamics: ShipDynamics): HydroMemory {
  const current = memory.get(dynamics);
  return current ? { ...current } : { waterReference: 0, sternExposure: 0 };
}

const previousReset = ShipDynamics.prototype.reset;
ShipDynamics.prototype.reset = function hydrodynamicsReset(): void {
  memory.delete(this);
  previousReset.call(this);
};

const previousUpdate = ShipDynamics.prototype.update;
ShipDynamics.prototype.update = function hydrodynamicsUpdate(
  dt: number,
  time: number,
  controls: ShipControls,
  wind: WindState,
  waveScale: number
): ShipTelemetry {
  const safeDt = clamp(dt, 0.001, 1 / 30);
  const telemetry = previousUpdate.call(this, dt, time, controls, wind, waveScale);
  const state = this.state;
  const support = sampleHullSupport(state, time, waveScale);
  let frame = memory.get(this);
  if (!frame) {
    frame = { waterReference: support.waterReference, sternExposure: 0 };
    memory.set(this, frame);
  }

  // Added-water mass: a displacement hull does not follow every short crest as if it weighed
  // nothing. Smooth the reference surface, then couple heave to that broad support plane.
  frame.waterReference = smoothTo(frame.waterReference, support.waterReference, 2.35, safeDt);
  const heaveTarget = frame.waterReference + 0.56;
  const heaveError = heaveTarget - state.y;
  const heaveAcceleration = heaveError * 3.15 - state.verticalVelocity * 1.72;
  state.verticalVelocity += heaveAcceleration * safeDt;

  // Never let one energetic buoyancy sample catapult the 5.6 tonne cutter clear of the sea.
  const airborne = state.y - heaveTarget;
  if (airborne > 0.44) {
    const excess = airborne - 0.44;
    state.verticalVelocity -= excess * 8.4 * safeDt;
    state.verticalVelocity = Math.min(state.verticalVelocity, 0.48);
    state.y -= Math.min(excess * (1 - Math.exp(-safeDt * 5.2)), 0.075);
  }

  // Stern-immersion guard is a hydrodynamic restoring moment, not a visual clamp. It acts only
  // when the aft shoulder would actually rise through the local surface.
  frame.sternExposure = smoothTo(frame.sternExposure, support.sternExposure, 7.0, safeDt);
  if (frame.sternExposure > 0.004) {
    state.verticalVelocity -= frame.sternExposure * 4.6 * safeDt;
    state.pitchVelocity += frame.sternExposure * 0.92 * safeDt;
  }

  // Large hull attitude follows the fore/aft and port/starboard support planes. Short chop is
  // still visible through residual dynamics, but cannot produce 15-degree toy-boat snaps.
  state.pitchVelocity += (support.pitchTarget - state.pitch) * 1.65 * safeDt;
  state.pitchVelocity *= Math.exp(-0.56 * safeDt);
  state.rollVelocity += (support.rollTarget - state.roll) * 1.25 * safeDt;
  state.rollVelocity *= Math.exp(-0.38 * safeDt);

  state.verticalVelocity = clamp(state.verticalVelocity, -2.25, 1.55);
  state.pitchVelocity = clamp(state.pitchVelocity, -0.34, 0.34);
  state.rollVelocity = clamp(state.rollVelocity, -0.50, 0.50);
  state.pitch = clamp(state.pitch, -10.5 * DEG, 10.5 * DEG);
  state.roll = clamp(state.roll, -16 * DEG, 16 * DEG);

  if (!Number.isFinite(state.y) || !Number.isFinite(state.verticalVelocity)) {
    state.y = heaveTarget;
    state.verticalVelocity = 0;
  }
  return telemetry;
};
