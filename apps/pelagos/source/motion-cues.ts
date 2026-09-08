import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShipControls, ShipState, ShipTelemetry, WindState } from './core';
import { ShipDynamics, TAU, clamp, hash2, sampleWave, smoothTo } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';

type SeaPropKind = 'driftwood' | 'barrel' | 'crate' | 'buoy' | 'kelp';

type SeaProp = {
  root: TransformNode;
  kind: SeaPropKind;
  worldX: number;
  worldZ: number;
  generation: number;
  yaw: number;
  floatOffset: number;
  bobPhase: number;
  radius: number;
};

type MotionWorld = {
  props: SeaProp[];
  oarDeploy: number;
};

const motionWorlds = new WeakMap<OceanWorld, MotionWorld>();
const OAR_STATIONS = [-2.55, -1.28, -0.01, 1.26] as const;
const OARLOCK_X = 1.47;
const OARLOCK_Y = 0.49;
const OAR_VISIBLE_LENGTH = 2.58;
const OAR_BLADE_REACH = 2.72;

function material(world: OceanWorld, name: string, diffuse: Color3, specular: Color3, power: number): StandardMaterial {
  const m = new StandardMaterial(name, world.scene);
  m.diffuseColor = diffuse;
  m.specularColor = specular;
  m.specularPower = power;
  return m;
}

function createProp(world: OceanWorld, kind: SeaPropKind, index: number): SeaProp {
  const root = new TransformNode(`motion-prop-${kind}-${index}`, world.scene);
  root.setEnabled(false);
  const wood = material(world, `motion-wood-${index}`, new Color3(0.24, 0.12, 0.055), new Color3(0.08, 0.055, 0.035), 22);
  const faded = material(world, `motion-faded-${index}`, new Color3(0.47, 0.39, 0.24), new Color3(0.055, 0.045, 0.03), 16);
  const iron = material(world, `motion-iron-${index}`, new Color3(0.055, 0.06, 0.058), new Color3(0.18, 0.19, 0.17), 72);
  const buoyPaint = material(world, `motion-buoy-${index}`, new Color3(0.54, 0.17, 0.075), new Color3(0.09, 0.065, 0.045), 28);
  const kelpMat = material(world, `motion-kelp-${index}`, new Color3(0.075, 0.20, 0.105), new Color3(0.015, 0.025, 0.014), 8);

  if (kind === 'driftwood') {
    const log = MeshBuilder.CreateCylinder(`motion-driftwood-${index}`, { height: 1.65, diameterTop: 0.09, diameterBottom: 0.13, tessellation: 8 }, world.scene);
    log.rotation.z = Math.PI / 2;
    log.material = faded;
    log.parent = root;
  } else if (kind === 'barrel') {
    const barrel = MeshBuilder.CreateCylinder(`motion-barrel-${index}`, { height: 0.58, diameter: 0.43, tessellation: 12 }, world.scene);
    barrel.rotation.z = Math.PI / 2;
    barrel.material = wood;
    barrel.parent = root;
    for (const x of [-0.23, 0.23]) {
      const hoop = MeshBuilder.CreateTorus(`motion-barrel-hoop-${index}-${x}`, { diameter: 0.44, thickness: 0.025, tessellation: 12 }, world.scene);
      hoop.rotation.y = Math.PI / 2;
      hoop.position.x = x;
      hoop.material = iron;
      hoop.parent = root;
    }
  } else if (kind === 'crate') {
    const crate = MeshBuilder.CreateBox(`motion-crate-${index}`, { width: 0.52, height: 0.32, depth: 0.50 }, world.scene);
    crate.material = faded;
    crate.parent = root;
    for (const z of [-0.17, 0.17]) {
      const batten = MeshBuilder.CreateBox(`motion-crate-batten-${index}-${z}`, { width: 0.56, height: 0.045, depth: 0.055 }, world.scene);
      batten.position.set(0, 0.18, z);
      batten.material = wood;
      batten.parent = root;
    }
  } else if (kind === 'buoy') {
    const float = MeshBuilder.CreateSphere(`motion-buoy-float-${index}`, { diameter: 0.42, segments: 10 }, world.scene);
    float.scaling.y = 0.72;
    float.material = buoyPaint;
    float.parent = root;
    const pole = MeshBuilder.CreateCylinder(`motion-buoy-pole-${index}`, { height: 0.86, diameter: 0.055, tessellation: 8 }, world.scene);
    pole.position.y = 0.38;
    pole.material = iron;
    pole.parent = root;
    const top = MeshBuilder.CreateSphere(`motion-buoy-top-${index}`, { diameter: 0.13, segments: 8 }, world.scene);
    top.position.y = 0.82;
    top.material = buoyPaint;
    top.parent = root;
  } else {
    for (let leaf = 0; leaf < 4; leaf += 1) {
      const blade = MeshBuilder.CreateBox(`motion-kelp-${index}-${leaf}`, { width: 0.07, height: 0.018, depth: 0.72 + leaf * 0.11 }, world.scene);
      blade.position.set((leaf - 1.5) * 0.13, 0, (leaf % 2 ? 0.10 : -0.08));
      blade.rotation.y = (leaf - 1.5) * 0.24;
      blade.material = kelpMat;
      blade.parent = root;
    }
  }

  return {
    root,
    kind,
    worldX: 0,
    worldZ: 0,
    generation: 0,
    yaw: 0,
    floatOffset: kind === 'buoy' ? 0.13 : kind === 'kelp' ? 0.025 : 0.08,
    bobPhase: index * 1.937,
    radius: kind === 'buoy' ? 0.45 : kind === 'kelp' ? 0.75 : 0.55
  };
}

