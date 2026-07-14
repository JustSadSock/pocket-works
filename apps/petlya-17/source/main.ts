import '../../../shared/mobile-runtime.css';
import '../../../shared/workshop-mode.css';
import './styles.css';

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';

import { installMobileRuntime } from '../../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../../shared/workshop-mode.js';
import { registerEnhancedUpdate } from '../../../shared/enhanced-update-manager';
import { createVersionedStore } from '../../../shared/capabilities/storage.js';
import { lockOrientation, unlockOrientation, watchOrientation } from '../../../shared/capabilities/device.js';
import { catmullRomClosed, clamp, lerp, signedWrappedDelta, speedFeel, wrap, type Vec3Tuple } from './core';

const VERSION = '3.0.0';
const APP_NAME = 'ПЕТЛЯ 17';
const NS = 'pocket-works:petlya-17';
const LAPS = 3;
const MAX_SPEED = 322;
const ROAD_HALF = 5.9;
const PATH_SEGMENTS = 900;
const UP = Vector3.Up();

installMobileRuntime();
registerEnhancedUpdate({
  appName: APP_NAME,
  version: VERSION,
  releaseNotes: [
    'Старый псевдо-3D Canvas-рендер полностью удалён и заменён настоящей Babylon.js-сценой с перспективной камерой внутри кокпита.',
    'Трасса теперь является объёмной замкнутой геометрией с высотами, виражами, кербами, ограждениями, портовыми конструкциями и реальным ближним параллаксом.',
    'Пять соперников получили полноценные 3D-болиды, тени, разные траектории, борьбу за позицию и корректную относительную скорость при обгонах.',
    'Кокпит, руль, halo, зеркала, нос машины, свет, туман, частицы, динамический FOV и процедурный звук работают в одной трёхмерной системе координат.',
    'Приложение переведено на Enhanced runtime с TypeScript, Vite, Workbox, офлайн-сборкой и автоматическим снижением качества при падении FPS.'
  ]
});

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const canvas = $('#renderCanvas') as HTMLCanvasElement;
const loading = $('#loading');
const loadingBar = $('#loadingBar');
const loadingText = $('#loadingText');
const menu = $('#menu');
const settingsScreen = $('#settings');
const pauseScreen = $('#pause');
const resultsScreen = $('#results');
const hud = $('#hud');
const controls = $('#controls');
const speedPanel = $('#speedPanel');
const steerPad = $('#steerPad');
const message = $('#message');
const draftBadge = $('#draft');
const gasButton = $('#gas') as HTMLButtonElement;
const brakeButton = $('#brake') as HTMLButtonElement;

const store = createVersionedStore({
  namespace: NS,
  version: 2,
  defaults: {
    settings: { sensitivity: 21, sound: true, haptics: true, quality: 'auto' },
    records: { bestFinish: null, bestLapMs: null }
  }
});
const saved = store.getAll();
const settings = {
  sensitivity: clamp(Number(saved.settings?.sensitivity) || 21, 10, 35),
  sound: saved.settings?.sound !== false,
  haptics: saved.settings?.haptics !== false,
  quality: saved.settings?.quality === 'high' ? 'high' : 'auto'
};
let records = {
  bestFinish: Number.isFinite(saved.records?.bestFinish) ? Number(saved.records.bestFinish) : null as number | null,
  bestLapMs: Number.isFinite(saved.records?.bestLapMs) ? Number(saved.records.bestLapMs) : null as number | null
};

type Mode = 'loading' | 'menu' | 'countdown' | 'racing' | 'paused' | 'finished' | 'settings';
let mode: Mode = 'loading';
let settingsReturn: 'menu' | 'pause' = 'menu';
let countdown = 0;
let countdownMark = 4;
let raceTimeMs = 0;
let lapStartMs = 0;
let bestLapMs = Infinity;
let passes = 0;
let previousPosition = 6;
let throttle = false;
let braking = false;
let steerTarget = 0;
let steer = 0;
let sensorStop: null | (() => void) = null;
let sensorBaseline: number | null = null;
let sensorActive = false;
let collisionCooldown = 0;
let cameraImpact = 0;
let lastGear = 1;
let frameCounter = 0;
let fpsAccumulator = 0;
let fpsTimer = 0;
let hapticTimer = 0;

const player = {
  totalDistance: 0,
  speed: 0,
  lane: 0,
  laneVelocity: 0,
  lap: 1,
  acceleration: 0,
  drafting: 0
};

const controlPoints: readonly Vec3Tuple[] = [
  [-155, 2, -58], [-104, 0, -143], [-12, 1, -178], [86, 3, -151],
  [164, 1, -87], [188, 6, 8], [151, 2, 101], [67, 0, 157],
  [-22, 5, 168], [-111, 1, 132], [-176, -1, 61], [-194, 4, -22]
];

type TrackSample = {
  position: Vector3;
  tangent: Vector3;
  right: Vector3;
  distance: number;
  u: number;
};

const pathSamples: TrackSample[] = [];
let trackLength = 1;

function rawPoint(u: number): Vector3 {
  const [x, y, z] = catmullRomClosed(controlPoints, u);
  return new Vector3(x, y, z);
}

function rebuildPathSamples(): void {
  pathSamples.length = 0;
  let cumulative = 0;
  let previous = rawPoint(0);
  for (let i = 0; i <= PATH_SEGMENTS; i += 1) {
    const u = i / PATH_SEGMENTS;
    const position = rawPoint(u);
    if (i > 0) cumulative += Vector3.Distance(previous, position);
    const before = rawPoint(u - 1 / PATH_SEGMENTS);
    const after = rawPoint(u + 1 / PATH_SEGMENTS);
    const tangent = after.subtract(before).normalize();
    const right = new Vector3(tangent.z, 0, -tangent.x).normalize();
    pathSamples.push({ position, tangent, right, distance: cumulative, u });
    previous = position;
  }
  trackLength = cumulative;
}

function sampleTrack(distance: number): TrackSample {
  const wrapped = wrap(distance, trackLength);
  let low = 0;
  let high = pathSamples.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (pathSamples[mid].distance <= wrapped) low = mid;
    else high = mid;
  }
  const a = pathSamples[low];
  const b = pathSamples[Math.min(low + 1, pathSamples.length - 1)];
  const span = Math.max(0.0001, b.distance - a.distance);
  const amount = clamp((wrapped - a.distance) / span, 0, 1);
  return {
    position: Vector3.Lerp(a.position, b.position, amount),
    tangent: Vector3.Lerp(a.tangent, b.tangent, amount).normalize(),
    right: Vector3.Lerp(a.right, b.right, amount).normalize(),
    distance: wrapped,
    u: lerp(a.u, b.u, amount)
  };
}

function yawFromTangent(tangent: Vector3): number {
  return Math.atan2(tangent.x, tangent.z);
}

