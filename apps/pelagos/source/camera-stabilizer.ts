import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ShipState, ShipTelemetry } from './core';
import { angleDelta, clamp, smoothTo, wrapAngle } from './core';
import { getActiveShipLoadout } from './ship-loadout';
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

function menuIsVisible(): boolean {
  const menu = document.querySelector<HTMLElement>('#menu');
  return Boolean(menu && !menu.classList.contains('hidden'));
}

function shipyardOrbit(): number {
  const raw = Number(document.documentElement.dataset.shipyardOrbit ?? '0.42');
  return Number.isFinite(raw) ? clamp(raw, -1.08, 1.08) : 0.42;
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
  const menuPreview = !shipyardPreview && menuIsVisible();
  const loadout = getActiveShipLoadout();
  const hullScale = clamp(loadout.dimensions.length / 12.8, 0.82, 1.30);
  const heightScale = Math.pow(hullScale, 0.36);
  const turnLook = Math.abs(lookYaw) > 0.035 || shipyardPreview || menuPreview
    ? 0
    : clamp(ship.yawVelocity * 0.58, -0.11, 0.11);
  const previewYaw = shipyardPreview ? shipyardOrbit() : menuPreview ? 0.54 : 0;
  const desiredYaw = wrapAngle(ship.yaw + lookYaw + turnLook + previewYaw);

  const displacement = Math.hypot(memory.anchor.x - ship.x, memory.anchor.z - ship.z);
  if (!memory.initialized || displacement > 36 || !Number.isFinite(memory.position.x + memory.position.y + memory.position.z)) {
    snap(memory, ship, desiredYaw);
  }

  memory.anchor.x = smoothTo(memory.anchor.x, ship.x, 7.8, safeDt);
  memory.anchor.z = smoothTo(memory.anchor.z, ship.z, 7.8, safeDt);
  memory.anchor.y = smoothTo(memory.anchor.y, ship.y, shipyardPreview ? 3.8 : menuPreview ? 2.8 : 1.95, safeDt);

  const yawRate = shipyardPreview ? 7.0 : menuPreview ? 2.8 : Math.abs(lookYaw) > 0.035 ? 10.0 : 4.9;
  memory.yaw = wrapAngle(memory.yaw + angleDelta(memory.yaw, desiredYaw) * (1 - Math.exp(-yawRate * safeDt)));

  const forwardX = Math.sin(memory.yaw);
  const forwardZ = Math.cos(memory.yaw);
  const rightX = Math.cos(memory.yaw);
  const rightZ = -Math.sin(memory.yaw);
  const speed = clamp(telemetry.speed, 0, 8);

  // Camera distance follows the selected hull length. This keeps the 10.8 m harbor cutter and
  // 15.6 m highboard cruiser feeling like differently sized ships instead of different camera zooms.
  const distance = shipyardPreview
    ? 21.9 * hullScale
    : menuPreview
      ? 21.2 * hullScale
      : (16.65 + speed * 0.34) * hullScale;
  const height = shipyardPreview
    ? 6.5 * heightScale
    : menuPreview
      ? 7.05 * heightScale
      : (6.08 + speed * 0.072 + lookPitch * 1.52) * heightScale;
  const quarter = shipyardPreview
    ? 2.15 * hullScale
    : menuPreview
      ? 3.35 * hullScale
      : (1.04 + clamp(Math.abs(ship.yawVelocity) * 0.44, 0, 0.32)) * Math.exp(-Math.abs(lookYaw) * 2.7);

  memory.desiredPosition.set(
    memory.anchor.x - forwardX * distance + rightX * quarter,
    memory.anchor.y + height,
    memory.anchor.z - forwardZ * distance + rightZ * quarter
  );

  const shipForwardX = Math.sin(ship.yaw);
  const shipForwardZ = Math.cos(ship.yaw);
  const shipRightX = Math.cos(ship.yaw);
  const shipRightZ = -Math.sin(ship.yaw);
  const lookAhead = shipyardPreview ? 0.15 : menuPreview ? 0.55 : 1.42 + speed * 0.12;
  const targetSide = menuPreview ? -2.35 * hullScale : shipyardPreview ? -0.30 * hullScale : 0;
  memory.desiredTarget.set(
    ship.x + shipForwardX * lookAhead + shipRightX * targetSide,
    ship.y + (shipyardPreview ? 0.66 * heightScale : menuPreview ? 1.08 * heightScale : 1.78 * heightScale + lookPitch * 0.62),
    ship.z + shipForwardZ * lookAhead + shipRightZ * targetSide
  );

  const cameraGap = Vector3.Distance(memory.position, memory.desiredPosition);
  if (cameraGap > 28) {
    memory.position.copyFrom(memory.desiredPosition);
    memory.target.copyFrom(memory.desiredTarget);
  } else {
    const positionRate = shipyardPreview ? 8.0 : menuPreview ? 3.0 : 6.3;
    memory.position.x = smoothTo(memory.position.x, memory.desiredPosition.x, positionRate, safeDt);
    memory.position.z = smoothTo(memory.position.z, memory.desiredPosition.z, positionRate, safeDt);
    memory.position.y = smoothTo(memory.position.y, memory.desiredPosition.y, shipyardPreview ? 5.8 : menuPreview ? 2.6 : 2.75, safeDt);
    const targetRate = shipyardPreview ? 8.6 : menuPreview ? 3.2 : 7.1;
    memory.target.x = smoothTo(memory.target.x, memory.desiredTarget.x, targetRate, safeDt);
    memory.target.z = smoothTo(memory.target.z, memory.desiredTarget.z, targetRate, safeDt);
    memory.target.y = smoothTo(memory.target.y, memory.desiredTarget.y, shipyardPreview ? 6.8 : menuPreview ? 3.0 : 3.8, safeDt);
  }

  world.camera.position.copyFrom(memory.position);
  world.camera.setTarget(memory.target);
  const targetFov = shipyardPreview ? 0.91 : menuPreview ? 0.90 : 0.89 + speed * 0.0075;
  world.camera.fov = smoothTo(world.camera.fov, targetFov, shipyardPreview ? 5.6 : menuPreview ? 2.8 : 3.6, safeDt);
  world.scene.getMeshByName('sky-dome')?.position.copyFrom(memory.position);
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosStableCameraV4?: boolean };
if (!prototype.__pelagosStableCameraV4) {
  prototype.__pelagosStableCameraV4 = true;
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
