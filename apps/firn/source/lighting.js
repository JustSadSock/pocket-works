import { CascadedShadowGenerator, Color3, DirectionalLight, HemisphericLight, ShadowGenerator, Vector3 } from '@babylonjs/core';

export class MountainLighting {
  constructor(scene, preset) {
    this.scene = scene;
    this.casters = new Set();
    this.sunDirection = new Vector3(-0.48, -0.52, 0.7).normalize();
    this.sun = new DirectionalLight('firn-sun', this.sunDirection, scene);
    this.sun.position = this.sunDirection.scale(-220);
    this.sun.intensity = 2.7;
    this.sun.diffuse = new Color3(1.0, 0.94, 0.84);
    this.sun.specular = new Color3(0.92, 0.96, 1.0);

    this.fill = new HemisphericLight('firn-sky-fill', new Vector3(0.02, 1, 0.08), scene);
    this.fill.intensity = 0.48;
    this.fill.diffuse = new Color3(0.47, 0.62, 0.72);
    this.fill.groundColor = new Color3(0.095, 0.12, 0.13);
    this.shadow = null;
    this.setQuality(preset);
  }

  setQuality(preset) {
    this.shadow?.dispose();
    const shadow = new CascadedShadowGenerator(preset.shadowSize, this.sun);
    shadow.numCascades = preset.key === 'low' ? 2 : 3;
    shadow.lambda = 0.76;
    shadow.stabilizeCascades = true;
    shadow.shadowMaxZ = preset.key === 'high' ? 145 : preset.key === 'medium' ? 110 : 78;
    shadow.bias = 0.0008;
    shadow.normalBias = 0.018;
    shadow.darkness = 0.12;
    shadow.filteringQuality = preset.key === 'high' ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;
    shadow.usePercentageCloserFiltering = true;
    for (const mesh of this.casters) if (!mesh.isDisposed?.()) shadow.addShadowCaster(mesh, false);
    this.shadow = shadow;
  }

  registerWorld(world) {
    for (const chunk of world.active.values()) {
      if (!this.casters.has(chunk.mesh)) {
        this.casters.add(chunk.mesh);
        this.shadow?.addShadowCaster(chunk.mesh, false);
      }
      for (const rock of chunk.rocks) {
        if (!this.casters.has(rock)) {
          this.casters.add(rock);
          this.shadow?.addShadowCaster(rock, false);
        }
      }
    }
    for (const mesh of [...this.casters]) if (mesh.isDisposed?.()) this.casters.delete(mesh);
  }

  setWeather(cloud, whiteout) {
    this.sun.intensity = 2.7 - cloud * 1.15 - whiteout * 0.48;
    this.fill.intensity = 0.48 + cloud * 0.2 + whiteout * 0.12;
    this.sun.diffuse = Color3.Lerp(new Color3(1.0, 0.94, 0.84), new Color3(0.74, 0.82, 0.87), cloud);
    this.fill.diffuse = Color3.Lerp(new Color3(0.47, 0.62, 0.72), new Color3(0.68, 0.73, 0.74), cloud);
  }

  dispose() { this.casters.clear(); this.shadow?.dispose(); this.sun.dispose(); this.fill.dispose(); }
}
