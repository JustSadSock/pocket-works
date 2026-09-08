import { Quaternion, Vector3 } from '@babylonjs/core';
import { clamp } from './core.js';
import { GUARD_JOINTS, MuscleArm, blendJointTargets, strikeTargets } from './muscle-model.js';

const PHASES = { idle: 0, load: 0.12, strike: 0.18, follow: 0.16, recover: 0.34 };
const basisFromYaw = (yaw) => ({ forward: new Vector3(Math.sin(yaw), 0, Math.cos(yaw)), right: new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)) });
const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

function segmentDistanceSquared(p1, q1, p2, q2) {
  const d1 = q1.subtract(p1); const d2 = q2.subtract(p2); const r = p1.subtract(p2);
  const a = Vector3.Dot(d1, d1); const e = Vector3.Dot(d2, d2); const f = Vector3.Dot(d2, r);
  let s = 0; let t = 0;
  if (a <= 1e-8 && e <= 1e-8) return Vector3.DistanceSquared(p1, p2);
  if (a <= 1e-8) t = clamp(f / e, 0, 1);
  else {
    const c = Vector3.Dot(d1, r);
    if (e <= 1e-8) s = clamp(-c / a, 0, 1);
    else {
      const b = Vector3.Dot(d1, d2); const denom = a * e - b * b;
      if (Math.abs(denom) > 1e-8) s = clamp((b * f - c * e) / denom, 0, 1);
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = p1.add(d1.scale(s)); const c2 = p2.add(d2.scale(t));
  return Vector3.DistanceSquared(c1, c2);
}

class PlayerCombatIntent {
  constructor(game) {
    this.game = game;
    this.arm = new MuscleArm();
    this.lastPose = null;
    this.lastYawRate = 0;
    this.lastPitchRate = 0;
    this.reset();
  }

  reset() {
    this.phase = 'idle';
    this.phaseTime = 0;
    this.strike = null;
    this.strikeJointTargets = null;
    this.cooldown = 0;
    this.didStep = false;
    this.guardBias = { yaw: 0, pitch: 0 };
    this.arm.reset();
    this.lastPose = null;
  }

  classify(yawRate, pitchRate) {
    const ax = Math.abs(yawRate); const ay = Math.abs(pitchRate);
    if (ay > ax * 1.32) return pitchRate < 0 ? { kind: 'overhead', side: yawRate >= 0 ? 1 : -1, vertical: -1 } : { kind: 'rising', side: yawRate >= 0 ? 1 : -1, vertical: 1 };
    if (ax > ay * 1.5) return { kind: 'horizontal', side: yawRate >= 0 ? 1 : -1, vertical: 1 };
    return { kind: 'diagonal', side: yawRate >= 0 ? 1 : -1, vertical: pitchRate >= 0 ? 1 : -1 };
  }

  beginStrike(yawRate, pitchRate) {
    this.strike = this.classify(yawRate, pitchRate);
    this.strikeJointTargets = strikeTargets(this.strike.kind, this.strike.side, this.strike.vertical);
    this.phase = 'load';
    this.phaseTime = 0;
    this.didStep = false;
  }

  progress() { return clamp(this.phaseTime / (PHASES[this.phase] || 1), 0, 1); }

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
      this.strikeJointTargets = null;
      this.cooldown = 0.09;
      this.didStep = false;
    }
  }

  dynamicGuard(control) {
    const yaw = clamp(control.lookYawRate || 0, -3.2, 3.2);
    const pitch = clamp(control.lookPitchRate || 0, -3.0, 3.0);
    this.guardBias.yaw += ((yaw * -0.028) - this.guardBias.yaw) * 0.12;
    this.guardBias.pitch += ((pitch * 0.035) - this.guardBias.pitch) * 0.12;
    return {
      ...GUARD_JOINTS,
      shoulderYaw: GUARD_JOINTS.shoulderYaw + this.guardBias.yaw,
      shoulderPitch: GUARD_JOINTS.shoulderPitch + this.guardBias.pitch,
      wristYaw: GUARD_JOINTS.wristYaw + this.guardBias.yaw * 0.7,
      wristPitch: GUARD_JOINTS.wristPitch + this.guardBias.pitch * 0.8
    };
  }

  muscleTarget(control) {
    const guard = this.dynamicGuard(control);
    if (this.phase === 'idle' || !this.strikeJointTargets) return { target: guard, activation: 0.94, coil: 0 };
    const t = this.progress();
    const side = this.strike?.side || 1;
    if (this.phase === 'load') return { target: blendJointTargets(guard, this.strikeJointTargets.load, t), activation: 1.08, coil: 0.20 * side * smoothstep(t) };
    if (this.phase === 'strike') return { target: blendJointTargets(this.strikeJointTargets.load, this.strikeJointTargets.strike, t), activation: 1.34, coil: 0.20 * side * (1 - t) - 0.12 * side * t };
    if (this.phase === 'follow') return { target: blendJointTargets(this.strikeJointTargets.strike, this.strikeJointTargets.follow, t), activation: 0.82, coil: -0.12 * side - 0.09 * side * smoothstep(t) };
    return { target: blendJointTargets(this.strikeJointTargets.follow, guard, t), activation: 0.92, coil: -0.21 * side * (1 - smoothstep(t)) };
  }

  shieldIntent(player, enemy) {
    const basis = basisFromYaw(player.upperYaw);
    let threatSide = -0.12; let threatHeight = 0.04; let danger = 0;
    if (enemy && !enemy.dead) {
      const trace = enemy.getSwordTrace();
      const rel = trace.tip.subtract(player.bones.chest.getAbsolutePosition());
      threatSide = clamp(Vector3.Dot(rel, basis.right) * 0.21, -0.28, 0.12);
      threatHeight = clamp(rel.y * 0.22, -0.18, 0.26);
      danger = clamp((trace.speed - 2.0) / 5.2, 0, 1) * clamp((3.25 - Vector3.Distance(trace.tip, player.position)) / 1.7, 0, 1);
    }
    const committed = this.phase === 'strike' || this.phase === 'follow';
    return {
      shieldPose: {
        x: clamp(-0.23 + threatSide * (0.52 + danger * 0.48), -0.40, -0.10),
        y: clamp(0.01 + threatHeight * (0.46 + danger * 0.54) + (committed ? 0.055 : 0), -0.16, 0.30),
        z: clamp(0.42 + danger * 0.11 - (committed ? 0.045 : 0), 0.39, 0.55)
      },
      shieldNormal: {
        x: clamp(threatSide * 0.46, -0.25, 0.18),
        y: clamp(threatHeight * 0.34, -0.19, 0.21),
        z: 1
      }
    };
  }

  transform(control, dt, player, enemy) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const yawRate = control.lookYawRate || 0;
    const pitchRate = control.lookPitchRate || 0;
    const energy = Math.hypot(yawRate, pitchRate);
    const acceleration = Math.hypot(yawRate - this.lastYawRate, pitchRate - this.lastPitchRate) / Math.max(dt, 1 / 120);
    this.lastYawRate = yawRate;
    this.lastPitchRate = pitchRate;

    if (this.phase === 'idle' && this.cooldown <= 0 && energy > 2.8 && acceleration > 12 && player.stamina > 12) {
      this.beginStrike(yawRate, pitchRate);
      player.stamina = Math.max(0, player.stamina - 8);
    }

    this.advance(dt);
    const drive = this.muscleTarget(control);
    this.lastPose = this.arm.step(drive.target, dt, drive.activation);

    if (this.phase === 'strike' && !this.didStep && this.progress() > 0.22) {
      const distance = enemy ? Vector3.Distance(player.position, enemy.position) : 99;
      if (distance > 1.30 && distance < 2.60) player.velocity.addInPlace(basisFromYaw(player.bodyYaw).forward.scale(0.52));
      this.didStep = true;
    }

    return {
      ...control,
      lookYaw: (control.lookYaw || 0) + drive.coil,
      weaponPose: this.lastPose.hand,
      weaponDir: this.lastPose.blade,
      ...this.shieldIntent(player, enemy)
    };
  }

  seedRigidChain(player, transformed, dt) {
    if (!this.lastPose || !player?.bones?.shoulderR) return;
    const shoulder = player.bones.shoulderR.getAbsolutePosition();
    const basis = basisFromYaw(transformed.lookYaw ?? player.upperYaw);
    const hand = shoulder
      .add(basis.right.scale(this.lastPose.hand.x))
      .add(new Vector3(0, this.lastPose.hand.y, 0))
      .add(basis.forward.scale(this.lastPose.hand.z));
    player.rightHand.position.copyFrom(hand);
    player.rightHand.velocity.scaleInPlace(0.18);

    const blade = basis.right.scale(this.lastPose.blade.x)
      .add(new Vector3(0, this.lastPose.blade.y, 0))
      .add(basis.forward.scale(this.lastPose.blade.z));
    if (blade.lengthSquared() > 1e-7) blade.normalize();
    player.swordDirection.position.copyFrom(blade);
    player.swordDirection.velocity.scaleInPlace(0.22);
  }

  onContact(event) {
    if (event.type === 'hit' && event.attacker === this.game.player && this.phase === 'follow') this.phaseTime += 0.05;
    if (event.type === 'block' && event.attacker === this.game.player) {
      this.phase = 'recover';
      this.phaseTime = 0;
      for (const joint of Object.values(this.arm.joints)) joint.velocity *= -0.22;
    }
    if (event.type === 'clash' && (event.a === this.game.player || event.b === this.game.player)) {
      for (const joint of Object.values(this.arm.joints)) joint.velocity *= 0.58;
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
    const ta = a.getSwordTrace(); const tb = b.getSwordTrace();
    const close = segmentDistanceSquared(ta.base, ta.tip, tb.base, tb.tip) < 0.0105;
    const relativeSpeed = Math.abs(ta.speed - tb.speed);
    if (!bind && close && relativeSpeed < 4.4 && ta.speed > 0.55 && tb.speed > 0.55) {
      bind = { time: 0.30, a, b };
      game.audio?.clash(0.44);
      game.kickCamera?.(-0.009, 0, 0.006);
    }
    if (bind && bind.a === a && bind.b === b) {
      bind.time -= dt;
      const delta = tb.tip.subtract(ta.tip); const distance = delta.length();
      if (distance > 1e-5) {
        const normal = delta.scale(1 / distance);
        const pressure = clamp((0.19 - distance) * 8.5, 0, 1.25);
        a.applyWeaponImpulse(normal.scale(pressure * 0.22));
        b.applyWeaponImpulse(normal.scale(-pressure * 0.22));
        a.stability = Math.max(0, a.stability - pressure * dt * 4.8);
        b.stability = Math.max(0, b.stability - pressure * dt * 4.8);
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
    if (hitStop > 0) { hitStop -= dt; return; }
    if (!installed && game.player && game.enemy && game.input && game.combat) {
      installed = true;
      const originalPlayerUpdate = game.player.update.bind(game.player);
      game.player.update = (stepDt, control, snap = false) => {
        const transformed = snap ? control : intent.transform(control, stepDt, game.player, game.enemy);
        if (!snap) intent.seedRigidChain(game.player, transformed, stepDt);
        originalPlayerUpdate(stepDt, transformed, snap);
        if (!snap && intent.lastPose) applyBladeRoll(game.player, intent.lastPose.roll);
      };
      installSwordBind(game);
    }
    originalUpdate(dt, nowSeconds);
  };

  game.handleCombatEvent = (event) => {
    intent.onContact(event);
    if (event.type === 'hit') hitStop = Math.max(hitStop, 0.040 + (event.intensity || 0) * 0.020);
    else if (event.type === 'clash') hitStop = Math.max(hitStop, 0.026 + (event.intensity || 0) * 0.013);
    else if (event.type === 'block') hitStop = Math.max(hitStop, 0.018 + (event.intensity || 0) * 0.011);
    originalHandle(event);
  };

  if (originalRestart) game.restart = (...args) => { intent.reset(); hitStop = 0; return originalRestart(...args); };
  return intent;
}
