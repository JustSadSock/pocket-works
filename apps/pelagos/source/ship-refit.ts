import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { ShipState, ShipTelemetry } from './core';
import { clamp, sampleWave, smoothTo } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type HullStation = { z: number; beam: number; sheer: number; keel: number };

const HULL_STATIONS: readonly HullStation[] = [
  { z: -4.65, beam: 0.86, sheer: 0.92, keel: -1.00 },
  { z: -4.15, beam: 1.12, sheer: 0.82, keel: -1.20 },
  { z: -3.35, beam: 1.38, sheer: 0.74, keel: -1.38 },
  { z: -2.25, beam: 1.58, sheer: 0.68, keel: -1.52 },
  { z: -1.05, beam: 1.68, sheer: 0.65, keel: -1.60 },
  { z: 0.25, beam: 1.70, sheer: 0.65, keel: -1.62 },
  { z: 1.55, beam: 1.60, sheer: 0.70, keel: -1.54 },
  { z: 2.65, beam: 1.40, sheer: 0.82, keel: -1.36 },
  { z: 3.55, beam: 1.10, sheer: 0.98, keel: -1.06 },
  { z: 4.20, beam: 0.68, sheer: 1.18, keel: -0.70 },
  { z: 4.70, beam: 0.08, sheer: 1.42, keel: -0.22 }
] as const;

const refitted = new WeakSet<OceanWorld>();
type CameraMemory = { position: Vector3; desired: Vector3; target: Vector3 };
const cameraMemory = new WeakMap<OceanWorld, CameraMemory>();

function registerShadowCaster(world: OceanWorld, mesh: Mesh): void {
  const sun = world.scene.getLightByName('sun') as unknown as {
    getShadowGenerator?: () => { addShadowCaster: (mesh: Mesh, includeDescendants?: boolean) => void } | null;
  } | null;
  sun?.getShadowGenerator?.()?.addShadowCaster(mesh, false);
}

function tuneSurfaceMaterial(material: Material | null, kind: 'hull' | 'deck'): void {
  if (!(material instanceof StandardMaterial)) return;
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  // The sail can shadow most of the deck at once. A tiny indirect component keeps wood readable
  // without flattening the directional lighting or removing the actual shadow.
  material.emissiveColor = kind === 'deck'
    ? new Color3(0.060, 0.038, 0.018)
    : new Color3(0.018, 0.008, 0.003);
}

