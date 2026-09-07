import { Bone, Matrix, Skeleton, Vector3 } from '@babylonjs/core';
import { clamp, pointSegmentDistanceSquared } from './core.js';

const HIERARCHY = [
  ['pelvis', null], ['spine', 'pelvis'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'],
  ['shoulderL', 'chest'], ['elbowL', 'shoulderL'], ['handL', 'elbowL'],
  ['shoulderR', 'chest'], ['elbowR', 'shoulderR'], ['handR', 'elbowR'],
  ['hipL', 'pelvis'], ['kneeL', 'hipL'], ['footL', 'kneeL'],
  ['hipR', 'pelvis'], ['kneeR', 'hipR'], ['footR', 'kneeR']
];

function enforceWeaponBodyClearance(warrior) {
  const trace = warrior.getSwordTrace();
  const blade = trace.tip.subtract(trace.base);
  if (blade.lengthSquared() < 1e-8) return;
  const protectedParts = warrior.getHitSpheres().filter((sphere) => ['chest', 'abdomen', 'head'].includes(sphere.name));
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
    warrior.rightHand.velocity.addInPlace(normal.scale(0.75 + penetration * 14));
    warrior.swordDirection.velocity.addInPlace(normal.scale(0.22 + penetration * 2.1));
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
  const bladeEnergy = clamp((warrior.sword.speed - 2.2) / 7.2, 0, 1);
  const actionEnergy = Math.max(angularEnergy, bladeEnergy);
  const moveMagnitude = clamp(control.moveMagnitude || 0, 0, 1);

  // The base rig intentionally has under-damped springs. Add velocity damping instead of
  // removing lag: slow aiming becomes planted, while fast cuts still carry momentum.
  const handDamping = 8.5 - actionEnergy * 4.2;
  const weaponDamping = 7.2 - actionEnergy * 4.6;
  const shieldDamping = 8.8 - actionEnergy * 3.2;
  warrior.leftHand.velocity.scaleInPlace(Math.exp(-handDamping * safeDt));
  warrior.rightHand.velocity.scaleInPlace(Math.exp(-(handDamping - 0.8) * safeDt));
  warrior.swordDirection.velocity.scaleInPlace(Math.exp(-weaponDamping * safeDt));
  warrior.shieldNormal.velocity.scaleInPlace(Math.exp(-shieldDamping * safeDt));

  // Keep the torso from continuously oscillating around the desired facing.
  warrior.bodyYawState.velocity *= Math.exp(-(4.2 - actionEnergy * 1.4) * safeDt);
  warrior.upperYawState.velocity *= Math.exp(-(3.1 - actionEnergy * 1.1) * safeDt);
  warrior.pitchState.velocity *= Math.exp(-(3.6 - actionEnergy * 1.3) * safeDt);

  // Feet should feel planted when the movement thumb is released. Preserve acceleration
  // while moving, but kill the residual skating that made the body feel submerged.
  if (moveMagnitude < 0.06) {
    const groundGrip = Math.exp(-8.5 * safeDt);
    warrior.velocity.x *= groundGrip;
    warrior.velocity.z *= groundGrip;
    if (Math.hypot(warrior.velocity.x, warrior.velocity.z) < 0.025) {
      warrior.velocity.x = 0;
      warrior.velocity.z = 0;
    }
  }

  // Inertia should show up as resistance to *changes* in angular motion, not as endless
  // spring wobble. A short counter-lean makes quick starts/stops feel like moving mass.
  const feel = warrior.__sinewPhysicalFeel || (warrior.__sinewPhysicalFeel = { yawRate: 0, pitchRate: 0 });
  const yawAcceleration = clamp((yawRate - feel.yawRate) / safeDt, -45, 45);
  const pitchAcceleration = clamp((pitchRate - feel.pitchRate) / safeDt, -40, 40);
  feel.yawRate = yawRate;
  feel.pitchRate = pitchRate;
  if (angularEnergy > 0.08) {
    const basisForward = warrior.sword.tip.subtract(warrior.sword.base);
    basisForward.y = 0;
    if (basisForward.lengthSquared() > 1e-5) basisForward.normalize();
    const right = new Vector3(basisForward.z, 0, -basisForward.x);
    warrior.impactLeanVelocity.addInPlace(right.scale(-yawAcceleration * 0.00052));
    warrior.impactLeanVelocity.y += -pitchAcceleration * 0.00022;
  }

  // Restore stability decisively while calm; taking/making hard swings still costs it.
  const calm = 1 - actionEnergy;
  warrior.stability = Math.min(100, warrior.stability + calm * calm * safeDt * 7.5);
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
    }
  };
  const originalDispose = warrior.dispose.bind(warrior);
  warrior.dispose = () => {
    skeleton.dispose();
    originalDispose();
  };
  return skeleton;
}
