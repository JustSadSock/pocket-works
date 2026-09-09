import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { ShipState, ShipTelemetry } from './core';
import { clamp, sampleWave, smoothTo } from './core';
import { oarVisualPose, oarWaterlineDip } from './oar-visibility-refit';
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
  phase: number;
  previousPhase: number;
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
      pivot.position.set(side * 1.46, 0.49, stationZ);
      pivot.parent = world.shipRoot;

      const shaft = MeshBuilder.CreateCylinder(`modular-oar-shaft-${side}-${index}`, {
        diameterTop: loadout.oars.shaftRadius * 1.55,
        diameterBottom: loadout.oars.shaftRadius * 2.05,
        height: loadout.oars.shaftLength,
        tessellation: 10
      }, scene);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = side * loadout.oars.shaftLength * 0.23;
      shaft.parent = pivot;
      shaft.material = shaftMaterial;
      shaft.isPickable = false;
      shaft.receiveShadows = true;
      shaft.visibility = 0;
      shaft.setEnabled(false);
      registerShadowCaster(world, shaft);

      const blade = MeshBuilder.CreateBox(`modular-oar-blade-${side}-${index}`, {
        width: loadout.oars.bladeLength,
        height: 0.046,
        depth: loadout.oars.bladeWidth
      }, scene);
      blade.position.x = side * loadout.oars.shaftLength * 0.79;
      blade.parent = pivot;
      blade.material = bladeMaterial;
      blade.isPickable = false;
      blade.receiveShadows = true;
      blade.visibility = 0;
      blade.setEnabled(false);
      registerShadowCaster(world, blade);

      oars.push({
        pivot,
        shaft,
        blade,
        side,
        stationZ,
        phaseOffset: index * 0.022 + (side > 0 ? 0.010 : 0)
      });
    }
  }

  return {
    revision: getShipLoadoutRevision(),
    loadoutId: loadout.id,
    oars,
    ports,
    deploy: 0,
    phase: 0.08,
    previousPhase: 0.08,
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

  const rudderBlade = world.scene.getMeshByName('rudder-blade');
  if (rudderBlade) {
    rudderBlade.scaling.y = 1.02;
    rudderBlade.position.y = -1.25;
  }
}

function updateOars(
  world: OceanWorld,
  rig: ModularRig,
  loadout: ShipLoadout,
  environment: EnvironmentFrame,
  time: number,
  dt: number,
  originX: number,
  originZ: number,
  rowing: number
): void {
  const active = clamp(rowing, 0, 1);
  const safeDt = clamp(dt, 1 / 240, 1 / 24);
  rig.previousPhase = rig.phase;
  if (active > 0.02) rig.phase = (rig.phase + safeDt * (0.94 + active * 0.34)) % 1;
  rig.deploy = smoothTo(rig.deploy, active > 0.02 ? 1 : 0, active > 0.02 ? 5.8 : 3.2, safeDt);

  const visible = clamp(rig.deploy * 1.65, 0, 1);
  const waterlineDip = oarWaterlineDip(
    loadout.dimensions.waterlineCenterY,
    loadout.dimensions.verticalScale,
    loadout.oars.shaftLength
  );
  const dipScale = clamp(loadout.oars.dipAmplitude / 0.50, 0.76, 1.20);
  const referenceMidDip = 0.295 * dipScale;
  const desiredMidDip = waterlineDip + 0.030 + (dipScale - 1) * 0.045;
  const waterlinePoseScale = clamp(desiredMidDip / Math.max(0.08, referenceMidDip), 0.82, 1.62);
  const splash = world.scene.particleSystems.find((system: { name: string }) => system.name === 'oar-splash') as ParticleSystem | undefined;
  let visibleCount = 0;
  let strongestPower = 0;
  let splashPoint: Vector3 | null = null;

  for (const oar of rig.oars) {
    const phase = (rig.phase + oar.phaseOffset) % 1;
    const pose = oarVisualPose(phase, loadout.oars.strokeAmplitude, loadout.oars.dipAmplitude);
    const dip = pose.dip * waterlinePoseScale;

    oar.pivot.position.set(oar.side * 1.46, 0.49, oar.stationZ);
    oar.pivot.rotation.x = 0;
    oar.pivot.rotation.y = oar.side * pose.sweep * rig.deploy;
    oar.pivot.rotation.z = -oar.side * dip * rig.deploy;

    oar.shaft.position.x = oar.side * loadout.oars.shaftLength * 0.23;
    oar.shaft.scaling.y = 1;
    oar.shaft.visibility = visible;
    oar.shaft.setEnabled(visible > 0.015);

    oar.blade.position.x = oar.side * loadout.oars.shaftLength * 0.79;
    oar.blade.rotation.x = pose.recovery * 1.34 * rig.deploy;
    oar.blade.visibility = visible;
    oar.blade.setEnabled(visible > 0.015);
    if (visible > 0.30) visibleCount += 1;

    if (pose.power > strongestPower && visible > 0.72) {
      const point = oar.blade.getAbsolutePosition();
      const water = sampleWave(point.x + originX, point.z + originZ, time, environment.waveScale);
      const immersion = water.height - point.y;
      if (immersion > -0.34 && immersion < 0.38) {
        strongestPower = pose.power;
        splashPoint = new Vector3(point.x, water.height + 0.018, point.z);
      }
    }
  }

  if (splashPoint && splash && strongestPower > 0.48 && active > 0.35) {
    if (splash.emitter instanceof Vector3) splash.emitter.copyFrom(splashPoint);
    const wrapped = rig.phase < rig.previousPhase;
    splash.manualEmitCount = Math.max(splash.manualEmitCount, wrapped ? 8 : 2 + Math.round(strongestPower * 3));
  }

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.pelagosOarDeploy = rig.deploy.toFixed(3);
    document.documentElement.dataset.pelagosVisibleOars = String(visibleCount);
    document.documentElement.dataset.pelagosOarVisualPhase = rig.phase.toFixed(3);
    document.documentElement.dataset.pelagosOarWaterlineDip = waterlineDip.toFixed(3);
    document.documentElement.dataset.pelagosModularRowing = active.toFixed(3);
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

/**
 * Explicit rowing animation entry point. It is intentionally called by the final runtime bridge
 * after the full OceanWorld update chain, so older compatibility wrappers cannot zero, replace or
 * hide the selected modular oar bank later in the same frame.
 */
export function updateModularRowing(
  world: OceanWorld,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number,
  dt: number,
  originX: number,
  originZ: number,
  rowing: number
): void {
  const { rig, loadout } = ensureRig(world);
  updateOars(world, rig, loadout, environment, time, dt, originX, originZ, rowing);
  correctBowWaterline(world, loadout, state, environment, time, originX, originZ);
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

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosShipModularityV3?: boolean };
if (!prototype.__pelagosShipModularityV3) {
  prototype.__pelagosShipModularityV3 = true;
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
    // Preserve sail cloth and the rest of the legacy visual stack while preventing its old oar rig
    // from competing with the shipyard bank. The final rowing bridge owns visible oar animation.
    previousUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, 0);
    const { loadout } = ensureRig(this);
    correctBowWaterline(this, loadout, state, environment, time, originX, originZ);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.pelagosModularityInput = clamp(rowing, 0, 1).toFixed(3);
    }
  };
}
