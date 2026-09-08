import { Vector3 } from '@babylonjs/core';
import { clamp, lerp } from './core.js';

const GUARD_POSE = { x: .10, y: -.18, z: .36 };
const GUARD_DIR = { x: .10, y: .54, z: .84 };
const STRIKES = [
  { name: 'right-cut', windup: { pose: { x: .38, y: .10, z: .04 }, dir: { x: .67, y: .25, z: .70 } }, strike: { pose: { x: -.13, y: -.04, z: .57 }, dir: { x: -.24, y: -.13, z: .96 } } },
  { name: 'backhand', windup: { pose: { x: -.18, y: .04, z: .16 }, dir: { x: -.45, y: .31, z: .84 } }, strike: { pose: { x: .29, y: -.07, z: .56 }, dir: { x: .34, y: -.16, z: .93 } } },
  { name: 'diagonal', windup: { pose: { x: .31, y: .29, z: .02 }, dir: { x: .43, y: .69, z: .58 } }, strike: { pose: { x: -.08, y: -.16, z: .59 }, dir: { x: -.16, y: -.32, z: .93 } } },
  { name: 'rising', windup: { pose: { x: .27, y: -.31, z: .10 }, dir: { x: .36, y: -.57, z: .74 } }, strike: { pose: { x: -.10, y: .20, z: .58 }, dir: { x: -.16, y: .45, z: .88 } } },
  { name: 'overhead', windup: { pose: { x: .08, y: .43, z: .00 }, dir: { x: .02, y: .82, z: .57 } }, strike: { pose: { x: .01, y: -.17, z: .62 }, dir: { x: .01, y: -.39, z: .92 } } },
  { name: 'thrust', windup: { pose: { x: .16, y: -.16, z: .13 }, dir: { x: .04, y: .28, z: .96 } }, strike: { pose: { x: .02, y: -.04, z: .67 }, dir: { x: 0, y: .08, z: 1 } } }
];

function blendPose(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}
function smoothstep(t) { return t * t * (3 - 2 * t); }

export class DuelAI {
  constructor() { this.reset(); }

  reset() {
    this.state = 'measure';
    this.timer = .60 + Math.random() * .70;
    this.phaseDuration = this.timer;
    this.attack = null;
    this.recoverFrom = { pose: { ...GUARD_POSE }, dir: { ...GUARD_DIR } };
    this.orbit = Math.random() < .5 ? -1 : 1;
    this.feint = false;
    this.decisionClock = 0;
    this.pressure = .45;
    this.breath = Math.random() * Math.PI * 2;
  }

  startPhase(state, duration) {
    this.state = state;
    this.phaseDuration = Math.max(.001, duration);
    this.timer = this.phaseDuration;
  }

  chooseAttack() {
    this.attack = STRIKES[Math.floor(Math.random() * STRIKES.length)];
    this.feint = Math.random() < .18;
    this.startPhase('windup', .44 + Math.random() * .22);
  }

