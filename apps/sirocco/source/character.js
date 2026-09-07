import {
  Bone, Color3, Matrix, MeshBuilder, PBRMaterial, Quaternion,
  Skeleton, TransformNode, Vector3
} from '@babylonjs/core';
import { clamp } from './core.js';

const UP = new Vector3(0, 1, 0);
const UPPER_LEG = 0.515;
const LOWER_LEG = 0.505;

function makeMaterial(scene, name, color, roughness = 0.9) {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = color;
  mat.metallic = 0;
  mat.roughness = roughness;
  return mat;
}

function rotateXZ(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}

function orientYAxis(node, start, end) {
  const dir = end.subtract(start);
  const len = dir.length();
  if (len < 1e-5) return;
  const d = dir.scale(1 / len);
  const axis = Vector3.Cross(UP, d);
  const axisLen = axis.length();
  let q;
  if (axisLen < 1e-5) q = d.y >= 0 ? Quaternion.Identity() : Quaternion.RotationAxis(Vector3.Right(), Math.PI);
  else q = Quaternion.RotationAxis(axis.scale(1 / axisLen), Math.acos(clamp(Vector3.Dot(UP, d), -1, 1)));
  node.position.copyFrom(start.add(end).scale(0.5));
  node.rotationQuaternion = q;
  node.scaling.set(1, len, 1);
}

function solveKnee(hip, ankle, forward, right, side) {
  const delta = ankle.subtract(hip);
  const rawDistance = Math.max(0.001, delta.length());
  const distance = clamp(rawDistance, 0.18, UPPER_LEG + LOWER_LEG - 0.018);
  const dir = delta.scale(1 / rawDistance);
  const along = (UPPER_LEG * UPPER_LEG - LOWER_LEG * LOWER_LEG + distance * distance) / (2 * distance);
  const bendHeight = Math.sqrt(Math.max(0, UPPER_LEG * UPPER_LEG - along * along));
  let bend = forward.subtract(dir.scale(Vector3.Dot(forward, dir)));
  if (bend.lengthSquared() < 1e-5) bend = right.scale(side * 0.08).add(new Vector3(0, 0, 1));
  bend.normalize();
  return hip.add(dir.scale(along)).add(bend.scale(bendHeight)).add(right.scale(side * 0.012));
}

export class HumanoidRig {
  constructor(scene, shadowCasters, surface) {
    this.scene = scene;
    this.surface = surface;
    this.root = new TransformNode('body-root', scene);
    this.skeleton = new Skeleton('walker-skeleton', 'walker-skeleton', scene);
    this.bones = {};
    this.nodes = {};
    this.meshes = [];
    this.debugTargets = [];
    this.footState = {
      left: this.makeFootState(-1, Math.PI),
      right: this.makeFootState(1, 0)
    };
    this.buildRig(shadowCasters);
  }

  sampleHeight(x, z) { return this.surface?.sampleHeight?.(x, z) ?? 0; }
  sampleNormal(x, z) { return this.surface?.sampleNormal?.(x, z) ?? { x: 0, y: 1, z: 0 }; }

  makeFootState(side, offset) {
    return { side, offset, swinging: false, initialized: false, plant: new Vector3(), swingStart: new Vector3(), swingEnd: new Vector3() };
  }

  bone(name, parent = null) {
    const b = new Bone(name, this.skeleton, parent, Matrix.Identity());
    this.bones[name] = b;
    return b;
  }

  linkedNode(name, bone, parent = null) {
    const n = new TransformNode(name, this.scene);
    if (parent) n.parent = parent;
    bone.linkTransformNode(n);
    this.nodes[name] = n;
    return n;
  }

  addMesh(mesh, parent, material, shadowCasters) {
    mesh.parent = parent;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.meshes.push(mesh);
    shadowCasters?.push(mesh);
    return mesh;
  }

