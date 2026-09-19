import {
  Color3,
  Mesh,
  MeshBuilder,
  Matrix,
  PBRMaterial,
  Quaternion,
  Scene,
  TransformNode,
  Vector3
} from '@babylonjs/core';
import RAPIER from '@dimforge/rapier3d-compat';
import type { DriveInputState } from './input';
import type { VehicleSpec, VisualPreset } from './config';
import {
  applyImpact,
  clamp,
  createDamageState,
  deriveDamageEffects,
  stepThermalDamage,
  type DamageState,
  type DamageZone,
  type ImpactInput
} from './damage';
import { DeformableShell, quaternionFromRapier } from './deformable-shell';
import type { CollisionRegistry, DynamicProp } from './physics-types';

const WHEEL_NAMES = ['FL', 'FR', 'RL', 'RR'] as const;

function color(value: string) {
  return Color3.FromHexString(value);
}

function material(scene: Scene, name: string, albedo: string, metallic = 0.2, roughness = 0.45) {
  const out = new PBRMaterial(name, scene);
  out.albedoColor = color(albedo);
  out.metallic = metallic;
  out.roughness = roughness;
  return out;
}

export type VehicleImpactResult = {
  severity: number;
  zone: DamageZone;
  glass: boolean;
};

export class Vehicle {
  readonly root: TransformNode;
  readonly shell: DeformableShell;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  readonly damage: DamageState = createDamageState();
  readonly detached: DynamicProp[] = [];
  readonly wheels: Mesh[] = [];
  readonly panels = new Map<string, Mesh>();
  readonly spec: VehicleSpec;
  readonly preset: VisualPreset;

  private trimMaterial: PBRMaterial;
  private wheelMaterial: PBRMaterial;
  private glassMaterial: PBRMaterial;
  private lampOn: PBRMaterial;
  private lampOff: PBRMaterial;
  private tailOn: PBRMaterial;
  private tailOff: PBRMaterial;
  private headlights: Mesh[] = [];
  private taillights: Mesh[] = [];
  private windshield: Mesh;
  private lastSteer = 0;
  private panelDetached = new Set<string>();
  private wheelDetached = new Set<number>();
  private active = true;
  private lastInput: DriveInputState = { steer: 0, throttle: 0, brake: 0 };

  constructor(
    private scene: Scene,
    private world: RAPIER.World,
    private registry: CollisionRegistry,
    spec: VehicleSpec,
    preset: VisualPreset,
    spawn: Vector3,
    yaw = 0,
    public readonly playerControlled = false
  ) {
    this.spec = spec;
    this.preset = preset;

    this.root = new TransformNode(spec.id + '-vehicle-root', scene);
    this.root.rotationQuaternion = Quaternion.Identity();
    this.shell = new DeformableShell(scene, this.root, spec, preset);
    this.trimMaterial = material(scene, spec.id + '-trim', preset.trim, 0.45, 0.42);
    this.wheelMaterial = material(scene, spec.id + '-wheel', preset.wheel, 0.7, 0.32);
    this.glassMaterial = material(scene, spec.id + '-glass', '#67858c', 0.08, 0.13);
    this.glassMaterial.alpha = 0.58;
    this.glassMaterial.transparencyMode = 2;

    this.lampOn = material(scene, spec.id + '-head-on', '#f5e8c1', 0.02, 0.2);
    this.lampOn.emissiveColor = new Color3(1, 0.83, 0.53);
    this.lampOff = material(scene, spec.id + '-head-off', '#a29d8d', 0.05, 0.5);
    this.tailOn = material(scene, spec.id + '-tail-on', '#b91d17', 0.08, 0.25);
    this.tailOn.emissiveColor = new Color3(0.78, 0.03, 0.01);
    this.tailOff = material(scene, spec.id + '-tail-off', '#5d2926', 0.05, 0.55);

    this.buildDetails();
    this.windshield = this.buildGlass('windshield', new Vector3(0, spec.cabinHeight * 0.56, spec.length * 0.19), new Vector3(spec.width * 0.73, 0.035, spec.length * 0.24), -0.27);

    const rotation = Quaternion.RotationAxis(Vector3.Up(), yaw);
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
        .setLinearDamping(0.07 + spec.aeroDrag * 2)
        .setAngularDamping(0.24)
        .setCanSleep(true)
        .setCcdEnabled(true)
        .setAdditionalSolverIterations(2)
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(spec.width * 0.43, spec.bodyHeight * 0.47, spec.length * 0.43)
        .setTranslation(0, -spec.bodyHeight * 0.03, 0)
        .setMass(spec.mass)
        .setFriction(0.62)
        .setRestitution(0.025)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(850),
      this.body
    );
    registry.set(this.collider.handle, {
      kind: 'vehicle',
      vehicle: this,
      stiffness: 1,
      contactArea: 0.82,
      material: 'car',
      mass: spec.mass,
      label: spec.name
    });

