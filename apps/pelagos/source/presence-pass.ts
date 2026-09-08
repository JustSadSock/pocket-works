import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { ShipState, ShipTelemetry } from './core';
import { clamp, hash2, sampleWave, smoothTo } from './core';
import type { EnvironmentFrame } from './world';
import { OceanWorld } from './world';
import { seaEnvelope } from './presence-physics';

const HULL_LINE = [
  { z: -4.55, beam: 0.92 }, { z: -3.65, beam: 1.28 }, { z: -2.55, beam: 1.52 },
  { z: -1.30, beam: 1.66 }, { z: 0.05, beam: 1.70 }, { z: 1.35, beam: 1.62 },
  { z: 2.55, beam: 1.43 }, { z: 3.52, beam: 1.10 }, { z: 4.18, beam: 0.66 }
] as const;

const CONTACT_POINTS = [
  { x: -0.62, z: 4.18 }, { x: 0.62, z: 4.18 },
  { x: -1.26, z: 2.85 }, { x: 1.26, z: 2.85 },
  { x: -1.55, z: 1.15 }, { x: 1.55, z: 1.15 },
  { x: -1.58, z: -0.75 }, { x: 1.58, z: -0.75 },
  { x: -1.34, z: -2.55 }, { x: 1.34, z: -2.55 }
] as const;

type WakeStamp = {
  mesh: Mesh;
  worldX: number;
  worldZ: number;
  born: number;
  strength: number;
  active: boolean;
};

type PresenceWorld = {
  foam: Mesh[];
  wake: WakeStamp[];
  streaks: Mesh[];
  birds: Mesh[];
  wetMaterial: StandardMaterial;
  foamMaterial: StandardMaterial;
  streakMaterial: StandardMaterial;
  squall: Mesh;
  oceanBounce: HemisphericLight;
  nextWake: number;
  wakeCursor: number;
  cameraSide: number;
  cameraLift: number;
  rigFlex: number;
};

const worlds = new WeakMap<OceanWorld, PresenceWorld>();

function createWoodTexture(world: OceanWorld, name: string, deck: boolean): DynamicTexture {
  const texture = new DynamicTexture(name, { width: 384, height: 384 }, world.scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const base = deck ? '#9b6a31' : '#4a2412';
  const light = deck ? 'rgba(231,184,103,0.18)' : 'rgba(188,112,59,0.13)';
  const dark = deck ? 'rgba(52,29,13,0.20)' : 'rgba(20,7,3,0.30)';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 384, 384);
  for (let plank = 0; plank < 16; plank += 1) {
    const x = plank * 24;
    ctx.fillStyle = plank % 2 ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.025)';
    ctx.fillRect(x, 0, 23, 384);
    ctx.fillStyle = dark;
    ctx.fillRect(x + 23, 0, 1, 384);
  }
  for (let i = 0; i < 190; i += 1) {
    const y = (i * 37 + (i % 7) * 11) % 384;
    const x = (i * 83) % 384;
    const length = 16 + (i * 19) % 82;
    ctx.strokeStyle = i % 3 === 0 ? dark : light;
    ctx.lineWidth = i % 5 === 0 ? 1.4 : 0.65;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + length * 0.35, y - 2, x + length * 0.65, y + 2, x + length, y);
    ctx.stroke();
  }
  texture.update(false);
  texture.uScale = deck ? 3.2 : 2.2;
  texture.vScale = deck ? 7.2 : 5.2;
  return texture;
}

function createCanvasTexture(world: OceanWorld): DynamicTexture {
  const texture = new DynamicTexture('presence-sail-weave', { width: 256, height: 256 }, world.scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#d9cfaa';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 5) {
    ctx.strokeStyle = 'rgba(80,67,43,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  for (let seam = 32; seam < 256; seam += 48) {
    ctx.strokeStyle = 'rgba(88,69,38,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(seam, 0); ctx.lineTo(seam, 256); ctx.stroke();
  }
  texture.update(false);
  texture.uScale = 2.3;
  texture.vScale = 2.3;
  return texture;
}

