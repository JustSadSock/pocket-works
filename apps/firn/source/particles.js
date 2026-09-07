import { Color4, DynamicTexture, ParticleSystem, Vector3 } from '@babylonjs/core';
import { WIND_ANGLE } from './terrain.js';

function makeParticleTexture(scene) {
  const texture = new DynamicTexture('firn-particle-texture', { width: 24, height: 64 }, scene, false);
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, 24, 64);
  const grad = ctx.createLinearGradient(12, 4, 12, 60);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.28, 'rgba(252,254,255,0.38)');
  grad.addColorStop(0.52, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.72, 'rgba(241,249,253,0.44)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(12, 32, 2.2, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillRect(7, 28, 1, 3);
  ctx.fillRect(16, 38, 1, 2);
  ctx.fillRect(10, 18, 1, 2);
  texture.update();
  return texture;
}

export class SnowParticles {
  constructor(scene, budget = 360) {
    this.scene = scene;
    this.budget = budget;
    this.texture = makeParticleTexture(scene);
    this.windStrength = 0.55;
    this.windDir = new Vector3(Math.cos(WIND_ANGLE), 0.03, Math.sin(WIND_ANGLE));

    this.wind = new ParticleSystem('firn-blown-snow', budget, scene);
    this.wind.particleTexture = this.texture;
    this.wind.minSize = 0.018; this.wind.maxSize = 0.052;
    this.wind.minScaleX = 0.32; this.wind.maxScaleX = 0.72;
    this.wind.minScaleY = 1.6; this.wind.maxScaleY = 3.8;
    this.wind.minLifeTime = 0.55; this.wind.maxLifeTime = 1.55;
    this.wind.emitRate = Math.round(budget * 0.34);
    this.wind.color1 = new Color4(0.98, 1, 1, 0.46);
    this.wind.color2 = new Color4(0.86, 0.94, 0.98, 0.11);
    this.wind.colorDead = new Color4(1, 1, 1, 0);
    this.wind.minEmitBox = new Vector3(-10, -1.35, -10);
    this.wind.maxEmitBox = new Vector3(10, 2.8, 10);
    this.wind.minEmitPower = 2.2; this.wind.maxEmitPower = 6.2;
    this.wind.minAngularSpeed = -0.25; this.wind.maxAngularSpeed = 0.25;
    this.wind.updateSpeed = 0.016;
    this.wind.start();

    this.kickSystem = new ParticleSystem('firn-step-powder', Math.max(150, Math.round(budget * 0.55)), scene);
    this.kickSystem.particleTexture = this.texture;
    this.kickSystem.emitter = new Vector3(0, 0, 0);
    this.kickSystem.emitRate = 0;
    this.kickSystem.minSize = 0.025; this.kickSystem.maxSize = 0.085;
    this.kickSystem.minScaleX = 0.45; this.kickSystem.maxScaleX = 1.15;
    this.kickSystem.minScaleY = 0.55; this.kickSystem.maxScaleY = 1.5;
    this.kickSystem.minLifeTime = 0.18; this.kickSystem.maxLifeTime = 0.52;
    this.kickSystem.gravity = new Vector3(0, -2.4, 0);
    this.kickSystem.color1 = new Color4(0.98, 1, 1, 0.72);
    this.kickSystem.color2 = new Color4(0.86, 0.93, 0.97, 0.18);
    this.kickSystem.colorDead = new Color4(1, 1, 1, 0);
    this.kickSystem.minAngularSpeed = -1.1; this.kickSystem.maxAngularSpeed = 1.1;
    this.kickSystem.updateSpeed = 0.011;
    this.kickSystem.start();
  }

  setBudget(budget) {
    this.budget = budget;
    this.wind.emitRate = Math.round(budget * (0.22 + this.windStrength * 0.2));
  }

  setWind(strength) {
    this.windStrength = strength;
    const speed = 1.8 + strength * 6.4;
    this.wind.direction1 = this.windDir.scale(speed).add(new Vector3(-0.35, -0.09, -0.35));
    this.wind.direction2 = this.windDir.scale(speed * 1.4).add(new Vector3(0.35, 0.16, 0.35));
    this.wind.emitRate = Math.round(this.budget * (0.1 + strength * 0.4));
  }

  update(cameraPosition) {
    this.wind.emitter.copyFromFloats(
      cameraPosition.x - this.windDir.x * 6,
      cameraPosition.y + 0.25,
      cameraPosition.z - this.windDir.z * 6
    );
  }

  kick(position, powder = 0.5, downhill = null, intensity = 1) {
    this.kickSystem.emitter.copyFrom(position);
    const dir = downhill ? new Vector3(downhill.x, 0.18, downhill.z) : this.windDir.scale(0.28).add(new Vector3(0, 0.55, 0));
    const spread = 0.62 + powder * 0.62;
    this.kickSystem.direction1 = dir.scale(0.52 * intensity).add(new Vector3(-spread, 0.14, -spread));
    this.kickSystem.direction2 = dir.scale(1.72 * intensity).add(new Vector3(spread, 1.4 + powder, spread));
    this.kickSystem.manualEmitCount = Math.round((7 + powder * 14) * intensity);
  }

  slough(position, downhill, strength = 1) {
    this.kick(position, 1, downhill, 1.6 + strength * 1.9);
  }

  dispose() { this.wind.dispose(); this.kickSystem.dispose(); this.texture.dispose(); }
}
