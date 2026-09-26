import {
  ArcRotateCamera,
  Camera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer,
  VertexData
} from '@babylonjs/core';
import { brushFalloff, brushRadius, clamp, decodePositions, encodePositions } from './core.js';

const canvas = document.querySelector('#renderCanvas');
const loading = document.querySelector('#loading');
const undoButton = document.querySelector('#undoButton');
const newButton = document.querySelector('#newButton');
const soundButton = document.querySelector('#soundButton');
const saveStatus = document.querySelector('#saveStatus');
const brushSizeInput = document.querySelector('#brushSize');
const cursor = document.querySelector('#brushCursor');
const hint = document.querySelector('#hint');
const confirmPanel = document.querySelector('#confirmPanel');
const cancelNew = document.querySelector('#cancelNew');
const confirmNew = document.querySelector('#confirmNew');
const retryButton = document.querySelector('#retryButton');
const toolButtons = [...document.querySelectorAll('[data-tool]')];

if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Не найден холст скульптора.');
if (!(brushSizeInput instanceof HTMLInputElement)) throw new Error('Не найден регулятор кисти.');

const STORAGE_KEY = 'pocket-works:komok:state:v2';
const LEGACY_STORAGE_KEY = 'pocket-works:komok:state:v1';
const MAX_UNDO = 14;
const engine = new Engine(canvas, true, { antialias: true, preserveDrawingBuffer: false, stencil: true, adaptToDeviceRatio: false });
engine.setHardwareScalingLevel(Math.min(1.45, Math.max(1, window.devicePixelRatio * 0.62)));

const scene = new Scene(engine);
scene.clearColor = new Color4(0.905, 0.875, 0.825, 1);
scene.ambientColor = new Color3(0.24, 0.22, 0.20);
scene.skipPointerMovePicking = true;

const camera = new ArcRotateCamera('camera', -Math.PI / 2.25, 1.22, 5.35, new Vector3(0, 1.68, 0), scene);
camera.lowerRadiusLimit = 3.8;
camera.upperRadiusLimit = 8.4;
camera.lowerBetaLimit = 0.52;
camera.upperBetaLimit = 1.52;
camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
camera.fov = 0.72;
camera.minZ = 0.05;
camera.inertia = 0;

const hemi = new HemisphericLight('softbox', new Vector3(-0.25, 1, -0.15), scene);
hemi.intensity = 1.05;
hemi.diffuse = new Color3(1.0, 0.965, 0.91);
hemi.groundColor = new Color3(0.42, 0.37, 0.32);

const key = new DirectionalLight('window', new Vector3(-0.55, -1, 0.42), scene);
key.position = new Vector3(5.5, 8.5, -5.5);
key.intensity = 1.5;
key.diffuse = new Color3(1.0, 0.87, 0.73);

const shadows = new ShadowGenerator(1024, key);
shadows.useBlurExponentialShadowMap = true;
shadows.blurKernel = 28;
shadows.bias = 0.001;

function standardMaterial(name, color, specular = .04) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(specular, specular, specular);
  m.specularPower = 24;
  return m;
}

const floor = MeshBuilder.CreateGround('studio-floor', { width: 30, height: 30 }, scene);
floor.position.y = -0.11;
floor.material = standardMaterial('studio plaster', new Color3(0.82, 0.79, 0.74), .015);
floor.receiveShadows = true;

const plinthBase = MeshBuilder.CreateCylinder('plinth-base', { diameter: 4.62, height: .13, tessellation: 80 }, scene);
plinthBase.position.y = -.03;
plinthBase.material = standardMaterial('plinth base', new Color3(0.63, 0.59, 0.54), .02);
plinthBase.receiveShadows = true;

const plinth = MeshBuilder.CreateCylinder('plinth', { diameter: 4.25, height: .38, tessellation: 96 }, scene);
plinth.position.y = .20;
plinth.material = standardMaterial('warm plaster', new Color3(0.89, 0.85, 0.79), .025);
plinth.receiveShadows = true;
shadows.addShadowCaster(plinth);

