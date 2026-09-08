import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShipControls, ShipState, ShipTelemetry, WindState } from './core';
import { ShipDynamics, clamp, sampleWave, smoothTo } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';
import { ACTIVE_SHIP } from './ship-config';

type ModularOar = {
  pivot: TransformNode;
  shaft: Mesh;
  blade: Mesh;
  side: number;
  station: number;
  phaseOffset: number;
};

type ModularRig = {
  oars: ModularOar[];
  deploy: number;
  paletteApplied: boolean;
  sailsApplied: boolean;
};

const worldRigs = new WeakMap<OceanWorld, ModularRig>();
const rowingPhase = new WeakMap<ShipDynamics, number>();

function rgb(target: { set: (r: number, g: number, b: number) => unknown }, value: readonly [number, number, number]): void {
  target.set(value[0], value[1], value[2]);
}

function applyHullPalette(world: OceanWorld): boolean {
  if (document.documentElement.dataset.pelagosShipAsset !== 'blender') return false;
  const palette = ACTIVE_SHIP.palette;
  let touched = 0;
  for (const material of world.scene.materials) {
    if (!(material instanceof PBRMaterial)) continue;
    const name = material.name.toLowerCase();
    if (name.includes('oxblood') || name.includes('hull oak')) {
      rgb(material.albedoColor, palette.hull);
      touched += 1;
    } else if (name.includes('mahogany') || name.includes('varnished rail')) {
      rgb(material.albedoColor, palette.rail);
      touched += 1;
    } else if (name.includes('warm ivory') || name.includes('ivory')) {
      rgb(material.albedoColor, palette.trim);
      touched += 1;
    } else if (name.includes('sea green')) {
      rgb(material.albedoColor, palette.bootStripe);
      touched += 1;
    }
  }
  if (touched > 0) {
    document.documentElement.dataset.pelagosHullPalette = palette.id;
    return true;
  }
  return false;
}

function applySailPlan(world: OceanWorld): boolean {
  const main = world.scene.getMeshByName('physical-main-sail');
  const jib = world.scene.getMeshByName('physical-jib-sail');
  if (!main || !jib) return false;
  const sail = ACTIVE_SHIP.sail;
  const material = main.material ?? jib.material;
  if (material instanceof StandardMaterial) {
    rgb(material.diffuseColor, sail.cloth);
    material.emissiveColor.set(sail.cloth[0] * 0.018, sail.cloth[1] * 0.016, sail.cloth[2] * 0.012);
    material.specularColor.set(0.042, 0.036, 0.026);
    material.specularPower = 11;
  }
  main.scaling.z = sail.mainScale;
  jib.scaling.z = sail.jibScale;
  document.documentElement.dataset.pelagosSailPlan = sail.id;
  return true;
}

function hideLegacyOars(world: OceanWorld): void {
  for (const node of world.scene.transformNodes) {
    if (node.name.startsWith('physical-oar-')) node.setEnabled(false);
  }
  for (const mesh of world.scene.meshes) {
    if (mesh.name.startsWith('oar-port-') || mesh.name.startsWith('physical-oar-')) mesh.setEnabled(false);
  }
}

function createOarMaterial(world: OceanWorld): StandardMaterial {
  const material = new StandardMaterial(`module-oar-${ACTIVE_SHIP.oars.id}`, world.scene);
  rgb(material.diffuseColor, ACTIVE_SHIP.oars.wood);
  material.specularColor.set(0.10, 0.065, 0.032);
  material.specularPower = 32;
  return material;
}

function createBladeMaterial(world: OceanWorld): StandardMaterial {
  const material = new StandardMaterial(`module-oar-blades-${ACTIVE_SHIP.oars.id}`, world.scene);
  const c = ACTIVE_SHIP.oars.wood;
  material.diffuseColor.set(Math.min(1, c[0] * 1.32), Math.min(1, c[1] * 1.28), Math.min(1, c[2] * 1.18));
  material.specularColor.set(0.075, 0.050, 0.025);
  material.specularPower = 24;
  return material;
}

function shadow(world: OceanWorld, mesh: Mesh): void {
  const sun = world.scene.getLightByName('sun') as unknown as {
    getShadowGenerator?: () => { addShadowCaster: (mesh: Mesh, includeDescendants?: boolean) => void } | null;
  } | null;
  sun?.getShadowGenerator?.()?.addShadowCaster(mesh, false);
}

