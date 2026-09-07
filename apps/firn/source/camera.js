import { UniversalCamera, Vector3 } from '@babylonjs/core';
import { damp } from './core.js';

export class FirstPersonCamera {
  constructor(scene) {
    this.camera = new UniversalCamera('firn-first-person', new Vector3(0, 1.62, 0), scene);
    this.camera.minZ = 0.035;
    this.camera.maxZ = 1500;
    this.camera.fov = 1.15;
    this.camera.inputs.clear();
    this.eyeHeight = 1.66;
    this.scene = scene;
    scene.activeCamera = this.camera;
  }

  update(controller, dt) {
    const sinkDrop = controller.lastSnow.sink * 0.11;
    const targetEye = 1.66 - sinkDrop + controller.verticalBob;
    this.eyeHeight = damp(this.eyeHeight, targetEye, 13, dt);
    this.camera.position.set(controller.localPosition.x, controller.localPosition.y + this.eyeHeight, controller.localPosition.z);
    this.camera.rotation.x = controller.pitch;
    this.camera.rotation.y = controller.yaw;
    this.camera.rotation.z = controller.roll;
    this.camera.fov = damp(this.camera.fov, 1.14 + Math.min(0.035, controller.speed * 0.006), 7, dt);
  }

  dispose() { this.camera.dispose(); }
}