function createWeldedIcosphere(name, radius = 1.36, subdivisions = 4) {
  const t = (1 + Math.sqrt(5)) / 2;
  let vertices = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ].map(([x, y, z]) => {
    const inv = radius / Math.hypot(x, y, z);
    return [x * inv, y * inv, z * inv];
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  for (let level = 0; level < subdivisions; level += 1) {
    const cache = new Map();
    const midpoint = (a, b) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (cache.has(key)) return cache.get(key);
      const av = vertices[a];
      const bv = vertices[b];
      const x = (av[0] + bv[0]) * .5;
      const y = (av[1] + bv[1]) * .5;
      const z = (av[2] + bv[2]) * .5;
      const inv = radius / Math.hypot(x, y, z);
      const index = vertices.length;
      vertices.push([x * inv, y * inv, z * inv]);
      cache.set(key, index);
      return index;
    };
    const next = [];
    for (const [a, b, d] of faces) {
      const ab = midpoint(a, b);
      const bd = midpoint(b, d);
      const da = midpoint(d, a);
      next.push([a, ab, da], [b, bd, ab], [d, da, bd], [ab, bd, da]);
    }
    faces = next;
  }

  const positionData = new Float32Array(vertices.length * 3);
  const uvData = new Float32Array(vertices.length * 2);
  for (let i = 0; i < vertices.length; i += 1) {
    const [x, y, z] = vertices[i];
    positionData[i * 3] = x;
    positionData[i * 3 + 1] = y;
    positionData[i * 3 + 2] = z;
    uvData[i * 2] = .5 + Math.atan2(z, x) / (Math.PI * 2);
    uvData[i * 2 + 1] = .5 - Math.asin(clamp(y / radius, -1, 1)) / Math.PI;
  }
  const indexData = faces.flat();
  const normalData = new Float32Array(positionData.length);
  VertexData.ComputeNormals(positionData, indexData, normalData);

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positionData;
  data.indices = indexData;
  data.normals = normalData;
  data.uvs = uvData;
  data.applyToMesh(mesh, true);
  return mesh;
}

function seededClayTexture() {
  const texture = new DynamicTexture('clay grain', { width: 256, height: 256 }, scene, false);
  const ctx = texture.getContext();
  const image = ctx.createImageData(256, 256);
  let seed = 0x52f6a31;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) & 0xffff) / 0xffff;
  };
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const wave = Math.sin(x * .11 + y * .07) * 2;
      const value = clamp(239 + (rnd() - .5) * 12 + wave, 224, 250);
      const i = (y * 256 + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 6;
  texture.vScale = 6;
  return texture;
}

const clayMaterial = new PBRMaterial('red earthen clay', scene);
clayMaterial.albedoColor = new Color3(0.70, 0.39, 0.28);
clayMaterial.albedoTexture = seededClayTexture();
clayMaterial.metallic = 0;
clayMaterial.roughness = .93;
clayMaterial.environmentIntensity = .34;

const clay = createWeldedIcosphere('clay', 1.36, 4);
clay.position.y = 1.68;
clay.material = clayMaterial;
clay.receiveShadows = true;
shadows.addShadowCaster(clay);

const indices = clay.getIndices();
const positionsData = clay.getVerticesData(VertexBuffer.PositionKind);
const normalsData = clay.getVerticesData(VertexBuffer.NormalKind);
if (!indices || !positionsData || !normalsData) throw new Error('Не удалось создать деформируемую сетку.');

let positions = new Float32Array(positionsData);
let normals = new Float32Array(normalsData);
const initialPositions = new Float32Array(positions);
const neighbors = Array.from({ length: positions.length / 3 }, () => new Set());

for (let i = 0; i < indices.length; i += 3) {
  const a = indices[i], b = indices[i + 1], c = indices[i + 2];
  neighbors[a].add(b); neighbors[a].add(c);
  neighbors[b].add(a); neighbors[b].add(c);
  neighbors[c].add(a); neighbors[c].add(b);
}

function makeInitialBlob() {
  positions.set(initialPositions);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const ny = y / 1.36;
    const angle = Math.atan2(z, x);
    const grain = Math.sin(x * 27 + y * 31 + z * 19) * .0025 + Math.sin(x * 51 - y * 43 + z * 37) * .0013;
    const organic = 1 + Math.sin(angle * 3 + ny * 2.1) * .018 + Math.cos(angle * 5 - ny * 1.6) * .012 + grain;
    positions[i] = x * organic * (.99 + ny * .015);
    positions[i + 1] = y * 1.08 * organic + .045 * (1 - ny * ny);
    positions[i + 2] = z * organic * (1.0 - ny * .01);
  }
  commitGeometry();
}

