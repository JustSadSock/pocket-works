import { Color3, Color4, DynamicTexture, MeshBuilder, Scene, StandardMaterial, Texture } from '@babylonjs/core';
import { clamp, damp, smoothstep } from './core.js';

function makeSkyTexture(scene) {
  const texture = new DynamicTexture('firn-alpine-sky-texture', { width: 32, height: 256 }, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#27495d');
  gradient.addColorStop(0.38, '#55788a');
  gradient.addColorStop(0.68, '#aebfc6');
  gradient.addColorStop(0.82, '#e2e7e6');
  gradient.addColorStop(1, '#f4f3ef');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 256);
  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

export class MountainWeather {
  constructor(scene, lighting, particles) {
    this.scene = scene;
    this.lighting = lighting;
    this.particles = particles;
    this.time = 23;
    this.wind = 0.48;
    this.cloud = 0.18;
    this.whiteout = 0;
    this.label = 'ЯСНЫЙ ХРЕБЕТ';

    this.skyTexture = makeSkyTexture(scene);
    this.skyMaterial = new StandardMaterial('firn-alpine-sky-material', scene);
    this.skyMaterial.disableLighting = true;
    this.skyMaterial.backFaceCulling = false;
    this.skyMaterial.emissiveTexture = this.skyTexture;
    this.skyMaterial.emissiveColor = new Color3(1, 1, 1);
    this.skyMaterial.fogEnabled = false;
    this.sky = MeshBuilder.CreateSphere('firn-alpine-sky', { diameter: 1100, segments: 16 }, scene);
    this.sky.material = this.skyMaterial;
    this.sky.isPickable = false;
    this.sky.infiniteDistance = true;
    this.sky.rotation.x = Math.PI;

    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.00145;
    this.scene.fogColor = new Color3(0.79, 0.83, 0.84);
    this.scene.clearColor = new Color4(0.34, 0.49, 0.57, 1);
    scene.imageProcessingConfiguration.contrast = 1.18;
    scene.imageProcessingConfiguration.exposure = 0.96;
  }

  update(dt, altitude = 0) {
    this.time += dt;
    const windTarget = clamp(0.38 + Math.sin(this.time * 0.071) * 0.2 + Math.sin(this.time * 0.019 + 2.1) * 0.16 + Math.max(0, altitude) * 0.00042, 0.16, 0.92);
    const cloudTarget = clamp(0.24 + Math.sin(this.time * 0.027 + 0.8) * 0.22 + Math.sin(this.time * 0.011) * 0.17, 0.03, 0.8);
    const whiteoutTarget = smoothstep(0.72, 0.98, windTarget * 0.72 + cloudTarget * 0.56);
    this.wind = damp(this.wind, windTarget, 0.28, dt);
    this.cloud = damp(this.cloud, cloudTarget, 0.16, dt);
    this.whiteout = damp(this.whiteout, whiteoutTarget, 0.12, dt);

    this.scene.fogDensity = 0.00115 + this.cloud * 0.00145 + this.whiteout * 0.0048;
    const clearFog = new Color3(0.74, 0.79, 0.8);
    const cloudFog = new Color3(0.86, 0.87, 0.85);
    const fogColor = Color3.Lerp(clearFog, cloudFog, this.cloud * 0.82 + this.whiteout * 0.18);
    this.scene.fogColor.copyFrom(fogColor);

    const skyClear = new Color3(1.0, 1.0, 1.0);
    const skyCloud = new Color3(0.74, 0.79, 0.8);
    this.skyMaterial.emissiveColor = Color3.Lerp(skyClear, skyCloud, clamp(this.cloud * 0.82 + this.whiteout * 0.35, 0, 1));
    this.scene.imageProcessingConfiguration.exposure = 0.96 - this.cloud * 0.08 - this.whiteout * 0.08;

    this.lighting.setWeather(this.cloud, this.whiteout);
    this.particles.setWind(this.wind);

    const nextLabel = this.whiteout > 0.48 ? 'СНЕЖНАЯ ДЫМКА' : this.wind > 0.72 ? 'ПОЗЁМКА' : this.cloud > 0.58 ? 'ОБЛАЧНО' : 'ЯСНЫЙ ХРЕБЕТ';
    const changed = nextLabel !== this.label;
    this.label = nextLabel;
    return changed ? nextLabel : null;
  }

  dispose() {
    this.sky?.dispose();
    this.skyMaterial?.dispose();
    this.skyTexture?.dispose();
  }
}
