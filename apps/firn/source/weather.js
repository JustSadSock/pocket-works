import { Color3, Color4, Scene } from '@babylonjs/core';
import { clamp, damp, smoothstep } from './core.js';

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
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0019;
    this.scene.fogColor = new Color3(0.76, 0.86, 0.91);
    this.scene.clearColor = new Color4(0.49, 0.67, 0.76, 1);
    scene.imageProcessingConfiguration.contrast = 1.13;
    scene.imageProcessingConfiguration.exposure = 1.04;
  }

  update(dt, altitude = 0) {
    this.time += dt;
    const windTarget = clamp(0.43 + Math.sin(this.time * 0.071) * 0.21 + Math.sin(this.time * 0.019 + 2.1) * 0.18 + Math.max(0, altitude) * 0.0005, 0.18, 0.96);
    const cloudTarget = clamp(0.28 + Math.sin(this.time * 0.027 + 0.8) * 0.25 + Math.sin(this.time * 0.011) * 0.2, 0.04, 0.84);
    const whiteoutTarget = smoothstep(0.68, 0.94, windTarget * 0.72 + cloudTarget * 0.58);
    this.wind = damp(this.wind, windTarget, 0.28, dt);
    this.cloud = damp(this.cloud, cloudTarget, 0.16, dt);
    this.whiteout = damp(this.whiteout, whiteoutTarget, 0.12, dt);

    const fog = 0.0017 + this.cloud * 0.0019 + this.whiteout * 0.0054;
    this.scene.fogDensity = fog;
    const skyClear = new Color3(0.49, 0.68, 0.78);
    const skyCloud = new Color3(0.66, 0.75, 0.79);
    const fogColor = Color3.Lerp(new Color3(0.76, 0.86, 0.91), new Color3(0.86, 0.9, 0.91), this.cloud);
    const sky = Color3.Lerp(skyClear, skyCloud, this.cloud);
    this.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    this.scene.fogColor.copyFrom(fogColor);
    this.lighting.setWeather(this.cloud, this.whiteout);
    this.particles.setWind(this.wind);

    const nextLabel = this.whiteout > 0.48 ? 'СНЕЖНАЯ ДЫМКА' : this.wind > 0.72 ? 'ПОЗЁМКА' : this.cloud > 0.58 ? 'ОБЛАЧНО' : 'ЯСНЫЙ ХРЕБЕТ';
    const changed = nextLabel !== this.label;
    this.label = nextLabel;
    return changed ? nextLabel : null;
  }

  dispose() {}
}
