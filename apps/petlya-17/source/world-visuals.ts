import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { TrackModel } from './track-model';
import { clamp, lerp, speedFeel } from './core';
import { makeMaterial } from './world-track';

export type CarVisual = {
  root: TransformNode;
  wheels: Mesh[];
};

export type CockpitMotion = {
  speed: number;
  maxSpeed: number;
  steer: number;
  yawOffset: number;
  lateralSpeed: number;
  bodyRoll: number;
  bodyPitch: number;
  slipAngle: number;
  drafting: number;
  acceleration: number;
  distance: number;
  lane: number;
};

export class VisualRig {
  readonly cockpitRoot: TransformNode;
  readonly wheelRoot: TransformNode;
  readonly mirrorTexture: RenderTargetTexture;
  readonly speedStreaks: Mesh[] = [];

  private cameraPosition = new Vector3();
  private cameraTarget = new Vector3();
  private impact = 0;
  private mirrorMaterial: StandardMaterial;
  private streakMaterial: StandardMaterial;

  constructor(
    private readonly scene: Scene,
    private readonly camera: UniversalCamera,
    private readonly rearCamera: UniversalCamera,
    private readonly track: TrackModel
  ) {
    this.mirrorTexture = new RenderTargetTexture('rear-view', { width: 320, height: 96 }, scene, false);
    this.mirrorTexture.activeCamera = rearCamera;
    this.mirrorTexture.refreshRate = 2;
    this.mirrorTexture.renderParticles = false;
    this.mirrorTexture.uScale = -1;
    this.mirrorTexture.uOffset = 1;
    scene.customRenderTargets.push(this.mirrorTexture);

    this.mirrorMaterial = makeMaterial(scene, 'mirror-glass', new Color3(0.12, 0.23, 0.24), 0.7);
    this.mirrorMaterial.diffuseTexture = this.mirrorTexture;
    this.mirrorMaterial.emissiveTexture = this.mirrorTexture;
    this.mirrorMaterial.emissiveColor = new Color3(0.72, 0.78, 0.75);
    this.mirrorMaterial.disableLighting = true;

    this.streakMaterial = makeMaterial(scene, 'speed-streak', new Color3(0.78, 0.86, 0.8), 0);
    this.streakMaterial.emissiveColor = new Color3(0.34, 0.43, 0.38);
    this.streakMaterial.alpha = 0.28;

    this.cockpitRoot = new TransformNode('cockpit-root', scene);
    this.cockpitRoot.parent = camera;
    this.wheelRoot = new TransformNode('wheel-root', scene);
    this.wheelRoot.parent = this.cockpitRoot;
  }

  private cockpitBox(
    name: string,
    size: { width: number; height: number; depth: number },
    position: Vector3,
    material: StandardMaterial,
    parent: TransformNode = this.cockpitRoot
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(name, size, this.scene);
    mesh.parent = parent;
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.layerMask = 0x2;
    mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
  }

  buildCockpit(): void {
    const carbon = makeMaterial(this.scene, 'cockpit-carbon', new Color3(0.025, 0.035, 0.03), 0.22);
    const edge = makeMaterial(this.scene, 'cockpit-edge', new Color3(0.23, 0.25, 0.22), 0.32);
    const body = makeMaterial(this.scene, 'player-body', new Color3(0.86, 0.82, 0.69), 0.28);
    const orange = makeMaterial(this.scene, 'player-orange', new Color3(0.88, 0.24, 0.08), 0.2);

    this.cockpitBox('nose', { width: 1.15, height: 0.24, depth: 4.2 }, new Vector3(0, -1.08, 3.15), body);
    this.cockpitBox('nose-stripe', { width: 0.16, height: 0.255, depth: 4.22 }, new Vector3(0, -1.065, 3.15), orange);
    this.cockpitBox('left-tub', { width: 1.8, height: 0.7, depth: 2.4 }, new Vector3(-1.35, -1.03, 1.8), carbon);
    this.cockpitBox('right-tub', { width: 1.8, height: 0.7, depth: 2.4 }, new Vector3(1.35, -1.03, 1.8), carbon);
    this.cockpitBox('dash', { width: 1.95, height: 0.48, depth: 0.55 }, new Vector3(0, -0.72, 1.18), carbon);

    const haloBar = this.cockpitBox('halo-bar', { width: 0.17, height: 0.18, depth: 2.5 }, new Vector3(0, -0.23, 1.75), carbon);
    haloBar.rotation.x = -0.04;
    const haloLeft = this.cockpitBox('halo-left', { width: 0.16, height: 0.16, depth: 2.15 }, new Vector3(-0.75, -0.28, 1.7), carbon);
    haloLeft.rotation.y = -0.38;
    const haloRight = this.cockpitBox('halo-right', { width: 0.16, height: 0.16, depth: 2.15 }, new Vector3(0.75, -0.28, 1.7), carbon);
    haloRight.rotation.y = 0.38;

    const wheel = MeshBuilder.CreateTorus('steering-wheel', { diameter: 1.05, thickness: 0.12, tessellation: 28 }, this.scene);
    wheel.parent = this.wheelRoot;
    wheel.position.set(0, -0.62, 0.92);
    wheel.rotation.x = Math.PI / 2;
    wheel.material = carbon;
    wheel.layerMask = 0x2;
    wheel.alwaysSelectAsActiveMesh = true;
    this.cockpitBox('wheel-spoke-left', { width: 0.52, height: 0.12, depth: 0.12 }, new Vector3(-0.24, -0.62, 0.92), edge, this.wheelRoot);
    this.cockpitBox('wheel-spoke-right', { width: 0.52, height: 0.12, depth: 0.12 }, new Vector3(0.24, -0.62, 0.92), edge, this.wheelRoot);
    this.cockpitBox('wheel-hub', { width: 0.42, height: 0.24, depth: 0.15 }, new Vector3(0, -0.62, 0.92), edge, this.wheelRoot);

    for (const side of [-1, 1]) {
      const arm = this.cockpitBox(`mirror-arm-${side}`, { width: 0.55, height: 0.08, depth: 0.08 }, new Vector3(side * 1.18, -0.34, 1.18), carbon);
      arm.rotation.z = side * 0.18;
      const mirror = this.cockpitBox(`mirror-${side}`, { width: 0.72, height: 0.3, depth: 0.09 }, new Vector3(side * 1.55, -0.28, 1.2), this.mirrorMaterial);
      mirror.rotation.y = side * -0.18;
    }
  }