function formatTime(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return '—';
  const value = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor(value % 60000 / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`;
}

function showScreen(target: HTMLElement | null): void {
  for (const screen of [loading, menu, settingsScreen, pauseScreen, resultsScreen]) screen.classList.add('hidden');
  target?.classList.remove('hidden');
}

function say(text: string, duration = 900): void {
  message.textContent = text;
  window.clearTimeout((say as unknown as { timer?: number }).timer);
  if (duration > 0) {
    (say as unknown as { timer?: number }).timer = window.setTimeout(() => { message.textContent = ''; }, duration);
  }
}

function haptic(pattern: number | number[]): void {
  if (settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

class RaceAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private tyreGain: GainNode | null = null;
  private engineLow: OscillatorNode | null = null;
  private engineHigh: OscillatorNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private tyreSource: AudioBufferSourceNode | null = null;

  async unlock(): Promise<void> {
    if (!settings.sound) return;
    if (!this.context) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.context.destination);

      this.engineGain = this.context.createGain();
      this.windGain = this.context.createGain();
      this.tyreGain = this.context.createGain();
      this.engineGain.connect(this.master);
      this.windGain.connect(this.master);
      this.tyreGain.connect(this.master);

      const engineFilter = this.context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 1300;
      engineFilter.connect(this.engineGain);

      this.engineLow = this.context.createOscillator();
      this.engineLow.type = 'sawtooth';
      this.engineLow.connect(engineFilter);
      this.engineLow.start();

      this.engineHigh = this.context.createOscillator();
      this.engineHigh.type = 'square';
      const highGain = this.context.createGain();
      highGain.gain.value = 0.07;
      this.engineHigh.connect(highGain).connect(engineFilter);
      this.engineHigh.start();

      const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

      this.windSource = this.context.createBufferSource();
      this.windSource.buffer = noiseBuffer;
      this.windSource.loop = true;
      const windFilter = this.context.createBiquadFilter();
      windFilter.type = 'highpass';
      windFilter.frequency.value = 900;
      this.windSource.connect(windFilter).connect(this.windGain);
      this.windSource.start();

      this.tyreSource = this.context.createBufferSource();
      this.tyreSource.buffer = noiseBuffer;
      this.tyreSource.loop = true;
      const tyreFilter = this.context.createBiquadFilter();
      tyreFilter.type = 'bandpass';
      tyreFilter.frequency.value = 310;
      tyreFilter.Q.value = 0.8;
      this.tyreSource.connect(tyreFilter).connect(this.tyreGain);
      this.tyreSource.start();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  update(speed: number, active: boolean, offroad: number, drafting: number): void {
    if (!this.context || !this.master || !this.engineGain || !this.windGain || !this.tyreGain || !this.engineLow || !this.engineHigh) return;
    const now = this.context.currentTime;
    const feel = speedFeel(speed, MAX_SPEED);
    const gear = clamp(Math.floor(speed / 50) + 1, 1, 6);
    const gearPhase = (speed % 50) / 50;
    const rpm = 58 + gearPhase * 210 + gear * 9;
    this.engineLow.frequency.setTargetAtTime(rpm, now, 0.035);
    this.engineHigh.frequency.setTargetAtTime(rpm * 2.02, now, 0.035);
    this.engineGain.gain.setTargetAtTime(active && settings.sound ? 0.035 + feel * 0.09 : 0.0001, now, 0.05);
    this.windGain.gain.setTargetAtTime(active && settings.sound ? feel * feel * (0.16 + drafting * 0.07) : 0.0001, now, 0.08);
    this.tyreGain.gain.setTargetAtTime(active && settings.sound ? 0.012 + feel * 0.025 + offroad * 0.08 : 0.0001, now, 0.08);
    this.master.gain.setTargetAtTime(active && settings.sound ? 0.76 : 0.0001, now, 0.06);
  }

  beep(frequency = 520, duration = 0.09, gainValue = 0.11): void {
    if (!this.context || !settings.sound) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }

  impact(strength = 1): void {
    if (!this.context || !settings.sound) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(95 + strength * 45, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(35, this.context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.18 * strength, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.2);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.22);
  }

  mute(): void {
    if (this.context && this.master) this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.03);
  }
}

const audio = new RaceAudio();

rebuildPathSamples();

const engine = new Engine(canvas, true, {
  antialias: true,
  preserveDrawingBuffer: false,
  stencil: true,
  powerPreference: 'high-performance',
  doNotHandleContextLost: false
}, true);
engine.setHardwareScalingLevel(settings.quality === 'high' ? 1 : Math.max(1, Math.min(1.45, window.devicePixelRatio / 2)));

const scene = new Scene(engine);
scene.clearColor = new Color4(0.08, 0.11, 0.1, 1);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.0045;
scene.fogColor = new Color3(0.43, 0.54, 0.53);
scene.imageProcessingConfiguration.contrast = 1.18;
scene.imageProcessingConfiguration.exposure = 1.02;

const camera = new UniversalCamera('cockpit-camera', new Vector3(0, 2, 0), scene);
camera.inputs.clear();
camera.minZ = 0.04;
camera.maxZ = 900;
camera.fov = 1.02;
scene.activeCamera = camera;

const skyLight = new HemisphericLight('sky-light', new Vector3(0.2, 1, 0.15), scene);
skyLight.intensity = 0.68;
skyLight.diffuse = new Color3(0.76, 0.84, 0.82);
skyLight.groundColor = new Color3(0.16, 0.14, 0.11);

const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.28), scene);
sun.position = new Vector3(120, 180, -120);
sun.intensity = 1.65;
sun.diffuse = new Color3(1, 0.87, 0.65);

const shadowGenerator = new ShadowGenerator(1024, sun);
shadowGenerator.useBlurExponentialShadowMap = true;
shadowGenerator.blurKernel = 20;
shadowGenerator.bias = 0.0008;
shadowGenerator.normalBias = 0.03;

function material(name: string, color: Color3, specular = 0.08): StandardMaterial {
  const value = new StandardMaterial(name, scene);
  value.diffuseColor = color;
  value.specularColor = new Color3(specular, specular, specular);
  return value;
}

const asphaltMaterial = new StandardMaterial('asphalt', scene);
const asphaltTexture = new DynamicTexture('asphalt-texture', { width: 512, height: 1024 }, scene, false);
const asphaltContext = asphaltTexture.getContext();
asphaltContext.fillStyle = '#222826';
asphaltContext.fillRect(0, 0, 512, 1024);
for (let i = 0; i < 5200; i += 1) {
  const shade = 28 + Math.floor(Math.random() * 30);
  asphaltContext.fillStyle = `rgba(${shade},${shade + 3},${shade + 1},${0.08 + Math.random() * 0.18})`;
  const x = Math.random() * 512;
  const y = Math.random() * 1024;
  asphaltContext.fillRect(x, y, 1 + Math.random() * 2.5, 1 + Math.random() * 5);
}
for (let x = 110; x < 512; x += 145) {
  asphaltContext.fillStyle = 'rgba(4,7,6,.18)';
  asphaltContext.fillRect(x, 0, 17, 1024);
}
asphaltTexture.update();
asphaltTexture.wrapU = Texture.WRAP_ADDRESSMODE;
asphaltTexture.wrapV = Texture.WRAP_ADDRESSMODE;
asphaltTexture.uScale = 1.8;
asphaltTexture.vScale = 34;
asphaltMaterial.diffuseTexture = asphaltTexture;
asphaltMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
asphaltMaterial.roughness = 0.92;

const curbMaterial = material('curb', new Color3(1, 1, 1), 0.05);
const barrierMaterial = material('barrier', new Color3(0.68, 0.67, 0.59), 0.14);
const lineMaterial = material('line', new Color3(0.93, 0.88, 0.73), 0.03);
lineMaterial.emissiveColor = new Color3(0.12, 0.11, 0.08);
const groundMaterial = material('ground', new Color3(0.12, 0.15, 0.13), 0.02);
const waterMaterial = material('water', new Color3(0.08, 0.23, 0.25), 0.34);
waterMaterial.alpha = 0.86;

function buildRibbonMesh(name: string, innerOffset: number, outerOffset: number, yOffset: number, mat: StandardMaterial, colors?: number[]): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertexColors: number[] = [];
  for (let i = 0; i < pathSamples.length; i += 1) {
    const sample = pathSamples[i];
    const inner = sample.position.add(sample.right.scale(innerOffset));
    const outer = sample.position.add(sample.right.scale(outerOffset));
    inner.y += yOffset;
    outer.y += yOffset;
    positions.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, sample.distance / 7, 1, sample.distance / 7);
    if (colors) {
      const base = colors[(Math.floor(sample.distance / 8) % (colors.length / 4)) * 4] ?? 1;
      const offset = (Math.floor(sample.distance / 8) % (colors.length / 4)) * 4;
      for (let j = 0; j < 2; j += 1) vertexColors.push(colors[offset], colors[offset + 1], colors[offset + 2], colors[offset + 3]);
    }
    if (i < pathSamples.length - 1) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  if (vertexColors.length) data.colors = vertexColors;
  data.applyToMesh(mesh);
  mesh.material = mat;
  mesh.receiveShadows = true;
  if (vertexColors.length) mesh.useVertexColors = true;
  return mesh;
}

function buildBarrier(name: string, side: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < pathSamples.length; i += 1) {
    const sample = pathSamples[i];
    const base = sample.position.add(sample.right.scale(side * (ROAD_HALF + 1.75)));
    const top = base.add(new Vector3(0, 1.25, 0));
    positions.push(base.x, base.y, base.z, top.x, top.y, top.z);
    const facing = sample.right.scale(-side);
    normals.push(facing.x, facing.y, facing.z, facing.x, facing.y, facing.z);
    uvs.push(sample.distance / 12, 0, sample.distance / 12, 1);
    if (i < pathSamples.length - 1) {
      const baseIndex = i * 2;
      if (side < 0) indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex + 1, baseIndex + 3, baseIndex + 2);
      else indices.push(baseIndex, baseIndex + 2, baseIndex + 1, baseIndex + 1, baseIndex + 2, baseIndex + 3);
    }
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.material = barrierMaterial;
  mesh.receiveShadows = true;
  return mesh;
}

function buildTrack(): void {
  buildRibbonMesh('road', -ROAD_HALF, ROAD_HALF, 0, asphaltMaterial);
  const curbColors = [0.88, 0.25, 0.11, 1, 0.94, 0.88, 0.72, 1];
  buildRibbonMesh('curb-left', -ROAD_HALF - 0.72, -ROAD_HALF, 0.025, curbMaterial, curbColors);
  buildRibbonMesh('curb-right', ROAD_HALF, ROAD_HALF + 0.72, 0.025, curbMaterial, curbColors);
  buildBarrier('barrier-left', -1);
  buildBarrier('barrier-right', 1);

  const dashSource = MeshBuilder.CreateBox('dash-source', { width: 0.12, height: 0.025, depth: 4.6 }, scene);
  dashSource.material = lineMaterial;
  dashSource.isVisible = false;
  for (let distance = 7; distance < trackLength; distance += 14) {
    const sample = sampleTrack(distance);
    const dash = dashSource.createInstance(`dash-${Math.floor(distance)}`);
    dash.position.copyFrom(sample.position.add(new Vector3(0, 0.04, 0)));
    dash.rotation.y = yawFromTangent(sample.tangent);
  }

  const ground = MeshBuilder.CreateGround('port-ground', { width: 620, height: 620, subdivisions: 1 }, scene);
  ground.position.y = -2.2;
  ground.material = groundMaterial;
  ground.receiveShadows = true;

  const water = MeshBuilder.CreateGround('dock-water', { width: 170, height: 520, subdivisions: 1 }, scene);
  water.position.set(245, -1.4, 0);
  water.rotation.y = Math.PI * 0.08;
  water.material = waterMaterial;
}

const containerMaterials = [
  material('container-rust', new Color3(0.46, 0.16, 0.08), 0.08),
  material('container-green', new Color3(0.08, 0.27, 0.23), 0.08),
  material('container-yellow', new Color3(0.55, 0.38, 0.08), 0.08),
  material('container-blue', new Color3(0.12, 0.27, 0.39), 0.08)
];

function buildPort(): void {
  const sources = containerMaterials.map((mat, index) => {
    const box = MeshBuilder.CreateBox(`container-source-${index}`, { width: 2.5, height: 2.35, depth: 6.1 }, scene);
    box.material = mat;
    box.isVisible = false;
    return box;
  });
  let propIndex = 0;
  for (let distance = 30; distance < trackLength; distance += 31) {
    const sample = sampleTrack(distance);
    const side = propIndex % 2 === 0 ? -1 : 1;
    const stackCount = propIndex % 5 === 0 ? 3 : propIndex % 3 === 0 ? 2 : 1;
    for (let stack = 0; stack < stackCount; stack += 1) {
      const source = sources[(propIndex + stack) % sources.length];
      const instance = source.createInstance(`container-${propIndex}-${stack}`);
      const lateral = ROAD_HALF + 5.2 + (propIndex % 4) * 1.1;
      instance.position.copyFrom(sample.position.add(sample.right.scale(side * lateral)));
      instance.position.y += 1.17 + stack * 2.38;
      instance.rotation.y = yawFromTangent(sample.tangent) + (side < 0 ? 0.03 : -0.03);
      instance.scaling.z = 0.9 + (propIndex % 3) * 0.12;
    }
    propIndex += 1;
  }

  const postMaterial = material('post', new Color3(0.11, 0.13, 0.12), 0.12);
  const lightMaterial = material('lamp', new Color3(0.78, 0.65, 0.25), 0.05);
  lightMaterial.emissiveColor = new Color3(0.45, 0.29, 0.06);
  for (let distance = 90; distance < trackLength; distance += 85) {
    const sample = sampleTrack(distance);
    const side = Math.floor(distance / 85) % 2 === 0 ? -1 : 1;
    const position = sample.position.add(sample.right.scale(side * (ROAD_HALF + 3.4)));
    const pole = MeshBuilder.CreateCylinder(`pole-${distance}`, { height: 8.5, diameter: 0.18, tessellation: 8 }, scene);
    pole.position.copyFrom(position.add(new Vector3(0, 4.25, 0)));
    pole.material = postMaterial;
    const lamp = MeshBuilder.CreateBox(`lamp-${distance}`, { width: 1.2, height: 0.16, depth: 0.38 }, scene);
    lamp.position.copyFrom(position.add(new Vector3(0, 8.5, 0)));
    lamp.rotation.y = yawFromTangent(sample.tangent);
    lamp.material = lightMaterial;
  }

  const gantryMaterial = material('gantry', new Color3(0.08, 0.1, 0.09), 0.18);
  const signMaterial = material('sign', new Color3(0.78, 0.24, 0.09), 0.08);
  signMaterial.emissiveColor = new Color3(0.12, 0.025, 0.008);
  for (let distance = 220; distance < trackLength; distance += 370) {
    const sample = sampleTrack(distance);
    const yaw = yawFromTangent(sample.tangent);
    const left = sample.position.add(sample.right.scale(-(ROAD_HALF + 1.4)));
    const right = sample.position.add(sample.right.scale(ROAD_HALF + 1.4));
    for (const position of [left, right]) {
      const leg = MeshBuilder.CreateBox(`gantry-leg-${distance}-${position.x}`, { width: 0.42, height: 6.2, depth: 0.42 }, scene);
      leg.position.copyFrom(position.add(new Vector3(0, 3.1, 0)));
      leg.rotation.y = yaw;
      leg.material = gantryMaterial;
    }
    const beam = MeshBuilder.CreateBox(`gantry-beam-${distance}`, { width: ROAD_HALF * 2 + 3.2, height: 0.42, depth: 0.45 }, scene);
    beam.position.copyFrom(sample.position.add(new Vector3(0, 6.2, 0)));
    beam.rotation.y = yaw;
    beam.material = gantryMaterial;
    const sign = MeshBuilder.CreateBox(`gantry-sign-${distance}`, { width: 4.8, height: 1.1, depth: 0.18 }, scene);
    sign.position.copyFrom(sample.position.add(new Vector3(0, 5.7, 0)));
    sign.rotation.y = yaw;
    sign.material = signMaterial;
  }
}

function addCaster(mesh: Mesh): void {
  shadowGenerator.addShadowCaster(mesh, true);
}

const cockpitMaterial = material('cockpit-carbon', new Color3(0.025, 0.035, 0.03), 0.22);
const cockpitEdgeMaterial = material('cockpit-edge', new Color3(0.23, 0.25, 0.22), 0.32);
const bodyMaterial = material('player-body', new Color3(0.86, 0.82, 0.69), 0.28);
const orangeMaterial = material('player-orange', new Color3(0.88, 0.24, 0.08), 0.2);
const mirrorMaterial = material('mirror-glass', new Color3(0.12, 0.23, 0.24), 0.7);
mirrorMaterial.emissiveColor = new Color3(0.025, 0.055, 0.055);

const cockpitRoot = new TransformNode('cockpit-root', scene);
cockpitRoot.parent = camera;
const wheelRoot = new TransformNode('wheel-root', scene);
wheelRoot.parent = cockpitRoot;

function cockpitBox(name: string, size: { width: number; height: number; depth: number }, position: Vector3, mat: StandardMaterial, parent: TransformNode = cockpitRoot): Mesh {
  const mesh = MeshBuilder.CreateBox(name, size, scene);
  mesh.parent = parent;
  mesh.position.copyFrom(position);
  mesh.material = mat;
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}

function buildCockpit(): void {
  cockpitBox('nose', { width: 1.15, height: 0.24, depth: 4.2 }, new Vector3(0, -1.08, 3.15), bodyMaterial);
  cockpitBox('nose-stripe', { width: 0.16, height: 0.255, depth: 4.22 }, new Vector3(0, -1.065, 3.15), orangeMaterial);
  cockpitBox('left-tub', { width: 1.8, height: 0.7, depth: 2.4 }, new Vector3(-1.35, -1.03, 1.8), cockpitMaterial);
  cockpitBox('right-tub', { width: 1.8, height: 0.7, depth: 2.4 }, new Vector3(1.35, -1.03, 1.8), cockpitMaterial);
  cockpitBox('dash', { width: 1.95, height: 0.48, depth: 0.55 }, new Vector3(0, -0.72, 1.18), cockpitMaterial);

  const haloBar = cockpitBox('halo-bar', { width: 0.17, height: 0.18, depth: 2.5 }, new Vector3(0, -0.23, 1.75), cockpitMaterial);
  haloBar.rotation.x = -0.04;
  const haloLeft = cockpitBox('halo-left', { width: 0.16, height: 0.16, depth: 2.15 }, new Vector3(-0.75, -0.28, 1.7), cockpitMaterial);
  haloLeft.rotation.y = -0.38;
  const haloRight = cockpitBox('halo-right', { width: 0.16, height: 0.16, depth: 2.15 }, new Vector3(0.75, -0.28, 1.7), cockpitMaterial);
  haloRight.rotation.y = 0.38;

  const wheel = MeshBuilder.CreateTorus('steering-wheel', { diameter: 1.05, thickness: 0.12, tessellation: 28 }, scene);
  wheel.parent = wheelRoot;
  wheel.position.set(0, -0.62, 0.92);
  wheel.rotation.x = Math.PI / 2;
  wheel.material = cockpitMaterial;
  cockpitBox('wheel-spoke-left', { width: 0.52, height: 0.12, depth: 0.12 }, new Vector3(-0.24, -0.62, 0.92), cockpitEdgeMaterial, wheelRoot);
  cockpitBox('wheel-spoke-right', { width: 0.52, height: 0.12, depth: 0.12 }, new Vector3(0.24, -0.62, 0.92), cockpitEdgeMaterial, wheelRoot);
  cockpitBox('wheel-hub', { width: 0.42, height: 0.24, depth: 0.15 }, new Vector3(0, -0.62, 0.92), cockpitEdgeMaterial, wheelRoot);

  for (const side of [-1, 1]) {
    const arm = cockpitBox(`mirror-arm-${side}`, { width: 0.55, height: 0.08, depth: 0.08 }, new Vector3(side * 1.18, -0.34, 1.18), cockpitMaterial);
    arm.rotation.z = side * 0.18;
    const mirror = cockpitBox(`mirror-${side}`, { width: 0.68, height: 0.28, depth: 0.12 }, new Vector3(side * 1.55, -0.28, 1.2), mirrorMaterial);
    mirror.rotation.y = side * -0.18;
  }
}

const streakMaterial = material('speed-streak', new Color3(0.78, 0.86, 0.8), 0);
streakMaterial.emissiveColor = new Color3(0.34, 0.43, 0.38);
streakMaterial.alpha = 0.28;
const speedStreaks: Mesh[] = [];

function buildSpeedStreaks(): void {
  for (let i = 0; i < 28; i += 1) {
    const streak = MeshBuilder.CreateBox(`streak-${i}`, { width: 0.014, height: 0.014, depth: 0.8 + Math.random() * 1.8 }, scene);
    streak.parent = camera;
    streak.material = streakMaterial;
    streak.isPickable = false;
    streak.alwaysSelectAsActiveMesh = true;
    streak.position.set((Math.random() < 0.5 ? -1 : 1) * (1.7 + Math.random() * 2.8), -1.2 + Math.random() * 3.1, 3 + Math.random() * 35);
    speedStreaks.push(streak);
  }
}

type Bot = {
  name: string;
  color: Color3;
  stripe: Color3;
  pace: number;
  aggression: number;
  totalDistance: number;
  speed: number;
  lane: number;
  targetLane: number;
  decisionAt: number;
  phase: number;
  root: TransformNode;
};

const botTemplates = [
  { name: 'ЯКОРЬ', color: new Color3(0.82, 0.61, 0.15), stripe: new Color3(0.04, 0.18, 0.15), pace: 0.94, aggression: 0.35, lane: -2.8 },
  { name: 'НОЖ', color: new Color3(0.78, 0.19, 0.08), stripe: new Color3(0.88, 0.82, 0.66), pace: 1.0, aggression: 0.9, lane: 1.2 },
  { name: 'ТЕНЬ', color: new Color3(0.08, 0.27, 0.23), stripe: new Color3(0.78, 0.75, 0.65), pace: 0.97, aggression: 0.22, lane: -0.5 },
  { name: 'ГОНЧАЯ', color: new Color3(0.82, 0.78, 0.67), stripe: new Color3(0.55, 0.12, 0.05), pace: 0.985, aggression: 0.72, lane: 2.9 },
  { name: 'ИСКРА', color: new Color3(0.18, 0.39, 0.58), stripe: new Color3(0.88, 0.68, 0.18), pace: 0.955, aggression: 0.55, lane: 0.1 }
];

function createCar(template: typeof botTemplates[number], index: number): TransformNode {
  const root = new TransformNode(`bot-${index}`, scene);
  const carMaterial = material(`bot-body-${index}`, template.color, 0.3);
  const stripeMaterial = material(`bot-stripe-${index}`, template.stripe, 0.18);
  const rubber = material(`bot-rubber-${index}`, new Color3(0.015, 0.018, 0.016), 0.05);
  const dark = material(`bot-dark-${index}`, new Color3(0.025, 0.035, 0.03), 0.18);

  const chassis = MeshBuilder.CreateBox(`bot-chassis-${index}`, { width: 1.55, height: 0.34, depth: 3.55 }, scene);
  chassis.parent = root;
  chassis.position.y = 0.42;
  chassis.material = carMaterial;
  addCaster(chassis);

  const nose = MeshBuilder.CreateBox(`bot-nose-${index}`, { width: 0.58, height: 0.28, depth: 2.1 }, scene);
  nose.parent = root;
  nose.position.set(0, 0.42, 2.45);
  nose.material = carMaterial;
  addCaster(nose);

  const stripe = MeshBuilder.CreateBox(`bot-stripe-${index}`, { width: 0.16, height: 0.36, depth: 4.7 }, scene);
  stripe.parent = root;
  stripe.position.set(0, 0.45, 0.9);
  stripe.material = stripeMaterial;
  addCaster(stripe);

  const cockpit = MeshBuilder.CreateBox(`bot-cockpit-${index}`, { width: 0.78, height: 0.38, depth: 0.95 }, scene);
  cockpit.parent = root;
  cockpit.position.set(0, 0.72, 0.15);
  cockpit.material = dark;
  addCaster(cockpit);

  const rearWing = MeshBuilder.CreateBox(`bot-wing-${index}`, { width: 2.05, height: 0.18, depth: 0.55 }, scene);
  rearWing.parent = root;
  rearWing.position.set(0, 0.88, -1.75);
  rearWing.material = dark;
  addCaster(rearWing);

  const frontWing = MeshBuilder.CreateBox(`bot-front-wing-${index}`, { width: 2.1, height: 0.12, depth: 0.48 }, scene);
  frontWing.parent = root;
  frontWing.position.set(0, 0.3, 3.25);
  frontWing.material = dark;
  addCaster(frontWing);

  for (const x of [-0.92, 0.92]) {
    for (const z of [-1.15, 1.75]) {
      const wheel = MeshBuilder.CreateCylinder(`bot-wheel-${index}-${x}-${z}`, { height: 0.38, diameter: 0.72, tessellation: 14 }, scene);
      wheel.parent = root;
      wheel.position.set(x, 0.34, z);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = rubber;
      addCaster(wheel);
    }
  }
  return root;
}

let bots: Bot[] = [];
function makeBots(): Bot[] {
  const gaps = [42, 72, 108, 148, 194];
  return botTemplates.map((template, index) => ({
    ...template,
    totalDistance: gaps[index],
    speed: 0,
    targetLane: template.lane,
    decisionAt: 1 + index * 0.25,
    phase: Math.random() * Math.PI * 2,
    root: createCar(template, index)
  }));
}

function disposeBots(): void {
  for (const bot of bots) bot.root.dispose(false, true);
  bots = [];
}

function updateBotTransform(bot: Bot): void {
  const sample = sampleTrack(bot.totalDistance);
  bot.root.position.copyFrom(sample.position.add(sample.right.scale(bot.lane)));
  bot.root.position.y += 0.18;
  bot.root.rotationQuaternion = Quaternion.FromEulerAngles(0, yawFromTangent(sample.tangent), clamp((bot.targetLane - bot.lane) * -0.018, -0.05, 0.05));
}

function resetRace(): void {
  Object.assign(player, { totalDistance: 0, speed: 0, lane: 0, laneVelocity: 0, lap: 1, acceleration: 0, drafting: 0 });
  disposeBots();
  bots = makeBots();
  bots.forEach(updateBotTransform);
  raceTimeMs = 0;
  lapStartMs = 0;
  bestLapMs = Infinity;
  passes = 0;
  previousPosition = 6;
  collisionCooldown = 0;
  cameraImpact = 0;
  lastGear = 1;
  steer = 0;
  steerTarget = 0;
  throttle = false;
  braking = false;
  updateHud();
}

function position(): number {
  let value = 1;
  for (const bot of bots) if (bot.totalDistance > player.totalDistance) value += 1;
  return value;
}

function nearestAhead(): Bot | null {
  let nearest: Bot | null = null;
  let nearestDistance = Infinity;
  for (const bot of bots) {
    const distance = bot.totalDistance - player.totalDistance;
    if (distance > 0 && distance < nearestDistance) {
      nearest = bot;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function draftStrength(): number {
  let strength = 0;
  for (const bot of bots) {
    const distance = bot.totalDistance - player.totalDistance;
    const lateral = Math.abs(bot.lane - player.lane);
    if (distance > 5 && distance < 55 && lateral < 1.25) {
      strength = Math.max(strength, (1 - distance / 55) * (1 - lateral / 1.25));
    }
  }
  return clamp(strength, 0, 1);
}

function updateHud(): void {
  const currentPosition = position();
  $('#position').textContent = String(currentPosition);
  $('#lap').textContent = `${Math.min(player.lap, LAPS)}/${LAPS}`;
  const ahead = nearestAhead();
  $('#gap').textContent = ahead ? `+${((ahead.totalDistance - player.totalDistance) / Math.max(player.speed / 3.6, 1)).toFixed(1)}с` : 'ЛИДЕР';
  $('#speed').textContent = String(Math.round(player.speed)).padStart(3, '0');
  const gear = clamp(Math.floor(player.speed / 50) + 1, 1, 6);
  $('#gear').textContent = String(gear);
  $('#rpmBar').style.width = `${clamp((player.speed % 50) / 50 * 100, 4, 100)}%`;
}

function updateBots(delta: number): void {
  for (const bot of bots) {
    const sample = sampleTrack(bot.totalDistance + 28);
    const bend = Math.abs(sample.tangent.x * sample.right.z - sample.tangent.z * sample.right.x);
    const target = clamp(238 + bot.pace * 63 - bend * 7 + Math.sin(raceTimeMs * 0.0007 + bot.phase) * (2 + bot.aggression * 2), 222, 309);
    bot.speed += clamp(target - bot.speed, -58 * delta, 47 * delta);
    bot.totalDistance += bot.speed / 3.6 * delta;
    if (raceTimeMs / 1000 > bot.decisionAt) {
      const racingLine = Math.sin(sample.u * Math.PI * 12 + bot.phase) * (0.8 + bot.aggression * 0.55);
      const trafficAvoid = bots.reduce((sum, other) => {
        if (other === bot) return sum;
        const distance = Math.abs(other.totalDistance - bot.totalDistance);
        if (distance > 18) return sum;
        return sum + Math.sign(bot.lane - other.lane || Math.random() - 0.5) * (1 - distance / 18) * 1.2;
      }, 0);
      bot.targetLane = clamp(racingLine + trafficAvoid, -ROAD_HALF + 1.1, ROAD_HALF - 1.1);
      bot.decisionAt = raceTimeMs / 1000 + 1.15 + Math.random() * 1.9;
    }
    const lateralRate = 0.75 + bot.aggression * 0.7;
    bot.lane += clamp(bot.targetLane - bot.lane, -lateralRate * delta, lateralRate * delta);
    updateBotTransform(bot);
  }
}

function collide(): void {
  if (collisionCooldown > 0) return;
  for (const bot of bots) {
    const longitudinal = bot.totalDistance - player.totalDistance;
    const lateral = Math.abs(bot.lane - player.lane);
    if (longitudinal > -2.5 && longitudinal < 4.8 && lateral < 1.3) {
      collisionCooldown = 0.55;
      player.speed *= 0.76;
      bot.speed *= 0.91;
      player.lane += (player.lane <= bot.lane ? -1 : 1) * 0.7;
      player.laneVelocity += (player.lane <= bot.lane ? -1 : 1) * 2.4;
      cameraImpact = Math.max(cameraImpact, 1);
      audio.impact(0.95);
      haptic([28, 18, 38]);
      say('КОНТАКТ', 500);
      break;
    }
  }
}

function finish(): void {
  if (mode === 'finished') return;
  mode = 'finished';
  controls.classList.add('hidden');
  hud.classList.add('hidden');
  speedPanel.classList.add('hidden');
  draftBadge.classList.add('hidden');
  audio.update(0, false, 0, 0);
  audio.beep(840, 0.32, 0.16);
  haptic([35, 35, 70]);

  const resultPosition = position();
  if (!records.bestFinish || resultPosition < records.bestFinish) records.bestFinish = resultPosition;
  if (Number.isFinite(bestLapMs) && (!records.bestLapMs || bestLapMs < records.bestLapMs)) records.bestLapMs = Math.round(bestLapMs);
  saveRecords();

  const names = ['Первое', 'Второе', 'Третье', 'Четвёртое', 'Пятое', 'Шестое'];
  const texts = [
    'Чисто. Быстро. Теперь это хотя бы действительно гонка.',
    'До победы не хватило одного позднего торможения.',
    'Подиум есть. Трёхмерное переднее крыло тоже на месте.',
    'Средний результат. Зато стены теперь объёмные и знают твоё имя.',
    'Пелотон уехал, но движок уже не рисует его фломастером.',
    'Последний. Зато честно и в настоящем кокпите.'
  ];
  $('#resultTitle').textContent = `${names[resultPosition - 1]} место`;
  $('#resultText').textContent = texts[resultPosition - 1];
  $('#resultPosition').textContent = `${resultPosition}/6`;
  $('#resultTime').textContent = formatTime(raceTimeMs);
  $('#resultLap').textContent = formatTime(bestLapMs);
  $('#resultPasses').textContent = String(passes);
  showScreen(resultsScreen);
}

function updateRace(delta: number): void {
  if (mode === 'countdown') {
    countdown -= delta;
    const mark = Math.ceil(countdown);
    if (mark !== countdownMark && mark > 0 && mark <= 3) {
      countdownMark = mark;
      say(String(mark), 720);
      audio.beep(360 + (3 - mark) * 70, 0.11, 0.14);
      haptic(18);
    }
    if (countdown <= 0) {
      mode = 'racing';
      say('СТАРТ', 760);
      audio.beep(780, 0.18, 0.18);
      haptic([25, 28, 34]);
    }
    return;
  }
  if (mode !== 'racing') return;

  raceTimeMs += delta * 1000;
  collisionCooldown = Math.max(0, collisionCooldown - delta);
  steer += (steerTarget - steer) * Math.min(1, delta * 8.5);
  player.drafting = draftStrength();
  const limit = MAX_SPEED + player.drafting * 16;
  const previousSpeed = player.speed;
  const engineForce = throttle ? 83 * (1 - player.speed / (limit + 55)) : 0;
  const drag = 5.6 + player.speed * 0.023 + player.speed * player.speed * 0.000035;
  const brakingForce = braking ? 154 : 0;
  const offroad = clamp((Math.abs(player.lane) - ROAD_HALF + 0.7) / 1.2, 0, 1);
  player.speed = clamp(player.speed + (engineForce - brakingForce - drag - offroad * 78) * delta, 0, limit);
  player.acceleration += (((player.speed - previousSpeed) / Math.max(delta, 0.001)) - player.acceleration) * Math.min(1, delta * 6);

  const steeringPower = 2.2 + player.speed / MAX_SPEED * 4.2;
  player.laneVelocity += steer * steeringPower * delta;
  player.laneVelocity *= Math.pow(0.12, delta);
  player.lane += player.laneVelocity * delta;
  if (Math.abs(player.lane) > ROAD_HALF + 1.2) {
    player.lane = Math.sign(player.lane) * (ROAD_HALF + 1.2);
    player.laneVelocity *= -0.25;
    player.speed *= 0.82;
    cameraImpact = Math.max(cameraImpact, 0.7);
    audio.impact(0.65);
    haptic([22, 16, 24]);
  }

  const before = player.totalDistance;
  player.totalDistance += player.speed / 3.6 * delta;
  updateBots(delta);
  collide();

  const oldLap = Math.floor(before / trackLength);
  const newLap = Math.floor(player.totalDistance / trackLength);
  if (newLap > oldLap && newLap < LAPS) {
    const lapTime = raceTimeMs - lapStartMs;
    lapStartMs = raceTimeMs;
    bestLapMs = Math.min(bestLapMs, lapTime);
    player.lap = newLap + 1;
    say(player.lap === LAPS ? 'ПОСЛЕДНИЙ КРУГ' : `КРУГ ${player.lap}`, 1150);
    audio.beep(660, 0.16, 0.13);
    haptic([20, 20, 20]);
  }

  const currentPosition = position();
  if (currentPosition < previousPosition) passes += previousPosition - currentPosition;
  previousPosition = currentPosition;

  const gear = clamp(Math.floor(player.speed / 50) + 1, 1, 6);
  if (gear !== lastGear && player.speed > 20) {
    lastGear = gear;
    audio.beep(98 + gear * 15, 0.035, 0.035);
    haptic(8);
    cameraImpact = Math.max(cameraImpact, 0.12);
  }

  draftBadge.classList.toggle('hidden', player.drafting < 0.12);
  if (player.drafting >= 0.12) draftBadge.querySelector('b')!.textContent = `+${Math.round(player.drafting * 16)}`;

  hapticTimer -= delta;
  if (settings.haptics && player.speed > 235 && hapticTimer <= 0) {
    haptic(4);
    hapticTimer = lerp(0.32, 0.12, speedFeel(player.speed, MAX_SPEED));
  }

  if (player.totalDistance >= LAPS * trackLength) finish();
  updateHud();
}

let cameraPosition = new Vector3(0, 2, 0);
let cameraTarget = new Vector3(0, 2, 10);

function updateCamera(delta: number): void {
  const feel = speedFeel(player.speed, MAX_SPEED);
  const current = sampleTrack(player.totalDistance + 0.5);
  const lookAheadDistance = lerp(12, 34, feel);
  const ahead = sampleTrack(player.totalDistance + lookAheadDistance);
  const lanePosition = current.position.add(current.right.scale(player.lane));
  const aheadPosition = ahead.position.add(ahead.right.scale(player.lane * 0.82));
  const brakingPitch = braking ? 0.1 + feel * 0.13 : 0;
  const accelerationSink = clamp(player.acceleration / 120, -0.12, 0.16);
  const surface = Math.sin(player.totalDistance * 1.7) * feel * 0.014 + Math.sin(player.totalDistance * 4.3) * feel * 0.004;
  const impactX = (Math.random() - 0.5) * cameraImpact * 0.18;
  const impactY = (Math.random() - 0.5) * cameraImpact * 0.11;
  cameraImpact *= Math.pow(0.035, delta);

  const desiredPosition = lanePosition
    .add(current.tangent.scale(-0.18 - feel * 0.16))
    .add(new Vector3(impactX, 1.16 + surface - brakingPitch + accelerationSink + impactY, 0));
  const desiredTarget = aheadPosition.add(new Vector3(0, 1.13 - brakingPitch * 0.45, 0));
  cameraPosition = Vector3.Lerp(cameraPosition, desiredPosition, Math.min(1, delta * (8 - feel * 2.5)));
  cameraTarget = Vector3.Lerp(cameraTarget, desiredTarget, Math.min(1, delta * (7 - feel * 2)));
  camera.position.copyFrom(cameraPosition);
  camera.setTarget(cameraTarget);
  camera.fov += (lerp(0.98, 1.29, feel) - camera.fov) * Math.min(1, delta * 5.5);
  camera.rotation.z = clamp(-steer * 0.055 - player.laneVelocity * 0.016, -0.095, 0.095);

  cockpitRoot.position.y = surface * 0.4 - brakingPitch * 0.24 + accelerationSink * 0.25;
  cockpitRoot.position.z = braking ? 0.08 + feel * 0.08 : -accelerationSink * 0.16;
  cockpitRoot.rotation.z = clamp(steer * -0.018 - player.laneVelocity * 0.01, -0.04, 0.04);
  wheelRoot.rotation.z = steer * -0.62;

  streakMaterial.alpha = 0.04 + feel * 0.34 + player.drafting * 0.12;
  for (const streak of speedStreaks) {
    streak.position.z -= delta * (8 + feel * 125 + player.drafting * 22);
    streak.scaling.z = 0.4 + feel * 2.4;
    if (streak.position.z < 0.2) {
      streak.position.z = 18 + Math.random() * 36;
      streak.position.x = (Math.random() < 0.5 ? -1 : 1) * (1.65 + Math.random() * 3.5);
      streak.position.y = -1.2 + Math.random() * 3.2;
    }
    streak.setEnabled(feel > 0.18);
  }

  const offroad = clamp((Math.abs(player.lane) - ROAD_HALF + 0.7) / 1.2, 0, 1);
  audio.update(player.speed, mode === 'racing' || mode === 'countdown', offroad, player.drafting);
}

function updateQuality(delta: number): void {
  frameCounter += 1;
  fpsTimer += delta;
  fpsAccumulator += 1 / Math.max(delta, 0.0001);
  if (fpsTimer < 2.5) return;
  const average = fpsAccumulator / frameCounter;
  frameCounter = 0;
  fpsTimer = 0;
  fpsAccumulator = 0;
  if (settings.quality !== 'auto') return;
  const current = engine.getHardwareScalingLevel();
  if (average < 48 && current < 1.9) engine.setHardwareScalingLevel(Math.min(1.9, current + 0.15));
  else if (average > 58 && current > 1.05) engine.setHardwareScalingLevel(Math.max(1.05, current - 0.08));
  document.documentElement.dataset.fps = average.toFixed(0);
  document.documentElement.dataset.qualityScale = engine.getHardwareScalingLevel().toFixed(2);
}

async function enableTilt(): Promise<boolean> {
  sensorBaseline = null;
  sensorStop?.();
  sensorStop = await watchOrientation((event: DeviceOrientationEvent) => {
    const angle = Number(screen.orientation?.angle ?? (window as typeof window & { orientation?: number }).orientation ?? 0);
    let value = Number(event.gamma) || 0;
    if (angle === 90) value = Number(event.beta) || 0;
    if (angle === 270 || angle === -90) value = -(Number(event.beta) || 0);
    if (sensorBaseline === null) sensorBaseline = value;
    const normalized = clamp((value - sensorBaseline) / settings.sensitivity, -1, 1);
    steerTarget = Math.abs(normalized) < 0.035 ? 0 : normalized;
  });
  sensorActive = Boolean(sensorStop);
  return sensorActive;
}

function stopTilt(): void {
  sensorStop?.();
  sensorStop = null;
  sensorBaseline = null;
  sensorActive = false;
}

async function startRace(useTilt: boolean): Promise<void> {
  await audio.unlock();
  let tilt = false;
  if (useTilt) tilt = await enableTilt();
  if (!tilt) {
    stopTilt();
    steerPad.classList.remove('hidden');
  } else {
    steerPad.classList.add('hidden');
  }
  try { await lockOrientation('landscape'); } catch {}
  resetRace();
  showScreen(null);
  controls.classList.remove('hidden');
  hud.classList.remove('hidden');
  speedPanel.classList.remove('hidden');
  mode = 'countdown';
  countdown = 3.7;
  countdownMark = 4;
  say(tilt ? 'ДЕРЖИ РОВНО' : 'РУЛЬ ВНИЗУ', 950);
}

function goMenu(): void {
  mode = 'menu';
  stopTilt();
  unlockOrientation();
  controls.classList.add('hidden');
  hud.classList.add('hidden');
  speedPanel.classList.add('hidden');
  draftBadge.classList.add('hidden');
  message.textContent = '';
  throttle = false;
  braking = false;
  audio.mute();
  updateRecords();
  showScreen(menu);
}

function pauseRace(): void {
  if (!['racing', 'countdown'].includes(mode)) return;
  mode = 'paused';
  throttle = false;
  braking = false;
  controls.classList.add('hidden');
  hud.classList.add('hidden');
  speedPanel.classList.add('hidden');
  audio.update(player.speed, false, 0, 0);
  showScreen(pauseScreen);
}

function resumeRace(): void {
  if (mode !== 'paused') return;
  mode = 'racing';
  showScreen(null);
  controls.classList.remove('hidden');
  hud.classList.remove('hidden');
  speedPanel.classList.remove('hidden');
}

function openSettings(from: 'menu' | 'pause'): void {
  settingsReturn = from;
  mode = 'settings';
  updateSettings();
  showScreen(settingsScreen);
}

function closeSettings(): void {
  if (settingsReturn === 'pause') {
    mode = 'paused';
    showScreen(pauseScreen);
  } else {
    mode = 'menu';
    showScreen(menu);
  }
}

function saveSettings(): void {
  store.set('settings', { ...settings });
}

function saveRecords(): void {
  store.set('records', { ...records });
  updateRecords();
}

function updateRecords(): void {
  $('#bestFinish').textContent = records.bestFinish ? `${records.bestFinish}/6` : '—';
  $('#bestLap').textContent = formatTime(records.bestLapMs ?? Infinity);
}

function updateSettings(): void {
  const sensitivity = $('#sensitivity') as HTMLInputElement;
  sensitivity.value = String(settings.sensitivity);
  $('#sensitivityValue').textContent = `${settings.sensitivity}°`;
  for (const [id, enabled] of [['sound', settings.sound], ['haptics', settings.haptics]] as const) {
    const button = $(`#${id}`) as HTMLButtonElement;
    button.textContent = enabled ? 'ВКЛ' : 'ВЫКЛ';
    button.classList.toggle('off', !enabled);
  }
  const quality = $('#quality') as HTMLButtonElement;
  quality.textContent = settings.quality === 'auto' ? 'АВТО' : 'ВЫСОКОЕ';
}

