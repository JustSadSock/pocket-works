import {
  Bone, Color3, Matrix, MeshBuilder, PBRMaterial, Quaternion,
  Skeleton, TransformNode, Vector3
} from '@babylonjs/core';
import { clamp } from './core.js';

const UP = new Vector3(0, 1, 0);

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
  const dir = end.subtract(start), len = dir.length();
  if (len < 1e-5) return;
  const d = dir.scale(1 / len), axis = Vector3.Cross(UP, d), axisLen = axis.length();
  let q;
  if (axisLen < 1e-5) q = d.y >= 0 ? Quaternion.Identity() : Quaternion.RotationAxis(Vector3.Right(), Math.PI);
  else q = Quaternion.RotationAxis(axis.scale(1 / axisLen), Math.acos(clamp(Vector3.Dot(UP, d), -1, 1)));
  node.position.copyFrom(start.add(end).scale(0.5));
  node.rotationQuaternion = q;
  node.scaling.set(1, len, 1);
}

function stableKnee(hip, ankle, forward, right, side) {
  const mid = hip.add(ankle).scale(0.5);
  const span = hip.subtract(ankle).length();
  const bend = clamp(0.12 + (1.02 - span) * 0.22, 0.105, 0.21);
  return mid
    .add(forward.scale(bend))
    .add(right.scale(side * 0.018))
    .add(new Vector3(0, 0.018, 0));
}

