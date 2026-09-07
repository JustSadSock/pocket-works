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
    const skinTone = new Color3(0.46, 0.285, 0.18);
    for (const mesh of imported.meshes) {
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      if (mesh !== this.modelRoot && mesh.getTotalVertices?.() > 0) {
        // The source character is deliberately neutral. Re-materialise the
        // exposed body as warm skin; the thobe, trousers and leather layers are
        // separate meshes, so the figure no longer reads as one monochrome lump.
        if (mesh.material?.clone) {
          const bodyMaterial = mesh.material.clone(`bedouin-skin-${mesh.name}`);
          if ('albedoTexture' in bodyMaterial) bodyMaterial.albedoTexture = null;
          if ('albedoColor' in bodyMaterial) bodyMaterial.albedoColor = skinTone.clone();
          if ('roughness' in bodyMaterial) bodyMaterial.roughness = 0.88;
          if ('metallic' in bodyMaterial) bodyMaterial.metallic = 0;
          mesh.material = bodyMaterial;
          this.materials.push(bodyMaterial);
        }
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
    const linen = makeMaterial(this.scene, 'bedouin-sunbleached-linen', new Color3(0.86, 0.80, 0.67), 0.99);
    const linenShade = makeMaterial(this.scene, 'bedouin-linen-folds', new Color3(0.66, 0.57, 0.45), 0.99);
    const trousers = makeMaterial(this.scene, 'bedouin-charcoal-trousers', new Color3(0.19, 0.17, 0.145), 0.97);
    const sash = makeMaterial(this.scene, 'bedouin-red-sash', new Color3(0.43, 0.075, 0.045), 0.96);
    const leather = makeMaterial(this.scene, 'bedouin-leather', new Color3(0.13, 0.075, 0.035), 0.92);
    const skin = makeMaterial(this.scene, 'bedouin-visible-skin', new Color3(0.49, 0.30, 0.19), 0.86);
    this.materials.push(linen, linenShade, trousers, sash, leather, skin);

    this.robeTorso = this.addGarment(MeshBuilder.CreateCylinder('bedouin-thobe-upper', {
      height: 0.64, diameterTop: 0.43, diameterBottom: 0.51, tessellation: 22
    }, this.scene), linen);
    this.robeTorso.position.set(0, 1.18, -0.01);

    this.robeSkirt = this.addGarment(MeshBuilder.CreateCylinder('bedouin-thobe-lower', {
      height: 0.82, diameterTop: 0.49, diameterBottom: 0.64, tessellation: 26
    }, this.scene), linen);
    this.robeSkirt.position.set(0, 0.58, -0.02);

    this.frontFold = this.addGarment(MeshBuilder.CreateBox('bedouin-thobe-front-fold', {
      width: 0.255, height: 0.73, depth: 0.026
    }, this.scene), linenShade);
    this.frontFold.position.set(0, 0.60, 0.315);

    this.belt = this.addGarment(MeshBuilder.CreateTorus('bedouin-waist-sash', {
      diameter: 0.50, thickness: 0.045, tessellation: 30
    }, this.scene), sash);
    this.belt.position.y = 0.94;

    this.scarfCollar = this.addGarment(MeshBuilder.CreateTorus('bedouin-keffiyeh-collar', {
      diameter: 0.37, thickness: 0.058, tessellation: 26
    }, this.scene), sash);
    this.scarfCollar.position.set(0, 1.52, -0.015);

    const scarfBand = this.addGarment(MeshBuilder.CreateCylinder('bedouin-keffiyeh-headband', {
      height: 0.07, diameter: 0.30, tessellation: 24
    }, this.scene), sash);
    scarfBand.position.set(0, 1.72, -0.01);

    this.scarfTails = [];
    for (const side of [-1, 1]) {
      const tail = this.addGarment(MeshBuilder.CreateBox(`bedouin-keffiyeh-tail-${side}`, {
        width: 0.14, height: 0.48, depth: 0.026
      }, this.scene), side < 0 ? linen : linenShade);
      tail.position.set(side * 0.12, 1.35, -0.20);
      tail.rotation.z = side * 0.08;
      this.scarfTails.push(tail);
    }

    this.sleeves = {
      left: this.addGarment(MeshBuilder.CreateCylinder('bedouin-sleeve-left', { height: 1, diameterTop: 0.145, diameterBottom: 0.105, tessellation: 18 }, this.scene), linen, null),
      right: this.addGarment(MeshBuilder.CreateCylinder('bedouin-sleeve-right', { height: 1, diameterTop: 0.145, diameterBottom: 0.105, tessellation: 18 }, this.scene), linen, null)
    };
    for (const sleeve of Object.values(this.sleeves)) sleeve.parent = null;

    this.handCovers = {
      left: this.addGarment(MeshBuilder.CreateCapsule('bedouin-hand-left', { radius: 0.047, height: 0.15, tessellation: 14 }, this.scene), skin, null),
      right: this.addGarment(MeshBuilder.CreateCapsule('bedouin-hand-right', { radius: 0.047, height: 0.15, tessellation: 14 }, this.scene), skin, null)
    };
    for (const hand of Object.values(this.handCovers)) hand.parent = null;

    this.boots = {
      left: this.addGarment(MeshBuilder.CreateCapsule('bedouin-boot-left', { radius: 0.070, height: 0.30, tessellation: 16 }, this.scene), leather, null),
      right: this.addGarment(MeshBuilder.CreateCapsule('bedouin-boot-right', { radius: 0.070, height: 0.30, tessellation: 16 }, this.scene), leather, null)
    };
    for (const boot of Object.values(this.boots)) boot.parent = null;

    // Dark cloth just inside the robe opening keeps the lower silhouette from
    // turning into one uninterrupted beige column while the animated feet move.
    for (const side of [-1, 1]) {
      const trouser = this.addGarment(MeshBuilder.CreateCylinder(`bedouin-trouser-cuff-${side}`, {
        height: 0.34, diameterTop: 0.145, diameterBottom: 0.12, tessellation: 16
      }, this.scene), trousers);
      trouser.position.set(side * 0.11, 0.22, 0.0);
    }

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
    const targetWalk = clamp((controller.speed - 0.07) / 0.58, 0, 1);
    this.walkWeight = damp(this.walkWeight, targetWalk, 9.2, dt);
    if (this.walkAnimation) {
      this.walkAnimation.speedRatio = clamp(0.70 + controller.speed * 0.25, 0.70, 1.38);
      this.walkAnimation.setWeightForAllAnimatables(this.idleAnimation ? this.walkWeight : 1);
    }
    if (this.idleAnimation) this.idleAnimation.setWeightForAllAnimatables(1 - this.walkWeight);
  }

  updateSleevesAndExtremities(controller) {
    for (const side of ['left', 'right']) {
      const shoulder = this.shoulders?.[side];
      const handNode = this.hands?.[side] || this.elbows?.[side];
      const sleeve = this.sleeves?.[side];
      if (shoulder && handNode && sleeve) {
        const a = shoulder.getAbsolutePosition();
        const b = handNode.getAbsolutePosition();
        orientYAxis(sleeve, a, Vector3.Lerp(a, b, 0.79));
      }
      if (handNode && this.handCovers?.[side]) {
        const hand = this.handCovers[side];
        hand.position.copyFrom(handNode.getAbsolutePosition());
        hand.rotationQuaternion = Quaternion.RotationAxis(UP, controller.bodyYaw);
      }
      const footNode = this.feet?.[side];
      if (footNode && this.boots?.[side]) {
        const boot = this.boots[side];
        boot.position.copyFrom(footNode.getAbsolutePosition());
        boot.position.y += 0.035;
        const yaw = Quaternion.RotationAxis(UP, controller.bodyYaw);
        const pitch = Quaternion.RotationAxis(Vector3.Right(), Math.PI * 0.5);
        boot.rotationQuaternion = yaw.multiply(pitch);
      }
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
    if (distance < 0.18) state.plant.set(position.x, ground + 0.012, position.z);
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
    this.root.rotation.x = clamp(forwardGrade * 0.20, -0.11, 0.15);
    this.root.rotation.z = clamp(-sideGrade * 0.14, -0.08, 0.08);
    this.updateAnimations(controller, dt);

    const footPositions = [this.feet?.left, this.feet?.right].filter(Boolean).map((node) => node.getAbsolutePosition());
    let requiredLift = 0;
    for (const foot of footPositions) {
      const gx = foot.x + controller.worldOffsetX;
      const gz = foot.z + controller.worldOffsetZ;
      requiredLift = Math.max(requiredLift, this.surface.sampleHeight(gx, gz) - foot.y + 0.010);
    }
    this.visualLift = damp(this.visualLift, clamp(requiredLift, 0, 0.12), 10, dt);
    this.modelRoot.position.y = this.baseModelY + this.visualLift;

    const speedNorm = clamp(controller.speed / 3.0, 0, 1);
    this.robeSkirt.rotation.x = Math.sin(controller.gait) * 0.016 * speedNorm;
    this.robeSkirt.rotation.z = Math.cos(controller.gait * 0.5) * 0.010 * speedNorm;
    this.frontFold.position.z = 0.315 + Math.sin(controller.gait) * 0.015 * speedNorm;
    this.scarfTails[0].rotation.x = Math.sin(controller.gait * 0.75) * 0.022 * speedNorm;
    this.scarfTails[1].rotation.x = Math.sin(controller.gait * 0.75 + 0.8) * 0.022 * speedNorm;
    this.updateSleevesAndExtremities(controller);

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
