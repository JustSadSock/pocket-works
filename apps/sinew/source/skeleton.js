import { Bone, Matrix, Skeleton } from '@babylonjs/core';

const HIERARCHY = [
  ['pelvis', null],
  ['spine', 'pelvis'],
  ['chest', 'spine'],
  ['neck', 'chest'],
  ['head', 'neck'],
  ['shoulderL', 'chest'],
  ['elbowL', 'shoulderL'],
  ['handL', 'elbowL'],
  ['shoulderR', 'chest'],
  ['elbowR', 'shoulderR'],
  ['handR', 'elbowR'],
  ['hipL', 'pelvis'],
  ['kneeL', 'hipL'],
  ['footL', 'kneeL'],
  ['hipR', 'pelvis'],
  ['kneeR', 'hipR'],
  ['footR', 'kneeR']
];

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
  const originalDispose = warrior.dispose.bind(warrior);
  warrior.dispose = () => {
    skeleton.dispose();
    originalDispose();
  };
  return skeleton;
}