function ensureMotionWorld(world: OceanWorld): MotionWorld {
  const existing = motionWorlds.get(world);
  if (existing) return existing;
  const pattern: SeaPropKind[] = [
    'driftwood', 'barrel', 'kelp', 'crate', 'driftwood', 'buoy',
    'kelp', 'driftwood', 'crate', 'barrel', 'kelp', 'buoy',
    'driftwood', 'kelp', 'crate', 'barrel', 'driftwood', 'kelp',
    'buoy', 'driftwood', 'crate', 'kelp', 'barrel', 'driftwood'
  ];
  const state = { props: pattern.map((kind, index) => createProp(world, kind, index)), oarDeploy: 0 };
  motionWorlds.set(world, state);
  return state;
}

function respawnProp(prop: SeaProp, state: ShipState, index: number): void {
  prop.generation += 1;
  const cellX = Math.floor(state.worldX / 24);
  const cellZ = Math.floor(state.worldZ / 24);
  const a = hash2(cellX + index * 37 + prop.generation * 11, cellZ - index * 19 + prop.generation * 7);
  const b = hash2(cellX - index * 13 + prop.generation * 17, cellZ + index * 29 - prop.generation * 5);
  const c = hash2(cellX + index * 7 - prop.generation * 23, cellZ + index * 41 + prop.generation * 3);
  const spread = (a - 0.5) * Math.PI * 1.72;
  const angle = state.yaw + spread;
  const distance = 16 + Math.pow(b, 0.74) * 66;
  prop.worldX = state.worldX + Math.sin(angle) * distance;
  prop.worldZ = state.worldZ + Math.cos(angle) * distance;
  prop.yaw = c * TAU;
  prop.bobPhase = c * TAU + index * 0.37;
  const s = 0.78 + a * 0.48;
  prop.root.scaling.setAll(s);
  prop.root.setEnabled(true);
}

function updateProps(
  world: OceanWorld,
  motion: MotionWorld,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  for (let i = 0; i < motion.props.length; i += 1) {
    const prop = motion.props[i];
    let dx = prop.worldX - state.worldX;
    let dz = prop.worldZ - state.worldZ;
    let distance = Math.hypot(dx, dz);
    if (!prop.root.isEnabled() || distance > 92 || distance < 5.5) {
      respawnProp(prop, state, i);
      dx = prop.worldX - state.worldX;
      dz = prop.worldZ - state.worldZ;
      distance = Math.hypot(dx, dz);
    }

    const wave = sampleWave(prop.worldX, prop.worldZ, time, environment.waveScale);
    prop.root.position.set(prop.worldX - originX, wave.height + prop.floatOffset + Math.sin(time * 1.6 + prop.bobPhase) * 0.025, prop.worldZ - originZ);
    prop.root.rotation.y = prop.yaw + Math.sin(time * 0.23 + prop.bobPhase) * 0.045;
    const slopeScale = prop.kind === 'buoy' ? 0.22 : 0.58;
    prop.root.rotation.x = Math.atan2(wave.normalZ, wave.normalY) * slopeScale;
    prop.root.rotation.z = -Math.atan2(wave.normalX, wave.normalY) * slopeScale;
    const fade = clamp((92 - distance) / 18, 0, 1) * clamp((distance - 4.5) / 5, 0, 1);
    for (const child of prop.root.getChildMeshes()) child.visibility = fade;
  }
}

function suppressLegacyUnderbody(world: OceanWorld): void {
  if (!world.scene.getTransformNodeByName('pelagos-blender-cutter-root')) return;
  world.scene.getMeshByName('presence-wet-band--1')?.setEnabled(false);
  world.scene.getMeshByName('presence-wet-band-1')?.setEnabled(false);
  world.scene.getMeshByName('refit-skeg')?.setEnabled(false);
}

function strokeShape(phase: number): { power: number; recovery: number; sweep: number } {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.60) {
    const t = p / 0.60;
    return { power: Math.sin(t * Math.PI), recovery: 0, sweep: (t - 0.5) * 0.78 };
  }
  const t = (p - 0.60) / 0.40;
  return { power: 0, recovery: Math.sin(t * Math.PI), sweep: (0.5 - t) * 0.78 };
}