export class HumanoidRig {
  constructor(scene, shadowCasters, surface) {
    this.scene = scene;
    this.surface = surface;
    this.root = new TransformNode('body-root', scene);
    this.skeleton = new Skeleton('walker-skeleton', 'walker-skeleton', scene);
    this.bones = {}; this.nodes = {}; this.meshes = []; this.debugTargets = [];
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

  bone(name, parent = null) { const b = new Bone(name, this.skeleton, parent, Matrix.Identity()); this.bones[name] = b; return b; }
  linkedNode(name, bone, parent = null) { const n = new TransformNode(name, this.scene); if (parent) n.parent = parent; bone.linkTransformNode(n); this.nodes[name] = n; return n; }
  addMesh(mesh, parent, material, shadowCasters) {
    mesh.parent = parent; mesh.material = material; mesh.isPickable = false; mesh.receiveShadows = true;
    this.meshes.push(mesh); shadowCasters?.push(mesh); return mesh;
  }

  buildRig(shadowCasters) {
    const pants = makeMaterial(this.scene, 'dusty-pants', new Color3(0.29, 0.27, 0.22), 0.96);
    const pantsLight = makeMaterial(this.scene, 'dusty-pants-light', new Color3(0.36, 0.33, 0.27), 0.95);
    const boot = makeMaterial(this.scene, 'desert-boots', new Color3(0.115, 0.082, 0.055), 0.88);
    this.materials = [pants, pantsLight, boot];

    const pelvisBone = this.bone('pelvis');
    const spineBone = this.bone('spine', pelvisBone);
    const headBone = this.bone('head', spineBone);
    const shoulderLBone = this.bone('shoulderL', spineBone), shoulderRBone = this.bone('shoulderR', spineBone);
    const armLBone = this.bone('armL', shoulderLBone), armRBone = this.bone('armR', shoulderRBone);
    const legLBone = this.bone('legL', pelvisBone), kneeLBone = this.bone('kneeL', legLBone), footLBone = this.bone('footL', kneeLBone);
    const legRBone = this.bone('legR', pelvisBone), kneeRBone = this.bone('kneeR', legRBone), footRBone = this.bone('footR', kneeRBone);

    const pelvis = this.linkedNode('pelvis', pelvisBone, this.root);
    const spine = this.linkedNode('spine', spineBone, pelvis);
    this.linkedNode('head', headBone, spine);
    const shoulderL = this.linkedNode('shoulderL', shoulderLBone, spine), shoulderR = this.linkedNode('shoulderR', shoulderRBone, spine);
    this.linkedNode('armL', armLBone, shoulderL); this.linkedNode('armR', armRBone, shoulderR);
    const legL = this.linkedNode('legL', legLBone), kneeL = this.linkedNode('kneeL', kneeLBone), footL = this.linkedNode('footL', footLBone);
    const legR = this.linkedNode('legR', legRBone), kneeR = this.linkedNode('kneeR', kneeRBone), footR = this.linkedNode('footR', footRBone);

    pelvis.position.y = 0.98; spine.position.y = 0.38;
    shoulderL.position.set(-0.27, 0.26, 0); shoulderR.position.set(0.27, 0.26, 0);

    // First-person body awareness: only legs/boots are rendered. The old arm
    // cylinders could cross the camera and looked like giant poles when looking down.
    for (const [side, upperNode, lowerNode, footNode] of [
      ['l', legL, kneeL, footL], ['r', legR, kneeR, footR]
    ]) {
      const upper = MeshBuilder.CreateCylinder(`thigh-${side}`, {
        height: 1, diameterTop: 0.175, diameterBottom: 0.132, tessellation: 14
      }, this.scene);
      const lower = MeshBuilder.CreateCylinder(`shin-${side}`, {
        height: 1, diameterTop: 0.128, diameterBottom: 0.092, tessellation: 14
      }, this.scene);
      const knee = MeshBuilder.CreateSphere(`knee-${side}`, { diameter: 0.135, segments: 10 }, this.scene);
      const foot = MeshBuilder.CreateBox(`boot-${side}`, { width: 0.145, height: 0.085, depth: 0.29 }, this.scene);
      this.addMesh(upper, upperNode, pantsLight, shadowCasters);
      this.addMesh(lower, lowerNode, pants, shadowCasters);
      this.addMesh(knee, lowerNode, pants, shadowCasters);
      knee.position.y = 0.5;
      this.addMesh(foot, footNode, boot, shadowCasters);
      foot.position.z = 0.065;
    }

    for (const s of [-1, 1]) {
      const sphere = MeshBuilder.CreateSphere(`ik-${s}`, { diameter: 0.075, segments: 6 }, this.scene);
      sphere.isVisible = false; sphere.isPickable = false; this.debugTargets.push(sphere);
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
    const bob = Math.sin(controller.gait * 2) * 0.014 * speedNorm;
    this.nodes.pelvis.position.y = 0.98 + bob - slopeNorm * 0.012;
    this.nodes.spine.rotation.x = -controller.lastSlope * 0.12 * speedNorm;

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
    const hip = controller.localPosition.add(new Vector3(lateral.x, 0.955, lateral.z));

    const phase = ((controller.gait + state.offset) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
    const swinging = phase < 0.42 && controller.speed > 0.13;
    if (!state.initialized) {
      state.initialized = true;
      state.plant.copyFrom(this.makeFootCandidate(controller, state.side, -0.04));
      state.swingStart.copyFrom(state.plant); state.swingEnd.copyFrom(state.plant); state.swinging = swinging;
    }

    let landing = null;
    if (swinging && !state.swinging) {
      state.swingStart.copyFrom(state.plant);
      const stride = 0.20 + clamp(controller.speed / 3.25, 0, 1) * 0.25;
      state.swingEnd.copyFrom(this.makeFootCandidate(controller, state.side, stride));
    }
    if (!swinging && state.swinging) {
      state.plant.copyFrom(state.swingEnd);
      const gx = state.plant.x + controller.worldOffsetX, gz = state.plant.z + controller.worldOffsetZ;
      const n = this.sampleNormal(gx, gz);
      state.plant.y = this.sampleHeight(gx, gz) + 0.025;
      landing = { side: sideName, position: state.plant.clone(), globalX: gx, globalZ: gz, normal: n, yaw: controller.bodyYaw };
    }
    state.swinging = swinging;

    let ankle;
    if (swinging) {
      const t = clamp(phase / 0.42, 0, 1), ease = t * t * (3 - 2 * t);
      ankle = Vector3.Lerp(state.swingStart, state.swingEnd, ease);
      ankle.y += Math.sin(t * Math.PI) * (0.085 + controller.lastSlope * 0.04);
    } else {
      ankle = state.plant.clone();
      const gx = ankle.x + controller.worldOffsetX, gz = ankle.z + controller.worldOffsetZ;
      ankle.y = this.sampleHeight(gx, gz) + 0.025; state.plant.y = ankle.y;
    }

    const knee = stableKnee(hip, ankle, forward, right, state.side);
    orientYAxis(upperNode, hip, knee);
    orientYAxis(lowerNode, knee, ankle.add(new Vector3(0, 0.045, 0)));
    footNode.position.copyFrom(ankle);

    const gx = ankle.x + controller.worldOffsetX, gz = ankle.z + controller.worldOffsetZ;
    const n = this.sampleNormal(gx, gz), normalV = new Vector3(n.x, n.y, n.z);
    let tangentForward = forward.subtract(normalV.scale(Vector3.Dot(forward, normalV)));
    if (tangentForward.lengthSquared() < 1e-5) tangentForward = forward.clone();
    tangentForward.normalize();
    footNode.rotationQuaternion = Quaternion.FromLookDirectionLH(tangentForward, normalV);
    this.debugTargets[left ? 0 : 1].position.copyFrom(ankle);
    return landing;
  }

  makeFootCandidate(controller, side, forwardOffset) {
    const sideVec = rotateXZ(side * 0.145, forwardOffset, controller.bodyYaw);
    const x = controller.localPosition.x + sideVec.x, z = controller.localPosition.z + sideVec.z;
    const gx = x + controller.worldOffsetX, gz = z + controller.worldOffsetZ;
    return new Vector3(x, this.sampleHeight(gx, gz) + 0.025, z);
  }

  setDebugTargets(enabled) { for (const sphere of this.debugTargets) sphere.isVisible = enabled; }
  dispose() {
    for (const mesh of this.meshes) mesh.dispose(); for (const sphere of this.debugTargets) sphere.dispose();
    for (const node of Object.values(this.nodes)) node.dispose(); for (const material of this.materials) material.dispose();
    this.skeleton.dispose(); this.root.dispose();
  }
}