function hold(button: HTMLButtonElement, setter: (value: boolean) => void): void {
  const end = (event?: PointerEvent) => {
    setter(false);
    button.classList.remove('active');
    if (event?.pointerId != null && button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    setter(true);
    button.classList.add('active');
  });
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('lostpointercapture', end);
}

hold(gasButton, (value) => { throttle = value; });
hold(brakeButton, (value) => { braking = value; });

let steerPointer: number | null = null;
function steerFrom(event: PointerEvent): void {
  const rect = steerPad.getBoundingClientRect();
  steerTarget = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
  const indicator = steerPad.querySelector('i') as HTMLElement;
  indicator.style.left = `${(steerTarget + 1) * 50}%`;
}
steerPad.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  steerPointer = event.pointerId;
  steerPad.setPointerCapture?.(event.pointerId);
  steerFrom(event);
});
steerPad.addEventListener('pointermove', (event) => { if (event.pointerId === steerPointer) steerFrom(event); });
const releaseSteer = (event: PointerEvent) => {
  if (event.pointerId !== steerPointer) return;
  steerPointer = null;
  steerTarget = 0;
  (steerPad.querySelector('i') as HTMLElement).style.left = '50%';
};
steerPad.addEventListener('pointerup', releaseSteer);
steerPad.addEventListener('pointercancel', releaseSteer);
steerPad.addEventListener('lostpointercapture', releaseSteer);

