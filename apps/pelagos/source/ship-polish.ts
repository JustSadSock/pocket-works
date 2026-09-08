import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShipState, ShipTelemetry } from './core';
import { angleDelta, clamp, smoothTo, wrapAngle } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type NodeMotion = {
  node: TransformNode;
  base: Vector3;
};

type RopeSegment = {
  root: TransformNode;
  mesh: Mesh;
};

type CraftRig = {
  helm: NodeMotion | null;
  anchors: NodeMotion[];
  portLantern: NodeMotion | null;
  starboardLantern: NodeMotion | null;
  bell: NodeMotion | null;
  clapper: NodeMotion | null;
  compassParts: NodeMotion[];
  portBlock: NodeMotion | null;
  starboardBlock: NodeMotion | null;
  sheetPort: RopeSegment;
  sheetStarboard: RopeSegment;
  boomEnd: Vector3;
  portEnd: Vector3;
  starboardEnd: Vector3;
  compassYaw: number;
  glowMaterial: PBRMaterial | null;
  lanternLights: PointLight[];
  authoredResolved: boolean;
};

const rigs = new WeakMap<OceanWorld, CraftRig>();

function makeRopeMaterial(world: OceanWorld): Material {
  const existing = world.scene.getMaterialByName('hemp-rigging');
  if (existing) return existing;
  const fallback = new StandardMaterial('crafted-running-rigging', world.scene);
  fallback.diffuseColor = new Color3(0.28, 0.19, 0.085);
  fallback.specularColor = new Color3(0.035, 0.026, 0.018);
  fallback.specularPower = 10;
  return fallback;
}

function makeRopeSegment(world: OceanWorld, name: string, material: Material): RopeSegment {
  const root = new TransformNode(`${name}-root`, world.scene);
  const mesh = MeshBuilder.CreateCylinder(name, {
    height: 1,
    diameter: 0.025,
    tessellation: 7
  }, world.scene);
  mesh.parent = root;
  mesh.rotation.x = Math.PI * 0.5;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.visibility = 0;
  return { root, mesh };
}

function capture(node: TransformNode | null): NodeMotion | null {
  if (!node) return null;
  if (node.rotationQuaternion) {
    const euler = node.rotationQuaternion.toEulerAngles();
    node.rotationQuaternion = null;
    node.rotation.copyFrom(euler);
  }
  return { node, base: node.rotation.clone() };
}

function ensureRig(world: OceanWorld): CraftRig {
  const existing = rigs.get(world);
  if (existing) return existing;
  const ropeMaterial = makeRopeMaterial(world);
  const rig: CraftRig = {
    helm: capture(world.scene.getTransformNodeByName('helm-wheel')),
    anchors: [
      capture(world.scene.getTransformNodeByName('anchor--1')),
      capture(world.scene.getTransformNodeByName('anchor-1'))
    ].filter((entry): entry is NodeMotion => Boolean(entry)),
    portLantern: null,
    starboardLantern: null,
    bell: null,
    clapper: null,
    compassParts: [],
    portBlock: null,
    starboardBlock: null,
    sheetPort: makeRopeSegment(world, 'crafted-main-sheet-port', ropeMaterial),
    sheetStarboard: makeRopeSegment(world, 'crafted-main-sheet-starboard', ropeMaterial),
    boomEnd: new Vector3(),
    portEnd: new Vector3(),
    starboardEnd: new Vector3(),
    compassYaw: 0,
    glowMaterial: null,
    lanternLights: [],
    authoredResolved: false
  };
  rigs.set(world, rig);
  return rig;
}

