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
  memory.target.set(ship.x, ship.y + 1.9, ship.z);
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
  const shipyardPreview = document.documentElement.classList.contains('pelagos-shipyard-open');
  const turnLook = Math.abs(lookYaw) > 0.035 || shipyardPreview ? 0 : clamp(ship.yawVelocity * 0.58, -0.11, 0.11);
  const previewYaw = shipyardPreview ? 0.34 : 0;
  const desiredYaw = wrapAngle(ship.yaw + lookYaw + turnLook + previewYaw);

  const displacement = Math.hypot(memory.anchor.x - ship.x, memory.anchor.z - ship.z);
  if (!memory.initialized || displacement > 36 || !Number.isFinite(memory.position.x + memory.position.y + memory.position.z)) {
    snap(memory, ship, desiredYaw);
  }

  memory.anchor.x = smoothTo(memory.anchor.x, ship.x, 7.8, safeDt);
  memory.anchor.z = smoothTo(memory.anchor.z, ship.z, 7.8, safeDt);
  memory.anchor.y = smoothTo(memory.anchor.y, ship.y, shipyardPreview ? 3.4 : 1.95, safeDt);

  const yawRate = shipyardPreview ? 5.8 : Math.abs(lookYaw) > 0.035 ? 10.0 : 4.9;
  memory.yaw = wrapAngle(memory.yaw + angleDelta(memory.yaw, desiredYaw) * (1 - Math.exp(-yawRate * safeDt)));

  const forwardX = Math.sin(memory.yaw);
  const forwardZ = Math.cos(memory.yaw);
  const rightX = Math.cos(memory.yaw);
  const rightZ = -Math.sin(memory.yaw);
  const speed = clamp(telemetry.speed, 0, 8);

  // Shipyard mode is a genuine live 3D preview: pull farther back, move to a three-quarter angle
  // and aim lower on the hull so the complete ship sits above the bottom customization dock.
  const distance = shipyardPreview ? 20.4 : 15.35 + speed * 0.31;
  const height = shipyardPreview ? 6.15 : 5.72 + speed * 0.075 + lookPitch * 1.58;
  const quarter = shipyardPreview
    ? 2.55
    : (0.92 + clamp(Math.abs(ship.yawVelocity) * 0.46, 0, 0.34)) * Math.exp(-Math.abs(lookYaw) * 2.7);

  memory.desiredPosition.set(
    memory.anchor.x - forwardX * distance + rightX * quarter,
    memory.anchor.y + height,
    memory.anchor.z - forwardZ * distance + rightZ * quarter
  );

  const shipForwardX = Math.sin(ship.yaw);
  const shipForwardZ = Math.cos(ship.yaw);
  const lookAhead = shipyardPreview ? 0.35 : 1.28 + speed * 0.12;
  memory.desiredTarget.set(
    ship.x + shipForwardX * lookAhead,
    ship.y + (shipyardPreview ? 0.72 : 1.93 + lookPitch * 0.66),
    ship.z + shipForwardZ * lookAhead
  );

  const cameraGap = Vector3.Distance(memory.position, memory.desiredPosition);
  if (cameraGap > 28) {
    memory.position.copyFrom(memory.desiredPosition);
    memory.target.copyFrom(memory.desiredTarget);
  } else {
    const positionRate = shipyardPreview ? 7.4 : 6.5;
    memory.position.x = smoothTo(memory.position.x, memory.desiredPosition.x, positionRate, safeDt);
    memory.position.z = smoothTo(memory.position.z, memory.desiredPosition.z, positionRate, safeDt);
    memory.position.y = smoothTo(memory.position.y, memory.desiredPosition.y, shipyardPreview ? 5.2 : 2.9, safeDt);
    memory.target.x = smoothTo(memory.target.x, memory.desiredTarget.x, shipyardPreview ? 8.0 : 7.4, safeDt);
    memory.target.z = smoothTo(memory.target.z, memory.desiredTarget.z, shipyardPreview ? 8.0 : 7.4, safeDt);
    memory.target.y = smoothTo(memory.target.y, memory.desiredTarget.y, shipyardPreview ? 6.0 : 4.0, safeDt);
  }

  world.camera.position.copyFrom(memory.position);
  world.camera.setTarget(memory.target);
  const targetFov = shipyardPreview ? 0.93 : 0.865 + speed * 0.0082;
  world.camera.fov = smoothTo(world.camera.fov, targetFov, shipyardPreview ? 5.2 : 3.8, safeDt);
  world.scene.getMeshByName('sky-dome')?.position.copyFrom(memory.position);
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosStableCameraV3?: boolean };
if (!prototype.__pelagosStableCameraV3) {
  prototype.__pelagosStableCameraV3 = true;
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