const keys = new Set<string>();
window.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'Escape'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Escape') {
    if (['racing', 'countdown'].includes(mode)) pauseRace();
    else if (mode === 'paused') resumeRace();
  }
  if (['ArrowUp', 'KeyW', 'Space'].includes(event.code)) throttle = true;
  if (['ArrowDown', 'KeyS'].includes(event.code)) braking = true;
  if (!sensorActive) {
    if (['ArrowLeft', 'KeyA'].includes(event.code)) steerTarget = -1;
    if (['ArrowRight', 'KeyD'].includes(event.code)) steerTarget = 1;
  }
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (['ArrowUp', 'KeyW', 'Space'].includes(event.code)) throttle = false;
  if (['ArrowDown', 'KeyS'].includes(event.code)) braking = false;
  if (!sensorActive && !['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].some((key) => keys.has(key))) steerTarget = 0;
});

$('#start').addEventListener('click', () => void startRace(true));
$('#practice').addEventListener('click', () => void startRace(false));
$('#settingsButton').addEventListener('click', () => openSettings('menu'));
$('#pauseButton').addEventListener('click', pauseRace);
$('#resume').addEventListener('click', resumeRace);
$('#restart').addEventListener('click', () => void startRace(sensorActive));
$('#quit').addEventListener('click', goMenu);
$('#again').addEventListener('click', () => void startRace(sensorActive));
$('#resultsMenu').addEventListener('click', goMenu);
$('#closeSettings').addEventListener('click', closeSettings);

