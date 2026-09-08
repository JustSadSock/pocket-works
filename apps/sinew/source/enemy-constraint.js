import { Quaternion, Vector3 } from '@babylonjs/core';
import { clamp } from './core.js';
import { ConstraintArm, vec3 } from './constraint-model.js';

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);

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
function normalizedLocal(value, fallback = { x: 0, y: 0, z: 1 }) {
  const x = value?.x ?? fallback.x;
  const y = value?.y ?? fallback.y;
  const z = value?.z ?? fallback.z;
  const length = Math.hypot(x, y, z) || 1;
  return vec3(x / length, y / length, z / length);
}

class EnemyConstraintBody {
  constructor(game) {
    this.game = game;
    this.enemy = game.enemy;
    this.weapon = new ConstraintArm({
      upper: .34,
      lower: .33,
      tool: 1.04,
      handed: 1,
      restHand: vec3(.10, -.18, .36),
      restTool: vec3(.10, .54, .84)
    });
    this.shield = new ConstraintArm({
      upper: .33,
      lower: .32,
      tool: .075,
      handed: -1,
      restHand: vec3(-.18, -.18, .42),
      restTool: vec3(-.10, -.02, .99)
    });
    this.lastWeaponTarget = vec3(.10, -.18, .36);
    this.lastShieldTarget = vec3(-.18, -.18, .42);
    this.prevSwordBase = null;
    this.prevSwordTip = null;
    this.prevShieldCenter = null;
    this.prevShieldNormal = null;
    this.weaponBarrier = null;
    this.shieldBarrier = null;
    this.patchContacts();
  }

  reset() {
    this.weapon.reset(vec3());
    this.shield.reset(vec3());
    this.lastWeaponTarget = vec3(.10, -.18, .36);
    this.lastShieldTarget = vec3(-.18, -.18, .42);
    this.prevSwordBase = this.prevSwordTip = this.prevShieldCenter = this.prevShieldNormal = null;
    this.weaponBarrier = null;
    this.shieldBarrier = null;
  }

  patchContacts() {
    const e = this.enemy;
    const oldWeaponImpulse = e.applyWeaponImpulse.bind(e);
    const oldShieldImpulse = e.applyShieldImpulse.bind(e);
    e.applyWeaponImpulse = (impulse) => {
      oldWeaponImpulse(impulse);
      const frame = basis(e.upperYaw);
      const local = toLocal(impulse, frame);
      this.weapon.impulse(vec3(local.x, local.y, local.z), .040);
    };
    e.applyShieldImpulse = (impulse) => {
      oldShieldImpulse(impulse);
      const frame = basis(e.upperYaw);
      const local = toLocal(impulse, frame);
      this.shield.impulse(vec3(local.x, local.y, local.z), .034);
    };
    e.applyWeaponContact = ({ normal, penetration = .04, bladeT = .8 }) => {
      const frame = basis(e.upperYaw);
      const local = toLocal(normal, frame);
      this.weaponBarrier = { normal: vec3(local.x, local.y, local.z), bladeT, life: .10 };
      const pose = this.weapon.contact(this.weaponBarrier.normal, penetration, bladeT);
      this.applyWeaponPose(pose, e.bones.shoulderR.getAbsolutePosition(), frame, 1 / 120);
    };
    e.applyShieldContact = ({ normal, penetration = .03 }) => {
      const frame = basis(e.upperYaw);
      const local = toLocal(normal, frame);
      this.shieldBarrier = { normal: vec3(local.x, local.y, local.z), life: .08 };
      const pose = this.shield.contact(this.shieldBarrier.normal, penetration, .72);
      const currentNormal = normalizedLocal({
        x: Vector3.Dot(e.shield.normal, frame.right),
        y: e.shield.normal.y,
        z: Vector3.Dot(e.shield.normal, frame.forward)
      }, { x: .12, y: -.05, z: 1 });
      this.applyShieldPose(pose, e.bones.shoulderL.getAbsolutePosition(), frame, currentNormal);
    };
  }

