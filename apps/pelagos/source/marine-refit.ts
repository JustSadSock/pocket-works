import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { ShipControls, ShipState, ShipTelemetry, WindState } from './core';
import { ShipDynamics, clamp, sampleWave, smoothTo } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type Constraint = { a: number; b: number; length: number };

type ClothRig = {
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
  minY: number;
  topY: number;
  gatherZ: number;
};

type PhysicalOar = {
  pivot: TransformNode;
  shaft: Mesh;
  blade: Mesh;
  side: number;
  stationZ: number;
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
const OAR_STATIONS = [-2.55, -1.28, -0.01, 1.26] as const;
const OAR_PIVOT_Y = 0.48;
const OAR_REACH = 2.55;

function shadow(world: OceanWorld, mesh: Mesh): void {
  const sun = world.scene.getLightByName('sun') as unknown as {
    getShadowGenerator?: () => { addShadowCaster: (mesh: Mesh, includeDescendants?: boolean) => void } | null;
  } | null;
  sun?.getShadowGenerator?.()?.addShadowCaster(mesh, false);
}

function sailMaterial(world: OceanWorld): StandardMaterial {
  const existing = world.scene.getMaterialByName('salted-canvas');
  if (existing instanceof StandardMaterial) {
    existing.diffuseColor = new Color3(0.91, 0.86, 0.70);
    existing.specularColor = new Color3(0.07, 0.06, 0.04);
    existing.specularPower = 18;
    existing.backFaceCulling = false;
    existing.twoSidedLighting = true;
    return existing;
  }
  const material = new StandardMaterial('physical-sail-cloth', world.scene);
  material.diffuseColor = new Color3(0.91, 0.86, 0.70);
  material.specularColor = new Color3(0.07, 0.06, 0.04);
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
  anchored: (row: number, col: number) => boolean,
  gatherZ: number
): ClothRig {
  const rest = new Float32Array(rows * cols * 3);
  const positions = new Float32Array(rest.length);
  const velocity = new Float32Array(rest.length);
  const anchors = new Uint8Array(rows * cols);
  const indices: number[] = [];
  const constraints: Constraint[] = [];
  let minY = Infinity;
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
      minY = Math.min(minY, p.y);
      topY = Math.max(topY, p.y);
      if (col > 0) addConstraint(constraints, rest, node - 1, node);
      if (row > 0) addConstraint(constraints, rest, node - cols, node);
      if (row > 0 && col > 0) addConstraint(constraints, rest, node - cols - 1, node);
      if (row > 0 && col < cols - 1) addConstraint(constraints, rest, node - cols + 1, node);
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
  return { mesh, rows, cols, positions, rest, velocity, normals, indices, anchors, constraints, minY, topY, gatherZ };
}

const clothTarget = new Vector3();

function targetForNode(rig: ClothRig, node: number, deploy: number, slack: number, out: Vector3): Vector3 {
  const i = node * 3;
  const row = Math.floor(node / rig.cols);
  const col = node % rig.cols;
  const u = col / Math.max(1, rig.cols - 1);
  const v = row / Math.max(1, rig.rows - 1);
  const hoist = 0.08 + deploy * 0.92;
  const baseY = rig.rest[i + 1];
  const baseZ = rig.rest[i + 2];
  const gather = 1 - hoist;
  out.x = rig.rest[i];
  out.y = rig.minY + (baseY - rig.minY) * hoist - Math.sin(Math.PI * u) * slack * 0.06;
  out.z = rig.gatherZ + (baseZ - rig.gatherZ) * (0.15 + hoist * 0.85) - gather * Math.sin(Math.PI * v) * 0.12;
  return out;
}

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
  const slack = 1 - clamp(load * 1.8, 0, 1);
  const damping = Math.exp(-safeDt * (4.7 - slack * 0.95));

  for (let node = 0; node < rig.rows * rig.cols; node += 1) {
    const i = node * 3;
    targetForNode(rig, node, deploy, slack, clothTarget);
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
    const leech = Math.pow(u, 1.55);
    const flutter = Math.sin(time * (5.4 + turbulence * 2.4) + u * 14.2 + v * 8.6)
      * (0.12 + slack * 0.88) * (0.12 + leech * 0.88);

    const spring = 13.5 + load * 8.5;
    const ax = (clothTarget.x - rig.positions[i]) * spring
      + pressureSign * load * (2.4 + belly * 6.1)
      + flutter * 0.62;
    const ay = (clothTarget.y - rig.positions[i + 1]) * spring - (0.24 + slack * 0.62);
    const az = (clothTarget.z - rig.positions[i + 2]) * (spring * 0.86) + flutter * 0.11;

    rig.velocity[i] = (rig.velocity[i] + ax * safeDt) * damping;
    rig.velocity[i + 1] = (rig.velocity[i + 1] + ay * safeDt) * damping;
    rig.velocity[i + 2] = (rig.velocity[i + 2] + az * safeDt) * damping;
    rig.positions[i] += rig.velocity[i] * safeDt;
    rig.positions[i + 1] += rig.velocity[i + 1] * safeDt;
    rig.positions[i + 2] += rig.velocity[i + 2] * safeDt;
  }

  const constraintScale = 0.12 + deploy * 0.88;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    for (const constraint of rig.constraints) {
      const ia = constraint.a * 3;
      const ib = constraint.b * 3;
      const dx = rig.positions[ib] - rig.positions[ia];
      const dy = rig.positions[ib + 1] - rig.positions[ia + 1];
      const dz = rig.positions[ib + 2] - rig.positions[ia + 2];
      const length = Math.max(0.0001, Math.hypot(dx, dy, dz));
      const desired = Math.max(0.025, constraint.length * constraintScale);
      const correction = (length - desired) / length * 0.38;
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
    targetForNode(rig, node, deploy, slack, clothTarget);
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

  const mainBoom = MeshBuilder.CreateCylinder('physical-main-boom', { diameterTop: 0.07, diameterBottom: 0.115, height: 4.45, tessellation: 12 }, scene);
  mainBoom.rotation.x = Math.PI / 2;
  mainBoom.position.set(0, 2.28, -2.15);
  mainBoom.parent = mainPivot;
  mainBoom.material = wood;
  mainBoom.isPickable = false;
  mainBoom.receiveShadows = true;
  shadow(world, mainBoom);

  const gaff = MeshBuilder.CreateCylinder('physical-main-gaff', { diameterTop: 0.055, diameterBottom: 0.095, height: 3.18, tessellation: 11 }, scene);
  gaff.rotation.x = Math.PI / 2;
  gaff.position.set(0, 5.92, -1.57);
  gaff.parent = mainPivot;
  gaff.material = wood;
  gaff.isPickable = false;
  gaff.receiveShadows = true;
  shadow(world, gaff);

  const main = createCloth(
    world,
    'physical-main-sail',
    mainPivot,
    15,
    11,
    (row, col) => {
      const v = row / 14;
      const u = col / 10;
      const y = 2.34 + v * 3.52;
      const foot = 4.20;
      const head = 2.88;
      const aft = foot + (head - foot) * v;
      return new Vector3(0, y, -0.12 - u * aft);
    },
    (row, col) => col === 0 || row === 0 || row === 14,
    -0.12
  );

  const jibRoot = new TransformNode('physical-jib-rig', scene);
  jibRoot.position.set(0, 0, 0.32);
  jibRoot.parent = world.shipRoot;
  const jib = createCloth(
    world,
    'physical-jib-sail',
    jibRoot,
    14,
    8,
    (row, col) => {
      const v = row / 13;
      const u = col / 7;
      const y = 1.18 + v * 4.48;
      const luffZ = 5.72 + (0.02 - 5.72) * v;
      const clewZ = 1.30 + (0.02 - 1.30) * v;
      return new Vector3(0, y, luffZ + (clewZ - luffZ) * u);
    },
    (row, col) => col === 0 || row === 13 || (row === 0 && col === 7),
    1.30
  );

  const oars: PhysicalOar[] = [];
  const oarMat = woodMaterial(world);
  const bladeMat = deckMaterial(world);
  const portMat = new StandardMaterial('oar-port-dark', scene);
  portMat.diffuseColor = new Color3(0.028, 0.021, 0.017);
  portMat.specularColor = new Color3(0.05, 0.04, 0.03);
  portMat.specularPower = 12;

  for (const side of [-1, 1]) {
    for (let index = 0; index < OAR_STATIONS.length; index += 1) {
      const stationZ = OAR_STATIONS[index];
      const port = MeshBuilder.CreateCylinder(`oar-port-${side}-${index}`, { diameter: 0.13, height: 0.035, tessellation: 14 }, scene);
      port.rotation.z = Math.PI / 2;
      port.position.set(side * 1.51, OAR_PIVOT_Y + 0.02, stationZ);
      port.parent = world.shipRoot;
      port.material = portMat;
      port.isPickable = false;

      const pivot = new TransformNode(`physical-oar-${side}-${index}`, scene);
      pivot.position.set(side * 0.18, OAR_PIVOT_Y, stationZ);
      pivot.parent = world.shipRoot;

      const shaft = MeshBuilder.CreateCylinder(`physical-oar-shaft-${side}-${index}`, {
        diameterTop: 0.038,
        diameterBottom: 0.055,
        height: 3.25,
        tessellation: 9
      }, scene);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = side * 0.12;
      shaft.parent = pivot;
      shaft.material = oarMat;
      shaft.isPickable = false;
      shaft.receiveShadows = true;
      shadow(world, shaft);

      const blade = MeshBuilder.CreateBox(`physical-oar-blade-${side}-${index}`, { width: 0.62, height: 0.042, depth: 0.22 }, scene);
      blade.position.x = side * 0.92;
      blade.parent = pivot;
      blade.material = bladeMat;
      blade.isPickable = false;
      blade.receiveShadows = true;
      shadow(world, blade);
      oars.push({ pivot, shaft, blade, side, stationZ, phaseOffset: index * 0.012 });
    }
  }

  return { mainPivot, mainBoom, gaff, main, jib, oars, deploy: 0.035, oarDeploy: 0 };
}

function ensureMarineRig(world: OceanWorld): MarineRig {
  let rig = rigs.get(world);
  if (!rig) {
    rig = createMarineRig(world);
    rigs.set(world, rig);
  }
  return rig;
}

function rowingStroke(phase: number): { power: number; recovery: number } {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.58) return { power: Math.max(0, Math.sin((p / 0.58) * Math.PI)), recovery: 0 };
  return { power: 0, recovery: Math.sin(((p - 0.58) / 0.42) * Math.PI) };
}

