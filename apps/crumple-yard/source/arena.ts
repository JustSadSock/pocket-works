import {
  Color3,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  Scene,
  TransformNode,
  Vector3
} from '@babylonjs/core';
import RAPIER from '@dimforge/rapier3d-compat';
import type { CollisionRegistry, DynamicProp, ObstacleMaterial } from './physics-types';

type BoxObstacle = {
  name: string;
  position: Vector3;
  size: Vector3;
  rotation?: Vector3;
  material?: ObstacleMaterial;
  stiffness?: number;
  area?: number;
  color?: Color3;
};

function pbr(scene: Scene, name: string, color: Color3, roughness = 0.9, metallic = 0) {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color;
  material.roughness = roughness;
  material.metallic = metallic;
  return material;
}

function toRapierQuaternion(rotation: Vector3) {
  const q = Quaternion.FromEulerAngles(rotation.x, rotation.y, rotation.z);
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

export class CrashYard {
  readonly dynamicProps: DynamicProp[] = [];
  readonly trafficWaypoints = [
    new Vector3(-14, 0.2, 24),
    new Vector3(13, 0.2, 24),
    new Vector3(18, 0.2, 6),
    new Vector3(16, 0.2, -20),
    new Vector3(-11, 0.2, -24),
    new Vector3(-19, 0.2, -5)
  ];
  private asphalt: PBRMaterial;
  private concrete: PBRMaterial;
  private steel: PBRMaterial;
  private orange: PBRMaterial;
  private paint: PBRMaterial;

  constructor(
    private scene: Scene,
    private world: RAPIER.World,
    private registry: CollisionRegistry
  ) {
    this.asphalt = pbr(scene, 'yard-asphalt', new Color3(0.19, 0.205, 0.205), 0.97);
    this.concrete = pbr(scene, 'yard-concrete', new Color3(0.55, 0.54, 0.5), 0.94);
    this.steel = pbr(scene, 'yard-steel', new Color3(0.25, 0.27, 0.275), 0.46, 0.62);
    this.orange = pbr(scene, 'yard-orange', new Color3(0.92, 0.26, 0.055), 0.72, 0.06);
    this.paint = pbr(scene, 'yard-paint', new Color3(0.78, 0.77, 0.68), 0.86);
    this.build();
  }

  private register(collider: RAPIER.Collider, meta: { stiffness: number; area: number; material: ObstacleMaterial; mass: number; label: string; kind?: 'obstacle' | 'prop' }) {
    this.registry.set(collider.handle, {
      kind: meta.kind ?? 'obstacle',
      stiffness: meta.stiffness,
      contactArea: meta.area,
      material: meta.material,
      mass: meta.mass,
      label: meta.label
    });
  }

  private fixedBox(config: BoxObstacle) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(config.position.x, config.position.y, config.position.z)
        .setRotation(toRapierQuaternion(config.rotation ?? Vector3.Zero()))
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(config.size.x / 2, config.size.y / 2, config.size.z / 2)
        .setFriction(config.material === 'steel' ? 0.58 : 0.92)
        .setRestitution(0.03)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(1800),
      body
    );
    this.register(collider, {
      stiffness: config.stiffness ?? 1.7,
      area: config.area ?? Math.min(1.8, Math.max(0.25, config.size.x * config.size.y)),
      material: config.material ?? 'concrete',
      mass: Number.POSITIVE_INFINITY,
      label: config.name
    });

    const mesh = MeshBuilder.CreateBox(config.name, { width: config.size.x, height: config.size.y, depth: config.size.z }, this.scene);
    mesh.position.copyFrom(config.position);
    mesh.rotation.copyFrom(config.rotation ?? Vector3.Zero());
    mesh.material = config.material === 'steel' ? this.steel : config.color ? pbr(this.scene, config.name + '-mat', config.color) : this.concrete;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    return { mesh, body, collider };
  }

  private pole(name: string, position: Vector3, radius = 0.19, height = 3.8) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z));
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(height / 2, radius)
        .setFriction(0.72)
        .setRestitution(0.03)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(1200),
      body
    );
    this.register(collider, { stiffness: 2.35, area: 0.13, material: 'steel', mass: Number.POSITIVE_INFINITY, label: name });
    const mesh = MeshBuilder.CreateCylinder(name, { height, diameter: radius * 2, tessellation: 16 }, this.scene);
    mesh.position.copyFrom(position);
    mesh.material = this.steel;
    mesh.receiveShadows = true;
  }

  private crate(name: string, position: Vector3, size = 0.78) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.16)
        .setAngularDamping(0.32)
        .setCanSleep(true)
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2)
        .setMass(34)
        .setFriction(0.72)
        .setRestitution(0.12)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(900),
      body
    );
    this.register(collider, { stiffness: 0.46, area: 0.72, material: 'soft', mass: 34, label: name, kind: 'prop' });
    const root = new TransformNode(name + '-root', this.scene);
    const mesh = MeshBuilder.CreateBox(name, { size }, this.scene);
    mesh.parent = root;
    mesh.material = this.orange;
    mesh.receiveShadows = true;
    const band = MeshBuilder.CreateBox(name + '-band', { width: size * 1.02, height: size * 0.14, depth: size * 1.02 }, this.scene);
    band.parent = root;
    band.material = this.steel;
    this.dynamicProps.push({ body, mesh: root });
  }

  private build() {
    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.22, 0));
    const groundCollider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(38, 0.2, 38).setFriction(1.16).setRestitution(0.01), groundBody);
    this.register(groundCollider, { stiffness: 1.55, area: 2.2, material: 'concrete', mass: Number.POSITIVE_INFINITY, label: 'asphalt' });

    const ground = MeshBuilder.CreateGround('crash-yard', { width: 76, height: 76, subdivisions: 1 }, this.scene);
    ground.material = this.asphalt;
    ground.receiveShadows = true;

    const boundary: BoxObstacle[] = [
      { name: 'north-wall', position: new Vector3(0, 1.2, 35), size: new Vector3(70, 2.4, 0.8) },
      { name: 'south-wall', position: new Vector3(0, 1.2, -35), size: new Vector3(70, 2.4, 0.8) },
      { name: 'east-wall', position: new Vector3(35, 1.2, 0), size: new Vector3(0.8, 2.4, 70) },
      { name: 'west-wall', position: new Vector3(-35, 1.2, 0), size: new Vector3(0.8, 2.4, 70) }
    ];
    boundary.forEach((entry) => this.fixedBox(entry));

    this.fixedBox({ name: 'impact-wall', position: new Vector3(0, 1.05, 28), size: new Vector3(15, 2.1, 1.4), stiffness: 2.05, area: 1.6 });
    this.fixedBox({ name: 'offset-wall-left', position: new Vector3(-11.5, 0.75, 12), size: new Vector3(6.5, 1.5, 0.9), stiffness: 1.9, area: 1.15 });
    this.fixedBox({ name: 'offset-wall-right', position: new Vector3(10.5, 0.75, 5.5), size: new Vector3(0.9, 1.5, 8), stiffness: 1.9, area: 1.1 });

    this.pole('pole-a', new Vector3(-5.5, 1.9, 15));
    this.pole('pole-b', new Vector3(7.2, 1.9, 18));
    this.pole('pole-c', new Vector3(20, 1.9, -9), 0.23);

    for (let i = 0; i < 5; i += 1) {
      this.fixedBox({
        name: 'jersey-' + i,
        position: new Vector3(-22 + i * 2.3, 0.48, -4 + i * 0.55),
        size: new Vector3(1.75, 0.96, 0.72),
        stiffness: 1.62,
        area: 0.64
      });
    }

    const rampAngle = -0.24;
    this.fixedBox({
      name: 'test-ramp',
      position: new Vector3(13, 0.55, -20),
      size: new Vector3(4.6, 0.45, 8.5),
      rotation: new Vector3(rampAngle, 0, 0),
      stiffness: 1.45,
      area: 1.4,
      material: 'steel'
    });

    for (let i = 0; i < 7; i += 1) {
      this.crate('crash-crate-' + i, new Vector3(-14 + (i % 3) * 0.9, 0.55 + Math.floor(i / 3) * 0.82, -18 + (i % 2) * 0.15), 0.76);
    }

    const lane = (x: number, z: number, w: number, d: number) => {
      const mesh = MeshBuilder.CreateBox('lane-mark', { width: w, height: 0.012, depth: d }, this.scene);
      mesh.position.set(x, 0.012, z);
      mesh.material = this.paint;
    };
    for (let z = -28; z <= 22; z += 6) lane(0, z, 0.13, 2.7);
    lane(-17, 0, 0.1, 51);
    lane(17, 0, 0.1, 51);

    const pad = MeshBuilder.CreateDisc('impact-pad', { radius: 5.4, tessellation: 48 }, this.scene);
    pad.rotation.x = Math.PI / 2;
    pad.position.set(0, 0.018, 19.5);
    const padMat = pbr(this.scene, 'impact-pad-mat', new Color3(0.27, 0.275, 0.265), 1);
    pad.material = padMat;

    for (let i = 0; i < 12; i += 1) {
      const stripe = MeshBuilder.CreateBox('safety-stripe-' + i, { width: 0.55, height: 0.015, depth: 3.2 }, this.scene);
      stripe.position.set(-3.1 + i * 0.56, 0.025, 25.7);
      stripe.rotation.y = -0.48;
      stripe.material = i % 2 ? this.orange : this.steel;
    }
  }

  sync() {
    for (const prop of this.dynamicProps) {
      const p = prop.body.translation();
      const q = prop.body.rotation();
      prop.mesh.position.set(p.x, p.y, p.z);
      prop.mesh.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
    }
  }
}
