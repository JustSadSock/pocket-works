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
    this.texture = makeParticleTexture(scene);
    this.system = new ParticleSystem('sand-kicks', 220, scene);
    this.system.particleTexture = this.texture;
    this.system.emitter = Vector3.Zero();
    this.system.minLifeTime = 0.18;
    this.system.maxLifeTime = 0.46;
    this.system.minSize = 0.018;
    this.system.maxSize = 0.075;
    this.system.minEmitPower = 0.45;
    this.system.maxEmitPower = 1.45;
    this.system.gravity = new Vector3(0, -7.2, 0);
    this.system.color1 = new Color4(0.93, 0.69, 0.39, 0.62);
    this.system.color2 = new Color4(0.75, 0.45, 0.22, 0.22);
    this.system.colorDead = new Color4(0.56, 0.31, 0.14, 0);
    this.system.minAngularSpeed = -3;
    this.system.maxAngularSpeed = 3;
    this.system.updateSpeed = 1 / 60;
    this.system.emitRate = 0;
    this.system.start();
  }

  setBudget(value) { this.budget = value; }

  kick(position, yaw, strength = 1, downhill = null) {
    this.system.emitter = position.clone().add(new Vector3(0, 0.04, 0));
    const forward = new Vector3(Math.sin(yaw), 0.12, Math.cos(yaw));
    const side = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const dx = downhill?.x || 0;
    const dz = downhill?.z || 0;
    this.system.direction1 = forward.scale(0.24).add(side.scale(-0.55)).add(new Vector3(dx * 0.6, 0.2, dz * 0.6));
    this.system.direction2 = forward.scale(0.56).add(side.scale(0.55)).add(new Vector3(dx * 1.0, 0.42, dz * 1.0));
    this.system.manualEmitCount = Math.max(2, Math.round(this.budget * strength));
  }

  dispose() {
    this.system.dispose();
    this.texture.dispose();
  }
}
