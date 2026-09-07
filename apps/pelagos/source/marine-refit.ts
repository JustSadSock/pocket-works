import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { ShipControls, ShipState, ShipTelemetry, WindState } from './core';
import { ShipDynamics, TAU, clamp, sampleWave, smoothTo } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type Constraint = { a: number; b: number; length: number };

type ClothRig = {
  root: TransformNode;
  mesh: Mesh;
  rows: number;
  cols: number;
  positions: Float32Array;
  rest: Float32Array;
  velocity: Float32Array;
  normals: Float32Array;
  indices: number[];
  anchors: Uint8Array;
  constraints: Constraint[];
  topY: number;
};

type PhysicalOar = {
  pivot: TransformNode;
  shaft: Mesh;
  blade: Mesh;
  side: number;
  phaseOffset: number;
};

type MarineRig = {
  mainPivot: TransformNode;
  mainBoom: Mesh;
  gaff: Mesh;
  main: ClothRig;
  jib: ClothRig;
  oars: PhysicalOar[];
  deploy: number;
  oarDeploy: number;
};

const rigs = new WeakMap<OceanWorld, MarineRig>();
const rowingPhase = new WeakMap<ShipDynamics, number>();

function shadow(world: OceanWorld, mesh: Mesh): void {
  const sun = world.scene.getLightByName('sun') as unknown as {
    getShadowGenerator?: () => { addShadowCaster: (mesh: Mesh, includeDescendants?: boolean) => void } | null;
  } | null;
  sun?.getShadowGenerator?.()?.addShadowCaster(mesh, false);
}

function sailMaterial(world: OceanWorld): StandardMaterial {
  const existing = world.scene.getMaterialByName('salted-canvas');
  if (existing instanceof StandardMaterial) return existing;
  const material = new StandardMaterial('physical-sail-cloth', world.scene);
  material.diffuseColor = new Color3(0.84, 0.80, 0.66);
  material.specularColor = new Color3(0.08, 0.07, 0.045);
  material.specularPower = 18;
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  return material;
}

function woodMaterial(world: OceanWorld): StandardMaterial {
  const existing = world.scene.getMaterialByName('spars-and-rails');
  if (existing instanceof StandardMaterial) return existing;
  const material = new StandardMaterial('physical-rig-wood', world.scene);
  material.diffuseColor = new Color3(0.38, 0.20, 0.085);
  material.specularColor = new Color3(0.12, 0.08, 0.04);
  material.specularPower = 34;
  return material;
}

function deckMaterial(world: OceanWorld): StandardMaterial {
  const existing = world.scene.getMaterialByName('sun-bleached-deck');
  if (existing instanceof StandardMaterial) return existing;
  return woodMaterial(world);
}

function addConstraint(constraints: Constraint[], rest: Float32Array, a: number, b: number): void {
  const ia = a * 3;
  const ib = b * 3;
  constraints.push({
    a,
    b,
    length: Math.hypot(rest[ib] - rest[ia], rest[ib + 1] - rest[ia + 1], rest[ib + 2] - rest[ia + 2])
  });
}

function createCloth(
  world: OceanWorld,
  name: string,
  parent: TransformNode,
  rows: number,
  cols: number,
  point: (row: number, col: number) => Vector3,
  anchored: (row: number, col: number) => boolean
): ClothRig {
  const rest = new Float32Array(rows * cols * 3);
  const positions = new Float32Array(rest.length);
  const velocity = new Float32Array(rest.length);
  const anchors = new Uint8Array(rows * cols);
  const indices: number[] = [];
  const constraints: Constraint[] = [];
  let topY = -Infinity;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const p = point(row, col);
      const node = row * cols + col;
      const i = node * 3;
      rest[i] = p.x;
      rest[i + 1] = p.y;
      rest[i + 2] = p.z;
      positions[i] = p.x;
      positions[i + 1] = p.y;
      positions[i + 2] = p.z;
      anchors[node] = anchored(row, col) ? 1 : 0;
      topY = Math.max(topY, p.y);
      if (col > 0) addConstraint(constraints, rest, node - 1, node);
      if (row > 0) addConstraint(constraints, rest, node - cols, node);
      if (row > 0 && col > 0) addConstraint(constraints, rest, node - cols - 1, node);
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const normals = new Float32Array(rest.length);
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  const mesh = new Mesh(name, world.scene);
  data.applyToMesh(mesh, true);
  mesh.parent = parent;
  mesh.material = sailMaterial(world);
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  shadow(world, mesh);
  return { root: parent, mesh, rows, cols, positions, rest, velocity, normals, indices, anchors, constraints, topY };
}