function tuneMaterials(world: OceanWorld): void {
  const hullTexture = createWoodTexture(world, 'presence-hull-grain', false);
  const deckTexture = createWoodTexture(world, 'presence-deck-grain', true);
  const canvasTexture = createCanvasTexture(world);

  const hull = world.scene.getMeshByName('refit-unified-hull');
  if (hull?.material instanceof StandardMaterial) {
    const m = hull.material;
    m.diffuseTexture = hullTexture;
    m.diffuseColor = new Color3(0.63, 0.39, 0.20);
    m.specularColor = new Color3(0.16, 0.11, 0.07);
    m.specularPower = 52;
    m.emissiveColor = new Color3(0.008, 0.004, 0.002);
  }

  const deck = world.scene.getMeshByName('refit-cambered-deck');
  if (deck?.material instanceof StandardMaterial) {
    const m = deck.material;
    m.diffuseTexture = deckTexture;
    m.diffuseColor = new Color3(0.82, 0.62, 0.34);
    m.specularColor = new Color3(0.075, 0.055, 0.035);
    m.specularPower = 24;
    m.emissiveColor = new Color3(0.015, 0.009, 0.003);
  }

  const sail = world.scene.getMaterialByName('salted-canvas') ?? world.scene.getMaterialByName('physical-sail-cloth');
  if (sail instanceof StandardMaterial) {
    sail.diffuseTexture = canvasTexture;
    sail.diffuseColor = new Color3(0.93, 0.89, 0.76);
    sail.specularColor = new Color3(0.045, 0.038, 0.026);
    sail.specularPower = 12;
  }

  const iron = world.scene.getMaterialByName('blackened-iron');
  if (iron instanceof StandardMaterial) {
    iron.diffuseColor = new Color3(0.07, 0.075, 0.07);
    iron.specularColor = new Color3(0.16, 0.17, 0.15);
    iron.specularPower = 72;
  }

  const rope = world.scene.getMaterialByName('hemp-rigging');
  if (rope instanceof StandardMaterial) {
    rope.diffuseColor = new Color3(0.34, 0.255, 0.15);
    rope.specularColor = new Color3(0.02, 0.016, 0.01);
    rope.specularPower = 7;
  }
}

function buildWaterlineRibbon(world: OceanWorld, side: number, material: StandardMaterial): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  HULL_LINE.forEach((station, index) => {
    const x = side * station.beam * 1.018;
    positions.push(x, -0.36, station.z, x, -0.90, station.z);
    uvs.push(index / (HULL_LINE.length - 1), 0, index / (HULL_LINE.length - 1), 1);
  });
  for (let i = 0; i < HULL_LINE.length - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  const mesh = new Mesh(`presence-wet-band-${side}`, world.scene);
  data.applyToMesh(mesh);
  mesh.parent = world.shipRoot;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}

function createBird(world: OceanWorld, index: number): Mesh {
  const bird = MeshBuilder.CreateLines(`presence-bird-${index}`, {
    points: [new Vector3(-0.34, 0, 0), new Vector3(0, 0.12, 0), new Vector3(0.34, 0, 0)]
  }, world.scene);
  bird.color = new Color3(0.045, 0.055, 0.055);
  bird.isPickable = false;
  bird.setEnabled(false);
  return bird;
}

