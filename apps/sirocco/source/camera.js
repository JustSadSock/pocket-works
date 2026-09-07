import { UniversalCamera, Vector3 } from '@babylonjs/core';
import { clamp, damp } from './core.js';

export class FirstPersonCamera {
  constructor(scene) {
    this.camera = new UniversalCamera('first-person', new Vector3(0, 1.68, 0), scene);
    this.camera.minZ = 0.035;
    this.camera.maxZ = 950;
    this.camera.fov = 1.04;
    this.camera.inertia = 0;
    this.camera.angularSensibility = 0;
    scene.activeCamera = this.camera;
    this.bobY = 0;
    this.swayX = 0;
    this.pitchLag = 0;
  }

  update(controller, dt) {
    const speedNorm = clamp(controller.speed / 3.25, 0, 1);
    const bobTarget = Math.sin(controller.gait * 2) * 0.018 * speedNorm;
    const swayTarget = Math.sin(controller.gait) * 0.012 * speedNorm;
    this.bobY = damp(this.bobY, bobTarget, 14, dt);
    this.swayX = damp(this.swayX, swayTarget, 12, dt);
    const rightX = Math.cos(controller.yaw);
    const rightZ = -Math.sin(controller.yaw);
    this.camera.position.set(
      controller.localPosition.x + rightX * this.swayX,
      controller.localPosition.y + 1.67 + this.bobY,
      controller.localPosition.z + rightZ * this.swayX
    );
    this.pitchLag = damp(this.pitchLag, controller.pitch, 19, dt);
    this.camera.rotation.x = this.pitchLag;
    this.camera.rotation.y = controller.yaw;
    this.camera.rotation.z = -Math.sin(controller.gait) * 0.004 * speedNorm;
  }

  dispose() { this.camera.dispose(); }
}