function targetForNode(rig: ClothRig, node: number, deploy: number, collapse: number, out: Vector3): Vector3 {
  const i = node * 3;
  const row = Math.floor(node / rig.cols);
  const col = node % rig.cols;
  const u = col / Math.max(1, rig.cols - 1);
  const v = row / Math.max(1, rig.rows - 1);
  const baseY = rig.rest[i + 1];
  const baseZ = rig.rest[i + 2];
  const unfold = 0.08 + deploy * 0.92;
  out.x = rig.rest[i];
  out.y = rig.topY + (baseY - rig.topY) * unfold - Math.sin(Math.PI * u) * collapse * 0.07 * (1 - v * 0.45);
  out.z = baseZ * unfold * (1 - collapse * 0.11 * Math.pow(u, 1.5));
  return out;
}

const clothTarget = new Vector3();

function simulateCloth(
  rig: ClothRig,
  dt: number,
  time: number,
  deploy: number,
  load: number,
  pressureSign: number,
  turbulence: number
): void {
  const safeDt = clamp(dt, 1 / 180, 1 / 30);
  const collapse = 1 - clamp(load * 1.6, 0, 1);
  const damping = Math.exp(-safeDt * (4.4 - collapse * 0.8));

  for (let node = 0; node < rig.rows * rig.cols; node += 1) {
    const i = node * 3;
    targetForNode(rig, node, deploy, collapse, clothTarget);
    if (rig.anchors[node]) {
      rig.positions[i] = clothTarget.x;
      rig.positions[i + 1] = clothTarget.y;
      rig.positions[i + 2] = clothTarget.z;
      rig.velocity[i] = 0;
      rig.velocity[i + 1] = 0;
      rig.velocity[i + 2] = 0;
      continue;
    }

    const row = Math.floor(node / rig.cols);
    const col = node % rig.cols;
    const u = col / Math.max(1, rig.cols - 1);
    const v = row / Math.max(1, rig.rows - 1);
    const belly = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    const flutter = Math.sin(time * (6.2 + turbulence * 2.6) + u * 13.7 + v * 9.4)
      * (0.18 + collapse * 0.82) * (0.18 + u * 0.82);

    const spring = 14.0 + load * 8.0;
    const ax = (clothTarget.x - rig.positions[i]) * spring + pressureSign * load * (2.1 + belly * 4.4) + flutter * 0.52;
    const ay = (clothTarget.y - rig.positions[i + 1]) * spring - (0.26 + collapse * 0.48);
    const az = (clothTarget.z - rig.positions[i + 2]) * (spring * 0.88) + flutter * 0.08;

    rig.velocity[i] = (rig.velocity[i] + ax * safeDt) * damping;
    rig.velocity[i + 1] = (rig.velocity[i + 1] + ay * safeDt) * damping;
    rig.velocity[i + 2] = (rig.velocity[i + 2] + az * safeDt) * damping;
    rig.positions[i] += rig.velocity[i] * safeDt;
    rig.positions[i + 1] += rig.velocity[i + 1] * safeDt;
    rig.positions[i + 2] += rig.velocity[i + 2] * safeDt;
  }

  const scale = 0.08 + deploy * 0.92;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    for (const constraint of rig.constraints) {
      const ia = constraint.a * 3;
      const ib = constraint.b * 3;
      const dx = rig.positions[ib] - rig.positions[ia];
      const dy = rig.positions[ib + 1] - rig.positions[ia + 1];
      const dz = rig.positions[ib + 2] - rig.positions[ia + 2];
      const length = Math.max(0.0001, Math.hypot(dx, dy, dz));
      const desired = Math.max(0.025, constraint.length * scale);
      const correction = (length - desired) / length * 0.44;
      const aFixed = rig.anchors[constraint.a] !== 0;
      const bFixed = rig.anchors[constraint.b] !== 0;
      if (!aFixed && !bFixed) {
        rig.positions[ia] += dx * correction * 0.5;
        rig.positions[ia + 1] += dy * correction * 0.5;
        rig.positions[ia + 2] += dz * correction * 0.5;
        rig.positions[ib] -= dx * correction * 0.5;
        rig.positions[ib + 1] -= dy * correction * 0.5;
        rig.positions[ib + 2] -= dz * correction * 0.5;
      } else if (aFixed && !bFixed) {
        rig.positions[ib] -= dx * correction;
        rig.positions[ib + 1] -= dy * correction;
        rig.positions[ib + 2] -= dz * correction;
      } else if (!aFixed && bFixed) {
        rig.positions[ia] += dx * correction;
        rig.positions[ia + 1] += dy * correction;
        rig.positions[ia + 2] += dz * correction;
      }
    }
  }

  for (let node = 0; node < rig.rows * rig.cols; node += 1) {
    if (!rig.anchors[node]) continue;
    const i = node * 3;
    targetForNode(rig, node, deploy, collapse, clothTarget);
    rig.positions[i] = clothTarget.x;
    rig.positions[i + 1] = clothTarget.y;
    rig.positions[i + 2] = clothTarget.z;
  }

  VertexData.ComputeNormals(rig.positions, rig.indices, rig.normals);
  rig.mesh.updateVerticesData(VertexBuffer.PositionKind, rig.positions, false, false);
  rig.mesh.updateVerticesData(VertexBuffer.NormalKind, rig.normals, false, false);
}