  buildRig(shadowCasters) {
    const robe = makeMaterial(this.scene, 'bedouin-robe', new Color3(0.78, 0.72, 0.61), 0.97);
    const robeShade = makeMaterial(this.scene, 'bedouin-robe-shadow', new Color3(0.60, 0.54, 0.45), 0.98);
    const trousers = makeMaterial(this.scene, 'bedouin-trousers', new Color3(0.34, 0.31, 0.26), 0.96);
    const wrap = makeMaterial(this.scene, 'bedouin-leg-wrap', new Color3(0.55, 0.47, 0.37), 0.98);
    const leather = makeMaterial(this.scene, 'bedouin-leather', new Color3(0.14, 0.09, 0.055), 0.91);
    const sash = makeMaterial(this.scene, 'bedouin-sash', new Color3(0.33, 0.095, 0.065), 0.94);
    const skin = makeMaterial(this.scene, 'bedouin-skin', new Color3(0.48, 0.29, 0.18), 0.86);
    this.materials = [robe, robeShade, trousers, wrap, leather, sash, skin];

    const pelvisBone = this.bone('pelvis');
    const spineBone = this.bone('spine', pelvisBone);
    const headBone = this.bone('head', spineBone);
    const shoulderLBone = this.bone('shoulderL', spineBone);
    const shoulderRBone = this.bone('shoulderR', spineBone);
    const armLBone = this.bone('armL', shoulderLBone);
    const armRBone = this.bone('armR', shoulderRBone);
    const legLBone = this.bone('legL', pelvisBone);
    const kneeLBone = this.bone('kneeL', legLBone);
    const footLBone = this.bone('footL', kneeLBone);
    const legRBone = this.bone('legR', pelvisBone);
    const kneeRBone = this.bone('kneeR', legRBone);
    const footRBone = this.bone('footR', kneeRBone);

    const pelvis = this.linkedNode('pelvis', pelvisBone, this.root);
    const spine = this.linkedNode('spine', spineBone, pelvis);
    this.linkedNode('head', headBone, spine);
    const shoulderL = this.linkedNode('shoulderL', shoulderLBone, spine);
    const shoulderR = this.linkedNode('shoulderR', shoulderRBone, spine);
    const armL = this.linkedNode('armL', armLBone, shoulderL);
    const armR = this.linkedNode('armR', armRBone, shoulderR);
    const legL = this.linkedNode('legL', legLBone);
    const kneeL = this.linkedNode('kneeL', kneeLBone);
    const footL = this.linkedNode('footL', footLBone);
    const legR = this.linkedNode('legR', legRBone);
    const kneeR = this.linkedNode('kneeR', kneeRBone);
    const footR = this.linkedNode('footR', footRBone);

    pelvis.position.y = 0.99;
    spine.position.y = 0.39;
    shoulderL.position.set(-0.245, 0.25, 0.005);
    shoulderR.position.set(0.245, 0.25, 0.005);
    armL.position.set(0, -0.22, 0.01);
    armR.position.set(0, -0.22, 0.01);

    // Lower thobe: kept well below the head camera so body awareness is visible
    // when looking down without ever becoming the giant screen-filling torso blob.
    const skirt = this.addMesh(MeshBuilder.CreateCylinder('thobe-skirt', {
      height: 0.46, diameterTop: 0.35, diameterBottom: 0.46, tessellation: 20
    }, this.scene), pelvis, robe, shadowCasters);
    skirt.position.y = -0.22;
    skirt.position.z = -0.015;

    const belt = this.addMesh(MeshBuilder.CreateTorus('robe-belt', {
      diameter: 0.355, thickness: 0.036, tessellation: 24
    }, this.scene), pelvis, sash, shadowCasters);
    belt.position.y = 0.015;
    belt.rotation.x = Math.PI * 0.5;

    const frontPanel = this.addMesh(MeshBuilder.CreateBox('robe-front-panel', {
      width: 0.28, height: 0.43, depth: 0.035
    }, this.scene), pelvis, robeShade, shadowCasters);
    frontPanel.position.set(0, -0.225, 0.205);
    frontPanel.rotation.x = -0.035;

    for (const [side, upperNode, lowerNode, footNode] of [
      ['l', legL, kneeL, footL], ['r', legR, kneeR, footR]
    ]) {
      const upper = MeshBuilder.CreateCylinder(`thigh-${side}`, {
        height: 1, diameterTop: 0.188, diameterBottom: 0.145, tessellation: 18
      }, this.scene);
      const lower = MeshBuilder.CreateCylinder(`shin-${side}`, {
        height: 1, diameterTop: 0.138, diameterBottom: 0.105, tessellation: 18
      }, this.scene);
      const knee = MeshBuilder.CreateSphere(`knee-${side}`, { diameter: 0.145, segments: 12 }, this.scene);
      const ankleWrap = MeshBuilder.CreateCylinder(`ankle-wrap-${side}`, { height: 0.13, diameter: 0.118, tessellation: 16 }, this.scene);
      const foot = MeshBuilder.CreateCapsule(`desert-boot-${side}`, { radius: 0.072, height: 0.31, tessellation: 14 }, this.scene);

      this.addMesh(upper, upperNode, trousers, shadowCasters);
      this.addMesh(lower, lowerNode, trousers, shadowCasters);
      this.addMesh(knee, lowerNode, trousers, shadowCasters);
      knee.position.y = 0.5;
      this.addMesh(ankleWrap, lowerNode, wrap, shadowCasters);
      ankleWrap.position.y = -0.43;
      this.addMesh(foot, footNode, leather, shadowCasters);
      foot.rotation.x = Math.PI * 0.5;
      foot.position.z = 0.065;
      foot.scaling.y = 0.78;
    }

    // Sleeves and hands stay close to the sides. They enter view naturally when
    // looking down but never cross the camera like the previous full arm poles.
    for (const [side, armNode] of [['l', armL], ['r', armR]]) {
      const sleeve = this.addMesh(MeshBuilder.CreateCapsule(`sleeve-${side}`, {
        radius: 0.068, height: 0.40, tessellation: 14
      }, this.scene), armNode, robe, shadowCasters);
      sleeve.position.y = -0.10;
      const cuff = this.addMesh(MeshBuilder.CreateCylinder(`cuff-${side}`, {
        height: 0.07, diameter: 0.125, tessellation: 14
      }, this.scene), armNode, sash, shadowCasters);
      cuff.position.y = -0.31;
      const hand = this.addMesh(MeshBuilder.CreateCapsule(`hand-${side}`, {
        radius: 0.052, height: 0.17, tessellation: 12
      }, this.scene), armNode, skin, shadowCasters);
      hand.position.y = -0.40;
    }

    for (const s of [-1, 1]) {
      const sphere = MeshBuilder.CreateSphere(`ik-${s}`, { diameter: 0.075, segments: 6 }, this.scene);
      sphere.isVisible = false;
      sphere.isPickable = false;
      this.debugTargets.push(sphere);
    }
  }

