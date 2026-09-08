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

export function installAnatomicalEnvelope(game) {
  const player = game.player;
  const originalUpdate = player.update.bind(player);
  const originalConsumeLook = game.input.consumeLook.bind(game.input);
  let lastLookFrame = null;
  let previousTip = player.sword.tip.clone();
  let previousShield = player.shield.center.clone();

  game.input.consumeLook = (dt) => {
    const look = originalConsumeLook(dt);
    lastLookFrame = look;
    return look;
  };

  player.update = (dt, control, snap = false) => {
    const enriched = lastLookFrame ? {
      ...control,
      gestureYawRate: lastLookFrame.gestureYawRate,
      gesturePitchRate: lastLookFrame.gesturePitchRate,
      gestureEnergy: lastLookFrame.gestureEnergy,
      poseX: lastLookFrame.poseX,
      poseY: lastLookFrame.poseY,
      poseEngaged: lastLookFrame.poseEngaged
    } : control;
    originalUpdate(dt, enriched, snap);
    if (snap) {
      previousTip.copyFrom(player.sword.tip);
      previousShield.copyFrom(player.shield.center);
      return;
    }

    const frame = basis(player.upperYaw);
    const head = player.bones.head.getAbsolutePosition();
    const chest = player.bones.chest.getAbsolutePosition();
    const shoulderR = player.bones.shoulderR.getAbsolutePosition();
    const shoulderL = player.bones.shoulderL.getAbsolutePosition();

    // Raw finger energy is deliberately independent from the filtered camera
    // share: a fast flick can accelerate the sword without throwing the view.
    const energy = clamp((enriched.gestureEnergy ?? Math.hypot(enriched.gestureYawRate || 0, enriched.gesturePitchRate || 0) / 10.5), 0, 1);
    const baseLocal = localPoint(player.sword.base, head, frame);
    const tipLocal = localPoint(player.sword.tip, head, frame);
    const minBaseX = .19 - energy * .23;
    const minBaseZ = .38;
    const swordIntrusion = clamp((.18 - Math.abs(tipLocal.x)) / .18, 0, 1)
      * clamp((.82 - tipLocal.z) / .52, 0, 1)
      * (1 - energy * .72);
    const swordCorrectionX = Math.max(0, minBaseX - baseLocal.x) + swordIntrusion * .12;
    const swordCorrectionZ = Math.max(0, minBaseZ - baseLocal.z);

    if (swordCorrectionX > .0001 || swordCorrectionZ > .0001) {
      const correction = frame.right.scale(swordCorrectionX).add(frame.forward.scale(swordCorrectionZ));
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

    // Neutral guard opens the centre primarily by moving the shield outward,
    // rather than pushing it unrealistically far away and visually stretching
    // the left arm. Under a fast nearby strike the envelope relaxes toward the
    // centre so defensive coverage still wins over framing.
    let threat = 0;
    if (game.enemy && !game.enemy.dead) {
      const trace = game.enemy.getSwordTrace();
      const distance = Vector3.Distance(trace.tip, chest);
      threat = clamp((trace.speed - 2.2) / 6.5, 0, 1) * clamp((2.65 - distance) / 1.45, 0, 1);
    }
    const shieldLocal = localPoint(player.shield.center, head, frame);
    const maxShieldX = -.56 + threat * .20;
    const minShieldZ = .82 - threat * .08;
    const safeShield = {
      x: Math.min(shieldLocal.x, maxShieldX),
      y: clamp(shieldLocal.y, -.68, .12),
      z: Math.max(shieldLocal.z, minShieldZ)
    };
    const safeCenter = worldPoint(safeShield, head, frame);
    const shieldCorrection = safeCenter.subtract(player.shield.center);
    if (shieldCorrection.lengthSquared() > 1e-8) {
      player.shield.center.copyFrom(safeCenter);
      const hand = player.bones.handL.getAbsolutePosition().add(shieldCorrection.scale(.58));
      const elbow = player.bones.elbowL.getAbsolutePosition().add(shieldCorrection.scale(.22));
      player.bones.handL.setAbsolutePosition(hand);
      player.bones.elbowL.setAbsolutePosition(elbow);
      player.leftHand.position.copyFrom(hand);
      setSegment(player.meshes.upperArmL, shoulderL, elbow);
      setSegment(player.meshes.forearmL, elbow, hand);
      player.meshes.shield.position.copyFrom(safeCenter);
      player.meshes.shieldRim.position.copyFrom(safeCenter.add(player.shield.normal.scale(.045)));
      player.meshes.shieldBoss.position.copyFrom(safeCenter.add(player.shield.normal.scale(.075)));
    }

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
    const finalShield = localPoint(player.shield.center, head, frame);
    const finalSwordIntrusion = clamp((.18 - Math.abs(finalTip.x)) / .18, 0, 1)
      * clamp((.82 - finalTip.z) / .52, 0, 1)
      * (1 - energy * .72);
    const finalShieldIntrusion = clamp((finalShield.x + .56) / .24, 0, 1)
      * clamp((.82 - finalShield.z) / .30, 0, 1)
      * (1 - threat * .85);

    player.viewSafety = {
      swordCenterIntrusion: Number(finalSwordIntrusion.toFixed(4)),
      shieldCenterIntrusion: Number(finalShieldIntrusion.toFixed(4)),
      swordBaseLocalX: Number(finalBase.x.toFixed(4)),
      swordTipLocalX: Number(finalTip.x.toFixed(4)),
      swordTipLocalZ: Number(finalTip.z.toFixed(4)),
      shieldLocalX: Number(finalShield.x.toFixed(4)),
      shieldLocalZ: Number(finalShield.z.toFixed(4)),
      gestureEnergy: Number(energy.toFixed(4)),
      threat: Number(threat.toFixed(4))
    };
  };

  return { getMetrics: () => player.viewSafety || null };
}
