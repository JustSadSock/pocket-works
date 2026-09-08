import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { ShipState, ShipTelemetry } from './core';
import { TAU, clamp, sampleWave, smoothTo } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';
import {
  SHIP_LOADOUTS,
  getActiveShipLoadout,
  getOarStations,
  getShipLoadoutRevision,
  getShipScale,
  setActiveShipLoadout,
  type ShipLoadout
} from './ship-loadout';

type ModularOar = {
  pivot: TransformNode;
  shaft: Mesh;
  blade: Mesh;
  side: number;
  stationZ: number;
  phaseOffset: number;
};

type ModularRig = {
  revision: number;
  loadoutId: string;
  oars: ModularOar[];
  ports: Mesh[];
  deploy: number;
  shaftMaterial: StandardMaterial;
  bladeMaterial: StandardMaterial;
};

const rigs = new WeakMap<OceanWorld, ModularRig>();

function color(hex: string): Color3 {
  return Color3.FromHexString(hex);
}

function registerShadowCaster(world: OceanWorld, mesh: Mesh): void {
  const sun = world.scene.getLightByName('sun') as unknown as {
    getShadowGenerator?: () => { addShadowCaster: (mesh: Mesh, includeDescendants?: boolean) => void } | null;
  } | null;
  sun?.getShadowGenerator?.()?.addShadowCaster(mesh, false);
}

function disableLegacyOars(world: OceanWorld): void {
  for (const node of world.scene.transformNodes) {
    if (node.name.startsWith('physical-oar-') || (node.name.startsWith('oar-') && node !== world.shipRoot)) {
      node.setEnabled(false);
    }
  }
  for (const mesh of world.scene.meshes) {
    if (mesh.name.startsWith('oar-port-')) mesh.setEnabled(false);
  }
}

function disposeRig(rig: ModularRig): void {
  for (const oar of rig.oars) oar.pivot.dispose(false, true);
  for (const port of rig.ports) port.dispose(false, true);
  rig.shaftMaterial.dispose();
  rig.bladeMaterial.dispose();
}

function createRig(world: OceanWorld, loadout: ShipLoadout): ModularRig {
  disableLegacyOars(world);
  const scene = world.scene;
  const shaftMaterial = new StandardMaterial(`modular-oar-shaft-${loadout.id}`, scene);
  shaftMaterial.diffuseColor = color(loadout.palette.oarShaft);
  shaftMaterial.specularColor = new Color3(0.10, 0.07, 0.04);
  shaftMaterial.specularPower = 28;
  const bladeMaterial = new StandardMaterial(`modular-oar-blade-${loadout.id}`, scene);
  bladeMaterial.diffuseColor = color(loadout.palette.oarBlade);
  bladeMaterial.specularColor = new Color3(0.11, 0.08, 0.045);
  bladeMaterial.specularPower = 26;
  const portMaterial = new StandardMaterial(`modular-oar-port-${loadout.id}`, scene);
  portMaterial.diffuseColor = new Color3(0.024, 0.020, 0.017);
  portMaterial.specularColor = new Color3(0.05, 0.04, 0.03);
  portMaterial.specularPower = 14;

  const oars: ModularOar[] = [];
  const ports: Mesh[] = [];
  const stations = getOarStations(loadout.oars);
  for (const side of [-1, 1]) {
    for (let index = 0; index < stations.length; index += 1) {
      const stationZ = stations[index];
      const port = MeshBuilder.CreateCylinder(`modular-oar-port-${side}-${index}`, {
        diameter: 0.125,
        height: 0.038,
        tessellation: 14
      }, scene);
      port.rotation.z = Math.PI / 2;
      port.position.set(side * 1.52, 0.49, stationZ);
      port.parent = world.shipRoot;
      port.material = portMaterial;
      port.isPickable = false;
      ports.push(port);

      const pivot = new TransformNode(`modular-oar-${side}-${index}`, scene);
      pivot.position.set(side * 0.20, 0.48, stationZ);
      pivot.parent = world.shipRoot;

      const shaft = MeshBuilder.CreateCylinder(`modular-oar-shaft-${side}-${index}`, {
        diameterTop: loadout.oars.shaftRadius * 1.55,
        diameterBottom: loadout.oars.shaftRadius * 2.05,
        height: loadout.oars.shaftLength,
        tessellation: 10
      }, scene);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = side * 0.14;
      shaft.parent = pivot;
      shaft.material = shaftMaterial;
      shaft.isPickable = false;
      shaft.receiveShadows = true;
      registerShadowCaster(world, shaft);

      const blade = MeshBuilder.CreateBox(`modular-oar-blade-${side}-${index}`, {
        width: loadout.oars.bladeLength,
        height: 0.046,
        depth: loadout.oars.bladeWidth
      }, scene);
      blade.position.x = side * (loadout.oars.shaftLength * 0.33);
      blade.parent = pivot;
      blade.material = bladeMaterial;
      blade.isPickable = false;
      blade.receiveShadows = true;
      registerShadowCaster(world, blade);

      oars.push({
        pivot,
        shaft,
        blade,
        side,
        stationZ,
        phaseOffset: index * 0.010 + (side > 0 ? 0.004 : 0)
      });
    }
  }

  return {
    revision: getShipLoadoutRevision(),
    loadoutId: loadout.id,
    oars,
    ports,
    deploy: 0,
    shaftMaterial,
    bladeMaterial
  };
}