    this.controller = world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;
    this.configureWheels();
    this.syncVisual();
  }

  private buildDetails() {
    const spec = this.spec;
    const bumper = (name: string, z: number) => {
      const mesh = MeshBuilder.CreateBox(name, { width: spec.width * 0.91, height: 0.18, depth: 0.18 }, this.scene);
      mesh.parent = this.root;
      mesh.position.set(0, -spec.bodyHeight * 0.13, z);
      mesh.material = this.trimMaterial;
      this.panels.set(name, mesh);
    };
    bumper('front-bumper', spec.length * 0.47);
    bumper('rear-bumper', -spec.length * 0.47);

    const panel = (name: string, position: Vector3, size: Vector3, rotation = Vector3.Zero()) => {
      const mesh = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, this.scene);
      mesh.parent = this.root;
      mesh.position.copyFrom(position);
      mesh.rotation.copyFrom(rotation);
      mesh.material = this.shell.mesh.material;
      mesh.receiveShadows = true;
      this.panels.set(name, mesh);
      return mesh;
    };
    panel('hood', new Vector3(0, spec.bodyHeight * 0.43, spec.length * 0.31), new Vector3(spec.width * 0.72, 0.055, spec.length * 0.31), new Vector3(-0.06, 0, 0));
    panel('trunk', new Vector3(0, spec.bodyHeight * 0.37, -spec.length * 0.35), new Vector3(spec.width * 0.72, 0.055, spec.length * 0.24), new Vector3(0.04, 0, 0));
    panel('door-left', new Vector3(-spec.width * 0.492, spec.bodyHeight * 0.13, -spec.length * 0.02), new Vector3(0.055, spec.bodyHeight * 0.78, spec.length * 0.34));
    panel('door-right', new Vector3(spec.width * 0.492, spec.bodyHeight * 0.13, -spec.length * 0.02), new Vector3(0.055, spec.bodyHeight * 0.78, spec.length * 0.34));

    this.buildGlass('side-glass-left', new Vector3(-spec.width * 0.47, spec.cabinHeight * 0.58, -spec.length * 0.03), new Vector3(0.025, spec.cabinHeight * 0.36, spec.length * 0.3));
    this.buildGlass('side-glass-right', new Vector3(spec.width * 0.47, spec.cabinHeight * 0.58, -spec.length * 0.03), new Vector3(0.025, spec.cabinHeight * 0.36, spec.length * 0.3));

    const lamp = (name: string, x: number, y: number, z: number, front: boolean) => {
      const mesh = MeshBuilder.CreateBox(name, { width: spec.width * 0.19, height: 0.13, depth: 0.045 }, this.scene);
      mesh.parent = this.root;
      mesh.position.set(x, y, z);
      mesh.material = front ? this.lampOn : this.tailOn;
      if (front) this.headlights.push(mesh);
      else this.taillights.push(mesh);
    };
    lamp('headlight-left', -spec.width * 0.27, spec.bodyHeight * 0.11, spec.length * 0.496, true);
    lamp('headlight-right', spec.width * 0.27, spec.bodyHeight * 0.11, spec.length * 0.496, true);
    lamp('taillight-left', -spec.width * 0.28, spec.bodyHeight * 0.12, -spec.length * 0.496, false);
    lamp('taillight-right', spec.width * 0.28, spec.bodyHeight * 0.12, -spec.length * 0.496, false);

    for (let i = 0; i < 4; i += 1) {
      const wheel = MeshBuilder.CreateCylinder(spec.id + '-wheel-' + WHEEL_NAMES[i], {
        diameter: spec.wheelRadius * 2,
        height: spec.wheelWidth,
        tessellation: 20
      }, this.scene);
      wheel.parent = this.root;
      wheel.material = this.wheelMaterial;
      wheel.rotationQuaternion = Quaternion.RotationAxis(Vector3.Forward(), Math.PI / 2);
      wheel.receiveShadows = true;
      this.wheels.push(wheel);
    }
  }

  private buildGlass(name: string, position: Vector3, size: Vector3, pitch = 0) {
    const glass = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, this.scene);
    glass.parent = this.root;
    glass.position.copyFrom(position);
    glass.rotation.x = pitch;
    glass.material = this.glassMaterial;
    glass.isPickable = false;
    return glass;
  }

  private configureWheels() {
    const spec = this.spec;
    const x = spec.track / 2;
    const z = spec.wheelBase / 2;
    const y = -spec.bodyHeight * 0.33;
    const points = [
      { x: -x, y, z },
      { x, y, z },
      { x: -x, y, z: -z },
      { x, y, z: -z }
    ];
    for (const point of points) {
      this.controller.addWheel(point, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, spec.suspensionRest, spec.wheelRadius);
    }
    for (let i = 0; i < 4; i += 1) {
      this.controller.setWheelSuspensionStiffness(i, spec.suspensionStiffness);
      this.controller.setWheelSuspensionCompression(i, spec.suspensionDamping);
      this.controller.setWheelSuspensionRelaxation(i, spec.suspensionDamping * 1.24);
      this.controller.setWheelMaxSuspensionTravel(i, spec.suspensionTravel);
      this.controller.setWheelMaxSuspensionForce(i, spec.maxSuspensionForce);
      this.controller.setWheelFrictionSlip(i, spec.tireGrip);
      this.controller.setWheelSideFrictionStiffness(i, 1.0);
    }
  }

  setActive(value: boolean) {
    this.active = value;
    if (!value) {
      for (let i = 0; i < 4; i += 1) {
        this.controller.setWheelEngineForce(i, 0);
        this.controller.setWheelBrake(i, 8);
      }
    }
  }

  preStep(input: DriveInputState, dt: number) {
    if (!this.active) return;
    this.lastInput = { ...input };
    const effects = deriveDamageEffects(this.damage);
    const speed = this.controller.currentVehicleSpeed();
    const speedAbs = Math.abs(speed);
    let reverse = 0;
    let brake = input.brake;
    if (input.brake > 0.5 && speedAbs < 1.2 && input.throttle < 0.2) {
      reverse = 0.52;
      brake = 0;
    }

    const steerTarget = (input.steer + effects.steeringPull) * this.spec.steerMax * effects.steeringAuthority;
    const steerResponse = 1 - Math.exp(-dt * (speedAbs > 17 ? 5.4 : 8.8));
    this.lastSteer += (steerTarget - this.lastSteer) * steerResponse;
    this.controller.setWheelSteering(0, this.lastSteer);
    this.controller.setWheelSteering(1, this.lastSteer);

    const power = (input.throttle - reverse) * this.spec.engineForce * effects.enginePower * effects.transmissionEfficiency;
    const drivetrain = this.spec.id === 'kestrel' ? [0, 1] : this.spec.id === 'meridian' ? [2, 3] : [0, 1, 2, 3];
    for (let i = 0; i < 4; i += 1) {
      const driveShare = drivetrain.includes(i) ? 1 / drivetrain.length : 0;
      this.controller.setWheelEngineForce(i, power * driveShare);
      this.controller.setWheelBrake(i, brake * this.spec.brakeForce * effects.brakeAuthority);
      this.controller.setWheelFrictionSlip(i, Math.max(0.18, this.spec.tireGrip * effects.wheelGrip[i]));
    }

    const supports = [effects.frontSupportL, effects.frontSupportR, effects.rearSupportL, effects.rearSupportR];
    for (let i = 0; i < 4; i += 1) {
      const support = supports[i] * (0.08 + effects.wheelGrip[i] * 0.92);
      this.controller.setWheelMaxSuspensionForce(i, this.spec.maxSuspensionForce * support);
      this.controller.setWheelSuspensionStiffness(i, this.spec.suspensionStiffness * (0.18 + support * 0.82));
      this.controller.setWheelSuspensionRestLength(i, this.spec.suspensionRest * (0.7 + support * 0.3));
    }

    stepThermalDamage(this.damage, input.throttle - reverse, speedAbs, dt);
    this.controller.updateVehicle(dt, undefined, undefined, (collider) => collider.handle !== this.collider.handle);
  }

  syncVisual() {
    const p = this.body.translation();
    const q = this.body.rotation();
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotationQuaternion = quaternionFromRapier(q);

    const effects = deriveDamageEffects(this.damage);
    const x = this.spec.track / 2;
    const z = this.spec.wheelBase / 2;
    const y = -this.spec.bodyHeight * 0.33;
    const xPositions = [-x, x, -x, x];
    const zPositions = [z, z, -z, -z];
    for (let i = 0; i < 4; i += 1) {
      if (this.wheelDetached.has(i)) continue;
      const suspension = this.controller.wheelSuspensionLength(i) ?? this.spec.suspensionRest;
      const support = [effects.frontSupportL, effects.frontSupportR, effects.rearSupportL, effects.rearSupportR][i];
      const collapse = (1 - support) * 0.12;
      const camber = (i % 2 === 0 ? -1 : 1) * (1 - support) * 0.4;
      this.wheels[i].position.set(xPositions[i], y - suspension + this.spec.suspensionRest - collapse, zPositions[i]);
      this.wheels[i].rotationQuaternion = Quaternion.RotationYawPitchRoll(
        i < 2 ? this.controller.wheelSteering(i) : 0,
        this.controller.wheelRotation(i),
        Math.PI / 2 + camber
      );
      this.wheels[i].setEnabled(true);
      const wheelHealth = [this.damage.components.wheelFL, this.damage.components.wheelFR, this.damage.components.wheelRL, this.damage.components.wheelRR][i];
      if (wheelHealth < 0.035) this.detachWheel(i);
    }

    this.headlights[0].material = this.damage.components.headlightL > 0.18 ? this.lampOn : this.lampOff;
    this.headlights[1].material = this.damage.components.headlightR > 0.18 ? this.lampOn : this.lampOff;
    this.taillights[0].material = this.damage.components.taillightL > 0.18 ? this.tailOn : this.tailOff;
    this.taillights[1].material = this.damage.components.taillightR > 0.18 ? this.tailOn : this.tailOff;

    const windshieldHealth = this.damage.components.windshield;
    const glass = this.windshield.material as PBRMaterial;
    glass.alpha = Math.max(0.13, 0.58 * windshieldHealth);
  }

  zoneAt(worldPoint: Vector3): DamageZone {
    const local = this.shell.worldToLocal(worldPoint);
    const l = this.spec.length;
    const w = this.spec.width;
    if (local.y > this.spec.cabinHeight * 0.66) return 'roof';
    if (local.z > l * 0.31) return 'front';
    if (local.z < -l * 0.31) return 'rear';
    if (local.x < -w * 0.35) return 'left';
    if (local.x > w * 0.35) return 'right';
    return 'chassis';
  }

  applyCollision(worldPoint: Vector3, worldNormal: Vector3, input: Omit<ImpactInput, 'zone' | 'ownMass' | 'crushResistance'>): VehicleImpactResult {
    const zone = this.zoneAt(worldPoint);
    const severity = applyImpact(this.damage, {
      ...input,
      zone,
      ownMass: this.spec.mass,
      crushResistance: this.spec.crushResistance
    });
    if (severity > 0) this.applyContactBias(worldPoint, zone, severity);
    if (severity <= 0) return { severity: 0, zone, glass: false };

    this.shell.deform(worldPoint, worldNormal, severity, zone);
    this.applyPanelState(zone, severity);

    const glass =
      (zone === 'front' && this.damage.components.windshield < 0.55) ||
      (zone === 'left' && this.damage.components.sideGlassL < 0.5) ||
      (zone === 'right' && this.damage.components.sideGlassR < 0.5);
    return { severity, zone, glass };
  }

  private applyContactBias(worldPoint: Vector3, zone: DamageZone, severity: number) {
    const local = this.shell.worldToLocal(worldPoint);
    const lateral = Math.min(1, Math.abs(local.x) / Math.max(0.1, this.spec.width * 0.5));
    const longitudinal = Math.min(1, Math.abs(local.z) / Math.max(0.1, this.spec.length * 0.5));
    const c = this.damage.components;
    const hit = (name: keyof typeof c, weight: number) => {
      c[name] = clamp(c[name] - severity * weight);
    };

    if (zone === 'front') {
      const left = local.x < 0;
      hit(left ? 'suspensionFL' : 'suspensionFR', 0.24 * (0.45 + lateral));
      hit(left ? 'wheelFL' : 'wheelFR', 0.2 * (0.35 + lateral));
      hit(left ? 'headlightL' : 'headlightR', 0.28 * (0.4 + lateral));
      if (Math.abs(local.x) < this.spec.width * 0.2) {
        hit('cooling', 0.12);
        hit('engine', 0.08);
      }
    } else if (zone === 'rear') {
      const left = local.x < 0;
      hit(left ? 'suspensionRL' : 'suspensionRR', 0.2 * (0.45 + lateral));
      hit(left ? 'wheelRL' : 'wheelRR', 0.17 * (0.35 + lateral));
      hit(left ? 'taillightL' : 'taillightR', 0.26 * (0.4 + lateral));
    } else if (zone === 'left' || zone === 'right') {
      const front = local.z > 0;
      const side = zone === 'left' ? 'L' : 'R';
      const suspension = ('suspension' + (front ? 'F' : 'R') + side) as keyof typeof c;
      const wheel = ('wheel' + (front ? 'F' : 'R') + side) as keyof typeof c;
      hit(suspension, 0.23 * (0.55 + longitudinal));
      hit(wheel, 0.19 * (0.45 + longitudinal));
      hit('chassis', 0.055 * (0.4 + longitudinal));
    }
  }

  private applyPanelState(zone: DamageZone, severity: number) {
    const zoneDamage = this.damage.zoneDamage[zone];
    if (zone === 'front') {
      const hood = this.panels.get('hood');
      if (hood && !this.panelDetached.has('hood')) {
        hood.rotation.x = -0.06 - zoneDamage * 0.34;
        hood.position.y += severity * 0.016;
      }
      if (zoneDamage > 0.76) this.detachPanel('front-bumper', new Vector3(0, 0, 1));
      if (zoneDamage > 0.9) this.detachPanel('hood', new Vector3(0, 0.4, 0.7));
    } else if (zone === 'rear') {
      const trunk = this.panels.get('trunk');
      if (trunk && !this.panelDetached.has('trunk')) trunk.rotation.x = 0.04 + zoneDamage * 0.27;
      if (zoneDamage > 0.78) this.detachPanel('rear-bumper', new Vector3(0, 0, -1));
      if (zoneDamage > 0.94) this.detachPanel('trunk', new Vector3(0, 0.35, -0.7));
    } else if (zone === 'left') {
      const door = this.panels.get('door-left');
      if (door && !this.panelDetached.has('door-left')) door.rotation.z = zoneDamage * 0.08;
      if (zoneDamage > 0.93) this.detachPanel('door-left', new Vector3(-0.7, 0.2, 0));
    } else if (zone === 'right') {
      const door = this.panels.get('door-right');
      if (door && !this.panelDetached.has('door-right')) door.rotation.z = -zoneDamage * 0.08;
      if (zoneDamage > 0.93) this.detachPanel('door-right', new Vector3(0.7, 0.2, 0));
    }
  }

  private detachWheel(index: number) {
    if (this.wheelDetached.has(index)) return;
    const wheel = this.wheels[index];
    wheel.computeWorldMatrix(true);
    const worldPosition = wheel.getAbsolutePosition().clone();
    const rootRotation = (this.root.rotationQuaternion ?? Quaternion.Identity()).clone();
    wheel.parent = null;
    wheel.position.copyFrom(worldPosition);
    wheel.rotationQuaternion = rootRotation;
    this.wheelDetached.add(index);
    this.controller.setWheelEngineForce(index, 0);
    this.controller.setWheelBrake(index, 0);
    this.controller.setWheelFrictionSlip(index, 0.02);
    this.controller.setWheelMaxSuspensionForce(index, 0);

    const bodyVelocity = this.body.linvel();
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
        .setRotation({ x: rootRotation.x, y: rootRotation.y, z: rootRotation.z, w: rootRotation.w })
        .setLinvel(bodyVelocity.x, bodyVelocity.y + 0.35, bodyVelocity.z)
        .setAngularDamping(0.25)
        .setLinearDamping(0.08)
        .setCanSleep(true)
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(this.spec.wheelRadius * 0.82)
        .setMass(18)
        .setFriction(0.92)
        .setRestitution(0.16),
      body
    );
    this.registry.set(collider.handle, {
      kind: 'prop',
      stiffness: 0.72,
      contactArea: 0.22,
      material: 'soft',
      mass: 18,
      label: 'detached-wheel-' + WHEEL_NAMES[index]
    });
    this.detached.push({ body, mesh: wheel });
  }

  private detachPanel(name: string, impulse: Vector3) {
    if (this.panelDetached.has(name)) return;
    const panel = this.panels.get(name);
    if (!panel) return;
    panel.computeWorldMatrix(true);
    const worldPosition = panel.getAbsolutePosition().clone();
    const worldRotation = (this.root.rotationQuaternion ?? Quaternion.Identity()).clone();
    panel.parent = null;
    panel.position.copyFrom(worldPosition);
    panel.rotationQuaternion = worldRotation;
    this.panelDetached.add(name);

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
        .setRotation({ x: worldRotation.x, y: worldRotation.y, z: worldRotation.z, w: worldRotation.w })
        .setLinvel(this.body.linvel().x + impulse.x * 2.2, this.body.linvel().y + impulse.y * 2.2, this.body.linvel().z + impulse.z * 2.2)
        .setAngularDamping(0.55)
        .setLinearDamping(0.16)
        .setCanSleep(true)
    );
    const bounds = panel.getBoundingInfo().boundingBox.extendSize;
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        Math.max(0.04, bounds.x * 0.85),
        Math.max(0.025, bounds.y * 0.85),
        Math.max(0.04, bounds.z * 0.85)
      )
        .setMass(9)
        .setFriction(0.48)
        .setRestitution(0.08),
      body
    );
    this.registry.set(collider.handle, {
      kind: 'prop',
      stiffness: 0.55,
      contactArea: 0.34,
      material: 'steel',
      mass: 9,
      label: name
    });
    this.detached.push({ body, mesh: panel });
  }

  syncDetached() {
    for (const prop of this.detached) {
      const p = prop.body.translation();
      const q = prop.body.rotation();
      prop.mesh.position.set(p.x, p.y, p.z);
      prop.mesh.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
    }
  }

  speedMps() {
    return this.controller.currentVehicleSpeed();
  }

  speedKmh() {
    return Math.abs(this.speedMps()) * 3.6;
  }

  forward() {
    const q = this.root.rotationQuaternion ?? Quaternion.Identity();
    const rotation = Matrix.Zero();
    q.toRotationMatrix(rotation);
    return Vector3.TransformNormal(Vector3.Forward(), rotation).normalize();
  }

  effects() {
    return deriveDamageEffects(this.damage);
  }

  get throttle() {
    return this.lastInput.throttle;
  }

  dispose() {
    this.registry.delete(this.collider.handle);
    this.controller.free();
    this.world.removeRigidBody(this.body);
    for (const prop of this.detached) {
      if (prop.body.isValid()) this.world.removeRigidBody(prop.body);
      prop.mesh.dispose();
    }
    this.root.dispose(false, true);
  }
}
