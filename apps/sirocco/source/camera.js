import { UniversalCamera, Vector3 } from '@babylonjs/core';
import { clamp, damp } from './core.js';

export class FirstPersonCamera {
  constructor(scene) {
    this.camera = new UniversalCamera('first-person', new Vector3(0, 1.77, 0.50), scene);
    this.camera.minZ = 0.18;
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

    // Offset along the complete 3D look vector, not only yaw. The old camera
    // moved forward horizontally, so steep pitch could rotate the animated
    // skull/keffiyeh back through the near plane. Following pitch keeps the eye
    // physically outside the head for every valid look angle.
    const pitchForOffset = clamp(this.pitchLag, -1.10, 0.98);
    const cosPitch = Math.cos(pitchForOffset);
    const viewForwardX = Math.sin(controller.yaw) * cosPitch;
    const viewForwardY = -Math.sin(pitchForOffset);
    const viewForwardZ = Math.cos(controller.yaw) * cosPitch;
    const rightX = Math.cos(controller.yaw);
    const rightZ = -Math.sin(controller.yaw);
    const eyeForward = 0.50;
    const eyeBaseY = 1.77;

    this.camera.position.set(
      controller.localPosition.x + viewForwardX * eyeForward + rightX * this.swayX,
      controller.localPosition.y + eyeBaseY + viewForwardY * eyeForward + this.bobY,
      controller.localPosition.z + viewForwardZ * eyeForward + rightZ * this.swayX
    );
    this.camera.rotation.x = this.pitchLag;
    this.camera.rotation.y = controller.yaw;
    this.camera.rotation.z = -Math.sin(controller.gait) * 0.0014 * speedNorm;
  }

  dispose() { this.camera.dispose(); }
}