function applyMaterialColor(material: StandardMaterial | PBRMaterial, target: Color3): void {
  if (material instanceof PBRMaterial) material.albedoColor = target;
  else material.diffuseColor = target;
}

function applyPalette(world: OceanWorld, loadout: ShipLoadout): void {
  const hull = color(loadout.palette.hull);
  const trim = color(loadout.palette.trim);
  const deck = color(loadout.palette.deck);
  const sail = color(loadout.palette.sail);

  for (const material of world.scene.materials) {
    if (!(material instanceof StandardMaterial) && !(material instanceof PBRMaterial)) continue;
    const name = material.name.toLowerCase();
    if (name.includes('sail') || name.includes('canvas')) {
      applyMaterialColor(material, sail);
    } else if (name.includes('deck') || name.includes('plank')) {
      applyMaterialColor(material, deck);
    } else if (name.includes('ivory') || name.includes('trim')) {
      applyMaterialColor(material, trim);
    } else if (
      name.includes('hull')
      || name.includes('oxblood')
      || name.includes('sea-green')
      || name.includes('sea_green')
      || name.includes('paint')
    ) {
      applyMaterialColor(material, hull);
    }
  }
}

function applyShipGeometry(world: OceanWorld, loadout: ShipLoadout): void {
  const scale = getShipScale(loadout);
  world.shipRoot.scaling.set(scale.x, scale.y, scale.z);

  const mainRig = world.scene.getTransformNodeByName('physical-main-rig');
  if (mainRig) mainRig.scaling.set(1, loadout.sails.mainHeightScale, loadout.sails.mainChordScale);
  const jibRig = world.scene.getTransformNodeByName('physical-jib-rig');
  if (jibRig) jibRig.scaling.set(1, loadout.sails.jibHeightScale, loadout.sails.jibChordScale);

  // Keep the steering blade almost entirely below the static waterline. The tiller and stock
  // remain where they belong; only the blade is moved, avoiding the old "stern lifted into air"
  // look when a crest passes under the quarter.
  const rudderBlade = world.scene.getMeshByName('rudder-blade');
  if (rudderBlade) {
    rudderBlade.scaling.y = 1.02;
    rudderBlade.position.y = -1.25;
  }
}

function rowingStroke(phase: number): { power: number; recovery: number } {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.60) return { power: Math.max(0, Math.sin((p / 0.60) * Math.PI)), recovery: 0 };
  return { power: 0, recovery: Math.sin(((p - 0.60) / 0.40) * Math.PI) };
}