($('#sensitivity') as HTMLInputElement).addEventListener('input', (event) => {
  settings.sensitivity = Number((event.target as HTMLInputElement).value);
  $('#sensitivityValue').textContent = `${settings.sensitivity}°`;
  sensorBaseline = null;
  saveSettings();
});
$('#sound').addEventListener('click', () => {
  settings.sound = !settings.sound;
  saveSettings();
  updateSettings();
  if (settings.sound) void audio.unlock();
  else audio.mute();
});
$('#haptics').addEventListener('click', () => {
  settings.haptics = !settings.haptics;
  saveSettings();
  updateSettings();
  if (settings.haptics) haptic(18);
});
$('#quality').addEventListener('click', () => {
  settings.quality = settings.quality === 'auto' ? 'high' : 'auto';
  engine.setHardwareScalingLevel(settings.quality === 'high' ? 1 : Math.max(1, Math.min(1.45, window.devicePixelRatio / 2)));
  saveSettings();
  updateSettings();
});

let resetArmed = false;
let resetTimer = 0;
$('#reset').addEventListener('click', (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  if (!resetArmed) {
    resetArmed = true;
    button.textContent = 'НАЖМИ ЕЩЁ РАЗ ДЛЯ СБРОСА';
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      resetArmed = false;
      button.textContent = 'СБРОСИТЬ РЕКОРДЫ';
    }, 3500);
    return;
  }
  resetArmed = false;
  records = { bestFinish: null, bestLapMs: null };
  saveRecords();
  button.textContent = 'РЕКОРДЫ СБРОШЕНЫ';
  window.setTimeout(() => { button.textContent = 'СБРОСИТЬ РЕКОРДЫ'; }, 1200);
});