function createMarineRig(world: OceanWorld): MarineRig {
  const scene = world.scene;
  scene.getMeshByName('working-main-sail')?.setEnabled(false);
  scene.getMeshByName('jib-sail')?.setEnabled(false);
  scene.getMeshByName('boom')?.setEnabled(false);
  scene.getMeshByName('main-yard')?.setEnabled(false);
  for (const node of scene.transformNodes) {
    if (node.name.startsWith('oar-') && node !== world.shipRoot) node.setEnabled(false);
  }

  const wood = woodMaterial(world);
  const mainPivot = new TransformNode('physical-main-rig', scene);
  mainPivot.position.set(0, 0, 0.32);
  mainPivot.parent = world.shipRoot;

  const mainBoom = MeshBuilder.CreateCylinder('physical-main-boom', { diameterTop: 0.07, diameterBottom: 0.115, height: 4.08, tessellation: 12 }, scene);
  mainBoom.rotation.x = Math.PI / 2;
  mainBoom.position.set(0, 2.31, -2.02);
  mainBoom.parent = mainPivot;
  mainBoom.material = wood;
  mainBoom.isPickable = false;
  mainBoom.receiveShadows = true;
  shadow(world, mainBoom);

  const gaff = MeshBuilder.CreateCylinder('physical-main-gaff', { diameterTop: 0.06, diameterBottom: 0.095, height: 2.65, tessellation: 11 }, scene);
  gaff.rotation.x = Math.PI / 2;
  gaff.position.set(0, 5.73, -1.28);
  gaff.parent = mainPivot;
  gaff.material = wood;
  gaff.isPickable = false;
  gaff.receiveShadows = true;
  shadow(world, gaff);

  const main = createCloth(
    world,
    'physical-main-sail',
    mainPivot,
    13,
    9,
    (row, col) => {
      const v = row / 12;
      const u = col / 8;
      const y = 2.34 + v * 3.34;
      const aft = 3.72 * (1 - v * 0.42);
      return new Vector3(0, y, -u * aft);
    },
    (row, col) => col === 0 || row === 0 || row === 12
  );

  const jibRoot = new TransformNode('physical-jib-rig', scene);
  jibRoot.position.set(0, 0, 0.32);
  jibRoot.parent = world.shipRoot;
  const jib = createCloth(
    world,
    'physical-jib-sail',
    jibRoot,
    12,
    7,
    (row, col) => {
      const v = row / 11;
      const u = col / 6;
      const y = 1.26 + v * 3.98;
      const forward = 5.48 * (1 - v) + 0.05 * v;
      const aft = 1.10 * (1 - v) + 0.05 * v;
      return new Vector3(0, y, forward + (aft - forward) * u);
    },
    (row, col) => col === 0 || row === 11 || (row === 0 && col === 6)
  );

  const oars: PhysicalOar[] = [];
  const oarMat = woodMaterial(world);
  const bladeMat = deckMaterial(world);
  const stations = [-2.55, -1.25, 0.05, 1.35];
  for (const side of [-1, 1]) {
    for (let index = 0; index < stations.length; index += 1) {
      const pivot = new TransformNode(`physical-oar-${side}-${index}`, scene);
      pivot.position.set(side * 0.18, 0.84, stations[index]);
      pivot.parent = world.shipRoot;

      const shaft = MeshBuilder.CreateCylinder(`physical-oar-shaft-${side}-${index}`, {
        diameterTop: 0.042,
        diameterBottom: 0.058,
        height: 3.0,
        tessellation: 9
      }, scene);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = side * 0.24;
      shaft.parent = pivot;
      shaft.material = oarMat;
      shaft.isPickable = false;
      shaft.receiveShadows = true;
      shadow(world, shaft);

      const blade = MeshBuilder.CreateBox(`physical-oar-blade-${side}-${index}`, { width: 0.58, height: 0.045, depth: 0.24 }, scene);
      blade.position.x = side * 1.76;
      blade.parent = pivot;
      blade.material = bladeMat;
      blade.isPickable = false;
      blade.receiveShadows = true;
      shadow(world, blade);
      oars.push({ pivot, shaft, blade, side, phaseOffset: index * 0.018 });
    }
  }

  return { mainPivot, mainBoom, gaff, main, jib, oars, deploy: 0.045, oarDeploy: 0 };
}

