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

// Visual/handling refit layered over the original world without touching the successful ocean shader.
// The old fittings that are still physically meaningful (mast, sails, wheel, anchors, oars) stay alive;
// only the toy-like hull/cabin shell is replaced.

type HullStation = {
  z: number;
  beam: number;
  sheer: number;
  keel: number;
};

const HULL_STATIONS: readonly HullStation[] = [
  { z: -4.58, beam: 0.92, sheer: 0.88, keel: -1.00 },
  { z: -3.82, beam: 1.24, sheer: 0.77, keel: -1.22 },
  { z: -2.72, beam: 1.50, sheer: 0.70, keel: -1.43 },
  { z: -1.36, beam: 1.63, sheer: 0.66, keel: -1.55 },
  { z: 0.18, beam: 1.67, sheer: 0.66, keel: -1.58 },
  { z: 1.72, beam: 1.57, sheer: 0.73, keel: -1.50 },
  { z: 3.02, beam: 1.31, sheer: 0.88, keel: -1.26 },
  { z: 4.02, beam: 0.80, sheer: 1.10, keel: -0.86 },
  { z: 4.64, beam: 0.09, sheer: 1.38, keel: -0.28 }
] as const;

const refitted = new WeakSet<OceanWorld>();
type CameraMemory = { position: Vector3; desired: Vector3; target: Vector3 };
const cameraMemory = new WeakMap<OceanWorld, CameraMemory>();

function registerShadowCaster(world: OceanWorld, mesh: Mesh): void {
  const sun = world.scene.getLightByName('sun') as unknown as { getShadowGenerator?: () => { addShadowCaster: (mesh: Mesh, includeDescendants?: boolean) => void } | null } | null;
  sun?.getShadowGenerator?.()?.addShadowCaster(mesh, false);
}