  shiftOrigin(dx, dz) {
    for (const state of Object.values(this.footState)) {
      state.plant.x -= dx; state.plant.z -= dz;
      state.swingStart.x -= dx; state.swingStart.z -= dz;
      state.swingEnd.x -= dx; state.swingEnd.z -= dz;
    }
  }

  update(controller) {
    this.root.position.copyFrom(controller.localPosition);
    this.root.rotation.y = controller.bodyYaw;
    const speedNorm = clamp(controller.speed / 3.25, 0, 1);
    const slopeNorm = clamp(controller.lastSlope / 0.65, 0, 1);
    const bob = Math.sin(controller.gait * 2) * 0.013 * speedNorm;
    this.nodes.pelvis.position.y = 0.99 + bob - slopeNorm * 0.012;
    this.nodes.spine.rotation.x = -controller.lastSlope * 0.11 * speedNorm;

    const armSwing = Math.sin(controller.gait) * 0.28 * speedNorm;
    this.nodes.armL.rotation.x = armSwing;
    this.nodes.armR.rotation.x = -armSwing;
    this.nodes.armL.rotation.z = -0.05;
    this.nodes.armR.rotation.z = 0.05;

    const forward = new Vector3(Math.sin(controller.bodyYaw), 0, Math.cos(controller.bodyYaw));
    const right = new Vector3(Math.cos(controller.bodyYaw), 0, -Math.sin(controller.bodyYaw));
    return [
      this.updateLeg(this.footState.left, controller, forward, right),
      this.updateLeg(this.footState.right, controller, forward, right)
    ].filter(Boolean);
  }

