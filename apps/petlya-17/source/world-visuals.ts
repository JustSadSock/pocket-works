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
    // Thin, functional driver's-eye frame. The circuit owns the central 75% of the view.
    const graphite = makeMaterial(this.scene, 'cabin-graphite', new Color3(0.035, 0.052, 0.056), 0.25);
    const satin = makeMaterial(this.scene, 'cabin-satin', new Color3(0.18, 0.24, 0.23), 0.36);
    const paint = makeMaterial(this.scene, 'cabin-paint', new Color3(0.89, 0.37, 0.17), 0.25);
    const leather = makeMaterial(this.scene, 'cabin-leather', new Color3(0.085, 0.096, 0.092), 0.14);
    const instrument = makeMaterial(this.scene, 'cabin-instrument', new Color3(0.13, 0.26, 0.25), 0.15);
    instrument.emissiveColor = new Color3(0.075, 0.17, 0.14);

    // Body work stays low. Avoid the old 4.2m nose hiding the road and kerbs.
    this.cockpitBox('cowl-left', { width: 0.43, height: 0.34, depth: 1.9 }, new Vector3(-0.86, -1.03, 1.48), paint);
    this.cockpitBox('cowl-right', { width: 0.43, height: 0.34, depth: 1.9 }, new Vector3(0.86, -1.03, 1.48), paint);
    this.cockpitBox('hood-low', { width: 0.62, height: 0.16, depth: 2.25 }, new Vector3(0, -1.16, 2.05), graphite);
    this.cockpitBox('hood-racing-stripe', { width: 0.095, height: 0.018, depth: 2.23 }, new Vector3(0, -1.064, 2.05), paint);
    this.cockpitBox('cockpit-lip', { width: 2.22, height: 0.21, depth: 0.24 }, new Vector3(0, -0.91, 0.81), leather);
    this.cockpitBox('instrument-screen', { width: 0.91, height: 0.16, depth: 0.06 }, new Vector3(0, -0.85, 0.95), instrument);

    // A mechanically plausible low roll hoop; nothing crosses the horizon.
    const left = this.cockpitBox('halo-left', { width: 0.09, height: 0.095, depth: 1.65 }, new Vector3(-0.75, -0.55, 1.56), satin);
    left.rotation.y = -0.2;
    const right = this.cockpitBox('halo-right', { width: 0.09, height: 0.095, depth: 1.65 }, new Vector3(0.75, -0.55, 1.56), satin);
    right.rotation.y = 0.2;

    const wheel = MeshBuilder.CreateTorus('driver-steering-ring', { diameter: 0.78, thickness: 0.086, tessellation: 22 }, this.scene);
    wheel.parent = this.wheelRoot;
    wheel.position.set(0, -0.82, 0.63);
    wheel.rotation.x = Math.PI / 2.25;
    wheel.material = graphite;
    wheel.layerMask = 0x2;
    wheel.alwaysSelectAsActiveMesh = true;
    this.cockpitBox('steering-wing', { width: 0.75, height: 0.12, depth: 0.16 }, new Vector3(0, -0.83, 0.66), satin, this.wheelRoot);
    this.cockpitBox('steering-hub', { width: 0.35, height: 0.2, depth: 0.12 }, new Vector3(0, -0.84, 0.7), graphite, this.wheelRoot);
    this.cockpitBox('wheel-marker', { width: 0.16, height: 0.07, depth: 0.07 }, new Vector3(0, -0.47, 0.68), paint, this.wheelRoot);

    for (const side of [-1, 1]) {
      this.cockpitBox('side-panel-' + side, { width: 0.12, height: 0.26, depth: 1.0 }, new Vector3(side * 1.05, -0.88, 0.62), graphite);
      const arm = this.cockpitBox('mirror-stalk-' + side, { width: 0.38, height: 0.055, depth: 0.06 }, new Vector3(side * 1.14, -0.58, 1.14), satin);
      arm.rotation.z = side * 0.12;
      const mirror = this.cockpitBox('mirror-housing-' + side, { width: 0.56, height: 0.23, depth: 0.08 }, new Vector3(side * 1.36, -0.54, 1.22), this.mirrorMaterial);
      mirror.rotation.y = side * -0.16;
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
    // A low-poly racing prototype, with a continuous tapered body rather than
    // a handful of intersecting shoe boxes. Silhouette remains readable at speed.
    const root = new TransformNode(name + '-rig-' + index, this.scene);
    const shell = makeMaterial(this.scene, name + '-enamel-' + index, bodyColor, 0.34);
    shell.roughness = 0.44;
    shell.backFaceCulling = false;
    const stripe = makeMaterial(this.scene, name + '-livery-' + index, stripeColor, 0.22);
    stripe.backFaceCulling = false;
    const carbon = makeMaterial(this.scene, name + '-carbon-' + index, new Color3(.035,.051,.055), .12);
    const tyre = makeMaterial(this.scene, name + '-tyres-' + index, new Color3(.026,.032,.034), .035);
    const alloy = makeMaterial(this.scene, name + '-alloy-' + index, new Color3(.5,.56,.54), .32);
    const glass = makeMaterial(this.scene, name + '-glass-' + index, new Color3(.07,.16,.19), .3);
    const lamp = makeMaterial(this.scene, name + '-lamps-' + index, new Color3(.99,.32,.12), .14);
    lamp.emissiveColor = new Color3(.5,.09,.02);
    const wheels: Mesh[] = [];

    const attach = (part: Mesh, pos: Vector3, mat: StandardMaterial, cast = false) => {
      part.parent = root; part.position.copyFrom(pos); part.material = mat;
      part.isPickable = false;
      if (cast) shadowGenerator.addShadowCaster(part);
      return part;
    };
    const b = (key: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: StandardMaterial, cast = false) =>
      attach(MeshBuilder.CreateBox(name + '-' + key + '-' + index, { width:w,height:h,depth:d }, this.scene), new Vector3(x,y,z), mat, cast);
    // Longitudinal rings: z, half-width, lower y, upper y.
    const hull = (key: string, rings: [number,number,number,number][], mat: StandardMaterial) => {
      const positions: number[] = [], indices: number[] = [], normals: number[] = [];
      for (const [z,w,bottom,top] of rings) {
        positions.push(-w,bottom,z,w,bottom,z,-w,top,z,w,top,z);
      }
      for (let i = 0; i < rings.length - 1; i++) {
        const a = i*4, next = a+4;
        for (const face of [[a,a+1,next+1,next],[a+2,next+2,next+3,a+3],[a,next,a+2],[a+1,a+3,next+1]]) {
          if (face.length === 4) indices.push(face[0],face[1],face[2],face[0],face[2],face[3]);
          else indices.push(face[0],face[1],face[2]);
        }
      }
      indices.push(0,2,3,0,3,1);
      const end=(rings.length-1)*4;
      indices.push(end,end+1,end+3,end,end+3,end+2);
      VertexData.ComputeNormals(positions, indices, normals);
      const mesh = new Mesh(name+'-'+key+'-'+index,this.scene);
      const data = new VertexData();
      data.positions=positions;data.indices=indices;data.normals=normals;data.applyToMesh(mesh);
      mesh.material=mat;mesh.parent=root;mesh.isPickable=false;
      shadowGenerator.addShadowCaster(mesh);
    };
    hull('monocoque', [[-1.6,.72,.28,.64],[-1.15,.9,.25,.74],[-.35,.92,.25,.80],[.55,.76,.26,.75],[1.4,.50,.28,.58],[2.15,.32,.27,.49],[3.2,.13,.27,.36]], shell);
    hull('engine-cowl', [[-1.82,.55,.62,.75],[-1.1,.68,.60,1.05],[-.48,.49,.62,1.02],[.15,.35,.66,.75]], shell);
    hull('stripe', [[-.9,.09,1.062,1.073],[-.45,.085,1.068,1.081],[.18,.08,.81,.83],[1.25,.075,.59,.61],[2.45,.06,.43,.45],[3.13,.04,.37,.385]], stripe);
    for (const side of [-1,1]) {
      const x=side*.89;
      b('sidepod-'+side,.57,.37,1.62,x,.43,.05,shell,true);
      b('sidepod-trim-'+side,.64,.075,1.66,x,.62,.05,stripe);
      b('side-intake-'+side,.13,.21,.44,side*1.17,.54,-.49,carbon);
      b('susp-front-'+side,.12,.10,1.12,side*.76,.4,2.09,carbon);
      b('susp-rear-'+side,.10,.11,1.02,side*.8,.42,-1.06,carbon);
      b('mirror-leg-'+side,.09,.38,.09,side*.69,.94,.72,carbon);
      b('mirror-'+side,.46,.18,.24,side*.81,1.17,.8,carbon);
      b('headlight-'+side,.21,.10,.18,side*.37,.36,2.85,alloy);
      b('tail-light-'+side,.27,.12,.08,side*.57,.63,-1.76,lamp);
      for (const z of [-1.24,1.72]) {
        const wheel = attach(MeshBuilder.CreateCylinder(name+'-tyre-'+index+'-'+side+'-'+z,
          { height:.38, diameter:.98, tessellation:20 },this.scene),new Vector3(side*1.15,.46,z),tyre,true);
        wheel.rotation.z=Math.PI/2;
        wheels.push(wheel);
        const hub=attach(MeshBuilder.CreateCylinder(name+'-wheel-hub-'+index+'-'+side+'-'+z,
          { height:.401,diameter:.57,tessellation:12 },this.scene),new Vector3(side*1.15,.46,z),alloy);
        hub.rotation.z=Math.PI/2;
        const center=attach(MeshBuilder.CreateCylinder(name+'-wheel-nut-'+index+'-'+side+'-'+z,
          { height:.43,diameter:.13,tessellation:8 },this.scene),new Vector3(side*1.15,.46,z),carbon);
        center.rotation.z=Math.PI/2;
      }
    }
    // Three-dimensional nose splitter, twin wings and real cockpit cavity.
    b('splitter',1.43,.075,1.48,0,.22,2.65,carbon);
    b('front-wing',2.72,.07,.4,0,.3,2.95,carbon);
    b('front-wing-paint',2.6,.035,.12,0,.35,2.92,stripe);
    for (const side of [-1,1]) b('wing-endplate-'+side,.12,.24,.63,side*1.38,.35,2.95,shell);
    b('rear-wing',2.42,.12,.59,0,1.28,-1.83,carbon);
    b('rear-wing-livery',2.3,.04,.18,0,1.36,-1.83,stripe);
    for(const side of [-1,1]) b('rear-wing-support-'+side,.12,.5,.12,side*.53,.98,-1.74,carbon);
    b('diffuser',1.68,.1,.55,0,.3,-1.9,carbon);
    b('windshield',1.13,.30,.19,0,.95,.53,glass);
    const driver=attach(MeshBuilder.CreateSphere(name+'-helmet-'+index,{diameter:.48,segments:10},this.scene),new Vector3(0,1.07,.23),stripe);
    driver.scaling.y=.88;
    const visor=b('visor',.38,.12,.12,0,1.09,.44,glass);
    visor.rotation.x=-.15;
    const roll=attach(MeshBuilder.CreateTorus(name+'-roll-'+index,{diameter:.81,thickness:.095,tessellation:14},this.scene),new Vector3(0,.97,-.24),carbon);
    roll.rotation.x=.28;
    for(const side of [-1,1]) {
      const exhaust=attach(MeshBuilder.CreateCylinder(name+'-exhaust-'+index+'-'+side,{height:.36,diameter:.22,tessellation:10},this.scene),
        new Vector3(side*.31,.68,-2.0),alloy);
      exhaust.rotation.x=Math.PI/2;
    }
    return {root,wheels};
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

  private previewTime = 0;

  setRacingView(): void {
    this.cockpitRoot.setEnabled(true);
    this.initializeCamera();
  }

  updatePreview(delta: number): void {
    this.previewTime += Math.min(delta, .05);
    this.cockpitRoot.setEnabled(false);
    const focal = this.track.sample(34);
    const angle = -.55 + Math.sin(this.previewTime * .18) * .12;
    const start = this.track.sample(5);
    const desired = focal.position
      .add(focal.right.scale(19 * Math.cos(angle)))
      .add(focal.tangent.scale(-24 + 10 * Math.sin(angle)))
      .add(focal.up.scale(7.2));
    this.camera.position.copyFrom(desired);
    this.camera.setTarget(start.position.add(start.tangent.scale(38)).add(start.up.scale(1.05)));
    this.camera.fov = .90;
    this.camera.rotation.z = 0;
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
    const lookAhead = lerp(15, 28, feel);
    const ahead = this.track.sample(motion.distance + lookAhead);
    const lanePosition = current.position.add(current.right.scale(motion.lane));
    const aheadPosition = ahead.position
      .add(ahead.right.scale(motion.lane * 0.82))
      .add(current.right.scale(motion.yawOffset * lookAhead * 0.43));
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
    const desiredTarget = aheadPosition.add(ahead.up.scale(0.5 - brakingPitch * 0.28));
    this.cameraPosition = Vector3.Lerp(this.cameraPosition, desiredPosition, Math.min(1, delta * (8 - feel * 2.5)));
    this.cameraTarget = Vector3.Lerp(this.cameraTarget, desiredTarget, Math.min(1, delta * (7 - feel * 2)));
    this.camera.position.copyFrom(this.cameraPosition);
    this.camera.setTarget(this.cameraTarget);
    this.camera.fov += (lerp(1.00, 1.23, feel) - this.camera.fov) * Math.min(1, delta * 5.5);
    this.camera.rotation.z = clamp(current.bank * 0.55 - motion.steer * 0.016 + motion.bodyRoll * 0.5 - motion.lateralSpeed * 0.004, -0.12, 0.12);

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
