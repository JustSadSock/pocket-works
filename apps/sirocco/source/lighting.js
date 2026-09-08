import { Color3, DirectionalLight, HemisphericLight, Vector3 } from '@babylonjs/core';

export class DesertLighting {
  constructor(scene) {
    this.scene = scene;
    // Shape comes from the real surface normals, not a terrain shadow map. The
    // higher sky fill keeps a dune facing away from the sun from becoming the
    // giant brown near-field block seen in Safari screenshots.
    this.sunDirection = new Vector3(-0.42, -0.58, 0.70).normalize();
    this.sun = new DirectionalLight('sun', this.sunDirection, scene);
    this.sun.position = this.sunDirection.scale(-150);
    this.sun.intensity = 2.85;
    this.sun.diffuse = new Color3(1.0, 0.80, 0.59);
    this.sun.specular = new Color3(1.0, 0.91, 0.76);

    this.fill = new HemisphericLight('sky-fill', new Vector3(0.02, 1, 0.04), scene);
    this.fill.intensity = 0.78;
    this.fill.diffuse = new Color3(0.73, 0.84, 0.98);
    this.fill.groundColor = new Color3(0.56, 0.39, 0.25);
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