function commitGeometry() {
  clay.updateVerticesData(VertexBuffer.PositionKind, positions, false, false);
  VertexData.ComputeNormals(positions, indices, normals);
  clay.updateVerticesData(VertexBuffer.NormalKind, normals, false, false);
  clay.refreshBoundingInfo();
}

const undoStack = [];
let tool = 'raise';
let brushSlider = 46;
let soundEnabled = true;
let tutorialSeen = false;
let saveTimer = 0;

function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved?.version !== 2 || typeof saved.positions !== 'string') return false;
    const decoded = decodePositions(saved.positions);
    if (decoded.length !== positions.length) return false;
    positions.set(decoded);
    tool = ['raise', 'press', 'smooth'].includes(saved.tool) ? saved.tool : 'raise';
    brushSlider = clamp(Number(saved.brushSlider) || 46, 18, 80);
    soundEnabled = saved.soundEnabled !== false;
    tutorialSeen = saved.tutorialSeen === true;
    if (Number.isFinite(saved.camera?.alpha)) camera.alpha = saved.camera.alpha;
    if (Number.isFinite(saved.camera?.beta)) camera.beta = clamp(saved.camera.beta, camera.lowerBetaLimit, camera.upperBetaLimit);
    if (Number.isFinite(saved.camera?.radius)) camera.radius = clamp(saved.camera.radius, camera.lowerRadiusLimit, camera.upperRadiusLimit);
    commitGeometry();
    return true;
  } catch (error) {
    console.warn('КОМОК save ignored', error);
    return false;
  }
}

function updateUi() {
  toolButtons.forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
  brushSizeInput.value = String(brushSlider);
  undoButton.disabled = undoStack.length === 0;
  soundButton.classList.toggle('sound-on', soundEnabled);
  soundButton.setAttribute('aria-label', soundEnabled ? 'Выключить звук' : 'Включить звук');
  cursorSize();
}

function markSaving() {
  saveStatus.textContent = 'сохраняем…';
  saveStatus.classList.add('saving');
}

function saveNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      positions: encodePositions(positions),
      tool,
      brushSlider,
      soundEnabled,
      tutorialSeen,
      camera: { alpha: camera.alpha, beta: camera.beta, radius: camera.radius }
    }));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    saveStatus.textContent = 'сохранено';
    saveStatus.classList.remove('saving');
  } catch (error) {
    console.warn('КОМОК save failed', error);
    saveStatus.textContent = 'без сохранения';
    saveStatus.classList.remove('saving');
  }
}

function queueSave(delay = 180) {
  markSaving();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, delay);
}

function pushUndo() {
  undoStack.push(new Float32Array(positions));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  updateUi();
}

function undo() {
  const snapshot = undoStack.pop();
  if (!snapshot) return;
  positions.set(snapshot);
  commitGeometry();
  updateUi();
  claySound('soft');
  queueSave();
}

class SoftAudio {
  constructor() {
    this.ctx = null;
    this.lastClayAt = 0;
  }
  async unlock() {
    if (!soundEnabled) return null;
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }
  async click() {
    const ctx = await this.unlock();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 310;
    g.gain.setValueAtTime(.022, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .055);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + .06);
  }
  async clay(kind = 'normal') {
    const now = performance.now();
    if (now - this.lastClayAt < 58) return;
    this.lastClayAt = now;
    const ctx = await this.unlock();
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * .07);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      prev = prev * .78 + white * .22;
      data[i] = prev;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = kind === 'soft' ? 430 : 640 + Math.random() * 160;
    gain.gain.setValueAtTime(kind === 'soft' ? .018 : .025, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .07);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }
}
const audio = new SoftAudio();
const claySound = (kind) => void audio.clay(kind);

function pointToLocal(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * engine.getRenderWidth() / rect.width;
  const y = (clientY - rect.top) * engine.getRenderHeight() / rect.height;
  const pick = scene.pick(x, y, (mesh) => mesh === clay, false, camera);
  if (!pick?.hit || !pick.pickedPoint) return null;
  const inverse = clay.getWorldMatrix().clone();
  inverse.invert();
  const local = Vector3.TransformCoordinates(pick.pickedPoint, inverse);
  return { point: local, screenX: clientX - rect.left, screenY: clientY - rect.top };
}