  update(dt, self, target) {
    const toTarget = target.position.subtract(self.position);
    const horizontal = new Vector3(toTarget.x, 0, toTarget.z);
    const distance = Math.max(.001, horizontal.length());
    const facingYaw = Math.atan2(horizontal.x, horizontal.z);
    const forward = horizontal.scale(1 / distance);
    const right = new Vector3(forward.z, 0, -forward.x);

    this.breath += dt * (1.55 + this.pressure * .25);
    this.decisionClock -= dt;
    if (this.decisionClock <= 0) {
      this.decisionClock = .34 + Math.random() * .30;
      if (Math.random() < .22) this.orbit *= -1;
      this.pressure = clamp(this.pressure + (Math.random() - .5) * .28, .22, .82);
    }

    let worldMove = new Vector3();
    if (distance > 3.15) worldMove.addInPlace(forward.scale(.82));
    else if (distance < 1.72) worldMove.addInPlace(forward.scale(-.90));
    else {
      worldMove.addInPlace(right.scale(this.orbit * (.34 + this.pressure * .28)));
      if (distance > 2.62) worldMove.addInPlace(forward.scale(.22));
      if (distance < 2.15) worldMove.addInPlace(forward.scale(-.27));
    }
    if (worldMove.lengthSquared() > 1) worldMove.normalize();

    const localRight = new Vector3(Math.cos(facingYaw), 0, -Math.sin(facingYaw));
    const localForward = new Vector3(Math.sin(facingYaw), 0, Math.cos(facingYaw));
    const playerBlade = target.getSwordTrace();
    const bladeRelative = playerBlade.tip.subtract(self.position);
    const bladeHeight = bladeRelative.y - 1.22;
    const side = Vector3.Dot(bladeRelative, localRight);
    const danger = clamp((playerBlade.speed - 2.2) / 5, 0, 1) * clamp((3.2 - distance) / 1.5, 0, 1);
    const breathing = Math.sin(this.breath) * .008;

    const shieldPose = {
      x: clamp(-.27 + side * .060, -.39, -.12),
      y: clamp(-.21 + bladeHeight * .13 + danger * .12, -.31, .08) + breathing,
      z: .35 + danger * .07
    };
    const shieldNormal = {
      x: clamp(.10 + side * .07, -.08, .22),
      y: clamp(-.09 + bladeHeight * .06, -.15, .07),
      z: 1
    };

    this.timer -= dt;
    if (this.state === 'measure' && this.timer <= 0 && distance < 3.05 && self.stamina > 24) this.chooseAttack();

    let weaponPose = { ...GUARD_POSE };
    let weaponDir = { ...GUARD_DIR };

    if (this.state === 'measure') {
      weaponPose.y += breathing;
      weaponDir.y += breathing * .8;
    } else if (this.state === 'windup' && this.attack) {
      const t = clamp(1 - this.timer / this.phaseDuration, 0, 1);
      const loaded = smoothstep(t);
      weaponPose = blendPose(GUARD_POSE, this.attack.windup.pose, loaded);
      weaponDir = blendPose(GUARD_DIR, this.attack.windup.dir, loaded);

      if (this.timer <= 0) {
        if (this.feint) {
          // Recover from the actual end of the feint, not from an imaginary completed strike.
          this.recoverFrom = { pose: { ...weaponPose }, dir: { ...weaponDir } };
          this.startPhase('recover', .34 + Math.random() * .18);
        } else {
          const duration = this.attack.name === 'thrust' ? .23 : .29;
          this.startPhase('strike', duration);
          self.stamina = Math.max(0, self.stamina - 14);
          if (distance > 1.35 && distance < 2.5) self.velocity.addInPlace(forward.scale(.42));
        }
      }
    } else if (this.state === 'strike' && this.attack) {
      const t = clamp(1 - this.timer / this.phaseDuration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      weaponPose = blendPose(this.attack.windup.pose, this.attack.strike.pose, eased);
      weaponDir = blendPose(this.attack.windup.dir, this.attack.strike.dir, eased);

      if (this.timer <= 0) {
        this.recoverFrom = { pose: { ...this.attack.strike.pose }, dir: { ...this.attack.strike.dir } };
        this.startPhase('recover', .48 + Math.random() * .24);
      }
    } else if (this.state === 'recover' && this.attack) {
      const t = clamp(1 - this.timer / this.phaseDuration, 0, 1);
      const settled = smoothstep(t);
      weaponPose = blendPose(this.recoverFrom.pose, GUARD_POSE, settled);
      weaponDir = blendPose(this.recoverFrom.dir, GUARD_DIR, settled);
      worldMove.addInPlace(forward.scale(-.10));

      if (this.timer <= 0) {
        this.state = 'measure';
        this.timer = .38 + Math.random() * .88;
        this.phaseDuration = this.timer;
        this.attack = null;
      }
    }

    if (danger > .62 && this.state === 'measure') {
      worldMove.addInPlace(forward.scale(-.38));
      if (worldMove.lengthSquared() > 1) worldMove.normalize();
    }

    const moveX = Vector3.Dot(worldMove, localRight);
    const moveY = Vector3.Dot(worldMove, localForward);
    const moveMagnitude = clamp(worldMove.length(), 0, 1);
    return {
      lookYaw: facingYaw,
      lookPitch: clamp((target.bones.chest.getAbsolutePosition().y - self.bones.head.getAbsolutePosition().y) * .14, -.18, .18),
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
