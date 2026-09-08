import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { ShipState, ShipTelemetry } from './core';
import { clamp } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type Rope = {
  mesh: Mesh;
  path: Vector3[];
};

type LivingRig = {
  shrouds: Rope[];
  forestay: Rope;
  backstay: Rope;
  sheets: Rope[];
};

const rigs = new WeakMap<OceanWorld, LivingRig>();
const LEGACY_RIGGING = ['refit-rigging-0', 'refit-rigging-1', 'refit-rigging-2', 'refit-rigging-3', 'refit-rigging-4'] as const;

export function sheetSag(load: number, turbulence = 0): number {
  const tension = clamp(load, 0, 1);
  return 0.075 + (1 - tension) * 0.34 + clamp(turbulence, 0, 1.5) * (1 - tension) * 0.035;
}

export function boomEndLocal(
  angle: number,
  heightScale = 1,
  chordScale = 1
): { x: number; y: number; z: number } {
  // The physical boom is 4.45 m long, centred at z=-2.15 under a rig pivot at z=0.32.
  // Shipyard sail modules scale the physical rig independently from the hull, so sheets must
  // follow the scaled boom instead of staying attached to the baseline 1.0 rig dimensions.
  const z = -4.375 * chordScale;
  return {
    x: z * Math.sin(angle),
    y: 2.28 * heightScale,
    z: 0.32 + z * Math.cos(angle)
  };
}

function ropeMaterial(world: OceanWorld): StandardMaterial {
  const existing = world.scene.getMaterialByName('pelagos-living-rigging');
  if (existing instanceof StandardMaterial) return existing;
  const material = new StandardMaterial('pelagos-living-rigging', world.scene);
  material.diffuseColor = new Color3(0.20, 0.135, 0.075);
  material.specularColor = new Color3(0.045, 0.035, 0.022);
  material.specularPower = 18;
  return material;
}

function makeRope(world: OceanWorld, name: string, points: Vector3[], radius: number): Rope {
  const path = points.map((point) => point.clone());
  const mesh = MeshBuilder.CreateTube(name, {
    path,
    radius,
    tessellation: 7,
    cap: Mesh.CAP_ALL,
    updatable: true
  }, world.scene);
  mesh.parent = world.shipRoot;
  mesh.material = ropeMaterial(world);
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  return { mesh, path };
}

function midpoint(a: Vector3, b: Vector3, sag: number, sideBias = 0): Vector3 {
  return new Vector3(
    (a.x + b.x) * 0.5 + sideBias,
    (a.y + b.y) * 0.5 - sag,
    (a.z + b.z) * 0.5
  );
}

function updateRope(rope: Rope, points: readonly Vector3[]): void {
  for (let i = 0; i < points.length; i += 1) rope.path[i].copyFrom(points[i]);
  MeshBuilder.CreateTube(rope.mesh.name, { path: rope.path, instance: rope.mesh });
}

function hideLegacyRigging(world: OceanWorld): void {
  for (const name of LEGACY_RIGGING) world.scene.getMeshByName(name)?.setEnabled(false);
}