  updateLeg(state, controller, forward, right) {
    const left = state.side < 0;
    const sideName = left ? 'left' : 'right';
    const upperNode = this.nodes[left ? 'legL' : 'legR'];
    const lowerNode = this.nodes[left ? 'kneeL' : 'kneeR'];
    const footNode = this.nodes[left ? 'footL' : 'footR'];
    const lateral = rotateXZ(state.side * 0.145, 0.005, controller.bodyYaw);
    const hip = controller.localPosition.add(new Vector3(lateral.x, 0.96, lateral.z));

    const phase = ((controller.gait + state.offset) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
    const swinging = phase < 0.42 && controller.speed > 0.13;
    if (!state.initialized) {
      state.initialized = true;
      state.plant.copyFrom(this.makeFootCandidate(controller, state.side, -0.04));
      state.swingStart.copyFrom(state.plant);
      state.swingEnd.copyFrom(state.plant);
      state.swinging = swinging;
    }

    let landing = null;
    if (swinging && !state.swinging) {
      state.swingStart.copyFrom(state.plant);
      const stride = 0.19 + clamp(controller.speed / 3.25, 0, 1) * 0.23;
      state.swingEnd.copyFrom(this.makeFootCandidate(controller, state.side, stride));
    }
    if (!swinging && state.swinging) {
      state.plant.copyFrom(state.swingEnd);
      const gx = state.plant.x + controller.worldOffsetX;
      const gz = state.plant.z + controller.worldOffsetZ;
      const n = this.sampleNormal(gx, gz);
      state.plant.y = this.sampleHeight(gx, gz) + 0.022;
      landing = { side: sideName, position: state.plant.clone(), globalX: gx, globalZ: gz, normal: n, yaw: controller.bodyYaw };
    }
    state.swinging = swinging;

    let ankle;
    if (swinging) {
      const t = clamp(phase / 0.42, 0, 1);
      const ease = t * t * (3 - 2 * t);
      ankle = Vector3.Lerp(state.swingStart, state.swingEnd, ease);
      ankle.y += Math.sin(t * Math.PI) * (0.085 + controller.lastSlope * 0.04);
    } else {
      ankle = state.plant.clone();
      const gx = ankle.x + controller.worldOffsetX;
      const gz = ankle.z + controller.worldOffsetZ;
      ankle.y = this.sampleHeight(gx, gz) + 0.022;
      state.plant.y = ankle.y;
    }

    const knee = solveKnee(hip, ankle.add(new Vector3(0, 0.04, 0)), forward, right, state.side);
    orientYAxis(upperNode, hip, knee);
    orientYAxis(lowerNode, knee, ankle.add(new Vector3(0, 0.045, 0)));
    footNode.position.copyFrom(ankle);

    const gx = ankle.x + controller.worldOffsetX;
    const gz = ankle.z + controller.worldOffsetZ;
    const n = this.sampleNormal(gx, gz);
    const normalV = new Vector3(n.x, n.y, n.z);
    let tangentForward = forward.subtract(normalV.scale(Vector3.Dot(forward, normalV)));
    if (tangentForward.lengthSquared() < 1e-5) tangentForward = forward.clone();
    tangentForward.normalize();
    footNode.rotationQuaternion = Quaternion.FromLookDirectionLH(tangentForward, normalV);
    this.debugTargets[left ? 0 : 1].position.copyFrom(ankle);
    return landing;
  }

  makeFootCandidate(controller, side, forwardOffset) {
    const sideVec = rotateXZ(side * 0.145, forwardOffset, controller.bodyYaw);
    const x = controller.localPosition.x + sideVec.x;
    const z = controller.localPosition.z + sideVec.z;
    const gx = x + controller.worldOffsetX;
    const gz = z + controller.worldOffsetZ;
    return new Vector3(x, this.sampleHeight(gx, gz) + 0.022, z);
  }

  setDebugTargets(enabled) { for (const sphere of this.debugTargets) sphere.isVisible = enabled; }

  dispose() {
    for (const mesh of this.meshes) mesh.dispose();
    for (const sphere of this.debugTargets) sphere.dispose();
    for (const node of Object.values(this.nodes)) node.dispose();
    for (const material of this.materials) material.dispose();
    this.skeleton.dispose();
    this.root.dispose();
  }
}
