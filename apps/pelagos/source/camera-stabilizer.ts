import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ShipState, ShipTelemetry } from './core';
import { angleDelta, clamp, smoothTo, wrapAngle } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type CameraState = {
  yaw: number;
  anchor: Vector3;
  target: Vector3;
  position: Vector3;
  desiredPosition: Vector3;
  desiredTarget: Vector3;
  initialized: boolean;
};

const cameraStates = new WeakMap<OceanWorld, CameraState>();

function getState(world: OceanWorld): CameraState {
  let state = cameraStates.get(world);
  if (!state) {
    state = {
      yaw: 0,
      anchor: new Vector3(),
      target: new Vector3(),
      position: world.camera.position.clone(),
      desiredPosition: new Vector3(),
      desiredTarget: new Vector3(),
      initialized: false
    };
    cameraStates.set(world, state);
  }
  return state;
}

function snap(memory: CameraState, ship: ShipState, desiredYaw: number): void {
  memory.yaw = desiredYaw;
  memory.anchor.set(ship.x, ship.y, ship.z);
  memory.target.set(ship.x, ship.y + 1.65, ship.z);
  memory.initialized = true;
}

function stabilizeCamera(
  world: OceanWorld,
  ship: ShipState,
  telemetry: ShipTelemetry,
  dt: number,
  lookYaw: number,
  lookPitch: number
): void {
  const safeDt = clamp(dt, 1 / 240, 1 / 24);
  const memory = getState(world);
  const desiredYaw = wrapAngle(ship.yaw + lookYaw + 0.045 * Math.exp(-Math.abs(lookYaw) * 4));

  const displacement = Math.hypot(memory.anchor.x - ship.x, memory.anchor.z - ship.z);
  if (!memory.initialized || displacement > 36 || !Number.isFinite(memory.position.x + memory.position.y + memory.position.z)) {
    snap(memory, ship, desiredYaw);
  }

  // Follow translation quickly enough to feel attached, but filter heave so the horizon stays readable.
  memory.anchor.x = smoothTo(memory.anchor.x, ship.x, 7.4, safeDt);
  memory.anchor.z = smoothTo(memory.anchor.z, ship.z, 7.4, safeDt);
  memory.anchor.y = smoothTo(memory.anchor.y, ship.y, 2.15, safeDt);

  const yawRate = Math.abs(lookYaw) > 0.035 ? 9.5 : 4.8;
  memory.yaw = wrapAngle(memory.yaw + angleDelta(memory.yaw, desiredYaw) * (1 - Math.exp(-yawRate * safeDt)));

  const forwardX = Math.sin(memory.yaw);
  const forwardZ = Math.cos(memory.yaw);
  const rightX = Math.cos(memory.yaw);
  const rightZ = -Math.sin(memory.yaw);
  const speed = clamp(telemetry.speed, 0, 8);
  const distance = 14.45 + speed * 0.22;
  const height = 5.28 + speed * 0.055 + lookPitch * 1.55;
  const quarter = 0.34 * Math.exp(-Math.abs(lookYaw) * 3.2);

  memory.desiredPosition.set(
    memory.anchor.x - forwardX * distance + rightX * quarter,
    memory.anchor.y + height,
    memory.anchor.z - forwardZ * distance + rightZ * quarter
  );

  const shipForwardX = Math.sin(ship.yaw);
  const shipForwardZ = Math.cos(ship.yaw);
  memory.desiredTarget.set(
    ship.x + shipForwardX * (0.58 + speed * 0.055),
    ship.y + 1.68 + lookPitch * 0.62,
    ship.z + shipForwardZ * (0.58 + speed * 0.055)
  );

  const cameraGap = Vector3.Distance(memory.position, memory.desiredPosition);
  if (cameraGap > 28) {
    memory.position.copyFrom(memory.desiredPosition);
    memory.target.copyFrom(memory.desiredTarget);
  } else {
    memory.position.x = smoothTo(memory.position.x, memory.desiredPosition.x, 6.3, safeDt);
    memory.position.z = smoothTo(memory.position.z, memory.desiredPosition.z, 6.3, safeDt);
    memory.position.y = smoothTo(memory.position.y, memory.desiredPosition.y, 3.15, safeDt);
    memory.target.x = smoothTo(memory.target.x, memory.desiredTarget.x, 7.8, safeDt);
    memory.target.z = smoothTo(memory.target.z, memory.desiredTarget.z, 7.8, safeDt);
    memory.target.y = smoothTo(memory.target.y, memory.desiredTarget.y, 4.6, safeDt);
  }

  // This is the final and only authoritative camera transform for the frame. Earlier visual
  // passes may calculate suggestions, but nothing is integrated additively into camera position.
  world.camera.position.copyFrom(memory.position);
  world.camera.setTarget(memory.target);
  world.camera.fov = smoothTo(world.camera.fov, 0.905 + speed * 0.0035, 4.0, safeDt);
  world.scene.getMeshByName('sky-dome')?.position.copyFrom(memory.position);
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosStableCameraV1?: boolean };
if (!prototype.__pelagosStableCameraV1) {
  prototype.__pelagosStableCameraV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function stableCameraUpdate(
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
    stabilizeCamera(this, state, telemetry, dt, lookYaw, lookPitch);
  };
}
