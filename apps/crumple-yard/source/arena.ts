import {
  Color3,
  Mesh,
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
  private showroom: TransformNode | null = null;
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
  private rubber: PBRMaterial;
  private warning: PBRMaterial;
  private metalLight: PBRMaterial;

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
    this.rubber = pbr(scene, 'yard-rubber', new Color3(0.07, 0.08, 0.077), 0.99);
    this.warning = pbr(scene, 'yard-safety-yellow', new Color3(0.98, 0.64, 0.12), 0.82);
    this.metalLight = pbr(scene, 'yard-galvanized', new Color3(0.44, 0.48, 0.49), 0.53, 0.67);
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
    this.decorateObstacle(config, mesh);
    return { mesh, body, collider };
  }

  private surfaceBox(name: string, parent: Mesh | TransformNode, position: Vector3, size: Vector3, material: PBRMaterial) {
    const detail = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, this.scene);
    detail.parent = parent;
    detail.position.copyFrom(position);
    detail.material = material;
    detail.isPickable = false;
    return detail;
  }

  // Rendered dressing follows each existing rigid collider. Decorative geometry
  // never creates hidden collision or changes contact severity.
  private decorateObstacle(config: BoxObstacle, mesh: Mesh) {
    const { x: w, y: h, z: d } = config.size;
    const isJersey = config.name.startsWith('jersey-');
    const isRamp = config.name === 'test-ramp';
    const impact = config.name === 'impact-wall';
    if (config.name.endsWith('-wall') || impact) {
      const faceZ = d / 2 + 0.012;
      this.surfaceBox(config.name + '-footing', mesh,
        new Vector3(0, -h * 0.43, faceZ),
        new Vector3(w * 0.98, 0.045, 0.045), this.steel);
      const seamCount = Math.max(1, Math.floor(w / 4));
      for (let i = 1; i < seamCount; i++) {
        this.surfaceBox(config.name + '-joint-' + i, mesh,
          new Vector3(-w / 2 + i * w / seamCount, 0, faceZ),
          new Vector3(0.027, h * 0.84, 0.026), this.steel);
      }
    }
    if (impact) {
      // Very visible impact target, visually distinct from the yard boundaries.
      this.surfaceBox('impact-top-beam', mesh, new Vector3(0, h * 0.46, 0),
        new Vector3(w * 1.035, 0.15, d * 1.08), this.metalLight);
      this.surfaceBox('impact-base-beam', mesh, new Vector3(0, -h * 0.42, 0),
        new Vector3(w * 1.04, 0.14, d * 1.08), this.steel);
      for (let i = 0; i < 18; i++) {
        const stripe = this.surfaceBox('impact-chevron-' + i, mesh,
          new Vector3(-w * 0.46 + i * w * 0.054, -h * 0.25, d * 0.51),
          new Vector3(w * 0.036, h * 0.28, 0.022), i % 2 ? this.rubber : this.warning);
        stripe.rotation.z = -0.47;
      }
      for (const x of [-w * 0.32, 0, w * 0.32]) {
        this.surfaceBox('impact-strike-pad', mesh, new Vector3(x, h * 0.07, d * 0.51),
          new Vector3(w * 0.12, h * 0.4, 0.06), this.metalLight);
        this.surfaceBox('impact-strike-dark', mesh, new Vector3(x, h * 0.07, d * 0.55),
          new Vector3(w * 0.06, h * 0.26, 0.03), this.steel);
      }
    } else if (isJersey) {
      // Trapezoid-looking modular concrete barriers; full rigid shape unchanged.
      this.surfaceBox(config.name + '-top-rib', mesh, new Vector3(0, h * 0.45, 0),
        new Vector3(w * 0.86, 0.06, d * 0.66), this.concrete);
      for (const side of [-1, 1]) {
        this.surfaceBox(config.name + '-toe', mesh, new Vector3(0, -h * 0.40, side * d * 0.45),
          new Vector3(w, 0.13, 0.11), this.metalLight);
        this.surfaceBox(config.name + '-reflector', mesh, new Vector3(0, h * 0.22, side * d * 0.515),
          new Vector3(w * 0.62, 0.11, 0.026), this.warning);
      }
    } else if (isRamp) {
      for (const side of [-1, 1]) {
        this.surfaceBox('ramp-guard-' + side, mesh,
          new Vector3(side * w * 0.48, 0.18, 0),
          new Vector3(0.11, 0.25, d * 0.99), this.warning);
      }
      for (let i = -4; i <= 4; i++) {
        this.surfaceBox('ramp-grip-' + i, mesh,
          new Vector3(0, h * 0.54, i * d * 0.098),
          new Vector3(w * 0.88, 0.024, 0.06), this.metalLight);
      }
    } else if (config.material === 'steel') {
      for (const side of [-1, 1]) {
        this.surfaceBox('steel-rim-' + config.name + side, mesh,
          new Vector3(side * w * 0.49, h * 0.35, 0),
          new Vector3(0.06, 0.07, d), this.metalLight);
      }
    }
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
    const base = MeshBuilder.CreateCylinder(name + '-base', { diameter: radius * 4.5, height: 0.17, tessellation: 12 }, this.scene);
    base.position.set(position.x, 0.085, position.z); base.material = this.steel;
    const cap = MeshBuilder.CreateCylinder(name + '-cap', { diameter: radius * 2.2, height: 0.21, tessellation: 12 }, this.scene);
    cap.position.set(position.x, height - 0.08, position.z); cap.material = this.metalLight;
    for (const y of [0.68, 1.45]) {
      const band = MeshBuilder.CreateCylinder(name + '-band', { diameter: radius * 2.09, height: 0.16, tessellation: 12 }, this.scene);
      band.position.set(position.x, y, position.z); band.material = this.warning;
    }
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
    for (const side of [-1, 1]) {
      this.surfaceBox(name + '-brace-x-' + side, root, new Vector3(side * size * 0.505, 0, 0),
        new Vector3(0.035, size * 0.76, size * 0.09), this.metalLight);
      this.surfaceBox(name + '-brace-z-' + side, root, new Vector3(0, 0, side * size * 0.505),
        new Vector3(size * 0.72, size * 0.09, 0.035), this.metalLight);
    }
    this.surfaceBox(name + '-top-panel', root, new Vector3(0, size * 0.505, 0),
      new Vector3(size * 0.75, 0.02, size * 0.75), this.warning);
    this.dynamicProps.push({ body, mesh: root });
  }

  private barrel(name: string, position: Vector3) {
    const radius = 0.34, height = 0.87;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.23).setAngularDamping(0.2).setCanSleep(true)
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(height / 2, radius)
        .setMass(62).setFriction(0.7).setRestitution(0.08)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(650), body
    );
    this.register(collider, { stiffness: 0.48, area: 0.3, mass: 62, material: 'soft', label: name, kind: 'prop' });
    const root = new TransformNode(name + '-root', this.scene);
    const drum = MeshBuilder.CreateCylinder(name, { height, diameter: radius * 2, tessellation: 18 }, this.scene);
    drum.parent = root;
    drum.material = this.orange;
    for (const y of [-0.36, -0.19, 0.19, 0.36]) {
      const band = MeshBuilder.CreateCylinder(name + '-rib', { height: 0.055, diameter: radius * 2.06, tessellation: 18 }, this.scene);
      band.parent = root; band.position.y = y; band.material = this.steel;
    }
    const lid = MeshBuilder.CreateCylinder(name + '-lid', { height: 0.03, diameter: radius * 1.75, tessellation: 18 }, this.scene);
    lid.parent = root; lid.position.y = height / 2 + 0.017; lid.material = this.metalLight;
    this.dynamicProps.push({ body, mesh: root });
  }

  private makeShowroom() {
    const root = new TransformNode('garage-rotary-test-plinth', this.scene);
    root.position.set(0, 0, -24);
    this.showroom = root;
    const deck = MeshBuilder.CreateCylinder('garage-deck', { height: 0.35, diameter: 10.3, tessellation: 60 }, this.scene);
    deck.position.y = 0.35; deck.parent = root; deck.material = this.steel;
    const surface = MeshBuilder.CreateCylinder('garage-surface', { height: 0.04, diameter: 10.1, tessellation: 60 }, this.scene);
    surface.position.y = 0.53; surface.parent = root; surface.material = this.metalLight;
    const groove = MeshBuilder.CreateTorus('garage-index-ring', { diameter: 9.2, thickness: 0.09, tessellation: 64 }, this.scene);
    groove.position.y = 0.565; groove.parent = root; groove.material = this.warning;
    for (let index = 0; index < 20; index++) {
      const angle = index * Math.PI / 10;
      const mark = MeshBuilder.CreateBox('garage-degree-mark-' + index, {
        width: index % 5 === 0 ? 0.22 : 0.10, height: 0.025,
        depth: index % 5 === 0 ? 0.63 : 0.3
      }, this.scene);
      mark.parent = root;
      mark.position.set(Math.sin(angle) * 4.0, 0.567, Math.cos(angle) * 4.0);
      mark.rotation.y = angle;
      mark.material = index % 5 === 0 ? this.warning : this.paint;
    }
    const center = MeshBuilder.CreateBox('garage-spine', { width: 0.11, height: 0.024, depth: 6.7 }, this.scene);
    center.parent = root; center.position.y = 0.57; center.material = this.warning;
    center.visibility = 0.6;
  }

  setGarage(visible: boolean) {
    this.showroom?.setEnabled(visible);
  }

  private build() {
    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.22, 0));
    const groundCollider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(38, 0.2, 38).setFriction(1.16).setRestitution(0.01), groundBody);
    this.register(groundCollider, { stiffness: 1.55, area: 2.2, material: 'concrete', mass: Number.POSITIVE_INFINITY, label: 'asphalt' });

    const ground = MeshBuilder.CreateGround('crash-yard', { width: 76, height: 76, subdivisions: 1 }, this.scene);
    ground.material = this.asphalt;
    ground.receiveShadows = true;

    // Deterministic tire-worn paving: each zone communicates direction and scale.
    for (let i = 0; i < 31; i++) {
      const x = Math.sin(i * 8.29) * 29;
      const z = Math.cos(i * 5.13) * 29;
      const patch = MeshBuilder.CreateBox('surface-wear-' + i, {
        width: 0.26 + (i % 3) * 0.19, height: 0.006,
        depth: 1.1 + (i % 5) * 0.65
      }, this.scene);
      patch.position.set(x, 0.007, z);
      patch.rotation.y = Math.sin(i * 1.75) * 0.3;
      patch.material = i % 4 ? this.steel : this.concrete;
      patch.visibility = 0.17;
      patch.isPickable = false;
    }

    const boundary: BoxObstacle[] = [
      { name: 'north-wall', position: new Vector3(0, 1.2, 35), size: new Vector3(70, 2.4, 0.8) },
      { name: 'south-wall', position: new Vector3(0, 1.2, -35), size: new Vector3(70, 2.4, 0.8) },
      { name: 'east-wall', position: new Vector3(35, 1.2, 0), size: new Vector3(0.8, 2.4, 70) },
      { name: 'west-wall', position: new Vector3(-35, 1.2, 0), size: new Vector3(0.8, 2.4, 70) }
    ];
    boundary.forEach((entry) => this.fixedBox(entry));
    this.makeShowroom();

    this.fixedBox({ name: 'impact-wall', position: new Vector3(0, 1.05, 28), size: new Vector3(15, 2.1, 1.4), stiffness: 2.05, area: 1.6 });
    this.fixedBox({ name: 'offset-wall-left', position: new Vector3(-11.5, 0.75, 12), size: new Vector3(6.5, 1.5, 0.9), stiffness: 1.9, area: 1.15 });
    this.fixedBox({ name: 'offset-wall-right', position: new Vector3(10.5, 0.75, 5.5), size: new Vector3(0.9, 1.5, 8), stiffness: 1.9, area: 1.1 });

    this.pole('pole-a', new Vector3(-5.5, 1.9, 15));
    this.pole('pole-b', new Vector3(7.2, 1.9, 18));
    this.pole('pole-c', new Vector3(20, 1.9, -9), 0.23);

    // Immediate impact choices without forcing a 50-metre empty run-up.
    for (const [index, x, z] of [
      [0, -4.2, -11], [1, -3.4, -11.3], [2, 4.4, -11],
      [3, 5.2, -11.3], [4, -0.4, -4.5], [5, 0.4, -4.5]
    ]) this.barrel('impact-drum-' + index, new Vector3(x, 0.55, z));
    this.crate('trial-box-a', new Vector3(-2.0, 0.55, -7), 0.88);
    this.crate('trial-box-b', new Vector3(2.0, 0.55, -7), 0.88);

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
