import {
  Bone, Color3, Matrix, MeshBuilder, PBRMaterial, Quaternion,
  Skeleton, TransformNode, Vector3
} from '@babylonjs/core';
import { clamp } from './core.js';
import { terrainHeight, terrainNormal } from './terrain.js';

const UP = new Vector3(0, 1, 0);
const UPPER = 0.53;
const LOWER = 0.54;
function makeMaterial(scene, name, color, roughness = 0.82) { const mat = new PBRMaterial(name, scene); mat.albedoColor = color; mat.metallic = 0; mat.roughness = roughness; return mat; }
function rotateXZ(x, z, yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); return { x: x * c + z * s, z: -x * s + z * c }; }
function orientYAxis(node, start, end) {
  const dir = end.subtract(start), len = dir.length(); if (len < 1e-5) return;
  const d = dir.scale(1 / len), axis = Vector3.Cross(UP, d), axisLen = axis.length();
  let q; if (axisLen < 1e-5) q = d.y >= 0 ? Quaternion.Identity() : Quaternion.RotationAxis(Vector3.Right(), Math.PI);
  else q = Quaternion.RotationAxis(axis.scale(1 / axisLen), Math.acos(clamp(Vector3.Dot(UP, d), -1, 1)));
  node.position.copyFrom(start.add(end).scale(0.5)); node.rotationQuaternion = q; node.scaling.y = len;
}
function solveKnee(hip, foot, forward, side) {
  const delta = foot.subtract(hip), rawD = delta.length(), d = clamp(rawD, 0.16, UPPER + LOWER - 0.025), dir = delta.scale(1 / (rawD || 1));
  const a = (UPPER * UPPER - LOWER * LOWER + d * d) / (2 * d), h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  let bend = forward.subtract(dir.scale(Vector3.Dot(forward, dir))); if (bend.lengthSquared() < 1e-4) bend = new Vector3(side * 0.05, 0, 1); bend.normalize();
  return hip.add(dir.scale(a)).add(bend.scale(h));
}
export class HumanoidRig {
  constructor(scene, shadowCasters) {
    this.scene = scene; this.root = new TransformNode('body-root', scene); this.skeleton = new Skeleton('walker-skeleton', 'walker-skeleton', scene);
    this.bones = {}; this.nodes = {}; this.meshes = []; this.debugTargets = [];
    this.footState = { left: this.makeFootState(-1, Math.PI), right: this.makeFootState(1, 0) }; this.prevGait = 0; this.buildRig(shadowCasters);
  }
  makeFootState(side, offset) { return { side, offset, swinging: false, initialized: false, plant: new Vector3(), swingStart: new Vector3(), swingEnd: new Vector3(), lastNorm: 0 }; }
  bone(name, parent = null) { const b = new Bone(name, this.skeleton, parent, Matrix.Identity()); this.bones[name] = b; return b; }
  linkedNode(name, bone, parent = null) { const n = new TransformNode(name, this.scene); if (parent) n.parent = parent; bone.linkTransformNode(n); this.nodes[name] = n; return n; }
  addMesh(mesh, parent, material, shadowCasters) { mesh.parent = parent; mesh.material = material; mesh.isPickable = false; mesh.receiveShadows = true; this.meshes.push(mesh); shadowCasters?.push(mesh); return mesh; }
  buildRig(shadowCasters) {
    const linen = makeMaterial(this.scene, 'linen', new Color3(0.37, 0.33, 0.25), 0.95), cloth = makeMaterial(this.scene, 'cloth', new Color3(0.58, 0.48, 0.33), 0.93), skin = makeMaterial(this.scene, 'skin', new Color3(0.55, 0.34, 0.22), 0.82), boot = makeMaterial(this.scene, 'boot', new Color3(0.14, 0.105, 0.075), 0.84);
    this.materials = [linen, cloth, skin, boot];
    const pelvisBone = this.bone('pelvis'), spineBone = this.bone('spine', pelvisBone), headBone = this.bone('head', spineBone), shoulderLBone = this.bone('shoulderL', spineBone), shoulderRBone = this.bone('shoulderR', spineBone), armLBone = this.bone('armL', shoulderLBone), armRBone = this.bone('armR', shoulderRBone), legLBone = this.bone('legL', pelvisBone), kneeLBone = this.bone('kneeL', legLBone), footLBone = this.bone('footL', kneeLBone), legRBone = this.bone('legR', pelvisBone), kneeRBone = this.bone('kneeR', legRBone), footRBone = this.bone('footR', kneeRBone);
    const pelvis = this.linkedNode('pelvis', pelvisBone, this.root), spine = this.linkedNode('spine', spineBone, pelvis), head = this.linkedNode('head', headBone, spine), shoulderL = this.linkedNode('shoulderL', shoulderLBone, spine), shoulderR = this.linkedNode('shoulderR', shoulderRBone, spine), armL = this.linkedNode('armL', armLBone, shoulderL), armR = this.linkedNode('armR', armRBone, shoulderR), legL = this.linkedNode('legL', legLBone), kneeL = this.linkedNode('kneeL', kneeLBone), footL = this.linkedNode('footL', footLBone), legR = this.linkedNode('legR', legRBone), kneeR = this.linkedNode('kneeR', kneeRBone), footR = this.linkedNode('footR', footRBone);
    pelvis.position.y = 0.98; spine.position.y = 0.38; head.position.y = 0.46; shoulderL.position.set(-0.27, 0.26, 0); shoulderR.position.set(0.27, 0.26, 0); armL.position.y = -0.18; armR.position.y = -0.18;
    // Do not render torso/pelvis in first person: their upper caps sit centimetres below the eye and used to fill the lower half of the screen.
    const upperArmL = this.addMesh(MeshBuilder.CreateCylinder('upper-arm-l', { height: 0.38, diameter: 0.095, tessellation: 8 }, this.scene), armL, skin, shadowCasters);
    const upperArmR = this.addMesh(MeshBuilder.CreateCylinder('upper-arm-r', { height: 0.38, diameter: 0.095, tessellation: 8 }, this.scene), armR, skin, shadowCasters);
    upperArmL.position.y = -0.17; upperArmR.position.y = -0.17;
    for (const [side, upperNode, lowerNode, footNode] of [['l', legL, kneeL, footL], ['r', legR, kneeR, footR]]) {
      const upperMesh = MeshBuilder.CreateCylinder(`thigh-${side}`, { height: 1, diameterTop: 0.16, diameterBottom: 0.13, tessellation: 9 }, this.scene), lowerMesh = MeshBuilder.CreateCylinder(`shin-${side}`, { height: 1, diameterTop: 0.135, diameterBottom: 0.105, tessellation: 9 }, this.scene), footMesh = MeshBuilder.CreateBox(`boot-${side}`, { width: 0.15, height: 0.095, depth: 0.31 }, this.scene);
      this.addMesh(upperMesh, upperNode, cloth, shadowCasters); this.addMesh(lowerMesh, lowerNode, cloth, shadowCasters); this.addMesh(footMesh, footNode, boot, shadowCasters); footMesh.position.z = 0.08;
    }
    for (const s of [-1, 1]) { const sphere = MeshBuilder.CreateSphere(`ik-${s}`, { diameter: 0.075, segments: 6 }, this.scene); sphere.isVisible = false; sphere.isPickable = false; this.debugTargets.push(sphere); }
  }
  shiftOrigin(dx, dz) { for (const state of Object.values(this.footState)) { state.plant.x -= dx; state.plant.z -= dz; state.swingStart.x -= dx; state.swingStart.z -= dz; state.swingEnd.x -= dx; state.swingEnd.z -= dz; } }
  update(controller, dt) {
    const pos = controller.localPosition; this.root.position.copyFrom(pos); this.root.rotation.y = controller.bodyYaw;
    const speedNorm = clamp(controller.speed / 3.25, 0, 1), slopeNorm = clamp(controller.lastSlope / 0.65, 0, 1), bob = Math.sin(controller.gait * 2) * 0.018 * speedNorm;
    this.nodes.pelvis.position.y = 0.97 + bob - slopeNorm * 0.015; this.nodes.spine.rotation.x = -controller.lastSlope * 0.17 * speedNorm - speedNorm * 0.025;
    const armSwing = Math.sin(controller.gait) * 0.42 * speedNorm; this.nodes.armL.rotation.x = armSwing; this.nodes.armR.rotation.x = -armSwing;
    const forward = new Vector3(Math.sin(controller.bodyYaw), 0, Math.cos(controller.bodyYaw));
    return [this.updateLeg(this.footState.left, controller, forward), this.updateLeg(this.footState.right, controller, forward)].filter(Boolean);
  }
  updateLeg(state, controller, forward) {
    const sideName = state.side < 0 ? 'left' : 'right', legNode = this.nodes[state.side < 0 ? 'legL' : 'legR'], kneeNode = this.nodes[state.side < 0 ? 'kneeL' : 'kneeR'], footNode = this.nodes[state.side < 0 ? 'footL' : 'footR'];
    const lateral = rotateXZ(state.side * 0.145, 0.01, controller.bodyYaw), hip = controller.localPosition.add(new Vector3(lateral.x, 0.95, lateral.z));
    const norm = ((controller.gait + state.offset) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2), swinging = norm < 0.42 && controller.speed > 0.13;
    if (!state.initialized) { state.initialized = true; state.plant.copyFrom(this.makeFootCandidate(controller, state.side, -0.05)); state.swingStart.copyFrom(state.plant); state.swingEnd.copyFrom(state.plant); state.swinging = swinging; }
    let landing = null;
    if (swinging && !state.swinging) { state.swingStart.copyFrom(state.plant); const stride = 0.26 + clamp(controller.speed / 3.25, 0, 1) * 0.32; state.swingEnd.copyFrom(this.makeFootCandidate(controller, state.side, stride)); }
    if (!swinging && state.swinging) { state.plant.copyFrom(state.swingEnd); const gx = state.plant.x + controller.worldOffsetX, gz = state.plant.z + controller.worldOffsetZ, n = terrainNormal(gx, gz); state.plant.y = terrainHeight(gx, gz) + 0.035; landing = { side: sideName, position: state.plant.clone(), globalX: gx, globalZ: gz, normal: n, yaw: controller.bodyYaw }; }
    state.swinging = swinging;
    let foot;
    if (swinging) { const t = clamp(norm / 0.42, 0, 1), ease = t * t * (3 - 2 * t); foot = Vector3.Lerp(state.swingStart, state.swingEnd, ease); foot.y += Math.sin(t * Math.PI) * (0.11 + controller.lastSlope * 0.07); }
    else { foot = state.plant.clone(); const gx = foot.x + controller.worldOffsetX, gz = foot.z + controller.worldOffsetZ; foot.y = terrainHeight(gx, gz) + 0.032; state.plant.y = foot.y; }
    const knee = solveKnee(hip, foot.add(new Vector3(0, 0.05, -0.04)), forward, state.side); orientYAxis(legNode, hip, knee); orientYAxis(kneeNode, knee, foot.add(new Vector3(0, 0.055, 0))); legNode.scaling.x = 1; legNode.scaling.z = 1; kneeNode.scaling.x = 1; kneeNode.scaling.z = 1; footNode.position.copyFrom(foot);
    const gx = foot.x + controller.worldOffsetX, gz = foot.z + controller.worldOffsetZ, n = terrainNormal(gx, gz), normalV = new Vector3(n.x, n.y, n.z), tangentForward = forward.subtract(normalV.scale(Vector3.Dot(forward, normalV))).normalize(); footNode.rotationQuaternion = Quaternion.FromLookDirectionLH(tangentForward, normalV); this.debugTargets[state.side < 0 ? 0 : 1].position.copyFrom(foot); return landing;
  }
  makeFootCandidate(controller, side, forwardOffset) { const sideVec = rotateXZ(side * 0.145, forwardOffset, controller.bodyYaw), x = controller.localPosition.x + sideVec.x, z = controller.localPosition.z + sideVec.z, gx = x + controller.worldOffsetX, gz = z + controller.worldOffsetZ; return new Vector3(x, terrainHeight(gx, gz) + 0.035, z); }
  setDebugTargets(enabled) { for (const sphere of this.debugTargets) sphere.isVisible = enabled; }
  dispose() { for (const mesh of this.meshes) mesh.dispose(); for (const sphere of this.debugTargets) sphere.dispose(); for (const node of Object.values(this.nodes)) node.dispose(); for (const material of this.materials) material.dispose(); this.skeleton.dispose(); this.root.dispose(); }
}
