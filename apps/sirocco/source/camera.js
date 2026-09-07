import { UniversalCamera, Vector3 } from '@babylonjs/core';
import { clamp, damp } from './core.js';

export class FirstPersonCamera {
  constructor(scene) {
    this.camera = new UniversalCamera('first-person', new Vector3(0, 1.69, 0.11), scene);
    this.camera.minZ = 0.045;
    this.camera.maxZ = 950;
    this.camera.fov = 1.03;
    this.camera.inertia = 0;
    this.camera.angularSensibility = 0;
    scene.activeCamera = this.camera;
    this.bobY = 0;
    this.swayX = 0;
    this.pitchLag = 0;
  }

  update(controller, dt) {
    const speedNorm = clamp(controller.speed / 3.25, 0, 1);
    const bobTarget = Math.sin(controller.gait * 2) * 0.010 * speedNorm;
    const swayTarget = Math.sin(controller.gait) * 0.008 * speedNorm;
    this.bobY = damp(this.bobY, bobTarget, 14, dt);
    this.swayX = damp(this.swayX, swayTarget, 12, dt);
    const forwardX = Math.sin(controller.yaw);
    const forwardZ = Math.cos(controller.yaw);
    const rightX = Math.cos(controller.yaw);
    const rightZ = -Math.sin(controller.yaw);
    this.camera.position.set(
      controller.localPosition.x + forwardX * 0.115 + rightX * this.swayX,
      controller.localPosition.y + 1.69 + this.bobY,
      controller.localPosition.z + forwardZ * 0.115 + rightZ * this.swayX
    );
    this.pitchLag = damp(this.pitchLag, controller.pitch, 19, dt);
    this.camera.rotation.x = this.pitchLag;
    this.camera.rotation.y = controller.yaw;
    this.camera.rotation.z = -Math.sin(controller.gait) * 0.0025 * speedNorm;
  }

  dispose() { this.camera.dispose(); }
}
