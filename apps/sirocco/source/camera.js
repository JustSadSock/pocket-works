import { UniversalCamera, Vector3 } from '@babylonjs/core';
import { clamp, damp } from './core.js';

export class FirstPersonCamera {
  constructor(scene) {
    this.camera = new UniversalCamera('first-person', new Vector3(0, 1.76, 0.48), scene);
    this.camera.minZ = 0.16;
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
    const bobTarget = Math.sin(controller.gait * 2) * 0.006 * speedNorm;
    const swayTarget = Math.sin(controller.gait) * 0.0045 * speedNorm;
    this.bobY = damp(this.bobY, bobTarget, 14, dt);
    this.swayX = damp(this.swayX, swayTarget, 12, dt);

    const viewForwardX = Math.sin(controller.yaw);
    const viewForwardZ = Math.cos(controller.yaw);
    const rightX = Math.cos(controller.yaw);
    const rightZ = -Math.sin(controller.yaw);
    // A real first-person body camera lives slightly in front of the face.
    // 48 cm is deliberate for this stylised GLB: the source head and keffiyeh
    // have a much deeper silhouette than a production FPS headless rig.
    const eyeForward = 0.48;
    this.camera.position.set(
      controller.localPosition.x + viewForwardX * eyeForward + rightX * this.swayX,
      controller.localPosition.y + 1.76 + this.bobY,
      controller.localPosition.z + viewForwardZ * eyeForward + rightZ * this.swayX
    );
    this.pitchLag = damp(this.pitchLag, controller.pitch, 20, dt);
    this.camera.rotation.x = this.pitchLag;
    this.camera.rotation.y = controller.yaw;
    this.camera.rotation.z = -Math.sin(controller.gait) * 0.0015 * speedNorm;
  }

  dispose() { this.camera.dispose(); }
}