window.addEventListener('resize', () => engine.resize());
window.addEventListener('orientationchange', () => {
  sensorBaseline = null;
  window.setTimeout(() => engine.resize(), 120);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ['racing', 'countdown'].includes(mode)) pauseRace();
});
window.addEventListener('pagehide', () => {
  saveSettings();
  saveRecords();
  audio.mute();
});
window.addEventListener('appdatareset', () => {
  records = { bestFinish: null, bestLapMs: null };
  Object.assign(settings, { sensitivity: 21, sound: true, haptics: true, quality: 'auto' });
  updateRecords();
  updateSettings();
  goMenu();
});

createWorkshopMode({
  appName: APP_NAME,
  version: VERSION,
  cachePrefix: 'petlya-17-',
  storageNamespace: NS,
  onReset() {
    store.reset();
    window.dispatchEvent(new CustomEvent('appdatareset'));
  }
});

async function boot(): Promise<void> {
  loadingBar.style.width = '18%';
  loadingText.textContent = 'Геометрия кольца';
  buildTrack();
  await new Promise((resolve) => window.setTimeout(resolve, 30));
  loadingBar.style.width = '42%';
  loadingText.textContent = 'Портовые конструкции';
  buildPort();
  await new Promise((resolve) => window.setTimeout(resolve, 30));
  loadingBar.style.width = '67%';
  loadingText.textContent = 'Кокпит и пелотон';
  buildCockpit();
  buildSpeedStreaks();
  bots = makeBots();
  bots.forEach(updateBotTransform);
  await new Promise((resolve) => window.setTimeout(resolve, 30));
  loadingBar.style.width = '88%';
  loadingText.textContent = 'Свет, тени и телеметрия';
  const initial = sampleTrack(0);
  cameraPosition = initial.position.add(new Vector3(0, 1.16, 0));
  cameraTarget = sampleTrack(18).position.add(new Vector3(0, 1.1, 0));
  camera.position.copyFrom(cameraPosition);
  camera.setTarget(cameraTarget);
  updateRecords();
  updateSettings();
  scene.executeWhenReady(() => {
    loadingBar.style.width = '100%';
    loadingText.textContent = 'Готово';
    window.setTimeout(() => {
      mode = 'menu';
      showScreen(menu);
    }, 320);
  });
}

engine.runRenderLoop(() => {
  const delta = clamp(engine.getDeltaTime() / 1000, 0, 0.05);
  updateRace(delta);
  updateCamera(delta);
  updateQuality(delta);
  scene.render();
});

void boot();
