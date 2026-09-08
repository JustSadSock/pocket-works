import { Quaternion, Vector3 } from '@babylonjs/core';
import { clamp } from './core.js';
import { ConstraintArm, vec3 } from './constraint-model.js';

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);
const PLAYER_GUARD = {
  hand: vec3(.17, -.19, .43),
  tip: vec3(.28, .43, 1.25),
  shieldHand: vec3(-.17, -.16, .45),
  shieldCenter: vec3(-.27, -.15, .58)
};

function basis(yaw) {
  return {
    forward: new Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
    right: new Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  };
}
function quatAxisTo(axis, direction) {
  const dir = direction.normalizeToNew();
  const dot = clamp(Vector3.Dot(axis, dir), -1, 1);
  if (dot > .999999) return Quaternion.Identity();
  if (dot < -.999999) return Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI);
  const cross = Vector3.Cross(axis, dir);
  if (cross.lengthSquared() < 1e-8) return Quaternion.Identity();
  cross.normalize();
  return Quaternion.RotationAxis(cross, Math.acos(dot));
}
function setSegment(mesh, a, b, axis = AXIS_Y) {
  const delta = b.subtract(a);
  const length = Math.max(.001, delta.length());
  mesh.position.copyFrom(a.add(b).scale(.5));
  mesh.rotationQuaternion = quatAxisTo(axis, delta);
  if (axis === AXIS_Y) mesh.scaling.set(1, length, 1);
  else mesh.scaling.set(1, 1, length);
}
function toWorld(local, origin, frame) {
  return origin.add(frame.right.scale(local.x)).add(new Vector3(0, local.y, 0)).add(frame.forward.scale(local.z));
}
function toLocal(world, frame) {
  return vec3(Vector3.Dot(world, frame.right), world.y, Vector3.Dot(world, frame.forward));
}

class PhysicalUpperBody {
  constructor(game) {
    this.game = game;
    this.player = game.player;
    this.weapon = new ConstraintArm({ upper: .34, lower: .33, tool: 1.04, handed: 1, restHand: PLAYER_GUARD.hand, restTool: vec3(.10, .58, .80) });
    this.shield = new ConstraintArm({ upper: .33, lower: .32, tool: .075, handed: -1, restHand: PLAYER_GUARD.shieldHand, restTool: vec3(-.18, .05, .98) });
    this.prevSwordBase = null;
    this.prevSwordTip = null;
    this.prevShieldCenter = null;
    this.prevShieldNormal = null;
    this.lastGesture = { x: 0, y: 0 };
    this.breathPhase = Math.random() * Math.PI * 2;
    this.reset();
    this.patchImpulses();
  }

  reset() {
    this.weapon.reset(vec3());
    this.shield.reset(vec3());
    this.prevSwordBase = this.prevSwordTip = this.prevShieldCenter = this.prevShieldNormal = null;
    this.lastGesture = { x: 0, y: 0 };
  }

  patchImpulses() {
    const p = this.player;
    const oldWeapon = p.applyWeaponImpulse.bind(p);
    const oldShield = p.applyShieldImpulse.bind(p);
    p.applyWeaponImpulse = (impulse) => {
      oldWeapon(impulse);
      const frame = basis(p.upperYaw);
      const local = toLocal(impulse, frame);
      this.weapon.impulse(vec3(local.x, local.y, local.z), .040);
    };
    p.applyShieldImpulse = (impulse) => {
      oldShield(impulse);
      const frame = basis(p.upperYaw);
      const local = toLocal(impulse, frame);
      this.shield.impulse(vec3(local.x, local.y, local.z), .034);
    };
    p.applyWeaponContact = ({ normal, penetration = .04, bladeT = .8 }) => {
      const frame = basis(p.upperYaw);
      const local = toLocal(normal, frame);
      const pose = this.weapon.contact(vec3(local.x, local.y, local.z), penetration, bladeT);
      this.applyWeaponPose(pose, p.bones.shoulderR.getAbsolutePosition(), frame, 1 / 120);
    };
    p.applyShieldContact = ({ normal, penetration = .03 }) => {
      const frame = basis(p.upperYaw);
      const local = toLocal(normal, frame);
      const pose = this.shield.contact(vec3(local.x, local.y, local.z), penetration, .7);
      this.applyShieldPose(pose, p.bones.shoulderL.getAbsolutePosition(), frame, 1 / 120);
    };
  }