function ensurePresence(world: OceanWorld): PresenceWorld {
  const existing = worlds.get(world);
  if (existing) return existing;
  tuneMaterials(world);

  const wetMaterial = new StandardMaterial('presence-wet-wood', world.scene);
  wetMaterial.diffuseColor = new Color3(0.095, 0.055, 0.034);
  wetMaterial.specularColor = new Color3(0.34, 0.36, 0.31);
  wetMaterial.specularPower = 92;
  wetMaterial.alpha = 0.58;
  wetMaterial.backFaceCulling = false;
  buildWaterlineRibbon(world, -1, wetMaterial);
  buildWaterlineRibbon(world, 1, wetMaterial);

  const foamMaterial = new StandardMaterial('presence-contact-foam', world.scene);
  foamMaterial.diffuseColor = new Color3(0.86, 0.93, 0.90);
  foamMaterial.emissiveColor = new Color3(0.075, 0.095, 0.085);
  foamMaterial.specularColor = new Color3(0.02, 0.02, 0.02);
  foamMaterial.alpha = 0.74;
  foamMaterial.backFaceCulling = false;

  const foam = CONTACT_POINTS.map((_, index) => {
    const mesh = MeshBuilder.CreatePlane(`presence-hull-foam-${index}`, { width: 0.66, height: 0.19 }, world.scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.material = foamMaterial;
    mesh.visibility = 0;
    mesh.isPickable = false;
    return mesh;
  });

  const wakeMaterial = new StandardMaterial('presence-wake-memory', world.scene);
  wakeMaterial.diffuseColor = new Color3(0.78, 0.90, 0.88);
  wakeMaterial.emissiveColor = new Color3(0.035, 0.055, 0.05);
  wakeMaterial.alpha = 0.32;
  wakeMaterial.specularColor = new Color3(0, 0, 0);
  const wake: WakeStamp[] = Array.from({ length: 34 }, (_, index) => {
    const mesh = MeshBuilder.CreateTorus(`presence-wake-${index}`, { diameter: 1.15, thickness: 0.035, tessellation: 20 }, world.scene);
    mesh.material = wakeMaterial;
    mesh.visibility = 0;
    mesh.isPickable = false;
    return { mesh, worldX: 0, worldZ: 0, born: 0, strength: 0, active: false };
  });

  const streakMaterial = new StandardMaterial('presence-wind-streak', world.scene);
  streakMaterial.diffuseColor = new Color3(0.70, 0.83, 0.82);
  streakMaterial.emissiveColor = new Color3(0.035, 0.055, 0.055);
  streakMaterial.alpha = 0.16;
  streakMaterial.specularColor = new Color3(0, 0, 0);
  const streaks = Array.from({ length: 11 }, (_, index) => {
    const mesh = MeshBuilder.CreateBox(`presence-wind-streak-${index}`, { width: 0.035, height: 0.012, depth: 5.2 + (index % 4) * 1.4 }, world.scene);
    mesh.material = streakMaterial;
    mesh.visibility = 0;
    mesh.isPickable = false;
    return mesh;
  });

  const squallMaterial = new StandardMaterial('presence-distant-squall-material', world.scene);
  squallMaterial.diffuseColor = new Color3(0.105, 0.16, 0.18);
  squallMaterial.emissiveColor = new Color3(0.025, 0.035, 0.038);
  squallMaterial.alpha = 0;
  squallMaterial.backFaceCulling = false;
  const squall = MeshBuilder.CreatePlane('presence-distant-squall', { width: 56, height: 17 }, world.scene);
  squall.material = squallMaterial;
  squall.billboardMode = Mesh.BILLBOARDMODE_Y;
  squall.isPickable = false;

  const oceanBounce = new HemisphericLight('presence-ocean-bounce', new Vector3(0, -1, 0), world.scene);
  oceanBounce.diffuse = new Color3(0.08, 0.28, 0.30);
  oceanBounce.specular = new Color3(0.025, 0.07, 0.075);
  oceanBounce.groundColor = new Color3(0.008, 0.012, 0.013);
  oceanBounce.intensity = 0.16;

  const birds = [createBird(world, 0), createBird(world, 1), createBird(world, 2)];
  const presence: PresenceWorld = {
    foam, wake, streaks, birds, wetMaterial, foamMaterial, streakMaterial, squall, oceanBounce,
    nextWake: 0, wakeCursor: 0, cameraSide: 0, cameraLift: 0, rigFlex: 0
  };
  worlds.set(world, presence);
  return presence;
}

function worldPoint(state: ShipState, localX: number, localZ: number): { x: number; z: number } {
  const sinYaw = Math.sin(state.yaw);
  const cosYaw = Math.cos(state.yaw);
  return {
    x: state.x + localX * cosYaw + localZ * sinYaw,
    z: state.z - localX * sinYaw + localZ * cosYaw
  };
}

function updateHullContact(
  world: OceanWorld,
  presence: PresenceWorld,
  state: ShipState,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  const speed = clamp(telemetry.speed / 6.2, 0, 1);
  for (let i = 0; i < CONTACT_POINTS.length; i += 1) {
    const point = CONTACT_POINTS[i];
    const p = worldPoint(state, point.x, point.z);
    const water = sampleWave(p.x + originX, p.z + originZ, time, environment.waveScale);
    const hullY = state.y - 0.52 + Math.sin(state.pitch) * point.z - Math.sin(state.roll) * point.x;
    const contact = clamp((water.height - hullY + 0.15) / 0.34, 0, 1);
    const bowBias = clamp((point.z + 3) / 7, 0.3, 1);
    const mesh = presence.foam[i];
    mesh.position.set(p.x, water.height + 0.026, p.z);
    mesh.rotation.y = state.yaw;
    mesh.scaling.x = 0.72 + speed * 1.25 + bowBias * 0.22;
    mesh.scaling.y = 0.82 + contact * 0.48;
    mesh.visibility = clamp(contact * (0.16 + speed * 0.84) * (0.48 + environment.waveScale * 0.26), 0, 0.78);
  }

  const bowSpray = world.scene.particleSystems.find((system: { name: string }) => system.name === 'bow-spray');
  if (bowSpray) {
    const forward = Math.max(0, telemetry.forwardSpeed);
    bowSpray.emitRate = Math.round(clamp((forward - 0.45) * 18 * environment.waveScale, 0, 92));
  }
}

function updateWake(
  presence: PresenceWorld,
  state: ShipState,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  const speed = clamp(telemetry.speed / 6.5, 0, 1);
  if (speed > 0.08 && time >= presence.nextWake) {
    presence.nextWake = time + (0.25 - speed * 0.09);
    const stamp = presence.wake[presence.wakeCursor++ % presence.wake.length];
    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    stamp.worldX = state.worldX - fwdX * 4.0;
    stamp.worldZ = state.worldZ - fwdZ * 4.0;
    stamp.born = time;
    stamp.strength = 0.18 + speed * 0.82;
    stamp.active = true;
  }

  for (const stamp of presence.wake) {
    if (!stamp.active) continue;
    const age = time - stamp.born;
    if (age > 8.5) {
      stamp.active = false;
      stamp.mesh.visibility = 0;
      continue;
    }
    const localX = stamp.worldX - originX;
    const localZ = stamp.worldZ - originZ;
    const water = sampleWave(stamp.worldX, stamp.worldZ, time, environment.waveScale);
    stamp.mesh.position.set(localX, water.height + 0.018, localZ);
    const growth = 1 + age * (0.42 + stamp.strength * 0.25);
    stamp.mesh.scaling.set(growth * 1.35, 1, growth * 0.72);
    stamp.mesh.visibility = stamp.strength * Math.exp(-age * 0.34) * 0.38;
  }
}

function updateWindStreaks(
  presence: PresenceWorld,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number,
  originX: number,
  originZ: number
): void {
  const windFactor = clamp((environment.wind.speed - 4) / 14, 0, 1);
  for (let i = 0; i < presence.streaks.length; i += 1) {
    const seedA = hash2(i * 71 + 13, i * 97 + 5);
    const seedB = hash2(i * 43 + 29, i * 31 + 17);
    const drift = time * (0.42 + environment.wind.speed * 0.035) + i * 6.3;
    const along = ((drift + seedA * 80) % 72) - 36;
    const across = (seedB - 0.5) * 54 + Math.sin(time * 0.08 + i) * 5;
    const dirX = Math.sin(environment.wind.direction);
    const dirZ = Math.cos(environment.wind.direction);
    const rightX = Math.cos(environment.wind.direction);
    const rightZ = -Math.sin(environment.wind.direction);
    const x = state.x + dirX * along + rightX * across;
    const z = state.z + dirZ * along + rightZ * across;
    const wave = sampleWave(x + originX, z + originZ, time, environment.waveScale);
    const mesh = presence.streaks[i];
    mesh.position.set(x, wave.height + 0.022, z);
    mesh.rotation.y = environment.wind.direction;
    mesh.visibility = windFactor * (0.10 + environment.wind.gust * 0.13) * (0.55 + seedA * 0.45);
  }
}

function updateRigAndCamera(
  world: OceanWorld,
  presence: PresenceWorld,
  state: ShipState,
  telemetry: ShipTelemetry,
  environment: EnvironmentFrame,
  time: number,
  dt: number
): void {
  const side = Math.sign(Math.sin(telemetry.windAngle)) || 1;
  const load = clamp((telemetry.apparentWindSpeed / 17) * (0.16 + telemetry.sailEfficiency), 0, 1);
  const flexTarget = side * load * 0.012 + Math.sin(time * 2.4) * environment.wind.gust * 0.0025;
  presence.rigFlex = smoothTo(presence.rigFlex, flexTarget, 3.0, dt);
  const rig = world.scene.getTransformNodeByName('physical-main-rig');
  if (rig) {
    rig.rotation.z = presence.rigFlex;
    rig.rotation.x = Math.sin(time * 1.7 + 0.4) * (0.0015 + environment.wind.gust * 0.0025);
  }

  // Camera has its own mass. It slightly resists yaw/heave rather than being welded to the hull.
  const sideTarget = clamp(-state.yawVelocity * 1.15, -0.48, 0.48);
  const liftTarget = clamp(-state.verticalVelocity * 0.32 - state.pitch * 0.42, -0.38, 0.38);
  presence.cameraSide = smoothTo(presence.cameraSide, sideTarget, 1.45, dt);
  presence.cameraLift = smoothTo(presence.cameraLift, liftTarget, 1.25, dt);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);
  world.camera.position.x += rightX * presence.cameraSide * dt * 4.0;
  world.camera.position.z += rightZ * presence.cameraSide * dt * 4.0;
  world.camera.position.y += presence.cameraLift * dt * 2.8 + Math.sin(time * 0.47) * 0.0008;
  const target = world.camera.getTarget();
  target.y += presence.cameraLift * 0.05;
  world.camera.setTarget(target);

  presence.oceanBounce.intensity = 0.11 + clamp(environment.timeOfDay, 0, 1) * 0.08 + environment.cloud * 0.025;
}