function posePhysicalOars(world: OceanWorld, motion: MotionWorld, state: ShipState, rowing: number, dt: number): void {
  const active = clamp(rowing, 0, 1);
  motion.oarDeploy = smoothTo(motion.oarDeploy, active > 0.025 ? 1 : 0, active > 0.025 ? 1.55 : 2.45, dt);
  const deploy = motion.oarDeploy;

  for (const side of [-1, 1]) {
    for (let index = 0; index < OAR_STATIONS.length; index += 1) {
      const pivot = world.scene.getTransformNodeByName(`physical-oar-${side}-${index}`);
      const shaft = world.scene.getMeshByName(`physical-oar-shaft-${side}-${index}`);
      const blade = world.scene.getMeshByName(`physical-oar-blade-${side}-${index}`);
      if (!pivot || !shaft || !blade) continue;

      const phase = state.rowingPhase + index * 0.014;
      const stroke = strokeShape(phase);
      const dip = (0.17 + stroke.power * 0.39 - stroke.recovery * 0.07) * deploy;
      const sweep = stroke.sweep * deploy;
      const visible = OAR_VISIBLE_LENGTH * (0.22 + deploy * 0.78);
      const directionX = side * Math.cos(dip);
      const directionY = -Math.sin(dip);

      pivot.position.set(side * OARLOCK_X, OARLOCK_Y, OAR_STATIONS[index]);
      pivot.rotation.set(0, side * sweep, 0);
      pivot.scaling.setAll(1);

      shaft.rotation.set(0, 0, -side * (Math.PI / 2 + dip));
      shaft.scaling.set(1, visible / 3.25, 1);
      shaft.position.set(directionX * visible * 0.5, directionY * visible * 0.5, 0);

      blade.rotation.set(0, 0, -side * dip);
      blade.position.set(directionX * (visible + 0.13), directionY * (visible + 0.13), 0);
      blade.scaling.set(0.70 + deploy * 0.30, 1, 0.86 + deploy * 0.14);

      const visibility = clamp((deploy - 0.055) / 0.20, 0, 1);
      shaft.visibility = visibility;
      blade.visibility = visibility;
      shaft.setEnabled(visibility > 0.001);
      blade.setEnabled(visibility > 0.001);
    }
  }
}

function rowingContact(state: ShipState, time: number, waveScale: number): { contact: number; power: number } {
  const stroke = strokeShape(state.rowingPhase);
  if (stroke.power <= 0.03) return { contact: 0, power: stroke.power };
  const dip = 0.17 + stroke.power * 0.39;
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  let contact = 0;
  let count = 0;

  for (const side of [-1, 1]) {
    for (const stationZ of OAR_STATIONS) {
      const localX = side * (OARLOCK_X + Math.cos(dip) * OAR_BLADE_REACH);
      const localY = OARLOCK_Y - Math.sin(dip) * OAR_BLADE_REACH;
      const localZ = stationZ + side * stroke.sweep * 0.44;
      const wx = state.worldX + localX * cosYaw + localZ * sinYaw;
      const wz = state.worldZ - localX * sinYaw + localZ * cosYaw;
      const water = sampleWave(wx, wz, time, waveScale);
      const bladeY = state.y + localY;
      contact += clamp((water.height - bladeY + 0.04) / 0.30, 0, 1);
      count += 1;
    }
  }
  return { contact: count > 0 ? contact / count : 0, power: stroke.power };
}

const previousDynamicsUpdate = ShipDynamics.prototype.update;
ShipDynamics.prototype.update = function motionCueDynamics(
  dt: number,
  time: number,
  controls: ShipControls,
  wind: WindState,
  waveScale: number
): ShipTelemetry {
  const requestedRowing = clamp(controls.rowing, 0, 1);
  const telemetry = previousDynamicsUpdate.call(this, dt, time, { ...controls, rowing: requestedRowing * 0.86 }, wind, waveScale);
  if (requestedRowing > 0.025) {
    const contact = rowingContact(this.state, time, waveScale);
    const safeDt = clamp(dt, 0.001, 1 / 30);
    const impulse = requestedRowing * contact.power * contact.contact * 0.20;
    this.state.velocityX += Math.sin(this.state.yaw) * impulse * safeDt;
    this.state.velocityZ += Math.cos(this.state.yaw) * impulse * safeDt;
    this.state.pitchVelocity = clamp(this.state.pitchVelocity - impulse * 0.010 * safeDt, -0.42, 0.42);
    this.state.verticalVelocity = clamp(this.state.verticalVelocity + contact.contact * contact.power * 0.006 * safeDt, -3.2, 3.2);
  }
  return telemetry;
};

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosMotionCuesV1?: boolean };
if (!prototype.__pelagosMotionCuesV1) {
  prototype.__pelagosMotionCuesV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function motionCueUpdate(
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
    const motion = ensureMotionWorld(this);
    suppressLegacyUnderbody(this);
    posePhysicalOars(this, motion, state, rowing, dt);
    updateProps(this, motion, state, environment, time, originX, originZ);
  };
}