let activeStrokeChanged = false;
let lastSculptAt = 0;

function sculptAt(clientX, clientY, pressure = .5) {
  const now = performance.now();
  if (now - lastSculptAt < 26) return false;
  lastSculptAt = now;
  const hit = pointToLocal(clientX, clientY);
  if (!hit) return false;

  moveCursor(hit.screenX, hit.screenY, true);
  const radius = brushRadius(brushSlider);
  const source = tool === 'smooth' ? new Float32Array(positions) : positions;
  let changed = false;
  const pressureAmount = clamp(pressure || .5, .25, 1);

  for (let i = 0, vi = 0; i < positions.length; i += 3, vi += 1) {
    const dx = positions[i] - hit.point.x;
    const dy = positions[i + 1] - hit.point.y;
    const dz = positions[i + 2] - hit.point.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist >= radius) continue;
    const fall = brushFalloff(dist, radius);
    if (fall <= 0) continue;

    if (tool === 'smooth') {
      const set = neighbors[vi];
      if (!set.size) continue;
      let ax = 0, ay = 0, az = 0;
      for (const n of set) {
        const ni = n * 3;
        ax += source[ni]; ay += source[ni + 1]; az += source[ni + 2];
      }
      const inv = 1 / set.size;
      const blend = .22 * fall * pressureAmount;
      positions[i] += (ax * inv - source[i]) * blend;
      positions[i + 1] += (ay * inv - source[i + 1]) * blend;
      positions[i + 2] += (az * inv - source[i + 2]) * blend;
    } else {
      const sign = tool === 'press' ? -1 : 1;
      const strength = .043 * sign * fall * (.72 + pressureAmount * .55);
      positions[i] += normals[i] * strength;
      positions[i + 1] += normals[i + 1] * strength;
      positions[i + 2] += normals[i + 2] * strength;
    }
    changed = true;
  }

  if (changed) {
    commitGeometry();
    activeStrokeChanged = true;
    claySound(tool === 'smooth' ? 'soft' : 'normal');
  }
  return changed;
}

function cursorSize() {
  const px = 42 + ((brushSlider - 18) / 62) * 88;
  cursor.style.width = `${px}px`;
  cursor.style.height = `${px}px`;
  cursor.style.marginLeft = `${-px / 2}px`;
  cursor.style.marginTop = `${-px / 2}px`;
}

function moveCursor(x, y, visible) {
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  cursor.classList.toggle('visible', visible);
}

const pointers = new Map();
let gesture = null;
let mode = null;
let primaryPointer = null;
let orbitLast = null;

function hideHint() {
  if (tutorialSeen) return;
  tutorialSeen = true;
  hint.classList.add('hide');
  queueSave(900);
}

function beginPinch() {
  const list = [...pointers.values()];
  if (list.length < 2) return;
  const [a, b] = list;
  const dx = b.x - a.x, dy = b.y - a.y;
  gesture = {
    distance: Math.hypot(dx, dy),
    midX: (a.x + b.x) * .5,
    midY: (a.y + b.y) * .5,
    alpha: camera.alpha,
    beta: camera.beta,
    radius: camera.radius
  };
  mode = 'pinch';
  primaryPointer = null;
  orbitLast = null;
  moveCursor(0, 0, false);
}