  drive(control, dt) {
    const p = this.player;
    const frame = basis(p.upperYaw);
    const shoulderR = p.bones.shoulderR.getAbsolutePosition();
    const shoulderL = p.bones.shoulderL.getAbsolutePosition();
    const gy = control.gestureYawRate ?? control.lookYawRate ?? 0;
    const gp = control.gesturePitchRate ?? control.lookPitchRate ?? 0;
    const gestureEnergy = clamp(Math.hypot(gy, gp) / 10.5, 0, 1);
    const deltaX = gy - this.lastGesture.x;
    const deltaY = gp - this.lastGesture.y;
    this.lastGesture = { x: gy, y: gp };
    const snap = clamp(Math.hypot(deltaX, deltaY) / 6.4, 0, 1);
    const inputPose = this.game.input?.pose || { x: 0, y: 0 };
    const poseX = clamp(inputPose.x || 0, -1, 1);
    const poseY = clamp(inputPose.y || 0, -1, 1);

    this.breathPhase += dt * (1.7 + gestureEnergy * .8);
    const breath = Math.sin(this.breathPhase);
    const moving = clamp(control.moveMagnitude || 0, 0, 1);
    const aimPitch = clamp(control.lookPitch || 0, -.68, .72);
    const verticalWorkspace = clamp(aimPitch * .78 + poseY * .72, -1, 1);
    const lateralWorkspace = poseX;

    const guardHand = vec3(
      PLAYER_GUARD.hand.x + lateralWorkspace * .14,
      clamp(PLAYER_GUARD.hand.y + verticalWorkspace * .48 + breath * .006 - moving * .012, -.60, .34),
      PLAYER_GUARD.hand.z - Math.abs(lateralWorkspace) * .04 - moving * .018
    );
    const guardTip = vec3(
      PLAYER_GUARD.tip.x + lateralWorkspace * .34 + breath * .008,
      clamp(PLAYER_GUARD.tip.y + verticalWorkspace * .90 + breath * .012, -.78, 1.14),
      PLAYER_GUARD.tip.z - Math.max(0, -verticalWorkspace) * .24
    );
    const drive = vec3(
      -gy * (.78 + .48 * snap),
      gp * (1.06 + .58 * snap),
      gestureEnergy * (1.15 + .65 * snap)
    );
    const weaponPose = this.weapon.step({
      shoulder: vec3(),
      guardHand,
      guardTip,
      drive,
      brace: .70 - gestureEnergy * .27,
      dt,
      iterations: 10
    });

    let threat = vec3();
    let danger = 0;
    const enemy = this.game.enemy;
    if (enemy && !enemy.dead) {
      const trace = enemy.getSwordTrace();
      const rel = trace.tip.subtract(p.bones.chest.getAbsolutePosition());
      const distance = rel.length();
      danger = clamp((trace.speed - 1.7) / 6, 0, 1) * clamp((3.0 - distance) / 1.5, 0, 1);
      threat = vec3(-Vector3.Dot(rel, frame.right) * danger * 2.2, (rel.y - .2) * danger * 1.35, danger * 1.45);
    }

    const shieldX = clamp(-.28 + lateralWorkspace * .27, -.49, -.10);
    const shieldY = clamp(-.17 + verticalWorkspace * .66, -.65, .48);
    const shieldDrive = vec3(threat.x - gy * .09, threat.y + gp * .17, threat.z);
    const shieldGuardHand = vec3(
      clamp(-.19 + lateralWorkspace * .16, -.38, -.03),
      clamp(-.18 + verticalWorkspace * .58 + breath * .004, -.58, .43),
      .45
    );
    const shieldGuardCenter = vec3(
      shieldX,
      shieldY + breath * .005,
      .58 + danger * .04 + Math.max(0, verticalWorkspace) * .04
    );
    const shieldPose = this.shield.step({
      shoulder: vec3(),
      guardHand: shieldGuardHand,
      guardTip: shieldGuardCenter,
      drive: shieldDrive,
      brace: .92 - danger * .08,
      dt,
      iterations: 11
    });

    this.applyWeaponPose(weaponPose, shoulderR, frame, dt);
    this.applyShieldPose(shieldPose, shoulderL, frame, dt, lateralWorkspace, verticalWorkspace);

    if (gestureEnergy > .08) {
      p.impactLeanVelocity.addInPlace(frame.right.scale(-deltaX * .0019));
      p.impactLeanVelocity.y += -deltaY * .0009;
      p.impactLeanVelocity.addInPlace(frame.forward.scale(gestureEnergy * dt * .012));
      p.stability = Math.max(0, p.stability - gestureEnergy * dt * 1.8);
    }
  }

  applyWeaponPose(pose, shoulder, frame, dt) {
    const w = this.player;
    const elbow = toWorld(pose.elbow, shoulder, frame);
    const hand = toWorld(pose.hand, shoulder, frame);
    const tip = toWorld(pose.tip, shoulder, frame);
    w.bones.elbowR.setAbsolutePosition(elbow);
    w.bones.handR.setAbsolutePosition(hand);
    w.rightHand.position.copyFrom(hand);
    setSegment(w.meshes.upperArmR, shoulder, elbow);
    setSegment(w.meshes.forearmR, elbow, hand);

    const dir = tip.subtract(hand).normalize();
    const lastBase = this.prevSwordBase?.clone() ?? hand.clone();
    const lastTip = this.prevSwordTip?.clone() ?? tip.clone();
    w.sword.prevBase.copyFrom(lastBase);
    w.sword.prevTip.copyFrom(lastTip);
    w.sword.base.copyFrom(hand);
    w.sword.tip.copyFrom(tip);
    this.prevSwordBase = hand.clone();
    this.prevSwordTip = tip.clone();
    w.swordDirection.position.copyFrom(dir);
    const safeDt = Math.max(dt, 1 / 240);
    const baseVelocity = hand.subtract(lastBase).scale(1 / safeDt);
    const tipVelocity = tip.subtract(lastTip).scale(1 / safeDt);
    w.sword.speed = tipVelocity.length();
    w.sword.angularSpeed = tipVelocity.subtract(baseVelocity).length() / w.sword.length;

    setSegment(w.meshes.blade, hand.add(dir.scale(.10)), tip, AXIS_Z);
    setSegment(w.meshes.grip, hand.subtract(dir.scale(.18)), hand, AXIS_Y);
    w.meshes.guard.position.copyFrom(hand.add(dir.scale(.015)));
    w.meshes.guard.rotationQuaternion = quatAxisTo(AXIS_Z, dir);
    const roll = clamp((pose.tip.x - pose.hand.x) * -.55 + (pose.tip.y - pose.hand.y) * .32, -.85, .85);
    const q = Quaternion.RotationAxis(dir, roll);
    w.meshes.blade.rotationQuaternion = q.multiply(w.meshes.blade.rotationQuaternion);
    w.meshes.guard.rotationQuaternion = q.multiply(w.meshes.guard.rotationQuaternion);
  }

