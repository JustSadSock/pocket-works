import { UniversalCamera, Vector3 } from '@babylonjs/core';
import { damp } from './core.js';

export class FirstPersonCamera {
  constructor(scene) {
    this.camera = new UniversalCamera('firn-first-person', new Vector3(0, 1.62, 0), scene);
    this.camera.minZ = 0.035;
    this.camera.maxZ = 1800;
    this.camera.fov = 1.13;
    this.camera.inputs.clear();
    this.eyeHeight = 1.66;
    this.pitchKick = 0;
    this.scene = scene;
    scene.activeCamera = this.camera;
  }

  update(controller, dt) {
    const sinkDrop = controller.bodySink * 0.92;
    const climbCompression = controller.climbing * 0.11;
    const targetEye = 1.66 - sinkDrop - climbCompression + controller.verticalBob;
    this.eyeHeight = damp(this.eyeHeight, targetEye, controller.lastSnow.powder > 0.5 ? 7.5 : 12, dt);
    this.pitchKick = damp(this.pitchKick, Math.sin(controller.climbPulse * 0.72) * controller.climbing * 0.055, 9, dt);
    this.camera.position.set(controller.localPosition.x, controller.localPosition.y + this.eyeHeight, controller.localPosition.z);
    this.camera.rotation.x = controller.pitch + this.pitchKick;
    this.camera.rotation.y = controller.yaw;
    this.camera.rotation.z = controller.roll;
    const exertionFov = controller.climbing * 0.022;
    this.camera.fov = damp(this.camera.fov, 1.12 + Math.min(0.04, controller.speed * 0.007) - exertionFov, 7, dt);
  }

  dispose() { this.camera.dispose(); }
}