  drive(control, dt) {
    const e = this.enemy;
    const frame = basis(e.upperYaw);
    const shoulderR = e.bones.shoulderR.getAbsolutePosition();
    const shoulderL = e.bones.shoulderL.getAbsolutePosition();

    const weaponTarget = vec3(control.weaponPose?.x ?? .10, control.weaponPose?.y ?? -.18, control.weaponPose?.z ?? .36);
    const weaponDir = normalizedLocal(control.weaponDir, { x: .10, y: .54, z: .84 });
    const guardTip = vec3(
      weaponTarget.x + weaponDir.x * 1.04,
      weaponTarget.y + weaponDir.y * 1.04,
      weaponTarget.z + weaponDir.z * 1.04
    );
    const targetDelta = vec3(
      weaponTarget.x - this.lastWeaponTarget.x,
      weaponTarget.y - this.lastWeaponTarget.y,
      weaponTarget.z - this.lastWeaponTarget.z
    );
    this.lastWeaponTarget = { ...weaponTarget };
    let weaponDrive = vec3(targetDelta.x * 21, targetDelta.y * 21, targetDelta.z * 21);
    if (this.weaponBarrier) {
      this.weaponBarrier.life -= dt;
      const n = this.weaponBarrier.normal;
      const into = weaponDrive.x * n.x + weaponDrive.y * n.y + weaponDrive.z * n.z;
      if (into < 0) weaponDrive = vec3(weaponDrive.x - n.x * into, weaponDrive.y - n.y * into, weaponDrive.z - n.z * into);
      if (this.weaponBarrier.life <= 0) this.weaponBarrier = null;
    }
    let weaponPose = this.weapon.step({
      shoulder: vec3(),
      guardHand: weaponTarget,
      guardTip,
      drive: weaponDrive,
      brace: .76,
      dt,
      iterations: 10
    });
    if (this.weaponBarrier) weaponPose = this.weapon.contact(this.weaponBarrier.normal, .006, this.weaponBarrier.bladeT);

    const shieldTarget = vec3(control.shieldPose?.x ?? -.18, control.shieldPose?.y ?? -.18, control.shieldPose?.z ?? .42);
    const shieldNormal = normalizedLocal(control.shieldNormal, { x: .12, y: -.05, z: 1 });
    const shieldCenter = vec3(
      shieldTarget.x + shieldNormal.x * .075,
      shieldTarget.y + shieldNormal.y * .075,
      shieldTarget.z + shieldNormal.z * .075
    );
    const shieldDelta = vec3(
      shieldTarget.x - this.lastShieldTarget.x,
      shieldTarget.y - this.lastShieldTarget.y,
      shieldTarget.z - this.lastShieldTarget.z
    );
    this.lastShieldTarget = { ...shieldTarget };
    let shieldDrive = vec3(shieldDelta.x * 16, shieldDelta.y * 16, shieldDelta.z * 16);
    if (this.shieldBarrier) {
      this.shieldBarrier.life -= dt;
      const n = this.shieldBarrier.normal;
      const into = shieldDrive.x * n.x + shieldDrive.y * n.y + shieldDrive.z * n.z;
      if (into < 0) shieldDrive = vec3(shieldDrive.x - n.x * into, shieldDrive.y - n.y * into, shieldDrive.z - n.z * into);
      if (this.shieldBarrier.life <= 0) this.shieldBarrier = null;
    }
    let shieldPose = this.shield.step({
      shoulder: vec3(),
      guardHand: shieldTarget,
      guardTip: shieldCenter,
      drive: shieldDrive,
      brace: .94,
      dt,
      iterations: 11
    });
    if (this.shieldBarrier) shieldPose = this.shield.contact(this.shieldBarrier.normal, .004, .72);

    this.applyWeaponPose(weaponPose, shoulderR, frame, dt);
    this.applyShieldPose(shieldPose, shoulderL, frame, shieldNormal);
  }