function buildHull(world: OceanWorld, material: Material | null): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const ring = 11;

  HULL_STATIONS.forEach((station, stationIndex) => {
    const y0 = station.sheer;
    const y1 = y0 - 0.30;
    const y2 = y0 - 0.69;
    const y3 = y0 - 1.08;
    const y4 = station.keel + 0.22;
    const xs = [
      -station.beam,
      -station.beam * 1.025,
      -station.beam * 0.94,
      -station.beam * 0.72,
      -station.beam * 0.37,
      0,
      station.beam * 0.37,
      station.beam * 0.72,
      station.beam * 0.94,
      station.beam * 1.025,
      station.beam
    ];
    const ys = [y0, y1, y2, y3, y4, station.keel, y4, y3, y2, y1, y0];
    for (let j = 0; j < ring; j += 1) {
      positions.push(xs[j], ys[j], station.z);
      uvs.push(j / (ring - 1), stationIndex / (HULL_STATIONS.length - 1) * 4.5);
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
    positions.push(0, station.sheer - 0.55, station.z);
    uvs.push(0.5, stationIndex === 0 ? 0 : 4.5);
    for (let j = 0; j < ring - 1; j += 1) {
      const a = stationIndex * ring + j;
      const b = a + 1;
      if (reverse) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
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
  const across = 5;

  HULL_STATIONS.forEach((station, stationIndex) => {
    const edge = Math.max(0.06, station.beam * 0.94);
    const xs = [-edge, -edge * 0.52, 0, edge * 0.52, edge];
    const crown = [0.02, 0.075, 0.105, 0.075, 0.02];
    for (let j = 0; j < across; j += 1) {
      positions.push(xs[j], station.sheer + crown[j], station.z);
      uvs.push(j / (across - 1), stationIndex / (HULL_STATIONS.length - 1) * 5.5);
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

function createRefitMaterial(world: OceanWorld, name: string, color: Color3, specular = new Color3(0.12, 0.10, 0.07), power = 32): StandardMaterial {
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

function refitShip(world: OceanWorld): void {
  if (refitted.has(world)) return;
  refitted.add(world);

  const scene = world.scene;
  const oldHull = scene.getMeshByName('full-carvel-hull');
  const oldDeck = scene.getMeshByName('cambered-deck');
  const hullMaterial = oldHull?.material ?? null;
  const deckMaterial = oldDeck?.material ?? hullMaterial;

  // Remove only the toy-like shell. Working rig, sails, wheel, anchors and oars remain intact.
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
  const waterlineMaterial = createRefitMaterial(world, 'painted-waterline', new Color3(0.70, 0.55, 0.29), new Color3(0.18, 0.13, 0.06), 42);
  const cockpitMaterial = createRefitMaterial(world, 'cockpit-shadow', new Color3(0.055, 0.035, 0.022), new Color3(0.02, 0.02, 0.02), 12);

  for (const side of [-1, 1]) {
    const capPath = HULL_STATIONS.slice(0, -1).map((s) => new Vector3(side * s.beam, s.sheer + 0.045, s.z));
    addTube(world, `refit-caprail-${side}`, capPath, 0.065, railMaterial);

    const waterlinePath = HULL_STATIONS.slice(0, -1).map((s) => new Vector3(side * s.beam * 0.91, -0.43, s.z));
    addTube(world, `refit-waterline-${side}`, waterlinePath, 0.035, waterlineMaterial);
  }

  // A recessed cockpit reads as part of the hull instead of a box sitting on top of it.
  const cockpit = MeshBuilder.CreateBox('refit-cockpit-well', { width: 1.78, height: 0.08, depth: 2.08 }, scene);
  cockpit.position.set(0, 0.75, -2.26);
  cockpit.parent = world.shipRoot;
  cockpit.material = cockpitMaterial;
  cockpit.isPickable = false;

  const companion = MeshBuilder.CreateBox('refit-companionway', { width: 1.18, height: 0.24, depth: 0.72 }, scene);
  companion.position.set(0, 0.91, -1.05);
  companion.rotation.x = -0.035;
  companion.parent = world.shipRoot;
  companion.material = deckMaterial;
  companion.receiveShadows = true;
  companion.isPickable = false;
  registerShadowCaster(world, companion);

  // The old fittings were authored around a deck almost at y=0. Raise only the fittings that
  // physically sit on deck; their animation references remain valid because we move the nodes.
  for (const node of scene.transformNodes) {
    if (node.name.startsWith('oar-') && node !== world.shipRoot) node.position.y += 0.55;
  }
  const capstan = scene.getMeshByName('capstan');
  if (capstan) capstan.position.y += 0.38;
  for (const mesh of scene.meshes) {
    if (mesh.name === 'capstan-bar-0' || mesh.name === 'capstan-bar-1' || mesh.name === 'capstan-bar-2' || mesh.name === 'capstan-bar-3') mesh.position.y += 0.38;
  }
  const wheel = scene.getTransformNodeByName('helm-wheel');
  if (wheel) wheel.position.y += 0.08;

  const rudderBlade = scene.getMeshByName('rudder-blade');
  if (rudderBlade) {
    rudderBlade.scaling.y = 1.28;
    rudderBlade.position.y = -0.60;
  }

  // Rebuild standing rigging from deck-level chainplates so ropes no longer disappear through the hull.
  const rigging = [
    [new Vector3(-1.32, 0.83, -3.30), new Vector3(0, 7.25, 0.32), new Vector3(-0.91, 1.02, 3.47)],
    [new Vector3(1.32, 0.83, -3.30), new Vector3(0, 7.25, 0.32), new Vector3(0.91, 1.02, 3.47)],
    [new Vector3(0, 7.25, 0.32), new Vector3(0, 1.18, 6.20)],
    [new Vector3(-2.15, 5.63, 0.32), new Vector3(-1.45, 0.78, -1.62)],
    [new Vector3(2.15, 5.63, 0.32), new Vector3(1.45, 0.78, -1.62)]
  ];
  rigging.forEach((path, index) => addTube(world, `refit-rigging-${index}`, path, 0.014, ropeMaterial));

  // A slim external skeg gives the rudder a believable structural attachment when exposed in a trough.
  const skeg = MeshBuilder.CreateBox('refit-skeg', { width: 0.12, height: 0.82, depth: 0.34 }, scene);
  skeg.position.set(0, -0.93, -4.24);
  skeg.parent = world.shipRoot;
  skeg.material = ironMaterial;
  skeg.isPickable = false;
  skeg.receiveShadows = true;
  registerShadowCaster(world, skeg);
}

function correctWaterEffects(world: OceanWorld, state: ShipState, environment: EnvironmentFrame, time: number, originX: number, originZ: number): void {
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

function frameWholeShip(world: OceanWorld, state: ShipState, telemetry: ShipTelemetry, dt: number, lookYaw: number, lookPitch: number): void {
  const cameraYaw = state.yaw + lookYaw;
  const fwdX = Math.sin(cameraYaw);
  const fwdZ = Math.cos(cameraYaw);
  const distance = 13.35 + clamp(telemetry.speed, 0, 8) * 0.42;
  const height = 6.75 + clamp(telemetry.speed, 0, 8) * 0.12 + lookPitch * 1.65;
  let memory = cameraMemory.get(world);
  if (!memory) {
    memory = { position: world.camera.position.clone(), desired: new Vector3(), target: new Vector3() };
    cameraMemory.set(world, memory);
  }
  memory.desired.set(state.x - fwdX * distance, state.y + height, state.z - fwdZ * distance);
  memory.position.x = smoothTo(memory.position.x, memory.desired.x, 3.8, dt);
  memory.position.y = smoothTo(memory.position.y, memory.desired.y, 3.0, dt);
  memory.position.z = smoothTo(memory.position.z, memory.desired.z, 3.8, dt);
  world.camera.position.copyFrom(memory.position);

  const shipFwdX = Math.sin(state.yaw);
  const shipFwdZ = Math.cos(state.yaw);
  memory.target.set(
    state.x + shipFwdX * (2.3 + telemetry.speed * 0.18),
    state.y + 1.72 + lookPitch * 0.88,
    state.z + shipFwdZ * (2.3 + telemetry.speed * 0.18)
  );
  world.camera.setTarget(memory.target);
  world.camera.fov = smoothTo(world.camera.fov, 0.94 + clamp(telemetry.speed / 9, 0, 1) * 0.045, 3.0, dt);
  world.scene.getMeshByName('sky-dome')?.position.copyFrom(world.camera.position);
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosShipRefitV2?: boolean };
if (!prototype.__pelagosShipRefitV2) {
  prototype.__pelagosShipRefitV2 = true;
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