function ensureMarineRig(world: OceanWorld): MarineRig {
  let rig = rigs.get(world);
  if (!rig) {
    rig = createMarineRig(world);
    rigs.set(world, rig);
  }
  return rig;
}

function updateOars(
  world: OceanWorld,
  rig: MarineRig,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number,
  dt: number,
  originX: number,
  originZ: number,
  rowing: number
): void {
  const active = clamp(rowing, 0, 1);
  rig.oarDeploy = smoothTo(rig.oarDeploy, active > 0.03 ? 1 : 0, active > 0.03 ? 2.7 : 1.45, dt);
  const deploy = rig.oarDeploy;
  const splash = world.scene.particleSystems.find((system: { name: string }) => system.name === 'oar-splash');

  for (const oar of rig.oars) {
    const phase = ((state.rowingPhase + oar.phaseOffset) % 1 + 1) % 1;
    const powerWindow = phase < 0.54 ? Math.sin((phase / 0.54) * Math.PI) : 0;
    const power = Math.max(0, powerWindow) * active;
    const recovery = phase >= 0.54 ? Math.sin(((phase - 0.54) / 0.46) * Math.PI) : 0;
    const sweep = (phase - 0.27) * 0.78;

    oar.pivot.position.x = oar.side * (0.18 + deploy * 1.10);
    oar.pivot.position.y = 0.84 - deploy * 0.07;
    oar.pivot.rotation.y = oar.side * sweep * deploy;
    oar.pivot.rotation.z = -oar.side * deploy * (0.035 + power * 0.24 - recovery * 0.055);
    oar.pivot.rotation.x = -0.015 * deploy;

    oar.shaft.position.x = oar.side * (0.24 + deploy * 0.84);
    oar.shaft.scaling.y = 0.58 + deploy * 0.42;
    oar.blade.position.x = oar.side * (0.98 + deploy * 0.78);
    oar.blade.scaling.x = 0.72 + deploy * 0.28;
    oar.blade.rotation.x = recovery * 1.18 * deploy;

    if (deploy > 0.7 && power > 0.35 && splash) {
      const p = oar.blade.getAbsolutePosition();
      const water = sampleWave(p.x + originX, p.z + originZ, time, environment.waveScale);
      const immersion = water.height - p.y;
      if (immersion > -0.10 && immersion < 0.30) {
        const emitter = splash.emitter;
        if (emitter instanceof Vector3) emitter.set(p.x, water.height + 0.015, p.z);
        splash.manualEmitCount = Math.max(splash.manualEmitCount, 1 + Math.round(power * 2.5));
      }
    }
  }
}

