import {
  CascadedShadowGenerator, Color3, DirectionalLight, HemisphericLight,
  ShadowGenerator, Vector3
} from '@babylonjs/core';

export class DesertLighting {
  constructor(scene, preset, casters = []) {
    this.scene = scene;
    this.casters = casters;
    this.sunDirection = new Vector3(-0.46, -0.72, 0.52).normalize();
    this.sun = new DirectionalLight('sun', this.sunDirection, scene);
    this.sun.position = this.sunDirection.scale(-120);
    this.sun.intensity = 4.0;
    this.sun.diffuse = new Color3(1.0, 0.77, 0.53);
    this.sun.specular = new Color3(1.0, 0.88, 0.7);

    this.fill = new HemisphericLight('sky-fill', new Vector3(0.05, 1, 0.08), scene);
    this.fill.intensity = 0.44;
    this.fill.diffuse = new Color3(0.68, 0.78, 0.9);
    this.fill.groundColor = new Color3(0.44, 0.25, 0.14);

    this.shadow = null;
    this.setQuality(preset);
  }

  setQuality(preset) {
    this.shadow?.dispose();
    const shadow = new CascadedShadowGenerator(preset.shadowSize, this.sun);
    shadow.numCascades = preset.id === 'low' ? 2 : 3;
    shadow.lambda = 0.72;
    shadow.stabilizeCascades = true;
    shadow.shadowMaxZ = preset.id === 'high' ? 92 : preset.id === 'medium' ? 70 : 52;
    shadow.bias = 0.0012;
    shadow.normalBias = 0.035;
    shadow.filteringQuality = preset.id === 'high' ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;
    shadow.usePercentageCloserFiltering = true;
    shadow.forceBackFacesOnly = true;
    for (const mesh of this.casters) shadow.addShadowCaster(mesh, false);
    this.shadow = shadow;
  }

  addCaster(mesh) {
    this.casters.push(mesh);
    this.shadow?.addShadowCaster(mesh, false);
  }

  dispose() {
    this.shadow?.dispose();
    this.sun.dispose();
    this.fill.dispose();
  }
}