function ensureModularRig(world: OceanWorld): ModularRig {
  const existing = worldRigs.get(world);
  if (existing) return existing;
  hideLegacyOars(world);

  const scene = world.scene;
  const set = ACTIVE_SHIP.oars;
  const shaftMaterial = createOarMaterial(world);
  const bladeMaterial = createBladeMaterial(world);
  const oarlockMaterial = new StandardMaterial('module-oarlock-iron', scene);
  oarlockMaterial.diffuseColor.set(0.045, 0.052, 0.052);
  oarlockMaterial.specularColor.set(0.18, 0.19, 0.18);
  oarlockMaterial.specularPower = 68;

  const oars: ModularOar[] = [];
  const gripLength = Math.max(0.72, set.shaftLength - set.outboardReach);
  for (const side of [-1, 1]) {
    for (let index = 0; index < set.stations.length; index += 1) {
      const station = set.stations[index];
      const pivot = new TransformNode(`module-oar-${side}-${index}`, scene);
      pivot.parent = world.shipRoot;
      pivot.position.set(side * 0.24, set.pivotY, station);

      const lock = MeshBuilder.CreateTorus(`module-oarlock-${side}-${index}`, {
        diameter: 0.17,
        thickness: 0.026,
        tessellation: 12
      }, scene);
      lock.parent = world.shipRoot;
      lock.position.set(side * set.activePortX, set.pivotY, station);
      lock.rotation.z = Math.PI / 2;
      lock.material = oarlockMaterial;
      lock.isPickable = false;

      const shaft = MeshBuilder.CreateCylinder(`module-oar-shaft-${side}-${index}`, {
        diameterTop: 0.040,
        diameterBottom: 0.060,
        height: set.shaftLength,
        tessellation: 10
      }, scene);
      shaft.parent = pivot;
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = side * (set.outboardReach - gripLength) * 0.5;
      shaft.material = shaftMaterial;
      shaft.isPickable = false;
      shaft.receiveShadows = true;
      shadow(world, shaft);

      const blade = MeshBuilder.CreateBox(`module-oar-blade-${side}-${index}`, {
        width: set.bladeLength,
        height: 0.052,
        depth: set.bladeWidth
      }, scene);
      blade.parent = pivot;
      blade.position.x = side * (set.outboardReach + set.bladeLength * 0.30);
      blade.material = bladeMaterial;
      blade.isPickable = false;
      blade.receiveShadows = true;
      shadow(world, blade);

      oars.push({ pivot, shaft, blade, side, station, phaseOffset: index * 0.009 });
    }
  }

  const rig: ModularRig = { oars, deploy: 0, paletteApplied: false, sailsApplied: false };
  worldRigs.set(world, rig);
  document.documentElement.dataset.pelagosOarSet = set.id;
  document.documentElement.dataset.pelagosOarCount = String(set.stations.length * 2);
  document.documentElement.dataset.pelagosShipLength = ACTIVE_SHIP.definition.dimensions.hullLength.toFixed(2);
  return rig;
}

function strokeAt(phase: number): { power: number; recovery: number; sweep: number } {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.60) {
    const t = p / 0.60;
    return {
      power: Math.sin(t * Math.PI),
      recovery: 0,
      sweep: (t - 0.5) * 0.72
    };
  }
  const t = (p - 0.60) / 0.40;
  return {
    power: 0,
    recovery: Math.sin(t * Math.PI),
    sweep: (0.5 - t) * 0.72
  };
}

function dipAngle(power: number, recovery: number): number {
  return 0.105 + power * 0.50 - recovery * 0.060;
}

function rowingContact(state: ShipState, phase: number, time: number, waveScale: number): number {
  const stroke = strokeAt(phase);
  if (stroke.power <= 0.03) return 0;
  const set = ACTIVE_SHIP.oars;
  const dip = dipAngle(stroke.power, 0);
  const bladeLocalY = set.pivotY - Math.sin(dip) * set.outboardReach;
  const bladeLocalX = set.activePortX + Math.cos(dip) * set.outboardReach;
  const bladeWorldY = state.y + bladeLocalY;
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  let wet = 0;
  let samples = 0;

  for (const side of [-1, 1]) {
    for (const station of set.stations) {
      const localX = side * bladeLocalX;
      const wx = state.worldX + localX * cosYaw + station * sinYaw;
      const wz = state.worldZ - localX * sinYaw + station * cosYaw;
      const water = sampleWave(wx, wz, time, waveScale);
      const immersion = water.height - bladeWorldY;
      if (immersion > -0.06) wet += clamp((immersion + 0.06) / 0.28, 0, 1);
      samples += 1;
    }
  }
  return samples > 0 ? wet / samples : 0;
}

