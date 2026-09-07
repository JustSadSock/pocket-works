import { CascadedShadowGenerator, Color3, DirectionalLight, HemisphericLight, ShadowGenerator, Vector3 } from '@babylonjs/core';

export class MountainLighting {
  constructor(scene, preset) {
    this.scene = scene;
    this.casters = new Set();
    this.sunDirection = new Vector3(-0.52, -0.64, 0.56).normalize();
    this.sun = new DirectionalLight('firn-sun', this.sunDirection, scene);
    this.sun.position = this.sunDirection.scale(-180);
    this.sun.intensity = 3.55;
    this.sun.diffuse = new Color3(0.93, 0.97, 1.0);
    this.sun.specular = new Color3(1.0, 0.98, 0.92);

    this.fill = new HemisphericLight('firn-sky-fill', new Vector3(0.02, 1, 0.08), scene);
    this.fill.intensity = 0.72;
    this.fill.diffuse = new Color3(0.57, 0.72, 0.84);
    this.fill.groundColor = new Color3(0.22, 0.3, 0.34);
    this.shadow = null;
    this.setQuality(preset);
  }

  setQuality(preset) {
    this.shadow?.dispose();
    const shadow = new CascadedShadowGenerator(preset.shadowSize, this.sun);
    shadow.numCascades = preset.key === 'low' ? 2 : 3;
    shadow.lambda = 0.72;
    shadow.stabilizeCascades = true;
    shadow.shadowMaxZ = preset.key === 'high' ? 118 : preset.key === 'medium' ? 92 : 68;
    shadow.bias = 0.0012;
    shadow.normalBias = 0.026;
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
    this.sun.intensity = 3.55 - cloud * 1.55 - whiteout * 0.65;
    this.fill.intensity = 0.72 + cloud * 0.18;
    this.sun.diffuse = Color3.Lerp(new Color3(0.93, 0.97, 1.0), new Color3(0.77, 0.87, 0.94), cloud);
  }

  dispose() { this.casters.clear(); this.shadow?.dispose(); this.sun.dispose(); this.fill.dispose(); }
}
