import { Vector3 } from '@babylonjs/core';
import { clamp, lerp } from './core.js';

const STRIKES = [
  {
    name: 'right-cut',
    windup: { pose: { x: 0.42, y: 0.16, z: 0.05 }, dir: { x: 0.68, y: 0.12, z: 0.72 } },
    strike: { pose: { x: -0.16, y: 0.02, z: 0.62 }, dir: { x: -0.18, y: 0.05, z: 0.98 } }
  },
  {
    name: 'diagonal',
    windup: { pose: { x: 0.36, y: 0.34, z: 0.06 }, dir: { x: 0.48, y: 0.63, z: 0.61 } },
    strike: { pose: { x: -0.10, y: -0.12, z: 0.66 }, dir: { x: -0.14, y: -0.24, z: 0.96 } }
  },
  {
    name: 'overhead',
    windup: { pose: { x: 0.12, y: 0.47, z: 0.05 }, dir: { x: 0.04, y: 0.78, z: 0.62 } },
    strike: { pose: { x: 0.03, y: -0.14, z: 0.69 }, dir: { x: 0.02, y: -0.35, z: 0.94 } }
  },
  {
    name: 'thrust',
    windup: { pose: { x: 0.23, y: -0.05, z: 0.16 }, dir: { x: 0.06, y: 0.02, z: 0.99 } },
    strike: { pose: { x: 0.04, y: 0.01, z: 0.72 }, dir: { x: 0, y: 0.02, z: 1 } }
  }
];

function blendPose(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

export class DuelAI {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = 'measure';
    this.timer = 0.6 + Math.random() * 0.7;
    this.attack = null;
    this.orbit = Math.random() < 0.5 ? -1 : 1;
    this.feint = false;
    this.decisionClock = 0;
    this.pressure = 0.45;
  }

  chooseAttack() {
    this.attack = STRIKES[Math.floor(Math.random() * STRIKES.length)];
    this.state = 'windup';
    this.timer = 0.5 + Math.random() * 0.24;
    this.feint = Math.random() < 0.14;
  }

  update(dt, self, target) {
    const toTarget = target.position.subtract(self.position);
    const horizontal = new Vector3(toTarget.x, 0, toTarget.z);
    const distance = Math.max(0.001, horizontal.length());
    const facingYaw = Math.atan2(horizontal.x, horizontal.z);
    const forward = horizontal.scale(1 / distance);
    const right = new Vector3(forward.z, 0, -forward.x);

    this.decisionClock -= dt;
    if (this.decisionClock <= 0) {
      this.decisionClock = 0.38 + Math.random() * 0.32;
      if (Math.random() < 0.18) this.orbit *= -1;
      this.pressure = clamp(this.pressure + (Math.random() - 0.5) * 0.24, 0.24, 0.78);
    }

    let worldMove = new Vector3();
    if (distance > 3.15) worldMove.addInPlace(forward.scale(0.78));
    else if (distance < 1.85) worldMove.addInPlace(forward.scale(-0.82));
    else {
      worldMove.addInPlace(right.scale(this.orbit * (0.38 + this.pressure * 0.22)));
      if (distance > 2.7) worldMove.addInPlace(forward.scale(0.18));
      if (distance < 2.25) worldMove.addInPlace(forward.scale(-0.22));
    }
    if (worldMove.lengthSquared() > 1) worldMove.normalize();

    const localRight = new Vector3(Math.cos(facingYaw), 0, -Math.sin(facingYaw));
    const localForward = new Vector3(Math.sin(facingYaw), 0, Math.cos(facingYaw));

    const playerBlade = target.getSwordTrace();
    const bladeRelative = playerBlade.tip.subtract(self.position);
    const bladeHeight = bladeRelative.y - 1.22;
    const side = Vector3.Dot(bladeRelative, localRight);
    const swordSpeed = playerBlade.speed;
    const danger = clamp((swordSpeed - 2.2) / 5, 0, 1) * clamp((3.2 - distance) / 1.5, 0, 1);
    const shieldPose = {
      x: clamp(-0.13 + side * 0.09, -0.32, 0.12),
      y: clamp(0.02 + bladeHeight * 0.22 + danger * 0.09, -0.18, 0.31),
      z: 0.46 + danger * 0.08
    };
    const shieldNormal = { x: clamp(side * 0.12, -0.22, 0.22), y: clamp(bladeHeight * 0.12, -0.18, 0.22), z: 1 };

    this.timer -= dt;
    if (this.state === 'measure' && this.timer <= 0 && distance < 3.0 && self.stamina > 24) this.chooseAttack();

    let weaponPose = { x: 0.16, y: -0.10, z: 0.42 };
    let weaponDir = { x: 0.08, y: 0.12, z: 0.99 };

    if (this.state === 'windup' && this.attack) {
      const duration = 0.74;
      const t = clamp(1 - this.timer / duration, 0, 1);
      weaponPose = blendPose({ x: 0.16, y: -0.10, z: 0.42 }, this.attack.windup.pose, t);
      weaponDir = blendPose({ x: 0.08, y: 0.12, z: 0.99 }, this.attack.windup.dir, t);
      if (this.timer <= 0) {
        if (this.feint) {
          this.state = 'recover';
          this.timer = 0.5 + Math.random() * 0.22;
        } else {
          this.state = 'strike';
          this.timer = this.attack.name === 'thrust' ? 0.28 : 0.34;
          self.stamina = Math.max(0, self.stamina - 14);
        }
      }
    } else if (this.state === 'strike' && this.attack) {
      const duration = this.attack.name === 'thrust' ? 0.28 : 0.34;
      const t = clamp(1 - this.timer / duration, 0, 1);
      const eased = t * t * (3 - 2 * t);
      weaponPose = blendPose(this.attack.windup.pose, this.attack.strike.pose, eased);
      weaponDir = blendPose(this.attack.windup.dir, this.attack.strike.dir, eased);
      if (this.timer <= 0) {
        this.state = 'recover';
        this.timer = 0.55 + Math.random() * 0.34;
      }
    } else if (this.state === 'recover' && this.attack) {
      const duration = 0.82;
      const t = clamp(1 - this.timer / duration, 0, 1);
      weaponPose = blendPose(this.attack.strike.pose, { x: 0.16, y: -0.10, z: 0.42 }, t);
      weaponDir = blendPose(this.attack.strike.dir, { x: 0.08, y: 0.12, z: 0.99 }, t);
      if (this.timer <= 0) {
        this.state = 'measure';
        this.timer = 0.45 + Math.random() * 1.05;
        this.attack = null;
      }
    }

    if (danger > 0.62 && this.state === 'measure') {
      worldMove.addInPlace(forward.scale(-0.35));
      if (worldMove.lengthSquared() > 1) worldMove.normalize();
    }
    const moveX = Vector3.Dot(worldMove, localRight);
    const moveY = Vector3.Dot(worldMove, localForward);
    const moveMagnitude = clamp(worldMove.length(), 0, 1);

    return {
      lookYaw: facingYaw,
      lookPitch: clamp((target.bones.chest.getAbsolutePosition().y - self.bones.head.getAbsolutePosition().y) * 0.14, -0.18, 0.18),
      lookYawRate: 0,
      lookPitchRate: 0,
      moveX,
      moveY,
      moveMagnitude,
      moveSpaceYaw: facingYaw,
      weaponPose,
      weaponDir,
      shieldPose,
      shieldNormal
    };
  }
}