function buildHull(world: OceanWorld, material: Material | null): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const ring = 13;

  HULL_STATIONS.forEach((station, stationIndex) => {
    const y0 = station.sheer;
    const y1 = y0 - 0.20;
    const y2 = y0 - 0.42;
    const y3 = y0 - 0.70;
    const y4 = y0 - 0.98;
    const y5 = station.keel + 0.28;
    const xs = [
      -station.beam,
      -station.beam * 1.02,
      -station.beam * 1.01,
      -station.beam * 0.94,
      -station.beam * 0.78,
      -station.beam * 0.48,
      0,
      station.beam * 0.48,
      station.beam * 0.78,
      station.beam * 0.94,
      station.beam * 1.01,
      station.beam * 1.02,
      station.beam
    ];
    const ys = [y0, y1, y2, y3, y4, y5, station.keel, y5, y4, y3, y2, y1, y0];
    for (let j = 0; j < ring; j += 1) {
      positions.push(xs[j], ys[j], station.z);
      uvs.push(j / (ring - 1), stationIndex / (HULL_STATIONS.length - 1) * 5.4);
    }
  });

  for (let station = 0; station < HULL_STATIONS.length - 1; station += 1) {
    for (let j = 0; j < ring - 1; j += 1) {
      const a = station * ring + j;
      const b = a + 1;
      const c = (station + 1) * ring + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const closeEnd = (stationIndex: number, reverse: boolean) => {
    const station = HULL_STATIONS[stationIndex];
    const center = positions.length / 3;
    const first = stationIndex * ring;
    const last = first + ring - 1;
    positions.push(0, station.sheer - 0.58, station.z);
    uvs.push(0.5, stationIndex === 0 ? 0 : 5.4);
    for (let j = 0; j < ring - 1; j += 1) {
      const a = first + j;
      const b = a + 1;
      if (reverse) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
    // The cross-section loop starts and ends at the gunwales. Close that final upper edge too;
    // otherwise the stern reads as a triangular hole when viewed from the chase camera.
    if (reverse) indices.push(center, first, last);
    else indices.push(center, last, first);
  };
  closeEnd(0, true);
  closeEnd(HULL_STATIONS.length - 1, false);

  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  const hull = new Mesh('refit-unified-hull', world.scene);
  data.applyToMesh(hull);
  hull.parent = world.shipRoot;
  hull.material = material;
  hull.receiveShadows = true;
  hull.isPickable = false;
  registerShadowCaster(world, hull);
  return hull;
}

function buildDeck(world: OceanWorld, material: Material | null): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const across = 7;

  HULL_STATIONS.forEach((station, stationIndex) => {
    const edge = Math.max(0.055, station.beam * 0.955);
    const xs = [-edge, -edge * 0.68, -edge * 0.34, 0, edge * 0.34, edge * 0.68, edge];
    const crown = [0.018, 0.055, 0.088, 0.108, 0.088, 0.055, 0.018];
    for (let j = 0; j < across; j += 1) {
      positions.push(xs[j], station.sheer + crown[j], station.z);
      uvs.push(j / (across - 1), stationIndex / (HULL_STATIONS.length - 1) * 6.2);
    }
  });

  for (let station = 0; station < HULL_STATIONS.length - 1; station += 1) {
    for (let j = 0; j < across - 1; j += 1) {
      const a = station * across + j;
      const b = a + 1;
      const c = (station + 1) * across + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  const deck = new Mesh('refit-cambered-deck', world.scene);
  data.applyToMesh(deck);
  deck.parent = world.shipRoot;
  deck.material = material;
  deck.receiveShadows = true;
  deck.isPickable = false;
  registerShadowCaster(world, deck);
  return deck;
}

function createRefitMaterial(
  world: OceanWorld,
  name: string,
  color: Color3,
  specular = new Color3(0.12, 0.10, 0.07),
  power = 32
): StandardMaterial {
  const material = new StandardMaterial(name, world.scene);
  material.diffuseColor = color;
  material.specularColor = specular;
  material.specularPower = power;
  return material;
}

function addTube(world: OceanWorld, name: string, path: Vector3[], radius: number, material: Material | null): Mesh {
  const tube = MeshBuilder.CreateTube(name, { path, radius, tessellation: 8, cap: Mesh.CAP_ALL }, world.scene);
  tube.parent = world.shipRoot;
  tube.material = material;
  tube.isPickable = false;
  tube.receiveShadows = true;
  registerShadowCaster(world, tube);
  return tube;
}

function addCockpit(world: OceanWorld, deckMaterial: Material | null, railMaterial: Material | null): void {
  const scene = world.scene;
  const dark = createRefitMaterial(world, 'cockpit-well-dark', new Color3(0.12, 0.075, 0.040), new Color3(0.025, 0.02, 0.015), 14);
  dark.emissiveColor = new Color3(0.025, 0.014, 0.006);
  const floor = MeshBuilder.CreateBox('refit-cockpit-floor', { width: 1.06, height: 0.045, depth: 1.20 }, scene);
  floor.position.set(0, 0.785, -2.48);
  floor.parent = world.shipRoot;
  floor.material = dark;
  floor.isPickable = false;

  const coamings = [
    { width: 1.36, height: 0.12, depth: 0.10, x: 0, z: -1.82 },
    { width: 1.36, height: 0.12, depth: 0.10, x: 0, z: -3.14 },
    { width: 0.10, height: 0.12, depth: 1.42, x: -0.68, z: -2.48 },
    { width: 0.10, height: 0.12, depth: 1.42, x: 0.68, z: -2.48 }
  ];
  for (let i = 0; i < coamings.length; i += 1) {
    const c = coamings[i];
    const mesh = MeshBuilder.CreateBox(`refit-cockpit-coaming-${i}`, { width: c.width, height: c.height, depth: c.depth }, scene);
    mesh.position.set(c.x, 0.865, c.z);
    mesh.parent = world.shipRoot;
    mesh.material = railMaterial ?? deckMaterial;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    registerShadowCaster(world, mesh);
  }

  const companion = MeshBuilder.CreateBox('refit-companionway', { width: 1.02, height: 0.18, depth: 0.62 }, scene);
  companion.position.set(0, 0.88, -1.28);
  companion.rotation.x = -0.035;
  companion.parent = world.shipRoot;
  companion.material = deckMaterial;
  companion.receiveShadows = true;
  companion.isPickable = false;
  registerShadowCaster(world, companion);
}

function refitShip(world: OceanWorld): void {
  if (refitted.has(world)) return;
  refitted.add(world);

  const scene = world.scene;
  const oldHull = scene.getMeshByName('full-carvel-hull');
  const oldDeck = scene.getMeshByName('cambered-deck');
  const hullMaterial = oldHull?.material ?? null;
  const deckMaterial = oldDeck?.material ?? hullMaterial;
  tuneSurfaceMaterial(hullMaterial, 'hull');
  tuneSurfaceMaterial(deckMaterial, 'deck');

  const obsoleteExact = new Set([
    'full-carvel-hull', 'cambered-deck', 'keel', 'stern-cabin', 'cabin-roof',
    'cargo-hatch', 'hatch-bar'
  ]);
  for (const mesh of scene.meshes) {
    const name = mesh.name;
    if (
      obsoleteExact.has(name)
      || name.startsWith('cabin-window-')
      || name.startsWith('gunwale-')
      || name.startsWith('rail-post-')
      || name.startsWith('upper-rail-')
      || name.startsWith('rigging-')
    ) mesh.setEnabled(false);
  }

  buildHull(world, hullMaterial);
  buildDeck(world, deckMaterial);

  const railMaterial = scene.getMaterialByName('spars-and-rails') ?? hullMaterial;
  const ropeMaterial = scene.getMaterialByName('hemp-rigging') ?? hullMaterial;
  const ironMaterial = scene.getMaterialByName('blackened-iron') ?? hullMaterial;

  for (const side of [-1, 1]) {
    const capPath = HULL_STATIONS.slice(0, -1).map((s) => new Vector3(side * s.beam, s.sheer + 0.045, s.z));
    addTube(world, `refit-caprail-${side}`, capPath, 0.058, railMaterial);
    const strakePath = HULL_STATIONS.slice(0, -1).map((s) => new Vector3(side * s.beam * 1.01, s.sheer - 0.30, s.z));
    addTube(world, `refit-rubbing-strake-${side}`, strakePath, 0.036, railMaterial);
  }

  addCockpit(world, deckMaterial, railMaterial);

  for (const node of scene.transformNodes) {
    if (node.name.startsWith('oar-') && node !== world.shipRoot) node.position.y += 0.55;
  }
  const capstan = scene.getMeshByName('capstan');
  if (capstan) capstan.position.y += 0.38;
  for (const mesh of scene.meshes) {
    if (/^capstan-bar-[0-3]$/.test(mesh.name)) mesh.position.y += 0.38;
  }
  const wheel = scene.getTransformNodeByName('helm-wheel');
  if (wheel) wheel.position.y += 0.08;

  const rudderBlade = scene.getMeshByName('rudder-blade');
  if (rudderBlade) {
    rudderBlade.scaling.y = 1.28;
    rudderBlade.position.y = -0.60;
  }

  const rigging = [
    [new Vector3(-1.32, 0.83, -3.30), new Vector3(0, 7.25, 0.32), new Vector3(-0.91, 1.02, 3.47)],
    [new Vector3(1.32, 0.83, -3.30), new Vector3(0, 7.25, 0.32), new Vector3(0.91, 1.02, 3.47)],
    [new Vector3(0, 7.25, 0.32), new Vector3(0, 1.18, 6.20)],
    [new Vector3(-2.15, 5.63, 0.32), new Vector3(-1.45, 0.78, -1.62)],
    [new Vector3(2.15, 5.63, 0.32), new Vector3(1.45, 0.78, -1.62)]
  ];
  rigging.forEach((path, index) => addTube(world, `refit-rigging-${index}`, path, 0.014, ropeMaterial));

  const skeg = MeshBuilder.CreateBox('refit-skeg', { width: 0.12, height: 0.82, depth: 0.34 }, scene);
  skeg.position.set(0, -0.93, -4.24);
  skeg.parent = world.shipRoot;
  skeg.material = ironMaterial;
  skeg.isPickable = false;
  skeg.receiveShadows = true;
  registerShadowCaster(world, skeg);
}

function correctWaterEffects(
  world: OceanWorld,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  const fwdX = Math.sin(state.yaw);
  const fwdZ = Math.cos(state.yaw);
  const bowLocalX = state.x + fwdX * 4.12;
  const bowLocalZ = state.z + fwdZ * 4.12;
  const bowWater = sampleWave(bowLocalX + originX, bowLocalZ + originZ, time, environment.waveScale);
  const spray = world.scene.particleSystems.find((system: { name: string }) => system.name === 'bow-spray') as ParticleSystem | undefined;
  if (spray?.emitter instanceof Vector3) spray.emitter.set(bowLocalX, bowWater.height + 0.06, bowLocalZ);

  const oarSplash = world.scene.particleSystems.find((system: { name: string }) => system.name === 'oar-splash') as ParticleSystem | undefined;
  if (oarSplash?.emitter instanceof Vector3) {
    const water = sampleWave(oarSplash.emitter.x + originX, oarSplash.emitter.z + originZ, time, environment.waveScale);
    oarSplash.emitter.y = water.height + 0.025;
  }
}

function frameWholeShip(
  world: OceanWorld,
  state: ShipState,
  telemetry: ShipTelemetry,
  dt: number,
  lookYaw: number,
  lookPitch: number
): void {
  const quarterOffset = 0.075 * Math.exp(-Math.abs(lookYaw) * 4.0);
  const cameraYaw = state.yaw + lookYaw + quarterOffset;
  const fwdX = Math.sin(cameraYaw);
  const fwdZ = Math.cos(cameraYaw);
  const distance = 15.0 + clamp(telemetry.speed, 0, 8) * 0.42;
  const height = 5.65 + clamp(telemetry.speed, 0, 8) * 0.10 + lookPitch * 1.55;

  let memory = cameraMemory.get(world);
  if (!memory) {
    memory = { position: world.camera.position.clone(), desired: new Vector3(), target: new Vector3() };
    cameraMemory.set(world, memory);
  }
  memory.desired.set(state.x - fwdX * distance, state.y + height, state.z - fwdZ * distance);
  memory.position.x = smoothTo(memory.position.x, memory.desired.x, 3.7, dt);
  memory.position.y = smoothTo(memory.position.y, memory.desired.y, 2.85, dt);
  memory.position.z = smoothTo(memory.position.z, memory.desired.z, 3.7, dt);
  world.camera.position.copyFrom(memory.position);

  const shipFwdX = Math.sin(state.yaw);
  const shipFwdZ = Math.cos(state.yaw);
  memory.target.set(
    state.x + shipFwdX * (0.95 + telemetry.speed * 0.12),
    state.y + 1.62 + lookPitch * 0.82,
    state.z + shipFwdZ * (0.95 + telemetry.speed * 0.12)
  );
  world.camera.setTarget(memory.target);
  world.camera.fov = smoothTo(world.camera.fov, 0.91 + clamp(telemetry.speed / 9, 0, 1) * 0.045, 3.0, dt);
  world.scene.getMeshByName('sky-dome')?.position.copyFrom(world.camera.position);
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosShipRefitV4?: boolean };
if (!prototype.__pelagosShipRefitV4) {
  prototype.__pelagosShipRefitV4 = true;
  const originalUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function patchedUpdate(
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
    refitShip(this);
    originalUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, rowing);
    correctWaterEffects(this, state, environment, time, originX, originZ);
    frameWholeShip(this, state, telemetry, dt, lookYaw, lookPitch);
  };
}
