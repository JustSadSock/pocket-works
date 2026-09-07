import '@babylonjs/loaders/glTF';
import {
  Color3, MeshBuilder, PBRMaterial, Quaternion, SceneLoader, TransformNode, Vector3
} from '@babylonjs/core';
import { clamp, damp } from './core.js';

const UP = new Vector3(0, 1, 0);
const TARGET_HEIGHT = 1.80;

function makeMaterial(scene, name, color, roughness = 0.94) {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color;
  material.metallic = 0;
  material.roughness = roughness;
  return material;
}

function orientYAxis(mesh, start, end) {
  const direction = end.subtract(start);
  const length = direction.length();
  if (length < 1e-5) return;
  const d = direction.scale(1 / length);
  const axis = Vector3.Cross(UP, d);
  const axisLength = axis.length();
  mesh.position.copyFrom(start.add(end).scale(0.5));
  mesh.scaling.set(1, length, 1);
  mesh.rotationQuaternion = axisLength < 1e-5
    ? (d.y >= 0 ? Quaternion.Identity() : Quaternion.RotationAxis(Vector3.Right(), Math.PI))
    : Quaternion.RotationAxis(axis.scale(1 / axisLength), Math.acos(clamp(Vector3.Dot(UP, d), -1, 1)));
}

function chooseAnimation(groups, pattern, reject = null) {
  return groups.find((group) => pattern.test(group.name) && (!reject || !reject.test(group.name))) || null;
}

function sideCandidates(skeleton, pattern) {
  return skeleton?.bones
    ?.filter((bone) => pattern.test(bone.name))
    .map((bone) => ({ bone, node: bone.getTransformNode?.() }))
    .filter((entry) => entry.node) || [];
}

function splitLeftRight(entries) {
  if (!entries.length) return { left: null, right: null };
  const explicitLeft = entries.find(({ bone }) => /left|(^|[_. -])l($|[_. -])/i.test(bone.name));
  const explicitRight = entries.find(({ bone }) => /right|(^|[_. -])r($|[_. -])/i.test(bone.name));
  if (explicitLeft || explicitRight) return { left: explicitLeft?.node || null, right: explicitRight?.node || null };
  const sorted = [...entries].sort((a, b) => a.node.getAbsolutePosition().x - b.node.getAbsolutePosition().x);
  return { left: sorted[0]?.node || null, right: sorted.at(-1)?.node || null };
}

export class HumanoidRig {
  constructor(scene, shadowCasters, surface) {
    this.scene = scene;
    this.surface = surface;
    this.shadowCasters = shadowCasters;
    this.root = new TransformNode('bedouin-body-root', scene);
    this.meshes = [];
    this.garments = [];
    this.materials = [];
    this.animationGroups = [];
    this.walkWeight = 0;
    this.visualLift = 0;
    this.baseModelY = 0;
    this.debugTargets = [];
    this.footState = {
      left: { initialized: false, plant: new Vector3(), previousDistance: 1, previousVelocity: 0, cooldown: 0 },
      right: { initialized: false, plant: new Vector3(), previousDistance: 1, previousVelocity: 0, cooldown: 0 }
    };
  }

  async init() {
    const imported = await SceneLoader.ImportMeshAsync('', './models/', 'human.glb', this.scene);
    this.animationGroups = imported.animationGroups || [];
    this.skeleton = imported.skeletons?.[0] || null;
    this.modelRoot = imported.meshes.find((mesh) => mesh.name === '__root__') || imported.meshes[0];
    if (!this.modelRoot || !this.skeleton) throw new Error('Animated CC0 humanoid did not contain the expected root/skeleton');

    this.modelRoot.parent = this.root;
    for (const mesh of imported.meshes) {
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      if (mesh !== this.modelRoot && mesh.getTotalVertices?.() > 0) {
        this.meshes.push(mesh);
        this.shadowCasters?.push(mesh);
      }
    }

    this.fitModelToHeight();
    this.resolveBones();
    this.buildBedouinGarments();
    this.configureAnimations();
    this.ready = true;
  }

  fitModelToHeight() {
    this.root.computeWorldMatrix(true);
    this.modelRoot.computeWorldMatrix(true);
    let bounds = this.modelRoot.getHierarchyBoundingVectors(true);
    const rawHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
    this.modelRoot.scaling.scaleInPlace(TARGET_HEIGHT / rawHeight);
    this.modelRoot.computeWorldMatrix(true);
    bounds = this.modelRoot.getHierarchyBoundingVectors(true);
    this.baseModelY = -bounds.min.y;
    this.modelRoot.position.y += this.baseModelY;
  }

  resolveBones() {
    this.feet = splitLeftRight(sideCandidates(this.skeleton, /foot|ankle/i));
    this.hands = splitLeftRight(sideCandidates(this.skeleton, /hand|wrist/i));
    this.elbows = splitLeftRight(sideCandidates(this.skeleton, /forearm|lowerarm|elbow/i));
    this.shoulders = splitLeftRight(sideCandidates(this.skeleton, /upperarm|shoulder/i));
  }

