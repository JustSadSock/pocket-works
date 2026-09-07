import {
  Color3,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  TransformNode,
  Vector3
} from '@babylonjs/core';
import { clamp, damp, expSmoothing, springScalar, wrapAngle } from './core.js';

const UP = new Vector3(0, 1, 0);
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);

function basisFromYaw(yaw) {
  return {
    forward: new Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
    right: new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
    up: UP
  };
}

function quatAxisTo(axis, direction) {
  const dir = direction.normalizeToNew();
  const dot = clamp(Vector3.Dot(axis, dir), -1, 1);
  if (dot > 0.999999) return Quaternion.Identity();
  if (dot < -0.999999) return Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI);
  const cross = Vector3.Cross(axis, dir);
  cross.normalize();
  return Quaternion.RotationAxis(cross, Math.acos(dot));
}

function setSegment(mesh, a, b, axis = AXIS_Y) {
  const delta = b.subtract(a);
  const length = Math.max(0.001, delta.length());
  mesh.position.copyFrom(a.add(b).scale(0.5));
  mesh.rotationQuaternion = quatAxisTo(axis, delta);
  if (axis === AXIS_Y) mesh.scaling.set(1, length, 1);
  else mesh.scaling.set(1, 1, length);
}

function springVector(state, target, stiffness, damping, dt) {
  const ax = (target.x - state.position.x) * stiffness - state.velocity.x * damping;
  const ay = (target.y - state.position.y) * stiffness - state.velocity.y * damping;
  const az = (target.z - state.position.z) * stiffness - state.velocity.z * damping;
  state.velocity.x += ax * dt;
  state.velocity.y += ay * dt;
  state.velocity.z += az * dt;
  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
  state.position.z += state.velocity.z * dt;
}

function createMaterial(scene, name, color, metallic = 0, roughness = 0.75) {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color;
  material.metallic = metallic;
  material.roughness = roughness;
  material.environmentIntensity = 0.7;
  return material;
}

function solveTwoBone(root, target, lengthA, lengthB, bendHint) {
  const toTarget = target.subtract(root);
  const rawDistance = toTarget.length();
  const distance = clamp(rawDistance, 0.08, lengthA + lengthB - 0.008);
  const dir = rawDistance > 1e-6 ? toTarget.scale(1 / rawDistance) : new Vector3(0, 0, 1);
  const x = (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance);
  const h = Math.sqrt(Math.max(0, lengthA * lengthA - x * x));
  const bend = bendHint.subtract(dir.scale(Vector3.Dot(bendHint, dir)));
  if (bend.lengthSquared() < 1e-6) bend.copyFrom(Vector3.Cross(dir, UP));
  bend.normalize();
  return root.add(dir.scale(x)).add(bend.scale(h));
}

function clampArm(state, shoulder, maxReach) {
  const delta = state.position.subtract(shoulder);
  const distance = delta.length();
  if (distance > maxReach) {
    const target = shoulder.add(delta.scale(maxReach / distance));
    state.position.copyFrom(target);
    state.velocity.scaleInPlace(0.72);
  }
}

export class ProceduralWarrior {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.id = options.id || `warrior-${Math.random().toString(36).slice(2)}`;
    this.isPlayer = Boolean(options.isPlayer);
    this.node = new TransformNode(`${this.id}:root`, scene);
    this.position = new Vector3();
    this.velocity = new Vector3();
    this.previousVelocity = new Vector3();
    this.bodyYawState = { value: 0, velocity: 0 };
    this.upperYawState = { value: 0, velocity: 0 };
    this.pitchState = { value: 0, velocity: 0 };
    this.bodyYaw = 0;
    this.upperYaw = 0;
    this.lookPitch = 0;
    this.health = 100;
    this.stability = 100;
    this.stamina = 100;
    this.impactLean = new Vector3();
    this.impactLeanVelocity = new Vector3();
    this.stepPhase = Math.random() * Math.PI * 2;
    this.stepPulse = false;
    this.lastStepSign = Math.sin(this.stepPhase) >= 0 ? 1 : -1;
    this.shadowMeshes = [];
    this.hitFlash = 0;
    this.dead = false;