  buildSpeedStreaks(): void {
    for (let index = 0; index < 28; index += 1) {
      const streak = MeshBuilder.CreateBox(`streak-${index}`, { width: 0.014, height: 0.014, depth: 0.8 + Math.random() * 1.8 }, this.scene);
      streak.parent = this.camera;
      streak.material = this.streakMaterial;
      streak.layerMask = 0x2;
      streak.isPickable = false;
      streak.alwaysSelectAsActiveMesh = true;
      streak.position.set((Math.random() < 0.5 ? -1 : 1) * (1.7 + Math.random() * 2.8), -1.2 + Math.random() * 3.1, 3 + Math.random() * 35);
      this.speedStreaks.push(streak);
    }
  }

  createCar(name: string, bodyColor: Color3, stripeColor: Color3, index: number, shadowGenerator: ShadowGenerator): CarVisual {
    const root = new TransformNode(`${name}-${index}`, this.scene);
    const bodyMaterial = makeMaterial(this.scene, `${name}-body-${index}`, bodyColor, 0.3);
    const stripeMaterial = makeMaterial(this.scene, `${name}-stripe-${index}`, stripeColor, 0.18);
    const rubber = makeMaterial(this.scene, `${name}-rubber-${index}`, new Color3(0.015, 0.018, 0.016), 0.05);
    const dark = makeMaterial(this.scene, `${name}-dark-${index}`, new Color3(0.025, 0.035, 0.03), 0.18);
    const wheels: Mesh[] = [];

    const addBox = (meshName: string, dimensions: { width: number; height: number; depth: number }, position: Vector3, material: StandardMaterial): Mesh => {
      const mesh = MeshBuilder.CreateBox(meshName, dimensions, this.scene);
      mesh.parent = root;
      mesh.position.copyFrom(position);
      mesh.material = material;
      shadowGenerator.addShadowCaster(mesh, true);
      return mesh;
    };

    addBox(`${name}-chassis-${index}`, { width: 1.55, height: 0.34, depth: 3.55 }, new Vector3(0, 0.42, 0), bodyMaterial);
    addBox(`${name}-nose-${index}`, { width: 0.58, height: 0.28, depth: 2.1 }, new Vector3(0, 0.42, 2.45), bodyMaterial);
    addBox(`${name}-stripe-${index}`, { width: 0.16, height: 0.36, depth: 4.7 }, new Vector3(0, 0.45, 0.9), stripeMaterial);
    addBox(`${name}-cockpit-${index}`, { width: 0.78, height: 0.38, depth: 0.95 }, new Vector3(0, 0.72, 0.15), dark);
    addBox(`${name}-rear-wing-${index}`, { width: 2.05, height: 0.18, depth: 0.55 }, new Vector3(0, 0.88, -1.75), dark);
    addBox(`${name}-front-wing-${index}`, { width: 2.1, height: 0.12, depth: 0.48 }, new Vector3(0, 0.3, 3.25), dark);

    for (const x of [-0.92, 0.92]) {
      for (const z of [-1.15, 1.75]) {
        const wheel = MeshBuilder.CreateCylinder(`${name}-wheel-${index}-${x}-${z}`, { height: 0.38, diameter: 0.72, tessellation: 14 }, this.scene);
        wheel.parent = root;
        wheel.position.set(x, 0.34, z);
        wheel.rotation.z = Math.PI / 2;
        wheel.material = rubber;
        shadowGenerator.addShadowCaster(wheel, true);
        wheels.push(wheel);
      }
    }
    return { root, wheels };
  }