function resolveAuthoredNodes(world: OceanWorld, rig: CraftRig): void {
  if (rig.authoredResolved) return;
  if (document.documentElement.dataset.pelagosShipAsset !== 'blender') return;

  rig.portLantern ??= capture(world.scene.getTransformNodeByName('PW_LanternPortPivot'));
  rig.starboardLantern ??= capture(world.scene.getTransformNodeByName('PW_LanternStarboardPivot'));
  rig.bell ??= capture(world.scene.getTransformNodeByName('PW_BellPivot'));
  rig.clapper ??= capture(world.scene.getMeshByName('PW_BellClapper'));
  rig.portBlock ??= capture(world.scene.getTransformNodeByName('PW_SheetBlockPortPivot'));
  rig.starboardBlock ??= capture(world.scene.getTransformNodeByName('PW_SheetBlockStarboardPivot'));
  if (rig.compassParts.length === 0) {
    const parts = ['PW_CompassCard', 'PW_CompassNorth', 'PW_CompassEastWest'];
    rig.compassParts = parts
      .map((name) => capture(world.scene.getMeshByName(name)))
      .filter((entry): entry is NodeMotion => Boolean(entry));
  }

  const glow = world.scene.getMaterialByName('PELAGOS Lantern Glow');
  if (glow instanceof PBRMaterial) rig.glowMaterial = glow;
  const importedRope = world.scene.getMaterialByName('PELAGOS Hemp Rope');
  if (importedRope) {
    rig.sheetPort.mesh.material = importedRope;
    rig.sheetStarboard.mesh.material = importedRope;
  }

  if (!rig.portLantern || !rig.starboardLantern || !rig.bell || !rig.portBlock || !rig.starboardBlock) return;

  for (const side of [-1, 1]) {
    world.scene.getMeshByName(`lantern-frame-${side}`)?.setEnabled(false);
    world.scene.getMeshByName(`lantern-glow-${side}`)?.setEnabled(false);
  }

  const attachLight = (side: number, motion: NodeMotion) => {
    const light = world.scene.getLightByName(`lantern-light-${side}`);
    if (!(light instanceof PointLight)) return;
    light.parent = motion.node;
    light.position.set(0, -0.22, 0);
    rig.lanternLights.push(light);
  };
  attachLight(-1, rig.portLantern);
  attachLight(1, rig.starboardLantern);

  rig.authoredResolved = true;
  document.documentElement.dataset.pelagosShipCraft = 'animated';
}

function updateRopeSegment(segment: RopeSegment, start: Vector3, end: Vector3, load: number): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.max(0.02, Math.hypot(dx, dy, dz));
  const horizontal = Math.max(0.0001, Math.hypot(dx, dz));
  segment.root.position.set((start.x + end.x) * 0.5, (start.y + end.y) * 0.5, (start.z + end.z) * 0.5);
  segment.root.rotation.y = Math.atan2(dx, dz);
  segment.root.rotation.x = -Math.atan2(dy, horizontal);
  segment.mesh.scaling.y = length;
  const tension = 0.88 + clamp(load, 0, 1.2) * 0.16;
  segment.mesh.scaling.x = tension;
  segment.mesh.scaling.z = tension;
  segment.mesh.visibility = 0.88 + clamp(load, 0, 1) * 0.12;
}

function updateRunningRigging(world: OceanWorld, rig: CraftRig, telemetry: ShipTelemetry): void {
  const boom = world.scene.getMeshByName('physical-main-boom');
  if (!boom || !boom.isEnabled()) {
    rig.sheetPort.mesh.visibility = 0;
    rig.sheetStarboard.mesh.visibility = 0;
    return;
  }

  Vector3.TransformCoordinatesToRef(new Vector3(0, -2.18, 0), boom.getWorldMatrix(), rig.boomEnd);

  if (rig.portBlock) rig.portEnd.copyFrom(rig.portBlock.node.getAbsolutePosition());
  else Vector3.TransformCoordinatesToRef(new Vector3(-0.86, 1.19, -3.04), world.shipRoot.getWorldMatrix(), rig.portEnd);
  if (rig.starboardBlock) rig.starboardEnd.copyFrom(rig.starboardBlock.node.getAbsolutePosition());
  else Vector3.TransformCoordinatesToRef(new Vector3(0.86, 1.19, -3.04), world.shipRoot.getWorldMatrix(), rig.starboardEnd);

  const load = clamp(telemetry.sailEfficiency * telemetry.apparentWindSpeed / 10.5, 0, 1.25);
  updateRopeSegment(rig.sheetPort, rig.portEnd, rig.boomEnd, load);
  updateRopeSegment(rig.sheetStarboard, rig.starboardEnd, rig.boomEnd, load);
}