  addGarment(mesh, material, parent = this.root) {
    mesh.parent = parent;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.garments.push(mesh);
    this.shadowCasters?.push(mesh);
    return mesh;
  }

  buildBedouinGarments() {
    const linen = makeMaterial(this.scene, 'bedouin-sunbleached-linen', new Color3(0.84, 0.79, 0.68), 0.99);
    const linenShade = makeMaterial(this.scene, 'bedouin-linen-folds', new Color3(0.66, 0.59, 0.49), 0.99);
    const sash = makeMaterial(this.scene, 'bedouin-red-sash', new Color3(0.40, 0.08, 0.055), 0.96);
    this.materials.push(linen, linenShade, sash);

    this.robeTorso = this.addGarment(MeshBuilder.CreateCylinder('bedouin-thobe-upper', {
      height: 0.64, diameterTop: 0.43, diameterBottom: 0.50, tessellation: 20
    }, this.scene), linen);
    this.robeTorso.position.set(0, 1.18, -0.01);

    this.robeSkirt = this.addGarment(MeshBuilder.CreateCylinder('bedouin-thobe-lower', {
      height: 0.78, diameterTop: 0.48, diameterBottom: 0.62, tessellation: 24
    }, this.scene), linen);
    this.robeSkirt.position.set(0, 0.60, -0.02);

    this.frontFold = this.addGarment(MeshBuilder.CreateBox('bedouin-thobe-front-fold', {
      width: 0.25, height: 0.70, depth: 0.025
    }, this.scene), linenShade);
    this.frontFold.position.set(0, 0.62, 0.305);

    this.belt = this.addGarment(MeshBuilder.CreateTorus('bedouin-waist-sash', {
      diameter: 0.49, thickness: 0.042, tessellation: 28
    }, this.scene), sash);
    this.belt.position.y = 0.94;

    this.scarfCollar = this.addGarment(MeshBuilder.CreateTorus('bedouin-keffiyeh-collar', {
      diameter: 0.36, thickness: 0.055, tessellation: 24
    }, this.scene), sash);
    this.scarfCollar.position.set(0, 1.51, -0.015);

    this.scarfTails = [];
    for (const side of [-1, 1]) {
      const tail = this.addGarment(MeshBuilder.CreateBox(`bedouin-keffiyeh-tail-${side}`, {
        width: 0.13, height: 0.46, depth: 0.025
      }, this.scene), side < 0 ? linen : sash);
      tail.position.set(side * 0.11, 1.34, -0.19);
      tail.rotation.z = side * 0.07;
      this.scarfTails.push(tail);
    }

    this.sleeves = {
      left: this.addGarment(MeshBuilder.CreateCylinder('bedouin-sleeve-left', { height: 1, diameterTop: 0.14, diameterBottom: 0.11, tessellation: 16 }, this.scene), linen, null),
      right: this.addGarment(MeshBuilder.CreateCylinder('bedouin-sleeve-right', { height: 1, diameterTop: 0.14, diameterBottom: 0.11, tessellation: 16 }, this.scene), linen, null)
    };
    for (const sleeve of Object.values(this.sleeves)) sleeve.parent = null;

    for (const side of [-1, 1]) {
      const debug = MeshBuilder.CreateSphere(`imported-foot-target-${side}`, { diameter: 0.06, segments: 6 }, this.scene);
      debug.isVisible = false;
      debug.isPickable = false;
      this.debugTargets.push(debug);
    }
  }

  configureAnimations() {
    for (const group of this.animationGroups) {
      for (const targeted of group.targetedAnimations || []) {
        targeted.animation.enableBlending = true;
        targeted.animation.blendingSpeed = 0.09;
      }
    }
    this.walkAnimation = chooseAnimation(this.animationGroups, /walk/i, /back|left|right|strafe/i)
      || chooseAnimation(this.animationGroups, /run/i)
      || this.animationGroups.find((group) => !/idle/i.test(group.name));
    this.idleAnimation = chooseAnimation(this.animationGroups, /idle/i);
    if (this.idleAnimation) {
      this.idleAnimation.start(true, 1);
      this.idleAnimation.setWeightForAllAnimatables(1);
    }
    if (this.walkAnimation) {
      this.walkAnimation.start(true, 1);
      this.walkAnimation.setWeightForAllAnimatables(this.idleAnimation ? 0 : 1);
    }
  }

  updateAnimations(controller, dt) {
    const targetWalk = clamp((controller.speed - 0.08) / 0.65, 0, 1);
    this.walkWeight = damp(this.walkWeight, targetWalk, 8.5, dt);
    if (this.walkAnimation) {
      this.walkAnimation.speedRatio = clamp(0.72 + controller.speed * 0.22, 0.72, 1.42);
      this.walkAnimation.setWeightForAllAnimatables(this.idleAnimation ? this.walkWeight : 1);
    }
    if (this.idleAnimation) this.idleAnimation.setWeightForAllAnimatables(1 - this.walkWeight);
  }

