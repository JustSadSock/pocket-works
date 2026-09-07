import { Color4, DynamicTexture, ParticleSystem, Vector3 } from '@babylonjs/core';

function makeParticleTexture(scene) {
  const tex = new DynamicTexture('sand-grain', { width: 32, height: 32 }, scene, false);
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,225,170,0.96)');
  grad.addColorStop(0.38, 'rgba(232,181,112,0.72)');
  grad.addColorStop(1, 'rgba(205,140,74,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  tex.update();
  return tex;
}

export class SandParticles {
  constructor(scene, budget = 16) {
    this.scene = scene;
    this.budget = budget;
    this.skidClock = 0;
    this.texture = makeParticleTexture(scene);
    this.system = new ParticleSystem('sand-kicks', 240, scene);
    this.system.particleTexture = this.texture;
    this.system.emitter = Vector3.Zero();
    this.system.minLifeTime = 0.14;
    this.system.maxLifeTime = 0.34;
    this.system.minSize = 0.014;
    this.system.maxSize = 0.060;
    this.system.minEmitPower = 0.34;
    this.system.maxEmitPower = 1.05;
    this.system.gravity = new Vector3(0, -8.8, 0);
    this.system.color1 = new Color4(0.93, 0.69, 0.39, 0.58);
    this.system.color2 = new Color4(0.75, 0.45, 0.22, 0.20);
    this.system.colorDead = new Color4(0.56, 0.31, 0.14, 0);
    this.system.minAngularSpeed = -3;
    this.system.maxAngularSpeed = 3;
    this.system.updateSpeed = 1 / 60;
    this.system.emitRate = 0;
    this.system.start();
  }

  setBudget(value) { this.budget = value; }

  configureBurst(position, yaw, downhill, lift = 0.13) {
    this.system.emitter = position.clone().add(new Vector3(0, 0.025, 0));
    const forward = new Vector3(Math.sin(yaw), 0.06, Math.cos(yaw));
    const side = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const dx = downhill?.x || 0;
    const dz = downhill?.z || 0;
    this.system.direction1 = forward.scale(0.18).add(side.scale(-0.42)).add(new Vector3(dx * 0.58, lift, dz * 0.58));
    this.system.direction2 = forward.scale(0.42).add(side.scale(0.42)).add(new Vector3(dx * 0.92, lift * 1.55, dz * 0.92));
  }

  kick(position, yaw, strength = 1, downhill = null) {
    this.configureBurst(position, yaw, downhill, 0.14);
    this.system.manualEmitCount = Math.max(3, Math.round(this.budget * strength));
  }

  trail(dt, position, yaw, sliding, downhill = null) {
    if (sliding < 0.12) { this.skidClock = 0; return; }
    this.skidClock += dt;
    if (this.skidClock < 0.11) return;
    this.skidClock = 0;
    this.configureBurst(position, yaw, downhill, 0.08);
    this.system.manualEmitCount = Math.max(2, Math.round(this.budget * (0.18 + sliding * 0.24)));
  }

  dispose() {
    this.system.dispose();
    this.texture.dispose();
  }
}
