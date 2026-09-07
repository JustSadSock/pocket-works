import { Bone, Matrix, Skeleton, Vector3 } from '@babylonjs/core';
import { clamp, pointSegmentDistanceSquared } from './core.js';

const HIERARCHY = [
  ['pelvis', null], ['spine', 'pelvis'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'],
  ['shoulderL', 'chest'], ['elbowL', 'shoulderL'], ['handL', 'elbowL'],
  ['shoulderR', 'chest'], ['elbowR', 'shoulderR'], ['handR', 'elbowR'],
  ['hipL', 'pelvis'], ['kneeL', 'hipL'], ['footL', 'kneeL'],
  ['hipR', 'pelvis'], ['kneeR', 'hipR'], ['footR', 'kneeR']
];

function basisFromYaw(yaw) {
  return {
    forward: new Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
    right: new Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  };
}

function syncShieldVisuals(warrior) {
  warrior.meshes.shield.position.copyFrom(warrior.shield.center);
  warrior.meshes.shieldRim.position.copyFrom(warrior.shield.center.add(warrior.shield.normal.scale(0.045)));
  warrior.meshes.shieldBoss.position.copyFrom(warrior.shield.center.add(warrior.shield.normal.scale(0.075)));
}

function translateShield(warrior, delta) {
  warrior.leftHand.position.addInPlace(delta);
  warrior.shield.center.addInPlace(delta);
  syncShieldVisuals(warrior);
}

function enforceShieldConstraints(warrior) {
  const normal = warrior.shield.normal.normalizeToNew();

  // The player's own shield must never enter the head/camera corridor. It can still rise
  // into a high guard, but remains offset to the shield side and a useful distance forward.
  if (warrior.isPlayer) {
    const head = warrior.bones.head.getAbsolutePosition();
    const basis = basisFromYaw(warrior.upperYaw);
    const offset = warrior.shield.center.subtract(head);
    const localRight = Vector3.Dot(offset, basis.right);
    const localForward = Vector3.Dot(offset, basis.forward);
    const targetRight = Math.min(localRight, -0.47);
    const targetForward = Math.max(localForward, 0.46);
    const targetY = clamp(warrior.shield.center.y, head.y - 0.49, head.y + 0.06);
    const correction = basis.right.scale(targetRight - localRight)
      .add(basis.forward.scale(targetForward - localForward))
      .add(new Vector3(0, targetY - warrior.shield.center.y, 0));
    if (correction.lengthSquared() > 1e-7) {
      const length = correction.length();
      if (length > 0.16) correction.scaleInPlace(0.16 / length);
      translateShield(warrior, correction);
      warrior.leftHand.velocity.scaleInPlace(0.62);
    }
  }

  // Keep the shield face outside the owner's torso/head volume rather than allowing the
  // large disc to visually slice through the character during fast camera motion.
  const protectedParts = warrior.getHitSpheres().filter((sphere) => ['chest', 'abdomen', 'head'].includes(sphere.name));
  for (const sphere of protectedParts) {
    const fromBody = warrior.shield.center.subtract(sphere.center);
    const signed = Vector3.Dot(fromBody, normal);
    const radial = fromBody.subtract(normal.scale(signed));
    const radialLimit = warrior.shield.radius + sphere.radius * 0.35;
    const clearance = sphere.radius + 0.075;
    if (radial.length() > radialLimit || signed >= clearance) continue;
    const push = clamp(clearance - signed, 0, 0.13);
    const correction = normal.scale(push);
    translateShield(warrior, correction);
    warrior.leftHand.velocity.addInPlace(normal.scale(push * 11));
    warrior.shieldNormal.velocity.scaleInPlace(0.7);
  }
}

function enforceWeaponBodyClearance(warrior) {
  const trace = warrior.getSwordTrace();
  const blade = trace.tip.subtract(trace.base);
  if (blade.lengthSquared() < 1e-8) return;
  const protectedParts = warrior.getHitSpheres().filter((sphere) => ['chest', 'abdomen', 'head', 'leftArm'].includes(sphere.name));
  for (const sphere of protectedParts) {
    const result = pointSegmentDistanceSquared(sphere.center, trace.base, trace.tip);
    if (result.t < 0.08) continue;
    const clearance = sphere.radius + 0.065;
    if (result.distanceSquared >= clearance * clearance) continue;
    const point = Vector3.Lerp(trace.base, trace.tip, result.t);
    let normal = point.subtract(sphere.center);
    let distance = normal.length();
    if (distance < 1e-5) {
      normal = Vector3.Cross(blade, Vector3.Up());
      if (normal.lengthSquared() < 1e-5) normal = Vector3.Right();
      normal.normalize();
      distance = 0;
    } else normal.scaleInPlace(1 / distance);
    const penetration = clamp(clearance - distance, 0, 0.16);
    const correction = normal.scale(Math.min(0.11, penetration * 0.76 + 0.008));
    warrior.rightHand.position.addInPlace(correction);
    warrior.rightHand.velocity.addInPlace(normal.scale(0.9 + penetration * 16));
    warrior.swordDirection.velocity.addInPlace(normal.scale(0.28 + penetration * 2.4));
    warrior.sword.base.addInPlace(correction);
    warrior.sword.tip.addInPlace(correction);
    warrior.meshes.blade.position.addInPlace(correction);
    warrior.meshes.grip.position.addInPlace(correction);
    warrior.meshes.guard.position.addInPlace(correction);
    warrior.stamina = Math.max(0, warrior.stamina - penetration * 18);
    break;
  }
}

function applyGroundedPhysicalFeel(warrior, control, dt) {
  const safeDt = clamp(dt, 1 / 240, 1 / 24);
  const yawRate = clamp(control.lookYawRate || 0, -9, 9);
  const pitchRate = clamp(control.lookPitchRate || 0, -8, 8);
  const angularEnergy = clamp(Math.hypot(yawRate, pitchRate) / 8.5, 0, 1);
  const bladeEnergy = clamp((warrior.sword.speed - 2.0) / 7.0, 0, 1);
  const actionEnergy = Math.max(angularEnergy, bladeEnergy);
  const moveMagnitude = clamp(control.moveMagnitude || 0, 0, 1);

  // Track angular momentum separately from the camera. At the start of a cut the weapon
  // resists the new motion; when the thumb stops, stored momentum produces a short follow-through.
  const feel = warrior.__sinewPhysicalFeel || (warrior.__sinewPhysicalFeel = {
    yawRate: 0,
    pitchRate: 0,
    yawMomentum: 0,
    pitchMomentum: 0
  });
  const momentumT = 1 - Math.exp(-5.2 * safeDt);
  feel.yawMomentum += (yawRate - feel.yawMomentum) * momentumT;
  feel.pitchMomentum += (pitchRate - feel.pitchMomentum) * momentumT;
  const yawLag = yawRate - feel.yawMomentum;
  const pitchLag = pitchRate - feel.pitchMomentum;
  const basis = basisFromYaw(warrior.upperYaw);
  warrior.swordDirection.velocity.addInPlace(basis.right.scale(-yawLag * 0.82));
  warrior.swordDirection.velocity.y += -pitchLag * 0.68;
  warrior.rightHand.velocity.addInPlace(basis.right.scale(-yawLag * 0.085));
  warrior.rightHand.velocity.y += -pitchLag * 0.052;

  // Calm aiming is strongly damped; active cuts retain much more of their velocity.
  const handDamping = 10.4 - actionEnergy * 6.5;
  const weaponDamping = 8.7 - actionEnergy * 6.1;
  const shieldDamping = 11.2 - actionEnergy * 4.0;
  warrior.leftHand.velocity.scaleInPlace(Math.exp(-handDamping * safeDt));
  warrior.rightHand.velocity.scaleInPlace(Math.exp(-(handDamping - 1.4) * safeDt));
  warrior.swordDirection.velocity.scaleInPlace(Math.exp(-weaponDamping * safeDt));
  warrior.shieldNormal.velocity.scaleInPlace(Math.exp(-shieldDamping * safeDt));

  warrior.bodyYawState.velocity *= Math.exp(-(5.4 - actionEnergy * 1.7) * safeDt);
  warrior.upperYawState.velocity *= Math.exp(-(4.0 - actionEnergy * 1.5) * safeDt);
  warrior.pitchState.velocity *= Math.exp(-(4.6 - actionEnergy * 1.5) * safeDt);

  // Strong foot friction when the movement thumb is released, with a short residual mass
  // instead of the previous long skating motion.
  if (moveMagnitude < 0.06) {
    const groundGrip = Math.exp(-11.5 * safeDt);
    warrior.velocity.x *= groundGrip;
    warrior.velocity.z *= groundGrip;
    if (Math.hypot(warrior.velocity.x, warrior.velocity.z) < 0.035) {
      warrior.velocity.x = 0;
      warrior.velocity.z = 0;
    }
  }

  const yawAcceleration = clamp((yawRate - feel.yawRate) / safeDt, -45, 45);
  const pitchAcceleration = clamp((pitchRate - feel.pitchRate) / safeDt, -40, 40);
  feel.yawRate = yawRate;
  feel.pitchRate = pitchRate;
  if (angularEnergy > 0.08) {
    warrior.impactLeanVelocity.addInPlace(basis.right.scale(-yawAcceleration * 0.00068));
    warrior.impactLeanVelocity.y += -pitchAcceleration * 0.00028;
  }

  const calm = 1 - actionEnergy;
  warrior.stability = Math.min(100, warrior.stability + calm * calm * safeDt * 9.5);
}

export function attachBabylonSkeleton(warrior, scene) {
  const skeleton = new Skeleton(`${warrior.id}:skeleton`, `${warrior.id}:skeleton`, scene);
  const bones = {};
  for (const [name, parentName] of HIERARCHY) {
    const parent = parentName ? bones[parentName] : null;
    const bone = new Bone(`${warrior.id}:${name}`, skeleton, parent, Matrix.Identity());
    bone.linkTransformNode(warrior.bones[name]);
    bones[name] = bone;
  }
  warrior.skeleton = skeleton;
  warrior.skeletonBones = bones;
  const originalUpdate = warrior.update.bind(warrior);
  warrior.update = (dt, control, snap = false) => {
    originalUpdate(dt, control, snap);
    if (!snap) {
      applyGroundedPhysicalFeel(warrior, control, dt);
      enforceWeaponBodyClearance(warrior);
      enforceShieldConstraints(warrior);
    }
  };
  const originalDispose = warrior.dispose.bind(warrior);
  warrior.dispose = () => {
    skeleton.dispose();
    originalDispose();
  };
  return skeleton;
}
