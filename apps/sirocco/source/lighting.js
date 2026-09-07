import { Color3, DirectionalLight, HemisphericLight, Vector3 } from '@babylonjs/core';

export class DesertLighting {
  constructor(scene) {
    this.scene = scene;
    // Low sun still defines dune form through actual surface normals. Realtime
    // shadow maps are intentionally absent from terrain; the character uses a
    // small stable contact shadow instead.
    this.sunDirection = new Vector3(-0.36, -0.50, 0.79).normalize();
    this.sun = new DirectionalLight('sun', this.sunDirection, scene);
    this.sun.position = this.sunDirection.scale(-140);
    this.sun.intensity = 3.55;
    this.sun.diffuse = new Color3(1.0, 0.77, 0.53);
    this.sun.specular = new Color3(1.0, 0.88, 0.70);

    this.fill = new HemisphericLight('sky-fill', new Vector3(0.03, 1, 0.06), scene);
    this.fill.intensity = 0.50;
    this.fill.diffuse = new Color3(0.68, 0.79, 0.93);
    this.fill.groundColor = new Color3(0.47, 0.29, 0.18);
  }

  setQuality() {}
  registerTerrain() {}
  registerWorld() {}
  addCaster() {}

  dispose() {
    this.sun.dispose();
    this.fill.dispose();
  }
}
