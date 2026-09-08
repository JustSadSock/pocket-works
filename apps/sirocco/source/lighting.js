import { Color3, DirectionalLight, HemisphericLight, Vector3 } from '@babylonjs/core';

export class DesertLighting {
  constructor(scene) {
    this.scene = scene;
    // Keep terrain free of mobile shadow maps, but let the actual dune and
    // footprint normals carry more of the lighting. A slightly lower, warmer
    // key plus less hemispheric fill gives depressions/ridges readable form
    // without reintroducing the old Safari shadow-radius artefacts.
    this.sunDirection = new Vector3(-0.44, -0.52, 0.73).normalize();
    this.sun = new DirectionalLight('sun', this.sunDirection, scene);
    this.sun.position = this.sunDirection.scale(-150);
    this.sun.intensity = 3.15;
    this.sun.diffuse = new Color3(1.0, 0.79, 0.56);
    this.sun.specular = new Color3(1.0, 0.91, 0.74);

    this.fill = new HemisphericLight('sky-fill', new Vector3(0.02, 1, 0.04), scene);
    this.fill.intensity = 0.62;
    this.fill.diffuse = new Color3(0.73, 0.84, 0.98);
    this.fill.groundColor = new Color3(0.48, 0.32, 0.20);
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
