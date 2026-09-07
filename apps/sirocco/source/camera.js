import { UniversalCamera, Vector3 } from '@babylonjs/core';
import { clamp, damp } from './core.js';

export class FirstPersonCamera {
  constructor(scene) {
    this.camera = new UniversalCamera('first-person', new Vector3(0, 1.72, 0.22), scene);
    this.camera.minZ = 0.09;
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
    const speedNorm = clamp(controller.speed / 3.0, 0, 1);
    const bobTarget = Math.sin(controller.gait * 2) * 0.008 * speedNorm;
    const swayTarget = Math.sin(controller.gait) * 0.0065 * speedNorm;
    this.bobY = damp(this.bobY, bobTarget, 14, dt);
    this.swayX = damp(this.swayX, swayTarget, 12, dt);

    // Position belongs to the animated body's facing direction, not the view yaw.
    // That keeps the eye just in front of the face even while the player looks
    // sideways, so the camera cannot orbit back into the skull/neck geometry.
    const bodyForwardX = Math.sin(controller.bodyYaw);
    const bodyForwardZ = Math.cos(controller.bodyYaw);
    const rightX = Math.cos(controller.yaw);
    const rightZ = -Math.sin(controller.yaw);
    const eyeForward = 0.225;
    this.camera.position.set(
      controller.localPosition.x + bodyForwardX * eyeForward + rightX * this.swayX,
      controller.localPosition.y + 1.72 + this.bobY,
      controller.localPosition.z + bodyForwardZ * eyeForward + rightZ * this.swayX
    );
    this.pitchLag = damp(this.pitchLag, controller.pitch, 19, dt);
    this.camera.rotation.x = this.pitchLag;
    this.camera.rotation.y = controller.yaw;
    this.camera.rotation.z = -Math.sin(controller.gait) * 0.002 * speedNorm;
  }

  dispose() { this.camera.dispose(); }
}