function updatePinch() {
  const list = [...pointers.values()];
  if (list.length < 2 || !gesture) return;
  const [a, b] = list;
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.max(12, Math.hypot(dx, dy));
  const midX = (a.x + b.x) * .5;
  const midY = (a.y + b.y) * .5;
  camera.radius = clamp(gesture.radius * gesture.distance / distance, camera.lowerRadiusLimit, camera.upperRadiusLimit);
  camera.alpha = gesture.alpha - (midX - gesture.midX) * .006;
  camera.beta = clamp(gesture.beta + (midY - gesture.midY) * .005, camera.lowerBetaLimit, camera.upperBetaLimit);
}

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  hideHint();
  void audio.unlock();

  if (pointers.size >= 2) {
    if (activeStrokeChanged) {
      queueSave();
      activeStrokeChanged = false;
    }
    beginPinch();
    return;
  }

  primaryPointer = event.pointerId;
  const hit = pointToLocal(event.clientX, event.clientY);
  if (hit) {
    mode = 'sculpt';
    activeStrokeChanged = false;
    pushUndo();
    sculptAt(event.clientX, event.clientY, event.pressure);
  } else {
    mode = 'orbit';
    orbitLast = { x: event.clientX, y: event.clientY };
    moveCursor(0, 0, false);
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) {
    if (event.pointerType === 'mouse') {
      const hit = pointToLocal(event.clientX, event.clientY);
      if (hit) moveCursor(hit.screenX, hit.screenY, true);
      else moveCursor(0, 0, false);
    }
    return;
  }

  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2 || mode === 'pinch') {
    if (mode !== 'pinch') beginPinch();
    updatePinch();
    return;
  }
  if (event.pointerId !== primaryPointer) return;

  if (mode === 'sculpt') {
    sculptAt(event.clientX, event.clientY, event.pressure);
  } else if (mode === 'orbit' && orbitLast) {
    const dx = event.clientX - orbitLast.x;
    const dy = event.clientY - orbitLast.y;
    camera.alpha -= dx * .008;
    camera.beta = clamp(camera.beta + dy * .007, camera.lowerBetaLimit, camera.upperBetaLimit);
    orbitLast = { x: event.clientX, y: event.clientY };
  }
});

function endPointer(event) {
  pointers.delete(event.pointerId);
  if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (mode === 'sculpt' && event.pointerId === primaryPointer) {
    if (activeStrokeChanged) queueSave();
    else if (undoStack.length) undoStack.pop();
    updateUi();
    activeStrokeChanged = false;
    moveCursor(0, 0, false);
  }
  if (pointers.size >= 2) {
    beginPinch();
    return;
  }
  if (pointers.size === 1) {
    const [id, p] = pointers.entries().next().value;
    primaryPointer = id;
    mode = 'orbit';
    orbitLast = { x: p.x, y: p.y };
    gesture = null;
    return;
  }
  primaryPointer = null;
  mode = null;
  orbitLast = null;
  gesture = null;
  queueSave(450);
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', (event) => {
  if (pointers.has(event.pointerId)) endPointer(event);
});
canvas.addEventListener('pointerleave', (event) => {
  if (event.pointerType === 'mouse' && !pointers.has(event.pointerId)) moveCursor(0, 0, false);
});

toolButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const next = button.dataset.tool;
    if (!['raise', 'press', 'smooth'].includes(next)) return;
    tool = next;
    updateUi();
    void audio.click();
    queueSave();
  });
});

brushSizeInput.addEventListener('input', () => {
  brushSlider = clamp(Number(brushSizeInput.value), 18, 80);
  cursorSize();
  markSaving();
});
brushSizeInput.addEventListener('change', () => {
  brushSlider = clamp(Number(brushSizeInput.value), 18, 80);
  queueSave();
  void audio.click();
});

undoButton.addEventListener('click', undo);

newButton.addEventListener('click', () => {
  confirmPanel.hidden = false;
  void audio.click();
});
cancelNew.addEventListener('click', () => {
  confirmPanel.hidden = true;
  void audio.click();
});
confirmNew.addEventListener('click', () => {
  confirmPanel.hidden = true;
  undoStack.length = 0;
  makeInitialBlob();
  updateUi();
  camera.alpha = -Math.PI / 2.25;
  camera.beta = 1.22;
  camera.radius = 5.35;
  void audio.click();
  queueSave();
});

soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  updateUi();
  if (soundEnabled) void audio.click();
  queueSave();
});

retryButton.addEventListener('click', () => location.reload());

window.addEventListener('resize', () => engine.resize());
window.addEventListener('orientationchange', () => setTimeout(() => engine.resize(), 120));
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveNow();
    engine.stopRenderLoop();
  } else {
    engine.runRenderLoop(render);
  }
});
window.addEventListener('appdatareset', () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  location.reload();
});

if (!safeLoad()) {
  makeInitialBlob();
  queueSave(80);
}
if (tutorialSeen) hint.classList.add('hide');
updateUi();

let lastTime = performance.now();
function render() {
  const now = performance.now();
  const dt = Math.min(.04, (now - lastTime) / 1000);
  lastTime = now;
  if (!pointers.size) {
    plinth.rotation.y += dt * .025;
  }
  scene.render();
}
engine.runRenderLoop(render);

setTimeout(() => loading.classList.add('done'), 220);