  updateSleeves() {
    for (const side of ['left', 'right']) {
      const shoulder = this.shoulders?.[side];
      const hand = this.hands?.[side] || this.elbows?.[side];
      const sleeve = this.sleeves?.[side];
      if (!shoulder || !hand || !sleeve) continue;
      const a = shoulder.getAbsolutePosition();
      const b = hand.getAbsolutePosition();
      orientYAxis(sleeve, a, Vector3.Lerp(a, b, 0.78));
    }
  }

  updateFoot(side, controller, dt) {
    const state = this.footState[side];
    const node = this.feet?.[side];
    if (!node) return null;
    const position = node.getAbsolutePosition();
    const globalX = position.x + controller.worldOffsetX;
    const globalZ = position.z + controller.worldOffsetZ;
    const ground = this.surface.sampleHeight(globalX, globalZ);
    const distance = position.y - ground;
    const velocity = (distance - state.previousDistance) / Math.max(0.001, dt);
    state.cooldown = Math.max(0, state.cooldown - dt);
    const landed = state.initialized
      && state.previousVelocity < -0.025
      && velocity >= -0.005
      && distance < 0.16
      && state.cooldown <= 0
      && controller.speed > 0.18;

    state.initialized = true;
    state.previousDistance = distance;
    state.previousVelocity = velocity;
    if (distance < 0.18) state.plant.set(position.x, ground + 0.018, position.z);
    this.debugTargets[side === 'left' ? 0 : 1]?.position.copyFrom(state.plant);
    if (!landed) return null;

    state.cooldown = 0.24;
    return {
      side,
      position: state.plant.clone(),
      globalX,
      globalZ,
      normal: this.surface.sampleNormal(globalX, globalZ),
      yaw: controller.bodyYaw
    };
  }

  update(controller, dt = 1 / 60) {
    if (!this.ready) return [];
    const normal = this.surface.sampleNormal(controller.globalX, controller.globalZ);
    const forwardX = Math.sin(controller.bodyYaw), forwardZ = Math.cos(controller.bodyYaw);
    const rightX = Math.cos(controller.bodyYaw), rightZ = -Math.sin(controller.bodyYaw);
    const forwardGrade = -(normal.x * forwardX + normal.z * forwardZ);
    const sideGrade = -(normal.x * rightX + normal.z * rightZ);

    this.root.position.copyFrom(controller.localPosition);
    this.root.rotation.y = controller.bodyYaw;
    this.root.rotation.x = clamp(forwardGrade * 0.22, -0.12, 0.16);
    this.root.rotation.z = clamp(-sideGrade * 0.16, -0.09, 0.09);
    this.updateAnimations(controller, dt);

    const footPositions = [this.feet?.left, this.feet?.right].filter(Boolean).map((node) => node.getAbsolutePosition());
    let requiredLift = 0;
    for (const foot of footPositions) {
      const gx = foot.x + controller.worldOffsetX;
      const gz = foot.z + controller.worldOffsetZ;
      requiredLift = Math.max(requiredLift, this.surface.sampleHeight(gx, gz) - foot.y + 0.012);
    }
    this.visualLift = damp(this.visualLift, clamp(requiredLift, 0, 0.16), 12, dt);
    this.modelRoot.position.y = this.baseModelY + this.visualLift;

    const speedNorm = clamp(controller.speed / 3.25, 0, 1);
    this.robeSkirt.rotation.x = Math.sin(controller.gait) * 0.018 * speedNorm;
    this.robeSkirt.rotation.z = Math.cos(controller.gait * 0.5) * 0.012 * speedNorm;
    this.frontFold.position.z = 0.305 + Math.sin(controller.gait) * 0.018 * speedNorm;
    this.scarfTails[0].rotation.x = Math.sin(controller.gait * 0.75) * 0.025 * speedNorm;
    this.scarfTails[1].rotation.x = Math.sin(controller.gait * 0.75 + 0.8) * 0.025 * speedNorm;
    this.updateSleeves();

    return [this.updateFoot('left', controller, dt), this.updateFoot('right', controller, dt)].filter(Boolean);
  }

  shiftOrigin() {}

  setDebugTargets(enabled) {
    for (const target of this.debugTargets) target.isVisible = enabled;
  }

  dispose() {
    for (const group of this.animationGroups) group.dispose();
    for (const mesh of this.garments) mesh.dispose();
    for (const mesh of this.meshes) mesh.dispose();
    for (const debug of this.debugTargets) debug.dispose();
    for (const material of this.materials) material.dispose();
    this.modelRoot?.dispose();
    this.root.dispose();
  }
}