  applyShieldPose(pose, shoulder, frame, dt, workspaceX = 0, workspaceY = 0) {
    const w = this.player;
    let elbow = toWorld(pose.elbow, shoulder, frame);
    let hand = toWorld(pose.hand, shoulder, frame);
    let center = toWorld(pose.tip, shoulder, frame);

    // Camera-safe corridor is enforced after the constraint solve. The previous
    // pre-solve safety target could be overwritten by contact/drive impulses,
    // allowing the 90 cm shield to sit almost on the near plane.
    const head = w.bones.head.getAbsolutePosition();
    const rel = center.subtract(head);
    let lateral = Vector3.Dot(rel, frame.right);
    let forward = Vector3.Dot(rel, frame.forward);
    const vertical = clamp(rel.y, -.72, .18);
    lateral = clamp(lateral, -.68, -.20);
    forward = Math.max(.62, forward);
    const safeCenter = head.add(frame.right.scale(lateral)).add(frame.forward.scale(forward)).add(new Vector3(0, vertical, 0));
    const correction = safeCenter.subtract(center);
    center = safeCenter;
    hand = hand.add(correction.scale(.72));
    elbow = elbow.add(correction.scale(.32));

    w.bones.elbowL.setAbsolutePosition(elbow);
    w.bones.handL.setAbsolutePosition(hand);
    w.leftHand.position.copyFrom(hand);
    setSegment(w.meshes.upperArmL, shoulder, elbow);
    setSegment(w.meshes.forearmL, elbow, hand);

    const normal = frame.forward.scale(.90)
      .add(frame.right.scale(.10 + workspaceX * .16))
      .add(new Vector3(0, clamp(-workspaceY * .13 + (center.y - shoulder.y) * -.07, -.18, .18), 0))
      .normalize();
    const lastCenter = this.prevShieldCenter?.clone() ?? center.clone();
    const lastNormal = this.prevShieldNormal?.clone() ?? normal.clone();
    w.shield.prevCenter.copyFrom(lastCenter);
    w.shield.prevNormal.copyFrom(lastNormal);
    w.shield.center.copyFrom(center);
    w.shield.normal.copyFrom(normal);
    this.prevShieldCenter = center.clone();
    this.prevShieldNormal = normal.clone();
    w.shieldNormal.position.copyFrom(normal);

    const rot = quatAxisTo(AXIS_Y, normal);
    w.meshes.shield.position.copyFrom(center);
    w.meshes.shield.rotationQuaternion = rot;
    w.meshes.shieldRim.position.copyFrom(center.add(normal.scale(.045)));
    w.meshes.shieldRim.rotationQuaternion = rot;
    w.meshes.shieldBoss.position.copyFrom(center.add(normal.scale(.075)));
  }
}

export function installConstraintCombat(game) {
  const body = new PhysicalUpperBody(game);
  const originalUpdate = game.update.bind(game);
  const originalRestart = game.restart?.bind(game);
  const originalHandle = game.handleCombatEvent.bind(game);
  let hitStop = 0;
  const originalPlayerUpdate = game.player.update.bind(game.player);

  game.player.update = (dt, control, snap = false) => {
    originalPlayerUpdate(dt, control, snap);
    if (snap) body.reset();
    else body.drive(control, dt);
  };
  game.update = (dt, now) => {
    if (hitStop > 0) { hitStop -= dt; return; }
    originalUpdate(dt, now);
  };
  game.handleCombatEvent = (event) => {
    if (event.type === 'hit') hitStop = Math.max(hitStop, .032 + (event.intensity || 0) * .018);
    else if (event.type === 'clash') hitStop = Math.max(hitStop, .018 + (event.intensity || 0) * .012);
    else if (event.type === 'block') hitStop = Math.max(hitStop, .014 + (event.intensity || 0) * .010);
    originalHandle(event);
  };
  if (originalRestart) game.restart = (...args) => { body.reset(); hitStop = 0; return originalRestart(...args); };
  return body;
}
