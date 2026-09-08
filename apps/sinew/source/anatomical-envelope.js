import { Quaternion, Vector3 } from '@babylonjs/core';
import { clamp } from './core.js';

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
  if (!mesh) return;
  const delta = b.subtract(a);
  mesh.position.copyFrom(a.add(b).scale(.5));
  mesh.rotationQuaternion = quatAxisTo(axis, delta);
  if (axis === AXIS_Z) mesh.scaling.set(1, 1, Math.max(.001, delta.length()));
  else mesh.scaling.set(1, Math.max(.001, delta.length()), 1);
}

function localPoint(point, origin, frame) {
  const rel = point.subtract(origin);
  return {
    x: Vector3.Dot(rel, frame.right),
    y: rel.y,
    z: Vector3.Dot(rel, frame.forward)
  };
}

function worldPoint(local, origin, frame) {
  return origin
    .add(frame.right.scale(local.x))
    .add(new Vector3(0, local.y, 0))
    .add(frame.forward.scale(local.z));
}

function alignFallbackSword(player) {
  const base = player.sword.base;
  const tip = player.sword.tip;
  const dir = tip.subtract(base).normalize();
  setSegment(player.meshes.blade, base.add(dir.scale(.10)), tip, AXIS_Z);
  setSegment(player.meshes.grip, base.subtract(dir.scale(.18)), base, AXIS_Y);
  if (player.meshes.guard) {
    player.meshes.guard.position.copyFrom(base.add(dir.scale(.015)));
    player.meshes.guard.rotationQuaternion = quatAxisTo(AXIS_Z, dir);
  }
}

/**
 * Final anatomical envelope for the first-person rig.
 * ConstraintArm owns motion and collision. This layer only rejects poses that
 * would require the player's real shoulder/forearm to pass through the head or
 * that would park a weapon in the central phone viewport.
 */
export function installAnatomicalEnvelope(game) {
  const player = game.player;
  const originalUpdate = player.update.bind(player);
  let previousTip = player.sword.tip.clone();
  let previousShield = player.shield.center.clone();
  let centerIntrusion = 0;
  let shieldIntrusion = 0;

  player.update = (dt, control, snap = false) => {
    originalUpdate(dt, control, snap);
    if (snap) {
      previousTip.copyFrom(player.sword.tip);
      previousShield.copyFrom(player.shield.center);
      return;
    }

    const frame = basis(player.upperYaw);
    const head = player.bones.head.getAbsolutePosition();
    const shoulderR = player.bones.shoulderR.getAbsolutePosition();
    const shoulderL = player.bones.shoulderL.getAbsolutePosition();

    // Sword: keep the hilt clearly on the right side in neutral/low-energy
    // poses. Fast gestures remain free to cross the centre during an attack.
    const energy = clamp((control.gestureEnergy ?? Math.hypot(control.gestureYawRate || 0, control.gesturePitchRate || 0) / 10.5), 0, 1);
    const baseLocal = localPoint(player.sword.base, head, frame);
    const tipLocal = localPoint(player.sword.tip, head, frame);
    const minBaseX = .19 - energy * .23;
    const minBaseZ = .38;
    const swordCorrection = {
      x: Math.max(0, minBaseX - baseLocal.x),
      z: Math.max(0, minBaseZ - baseLocal.z)
    };
    centerIntrusion = clamp((.18 - Math.abs(tipLocal.x)) / .18, 0, 1)
      * clamp((.82 - tipLocal.z) / .52, 0, 1)
      * (1 - energy * .72);
    swordCorrection.x += centerIntrusion * .12;

    if (swordCorrection.x > .0001 || swordCorrection.z > .0001) {
      const correction = frame.right.scale(swordCorrection.x).add(frame.forward.scale(swordCorrection.z));
      player.sword.base.addInPlace(correction);
      player.sword.tip.addInPlace(correction);
      const hand = player.bones.handR.getAbsolutePosition().add(correction);
      const elbow = player.bones.elbowR.getAbsolutePosition().add(correction.scale(.44));
      player.bones.handR.setAbsolutePosition(hand);
      player.bones.elbowR.setAbsolutePosition(elbow);
      player.rightHand.position.copyFrom(hand);
      setSegment(player.meshes.upperArmR, shoulderR, elbow);
      setSegment(player.meshes.forearmR, elbow, hand);
      alignFallbackSword(player);
    }

    // Shield: keep the disc outside the central binocular corridor and far
    // enough forward that its apparent size is believable on a landscape phone.
    const shieldLocal = localPoint(player.shield.center, head, frame);
    const safeShield = {
      x: Math.min(shieldLocal.x, -.34),
      y: clamp(shieldLocal.y, -.70, .14),
      z: Math.max(shieldLocal.z, .82)
    };
    shieldIntrusion = clamp((shieldLocal.x + .52) / .28, 0, 1)
      * clamp((.82 - shieldLocal.z) / .34, 0, 1);
    const safeCenter = worldPoint(safeShield, head, frame);
    const shieldCorrection = safeCenter.subtract(player.shield.center);
    if (shieldCorrection.lengthSquared() > 1e-8) {
      player.shield.center.copyFrom(safeCenter);
      const hand = player.bones.handL.getAbsolutePosition().add(shieldCorrection.scale(.72));
      const elbow = player.bones.elbowL.getAbsolutePosition().add(shieldCorrection.scale(.34));
      player.bones.handL.setAbsolutePosition(hand);
      player.bones.elbowL.setAbsolutePosition(elbow);
      player.leftHand.position.copyFrom(hand);
      setSegment(player.meshes.upperArmL, shoulderL, elbow);
      setSegment(player.meshes.forearmL, elbow, hand);
      player.meshes.shield.position.copyFrom(safeCenter);
      player.meshes.shieldRim.position.copyFrom(safeCenter.add(player.shield.normal.scale(.045)));
      player.meshes.shieldBoss.position.copyFrom(safeCenter.add(player.shield.normal.scale(.075)));
    }

    // Couple upper-body effort to weapon acceleration. This is deliberately
    // short-lived: mass is felt in shoulders/chest without returning to jelly.
    const safeDt = Math.max(dt, 1 / 240);
    const tipVelocity = player.sword.tip.subtract(previousTip).scale(1 / safeDt);
    const shieldVelocity = player.shield.center.subtract(previousShield).scale(1 / safeDt);
    const lateralEffort = clamp(Vector3.Dot(tipVelocity, frame.right) * .0022, -.055, .055);
    const shieldEffort = clamp(Vector3.Dot(shieldVelocity, frame.right) * .0015, -.035, .035);
    player.impactLeanVelocity.addInPlace(frame.right.scale(-(lateralEffort + shieldEffort)));
    previousTip.copyFrom(player.sword.tip);
    previousShield.copyFrom(player.shield.center);

    const finalBase = localPoint(player.sword.base, head, frame);
    const finalTip = localPoint(player.sword.tip, head, frame);
    player.viewSafety = {
      swordCenterIntrusion: Number(centerIntrusion.toFixed(4)),
      shieldCenterIntrusion: Number(shieldIntrusion.toFixed(4)),
      swordBaseLocalX: Number(finalBase.x.toFixed(4)),
      swordTipLocalX: Number(finalTip.x.toFixed(4)),
      swordTipLocalZ: Number(finalTip.z.toFixed(4)),
      shieldLocalX: Number(safeShield.x.toFixed(4)),
      shieldLocalZ: Number(safeShield.z.toFixed(4))
    };
  };

  return {
    getMetrics: () => player.viewSafety || null
  };
}