function oarDipAngle(power: number, recovery: number): number {
  return 0.10 + power * 0.48 - recovery * 0.055;
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
  rig.oarDeploy = smoothTo(rig.oarDeploy, active > 0.03 ? 1 : 0, active > 0.03 ? 2.25 : 1.65, dt);
  const deploy = rig.oarDeploy;
  const splash = world.scene.particleSystems.find((system: { name: string }) => system.name === 'oar-splash');

  for (const oar of rig.oars) {
    const phase = ((state.rowingPhase + oar.phaseOffset) % 1 + 1) % 1;
    const { power, recovery } = rowingStroke(phase);
    const strokePower = power * active;
    const sweep = (phase < 0.58 ? (phase / 0.58 - 0.5) : (0.5 - (phase - 0.58) / 0.42)) * 0.72;
    const dip = oarDipAngle(strokePower, recovery) * deploy;

    // Idle: the oar is below deck, retracted across the hull. Active: it slides through a
    // low oar port and rotates downward so the blade crosses the *actual* local wave surface.
    oar.pivot.position.x = oar.side * (0.18 + deploy * 1.22);
    oar.pivot.position.y = OAR_PIVOT_Y;
    oar.pivot.rotation.y = oar.side * sweep * deploy;
    oar.pivot.rotation.z = -oar.side * dip;
    oar.pivot.rotation.x = 0;

    oar.shaft.position.x = oar.side * (0.10 + deploy * 1.28);
    oar.shaft.scaling.y = 0.43 + deploy * 0.57;
    oar.blade.position.x = oar.side * (0.90 + deploy * 2.05);
    oar.blade.scaling.x = 0.72 + deploy * 0.28;
    oar.blade.scaling.z = 0.80 + deploy * 0.20;
    oar.blade.rotation.x = recovery * 1.28 * deploy;

    if (deploy > 0.76 && strokePower > 0.28 && splash) {
      const p = oar.blade.getAbsolutePosition();
      const water = sampleWave(p.x + originX, p.z + originZ, time, environment.waveScale);
      const immersion = water.height - p.y;
      if (immersion > -0.08 && immersion < 0.42) {
        const emitter = splash.emitter;
        if (emitter instanceof Vector3) emitter.set(p.x, water.height + 0.012, p.z);
        splash.manualEmitCount = Math.max(splash.manualEmitCount, 1 + Math.round(strokePower * 3));
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
  rig.deploy = smoothTo(rig.deploy, 1, 0.62, dt);
  const windSide = Math.sign(Math.sin(telemetry.windAngle)) || 1;
  const load = clamp(telemetry.apparentWindSpeed / 14.0, 0, 1.22) * clamp(telemetry.sailEfficiency * 1.48, 0, 1);
  const sheetTarget = windSide * (0.18 + state.sailAngle * 1.12);
  rig.mainPivot.rotation.y = smoothTo(rig.mainPivot.rotation.y, sheetTarget, 1.8 + load * 1.45, dt);

  const hoist = 0.08 + rig.deploy * 0.92;
  rig.gaff.position.y = 2.54 + (5.92 - 2.54) * hoist;
  rig.gaff.position.z = -0.46 + (-1.57 + 0.46) * hoist;
  rig.gaff.rotation.x = Math.PI / 2 - (1 - hoist) * 0.17;

  const turbulence = clamp(environment.wind.gust + environment.storm * 0.8, 0, 1.6);
  simulateCloth(rig.main, dt, time, rig.deploy, load, windSide, turbulence);
  simulateCloth(rig.jib, dt, time + 0.73, rig.deploy, load * 0.84, windSide, turbulence + 0.14);
}

function rowingContactFactor(state: ShipState, phase: number, time: number, waveScale: number): number {
  const { power } = rowingStroke(phase);
  if (power <= 0.04) return 0;
  const dip = oarDipAngle(power, 0);
  const bladeLocalY = OAR_PIVOT_Y - Math.sin(dip) * OAR_REACH;
  const bladeWorldY = state.y + bladeLocalY;
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  let submerged = 0;
  let total = 0;

  for (const side of [-1, 1]) {
    for (const stationZ of OAR_STATIONS) {
      const localX = side * 2.96;
      const wx = state.worldX + localX * cosYaw + stationZ * sinYaw;
      const wz = state.worldZ - localX * sinYaw + stationZ * cosYaw;
      const water = sampleWave(wx, wz, time, waveScale);
      const margin = water.height - bladeWorldY;
      if (margin > -0.06) submerged += clamp((margin + 0.06) / 0.26, 0, 1);
      total += 1;
    }
  }
  return total > 0 ? submerged / total : 0;
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

  if (active > 0.025) phase = (phase + safeDt * (0.43 + active * 0.075)) % 1;
  rowingPhase.set(this, phase);
  this.state.rowingPhase = phase;

  if (active > 0.025) {
    const { power } = rowingStroke(phase);
    const contact = rowingContactFactor(this.state, phase, time, waveScale);
    const acceleration = active * power * contact * 0.48;
    this.state.velocityX += Math.sin(this.state.yaw) * acceleration * safeDt;
    this.state.velocityZ += Math.cos(this.state.yaw) * acceleration * safeDt;
  }
  return telemetry;
};

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosMarineRefitV2?: boolean };
if (!prototype.__pelagosMarineRefitV2) {
  prototype.__pelagosMarineRefitV2 = true;
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
    // Legacy oars remain disabled. Passing zero prevents their hidden animation/splash path
    // from firing; the physical rig below owns all rowing visuals and water contact.
    originalUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, 0);
    const rig = ensureMarineRig(this);
    updateSails(rig, state, telemetry, environment, time, dt);
    updateOars(this, rig, state, environment, time, dt, originX, originZ, rowing);
  };
}
