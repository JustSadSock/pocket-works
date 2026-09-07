import { Color3, DirectionalLight, HemisphericLight, ShadowGenerator, Vector3 } from '@babylonjs/core';

export class DesertLighting {
  constructor(scene, preset, bodyCasters = []) {
    this.scene = scene;
    this.bodyCasters = bodyCasters;
    // Lower sun angle gives the dunes readable light/dark sides without the
    // unstable terrain self-shadow map that previously produced moving bands.
    this.sunDirection = new Vector3(-0.36, -0.50, 0.79).normalize();
    this.sun = new DirectionalLight('sun', this.sunDirection, scene);
    this.sun.position = this.sunDirection.scale(-140);
    this.sun.intensity = 3.7;
    this.sun.diffuse = new Color3(1.0, 0.76, 0.51);
    this.sun.specular = new Color3(1.0, 0.88, 0.70);

    this.fill = new HemisphericLight('sky-fill', new Vector3(0.03, 1, 0.06), scene);
    this.fill.intensity = 0.42;
    this.fill.diffuse = new Color3(0.66, 0.77, 0.91);
    this.fill.groundColor = new Color3(0.39, 0.22, 0.13);

    this.shadow = null;
    this.setQuality(preset);
  }

  setQuality(preset) {
    this.shadow?.dispose();
    const size = preset.id === 'low' ? 512 : 1024;
    const shadow = new ShadowGenerator(size, this.sun);
    shadow.usePercentageCloserFiltering = true;
    shadow.filteringQuality = preset.id === 'high' ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;
    shadow.bias = 0.0018;
    shadow.normalBias = 0.028;
    shadow.forceBackFacesOnly = true;
    shadow.setDarkness(0.32);
    shadow.setTransparencyShadow(true);
    for (const mesh of this.bodyCasters) shadow.addShadowCaster(mesh, false);
    this.shadow = shadow;
  }

  // Terrain deliberately stays out of the realtime shadow map. Its large-scale
  // form is shaded by the low directional sun and real mesh normals, while only
  // the nearby body uses a filtered dynamic shadow. This removes cascade seams,
  // acne and striped self-shadowing on mobile Safari.
  registerTerrain() {}
  registerWorld() {}

  addCaster(mesh) {
    this.bodyCasters.push(mesh);
    this.shadow?.addShadowCaster(mesh, false);
  }

  dispose() {
    this.shadow?.dispose();
    this.sun.dispose();
    this.fill.dispose();
  }
}