    const palette = options.palette || {};
    this.materials = {
      cloth: createMaterial(scene, `${this.id}:cloth`, Color3.FromHexString(palette.cloth || '#4a4038'), 0, 0.92),
      leather: createMaterial(scene, `${this.id}:leather`, Color3.FromHexString(palette.leather || '#4a2f22'), 0.05, 0.78),
      steel: createMaterial(scene, `${this.id}:steel`, Color3.FromHexString(palette.steel || '#8f9695'), 0.82, 0.31),
      darkSteel: createMaterial(scene, `${this.id}:darkSteel`, Color3.FromHexString(palette.darkSteel || '#343839'), 0.76, 0.43),
      skin: createMaterial(scene, `${this.id}:skin`, Color3.FromHexString(palette.skin || '#b47d5b'), 0, 0.86),
      accent: createMaterial(scene, `${this.id}:accent`, Color3.FromHexString(palette.accent || '#7d2f28'), 0.15, 0.62),
      wood: createMaterial(scene, `${this.id}:wood`, Color3.FromHexString('#4d3020'), 0, 0.82)
    };

    this.bones = {};
    this.createBoneHierarchy();
    this.createVisuals();

    this.leftHand = { position: new Vector3(), velocity: new Vector3() };
    this.rightHand = { position: new Vector3(), velocity: new Vector3() };
    this.swordDirection = { position: new Vector3(0, 0.18, 0.98), velocity: new Vector3() };
    this.shieldNormal = { position: new Vector3(0, 0, 1), velocity: new Vector3() };
    this.sword = {
      base: new Vector3(), tip: new Vector3(), prevBase: new Vector3(), prevTip: new Vector3(),
      speed: 0, angularSpeed: 0, length: 1.04, mass: 1.35
    };
    this.shield = {
      center: new Vector3(), normal: new Vector3(0, 0, 1), prevCenter: new Vector3(), prevNormal: new Vector3(0, 0, 1),
      radius: 0.47, mass: 4.6
    };

