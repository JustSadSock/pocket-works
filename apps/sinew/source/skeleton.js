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
    if (!snap) enforceWeaponBodyClearance(warrior);
  };
  const originalDispose = warrior.dispose.bind(warrior);
  warrior.dispose = () => {
    skeleton.dispose();
    originalDispose();
  };
  return skeleton;
}