  applyWeaponPose(pose, shoulder, frame, dt) {
    const e = this.enemy;
    const elbow = toWorld(pose.elbow, shoulder, frame);
    const hand = toWorld(pose.hand, shoulder, frame);
    const tip = toWorld(pose.tip, shoulder, frame);
    e.bones.elbowR.setAbsolutePosition(elbow);
    e.bones.handR.setAbsolutePosition(hand);
    e.rightHand.position.copyFrom(hand);
    setSegment(e.meshes.upperArmR, shoulder, elbow);
    setSegment(e.meshes.forearmR, elbow, hand);

    const dir = tip.subtract(hand).normalize();
    const lastBase = this.prevSwordBase?.clone() ?? hand.clone();
    const lastTip = this.prevSwordTip?.clone() ?? tip.clone();
    e.sword.prevBase.copyFrom(lastBase);
    e.sword.prevTip.copyFrom(lastTip);
    e.sword.base.copyFrom(hand);
    e.sword.tip.copyFrom(tip);
    this.prevSwordBase = hand.clone();
    this.prevSwordTip = tip.clone();
    e.swordDirection.position.copyFrom(dir);
    const safeDt = Math.max(dt, 1 / 240);
    const baseVelocity = hand.subtract(lastBase).scale(1 / safeDt);
    const tipVelocity = tip.subtract(lastTip).scale(1 / safeDt);
    e.sword.speed = tipVelocity.length();
    e.sword.angularSpeed = tipVelocity.subtract(baseVelocity).length() / e.sword.length;

    setSegment(e.meshes.blade, hand.add(dir.scale(.10)), tip, AXIS_Z);
    setSegment(e.meshes.grip, hand.subtract(dir.scale(.18)), hand, AXIS_Y);
    e.meshes.guard.position.copyFrom(hand.add(dir.scale(.015)));
    e.meshes.guard.rotationQuaternion = quatAxisTo(AXIS_Z, dir);
  }

  applyShieldPose(pose, shoulder, frame, targetNormal) {
    const e = this.enemy;
    const elbow = toWorld(pose.elbow, shoulder, frame);
    const hand = toWorld(pose.hand, shoulder, frame);
    const center = toWorld(pose.tip, shoulder, frame);
    e.bones.elbowL.setAbsolutePosition(elbow);
    e.bones.handL.setAbsolutePosition(hand);
    e.leftHand.position.copyFrom(hand);
    setSegment(e.meshes.upperArmL, shoulder, elbow);
    setSegment(e.meshes.forearmL, elbow, hand);

    const normal = frame.right.scale(targetNormal.x)
      .add(new Vector3(0, targetNormal.y, 0))
      .add(frame.forward.scale(targetNormal.z))
      .normalize();
    const lastCenter = this.prevShieldCenter?.clone() ?? center.clone();
    const lastNormal = this.prevShieldNormal?.clone() ?? normal.clone();
    e.shield.prevCenter.copyFrom(lastCenter);
    e.shield.prevNormal.copyFrom(lastNormal);
    e.shield.center.copyFrom(center);
    e.shield.normal.copyFrom(normal);
    this.prevShieldCenter = center.clone();
    this.prevShieldNormal = normal.clone();
    e.shieldNormal.position.copyFrom(normal);
    const rotation = quatAxisTo(AXIS_Y, normal);
    e.meshes.shield.position.copyFrom(center);
    e.meshes.shield.rotationQuaternion = rotation;
    e.meshes.shieldRim.position.copyFrom(center.add(normal.scale(.045)));
    e.meshes.shieldRim.rotationQuaternion = rotation;
    e.meshes.shieldBoss.position.copyFrom(center.add(normal.scale(.075)));
  }
}

export function installEnemyConstraintCombat(game) {
  const body = new EnemyConstraintBody(game);
  const originalUpdate = game.enemy.update.bind(game.enemy);
  const originalReset = game.enemy.reset.bind(game.enemy);
  game.enemy.update = (dt, control, snap = false) => {
    originalUpdate(dt, control, snap);
    if (snap) body.reset();
    else body.drive(control, dt);
  };
  game.enemy.reset = (...args) => {
    const result = originalReset(...args);
    body.reset();
    return result;
  };
  body.reset();
  return body;
}