    this.reset(options.position || new Vector3(), options.yaw || 0);
  }

  createBone(name, parentName = null) {
    const bone = new TransformNode(`${this.id}:bone:${name}`, this.scene);
    if (parentName) bone.parent = this.bones[parentName];
    this.bones[name] = bone;
    return bone;
  }

  createBoneHierarchy() {
    this.createBone('pelvis');
    this.createBone('spine', 'pelvis');
    this.createBone('chest', 'spine');
    this.createBone('neck', 'chest');
    this.createBone('head', 'neck');
    this.createBone('shoulderL', 'chest');
    this.createBone('elbowL', 'shoulderL');
    this.createBone('handL', 'elbowL');
    this.createBone('shoulderR', 'chest');
    this.createBone('elbowR', 'shoulderR');
    this.createBone('handR', 'elbowR');
    this.createBone('hipL', 'pelvis');
    this.createBone('kneeL', 'hipL');
    this.createBone('footL', 'kneeL');
    this.createBone('hipR', 'pelvis');
    this.createBone('kneeR', 'hipR');
    this.createBone('footR', 'kneeR');
  }

  createCapsulePart(name, radius, material) {
    const mesh = MeshBuilder.CreateCapsule(`${this.id}:${name}`, { height: 1, radius, tessellation: 10, subdivisions: 1 }, this.scene);
    mesh.material = material;
    mesh.rotationQuaternion = Quaternion.Identity();
    mesh.receiveShadows = true;
    this.shadowMeshes.push(mesh);
    return mesh;
  }

  createVisuals() {
    this.meshes = {};
    this.meshes.torso = this.createCapsulePart('torso', 0.24, this.materials.cloth);
    this.meshes.waist = this.createCapsulePart('waist', 0.21, this.materials.leather);
    this.meshes.upperArmL = this.createCapsulePart('upperArmL', 0.085, this.materials.cloth);
    this.meshes.forearmL = this.createCapsulePart('forearmL', 0.072, this.materials.darkSteel);
    this.meshes.upperArmR = this.createCapsulePart('upperArmR', 0.085, this.materials.cloth);
    this.meshes.forearmR = this.createCapsulePart('forearmR', 0.072, this.materials.darkSteel);
    this.meshes.thighL = this.createCapsulePart('thighL', 0.105, this.materials.cloth);
    this.meshes.calfL = this.createCapsulePart('calfL', 0.082, this.materials.leather);
    this.meshes.thighR = this.createCapsulePart('thighR', 0.105, this.materials.cloth);
    this.meshes.calfR = this.createCapsulePart('calfR', 0.082, this.materials.leather);

    this.meshes.head = MeshBuilder.CreateSphere(`${this.id}:head`, { diameter: 0.28, segments: 12 }, this.scene);
    this.meshes.head.material = this.materials.skin;
    this.meshes.head.receiveShadows = true;
    this.shadowMeshes.push(this.meshes.head);

    this.meshes.helmet = MeshBuilder.CreateCylinder(`${this.id}:helmet`, { diameterTop: 0.25, diameterBottom: 0.31, height: 0.24, tessellation: 12 }, this.scene);
    this.meshes.helmet.material = this.materials.darkSteel;
    this.meshes.helmet.receiveShadows = true;
    this.shadowMeshes.push(this.meshes.helmet);

    this.meshes.chestPlate = MeshBuilder.CreateBox(`${this.id}:chestPlate`, { width: 0.48, height: 0.42, depth: 0.12 }, this.scene);
    this.meshes.chestPlate.material = this.materials.darkSteel;
    this.meshes.chestPlate.receiveShadows = true;
    this.shadowMeshes.push(this.meshes.chestPlate);

    this.meshes.tabard = MeshBuilder.CreateBox(`${this.id}:tabard`, { width: 0.31, height: 0.56, depth: 0.045 }, this.scene);
    this.meshes.tabard.material = this.materials.accent;
    this.meshes.tabard.receiveShadows = true;
    this.shadowMeshes.push(this.meshes.tabard);

    this.meshes.blade = MeshBuilder.CreateBox(`${this.id}:blade`, { width: 0.052, height: 0.018, depth: 1 }, this.scene);
    this.meshes.blade.material = this.materials.steel;
    this.meshes.blade.rotationQuaternion = Quaternion.Identity();
    this.meshes.blade.receiveShadows = true;
    this.shadowMeshes.push(this.meshes.blade);

    this.meshes.grip = MeshBuilder.CreateCylinder(`${this.id}:grip`, { height: 1, diameter: 0.045, tessellation: 8 }, this.scene);
    this.meshes.grip.material = this.materials.leather;
    this.meshes.grip.rotationQuaternion = Quaternion.Identity();
    this.shadowMeshes.push(this.meshes.grip);

    this.meshes.guard = MeshBuilder.CreateBox(`${this.id}:guard`, { width: 0.27, height: 0.035, depth: 0.045 }, this.scene);
    this.meshes.guard.material = this.materials.darkSteel;
    this.shadowMeshes.push(this.meshes.guard);

    this.meshes.shield = MeshBuilder.CreateCylinder(`${this.id}:shield`, { diameter: 0.9, height: 0.075, tessellation: 20 }, this.scene);
    this.meshes.shield.material = this.materials.wood;
    this.meshes.shield.rotationQuaternion = Quaternion.Identity();
    this.meshes.shield.receiveShadows = true;
    this.shadowMeshes.push(this.meshes.shield);

    this.meshes.shieldRim = MeshBuilder.CreateTorus(`${this.id}:shieldRim`, { diameter: 0.87, thickness: 0.035, tessellation: 20 }, this.scene);
    this.meshes.shieldRim.material = this.materials.darkSteel;
    this.meshes.shieldRim.rotationQuaternion = Quaternion.Identity();
    this.shadowMeshes.push(this.meshes.shieldRim);

    this.meshes.shieldBoss = MeshBuilder.CreateSphere(`${this.id}:shieldBoss`, { diameter: 0.2, segments: 10 }, this.scene);
    this.meshes.shieldBoss.material = this.materials.darkSteel;
    this.shadowMeshes.push(this.meshes.shieldBoss);

    if (this.isPlayer) {
      this.meshes.head.setEnabled(false);
      this.meshes.helmet.setEnabled(false);
    }
  }

  reset(position, yaw = 0) {
    this.position.copyFrom(position);
    this.velocity.setAll(0);
    this.previousVelocity.setAll(0);
    this.bodyYawState.value = yaw;
    this.bodyYawState.velocity = 0;
    this.upperYawState.value = yaw;
    this.upperYawState.velocity = 0;
    this.pitchState.value = 0;
    this.pitchState.velocity = 0;
    this.bodyYaw = yaw;
    this.upperYaw = yaw;
    this.lookPitch = 0;
    this.health = 100;
    this.stability = 100;
    this.stamina = 100;
    this.dead = false;
    this.hitFlash = 0;
    this.impactLean.setAll(0);
    this.impactLeanVelocity.setAll(0);
    const basis = basisFromYaw(yaw);
    const chest = position.add(new Vector3(0, 1.34, 0));
    this.leftHand.position.copyFrom(chest.add(basis.forward.scale(0.38)).add(basis.right.scale(-0.36)));
    this.rightHand.position.copyFrom(chest.add(basis.forward.scale(0.38)).add(basis.right.scale(0.36)).add(new Vector3(0, -0.08, 0)));
    this.leftHand.velocity.setAll(0);
    this.rightHand.velocity.setAll(0);
    this.swordDirection.position.copyFrom(basis.forward.add(new Vector3(0, 0.08, 0)).normalize());
    this.swordDirection.velocity.setAll(0);
    this.shieldNormal.position.copyFrom(basis.forward);
    this.shieldNormal.velocity.setAll(0);
    this.sword.base.copyFrom(this.rightHand.position);
    this.sword.tip.copyFrom(this.rightHand.position.add(this.swordDirection.position.scale(this.sword.length)));
    this.sword.prevBase.copyFrom(this.sword.base);
    this.sword.prevTip.copyFrom(this.sword.tip);
    this.shield.center.copyFrom(this.leftHand.position);
    this.shield.prevCenter.copyFrom(this.leftHand.position);
    this.shield.normal.copyFrom(basis.forward);
    this.shield.prevNormal.copyFrom(basis.forward);
    this.update(1 / 60, { lookYaw: yaw, lookPitch: 0, moveX: 0, moveY: 0, moveMagnitude: 0, moveSpaceYaw: yaw, lookYawRate: 0, lookPitchRate: 0 }, true);
  }

  update(dt, control, snap = false) {
    dt = clamp(dt, 1 / 240, 1 / 24);
    this.stepPulse = false;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.previousVelocity.copyFrom(this.velocity);

    const lookYaw = control.lookYaw ?? this.bodyYaw;
    const lookPitch = clamp(control.lookPitch ?? 0, -0.72, 0.76);
    const moveSpaceYaw = control.moveSpaceYaw ?? lookYaw;
    const moveBasis = basisFromYaw(moveSpaceYaw);
    const moveMagnitude = clamp(control.moveMagnitude ?? Math.hypot(control.moveX || 0, control.moveY || 0), 0, 1);
    const moveDir = moveBasis.right.scale(control.moveX || 0).add(moveBasis.forward.scale(control.moveY || 0));
    if (moveDir.lengthSquared() > 1) moveDir.normalize();
    const targetSpeed = moveMagnitude < 0.05 ? 0 : 1.05 + Math.pow(moveMagnitude, 1.45) * 3.15;
    const targetVelocity = moveDir.scale(targetSpeed);
    const accel = moveMagnitude > 0.05 ? 10.5 : 13.5;
    const velocityT = expSmoothing(accel, dt);
    this.velocity.x += (targetVelocity.x - this.velocity.x) * velocityT;
    this.velocity.z += (targetVelocity.z - this.velocity.z) * velocityT;
    this.velocity.y = 0;
    this.position.addInPlace(this.velocity.scale(dt));
    const radius = Math.hypot(this.position.x, this.position.z);
    if (radius > 9.15) {
      this.position.x *= 9.15 / radius;
      this.position.z *= 9.15 / radius;
      this.velocity.scaleInPlace(0.35);
    }

    const desiredBodyYaw = Math.abs(control.moveX || 0) + Math.abs(control.moveY || 0) > 0.25
      ? wrapAngle(lookYaw + clamp((control.moveX || 0) * 0.22, -0.22, 0.22))
      : lookYaw;
    if (snap) {
      this.bodyYawState.value = desiredBodyYaw;
      this.upperYawState.value = lookYaw;
      this.pitchState.value = lookPitch;
    } else {
      const bodyTarget = this.bodyYawState.value + wrapAngle(desiredBodyYaw - this.bodyYawState.value);
      const upperTarget = this.upperYawState.value + wrapAngle(lookYaw - this.upperYawState.value);
      springScalar(this.bodyYawState, bodyTarget, 24, 9.5, dt);
      springScalar(this.upperYawState, upperTarget, 43, 11.5, dt);
      springScalar(this.pitchState, lookPitch, 38, 11, dt);
    }
    this.bodyYaw = wrapAngle(this.bodyYawState.value);
    this.upperYaw = wrapAngle(this.upperYawState.value);
    this.lookPitch = this.pitchState.value;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const previousStepSign = this.lastStepSign;
    this.stepPhase += speed * dt * (2.15 + speed * 0.34);
    const sign = Math.sin(this.stepPhase) >= 0 ? 1 : -1;
    this.lastStepSign = sign;
    this.stepPulse = speed > 0.55 && sign !== previousStepSign;

    this.impactLeanVelocity.scaleInPlace(Math.exp(-8 * dt));
    this.impactLean.addInPlace(this.impactLeanVelocity.scale(dt));
    this.impactLean.scaleInPlace(Math.exp(-4.5 * dt));

    const bodyBasis = basisFromYaw(this.bodyYaw);
    const upperBasis = basisFromYaw(this.upperYaw);
    const movementAcceleration = this.velocity.subtract(this.previousVelocity).scale(1 / dt);
    const forwardAccel = Vector3.Dot(movementAcceleration, bodyBasis.forward);
    const sideAccel = Vector3.Dot(movementAcceleration, bodyBasis.right);
    const gait = clamp(speed / 4.2, 0, 1);
    const bob = Math.sin(this.stepPhase * 2) * 0.018 * gait;
    const pelvis = this.position.add(new Vector3(0, 0.93 + bob, 0));
    const chest = pelvis
      .add(new Vector3(0, 0.42, 0))
      .add(bodyBasis.forward.scale(clamp(forwardAccel * -0.006, -0.045, 0.045)))
      .add(bodyBasis.right.scale(clamp(sideAccel * -0.004, -0.035, 0.035)))
      .add(this.impactLean);
    const neck = chest.add(new Vector3(0, 0.33, 0));
    const head = neck.add(new Vector3(0, 0.19, 0));
    const shoulderL = chest.add(upperBasis.right.scale(-0.255)).add(new Vector3(0, 0.20, 0)).add(upperBasis.forward.scale(0.015));
    const shoulderR = chest.add(upperBasis.right.scale(0.255)).add(new Vector3(0, 0.20, 0)).add(upperBasis.forward.scale(0.015));

    const lookYawRate = clamp(control.lookYawRate || 0, -8.5, 8.5);
    const lookPitchRate = clamp(control.lookPitchRate || 0, -7.5, 7.5);
    const rateEnergy = clamp(Math.hypot(lookYawRate, lookPitchRate) / 7, 0, 1);

    let leftTarget = shoulderL
      .add(upperBasis.forward.scale(0.43))
      .add(upperBasis.right.scale(-0.17))
      .add(new Vector3(0, 0.02 + this.lookPitch * 0.31, 0));
    let rightTarget = shoulderR
      .add(upperBasis.forward.scale(0.43 + rateEnergy * 0.11))
      .add(upperBasis.right.scale(0.18 - lookYawRate * 0.018))
      .add(new Vector3(0, -0.11 + lookPitchRate * 0.012 + this.lookPitch * 0.09, 0));

    if (control.shieldPose) {
      leftTarget = shoulderL
        .add(upperBasis.right.scale(control.shieldPose.x ?? -0.13))
        .add(new Vector3(0, control.shieldPose.y ?? 0.04, 0))
        .add(upperBasis.forward.scale(control.shieldPose.z ?? 0.48));
    }
    if (control.weaponPose) {
      rightTarget = shoulderR
        .add(upperBasis.right.scale(control.weaponPose.x ?? 0.18))
        .add(new Vector3(0, control.weaponPose.y ?? -0.1, 0))
        .add(upperBasis.forward.scale(control.weaponPose.z ?? 0.43));
    }

    springVector(this.leftHand, leftTarget, snap ? 220 : 54, snap ? 35 : 12.5, dt);
    springVector(this.rightHand, rightTarget, snap ? 220 : 38, snap ? 35 : 8.2, dt);
    clampArm(this.leftHand, shoulderL, 0.655);
    clampArm(this.rightHand, shoulderR, 0.67);

    let swordTargetDir = upperBasis.forward
      .add(upperBasis.right.scale(0.10 - lookYawRate * 0.035))
      .add(new Vector3(0, 0.12 + this.lookPitch * 0.2 + lookPitchRate * 0.025, 0));
    if (control.weaponDir) {
      swordTargetDir = upperBasis.right.scale(control.weaponDir.x ?? 0)
        .add(new Vector3(0, control.weaponDir.y ?? 0, 0))
        .add(upperBasis.forward.scale(control.weaponDir.z ?? 1));
    }
    swordTargetDir.normalize();
    springVector(this.swordDirection, swordTargetDir, snap ? 190 : 31, snap ? 32 : 7.4, dt);
    if (this.swordDirection.position.lengthSquared() < 1e-5) this.swordDirection.position.copyFrom(upperBasis.forward);
    this.swordDirection.position.normalize();

    let shieldTargetNormal = upperBasis.forward.add(new Vector3(0, this.lookPitch * 0.36, 0)).normalize();
    if (control.shieldNormal) {
      shieldTargetNormal = upperBasis.right.scale(control.shieldNormal.x ?? 0)
        .add(new Vector3(0, control.shieldNormal.y ?? 0, 0))
        .add(upperBasis.forward.scale(control.shieldNormal.z ?? 1))
        .normalize();
    }
    springVector(this.shieldNormal, shieldTargetNormal, snap ? 180 : 46, snap ? 30 : 10.5, dt);
    this.shieldNormal.position.normalize();

    const elbowL = solveTwoBone(shoulderL, this.leftHand.position, 0.33, 0.32, upperBasis.right.scale(-1).add(new Vector3(0, -0.32, 0)));
    const elbowR = solveTwoBone(shoulderR, this.rightHand.position, 0.34, 0.33, upperBasis.right.add(new Vector3(0, -0.30, 0)));

    const hipL = pelvis.add(bodyBasis.right.scale(-0.13));
    const hipR = pelvis.add(bodyBasis.right.scale(0.13));
    const stride = gait * 0.34;
    const leftSwing = Math.sin(this.stepPhase);
    const rightSwing = -leftSwing;
    const leftLift = Math.max(0, Math.cos(this.stepPhase)) * gait * 0.095;
    const rightLift = Math.max(0, Math.cos(this.stepPhase + Math.PI)) * gait * 0.095;
    const footL = this.position
      .add(bodyBasis.right.scale(-0.15))
      .add(bodyBasis.forward.scale(leftSwing * stride))
      .add(new Vector3(0, 0.09 + leftLift, 0));
    const footR = this.position
      .add(bodyBasis.right.scale(0.15))
      .add(bodyBasis.forward.scale(rightSwing * stride))
      .add(new Vector3(0, 0.09 + rightLift, 0));
    const kneeL = solveTwoBone(hipL, footL, 0.47, 0.45, bodyBasis.forward.add(new Vector3(0, 0.05, 0)));
    const kneeR = solveTwoBone(hipR, footR, 0.47, 0.45, bodyBasis.forward.add(new Vector3(0, 0.05, 0)));

    const joints = { pelvis, spine: pelvis.add(chest).scale(0.5), chest, neck, head, shoulderL, elbowL, handL: this.leftHand.position, shoulderR, elbowR, handR: this.rightHand.position, hipL, kneeL, footL, hipR, kneeR, footR };
    for (const [name, position] of Object.entries(joints)) this.bones[name].setAbsolutePosition(position);

    setSegment(this.meshes.waist, pelvis.add(new Vector3(0, -0.08, 0)), chest.add(new Vector3(0, -0.22, 0)));
    setSegment(this.meshes.torso, pelvis.add(new Vector3(0, 0.08, 0)), chest.add(new Vector3(0, 0.17, 0)));
    setSegment(this.meshes.upperArmL, shoulderL, elbowL);
    setSegment(this.meshes.forearmL, elbowL, this.leftHand.position);
    setSegment(this.meshes.upperArmR, shoulderR, elbowR);
    setSegment(this.meshes.forearmR, elbowR, this.rightHand.position);
    setSegment(this.meshes.thighL, hipL, kneeL);
    setSegment(this.meshes.calfL, kneeL, footL);
    setSegment(this.meshes.thighR, hipR, kneeR);
    setSegment(this.meshes.calfR, kneeR, footR);

    this.meshes.head.position.copyFrom(head);
    this.meshes.helmet.position.copyFrom(head.add(new Vector3(0, 0.06, 0)));
    this.meshes.helmet.rotation.y = this.upperYaw;
    this.meshes.chestPlate.position.copyFrom(chest.add(upperBasis.forward.scale(0.17)).add(new Vector3(0, 0.02, 0)));
    this.meshes.chestPlate.rotation.y = this.upperYaw;
    this.meshes.chestPlate.rotation.x = -this.lookPitch * 0.12;
    this.meshes.tabard.position.copyFrom(pelvis.add(upperBasis.forward.scale(0.19)).add(new Vector3(0, 0.02, 0)));
    this.meshes.tabard.rotation.y = this.bodyYaw;

    this.sword.prevBase.copyFrom(this.sword.base);
    this.sword.prevTip.copyFrom(this.sword.tip);
    this.sword.base.copyFrom(this.rightHand.position);
    this.sword.tip.copyFrom(this.rightHand.position.add(this.swordDirection.position.scale(this.sword.length)));
    const tipVelocity = this.sword.tip.subtract(this.sword.prevTip).scale(1 / dt);
    const baseVelocity = this.sword.base.subtract(this.sword.prevBase).scale(1 / dt);
    this.sword.speed = tipVelocity.length();
    this.sword.angularSpeed = tipVelocity.subtract(baseVelocity).length() / this.sword.length;

    const bladeStart = this.sword.base.add(this.swordDirection.position.scale(0.10));
    const bladeEnd = this.sword.tip;
    setSegment(this.meshes.blade, bladeStart, bladeEnd, AXIS_Z);
    this.meshes.blade.scaling.x = 1;
    this.meshes.blade.scaling.y = 1;
    const gripEnd = this.sword.base.subtract(this.swordDirection.position.scale(0.18));
    setSegment(this.meshes.grip, gripEnd, this.sword.base, AXIS_Y);
    this.meshes.guard.position.copyFrom(this.sword.base.add(this.swordDirection.position.scale(0.015)));
    this.meshes.guard.rotationQuaternion = quatAxisTo(AXIS_Z, this.swordDirection.position);

    this.shield.prevCenter.copyFrom(this.shield.center);
    this.shield.prevNormal.copyFrom(this.shield.normal);
    this.shield.center.copyFrom(this.leftHand.position.add(this.shieldNormal.position.scale(0.03)));
    this.shield.normal.copyFrom(this.shieldNormal.position);
    const shieldRotation = quatAxisTo(AXIS_Y, this.shield.normal);
    this.meshes.shield.position.copyFrom(this.shield.center);
    this.meshes.shield.rotationQuaternion = shieldRotation;
    this.meshes.shieldRim.position.copyFrom(this.shield.center.add(this.shield.normal.scale(0.045)));
    this.meshes.shieldRim.rotationQuaternion = shieldRotation;
    this.meshes.shieldBoss.position.copyFrom(this.shield.center.add(this.shield.normal.scale(0.075)));

    this.stamina = damp(this.stamina, 100, 2.0, dt);
    this.stability = damp(this.stability, 100, 1.15, dt);
  }

  getCameraPose(viewYaw, viewPitch) {
    const basis = basisFromYaw(this.upperYaw);
    const head = this.bones.head.getAbsolutePosition();
    const acceleration = this.velocity.subtract(this.previousVelocity);
    return {
      position: head.add(basis.forward.scale(0.035)).add(new Vector3(acceleration.x * -0.004, 0.015, acceleration.z * -0.004)),
      yaw: viewYaw,
      pitch: viewPitch
    };
  }

  getSwordTrace() {
    return {
      owner: this,
      prevBase: this.sword.prevBase,
      prevTip: this.sword.prevTip,
      base: this.sword.base,
      tip: this.sword.tip,
      speed: this.sword.speed,
      angularSpeed: this.sword.angularSpeed,
      mass: this.sword.mass
    };
  }

  getShieldTrace() {
    return {
      owner: this,
      prevCenter: this.shield.prevCenter,
      prevNormal: this.shield.prevNormal,
      center: this.shield.center,
      normal: this.shield.normal,
      radius: this.shield.radius,
      mass: this.shield.mass
    };
  }

  getHitSpheres() {
    return [
      { name: 'head', center: this.bones.head.getAbsolutePosition(), radius: 0.18, multiplier: 1.35 },
      { name: 'chest', center: this.bones.chest.getAbsolutePosition(), radius: 0.32, multiplier: 1.0 },
      { name: 'abdomen', center: this.bones.pelvis.getAbsolutePosition().add(new Vector3(0, 0.16, 0)), radius: 0.27, multiplier: 0.92 },
      { name: 'leftArm', center: this.bones.elbowL.getAbsolutePosition(), radius: 0.16, multiplier: 0.72 },
      { name: 'rightArm', center: this.bones.elbowR.getAbsolutePosition(), radius: 0.16, multiplier: 0.72 },
      { name: 'leftLeg', center: this.bones.kneeL.getAbsolutePosition(), radius: 0.18, multiplier: 0.72 },
      { name: 'rightLeg', center: this.bones.kneeR.getAbsolutePosition(), radius: 0.18, multiplier: 0.72 }
    ];
  }

  applyWeaponImpulse(impulse) {
    this.rightHand.velocity.addInPlace(impulse.scale(0.74));
    this.swordDirection.velocity.addInPlace(impulse.scale(0.22));
    this.stamina = Math.max(0, this.stamina - impulse.length() * 2.2);
  }

  applyShieldImpulse(impulse) {
    this.leftHand.velocity.addInPlace(impulse.scale(0.9));
    this.shieldNormal.velocity.addInPlace(impulse.scale(0.18));
    this.stability = Math.max(0, this.stability - impulse.length() * 4.8);
  }

  applyBodyImpulse(impulse) {
    this.velocity.addInPlace(new Vector3(impulse.x, 0, impulse.z).scale(0.07));
    this.impactLeanVelocity.addInPlace(impulse.scale(0.018));
    this.stability = Math.max(0, this.stability - impulse.length() * 3.2);
  }

  takeDamage(amount, impulse) {
    if (this.dead || amount <= 0) return 0;
    const applied = Math.min(this.health, amount);
    this.health = Math.max(0, this.health - applied);
    this.hitFlash = 1;
    this.applyBodyImpulse(impulse);
    if (this.health <= 0) this.dead = true;
    return applied;
  }

  dispose() {
    for (const mesh of this.shadowMeshes) mesh.dispose();
    for (const bone of Object.values(this.bones)) bone.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.node.dispose();
  }
}