function updateSails(
  rig: MarineRig,
  state: ShipState,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number,
  dt: number
): void {
  rig.deploy = smoothTo(rig.deploy, 1, 0.72, dt);
  const windSide = Math.sign(Math.sin(telemetry.windAngle)) || 1;
  const load = clamp(telemetry.apparentWindSpeed / 15.0, 0, 1.18) * clamp(telemetry.sailEfficiency * 1.42, 0, 1);
  const sheetTarget = windSide * (0.07 + state.sailAngle * 1.02);
  rig.mainPivot.rotation.y = smoothTo(rig.mainPivot.rotation.y, sheetTarget, 2.3 + load * 1.3, dt);
  const turbulence = clamp(environment.wind.gust + environment.storm * 0.8, 0, 1.6);
  simulateCloth(rig.main, dt, time, rig.deploy, load, windSide, turbulence);
  simulateCloth(rig.jib, dt, time + 0.73, rig.deploy, load * 0.82, windSide, turbulence + 0.14);
}

const originalReset = ShipDynamics.prototype.reset;
ShipDynamics.prototype.reset = function physicalRowingReset(): void {
  rowingPhase.delete(this);
  originalReset.call(this);
};

const originalDynamicsUpdate = ShipDynamics.prototype.update;
ShipDynamics.prototype.update = function physicalRowingUpdate(
  dt: number,
  time: number,
  controls: ShipControls,
  wind: WindState,
  waveScale: number
): ShipTelemetry {
  const active = clamp(controls.rowing, 0, 1);
  let phase = rowingPhase.get(this) ?? this.state.rowingPhase;
  const safeDt = clamp(dt, 0.001, 1 / 30);
  const telemetry = originalDynamicsUpdate.call(this, dt, time, { ...controls, rowing: 0 }, wind, waveScale);

  if (active > 0.025) phase = (phase + safeDt * (0.48 + active * 0.10)) % 1;
  rowingPhase.set(this, phase);
  this.state.rowingPhase = phase;

  if (active > 0.025) {
    const power = phase < 0.54 ? Math.max(0, Math.sin((phase / 0.54) * Math.PI)) : 0;
    const acceleration = active * (0.055 + power * 0.36);
    this.state.velocityX += Math.sin(this.state.yaw) * acceleration * safeDt;
    this.state.velocityZ += Math.cos(this.state.yaw) * acceleration * safeDt;
  }
  return telemetry;
};

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosMarineRefitV1?: boolean };
if (!prototype.__pelagosMarineRefitV1) {
  prototype.__pelagosMarineRefitV1 = true;
  const originalUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function marineUpdate(
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
    originalUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, rowing);
    const rig = ensureMarineRig(this);
    updateSails(rig, state, telemetry, environment, time, dt);
    updateOars(this, rig, state, environment, time, dt, originX, originZ, rowing);
  };
}
