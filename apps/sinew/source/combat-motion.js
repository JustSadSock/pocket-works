import { Quaternion, Vector3 } from '@babylonjs/core';
import { clamp } from './core.js';

const PHASES = {
  idle: 0,
  load: 0.085,
  strike: 0.19,
  follow: 0.12,
  recover: 0.31
};

function basisFromYaw(yaw) {
  return {
    forward: new Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
    right: new Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  };
}

function easeOut(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function blend(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  };
}

function segmentDistanceSquared(p1, q1, p2, q2) {
  const d1 = q1.subtract(p1);
  const d2 = q2.subtract(p2);
  const r = p1.subtract(p2);
  const a = Vector3.Dot(d1, d1);
  const e = Vector3.Dot(d2, d2);
  const f = Vector3.Dot(d2, r);
  let s = 0;
  let t = 0;
  if (a <= 1e-8 && e <= 1e-8) return Vector3.DistanceSquared(p1, p2);
  if (a <= 1e-8) t = clamp(f / e, 0, 1);
  else {
    const c = Vector3.Dot(d1, r);
    if (e <= 1e-8) s = clamp(-c / a, 0, 1);
    else {
      const b = Vector3.Dot(d1, d2);
      const denom = a * e - b * b;
      if (Math.abs(denom) > 1e-8) s = clamp((b * f - c * e) / denom, 0, 1);
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = p1.add(d1.scale(s));
  const c2 = p2.add(d2.scale(t));
  return Vector3.DistanceSquared(c1, c2);
}

class PlayerCombatIntent {
  constructor(game) {
    this.game = game;
    this.phase = 'idle';
    this.phaseTime = 0;
    this.strike = null;
    this.edgeRoll = 0;
    this.edgeRollTarget = 0;
    this.guardX = 0.12;
    this.guardY = 0.08;
    this.lastYawRate = 0;
    this.lastPitchRate = 0;
    this.cooldown = 0;
    this.didStep = false;
  }

  reset() {
    this.phase = 'idle';
    this.phaseTime = 0;
    this.strike = null;
    this.edgeRoll = 0;
    this.edgeRollTarget = 0;
    this.guardX = 0.12;
    this.guardY = 0.08;
    this.cooldown = 0;
    this.didStep = false;
  }

  classify(yawRate, pitchRate) {
    const ax = Math.abs(yawRate);
    const ay = Math.abs(pitchRate);
    if (ay > ax * 1.35) {
      if (pitchRate < 0) return { kind: 'overhead', side: yawRate >= 0 ? 1 : -1 };
      return { kind: 'rising', side: yawRate >= 0 ? 1 : -1 };
    }
    if (ax > ay * 1.55) return { kind: 'horizontal', side: yawRate >= 0 ? 1 : -1 };
    return { kind: 'diagonal', side: yawRate >= 0 ? 1 : -1, vertical: pitchRate >= 0 ? 1 : -1 };
  }

  beginStrike(yawRate, pitchRate) {
    this.strike = this.classify(yawRate, pitchRate);
    this.phase = 'load';
    this.phaseTime = 0;
    this.didStep = false;
    const diagonal = Math.atan2(pitchRate, Math.abs(yawRate) + 0.001);
    this.edgeRollTarget = clamp(diagonal * 0.75 + this.strike.side * 0.18, -1.15, 1.15);
  }

  phaseProgress() {
    const duration = PHASES[this.phase] || 1;
    return clamp(this.phaseTime / duration, 0, 1);
  }

  advance(dt) {
    if (this.phase === 'idle') return;
    this.phaseTime += dt;
    if (this.phaseTime < PHASES[this.phase]) return;
    this.phaseTime = 0;
    if (this.phase === 'load') this.phase = 'strike';
    else if (this.phase === 'strike') this.phase = 'follow';
    else if (this.phase === 'follow') this.phase = 'recover';
    else {
      this.phase = 'idle';
      this.strike = null;
      this.cooldown = 0.08;
      this.didStep = false;
    }
  }

  guardPose(control) {
    const slowX = clamp(control.lookYawRate / 3.5, -1, 1);
    const slowY = clamp(control.lookPitchRate / 3.0, -1, 1);
    this.guardX += (0.11 - slowX * 0.06 - this.guardX) * 0.08;
    this.guardY += (0.10 + slowY * 0.12 - this.guardY) * 0.08;
    return {
      pose: { x: 0.13 + this.guardX, y: -0.11 + this.guardY, z: 0.44 },
      dir: { x: 0.10 + this.guardX * 0.35, y: 0.17 + this.guardY * 0.55, z: 0.98 }
    };
  }

  strikePoses() {
    const side = this.strike?.side || 1;
    const kind = this.strike?.kind || 'horizontal';
    if (kind === 'overhead') {
      return {
        load: { pose: { x: 0.16 * side, y: 0.48, z: 0.08 }, dir: { x: 0.08 * side, y: 0.82, z: 0.56 } },
        strike: { pose: { x: -0.04 * side, y: -0.16, z: 0.69 }, dir: { x: -0.04 * side, y: -0.42, z: 0.91 } },
        follow: { pose: { x: -0.12 * side, y: -0.31, z: 0.55 }, dir: { x: -0.16 * side, y: -0.55, z: 0.81 } }
      };
    }
    if (kind === 'rising') {
      return {
        load: { pose: { x: 0.34 * side, y: -0.31, z: 0.12 }, dir: { x: 0.42 * side, y: -0.54, z: 0.72 } },
        strike: { pose: { x: -0.13 * side, y: 0.27, z: 0.65 }, dir: { x: -0.15 * side, y: 0.48, z: 0.86 } },
        follow: { pose: { x: -0.26 * side, y: 0.39, z: 0.52 }, dir: { x: -0.34 * side, y: 0.60, z: 0.72 } }
      };
    }
    if (kind === 'diagonal') {
      const vertical = this.strike?.vertical || 1;
      return {
        load: { pose: { x: 0.39 * side, y: 0.31 * -vertical, z: 0.10 }, dir: { x: 0.48 * side, y: 0.55 * -vertical, z: 0.67 } },
        strike: { pose: { x: -0.15 * side, y: 0.18 * vertical, z: 0.68 }, dir: { x: -0.20 * side, y: 0.34 * vertical, z: 0.92 } },
        follow: { pose: { x: -0.31 * side, y: 0.29 * vertical, z: 0.50 }, dir: { x: -0.38 * side, y: 0.43 * vertical, z: 0.79 } }
      };
    }
    return {
      load: { pose: { x: 0.43 * side, y: 0.13, z: 0.08 }, dir: { x: 0.66 * side, y: 0.10, z: 0.74 } },
      strike: { pose: { x: -0.18 * side, y: -0.03, z: 0.67 }, dir: { x: -0.24 * side, y: 0.02, z: 0.97 } },
      follow: { pose: { x: -0.35 * side, y: -0.12, z: 0.53 }, dir: { x: -0.46 * side, y: -0.08, z: 0.83 } }
    };
  }

  shieldIntent(control, player, enemy) {
    const basis = basisFromYaw(player.upperYaw);
    let threatSide = -0.16;
    let threatHeight = 0.05;
    let danger = 0;
    if (enemy && !enemy.dead) {
      const trace = enemy.getSwordTrace();
      const rel = trace.tip.subtract(player.bones.chest.getAbsolutePosition());
      threatSide = clamp(Vector3.Dot(rel, basis.right) * 0.22, -0.28, 0.10);
      threatHeight = clamp(rel.y * 0.23, -0.17, 0.25);
      const distance = Vector3.Distance(trace.tip, player.position);
      danger = clamp((trace.speed - 2.2) / 5.5, 0, 1) * clamp((3.2 - distance) / 1.65, 0, 1);
    }
    const attacking = this.phase === 'load' || this.phase === 'strike' || this.phase === 'follow';
    const tucked = attacking ? 0.06 : 0;
    return {
      shieldPose: {
        x: clamp(-0.20 + threatSide * (0.55 + danger * 0.45), -0.39, -0.08),
        y: clamp(0.03 + threatHeight * (0.45 + danger * 0.55) + tucked, -0.15, 0.30),
        z: clamp(0.43 + danger * 0.10 - (attacking ? 0.035 : 0), 0.40, 0.55)
      },
      shieldNormal: {
        x: clamp(threatSide * 0.48, -0.25, 0.16),
        y: clamp(threatHeight * 0.35, -0.18, 0.20),
        z: 1
      }
    };
  }

  transform(control, dt, player, enemy) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const yawRate = control.lookYawRate || 0;
    const pitchRate = control.lookPitchRate || 0;
    const gestureEnergy = Math.hypot(yawRate, pitchRate);
    const acceleration = Math.hypot(yawRate - this.lastYawRate, pitchRate - this.lastPitchRate) / Math.max(dt, 1 / 120);
    this.lastYawRate = yawRate;
    this.lastPitchRate = pitchRate;

    if (this.phase === 'idle' && this.cooldown <= 0 && gestureEnergy > 3.25 && acceleration > 16 && player.stamina > 12) {
      this.beginStrike(yawRate, pitchRate);
      player.stamina = Math.max(0, player.stamina - 8);
    }

    this.advance(dt);
    const guard = this.guardPose(control);
    let weaponPose = guard.pose;
    let weaponDir = guard.dir;

    if (this.phase !== 'idle' && this.strike) {
      const poses = this.strikePoses();
      const t = this.phaseProgress();
      if (this.phase === 'load') {
        const e = smoothstep(t);
        weaponPose = blend(guard.pose, poses.load.pose, e);
        weaponDir = blend(guard.dir, poses.load.dir, e);
      } else if (this.phase === 'strike') {
        const e = easeOut(t);
        weaponPose = blend(poses.load.pose, poses.strike.pose, e);
        weaponDir = blend(poses.load.dir, poses.strike.dir, e);
        if (!this.didStep && t > 0.18) {
          const distance = enemy ? Vector3.Distance(player.position, enemy.position) : 99;
          if (distance > 1.25 && distance < 2.65) {
            const forward = basisFromYaw(player.bodyYaw).forward;
            player.velocity.addInPlace(forward.scale(0.58));
          }
          this.didStep = true;
        }
      } else if (this.phase === 'follow') {
        const e = smoothstep(t);
        weaponPose = blend(poses.strike.pose, poses.follow.pose, e);
        weaponDir = blend(poses.strike.dir, poses.follow.dir, e);
      } else if (this.phase === 'recover') {
        const e = smoothstep(t);
        weaponPose = blend(poses.follow.pose, guard.pose, e);
        weaponDir = blend(poses.follow.dir, guard.dir, e);
      }
    }

    const shield = this.shieldIntent(control, player, enemy);
    const targetRoll = this.phase === 'idle' ? clamp((pitchRate - yawRate * 0.22) * 0.065, -0.45, 0.45) : this.edgeRollTarget;
    this.edgeRoll += (targetRoll - this.edgeRoll) * (1 - Math.exp(-11 * dt));

    return { ...control, weaponPose, weaponDir, ...shield };
  }

  onContact(event) {
    if (event.type === 'hit' && event.attacker === this.game.player) {
      if (this.phase === 'follow') this.phaseTime += 0.045;
    }
    if (event.type === 'block' && event.attacker === this.game.player) {
      this.phase = 'recover';
      this.phaseTime = 0;
      this.edgeRollTarget *= -0.55;
    }
  }
}

function applyBladeRoll(warrior, roll) {
  if (!warrior?.meshes?.blade?.rotationQuaternion || Math.abs(roll) < 0.001) return;
  const axis = warrior.sword.tip.subtract(warrior.sword.base);
  if (axis.lengthSquared() < 1e-7) return;
  axis.normalize();
  const q = Quaternion.RotationAxis(axis, roll);
  warrior.meshes.blade.rotationQuaternion = q.multiply(warrior.meshes.blade.rotationQuaternion);
  if (warrior.meshes.guard.rotationQuaternion) warrior.meshes.guard.rotationQuaternion = q.multiply(warrior.meshes.guard.rotationQuaternion);
}

function installSwordBind(game) {
  let bind = null;
  const originalResolve = game.combat.resolvePair.bind(game.combat);
  game.combat.resolvePair = (a, b, dt, now) => {
    const ta = a.getSwordTrace();
    const tb = b.getSwordTrace();
    const close = segmentDistanceSquared(ta.base, ta.tip, tb.base, tb.tip) < 0.0105;
    const relSpeed = Math.abs(ta.speed - tb.speed);

    if (!bind && close && relSpeed < 4.6 && ta.speed > 0.55 && tb.speed > 0.55) {
      bind = { time: 0.28, a, b };
      game.audio?.clash(0.42);
      game.kickCamera?.(-0.008, 0, 0.006);
    }

    if (bind && bind.a === a && bind.b === b) {
      bind.time -= dt;
      const delta = tb.tip.subtract(ta.tip);
      const distance = delta.length();
      if (distance > 1e-5) {
        const normal = delta.scale(1 / distance);
        const pressure = clamp((0.19 - distance) * 8.5, 0, 1.25);
        a.applyWeaponImpulse(normal.scale(pressure * 0.22));
        b.applyWeaponImpulse(normal.scale(-pressure * 0.22));
        a.stability = Math.max(0, a.stability - pressure * dt * 4.5);
        b.stability = Math.max(0, b.stability - pressure * dt * 4.5);
      }
      if (!close || bind.time <= 0) bind = null;
      else return;
    }
    originalResolve(a, b, dt, now);
  };
}

export function installActiveCombat(game) {
  const intent = new PlayerCombatIntent(game);
  const originalUpdate = game.update.bind(game);
  const originalRestart = game.restart?.bind(game);
  const originalHandle = game.handleCombatEvent.bind(game);
  let installed = false;
  let hitStop = 0;

  game.update = (dt, nowSeconds) => {
    if (hitStop > 0) {
      hitStop -= dt;
      return;
    }
    if (!installed && game.player && game.enemy && game.input && game.combat) {
      installed = true;
      const originalPlayerUpdate = game.player.update.bind(game.player);
      game.player.update = (stepDt, control, snap = false) => {
        const transformed = snap ? control : intent.transform(control, stepDt, game.player, game.enemy);
        originalPlayerUpdate(stepDt, transformed, snap);
        if (!snap) applyBladeRoll(game.player, intent.edgeRoll);
      };
      installSwordBind(game);
    }
    originalUpdate(dt, nowSeconds);
  };

  game.handleCombatEvent = (event) => {
    intent.onContact(event);
    if (event.type === 'hit') hitStop = Math.max(hitStop, 0.040 + (event.intensity || 0) * 0.018);
    else if (event.type === 'clash') hitStop = Math.max(hitStop, 0.025 + (event.intensity || 0) * 0.012);
    else if (event.type === 'block') hitStop = Math.max(hitStop, 0.018 + (event.intensity || 0) * 0.010);
    originalHandle(event);
  };

  if (originalRestart) {
    game.restart = (...args) => {
      intent.reset();
      hitStop = 0;
      return originalRestart(...args);
    };
  }

  return intent;
}