function updateRareNature(
  world: OceanWorld,
  presence: PresenceWorld,
  state: ShipState,
  environment: EnvironmentFrame,
  time: number
): void {
  const cycle = ((time + state.worldX * 0.013 + state.worldZ * 0.009) % 150 + 150) % 150;
  const squallStrength = clamp((cycle - 112) / 8, 0, 1) * clamp((145 - cycle) / 8, 0, 1) * clamp(environment.cloud + environment.storm * 0.8, 0, 1);
  const squallMaterial = presence.squall.material;
  if (squallMaterial instanceof StandardMaterial) squallMaterial.alpha = squallStrength * 0.18;
  const angle = environment.wind.direction + 0.95;
  presence.squall.position.set(state.x + Math.sin(angle) * 92, 8.2, state.z + Math.cos(angle) * 92);

  const birdEvent = cycle > 42 && cycle < 60 && environment.storm < 0.45 && environment.rain < 0.2;
  for (let i = 0; i < presence.birds.length; i += 1) {
    const bird = presence.birds[i];
    bird.setEnabled(birdEvent);
    if (!birdEvent) continue;
    const progress = (cycle - 42) / 18;
    const spread = i * 5.5;
    bird.position.set(state.x - 35 + progress * 72 + spread, 18 + i * 1.7 + Math.sin(time * 1.5 + i) * 0.6, state.z + 34 - i * 7);
    bird.rotation.y = -0.7;
    const flap = 0.75 + Math.sin(time * 5.2 + i * 1.8) * 0.18;
    bird.scaling.set(flap, flap, flap);
  }
}

const prototype = OceanWorld.prototype as typeof OceanWorld.prototype & { __pelagosPresencePassV1?: boolean };
if (!prototype.__pelagosPresencePassV1) {
  prototype.__pelagosPresencePassV1 = true;
  const previousUpdate = OceanWorld.prototype.update;
  OceanWorld.prototype.update = function presenceWorldUpdate(
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
    const groupedEnvironment = {
      ...environment,
      waveScale: environment.waveScale * seaEnvelope(state.worldX, state.worldZ, time)
    };
    previousUpdate.call(this, state, telemetry, groupedEnvironment, time, dt, originX, originZ, lookYaw, lookPitch, rowing);
    const presence = ensurePresence(this);
    updateHullContact(this, presence, state, telemetry, groupedEnvironment, time, originX, originZ);
    updateWake(presence, state, telemetry, groupedEnvironment, time, originX, originZ);
    updateWindStreaks(presence, state, groupedEnvironment, time, originX, originZ);
    updateRigAndCamera(this, presence, state, telemetry, groupedEnvironment, time, dt);
    updateRareNature(this, presence, state, groupedEnvironment, time);
  };
}
