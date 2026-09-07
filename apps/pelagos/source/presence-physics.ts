import type { ShipControls, ShipTelemetry, WindState } from './core';
import { ShipDynamics, clamp, sampleWave, smoothTo } from './core';

export type PresencePhysicsFrame = {
  seaScale: number;
  slam: number;
  quartering: number;
  sailLoad: number;
  filteredSteer: number;
};

type DynamicsMemory = PresencePhysicsFrame & {
  previousYawVelocity: number;
};

const memory = new WeakMap<ShipDynamics, DynamicsMemory>();

/**
 * Slow, spatially varying wave-group envelope. It is deliberately deterministic and is
 * consumed by both the physics wrapper and the visual world wrapper, so the large patches
 * of calmer / rougher water remain the same surface rather than a visual-only trick.
 */
export function seaEnvelope(x: number, z: number, time: number): number {
  const longGroup = Math.sin(x * 0.0067 + z * 0.0041 - time * 0.025);
  const crossGroup = Math.sin(x * -0.0113 + z * 0.0089 + time * 0.018 + 1.7);
  const beat = Math.sin(x * 0.0021 - z * 0.0034 + time * 0.007 + 4.2);
  return clamp(0.98 + longGroup * 0.115 + crossGroup * 0.075 + beat * 0.055, 0.76, 1.24);
}

export function getPresencePhysicsFrame(dynamics: ShipDynamics): PresencePhysicsFrame {
  const value = memory.get(dynamics);
  return value
    ? { seaScale: value.seaScale, slam: value.slam, quartering: value.quartering, sailLoad: value.sailLoad, filteredSteer: value.filteredSteer }
    : { seaScale: 1, slam: 0, quartering: 0, sailLoad: 0, filteredSteer: 0 };
}

const previousReset = ShipDynamics.prototype.reset;
ShipDynamics.prototype.reset = function presenceReset(): void {
  memory.delete(this);
  previousReset.call(this);
};

const previousUpdate = ShipDynamics.prototype.update;
ShipDynamics.prototype.update = function presenceUpdate(
  dt: number,
  time: number,
  controls: ShipControls,
  wind: WindState,
  waveScale: number
): ShipTelemetry {
  const safeDt = clamp(dt, 0.001, 1 / 30);
  const state = this.state;
  let frame = memory.get(this);
  if (!frame) {
    frame = {
      seaScale: 1,
      slam: 0,
      quartering: 0,
      sailLoad: 0,
      filteredSteer: 0,
      previousYawVelocity: state.yawVelocity
    };
    memory.set(this, frame);
  }

  // A wheel command is not a yaw command. The helmsman moves the rudder, water loads it,
  // and only then does a multi-ton displacement hull begin to turn.
  frame.filteredSteer = smoothTo(frame.filteredSteer, clamp(controls.steer, -1, 1), 1.45, safeDt);
  const localScale = waveScale * seaEnvelope(state.worldX, state.worldZ, time);
  frame.seaScale = localScale;

  const yawBefore = state.yawVelocity;
  const telemetry = previousUpdate.call(this, dt, time, { ...controls, steer: frame.filteredSteer }, wind, localScale);

  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  const fwdX = sinYaw;
  const fwdZ = cosYaw;
  const rightX = cosYaw;
  const rightZ = -sinYaw;
  const sample = (forward: number, right: number) => sampleWave(
    state.worldX + fwdX * forward + rightX * right,
    state.worldZ + fwdZ * forward + rightZ * right,
    time,
    localScale
  );

  const bow = sample(4.25, 0);
  const stern = sample(-3.9, 0);
  const port = sample(0.1, -1.58);
  const starboard = sample(0.1, 1.58);

  // Quartering seas nudge the heading instead of producing perfectly symmetric pitch/roll.
  // The coefficient is intentionally small: it should be felt over several waves, not look
  // like random steering noise.
  const crossHeight = port.height - starboard.height;
  const longitudinalHeight = bow.height - stern.height;
  const quarteringTarget = clamp(crossHeight * 0.42 + longitudinalHeight * crossHeight * 0.10, -1, 1);
  frame.quartering = smoothTo(frame.quartering, quarteringTarget, 1.8, safeDt);
  state.yawVelocity += frame.quartering * 0.0105 * safeDt * clamp(0.55 + Math.abs(telemetry.forwardSpeed) * 0.16, 0.55, 1.35);

  // Added rotational mass removes the last instantaneous-looking changes in yaw rate while
  // preserving the existing rudder and keel model underneath.
  const rawYawVelocity = state.yawVelocity;
  const inertialYaw = smoothTo(yawBefore, rawYawVelocity, 3.2, safeDt);
  state.yawVelocity = inertialYaw;
  frame.previousYawVelocity = inertialYaw;

  // Bow slamming is derived from the same wave sample used by buoyancy. It adds a brief loss
  // of forward momentum and a small upward impulse when a moving bow meets an oncoming crest.
  const bowHullY = state.y - 0.27 + Math.sin(state.pitch) * 4.1;
  const bowImmersion = bow.height - bowHullY;
  const bowVerticalSpeed = state.verticalVelocity + state.pitchVelocity * 4.1;
  const closing = Math.max(0, -bowVerticalSpeed);
  const speedGate = clamp((Math.abs(telemetry.forwardSpeed) - 0.45) / 4.8, 0, 1);
  const slamTarget = clamp((bowImmersion + 0.09) * 2.25 + closing * 0.24, 0, 1) * speedGate;
  frame.slam = smoothTo(frame.slam, slamTarget, slamTarget > frame.slam ? 7.5 : 2.2, safeDt);
  if (frame.slam > 0.025) {
    const loss = Math.min(0.018, frame.slam * 0.010) * safeDt * 60;
    state.velocityX *= 1 - loss;
    state.velocityZ *= 1 - loss;
    state.verticalVelocity += frame.slam * 0.075 * safeDt;
  }

  // Keep a physically useful load estimate for rigging, wet-contact visuals and audio.
  frame.sailLoad = clamp((telemetry.apparentWindSpeed / 17) * (0.18 + telemetry.sailEfficiency * 0.92), 0, 1);

  if (!Number.isFinite(state.yawVelocity)) state.yawVelocity = 0;
  return telemetry;
};
