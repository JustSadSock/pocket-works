import {
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  FreeCamera,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PointLight,
  Scene,
  SceneLoader,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  Viewport
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { clamp, damp, dampAngle, scenarioFlags } from './core.js';
import { ROUTES, TRAVERSAL_VERSION, carrierImpulse, climbAnchor, hasSupport, routePoint } from './traversal.js';
import { createInput } from './input.js';
import { createColossusAudio } from './audio.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#renderCanvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('COLOSSUS canvas missing');

const ui = {
  loading: $('#loadingPanel'), title: $('#loadingTitle'), text: $('#loadingText'), bar: $('#loadingBar'), percent: $('#loadingPercent'),
  error: $('#errorPanel'), errorText: $('#errorText'), retry: $('#retryButton'), zone: $('#zoneLabel'), objective: $('#objectiveText'), objectiveIndex: $('#objectiveIndex'),
  caption: $('#eventCaption'), meter: $('#stabilityMeter'), fill: $('#stabilityFill'), stability: $('#stabilityText'), joystick: $('#joystick'), knob: $('#joystickKnob'),
  action: $('#actionButton'), actionGlyph: $('#actionGlyph'), actionLabel: $('#actionLabel'), actionHint: $('#actionHint'), sound: $('#soundButton'), finish: $('#finishPanel'), restart: $('#restartButton'), fade: $('#sceneFade')
};

const RUN_KEY = 'pocket-works:colossus-inside:run';
const SETTINGS_KEY = 'pocket-works:colossus-inside:settings';
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const stored = read(RUN_KEY, {});
const raw = stored.physicsVersion === TRAVERSAL_VERSION ? stored : {};
const run = {
  carrier: ['back', 'shoulder', 'interior', 'head'].includes(raw.carrier) ? raw.carrier : 'back',
  lightning: !!raw.lightning,
  repaired: !!raw.repaired,
  finale: false,
  completedRuns: Number(stored.completedRuns) || 0,
  localX: Number.isFinite(raw.localX) ? raw.localX : 0,
  localZ: Number.isFinite(raw.localZ) ? raw.localZ : -11.0
};
const settings = read(SETTINGS_KEY, { muted: false });
const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const quality = (navigator.hardwareConcurrency || 4) >= 6 && Math.min(innerWidth, innerHeight) >= 360;
const audio = createColossusAudio();
audio.setMuted(!!settings.muted);

const engine = new Engine(canvas, true, { antialias: quality, stencil: false, powerPreference: 'high-performance' });
engine.setHardwareScalingLevel(quality ? Math.min(1.15, devicePixelRatio * 0.68) : Math.min(1.65, devicePixelRatio));
const scene = new Scene(engine);
scene.clearColor = new Color4(0.018, 0.032, 0.034, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogColor = new Color3(0.075, 0.105, 0.11);
scene.fogDensity = 0.0036;
scene.skipPointerMovePicking = true;
scene.imageProcessingConfiguration.exposure = 1.08;
scene.imageProcessingConfiguration.contrast = 1.22;
scene.imageProcessingConfiguration.toneMappingEnabled = true;

const camera = new FreeCamera('camera', new Vector3(0, 5, -9), scene);
camera.inputs.clear();
camera.minZ = 0.08;
camera.maxZ = 520;
camera.fov = 0.90;
scene.activeCamera = camera;

const hemi = new HemisphericLight('storm-fill', new Vector3(-0.25, 1, -0.2), scene);
hemi.intensity = 0.64;
hemi.diffuse = new Color3(0.54, 0.61, 0.60);
hemi.groundColor = new Color3(0.025, 0.03, 0.027);
const sun = new DirectionalLight('storm-key', new Vector3(-0.46, -0.87, 0.28), scene);
sun.position.set(18, 36, -28);
sun.intensity = quality ? 1.42 : 1.18;
sun.diffuse = new Color3(0.86, 0.83, 0.72);
const flash = new PointLight('lightning-flash', new Vector3(0, 20, 0), scene);
flash.intensity = 0;
flash.range = 130;
flash.diffuse = new Color3(0.72, 0.9, 1);
const shadows = new ShadowGenerator(quality ? 1024 : 512, sun);
shadows.usePercentageCloserFiltering = true;
shadows.bias = 0.0018;

function loading(percent, title, detail) {
  ui.bar.style.width = `${percent}%`;
  ui.percent.textContent = `${percent}%`;
  ui.title.textContent = title;
  ui.text.textContent = detail;
}
function persist() {
  write(RUN_KEY, {
    physicsVersion: TRAVERSAL_VERSION,
    carrier: run.carrier,
    lightning: run.lightning,
    repaired: run.repaired,
    localX: +run.localX.toFixed(2),
    localZ: +run.localZ.toFixed(2),
    completedRuns: run.completedRuns
  });
}
function caption(text, ms = 1800) {
  ui.caption.textContent = text;
  ui.caption.classList.add('show');
  clearTimeout(caption.timer);
  caption.timer = setTimeout(() => ui.caption.classList.remove('show'), ms);
}
function pulse(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }
ui.retry.onclick = () => location.reload();
ui.restart.onclick = () => {
  write(RUN_KEY, { physicsVersion: TRAVERSAL_VERSION, carrier: 'back', lightning: false, repaired: false, localX: 0, localZ: -11, completedRuns: run.completedRuns });
  location.reload();
};
ui.sound.onclick = () => {
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  audio.ensure();
  write(SETTINGS_KEY, settings);
  syncSound();
};
function syncSound() {
  ui.sound.textContent = settings.muted ? 'MUTED' : 'SOUND';
  ui.sound.classList.toggle('muted', settings.muted);
}
syncSound();

const motion = new TransformNode('carrier-root', scene);
const pelvis = new TransformNode('carrier-pelvis', scene);
const chest = new TransformNode('carrier-chest', scene);
const back = new TransformNode('carrier-back', scene);
const shoulder = new TransformNode('carrier-shoulder', scene);
const head = new TransformNode('carrier-head', scene);
const inside = new TransformNode('carrier-interior', scene);
pelvis.parent = motion;
chest.parent = pelvis; chest.position.y = 2.4;
back.parent = chest; back.position.set(0, 0.35, -1.8);
shoulder.parent = chest; shoulder.position.set(5.6, 0.15, 2);
head.parent = chest; head.position.set(0, 8.1, 4);
inside.parent = chest; inside.position.set(0, -1.15, 0.5);
const carriers = { back, shoulder, head, interior: inside };

const player = new TransformNode('PlayerRoot', scene);
const playerVisual = new TransformNode('PlayerVisual', scene);
playerVisual.parent = player;
function attach(carrier, x, z) {
  player.parent = carriers[carrier];
  const point = routePoint(carrier, x, z);
  player.position.set(point.x, point.y, point.z);
  run.localX = point.x;
  run.localZ = point.z;
}
attach(run.carrier, run.localX, run.localZ);

const exterior = new TransformNode('Exterior', scene);
exterior.parent = chest;
exterior.scaling.setAll(0.29);
exterior.rotation.y = Math.PI;
exterior.position.set(0, -22.4, -1.2);
const interior = new TransformNode('Interior', scene);
interior.parent = inside;
interior.scaling.setAll(0.72);
interior.rotation.y = Math.PI;
interior.position.set(0, -0.35, 2.2);
const world = new TransformNode('World', scene);

function mat(name, color, emissive = null) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new Color3(0.05, 0.06, 0.06);
  if (emissive) material.emissiveColor = emissive;
  return material;
}
function weatherTexture(name, base, fleck, scratches = true) {
  const texture = new DynamicTexture(name, { width: 128, height: 128 }, scene, false);
  const ctx = texture.getContext();
  ctx.fillStyle = `rgb(${Math.round(base[0] * 255)},${Math.round(base[1] * 255)},${Math.round(base[2] * 255)})`;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 360; i += 1) {
    const alpha = 0.025 + Math.random() * 0.09;
    const offset = (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 18);
    ctx.fillStyle = `rgba(${Math.round(clamp(fleck[0] * 255 + offset, 0, 255))},${Math.round(clamp(fleck[1] * 255 + offset, 0, 255))},${Math.round(clamp(fleck[2] * 255 + offset, 0, 255))},${alpha})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  if (scratches) {
    ctx.lineWidth = 0.45;
    for (let i = 0; i < 24; i += 1) {
      ctx.strokeStyle = `rgba(215,205,175,${0.03 + Math.random() * 0.065})`;
      ctx.beginPath();
      const x = Math.random() * 128, y = Math.random() * 128;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 34, y + (Math.random() - 0.5) * 7);
      ctx.stroke();
    }
  }
  texture.update(false);
  texture.wrapU = 1; texture.wrapV = 1;
  texture.uScale = 3; texture.vScale = 3;
  return texture;
}
const materialCache = new Map();
function authoredMaterial(kind) {
  if (materialCache.has(kind)) return materialCache.get(kind);
  const defs = {
    armor: [[0.045, 0.062, 0.060], [0.21, 0.17, 0.10], new Color3(0.50, 0.52, 0.45)],
    edge: [[0.23, 0.17, 0.075], [0.48, 0.33, 0.12], new Color3(0.75, 0.64, 0.35)],
    bone: [[0.12, 0.14, 0.125], [0.29, 0.28, 0.21], new Color3(0.42, 0.44, 0.38)],
    tissue: [[0.042, 0.012, 0.011], [0.12, 0.025, 0.018], new Color3(0.08, 0.025, 0.02)],
    cable: [[0.015, 0.021, 0.020], [0.08, 0.07, 0.05], new Color3(0.25, 0.26, 0.22)],
    player: [[0.115, 0.095, 0.070], [0.25, 0.19, 0.11], new Color3(0.22, 0.20, 0.16)],
    cloth: [[0.042, 0.050, 0.046], [0.12, 0.11, 0.08], new Color3(0.10, 0.11, 0.10)],
    interior: [[0.065, 0.078, 0.069], [0.21, 0.16, 0.09], new Color3(0.27, 0.27, 0.22)],
    heart: [[0.11, 0.010, 0.008], [0.33, 0.027, 0.016], new Color3(0.13, 0.02, 0.016)],
    sensor: [[0.018, 0.18, 0.15], [0.06, 0.52, 0.39], new Color3(0.10, 0.82, 0.66)]
  };
  const d = defs[kind] || defs.armor;
  const material = new StandardMaterial(`authored-${kind}`, scene);
  material.diffuseTexture = weatherTexture(`weather-${kind}`, d[0], d[1], kind !== 'heart' && kind !== 'sensor');
  material.diffuseColor = Color3.White();
  material.specularColor = d[2];
  material.specularPower = kind === 'armor' || kind === 'edge' ? 74 : kind === 'sensor' ? 100 : 28;
  if (kind === 'sensor') material.emissiveColor = new Color3(0.025, 0.34, 0.27);
  if (kind === 'heart') material.emissiveColor = new Color3(0.035, 0.002, 0.002);
  materialCache.set(kind, material);
  return material;
}
function materialKind(name, zone) {
  if (/Sensor|Visor|StabilizerCore|Ceramic|Beacon/i.test(name)) return 'sensor';
  if (zone === 'interior' && /Heart|Sinew|Muscle|Membrane|Vascular/i.test(name)) return 'heart';
  if (zone === 'exterior' && /Sinew|Muscle|Membrane|Vascular|PelvisCore/i.test(name)) return 'tissue';
  if (/Cable|Hose|Scarf|Harness/i.test(name)) return zone === 'player' ? 'cloth' : 'cable';
  if (/Edge|Rail|Ring|Valve|Piston|Axle|Wheel|Clamp|Gear/i.test(name)) return 'edge';
  if (/Bone|Joint|Rib|Spine|Vertebra/i.test(name)) return 'bone';
  if (zone === 'player') return /Hood|Torso|Arm|Leg/i.test(name) ? 'cloth' : 'player';
  if (zone === 'interior') return 'interior';
  return 'armor';
}
function styleMesh(mesh, zone) {
  mesh.material = authoredMaterial(materialKind(mesh.name, zone));
  if (zone === 'exterior' && /ChestSinew|PelvisCore/i.test(mesh.name)) mesh.visibility = 0.12;
}

function armorPlate(name, parent, x, y, z, width, depth, rz = 0) {
  const plate = MeshBuilder.CreateBox(name, { width, height: 0.26, depth }, scene);
  plate.parent = parent;
  plate.position.set(x, y, z);
  plate.rotation.z = rz;
  plate.material = authoredMaterial('armor');
  plate.receiveShadows = true;
  shadows.addShadowCaster(plate, true);
  const ridge = MeshBuilder.CreateBox(`${name}-ridge`, { width: Math.max(0.55, width * 0.06), height: 0.20, depth: depth * 0.72 }, scene);
  ridge.parent = plate;
  ridge.position.y = 0.23;
  ridge.material = authoredMaterial('edge');
  return plate;
}
const routeLights = [];
function addLamp(parent, x, y, z, intensity = 0.48, range = 7.5) {
  const bulb = MeshBuilder.CreateBox(`lamp-${routeLights.length}`, { width: 0.18, height: 0.10, depth: 0.46 }, scene);
  bulb.parent = parent;
  bulb.position.set(x, y, z);
  bulb.material = authoredMaterial('sensor');
  const light = new PointLight(`route-light-${routeLights.length}`, Vector3.Zero(), scene);
  light.parent = bulb;
  light.intensity = intensity;
  light.range = range;
  light.diffuse = new Color3(0.24, 0.78, 0.66);
  routeLights.push({ bulb, light });
}

const beaconMat = new StandardMaterial('objective-beacon-mat', scene);
beaconMat.diffuseColor = new Color3(0.01, 0.22, 0.17);
beaconMat.emissiveColor = new Color3(0.04, 1.0, 0.72);
beaconMat.specularColor = new Color3(0.35, 1, 0.88);
const beacons = {};
function buildRouteFor(carrierName, parent) {
  const route = ROUTES[carrierName];
  route.pads.forEach(([a, b], index) => {
    const z = (a + b) / 2;
    const depth = b - a;
    const width = Math.max(2.8, route.width(z) * 1.65);
    const y = route.height(0, z) - 0.27;
    armorPlate(`${carrierName}-plate-${index}`, parent, 0, y, z, width, depth, (index % 2 ? 1 : -1) * 0.012);
    if (index % 2 === 1) addLamp(parent, index % 4 === 1 ? -Math.min(3, width * 0.35) : Math.min(3, width * 0.35), y + 0.46, z);
  });
}
function buildReadableRoute() {
  buildRouteFor('back', back);
  buildRouteFor('shoulder', shoulder);
  buildRouteFor('interior', inside);
  buildRouteFor('head', head);
  for (let i = 0; i < 6; i += 1) {
    const z = -8 + i * 3.2;
    const fin = MeshBuilder.CreateBox(`spine-fin-${i}`, { width: 0.5, height: 1.05, depth: 0.38 }, scene);
    fin.parent = back;
    fin.position.set(0, ROUTES.back.height(0, z) + 0.48, z);
    fin.rotation.x = 0.22;
    fin.material = authoredMaterial('bone');
  }
  const ring = MeshBuilder.CreateTorus('Beacon_Shoulder_Hinge', { diameter: 4.2, thickness: 0.42, tessellation: 48 }, scene);
  ring.parent = back;
  ring.position.set(0, ROUTES.back.height(0, 10.35) + 1.85, 10.35);
  ring.rotation.x = Math.PI / 2;
  ring.material = beaconMat;
  beacons.shoulder = ring;
  const pillar = MeshBuilder.CreateCylinder('Beacon_Shoulder_Pillar', { height: 3.4, diameter: 0.22, tessellation: 12 }, scene);
  pillar.parent = back;
  pillar.position.set(0, ROUTES.back.height(0, 10.35) + 1.25, 10.35);
  pillar.material = beaconMat;
  const pad = MeshBuilder.CreateCylinder('Beacon_Shoulder_Pad', { height: 0.08, diameter: 3.6, tessellation: 32 }, scene);
  pad.parent = back;
  pad.position.set(0, ROUTES.back.height(0, 9.75) + 0.06, 9.75);
  pad.material = beaconMat;
  beacons.shoulderPad = pad;
  const objectiveLight = new PointLight('shoulder-objective-light', Vector3.Zero(), scene);
  objectiveLight.parent = ring;
  objectiveLight.intensity = 1.8;
  objectiveLight.range = 18;
  objectiveLight.diffuse = new Color3(0.12, 1, 0.72);
  beacons.shoulderLight = objectiveLight;
}
buildReadableRoute();

const playerLamp = new PointLight('traveler-lamp', new Vector3(0, 1.8, 0.2), scene);
playerLamp.parent = player;
playerLamp.intensity = 0.34;
playerLamp.range = 8.5;
playerLamp.diffuse = new Color3(0.80, 0.72, 0.52);

const marker = document.createElement('div');
marker.id = 'objectiveMarker';
marker.textContent = '◈  ПЛЕЧЕВОЙ ШАРНИР';
Object.assign(marker.style, {
  position: 'fixed', zIndex: '25', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
  padding: '7px 10px', border: '1px solid rgba(80,255,205,.72)', background: 'rgba(5,20,18,.72)',
  color: '#90ffe1', font: '700 11px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '.12em',
  pointerEvents: 'none', borderRadius: '2px', boxShadow: '0 0 20px rgba(60,255,205,.18)', display: 'none'
});
document.body.append(marker);

const abyss = MeshBuilder.CreateCylinder('abyss', { diameter: 380, height: 2, tessellation: 64 }, scene);
abyss.position.y = -32;
abyss.parent = world;
abyss.material = mat('abyssmat', new Color3(0.018, 0.028, 0.029));
const clouds = [];
for (let i = 0; i < 3; i += 1) {
  const plane = MeshBuilder.CreatePlane(`cloud${i}`, { width: 180, height: 60 }, scene);
  plane.parent = world;
  plane.position.set((i - 1) * 52, 15 + i * 11, 88 + i * 35);
  plane.rotation.y = i % 2 ? 0.22 : -0.18;
  const cloudMat = mat(`cloudmat${i}`, new Color3(0.08 + i * 0.012, 0.11 + i * 0.012, 0.11 + i * 0.012));
  cloudMat.alpha = 0.42;
  cloudMat.backFaceCulling = false;
  plane.material = cloudMat;
  clouds.push(plane);
}
const rainTex = new DynamicTexture('rainTex', { width: 8, height: 48 }, scene, false);
{
  const ctx = rainTex.getContext();
  const gradient = ctx.createLinearGradient(0, 0, 0, 48);
  gradient.addColorStop(0, 'rgba(220,235,238,0)');
  gradient.addColorStop(0.5, 'rgba(220,235,238,.85)');
  gradient.addColorStop(1, 'rgba(220,235,238,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(3, 0, 2, 48);
  rainTex.hasAlpha = true;
  rainTex.update(false);
}
const rainPos = new Vector3();
const rain = new ParticleSystem('rain', quality ? 1050 : 480, scene);
rain.particleTexture = rainTex;
rain.emitter = rainPos;
rain.minEmitBox = new Vector3(-14, 0, -10);
rain.maxEmitBox = new Vector3(14, 5, 10);
rain.direction1 = new Vector3(-5, -22, -1);
rain.direction2 = new Vector3(-7, -25, 1);
rain.minLifeTime = 0.55;
rain.maxLifeTime = 0.9;
rain.minSize = 0.08;
rain.maxSize = 0.2;
rain.emitRate = quality ? 600 : 290;
rain.color1 = new Color4(0.7, 0.82, 0.84, 0.6);
rain.color2 = new Color4(0.45, 0.6, 0.64, 0.34);
rain.start();

let extGroups = [], intGroups = [], plyGroups = [], plyAnim = '';
let fracture = null, shards = [], hatch = null, secondary = [], scarf = [];
const findGroup = (groups, name) => groups.find((group) => group.name.toLowerCase().includes(name.toLowerCase()));
function playGroup(groups, name, loop = true, speedRatio = 1) {
  const group = findGroup(groups, name);
  if (!group) return false;
  groups.forEach((candidate) => { if (candidate !== group && candidate.isPlaying) candidate.stop(); });
  if (!group.isPlaying) group.start(loop, speedRatio, group.from, group.to, false);
  group.speedRatio = speedRatio;
  return true;
}
function playPlayer(name, loop = true, speedRatio = 1) {
  if (plyAnim === name && loop) return;
  plyAnim = name;
  if (!playGroup(plyGroups, name, loop, speedRatio)) {
    const fallback = name === 'Jump' ? 'Fall' : name === 'Land' ? 'Idle' : name === 'Grab' ? 'Hang' : 'Idle';
    playGroup(plyGroups, fallback, loop, speedRatio);
  }
}
async function loadModel(name, parent, zone, onMesh) {
  const result = await SceneLoader.ImportMeshAsync('', './models/', name, scene);
  result.meshes.filter((mesh) => !mesh.parent).forEach((mesh) => { mesh.parent = parent; });
  result.meshes.forEach((mesh) => {
    mesh.isPickable = false;
    if (mesh instanceof Mesh) {
      mesh.receiveShadows = quality;
      styleMesh(mesh, zone);
      onMesh?.(mesh);
    }
  });
  return result;
}
async function assets() {
  loading(12, 'Проверяем скелет', 'Colossus armature · dorsal armor');
  const exteriorResult = await loadModel('colossus.glb', exterior, 'exterior', (mesh) => {
    if (/BackPlate|ShoulderDeck|HeadDeck|Fracture|Hatch/i.test(mesh.name)) shadows.addShadowCaster(mesh, true);
    if (mesh.name.includes('FracturePlate_Intact')) fracture = mesh;
    if (mesh.name.includes('FractureShard_')) shards.push(mesh);
    if (mesh.name.includes('HatchDoor')) hatch = mesh;
    if (/Cable_|Antenna_|SuspendedVane/i.test(mesh.name)) secondary.push(mesh);
  });
  extGroups = exteriorResult.animationGroups;
  extGroups.forEach((group) => group.stop());
  loading(50, 'Загружаем внутренности', 'Heart · pistons · stabilizer');
  const interiorResult = await loadModel('interior.glb', interior, 'interior', (mesh) => {
    if (/Heart|Piston|Stabilizer|Repair/i.test(mesh.name)) shadows.addShadowCaster(mesh, true);
  });
  intGroups = interiorResult.animationGroups;
  playGroup(intGroups, run.repaired ? 'Recovered' : run.lightning ? 'Fail' : 'Pulse', true, 0.72);
  loading(80, 'Поднимаем человека', 'Idle · walk · jump · grab · climb · land');
  const playerResult = await loadModel('player.glb', playerVisual, 'player', (mesh) => {
    shadows.addShadowCaster(mesh, true);
    if (/ScarfTail/i.test(mesh.name)) scarf.push(mesh);
  });
  plyGroups = playerResult.animationGroups;
  if (!plyGroups.length) throw new Error('player.glb: animations missing');
  playerVisual.scaling.setAll(0.48);
  playerVisual.rotation.y = 0;
  loading(100, 'Колосс просыпается', quality ? 'HIGH mobile profile' : 'ADAPTIVE mobile profile');
}

function visibility() {
  const inn = run.carrier === 'interior';
  exterior.setEnabled(!inn);
  interior.setEnabled(inn);
  world.setEnabled(!inn);
  rain.emitRate = inn ? 0 : (quality ? 600 : 290) * (run.repaired ? 0.55 : 1);
  scene.fogDensity = inn ? 0.013 : run.repaired ? 0.0031 : 0.0036;
  scene.fogColor = inn ? new Color3(0.052, 0.064, 0.058) : new Color3(0.075, 0.105, 0.11);
  hemi.intensity = inn ? 0.34 : run.repaired ? 0.76 : 0.64;
  sun.intensity = inn ? 0.25 : run.repaired ? 1.65 : quality ? 1.42 : 1.18;
  playerLamp.intensity = inn ? 0.52 : 0.34;
  audio.setInside(inn);
}

const objective = () => run.carrier === 'head'
  ? ['08', 'Дойди до переднего гребня головы.', 'CRANIAL DECK · 08']
  : run.carrier === 'interior'
    ? run.repaired
      ? ['07', 'Удерживай JUMP у верхнего канала и выберись наружу.', 'THORACIC CORE · 07']
      : ['06', 'Доберись до стабилизатора и удерживай привод.', 'THORACIC CORE · 06']
    : run.carrier === 'shoulder'
      ? ['05', 'Пересечь лопатку и найти подсвеченный сервисный люк.', 'SCAPULAR JOINT · 05']
      : run.lightning
        ? ['04', 'Следуй бирюзовому указателю. У шарнира удерживай JUMP.', 'DORSAL PLATES · 04']
        : run.localZ > -8
          ? ['03', 'Прыгай через разрывы между бронепластинами.', 'DORSAL PLATES · 03']
          : ['01', 'Выйди из защитной ниши на спину.', 'DORSAL SHELTER · 01'];
let objectiveKey = '';
function syncObjective() {
  const data = objective();
  const key = data.join('|');
  if (key === objectiveKey) return;
  objectiveKey = key;
  ui.objectiveIndex.textContent = data[0];
  ui.objective.textContent = data[1];
  ui.zone.textContent = data[2];
}
function syncStability() {
  const damaged = run.lightning && !run.repaired;
  const value = run.repaired ? 0.96 : damaged ? 0.42 : 0.86;
  ui.fill.style.width = `${value * 100}%`;
  ui.meter.classList.toggle('damaged', damaged);
  ui.stability.textContent = run.repaired ? 'SYNCHRONIZED' : damaged ? 'ASYMMETRIC' : 'STABLE';
}

const input = createInput({ canvas, joystick: ui.joystick, knob: ui.knob, actionButton: ui.action, onFirstGesture: () => audio.ensure() });
let yaw = 0, pitch = -0.12, smoothedYaw = 0, smoothedPitch = -0.12, face = 0, speed = 0;
let externalX = 0, externalZ = 0, phase = 0, previousCarrierVelocity = { x: 0, z: 0 };
let repair = run.repaired ? 1 : 0, repairTone = 0, transition = false, fractureTime = -1, bolt = null, finalTime = 0;
let camPos = new Vector3(0, 5, -9), camTarget = new Vector3(), camKick = new Vector3(), lastFoot = 0.5, distantFlash = 3.5 + Math.random() * 5;
let airborne = false, verticalVelocity = 0, falling = false, fallClock = 0, climbing = false, climbClock = 0, climbDuration = 0.92, climbTarget = null, climbStart = null;
let actionHold = 0, previousActionHeld = false, coyote = 0, landingClock = 0;
let checkpoint = { carrier: run.carrier, x: run.localX, z: run.localZ };

async function fade(fn) {
  if (transition) return;
  transition = true;
  ui.fade.classList.add('on');
  await new Promise((resolve) => setTimeout(resolve, reduced ? 10 : 240));
  fn();
  await new Promise((resolve) => setTimeout(resolve, reduced ? 10 : 60));
  ui.fade.classList.remove('on');
  transition = false;
}
function setCheckpoint() { checkpoint = { carrier: run.carrier, x: run.localX, z: run.localZ }; }
function moveCarrier(name, x, z, message) {
  void fade(() => {
    run.carrier = name;
    attach(name, x, z);
    previousCarrierVelocity = { x: 0, z: 0 };
    externalX = externalZ = 0;
    airborne = falling = climbing = false;
    verticalVelocity = 0;
    coyote = 0;
    setCheckpoint();
    visibility();
    syncObjective();
    caption(message);
    persist();
  });
}
function beginClimb(target, message) {
  if (climbing || falling || transition) return;
  climbing = true;
  airborne = false;
  verticalVelocity = 0;
  climbClock = 0;
  climbStart = { carrier: run.carrier, x: player.position.x, y: player.position.y, z: player.position.z };
  climbTarget = { ...target, message };
  playPlayer('Grab', false, 1);
  setTimeout(() => { if (climbing) playPlayer('Climb', true, 0.95); }, 150);
  caption(message, 1350);
  pulse(18);
}
function finishClimb() {
  if (!climbTarget) return;
  const target = climbTarget;
  climbing = false;
  climbTarget = null;
  climbStart = null;
  if (target.carrier !== run.carrier) moveCarrier(target.carrier, target.x, target.z, target.arrive || 'CLIMB COMPLETE');
  else {
    attach(run.carrier, target.x, target.z);
    setCheckpoint();
    persist();
  }
}
function startJump() {
  if (airborne || falling || climbing || transition) return;
  airborne = true;
  verticalVelocity = 4.85;
  coyote = 0;
  playPlayer('Jump', false, 1.05);
  audio.step(0.95);
  pulse(12);
}
function startFall(message = 'СОРВАЛСЯ // ПОСЛЕДНЯЯ ОПОРА') {
  if (falling || climbing || transition) return;
  falling = true;
  airborne = false;
  fallClock = 0;
  verticalVelocity = Math.min(verticalVelocity, -1.2);
  speed *= 0.35;
  playPlayer('Fall', true, 1);
  caption(message, 1050);
  pulse([18, 25, 38]);
}
function lightning() {
  if (run.lightning) return;
  run.lightning = true;
  fractureTime = 0;
  fracture?.setEnabled(false);
  shards.forEach((shard) => shard.setEnabled(true));
  playGroup(intGroups, 'Fail', true, 0.75);
  audio.lightning();
  pulse([45, 35, 90]);
  caption('IMPACT // БИРЮЗОВЫЙ МАЯК АКТИВЕН', 2600);
  flash.intensity = 16;
  camKick.set(0.12, 0.20, -0.1);
  const hit = back.getAbsolutePosition().add(new Vector3(-3, 2, run.localZ + 1));
  const points = [hit.add(new Vector3(0, 32, 0))];
  for (let i = 1; i < 8; i += 1) {
    const t = i / 8;
    points.push(new Vector3(hit.x + (Math.random() - 0.5) * 1.3, hit.y + 32 * (1 - t), hit.z + (Math.random() - 0.5) * 1.2));
  }
  points.push(hit);
  bolt = MeshBuilder.CreateLines('bolt', { points }, scene);
  bolt.color = new Color3(0.78, 0.92, 1);
  setTimeout(() => { flash.intensity = 0; bolt?.setEnabled(false); }, 220);
  persist();
}
function repairDone() {
  if (run.repaired) return;
  run.repaired = true;
  repair = 1;
  audio.setRepaired(true);
  audio.repairComplete();
  playGroup(intGroups, 'Recovered', true, 0.72);
  caption('STABILIZER // SYNCHRONIZED', 2600);
  pulse([25, 20, 25, 20, 70]);
  visibility();
  syncObjective();
  persist();
}
function finale() {
  if (run.finale) return;
  run.finale = true;
  run.completedRuns += 1;
  audio.finale();
  caption('STORM BREAK // VISUAL CONTACT', 3000);
  const silhouette = mat('farColossus', new Color3(0.035, 0.050, 0.048));
  [[-58, 150, 1], [22, 178, 0.8], [72, 205, 1.15]].forEach(([x, z, scale], index) => {
    const root = new TransformNode(`far${index}`, scene);
    root.parent = world;
    root.position.set(x, -24, z);
    root.scaling.setAll(scale);
    const body = MeshBuilder.CreateCylinder(`farB${index}`, { height: 45, diameterTop: 9, diameterBottom: 13, tessellation: 8 }, scene);
    body.parent = root; body.position.y = 24; body.material = silhouette;
    const shoulders = MeshBuilder.CreateBox(`farS${index}`, { width: 28, height: 5, depth: 7 }, scene);
    shoulders.parent = root; shoulders.position.y = 40; shoulders.material = silhouette;
  });
  persist();
}

function motionUpdate(dt) {
  const damaged = run.lightning && !run.repaired ? 1 : 0;
  const rate = run.repaired ? 0.115 : 0.14;
  phase += dt * rate;
  const s = Math.sin(phase * Math.PI * 2);
  const c = Math.cos(phase * Math.PI * 2);
  const d = Math.sin(phase * Math.PI * 4);
  const dc = Math.cos(phase * Math.PI * 4);
  const kick = damaged * Math.max(0, Math.sin(phase * Math.PI * 2 + 0.55));
  motion.position.y = Math.abs(s) * (0.11 + damaged * 0.065);
  motion.rotation.z = s * (0.010 + damaged * 0.016);
  pelvis.rotation.set(d * (0.010 + damaged * 0.014), 0, s * (0.015 + damaged * 0.021));
  chest.rotation.set(-d * (0.012 + damaged * 0.014), 0, -s * (0.017 + damaged * 0.025) - kick * 0.014);
  back.rotation.x = Math.sin(phase * Math.PI * 2 + 0.5) * (0.010 + damaged * 0.014);
  shoulder.rotation.set(Math.sin(phase * Math.PI * 2 + 1.2) * (0.025 + damaged * 0.040), 0, s * (0.018 + damaged * 0.032));
  head.rotation.z = -s * (0.011 + damaged * 0.016);
  inside.rotation.x = d * (0.006 + damaged * 0.009);

  const gaitVelocity = {
    x: (c * (0.20 + damaged * 0.22) + dc * 0.07) * (run.carrier === 'shoulder' ? 1.35 : 1),
    z: (dc * (0.16 + damaged * 0.17) - c * 0.05) * (run.carrier === 'head' ? 1.15 : 1)
  };
  const impulse = carrierImpulse(previousCarrierVelocity, gaitVelocity, dt, false);
  previousCarrierVelocity = gaitVelocity;
  if (!airborne && !falling && !climbing && impulse.magnitude > 0.6) {
    externalX += impulse.x * 0.020;
    externalZ += impulse.z * 0.020;
  }

  const previousPhase = phase - dt * rate;
  if (Math.floor(phase * 2) !== Math.floor(previousPhase * 2)) {
    audio.colossusStep(damaged);
    camKick.y += damaged ? 0.038 : 0.023;
    if (damaged && Math.random() > 0.55) audio.creak();
  }
  clouds.forEach((cloud, index) => {
    cloud.position.x -= dt * (0.22 + index * 0.09) * (run.repaired ? 0.5 : 1);
    if (cloud.position.x < -105) cloud.position.x += 210;
  });
  secondary.forEach((mesh, index) => {
    mesh.rotation.z = damp(mesh.rotation.z, Math.sin(phase * 5.2 + index * 0.83) * (0.012 + damaged * 0.024), 2.5, dt);
    mesh.rotation.x = damp(mesh.rotation.x, Math.sin(phase * 3.8 + index) * (0.010 + damaged * 0.014), 2.5, dt);
  });
  scarf.forEach((mesh, index) => {
    mesh.rotation.x = damp(mesh.rotation.x, 0.08 + Math.sin(phase * 6 + index) * 0.055, 3.4, dt);
    mesh.rotation.z = damp(mesh.rotation.z, Math.sin(phase * 4.8 + index) * 0.065, 3.1, dt);
  });
  const pulseValue = 0.65 + 0.35 * Math.sin(phase * Math.PI * 4);
  const active = run.lightning && run.carrier === 'back';
  if (beacons.shoulder) {
    beacons.shoulder.visibility = active ? 1 : 0.16;
    beacons.shoulder.scaling.setAll(1 + pulseValue * 0.05);
  }
  if (beacons.shoulderPad) beacons.shoulderPad.visibility = active ? 0.95 : 0.12;
  if (beacons.shoulderLight) beacons.shoulderLight.intensity = active ? 1.9 + pulseValue * 0.9 : 0.08;
}

function fractureUpdate(dt) {
  if (fractureTime < 0) return;
  fractureTime += dt;
  shards.forEach((shard, index) => {
    if (!shard.isEnabled()) return;
    const t = Math.max(0, fractureTime - index * 0.07);
    if (t > 0.18) {
      shard.position.x -= dt * (0.4 + index * 0.06);
      shard.position.y -= dt * (0.8 + t * 1.5);
      shard.rotation.x += dt * (0.8 + index * 0.16);
      shard.rotation.z -= dt * (0.6 + index * 0.12);
    }
    if (t > 4) shard.setEnabled(false);
  });
  if (fractureTime > 5) fractureTime = -1;
}

function currentAnchor() {
  return climbAnchor({ carrier: run.carrier, lightning: run.lightning, repaired: run.repaired, x: run.localX, z: run.localZ });
}
function actionContext() {
  if (falling) return { label: 'FALL', hint: '...', glyph: '↓', type: 'fall' };
  if (climbing) return { label: 'CLIMB', hint: 'держись', glyph: '↑', type: 'climbing', hot: true };
  if (run.carrier === 'interior' && !run.repaired && run.localZ > 8.45 && Math.abs(run.localX) < 3.25) return { label: 'SYNC', hint: 'удерживать', glyph: '↻', type: 'repair', hot: true };
  const anchor = currentAnchor();
  if (anchor?.type === 'shoulder') return { label: 'CLIMB', hint: 'удерживать', glyph: '↑', type: 'shoulder', hot: true, anchor };
  if (anchor?.type === 'hatch') return { label: 'ENTER', hint: 'удерживать', glyph: '↥', type: 'hatch', hot: true, anchor };
  if (anchor?.type === 'head') return { label: 'CLIMB', hint: 'удерживать', glyph: '↑', type: 'head', hot: true, anchor };
  return { label: 'JUMP', hint: 'нажать · у уступа удерживать', glyph: '↑', type: 'jump', hot: false };
}
function actionUI(context, held) {
  ui.actionLabel.textContent = context.label;
  ui.actionHint.textContent = context.hint;
  ui.actionGlyph.textContent = context.glyph;
  const progress = context.type === 'repair' ? repair : ['shoulder', 'hatch', 'head'].includes(context.type) ? clamp(actionHold / 0.42, 0, 1) : 0;
  ui.action.style.setProperty('--progress', progress);
  ui.action.classList.toggle('hot', context.hot || held);
}
function scenario(context, sample, dt) {
  if (run.carrier === 'back' && !run.lightning && run.localZ > -2.2) lightning();
  if (sample.actionHeld) actionHold += dt;
  const released = previousActionHeld && !sample.actionHeld;
  previousActionHeld = sample.actionHeld;

  if (context.type === 'jump' && sample.actionPressed) startJump();
  if (['shoulder', 'hatch', 'head'].includes(context.type)) {
    if (sample.actionHeld && actionHold > 0.42) {
      const anchor = context.anchor;
      actionHold = 0;
      if (context.type === 'shoulder') beginClimb({ ...anchor.target, arrive: 'SCAPULAR JOINT // ОПОРА НАЙДЕНА' }, 'ЗАХВАТ ШАРНИРА // ПОДЪЁМ');
      if (context.type === 'hatch') {
        if (hatch) hatch.rotation.x += 0.9;
        beginClimb({ ...anchor.target, arrive: 'INTERNAL PRESSURE // AUDIO OCCLUDED' }, 'СПУСК В СЕРВИСНЫЙ ЛЮК');
      }
      if (context.type === 'head') beginClimb({ ...anchor.target, arrive: 'CRANIAL DECK // WIND LOAD EXTREME' }, 'ПОДЪЁМ ПО ШЕЙНОМУ КАНАЛУ');
    } else if (released && actionHold > 0.03 && actionHold < 0.42) {
      actionHold = 0;
      startJump();
    }
  } else if (context.type === 'repair' && sample.actionHeld) {
    repair = clamp(repair + dt / 3.0, 0, 1);
    repairTone -= dt;
    if (repairTone <= 0) { repairTone = 0.18; audio.repairPulse(repair); }
    if (repair >= 1) repairDone();
  } else if (!run.repaired) {
    repair = Math.max(0, repair - dt * 0.04);
  }
  if (!sample.actionHeld && !released) actionHold = 0;
  const flags = scenarioFlags({ carrier: run.carrier, lightning: run.lightning, repaired: run.repaired, localZ: run.localZ });
  if (flags.finaleReady) finale();
}

function specialMovement(dt) {
  if (climbing) {
    climbClock += dt;
    const p = clamp(climbClock / climbDuration, 0, 1);
    const ease = p * p * (3 - 2 * p);
    playerVisual.position.y = Math.sin(p * Math.PI) * 0.24;
    if (climbTarget?.carrier === run.carrier && climbStart) {
      const target = routePoint(run.carrier, climbTarget.x, climbTarget.z);
      player.position.x = climbStart.x + (target.x - climbStart.x) * ease;
      player.position.z = climbStart.z + (target.z - climbStart.z) * ease;
      player.position.y = climbStart.y + (target.y + 0.85 - climbStart.y) * ease - Math.sin(p * Math.PI) * 0.2;
    }
    if (p >= 1) {
      playerVisual.position.y = 0;
      finishClimb();
    }
    return true;
  }
  if (falling) {
    fallClock += dt;
    verticalVelocity -= 9.8 * dt;
    player.position.y += verticalVelocity * dt;
    playerVisual.rotation.x += dt * 0.95;
    if (fallClock > 1.05) {
      falling = false;
      playerVisual.rotation.x = 0;
      run.carrier = checkpoint.carrier;
      attach(checkpoint.carrier, checkpoint.x, checkpoint.z);
      playPlayer('Land', false, 1);
      caption('ПОСЛЕДНЯЯ ОПОРА', 800);
      persist();
    }
    return true;
  }
  return false;
}

function playerUpdate(dt, time, sample) {
  yaw -= sample.lookX * 0.0042;
  pitch = clamp(pitch - sample.lookY * 0.0035, -0.52, 0.34);
  if (specialMovement(dt)) return { moving: false, sprint: false, context: actionContext() };

  const moveLength = Math.hypot(sample.moveX, sample.moveY);
  const sprint = sample.sprint && moveLength > 0.45;
  speed = damp(speed, moveLength * (sprint ? 3.2 : 2.05), sprint ? 6.2 : 8.0, dt);
  let dx = Math.cos(yaw) * sample.moveX + Math.sin(yaw) * sample.moveY;
  let dz = -Math.sin(yaw) * sample.moveX + Math.cos(yaw) * sample.moveY;
  const directionLength = Math.hypot(dx, dz);
  if (directionLength) { dx /= directionLength; dz /= directionLength; }

  externalX = damp(externalX, 0, airborne ? 1.2 : 2.8, dt);
  externalZ = damp(externalZ, 0, airborne ? 1.2 : 2.8, dt);
  const control = airborne ? 0.66 : 1;
  const nextX = player.position.x + (dx * speed * control + externalX) * dt;
  const nextZ = player.position.z + (dz * speed * control + externalZ) * dt;
  const route = ROUTES[run.carrier];
  const point = routePoint(run.carrier, nextX, nextZ);
  const inBounds = nextZ >= route.minZ - 0.6 && nextZ <= route.maxZ + 0.6 && Math.abs(nextX) <= point.width + 0.6;
  const supported = inBounds && hasSupport(run.carrier, nextX, nextZ, airborne ? 0.06 : 0.10);

  player.position.x = nextX;
  player.position.z = nextZ;
  run.localX = clamp(nextX, -point.width, point.width);
  run.localZ = clamp(nextZ, route.minZ, route.maxZ);

  if (!airborne && !supported) {
    coyote += dt;
    if (coyote > 0.055) {
      airborne = true;
      verticalVelocity = Math.min(verticalVelocity, -0.25);
      playPlayer('Fall', true, 1);
    }
  } else if (!airborne) {
    coyote = 0;
    player.position.y = point.y;
  }

  if (airborne) {
    verticalVelocity -= 10.6 * dt;
    player.position.y += verticalVelocity * dt;
    if (supported && verticalVelocity <= 0 && player.position.y <= point.y + 0.02) {
      player.position.y = point.y;
      airborne = false;
      verticalVelocity = 0;
      coyote = 0;
      landingClock = 0.18;
      playPlayer('Land', false, 1.12);
      audio.step(1.05);
      pulse(16);
    } else if (!inBounds || player.position.y < point.y - 1.15) {
      startFall();
      return { moving: false, sprint: false, context: actionContext() };
    } else {
      playPlayer(verticalVelocity > 0.25 ? 'Jump' : 'Fall', true, 1);
    }
  }

  if (moveLength > 0.12) {
    face = dampAngle(face, Math.atan2(dx, dz), 10, dt);
    playerVisual.rotation.y = face;
  }
  const carrierPitch = back.rotation.x + chest.rotation.x + (run.carrier === 'interior' ? inside.rotation.x : 0);
  const carrierRoll = motion.rotation.z + chest.rotation.z + (run.carrier === 'shoulder' ? shoulder.rotation.z : 0) + (run.carrier === 'head' ? head.rotation.z : 0);
  const targetLeanX = clamp(-carrierPitch * 1.15 - externalZ * 0.045 + (airborne ? -0.10 : 0), -0.30, 0.27);
  const targetLeanZ = clamp(-carrierRoll * 1.08 - externalX * 0.050, -0.30, 0.30);
  playerVisual.rotation.x = damp(playerVisual.rotation.x, targetLeanX, 7, dt);
  playerVisual.rotation.z = damp(playerVisual.rotation.z, targetLeanZ, 7, dt);
  if (!airborne && !falling && !climbing) {
    playerVisual.position.y = damp(playerVisual.position.y, Math.sin(phase * Math.PI * 4) * 0.022, 6, dt);
    if (landingClock > 0) landingClock -= dt;
    else if (moveLength > 0.12) playPlayer(sprint ? 'Run' : 'Walk', true, sprint ? 1.0 : 0.86);
    else playPlayer('Idle', true, 0.8);
  }
  if (speed > 0.45 && !airborne) {
    const footPhase = (time * (sprint ? 2.2 : 1.45)) % 1;
    if (footPhase < lastFoot) audio.step(sprint ? 1 : 0.7);
    lastFoot = footPhase;
  }

  const stablePad = supported && !airborne && !falling && !climbing;
  if (stablePad) {
    const checkpointZones = run.carrier === 'back'
      ? [[-10.7, -9.5], [-5.1, -4.2], [1.9, 2.8], [6.1, 7.0]]
      : run.carrier === 'shoulder' ? [[-6.7, -5.6], [-1.2, 0.5], [4.8, 5.4]]
        : run.carrier === 'interior' ? [[-10.7, -9.4], [-1.0, 0.7], [8.8, 9.4]]
          : [[-7.0, -5.8], [-1.0, 0.7], [5.6, 6.4]];
    if (checkpointZones.some(([a, b]) => run.localZ >= a && run.localZ <= b)) setCheckpoint();
  }
  return { moving: moveLength > 0.12, sprint, context: actionContext(), supported };
}

function cameraUpdate(dt) {
  player.computeWorldMatrix(true);
  const position = player.getAbsolutePosition();
  const interiorZone = run.carrier === 'interior';
  const distance = interiorZone ? 5.0 : run.carrier === 'head' ? 8.0 : 7.6;
  const height = interiorZone ? 2.65 : 3.75;
  smoothedYaw = dampAngle(smoothedYaw, yaw, 9, dt);
  smoothedPitch = damp(smoothedPitch, pitch, 9, dt);
  const cp = Math.cos(smoothedPitch);
  const offset = new Vector3(-Math.sin(smoothedYaw) * cp * distance, height - Math.sin(smoothedPitch) * distance * 0.45, -Math.cos(smoothedYaw) * cp * distance);
  camKick.x = damp(camKick.x, 0, 4, dt);
  camKick.y = damp(camKick.y, 0, 4.8, dt);
  camKick.z = damp(camKick.z, 0, 4, dt);
  offset.addInPlace(camKick);
  const target = position.add(new Vector3(0, 1.0, 0));
  const desired = target.add(offset);
  camTarget.set(damp(camTarget.x, target.x, 10, dt), damp(camTarget.y, target.y, 9, dt), damp(camTarget.z, target.z, 10, dt));
  camPos.set(damp(camPos.x, desired.x, interiorZone ? 9 : 6.5, dt), damp(camPos.y, desired.y, interiorZone ? 9 : 6, dt), damp(camPos.z, desired.z, interiorZone ? 9 : 6.5, dt));
  camera.position.copyFrom(camPos);
  camera.setTarget(camTarget);
  rainPos.copyFrom(position).addInPlace(new Vector3(4, 12, 0));
}

function updateObjectiveMarker() {
  const active = run.lightning && run.carrier === 'back' && beacons.shoulder?.isEnabled();
  if (!active) { marker.style.display = 'none'; return; }
  beacons.shoulder.computeWorldMatrix(true);
  const worldPos = beacons.shoulder.getAbsolutePosition();
  const projected = Vector3.Project(worldPos, Matrix.Identity(), scene.getTransformMatrix(), new Viewport(0, 0, innerWidth, innerHeight));
  const margin = 74;
  const x = clamp(projected.x, margin, innerWidth - margin);
  const y = clamp(projected.y, 84, innerHeight - 92);
  marker.style.display = 'block';
  marker.style.left = `${x}px`;
  marker.style.top = `${y}px`;
  marker.style.opacity = projected.z > 0 && projected.z < 1 ? '1' : '0.72';
}

function stormUpdate(dt) {
  audio.setWind(run.carrier === 'interior' ? 0.10 : run.repaired ? 0.45 : 0.82);
  if (run.carrier !== 'interior' && !run.finale) {
    distantFlash -= dt;
    if (distantFlash <= 0) {
      distantFlash = 5 + Math.random() * 9;
      flash.intensity = 2.4 + Math.random() * 2.5;
      setTimeout(() => { if (!run.finale) flash.intensity = 0; }, 70 + Math.random() * 90);
    }
  }
  if (run.finale) {
    scene.fogDensity = damp(scene.fogDensity, 0.002, 0.3, dt);
    scene.fogColor.r = damp(scene.fogColor.r, 0.30, 0.2, dt);
    scene.fogColor.g = damp(scene.fogColor.g, 0.36, 0.2, dt);
    scene.fogColor.b = damp(scene.fogColor.b, 0.37, 0.2, dt);
    hemi.intensity = damp(hemi.intensity, 0.82, 0.2, dt);
    sun.intensity = damp(sun.intensity, 1.9, 0.2, dt);
    clouds.forEach((cloud, index) => { cloud.position.y += dt * (0.4 + index * 0.10); });
  }
}

const testState = {
  ready: false,
  version: '1.3.0',
  traversalVersion: TRAVERSAL_VERSION,
  carrier: run.carrier,
  lightning: run.lightning,
  repaired: run.repaired,
  airborne: false,
  falling: false,
  climbing: false,
  supported: true,
  localX: run.localX,
  localZ: run.localZ,
  action: 'JUMP',
  objective: '',
  fps: 0
};
globalThis.__PW_TEST_STATE__ = testState;
function updateTestState(context, supported) {
  testState.ready = true;
  testState.carrier = run.carrier;
  testState.lightning = run.lightning;
  testState.repaired = run.repaired;
  testState.airborne = airborne;
  testState.falling = falling;
  testState.climbing = climbing;
  testState.supported = supported;
  testState.localX = +run.localX.toFixed(2);
  testState.localZ = +run.localZ.toFixed(2);
  testState.action = context?.type || 'unknown';
  testState.objective = objective()[1];
  testState.fps = Math.round(engine.getFps());
}

let last = performance.now();
let saveClock = 0;
function tick(now) {
  const dt = Math.min(0.05, Math.max(1 / 240, (now - last) / 1000));
  const time = now / 1000;
  last = now;
  motionUpdate(dt);
  const sample = input.sample();
  let result = { context: actionContext(), supported: hasSupport(run.carrier, run.localX, run.localZ) };
  if (!transition && !run.finale) {
    result = playerUpdate(dt, time, sample);
    const context = actionContext();
    scenario(context, sample, dt);
    actionUI(context, sample.actionHeld);
    result.context = context;
  }
  fractureUpdate(dt);
  cameraUpdate(dt);
  updateObjectiveMarker();
  stormUpdate(dt);
  syncObjective();
  syncStability();
  updateTestState(result.context, result.supported);
  if (run.finale) {
    finalTime += dt;
    if (finalTime > 4) ui.finish.hidden = false;
  }
  saveClock += dt;
  if (saveClock > 4) { saveClock = 0; persist(); }
  scene.render();
  requestAnimationFrame(tick);
}

async function boot() {
  try {
    await assets();
    fracture?.setEnabled(!run.lightning);
    shards.forEach((shard) => shard.setEnabled(false));
    if (run.repaired) { audio.setRepaired(true); repair = 1; }
    visibility();
    attach(run.carrier, run.localX, run.localZ);
    setCheckpoint();
    playPlayer('Idle');
    syncObjective();
    syncStability();
    persist();
    await new Promise((resolve) => setTimeout(resolve, reduced ? 10 : 220));
    ui.loading.classList.add('out');
    setTimeout(() => { ui.loading.hidden = true; }, reduced ? 20 : 650);
    document.body.classList.add('ready');
    caption(stored.physicsVersion === TRAVERSAL_VERSION ? 'RUN RESTORED // CONTACT PHYSICS ONLINE' : 'CONTACT PHYSICS // REAL GAPS ONLINE', 1800);
    testState.ready = true;
    requestAnimationFrame((now) => { last = now; requestAnimationFrame(tick); });
  } catch (error) {
    console.error(error);
    ui.loading.hidden = true;
    ui.error.hidden = false;
    ui.errorText.textContent = error instanceof Error ? error.message : String(error);
  }
}

addEventListener('resize', () => engine.resize());
addEventListener('orientationchange', () => setTimeout(() => engine.resize(), 160));
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
void boot();