function updateOars(
  world: OceanWorld,
  rig: ModularRig,
  loadout: ShipLoadout,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number,
  dt: number,
  originX: number,
  originZ: number,
  rowing: number
): void {
  const active = clamp(rowing, 0, 1);
  rig.deploy = smoothTo(rig.deploy, active > 0.025 ? 1 : 0, active > 0.025 ? 3.0 : 2.0, dt);
  const deploy = rig.deploy;
  const splash = world.scene.particleSystems.find((system: { name: string }) => system.name === 'oar-splash') as ParticleSystem | undefined;

  for (const oar of rig.oars) {
    const phase = ((state.rowingPhase + oar.phaseOffset) % 1 + 1) % 1;
    const { power, recovery } = rowingStroke(phase);
    const strokePower = power * active;
    const sweepPhase = phase < 0.60 ? phase / 0.60 - 0.5 : 0.5 - (phase - 0.60) / 0.40;
    const sweep = sweepPhase * loadout.oars.strokeAmplitude;
    const dip = (0.10 + strokePower * loadout.oars.dipAmplitude - recovery * 0.06) * deploy;

    oar.pivot.position.x = oar.side * (0.20 + deploy * 1.18);
    oar.pivot.rotation.y = oar.side * sweep * deploy;
    oar.pivot.rotation.z = -oar.side * dip;
    oar.pivot.rotation.x = 0;

    oar.shaft.position.x = oar.side * (0.11 + deploy * 1.30);
    oar.shaft.scaling.y = 0.45 + deploy * 0.55;
    oar.blade.position.x = oar.side * (0.88 + deploy * (loadout.oars.shaftLength * 0.62));
    oar.blade.rotation.x = recovery * 1.26 * deploy;

    if (deploy > 0.78 && strokePower > 0.32 && splash) {
      const p = oar.blade.getAbsolutePosition();
      const water = sampleWave(p.x + originX, p.z + originZ, time, environment.waveScale);
      const immersion = water.height - p.y;
      if (immersion > -0.07 && immersion < 0.44) {
        const emitter = splash.emitter;
        if (emitter instanceof Vector3) emitter.set(p.x, water.height + 0.012, p.z);
        splash.manualEmitCount = Math.max(splash.manualEmitCount, 1 + Math.round(strokePower * 2.5));
      }
    }
  }
}

function correctBowWaterline(
  world: OceanWorld,
  loadout: ShipLoadout,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  const forward = loadout.dimensions.length * 0.47;
  const fwdX = Math.sin(state.yaw);
  const fwdZ = Math.cos(state.yaw);
  const x = state.x + fwdX * forward;
  const z = state.z + fwdZ * forward;
  const water = sampleWave(x + originX, z + originZ, time, environment.waveScale);
  const spray = world.scene.particleSystems.find((system: { name: string }) => system.name === 'bow-spray') as ParticleSystem | undefined;
  if (spray?.emitter instanceof Vector3) spray.emitter.set(x, water.height + 0.055, z);
}

function ensureRig(world: OceanWorld): { rig: ModularRig; loadout: ShipLoadout } {
  const loadout = getActiveShipLoadout();
  const revision = getShipLoadoutRevision();
  let rig = rigs.get(world);
  if (!rig || rig.revision !== revision || rig.loadoutId !== loadout.id) {
    if (rig) disposeRig(rig);
    rig = createRig(world, loadout);
    rigs.set(world, rig);
  }
  disableLegacyOars(world);
  applyShipGeometry(world, loadout);
  applyPalette(world, loadout);
  return { rig, loadout };
}

type ShipyardApi = {
  list: () => Array<{ id: string; label: string; length: number; beam: number; oarsPerSide: number; sail: string }>;
  get: () => ShipLoadout;
  set: (id: string) => boolean;
};

const shipyardApi: ShipyardApi = {
  list: () => Object.values(SHIP_LOADOUTS).map((loadout) => ({
    id: loadout.id,
    label: loadout.label,
    length: loadout.dimensions.length,
    beam: loadout.dimensions.beam,
    oarsPerSide: loadout.oars.stationsPerSide,
    sail: loadout.sails.label
  })),
  get: () => getActiveShipLoadout(),
  set: (id: string) => setActiveShipLoadout(id)
};

if (typeof window !== 'undefined') {
  (window as typeof window & { __PELAGOS_SHIPYARD__?: ShipyardApi }).__PELAGOS_SHIPYARD__ = shipyardApi;
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosShipModularityV1?: boolean };
if (!prototype.__pelagosShipModularityV1) {
  prototype.__pelagosShipModularityV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function modularShipUpdate(
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
    // The legacy physical-oar owner still handles sail cloth. Give it zero rowing so only the
    // modular bank below owns oar pose and water splashes.
    previousUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, 0);
    const { rig, loadout } = ensureRig(this);
    updateOars(this, rig, loadout, state, environment, time, dt, originX, originZ, rowing);
    correctBowWaterline(this, loadout, state, environment, time, originX, originZ);
  };
}
