import { Color4, DynamicTexture, ParticleSystem, Vector3 } from '@babylonjs/core';
import { WIND_ANGLE } from './terrain.js';

function makeParticleTexture(scene) {
  const texture = new DynamicTexture('firn-particle-texture', { width: 32, height: 32 }, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.35, 'rgba(244,251,255,0.78)');
  gradient.addColorStop(1, 'rgba(220,240,250,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
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
    this.wind.minSize = 0.025; this.wind.maxSize = 0.085;
    this.wind.minLifeTime = 0.8; this.wind.maxLifeTime = 2.1;
    this.wind.emitRate = Math.round(budget * 0.34);
    this.wind.color1 = new Color4(0.95, 0.99, 1, 0.54);
    this.wind.color2 = new Color4(0.82, 0.92, 0.98, 0.14);
    this.wind.colorDead = new Color4(1, 1, 1, 0);
    this.wind.minEmitBox = new Vector3(-9, -1.1, -9);
    this.wind.maxEmitBox = new Vector3(9, 2.4, 9);
    this.wind.minEmitPower = 1.8; this.wind.maxEmitPower = 4.8;
    this.wind.updateSpeed = 0.018;
    this.wind.start();

    this.kickSystem = new ParticleSystem('firn-step-powder', Math.max(120, Math.round(budget * 0.5)), scene);
    this.kickSystem.particleTexture = this.texture;
    this.kickSystem.emitter = new Vector3(0, 0, 0);
    this.kickSystem.emitRate = 0;
    this.kickSystem.minSize = 0.035; this.kickSystem.maxSize = 0.13;
    this.kickSystem.minLifeTime = 0.22; this.kickSystem.maxLifeTime = 0.68;
    this.kickSystem.gravity = new Vector3(0, -1.8, 0);
    this.kickSystem.color1 = new Color4(0.96, 0.99, 1, 0.82);
    this.kickSystem.color2 = new Color4(0.8, 0.9, 0.96, 0.22);
    this.kickSystem.colorDead = new Color4(1, 1, 1, 0);
    this.kickSystem.minAngularSpeed = -1.8; this.kickSystem.maxAngularSpeed = 1.8;
    this.kickSystem.updateSpeed = 0.012;
    this.kickSystem.start();
  }

  setBudget(budget) {
    this.budget = budget;
    this.wind.emitRate = Math.round(budget * (0.24 + this.windStrength * 0.2));
  }

  setWind(strength) {
    this.windStrength = strength;
    const speed = 1.4 + strength * 5.4;
    this.wind.direction1 = this.windDir.scale(speed).add(new Vector3(-0.4, -0.08, -0.4));
    this.wind.direction2 = this.windDir.scale(speed * 1.35).add(new Vector3(0.4, 0.18, 0.4));
    this.wind.emitRate = Math.round(this.budget * (0.12 + strength * 0.38));
  }

  update(cameraPosition) {
    this.wind.emitter = new Vector3(cameraPosition.x - this.windDir.x * 6, cameraPosition.y + 0.3, cameraPosition.z - this.windDir.z * 6);
  }

  kick(position, powder = 0.5, downhill = null, intensity = 1) {
    this.kickSystem.emitter.copyFrom(position);
    const dir = downhill ? new Vector3(downhill.x, 0.18, downhill.z) : this.windDir.scale(0.28).add(new Vector3(0, 0.55, 0));
    const spread = 0.7 + powder * 0.55;
    this.kickSystem.direction1 = dir.scale(0.55 * intensity).add(new Vector3(-spread, 0.2, -spread));
    this.kickSystem.direction2 = dir.scale(1.8 * intensity).add(new Vector3(spread, 1.3 + powder, spread));
    this.kickSystem.manualEmitCount = Math.round((5 + powder * 10) * intensity);
  }

  slough(position, downhill, strength = 1) {
    this.kick(position, 1, downhill, 1.5 + strength * 1.8);
  }

  dispose() { this.wind.dispose(); this.kickSystem.dispose(); this.texture.dispose(); }
}
