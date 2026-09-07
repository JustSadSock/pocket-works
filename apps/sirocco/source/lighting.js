import { Color3, DirectionalLight, HemisphericLight, ShadowGenerator, Vector3 } from '@babylonjs/core';

export class DesertLighting {
  constructor(scene, preset, bodyCasters = []) {
    this.scene = scene;
    this.bodyCasters = bodyCasters;
    this.sunDirection = new Vector3(-0.46, -0.72, 0.52).normalize();
    this.sun = new DirectionalLight('sun', this.sunDirection, scene);
    this.sun.position = this.sunDirection.scale(-120);
    this.sun.intensity = 3.5;
    this.sun.diffuse = new Color3(1.0, 0.78, 0.56);
    this.sun.specular = new Color3(1.0, 0.90, 0.74);

    this.fill = new HemisphericLight('sky-fill', new Vector3(0.05, 1, 0.08), scene);
    this.fill.intensity = 0.50;
    this.fill.diffuse = new Color3(0.68, 0.78, 0.9);
    this.fill.groundColor = new Color3(0.42, 0.25, 0.15);

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
    shadow.setDarkness(0.28);
    shadow.setTransparencyShadow(true);
    for (const mesh of this.bodyCasters) shadow.addShadowCaster(mesh, false);
    this.shadow = shadow;
  }

  // Terrain no longer enters the realtime shadow map. Streaming dune chunks
  // self-shadowing through CSM was the source of mobile shimmer/banding and was
  // much more expensive than the visual benefit. Terrain still receives the
  // soft player shadow and gets shape from its real normals + sun/fill lighting.
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
