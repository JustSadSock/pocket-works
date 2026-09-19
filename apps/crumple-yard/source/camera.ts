import { FreeCamera, Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Vehicle } from './vehicle';

export class ChaseCamera {
  readonly camera: FreeCamera;
  private target = Vector3.Zero();
  private shake = 0;
  private shakePhase = 0;

  constructor(
    scene: import('@babylonjs/core').Scene,
    private world: RAPIER.World
  ) {
    this.camera = new FreeCamera('chase-camera', new Vector3(0, 4, -8), scene);
    this.camera.minZ = 0.16;
    this.camera.maxZ = 320;
    this.camera.fov = 0.76;
    scene.activeCamera = this.camera;
  }

  kick(severity: number) {
    this.shake = Math.min(0.58, this.shake + severity * 0.34);
  }

  snap(vehicle: Vehicle) {
    vehicle.syncVisual();
    const position = vehicle.root.position;
    const forward = vehicle.forward();
    this.target = position.add(new Vector3(0, 0.65, 0)).add(forward.scale(2));
    this.camera.position.copyFrom(position.add(new Vector3(0, 3.1, 0)).subtract(forward.scale(7.8)));
    this.camera.setTarget(this.target);
  }

  update(vehicle: Vehicle, dt: number) {
    const position = vehicle.root.position;
    const forward = vehicle.forward();
    const speedN = Math.min(1, vehicle.speedKmh() / 120);
    const desiredTarget = position.add(new Vector3(0, 0.68, 0)).add(forward.scale(2.6 + speedN * 2.2));
    const distance = 7.25 + speedN * 1.9;
    const height = 2.75 + speedN * 0.55;
    let desired = position.add(new Vector3(0, height, 0)).subtract(forward.scale(distance));

    const rayOrigin = desiredTarget;
    const vector = desired.subtract(rayOrigin);
    const rayDistance = vector.length();
    if (rayDistance > 0.01) {
      const direction = vector.scale(1 / rayDistance);
      const hit = this.world.castRay(
        new RAPIER.Ray({ x: rayOrigin.x, y: rayOrigin.y, z: rayOrigin.z }, { x: direction.x, y: direction.y, z: direction.z }),
        rayDistance,
        true,
        undefined,
        undefined,
        undefined,
        vehicle.body
      );
      if (hit && hit.timeOfImpact < rayDistance) {
        const safeDistance = Math.max(2.4, hit.timeOfImpact - 0.38);
        desired = rayOrigin.add(direction.scale(safeDistance));
      }
    }

    const response = 1 - Math.exp(-dt * (5.6 + speedN * 1.8));
    this.camera.position = Vector3.Lerp(this.camera.position, desired, response);
    this.target = Vector3.Lerp(this.target, desiredTarget, 1 - Math.exp(-dt * 7.2));

    this.shake *= Math.exp(-dt * 7.8);
    this.shakePhase += dt * 37;
    if (this.shake > 0.002) {
      const q = vehicle.root.rotationQuaternion ?? Quaternion.Identity();
      const rotation = Matrix.Zero();
      q.toRotationMatrix(rotation);
      const right = Vector3.TransformNormal(Vector3.Right(), rotation).normalize();
      this.camera.position.addInPlace(right.scale(Math.sin(this.shakePhase) * this.shake));
      this.camera.position.y += Math.sin(this.shakePhase * 1.37) * this.shake * 0.45;
    }

    this.camera.setTarget(this.target);
    this.camera.fov += (0.75 + speedN * 0.1 - this.camera.fov) * (1 - Math.exp(-dt * 3));
  }

  distanceTo(vehicle: Vehicle) {
    return Vector3.Distance(this.camera.position, vehicle.root.position);
  }
}
