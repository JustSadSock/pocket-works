import { Vector3 } from '@babylonjs/core';
import { clamp, lerp } from './core.js';

const STRIKES = [
  {
    name: 'right-cut',
    windup: { pose: { x: 0.42, y: 0.16, z: 0.05 }, dir: { x: 0.68, y: 0.12, z: 0.72 } },
    strike: { pose: { x: -0.16, y: 0.02, z: 0.62 }, dir: { x: -0.18, y: 0.05, z: 0.98 } }
  },
  {
    name: 'backhand',
    windup: { pose: { x: -0.22, y: 0.08, z: 0.18 }, dir: { x: -0.42, y: 0.08, z: 0.90 } },
    strike: { pose: { x: 0.34, y: -0.03, z: 0.61 }, dir: { x: 0.38, y: -0.04, z: 0.92 } }
  },
  {
    name: 'diagonal',
    windup: { pose: { x: 0.36, y: 0.34, z: 0.06 }, dir: { x: 0.48, y: 0.63, z: 0.61 } },
    strike: { pose: { x: -0.10, y: -0.12, z: 0.66 }, dir: { x: -0.14, y: -0.24, z: 0.96 } }
  },
  {
    name: 'rising',
    windup: { pose: { x: 0.31, y: -0.31, z: 0.13 }, dir: { x: 0.42, y: -0.55, z: 0.72 } },
    strike: { pose: { x: -0.13, y: 0.26, z: 0.64 }, dir: { x: -0.17, y: 0.47, z: 0.86 } }
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
    this.comboBias = 0;
  }

  chooseAttack() {
    this.attack = STRIKES[Math.floor(Math.random() * STRIKES.length)];
    this.state = 'windup';
    this.timer = 0.42 + Math.random() * 0.24;
    this.feint = Math.random() < 0.18;
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
      this.decisionClock = 0.34 + Math.random() * 0.30;
      if (Math.random() < 0.22) this.orbit *= -1;
      this.pressure = clamp(this.pressure + (Math.random() - 0.5) * 0.28, 0.22, 0.82);
    }

    let worldMove = new Vector3();
    if (distance > 3.15) worldMove.addInPlace(forward.scale(0.82));
    else if (distance < 1.72) worldMove.addInPlace(forward.scale(-0.90));
    else {
      worldMove.addInPlace(right.scale(this.orbit * (0.34 + this.pressure * 0.28)));
      if (distance > 2.62) worldMove.addInPlace(forward.scale(0.22));
      if (distance < 2.15) worldMove.addInPlace(forward.scale(-0.27));
    }
    if (worldMove.lengthSquared() > 1) worldMove.normalize();

    const localRight = new Vector3(Math.cos(facingYaw), 0, -Math.sin(facingYaw));
    const localForward = new Vector3(Math.sin(facingYaw), 0, Math.cos(facingYaw));
    const playerBlade = target.getSwordTrace();
    const bladeRelative = playerBlade.tip.subtract(self.position);
    const bladeHeight = bladeRelative.y - 1.22;
    const side = Vector3.Dot(bladeRelative, localRight);
    const danger = clamp((playerBlade.speed - 2.2) / 5, 0, 1) * clamp((3.2 - distance) / 1.5, 0, 1);

    const shieldPose = {
      x: clamp(-0.13 + side * 0.09, -0.32, 0.12),
      y: clamp(0.02 + bladeHeight * 0.22 + danger * 0.11, -0.18, 0.32),
      z: 0.45 + danger * 0.10
    };
    const shieldNormal = { x: clamp(side * 0.12, -0.22, 0.22), y: clamp(bladeHeight * 0.12, -0.18, 0.22), z: 1 };

    this.timer -= dt;
    if (this.state === 'measure' && this.timer <= 0 && distance < 3.05 && self.stamina > 24) this.chooseAttack();

    let weaponPose = { x: 0.16, y: -0.10, z: 0.42 };
    let weaponDir = { x: 0.08, y: 0.12, z: 0.99 };

    if (this.state === 'windup' && this.attack) {
      const duration = 0.66;
      const t = clamp(1 - this.timer / duration, 0, 1);
      const loaded = t * t * (3 - 2 * t);
      weaponPose = blendPose({ x: 0.16, y: -0.10, z: 0.42 }, this.attack.windup.pose, loaded);
      weaponDir = blendPose({ x: 0.08, y: 0.12, z: 0.99 }, this.attack.windup.dir, loaded);
      if (this.timer <= 0) {
        if (this.feint) {
          this.state = 'recover';
          this.timer = 0.42 + Math.random() * 0.18;
        } else {
          this.state = 'strike';
          this.timer = this.attack.name === 'thrust' ? 0.24 : 0.30;
          self.stamina = Math.max(0, self.stamina - 14);
          if (distance > 1.35 && distance < 2.5) self.velocity.addInPlace(forward.scale(0.42));
        }
      }
    } else if (this.state === 'strike' && this.attack) {
      const duration = this.attack.name === 'thrust' ? 0.24 : 0.30;
      const t = clamp(1 - this.timer / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      weaponPose = blendPose(this.attack.windup.pose, this.attack.strike.pose, eased);
      weaponDir = blendPose(this.attack.windup.dir, this.attack.strike.dir, eased);
      if (this.timer <= 0) {
        this.state = 'recover';
        this.timer = 0.48 + Math.random() * 0.28;
      }
    } else if (this.state === 'recover' && this.attack) {
      const duration = 0.72;
      const t = clamp(1 - this.timer / duration, 0, 1);
      const settled = t * t * (3 - 2 * t);
      weaponPose = blendPose(this.attack.strike.pose, { x: 0.16, y: -0.10, z: 0.42 }, settled);
      weaponDir = blendPose(this.attack.strike.dir, { x: 0.08, y: 0.12, z: 0.99 }, settled);
      worldMove.addInPlace(forward.scale(-0.10));
      if (this.timer <= 0) {
        this.state = 'measure';
        this.timer = 0.38 + Math.random() * 0.88;
        this.attack = null;
      }
    }

    if (danger > 0.62 && this.state === 'measure') {
      worldMove.addInPlace(forward.scale(-0.38));
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