function ensureRig(world: OceanWorld): LivingRig | null {
  const existing = rigs.get(world);
  if (existing) return existing;
  if (!world.scene.getTransformNodeByName('physical-main-rig')) return null;

  hideLegacyRigging(world);
  const mastTop = new Vector3(0, 7.25, 0.32);
  const shroudAnchors = [
    new Vector3(-1.32, 0.84, -2.82),
    new Vector3(-1.18, 0.90, 1.82),
    new Vector3(1.32, 0.84, -2.82),
    new Vector3(1.18, 0.90, 1.82)
  ];
  const shrouds = shroudAnchors.map((anchor, index) => makeRope(
    world,
    `pelagos-shroud-${index}`,
    [mastTop, midpoint(mastTop, anchor, 0.035), anchor],
    0.0125
  ));

  const bow = new Vector3(0, 1.18, 6.18);
  const stern = new Vector3(0, 0.95, -4.32);
  const forestay = makeRope(world, 'pelagos-forestay', [mastTop, midpoint(mastTop, bow, 0.028), bow], 0.0135);
  const backstay = makeRope(world, 'pelagos-backstay', [mastTop, midpoint(mastTop, stern, 0.045), stern], 0.0135);

  const boom = boomEndLocal(0);
  const boomEnd = new Vector3(boom.x, boom.y, boom.z);
  const sheetAnchors = [new Vector3(-0.92, 0.80, -3.34), new Vector3(0.92, 0.80, -3.34)];
  const sheets = sheetAnchors.map((anchor, index) => makeRope(
    world,
    `pelagos-main-sheet-${index}`,
    [boomEnd, midpoint(boomEnd, anchor, 0.24), anchor],
    0.0105
  ));

  const rig = { shrouds, forestay, backstay, sheets };
  rigs.set(world, rig);
  document.documentElement.dataset.pelagosRigging = 'living';
  document.documentElement.dataset.pelagosRiggingLines = String(shrouds.length + 2 + sheets.length);
  return rig;
}

function updateLivingRig(
  world: OceanWorld,
  rig: LivingRig,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number
): void {
  hideLegacyRigging(world);
  const mainRig = world.scene.getTransformNodeByName('physical-main-rig');
  if (!mainRig) return;

  const windLoad = clamp(telemetry.apparentWindSpeed / 13.5, 0, 1.15);
  const load = clamp(telemetry.sailEfficiency * windLoad, 0, 1);
  const turbulence = clamp(environment.wind.gust * 0.72 + environment.storm * 0.88, 0, 1.5);
  const mastTop = new Vector3(0, 7.25, 0.32);
  const shroudAnchors = [
    new Vector3(-1.32, 0.84, -2.82),
    new Vector3(-1.18, 0.90, 1.82),
    new Vector3(1.32, 0.84, -2.82),
    new Vector3(1.18, 0.90, 1.82)
  ];

  const mastPulse = Math.sin(time * 2.2) * turbulence * 0.005;
  rig.shrouds.forEach((rope, index) => {
    const anchor = shroudAnchors[index];
    const side = Math.sign(anchor.x) || 1;
    const sag = 0.028 + (1 - load) * 0.012 + turbulence * 0.004;
    updateRope(rope, [mastTop, midpoint(mastTop, anchor, sag, side * mastPulse), anchor]);
  });

  const bow = new Vector3(0, 1.18, 6.18);
  const stern = new Vector3(0, 0.95, -4.32);
  updateRope(rig.forestay, [mastTop, midpoint(mastTop, bow, 0.025 + turbulence * 0.003), bow]);
  updateRope(rig.backstay, [mastTop, midpoint(mastTop, stern, 0.038 + turbulence * 0.004), stern]);

  const boom = boomEndLocal(mainRig.rotation.y, mainRig.scaling.y, mainRig.scaling.z);
  const boomEnd = new Vector3(boom.x, boom.y, boom.z);
  const sheetAnchors = [new Vector3(-0.92, 0.80, -3.34), new Vector3(0.92, 0.80, -3.34)];
  const sag = sheetSag(load, turbulence);
  rig.sheets.forEach((rope, index) => {
    const anchor = sheetAnchors[index];
    const flutter = Math.sin(time * (3.4 + turbulence * 1.3) + index * 1.8) * (1 - load) * 0.024;
    const mid = midpoint(boomEnd, anchor, sag);
    mid.x += flutter;
    updateRope(rope, [boomEnd, mid, anchor]);
  });

  document.documentElement.dataset.pelagosSheetLoad = load.toFixed(3);
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosLivingRigV1?: boolean };
if (!prototype.__pelagosLivingRigV1) {
  prototype.__pelagosLivingRigV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function livingRigUpdate(
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
    if (rig) updateLivingRig(this, rig, telemetry, environment, time);
  };
}
