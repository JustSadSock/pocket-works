import { UniversalCamera, Vector3 } from '@babylonjs/core';
import { clamp, damp } from './core.js';

export class FirstPersonCamera {
  constructor(scene) {
    this.camera = new UniversalCamera('first-person', new Vector3(0, 1.78, 0.12), scene);
    this.camera.minZ = 0.26;
    this.camera.maxZ = 950;
    this.camera.fov = 1.02;
    this.camera.inertia = 0;
    this.camera.angularSensibility = 0;
    scene.activeCamera = this.camera;
    this.bobY = 0;
    this.swayX = 0;
    this.pitchLag = 0;
  }

  update(controller, dt) {
    const speedNorm = clamp(controller.speed / 3.0, 0, 1);
    const bobTarget = Math.sin(controller.gait * 2) * 0.0055 * speedNorm;
    const swayTarget = Math.sin(controller.gait) * 0.004 * speedNorm;
    this.bobY = damp(this.bobY, bobTarget, 14, dt);
    this.swayX = damp(this.swayX, swayTarget, 12, dt);
    this.pitchLag = damp(this.pitchLag, controller.pitch, 20, dt);

    const pitchForClearance = clamp(this.pitchLag, -1.10, 0.98);
    const viewForwardY = -Math.sin(pitchForClearance);
    const forwardX = Math.sin(controller.yaw);
    const forwardZ = Math.cos(controller.yaw);
    const rightX = Math.cos(controller.yaw);
    const rightZ = -Math.sin(controller.yaw);

    // Keep the gameplay eye close to the anatomical head so the chest, arms
    // and legs remain in the natural downward sightline. Head/keffiyeh safety
    // is provided primarily by the 26 cm near plane, not by pushing the camera
    // half a metre in front of the character.
    const eyeForward = 0.12;
    const eyeBaseY = 1.78;
    const verticalClearance = viewForwardY * 0.035;

    this.camera.position.set(
      controller.localPosition.x + forwardX * eyeForward + rightX * this.swayX,
      controller.localPosition.y + eyeBaseY + verticalClearance + this.bobY,
      controller.localPosition.z + forwardZ * eyeForward + rightZ * this.swayX
    );
    this.camera.rotation.x = this.pitchLag;
    this.camera.rotation.y = controller.yaw;
    this.camera.rotation.z = -Math.sin(controller.gait) * 0.0014 * speedNorm;
  }

  dispose() { this.camera.dispose(); }
}