  placeCar(visual: CarVisual, distance: number, lane: number, yawOffset: number, bodyRoll: number, bodyPitch: number, speed: number): void {
    const sample = this.track.sample(distance);
    visual.root.position.copyFrom(sample.position.add(sample.right.scale(lane)).add(sample.up.scale(0.18)));
    visual.root.rotationQuaternion = Quaternion.FromEulerAngles(bodyPitch * 0.38, this.track.yaw(distance) + yawOffset, sample.bank + bodyRoll);
    const wheelRotation = distance / 0.36;
    for (const wheel of visual.wheels) wheel.rotation.x = wheelRotation;
    visual.root.scaling.y = 1 + Math.sin(distance * 1.8) * Math.min(0.006, speed / 52000);
  }

  applyImpact(strength: number): void {
    this.impact = Math.max(this.impact, clamp(strength, 0, 1.3));
  }

  initializeCamera(): void {
    const start = this.track.sample(0);
    const target = this.track.sample(18);
    this.cameraPosition.copyFrom(start.position.add(start.up.scale(1.16)));
    this.cameraTarget.copyFrom(target.position.add(target.up.scale(1.1)));
    this.camera.position.copyFrom(this.cameraPosition);
    this.camera.setTarget(this.cameraTarget);
    this.rearCamera.position.copyFrom(start.position.add(start.up.scale(1.2)));
    this.rearCamera.setTarget(this.track.sample(-18).position.add(new Vector3(0, 1, 0)));
  }

  updateCockpit(motion: CockpitMotion, delta: number): void {
    const feel = speedFeel(motion.speed, motion.maxSpeed);
    const current = this.track.sample(motion.distance + 0.5);
    const lookAhead = lerp(12, 35, feel);
    const ahead = this.track.sample(motion.distance + lookAhead);
    const lanePosition = current.position.add(current.right.scale(motion.lane));
    const aheadPosition = ahead.position
      .add(ahead.right.scale(motion.lane * 0.82))
      .add(current.right.scale(motion.yawOffset * lookAhead * 0.62));
    const brakingPitch = Math.max(0, motion.bodyPitch) * 0.72;
    const accelerationSink = clamp(motion.acceleration / 120, -0.12, 0.16);
    const surface = Math.sin(motion.distance * 1.7) * feel * 0.014 + Math.sin(motion.distance * 4.3) * feel * 0.004;
    const impactX = (Math.random() - 0.5) * this.impact * 0.18;
    const impactY = (Math.random() - 0.5) * this.impact * 0.11;
    this.impact *= Math.pow(0.035, delta);

    const desiredPosition = lanePosition
      .add(current.tangent.scale(-0.18 - feel * 0.16))
      .add(current.up.scale(1.16 + surface - brakingPitch + accelerationSink + impactY))
      .add(current.right.scale(impactX));
    const desiredTarget = aheadPosition.add(ahead.up.scale(1.13 - brakingPitch * 0.45));
    this.cameraPosition = Vector3.Lerp(this.cameraPosition, desiredPosition, Math.min(1, delta * (8 - feel * 2.5)));
    this.cameraTarget = Vector3.Lerp(this.cameraTarget, desiredTarget, Math.min(1, delta * (7 - feel * 2)));
    this.camera.position.copyFrom(this.cameraPosition);
    this.camera.setTarget(this.cameraTarget);
    this.camera.fov += (lerp(0.98, 1.3, feel) - this.camera.fov) * Math.min(1, delta * 5.5);
    this.camera.rotation.z = clamp(current.bank - motion.steer * 0.045 + motion.bodyRoll * 0.72 - motion.lateralSpeed * 0.008, -0.2, 0.2);

    this.cockpitRoot.position.y = surface * 0.4 - brakingPitch * 0.24 + accelerationSink * 0.25;
    this.cockpitRoot.position.z = motion.bodyPitch > 0 ? 0.08 + feel * 0.08 : -accelerationSink * 0.16;
    this.cockpitRoot.rotation.x = motion.bodyPitch * 0.58;
    this.cockpitRoot.rotation.z = clamp(motion.bodyRoll * 0.48 - motion.slipAngle * 0.12, -0.11, 0.11);
    this.wheelRoot.rotation.z = motion.steer * -0.62 + motion.yawOffset * 0.18;

    const rear = this.track.sample(motion.distance - lerp(10, 20, feel));
    this.rearCamera.position.copyFrom(lanePosition.add(current.tangent.scale(1.35)).add(current.up.scale(1.23)));
    this.rearCamera.setTarget(rear.position.add(rear.right.scale(motion.lane * 0.9)).add(rear.up.scale(1.02)));
    this.rearCamera.fov = lerp(1.03, 1.17, feel);

    this.streakMaterial.alpha = 0.04 + feel * 0.34 + motion.drafting * 0.12;
    for (const streak of this.speedStreaks) {
      streak.position.z -= delta * (8 + feel * 125 + motion.drafting * 22);
      streak.scaling.z = 0.4 + feel * 2.4;
      if (streak.position.z < 0.2) {
        streak.position.z = 18 + Math.random() * 36;
        streak.position.x = (Math.random() < 0.5 ? -1 : 1) * (1.65 + Math.random() * 3.5);
        streak.position.y = -1.2 + Math.random() * 3.2;
      }
      streak.setEnabled(feel > 0.18);
    }
  }
}