function updateOars(
  world: OceanWorld,
  rig: ModularRig,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number,
  dt: number,
  originX: number,
  originZ: number,
  rowing: number
): void {
  const active = clamp(rowing, 0, 1);
  rig.deploy = smoothTo(rig.deploy, active > 0.025 ? 1 : 0, active > 0.025 ? 2.4 : 1.75, dt);
  const deploy = rig.deploy;
  const set = ACTIVE_SHIP.oars;
  const stowedYaw = Math.PI * 0.5;
  const splash = world.scene.particleSystems.find((system: { name: string }) => system.name === 'oar-splash');

  for (let index = 0; index < rig.oars.length; index += 1) {
    const oar = rig.oars[index];
    const stationIndex = index % set.stations.length;
    const phase = ((state.rowingPhase + oar.phaseOffset) % 1 + 1) % 1;
    const stroke = strokeAt(phase);
    const power = stroke.power * active;
    const dip = dipAngle(power, stroke.recovery) * deploy;

    // Stowed: the complete sweep lies longitudinally under the gunwale. Deployed: the oarlock
    // slides to the side and only then does the whole sweep/dip motion become available. The
    // inboard grip is intentionally short enough that the power stroke cannot poke above deck.
    oar.pivot.position.x = oar.side * (0.24 + (set.activePortX - 0.24) * deploy);
    oar.pivot.position.y = set.pivotY;
    oar.pivot.position.z = oar.station;
    oar.pivot.rotation.y = oar.side * (stowedYaw * (1 - deploy) + stroke.sweep * deploy);
    oar.pivot.rotation.z = -oar.side * dip;
    oar.pivot.rotation.x = 0;
    oar.blade.rotation.x = stroke.recovery * 1.34 * deploy;
    oar.shaft.visibility = 0.25 + deploy * 0.75;
    oar.blade.visibility = deploy;

    if (deploy > 0.74 && power > 0.22 && splash) {
      const position = oar.blade.getAbsolutePosition();
      const water = sampleWave(position.x + originX, position.z + originZ, time, environment.waveScale);
      const immersion = water.height - position.y;
      if (immersion > -0.07 && immersion < 0.48) {
        if (splash.emitter instanceof Vector3) splash.emitter.set(position.x, water.height + 0.012, position.z);
        const cadence = stationIndex % 2 === 0 ? 1 : 0;
        splash.manualEmitCount = Math.max(splash.manualEmitCount, 1 + cadence + Math.round(power * 2));
      }
    }
  }
}

const previousReset = ShipDynamics.prototype.reset;
ShipDynamics.prototype.reset = function modularRowingReset(): void {
  rowingPhase.delete(this);
  previousReset.call(this);
};

const previousDynamicsUpdate = ShipDynamics.prototype.update;
ShipDynamics.prototype.update = function modularRowingUpdate(
  dt: number,
  time: number,
  controls: ShipControls,
  wind: WindState,
  waveScale: number
): ShipTelemetry {
  const active = clamp(controls.rowing, 0, 1);
  const safeDt = clamp(dt, 0.001, 1 / 30);

  // Everything below this layer sees rowing=0. This keeps exactly one stroke clock and one source
  // of rowing thrust even though older refit layers still exist as backwards-compatible modules.
  const telemetry = previousDynamicsUpdate.call(this, dt, time, { ...controls, rowing: 0 }, wind, waveScale);
  let phase = rowingPhase.get(this) ?? this.state.rowingPhase;
  if (active > 0.02) phase = (phase + safeDt * (0.40 + active * 0.065)) % 1;
  rowingPhase.set(this, phase);
  this.state.rowingPhase = phase;

  if (active > 0.02) {
    const stroke = strokeAt(phase);
    const wet = rowingContact(this.state, phase, time, waveScale);
    const lever = ACTIVE_SHIP.oars.outboardReach / 2.34;
    const crew = Math.sqrt(ACTIVE_SHIP.oars.stations.length / 6);
    const acceleration = active * stroke.power * wet * 0.62 * lever * crew;
    this.state.velocityX += Math.sin(this.state.yaw) * acceleration * safeDt;
    this.state.velocityZ += Math.cos(this.state.yaw) * acceleration * safeDt;
  }
  return telemetry;
};

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosShipModulesV1?: boolean };
if (!prototype.__pelagosShipModulesV1) {
  prototype.__pelagosShipModulesV1 = true;
  const previousWorldUpdate = OceanWorld.prototype.update;
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
    previousWorldUpdate.call(this, state, telemetry, environment, time, dt, originX, originZ, lookYaw, lookPitch, 0);
    const rig = ensureModularRig(this);
    if (!rig.paletteApplied) rig.paletteApplied = applyHullPalette(this);
    if (!rig.sailsApplied) rig.sailsApplied = applySailPlan(this);
    updateOars(this, rig, state, environment, time, dt, originX, originZ, rowing);
  };
}
