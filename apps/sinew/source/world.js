import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  ImageProcessingConfiguration,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3
} from '@babylonjs/core';

function pbr(scene, name, color, metallic = 0, roughness = 0.85) {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = Color3.FromHexString(color);
  material.metallic = metallic;
  material.roughness = roughness;
  material.environmentIntensity = 0.72;
  return material;
}

export class ArenaWorld {
  constructor(scene) {
    this.scene = scene;
    this.shadowCasters = [];
    this.quality = 'high';
    this.buildLighting();
    this.buildArena();
  }

  buildLighting() {
    this.scene.clearColor = new Color4(0.13, 0.11, 0.095, 1);
    this.scene.ambientColor = new Color3(0.22, 0.20, 0.18);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.011;
    this.scene.fogColor = new Color3(0.30, 0.27, 0.23);

    const hemi = new HemisphericLight('arena-hemi', new Vector3(0.2, 1, 0.1), this.scene);
    hemi.intensity = 0.62;
    hemi.diffuse = new Color3(0.78, 0.75, 0.69);
    hemi.groundColor = new Color3(0.19, 0.17, 0.15);

    this.sun = new DirectionalLight('arena-sun', new Vector3(-0.52, -1, 0.36), this.scene);
    this.sun.position = new Vector3(8, 13, -9);
    this.sun.intensity = 3.0;
    this.sun.diffuse = new Color3(1.0, 0.84, 0.66);

    this.shadowGenerator = new ShadowGenerator(1024, this.sun);
    this.shadowGenerator.usePercentageCloserFiltering = true;
    this.shadowGenerator.bias = 0.0007;
    this.shadowGenerator.normalBias = 0.018;
    this.shadowGenerator.darkness = 0.28;

    const image = this.scene.imageProcessingConfiguration;
    image.toneMappingEnabled = true;
    image.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    image.exposure = 1.12;
    image.contrast = 1.08;
  }

  buildArena() {
    this.materials = {
      floor: pbr(this.scene, 'arena-floor-mat', '#73685d', 0.02, 0.93),
      stone: pbr(this.scene, 'arena-stone-mat', '#514941', 0.02, 0.96),
      stoneDark: pbr(this.scene, 'arena-stone-dark-mat', '#37322e', 0.01, 0.98),
      wood: pbr(this.scene, 'arena-wood-mat', '#4a3122', 0.02, 0.86),
      bronze: pbr(this.scene, 'arena-bronze-mat', '#6e5140', 0.62, 0.46),
      cloth: pbr(this.scene, 'arena-cloth-mat', '#6d2924', 0, 0.94)
    };

    const floor = MeshBuilder.CreateCylinder('arena-floor', { diameter: 21.4, height: 0.22, tessellation: 48 }, this.scene);
    floor.position.y = -0.12;
    floor.material = this.materials.floor;
    floor.receiveShadows = true;

    const innerRing = MeshBuilder.CreateTorus('arena-inner-ring', { diameter: 12.2, thickness: 0.07, tessellation: 48 }, this.scene);
    innerRing.position.y = 0.015;
    innerRing.material = this.materials.stoneDark;
    innerRing.receiveShadows = true;

    const outerRing = MeshBuilder.CreateTorus('arena-outer-ring', { diameter: 19.5, thickness: 0.11, tessellation: 48 }, this.scene);
    outerRing.position.y = 0.02;
    outerRing.material = this.materials.stoneDark;
    outerRing.receiveShadows = true;

    const wallRadius = 10.45;
    const wallCount = 14;
    for (let i = 0; i < wallCount; i += 1) {
      const angle = (i / wallCount) * Math.PI * 2;
      const segment = MeshBuilder.CreateBox(`wall-${i}`, { width: 4.65, height: 2.4, depth: 0.46 }, this.scene);
      segment.position.set(Math.sin(angle) * wallRadius, 1.18, Math.cos(angle) * wallRadius);
      segment.rotation.y = angle;
      segment.material = i % 3 === 0 ? this.materials.stoneDark : this.materials.stone;
      segment.receiveShadows = true;
      this.shadowCasters.push(segment);
    }

    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * Math.PI * 2;
      const column = MeshBuilder.CreateCylinder(`column-${i}`, { diameter: 0.66, height: 3.05, tessellation: 10 }, this.scene);
      column.position.set(Math.sin(angle) * 9.95, 1.52, Math.cos(angle) * 9.95);
      column.material = this.materials.stoneDark;
      column.receiveShadows = true;
      this.shadowCasters.push(column);
      const cap = MeshBuilder.CreateCylinder(`column-cap-${i}`, { diameter: 0.86, height: 0.16, tessellation: 10 }, this.scene);
      cap.position.copyFrom(column.position);
      cap.position.y = 3.04;
      cap.material = this.materials.stone;
      cap.receiveShadows = true;
      this.shadowCasters.push(cap);
    }

    for (let i = 0; i < 4; i += 1) {
      const angle = i * Math.PI * 0.5 + Math.PI * 0.25;
      const frame = MeshBuilder.CreateBox(`banner-frame-${i}`, { width: 1.22, height: 0.08, depth: 0.08 }, this.scene);
      frame.position.set(Math.sin(angle) * 9.55, 2.55, Math.cos(angle) * 9.55);
      frame.rotation.y = angle;
      frame.material = this.materials.wood;
      this.shadowCasters.push(frame);

      const banner = MeshBuilder.CreatePlane(`banner-${i}`, { width: 1.02, height: 1.45, sideOrientation: 2 }, this.scene);
      banner.position.set(Math.sin(angle) * 9.31, 1.82, Math.cos(angle) * 9.31);
      banner.rotation.y = angle + Math.PI;
      banner.material = this.materials.cloth;
      banner.receiveShadows = true;
      this.shadowCasters.push(banner);
    }

    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const stand = MeshBuilder.CreateCylinder(`brazier-${i}`, { diameterTop: 0.46, diameterBottom: 0.34, height: 0.72, tessellation: 8 }, this.scene);
      stand.position.set(Math.sin(angle) * 8.55, 0.36, Math.cos(angle) * 8.55);
      stand.material = this.materials.bronze;
      stand.receiveShadows = true;
      this.shadowCasters.push(stand);

      const coalMat = new StandardMaterial(`coal-mat-${i}`, this.scene);
      coalMat.diffuseColor = new Color3(0.18, 0.055, 0.02);
      coalMat.emissiveColor = new Color3(0.42, 0.11, 0.02);
      const coal = MeshBuilder.CreateSphere(`coal-${i}`, { diameter: 0.31, segments: 8 }, this.scene);
      coal.position.copyFrom(stand.position);
      coal.position.y = 0.78;
      coal.scaling.y = 0.28;
      coal.material = coalMat;
    }

    for (const mesh of this.shadowCasters) this.shadowGenerator.addShadowCaster(mesh);
  }

  addWarrior(warrior) {
    for (const mesh of warrior.shadowMeshes) {
      if (mesh.isEnabled()) this.shadowGenerator.addShadowCaster(mesh);
    }
  }

  setQuality(level) {
    this.quality = level;
    if (level === 'low') {
      this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_LOW;
      this.scene.fogDensity = 0.013;
    } else if (level === 'medium') {
      this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      this.scene.fogDensity = 0.0115;
    } else {
      this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
      this.scene.fogDensity = 0.0105;
    }
  }

  dispose() {
    this.shadowGenerator.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