function updateCraftMotion(
  rig: CraftRig,
  state: ShipState,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number,
  dt: number
): void {
  const safeDt = clamp(dt, 1 / 240, 1 / 20);
  const seaEnergy = clamp(
    Math.abs(state.roll) * 3.2 + Math.abs(state.pitch) * 2.6 + environment.waveScale * 0.10 + environment.storm * 0.22,
    0,
    1.45
  );
  const sailLoad = clamp(telemetry.sailEfficiency * telemetry.apparentWindSpeed / 14, 0, 1.2);

  if (rig.helm) {
    rig.helm.node.rotation.z = smoothTo(
      rig.helm.node.rotation.z,
      rig.helm.base.z - state.rudder * 3.35,
      11.5,
      safeDt
    );
  }

  const moveLantern = (motion: NodeMotion | null, phase: number, side: number) => {
    if (!motion) return;
    const swayX = -state.pitch * 0.34 + Math.sin(time * 2.1 + phase) * seaEnergy * 0.025;
    const swayZ = -state.roll * 0.58 + Math.sin(time * 2.65 + phase * 1.7) * seaEnergy * 0.038 * side;
    motion.node.rotation.x = smoothTo(motion.node.rotation.x, motion.base.x + swayX, 4.6, safeDt);
    motion.node.rotation.z = smoothTo(motion.node.rotation.z, motion.base.z + swayZ, 4.2, safeDt);
  };
  moveLantern(rig.portLantern, 0.4, -1);
  moveLantern(rig.starboardLantern, 1.7, 1);

  if (rig.bell) {
    const targetX = rig.bell.base.x - state.pitch * 0.22 + Math.sin(time * 2.85) * seaEnergy * 0.018;
    const targetZ = rig.bell.base.z - state.roll * 0.32 + state.yawVelocity * 0.24;
    rig.bell.node.rotation.x = smoothTo(rig.bell.node.rotation.x, targetX, 5.2, safeDt);
    rig.bell.node.rotation.z = smoothTo(rig.bell.node.rotation.z, targetZ, 5.0, safeDt);
  }
  if (rig.clapper) {
    const bellX = rig.bell?.node.rotation.x ?? 0;
    const bellZ = rig.bell?.node.rotation.z ?? 0;
    rig.clapper.node.rotation.x = rig.clapper.base.x - (bellX - (rig.bell?.base.x ?? 0)) * 1.75 + Math.sin(time * 7.4) * seaEnergy * 0.035;
    rig.clapper.node.rotation.z = rig.clapper.base.z - (bellZ - (rig.bell?.base.z ?? 0)) * 1.45;
  }

  const targetCompassYaw = wrapAngle(-state.yaw);
  rig.compassYaw = wrapAngle(
    rig.compassYaw + angleDelta(rig.compassYaw, targetCompassYaw) * (1 - Math.exp(-safeDt * 8.5))
  );
  for (const part of rig.compassParts) part.node.rotation.y = part.base.y + rig.compassYaw;

  const windSide = Math.sign(Math.sin(telemetry.windAngle)) || 1;
  const moveBlock = (motion: NodeMotion | null, side: number, phase: number) => {
    if (!motion) return;
    const swing = (0.012 + sailLoad * 0.040) * Math.sin(time * (2.8 + sailLoad) + phase);
    motion.node.rotation.x = smoothTo(motion.node.rotation.x, motion.base.x + swing, 6.8, safeDt);
    motion.node.rotation.z = smoothTo(
      motion.node.rotation.z,
      motion.base.z + side * windSide * state.sailAngle * 0.075 + swing * 0.6,
      6.2,
      safeDt
    );
  };
  moveBlock(rig.portBlock, -1, 0.2);
  moveBlock(rig.starboardBlock, 1, 1.4);

  rig.anchors.forEach((anchor, index) => {
    const side = index === 0 ? -1 : 1;
    anchor.node.rotation.x = anchor.base.x + Math.sin(time * 1.55 + index * 1.3) * seaEnergy * 0.010;
    anchor.node.rotation.z = anchor.base.z + side * Math.sin(time * 1.18 + index) * seaEnergy * 0.008;
  });

  const sunAngle = (environment.timeOfDay - 0.25) * Math.PI * 2;
  const daylight = clamp((Math.sin(sunAngle) + 0.12) / 0.42, 0, 1);
  const night = 1 - daylight;
  const flicker = 0.94 + Math.sin(time * 11.3) * 0.035 + Math.sin(time * 23.7 + 0.8) * 0.018;
  if (rig.glowMaterial) {
    const level = (0.035 + night * 1.28 + environment.storm * 0.12) * flicker;
    rig.glowMaterial.emissiveColor.set(level, level * 0.27, level * 0.035);
  }
  for (const light of rig.lanternLights) light.intensity *= flicker;
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosShipPolishV1?: boolean };
if (!prototype.__pelagosShipPolishV1) {
  prototype.__pelagosShipPolishV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function shipPolishUpdate(
    state: ShipState,
    telemetry: ShipTelemetry,
    environment: EnvironmentFrame,
    time: number,
    dt: number,
    originX: number,
    originZ: number,
    lookYaw: number,
    lookPitch: number,
    rowing: number
  ): void {
    previousUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, rowing);
    const rig = ensureRig(this);
    resolveAuthoredNodes(this, rig);
    updateCraftMotion(rig, state, telemetry, environment, time, dt);
    updateRunningRigging(this, rig, telemetry);
  };
}
