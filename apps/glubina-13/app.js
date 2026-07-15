import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  BASE_RADIUS,
  CHUNK_SIZE,
  attentionSpawnReady,
  cargoCapacity,
  chunkCoordinate,
  chunkKey,
  clamp,
  createListener,
  engineNoiseFactor,
  generateChunk,
  lootLabel,
  maxHull,
  moveWithCollisions,
  sanitizeSavedRun,
  stepListener,
  updateAttention,
  upgradeCost,
} from './game-core.js';
import { DeepEngine, boxGeometry, capsuleGeometry, listenerGeometry, octaGeometry } from './engine.js';

installMobileRuntime();

const VERSION = '2.1.0';
const STORAGE_PREFIX = 'pocket-works:glubina-13';
const PROFILE_KEY = `${STORAGE_PREFIX}:profile`;
const SETTINGS_KEY = `${STORAGE_PREFIX}:settings`;
const RUN_KEY = `${STORAGE_PREFIX}:run`;

const palette = {
  floor: [0.055, 0.15, 0.16],
  stone: [0.19, 0.29, 0.29],
  ruin: [0.34, 0.39, 0.35],
  relic: [0.45, 0.72, 0.64],
  archive: [0.72, 0.78, 0.62],
  idol: [0.72, 0.34, 0.2],
  oxygen: [0.42, 0.72, 0.78],
  wreck: [0.78, 0.56, 0.34],
  listener: [0.76, 0.22, 0.13],
  capsule: [0.78, 0.88, 0.84],
  base: [0.36, 0.72, 0.65],
};

const $ = (selector) => document.querySelector(selector);
const appShell = $('#appShell');
const canvas = $('#worldCanvas');
const fallback = $('#fallback');
const menuOverlay = $('#menuOverlay');
const tutorialOverlay = $('#tutorialOverlay');
const pauseOverlay = $('#pauseOverlay');
const resultOverlay = $('#resultOverlay');
const settingsLayer = $('#settingsLayer');
const startButton = $('#startButton');
const resumeButton = $('#resumeButton');
const resumeMeta = $('#resumeMeta');
const tutorialButton = $('#tutorialButton');
const pauseButton = $('#pauseButton');
const continueButton = $('#continueButton');
const pauseSettingsButton = $('#pauseSettingsButton');
const saveMenuButton = $('#saveMenuButton');
const restartButton = $('#restartButton');
const againButton = $('#againButton');
const resultMenuButton = $('#resultMenuButton');
const settingsButton = $('#settingsButton');
const settingsBackdrop = $('#settingsBackdrop');
const closeSettingsButton = $('#closeSettingsButton');
const soundToggle = $('#soundToggle');
const hapticToggle = $('#hapticToggle');
const motionToggle = $('#motionToggle');
const clearDataButton = $('#clearDataButton');
const sonarButton = $('#sonarButton');
const sonarWave = $('#sonarWave');
const sonarCostLabel = $('#sonarCostLabel');
const joystick = $('#joystick');
const joystickKnob = $('#joystickKnob');
const throttleLabel = $('#throttleLabel');
const missionValue = $('#missionValue');
const missionHint = $('#missionHint');
const bearingArrow = $('#bearingArrow');
const baseDistanceValue = $('#baseDistanceValue');
const hullMarks = $('#hullMarks');
const oxygenValue = $('#oxygenValue');
const oxygenFill = $('#oxygenFill');
const sonarValue = $('#sonarValue');
const sonarFill = $('#sonarFill');
const cargoSlots = $('#cargoSlots');
const cargoValue = $('#cargoValue');
const echoPanel = $('#echoPanel');
const echoLabel = $('#echoLabel');
const contextHint = $('#contextHint');
const toast = $('#toast');
const dockProgress = $('#dockProgress');
const dangerWash = $('#dangerWash');
const impactFlash = $('#impactFlash');
const fundsValue = $('#fundsValue');
const successesValue = $('#successesValue');
const wreckNotice = $('#wreckNotice');
const wreckMeta = $('#wreckMeta');
const pauseDistance = $('#pauseDistance');
const pauseCargo = $('#pauseCargo');
const resultKicker = $('#resultKicker');
const resultTitle = $('#resultTitle');
const resultValue = $('#resultValue');
const resultCargo = $('#resultCargo');
const resultDistance = $('#resultDistance');
const resultNote = $('#resultNote');
const upgradeButtons = [...document.querySelectorAll('[data-upgrade]')];

const defaultProfile = {
  funds: 0,
  successes: 0,
  losses: 0,
  bestValue: 0,
  upgrades: { propeller: 0, hull: 0, cargo: 0 },
  wreck: null,
};
const defaultSettings = {
  sound: true,
  haptics: true,
  motion: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  tutorialSeen: false,
};

function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === 'object' ? value : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('ГЛУБИНА 13: сохранение недоступно', error);
  }
}

function normalizeProfile(value) {
  return {
    ...defaultProfile,
    ...(value || {}),
    funds: Math.max(0, Math.floor(Number(value?.funds) || 0)),
    successes: Math.max(0, Math.floor(Number(value?.successes) || 0)),
    losses: Math.max(0, Math.floor(Number(value?.losses) || 0)),
    bestValue: Math.max(0, Math.floor(Number(value?.bestValue) || 0)),
    upgrades: {
      propeller: clamp(Math.floor(Number(value?.upgrades?.propeller) || 0), 0, 2),
      hull: clamp(Math.floor(Number(value?.upgrades?.hull) || 0), 0, 2),
      cargo: clamp(Math.floor(Number(value?.upgrades?.cargo) || 0), 0, 2),
    },
    wreck: value?.wreck && Number.isFinite(value.wreck.x) && Number.isFinite(value.wreck.z) ? value.wreck : null,
  };
}

const profile = normalizeProfile(loadJSON(PROFILE_KEY, defaultProfile));
const settings = { ...defaultSettings, ...loadJSON(SETTINGS_KEY, defaultSettings) };

let engine = null;
let geometries = null;
let playerMesh = null;
let listenerMesh = null;
let baseMeshes = [];
let mode = 'menu';
let state = null;
let frameId = 0;
let lastFrame = performance.now();
let lastSaveAt = 0;
let loadedChunkCenter = '';
let loadedChunks = new Map();
let activeWalls = [];
let activePickups = [];
let joystickPointer = null;
let joystickInput = { x: 0, z: 0, magnitude: 0 };
let keys = new Set();
let toastTimer = 0;
let hintTimer = 0;
let audioContext = null;
let warningTimer = 0;
let impactOpacity = 0;
let dangerOpacity = 0;

function createRun(saved = null) {
  const upgrades = profile.upgrades;
  if (saved) {
    return {
      ...saved,
      collected: new Set(saved.collected),
      maxHull: maxHull(upgrades),
      cargoLimit: cargoCapacity(upgrades),
      invulnerability: 0,
      collisionCooldown: 0,
      sonarCooldown: 0,
      sonarAge: 99,
      sonarRadius: -1000,
      dockHold: 0,
      maxDistance: Math.hypot(saved.x, saved.z),
      lastNoise: { x: saved.x, z: saved.z, strength: 0, age: 99 },
      engineNoiseTimer: 0,
      pickupHintCooldown: 0,
    };
  }

  const seed = profile.wreck?.seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  return {
    schema: 3,
    seed,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    heading: 0,
    oxygen: 100,
    hull: maxHull(upgrades),
    maxHull: maxHull(upgrades),
    sonar: 100,
    elapsed: 0,
    attention: 0,
    cargo: [],
    cargoLimit: cargoCapacity(upgrades),
    collected: new Set(),
    listener: null,
    invulnerability: 0,
    collisionCooldown: 0,
    sonarCooldown: 0,
    sonarAge: 99,
    sonarRadius: -1000,
    dockHold: 0,
    maxDistance: 0,
    lastNoise: { x: 0, z: 0, strength: 0, age: 99 },
    engineNoiseTimer: 0,
    pickupHintCooldown: 0,
  };
}

function initEngine() {
  if (engine) return true;
  try {
    engine = new DeepEngine(canvas);
    geometries = {
      box: boxGeometry(),
      octa: octaGeometry(),
      capsule: capsuleGeometry(),
      listener: listenerGeometry(),
    };
    createPermanentMeshes();
    appShell.dataset.ready = 'true';
    return true;
  } catch (error) {
    console.error('ГЛУБИНА 13: WebGL не запустился', error);
    fallback.hidden = false;
    appShell.dataset.ready = 'error';
    return false;
  }
}

function createPermanentMeshes() {
  playerMesh = engine.createMesh(geometries.capsule);
  playerMesh.scale = [0.62, 0.72, 0.92];
  playerMesh.color = palette.capsule;
  playerMesh.always = 0.65;
  playerMesh.edgeVisibility = 0.9;

  listenerMesh = engine.createMesh(geometries.listener);
  listenerMesh.scale = [0.85, 1.05, 0.85];
  listenerMesh.color = palette.listener;
  listenerMesh.visibility = 0;
  listenerMesh.edgeVisibility = 1;

  const baseParts = [
    [-5.4, 1.7, 0, 0.45, 2.8, 3.8],
    [5.4, 1.7, 0, 0.45, 2.8, 3.8],
    [0, 4.3, 0, 5.8, 0.4, 3.8],
    [0, -0.9, 0, 5.8, 0.18, 3.8],
  ];
  for (const [x, y, z, sx, sy, sz] of baseParts) {
    const mesh = engine.createMesh(geometries.box);
    mesh.position = [x, y, z];
    mesh.scale = [sx, sy, sz];
    mesh.color = palette.base;
    mesh.always = 0.54;
    mesh.edgeVisibility = 1;
    baseMeshes.push(mesh);
  }
  const beacon = engine.createMesh(geometries.octa);
  beacon.position = [0, 6.2, 0];
  beacon.scale = [0.48, 2.2, 0.48];
  beacon.color = palette.base;
  beacon.emissive = 0.45;
  beacon.always = 0.7;
  baseMeshes.push(beacon);
}

function removeChunk(record) {
  for (const mesh of record.meshes) engine.remove(mesh);
}

function rebuildActiveLists() {
  activeWalls = [];
  activePickups = [];
  for (const record of loadedChunks.values()) {
    activeWalls.push(...record.data.walls);
    activePickups.push(...record.pickups);
  }
}

function pickupColor(type) {
  return palette[type] || palette.relic;
}

function addChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (loadedChunks.has(key)) return;
  const data = generateChunk(state.seed, cx, cz, profile.wreck);
  const meshes = [];
  const pickupRecords = [];

  const floor = engine.createMesh(geometries.box);
  floor.position = [cx * CHUNK_SIZE, -1.35, cz * CHUNK_SIZE];
  floor.scale = [CHUNK_SIZE / 2, 0.12, CHUNK_SIZE / 2];
  floor.color = [...palette.floor];
  floor.edgeVisibility = 0.06;
  floor.always = 0.04;
  meshes.push(floor);

  for (const wall of data.walls) {
    const mesh = engine.createMesh(geometries.box);
    mesh.position = [wall.x, wall.h / 2 - 1.1, wall.z];
    mesh.scale = [wall.w / 2, wall.h / 2, wall.d / 2];
    mesh.rotation = [0, wall.yaw, 0];
    mesh.color = wall.kind === 'stone' ? [...palette.stone] : [...palette.ruin];
    mesh.edgeVisibility = wall.kind === 'stone' ? 0.42 : 0.72;
    meshes.push(mesh);
  }

  for (const item of data.decor) {
    const mesh = engine.createMesh(geometries.octa);
    mesh.position = [item.x, item.h / 2 - 1, item.z];
    mesh.scale = [0.5, item.h / 2, 0.5];
    mesh.rotation = [0, item.spin, 0];
    mesh.color = [...palette.ruin];
    mesh.edgeVisibility = 0.7;
    meshes.push(mesh);
  }

  for (const pickup of data.pickups) {
    const mesh = engine.createMesh(geometries.octa);
    mesh.position = [pickup.x, 0.2, pickup.z];
    mesh.scale = pickup.type === 'wreck' ? [0.82, 0.55, 0.82] : [0.42, 0.58, 0.42];
    mesh.color = [...pickupColor(pickup.type)];
    mesh.emissive = pickup.type === 'oxygen' ? 0.12 : 0.035;
    mesh.edgeVisibility = 1;
    if (state.collected.has(pickup.id)) mesh.visibility = 0;
    meshes.push(mesh);
    pickupRecords.push({ ...pickup, mesh, spin: Math.random() * Math.PI * 2 });
  }

  loadedChunks.set(key, { data, meshes, pickups: pickupRecords });
}

function loadChunksAroundPlayer(force = false) {
  if (!state || !engine) return;
  const centerX = chunkCoordinate(state.x);
  const centerZ = chunkCoordinate(state.z);
  const centerKey = `${centerX}:${centerZ}`;
  if (!force && centerKey === loadedChunkCenter) return;
  loadedChunkCenter = centerKey;
  const wanted = new Set();
  for (let dz = -2; dz <= 2; dz += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const key = chunkKey(centerX + dx, centerZ + dz);
      wanted.add(key);
      addChunk(centerX + dx, centerZ + dz);
    }
  }
  for (const [key, record] of loadedChunks) {
    if (wanted.has(key)) continue;
    removeChunk(record);
    loadedChunks.delete(key);
  }
  rebuildActiveLists();
}

function clearWorld() {
  for (const record of loadedChunks.values()) removeChunk(record);
  loadedChunks.clear();
  activeWalls = [];
  activePickups = [];
  loadedChunkCenter = '';
  if (listenerMesh) listenerMesh.visibility = 0;
}

function startNewRun(showTutorial = true) {
  if (!initEngine()) return;
  clearWorld();
  state = createRun();
  loadChunksAroundPlayer(true);
  enterPlaying();
  clearSavedRun();
  if (showTutorial && !settings.tutorialSeen) {
    mode = 'tutorial';
    tutorialOverlay.hidden = false;
  } else {
    showHint('ПЕРВАЯ РЕЛИКВИЯ · 20 М НА СЕВЕР');
  }
}

function resumeSavedRun() {
  const saved = sanitizeSavedRun(loadJSON(RUN_KEY, null));
  if (!saved || !initEngine()) {
    clearSavedRun();
    startNewRun();
    return;
  }
  clearWorld();
  state = createRun(saved);
  loadChunksAroundPlayer(true);
  enterPlaying();
  showHint('ЭКСПЕДИЦИЯ ВОССТАНОВЛЕНА');
}

function enterPlaying() {
  mode = 'playing';
  menuOverlay.hidden = true;
  tutorialOverlay.hidden = true;
  pauseOverlay.hidden = true;
  resultOverlay.hidden = true;
  pauseButton.hidden = false;
  lastFrame = performance.now();
  ensureLoop();
  updateHUD();
}

function showMenu() {
  mode = 'menu';
  menuOverlay.hidden = false;
  tutorialOverlay.hidden = true;
  pauseOverlay.hidden = true;
  resultOverlay.hidden = true;
  pauseButton.hidden = true;
  resetJoystick();
  refreshMenu();
  ensureLoop();
}

function pauseGame() {
  if (mode !== 'playing') return;
  mode = 'paused';
  resetJoystick();
  pauseDistance.textContent = `${Math.floor(Math.hypot(state.x, state.z))} м`;
  pauseCargo.textContent = `${state.cargo.length} / ${state.cargoLimit}`;
  pauseOverlay.hidden = false;
  saveRun();
}

function continueGame() {
  if (mode !== 'paused') return;
  mode = 'playing';
  pauseOverlay.hidden = true;
  lastFrame = performance.now();
  ensureLoop();
}

function serializeRun() {
  return {
    schema: 3,
    seed: state.seed,
    x: state.x,
    z: state.z,
    vx: state.vx,
    vz: state.vz,
    heading: state.heading,
    oxygen: state.oxygen,
    hull: state.hull,
    sonar: state.sonar,
    elapsed: state.elapsed,
    attention: state.attention,
    cargo: state.cargo,
    collected: [...state.collected],
    listener: state.listener,
    savedAt: Date.now(),
  };
}

function saveRun() {
  if (!state || !['playing', 'paused', 'tutorial'].includes(mode)) return;
  saveJSON(RUN_KEY, serializeRun());
  refreshResume();
}

function clearSavedRun() {
  localStorage.removeItem(RUN_KEY);
  refreshResume();
}

function refreshResume() {
  const saved = sanitizeSavedRun(loadJSON(RUN_KEY, null));
  resumeButton.hidden = !saved;
  if (saved) resumeMeta.textContent = `${Math.floor(Math.hypot(saved.x, saved.z))} м · груз ${saved.cargo.length}`;
}

function setNoise(strength) {
  state.lastNoise = { x: state.x, z: state.z, strength, age: 0 };
}

function fireSonar() {
  if (mode !== 'playing') return;
  if (state.sonar < 28 || state.sonarCooldown > 0) {
    showToast(state.sonar < 28 ? 'СОНАР ЗАРЯЖАЕТСЯ' : 'КОНТУР ЕЩЁ НЕ ПОГАС');
    haptic(10);
    return;
  }
  state.sonar -= 28;
  state.sonarCooldown = 0.55;
  state.sonarAge = 0;
  state.sonarRadius = 0;
  state.attention = updateAttention(state.attention, { dt: 0, throttle: 0, sonar: true, noiseFactor: engineNoiseFactor(profile.upgrades) });
  setNoise(54);
  for (const mesh of engine.meshes) {
    const distance = Math.hypot(mesh.position[0] - state.x, mesh.position[2] - state.z);
    if (distance <= 48 && mesh !== listenerMesh) mesh.memory = 1;
  }
  if (state.listener && Math.hypot(state.listener.x - state.x, state.listener.z - state.z) <= 48) listenerMesh.memory = 1;
  sonarWave.classList.remove('fire');
  void sonarWave.offsetWidth;
  sonarWave.classList.add('fire');
  sound('sonar');
  haptic(22);
}

function spawnListener() {
  const baseAngle = Math.atan2(state.z, state.x) + Math.PI * (0.55 + Math.random() * 0.9);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const angle = baseAngle + (Math.random() - 0.5) * 1.2;
    const radius = 42 + Math.random() * 12;
    const x = state.x + Math.cos(angle) * radius;
    const z = state.z + Math.sin(angle) * radius;
    if (Math.hypot(x, z) < 22) continue;
    if (activeWalls.some((wall) => Math.abs(wall.x - x) < wall.w / 2 + 2 && Math.abs(wall.z - z) < wall.d / 2 + 2)) continue;
    state.listener = createListener(x, z, state.elapsed);
    state.listener.targetX = state.lastNoise.x;
    state.listener.targetZ = state.lastNoise.z;
    listenerMesh.memory = 0;
    showToast('ДАЛЬНИЙ ОТВЕТ');
    sound('warning');
    haptic([24, 90, 18]);
    return;
  }
}

function applyDamage(source) {
  if (state.invulnerability > 0) return;
  state.hull -= 1;
  state.invulnerability = source === 'listener' ? 4 : 2.8;
  state.collisionCooldown = 2.5;
  impactOpacity = 1;
  state.attention = updateAttention(state.attention, { dt: 0, throttle: 0, impact: true });
  setNoise(source === 'listener' ? 72 : 43);
  showToast(source === 'listener' ? 'УДАР · СЛУШАТЕЛЬ ОТОШЁЛ' : 'СИЛЬНЫЙ УДАР ПО КОРПУСУ');
  sound('impact');
  haptic([70, 40, 80]);
  if (state.hull <= 0) finishRun(false, 'Корпус не выдержал.');
}

function collectPickup(record) {
  if (state.collected.has(record.id)) return;
  if (record.type === 'oxygen') {
    state.collected.add(record.id);
    record.mesh.visibility = 0;
    state.oxygen = clamp(state.oxygen + 32, 0, 100);
    state.sonar = clamp(state.sonar + 20, 0, 100);
    showToast('+ ВОЗДУХ · + СОНАР');
    sound('oxygen');
    haptic([16, 30, 20]);
    return;
  }

  if (state.cargo.length >= state.cargoLimit) {
    if (state.pickupHintCooldown <= 0) {
      showToast('НЕТ СВОБОДНОГО КРЕПЛЕНИЯ');
      state.pickupHintCooldown = 2;
    }
    return;
  }

  const item = record.type === 'wreck' && record.item
    ? { ...record.item, recovered: true }
    : { type: record.type, value: record.value, id: record.id };
  state.cargo.push(item);
  state.collected.add(record.id);
  record.mesh.visibility = 0;
  state.attention = updateAttention(state.attention, { dt: 0, throttle: 0, pickup: true });
  setNoise(22);
  if (record.type === 'wreck') {
    profile.wreck = null;
    saveProfile();
  }
  showToast(`${lootLabel(record.type)} ЗАКРЕПЛЁН · ${item.value}`);
  sound('pickup');
  haptic([18, 28, 32]);
}

function finishRun(success, reason) {
  if (!state || mode === 'result') return;
  mode = 'result';
  pauseButton.hidden = true;
  resetJoystick();
  const total = state.cargo.reduce((sum, item) => sum + (item.value || 0), 0);
  profile.bestValue = Math.max(profile.bestValue, total);

  if (success) {
    profile.funds += total;
    profile.successes += 1;
    resultKicker.textContent = 'ШЛЮЗ ГЕРМЕТИЗИРОВАН';
    resultTitle.textContent = 'Груз доставлен.';
    resultValue.textContent = `${total}`;
    resultNote.textContent = total > 0 ? 'Станция приняла находки. Фонд доступен для оснащения.' : 'Капсула вернулась без груза.';
    sound('success');
    haptic([22, 45, 28, 45, 70]);
  } else {
    profile.losses += 1;
    const salvage = [...state.cargo].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
    if (salvage) profile.wreck = { seed: state.seed, x: state.x, z: state.z, item: salvage };
    resultKicker.textContent = 'СИГНАЛ КАПСУЛЫ ПОТЕРЯН';
    resultTitle.textContent = reason;
    resultValue.textContent = '0';
    resultNote.textContent = salvage ? `Чёрный ящик сохранил: ${lootLabel(salvage.type)}.` : 'В этот раз глубина не оставила полезного груза.';
    sound('failure');
    haptic([90, 60, 110]);
  }

  resultCargo.textContent = `${state.cargo.length}`;
  resultDistance.textContent = `${Math.floor(state.maxDistance)} м`;
  saveProfile();
  clearSavedRun();
  resultOverlay.hidden = false;
  updateHUD();
}

function saveProfile() {
  saveJSON(PROFILE_KEY, profile);
  refreshMenu();
}

function updateInput(dt) {
  let inputX = joystickInput.x;
  let inputZ = joystickInput.z;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) inputX -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) inputX += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) inputZ -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) inputZ += 1;
  const rawMagnitude = Math.hypot(inputX, inputZ);
  if (rawMagnitude > 1) {
    inputX /= rawMagnitude;
    inputZ /= rawMagnitude;
  }
  const magnitude = clamp(rawMagnitude, 0, 1);
  const speed = magnitude < 0.55 ? 2.65 * (magnitude / 0.55) : 2.65 + ((magnitude - 0.55) / 0.45) * 2.65;
  const targetVX = inputX * speed;
  const targetVZ = inputZ * speed;
  const response = settings.motion ? 1 - Math.exp(-5.2 * dt) : 1;
  state.vx += (targetVX - state.vx) * response;
  state.vz += (targetVZ - state.vz) * response;
  if (magnitude < 0.03) {
    const drag = Math.exp(-3.8 * dt);
    state.vx *= drag;
    state.vz *= drag;
  }
  return magnitude;
}

function updateGame(dt) {
  const throttle = updateInput(dt);
  const speedBefore = Math.hypot(state.vx, state.vz);
  const moved = moveWithCollisions(
    { x: state.x, z: state.z },
    { x: state.vx * dt, z: state.vz * dt },
    activeWalls,
  );
  state.x = moved.x;
  state.z = moved.z;

  if (moved.collided) {
    if (speedBefore > 4.35 && state.collisionCooldown <= 0) applyDamage('wall');
    state.vx *= 0.16;
    state.vz *= 0.16;
  }

  const speed = Math.hypot(state.vx, state.vz);
  if (speed > 0.08) {
    const targetHeading = Math.atan2(state.vx, -state.vz);
    const delta = Math.atan2(Math.sin(targetHeading - state.heading), Math.cos(targetHeading - state.heading));
    state.heading += delta * Math.min(1, dt * 7);
  }

  state.elapsed += dt;
  state.maxDistance = Math.max(state.maxDistance, Math.hypot(state.x, state.z));
  state.invulnerability = Math.max(0, state.invulnerability - dt);
  state.collisionCooldown = Math.max(0, state.collisionCooldown - dt);
  state.sonarCooldown = Math.max(0, state.sonarCooldown - dt);
  state.pickupHintCooldown = Math.max(0, state.pickupHintCooldown - dt);
  state.sonar = clamp(state.sonar + dt * 8.6, 0, 100);
  state.sonarAge += dt;
  state.sonarRadius = state.sonarAge < 1.45 ? state.sonarAge * 34 : -1000;
  state.lastNoise.age += dt;
  state.engineNoiseTimer -= dt;
  const noiseFactor = engineNoiseFactor(profile.upgrades);
  state.attention = updateAttention(state.attention, { dt, throttle, noiseFactor });

  if (throttle > 0.68 && state.engineNoiseTimer <= 0) {
    setNoise((18 + throttle * 25) * noiseFactor);
    state.engineNoiseTimer = 0.58;
  }

  const baseDistance = Math.hypot(state.x, state.z);
  const oxygenDrain = 0.19 + speed * 0.022 + state.cargo.length * 0.018;
  state.oxygen = clamp(state.oxygen - oxygenDrain * dt, 0, 100);
  if (baseDistance < BASE_RADIUS && state.cargo.length === 0) state.oxygen = clamp(state.oxygen + 4.2 * dt, 0, 100);
  if (state.oxygen <= 0) finishRun(false, 'Воздух закончился.');

  loadChunksAroundPlayer();
  updatePickups(dt, speed);

  if (!state.listener && attentionSpawnReady({
    elapsed: state.elapsed,
    distanceFromBase: baseDistance,
    cargoCount: state.cargo.length,
    attention: state.attention,
    successes: profile.successes,
  })) spawnListener();

  if (state.listener) {
    const outcome = stepListener(state.listener, {
      player: { x: state.x, z: state.z },
      noise: state.lastNoise,
      elapsed: state.elapsed,
      playerInvulnerability: state.invulnerability,
    }, dt);
    state.listener = outcome.listener;
    if (outcome.hit) applyDamage('listener');
  }

  if (state.cargo.length > 0 && baseDistance < BASE_RADIUS - 1.5 && speed < 0.48) {
    state.dockHold += dt;
    if (state.dockHold >= 1.5) finishRun(true, 'Груз доставлен.');
  } else {
    state.dockHold = Math.max(0, state.dockHold - dt * 2.5);
  }

  for (const mesh of engine.meshes) mesh.memory = Math.max(0, mesh.memory - dt / 8);
  listenerMesh.memory = Math.max(0, listenerMesh.memory - dt / 2.4);
  impactOpacity = Math.max(0, impactOpacity - dt * 2.4);
  dangerOpacity = Math.max(0, dangerOpacity - dt * 2.1);
  updateScene(dt);
  updateHUD();

  if (performance.now() - lastSaveAt > 5000) {
    saveRun();
    lastSaveAt = performance.now();
  }
}

function updatePickups(dt, speed) {
  let nearest = null;
  for (const record of activePickups) {
    if (state.collected.has(record.id)) continue;
    record.spin += dt * (record.type === 'idol' ? 0.9 : 1.5);
    record.mesh.rotation = [record.spin * 0.3, record.spin, record.spin * 0.17];
    record.mesh.position[1] = 0.18 + Math.sin(record.spin * 1.8) * 0.12;
    const distance = Math.hypot(record.x - state.x, record.z - state.z);
    if (!nearest || distance < nearest.distance) nearest = { record, distance };
    if (distance < 1.42 && speed < 1.65) collectPickup(record);
  }

  if (nearest && nearest.distance < 7) {
    const label = nearest.record.type === 'oxygen' ? 'КИСЛОРОДНЫЙ МОДУЛЬ' : lootLabel(nearest.record.type);
    showContext(`${label} · СБРОСЬ СКОРОСТЬ ДЛЯ ЗАХВАТА`);
  } else if (state.cargo.length > 0 && Math.hypot(state.x, state.z) < 12) {
    showContext('ВОЙДИ В ШЛЮЗ И ОСТАНОВИСЬ');
  } else {
    hideContext();
  }
}

function updateScene(dt) {
  playerMesh.position = [state.x, -0.05, state.z];
  playerMesh.rotation = [Math.sin(state.elapsed * 1.7) * 0.025, state.heading, -state.vx * 0.025];
  playerMesh.emissive = state.invulnerability > 0 ? 0.18 + Math.sin(state.elapsed * 16) * 0.1 : 0.04;

  if (state.listener) {
    listenerMesh.visibility = 1;
    listenerMesh.position = [state.listener.x, 0.15, state.listener.z];
    listenerMesh.rotation = [0, state.listener.phase * 0.8, state.listener.phase * 0.35];
    const distance = Math.hypot(state.listener.x - state.x, state.listener.z - state.z);
    listenerMesh.emissive = distance < 6 ? 0.12 : 0;
    if (distance < 12) dangerOpacity = Math.max(dangerOpacity, (12 - distance) / 12 * 0.52);
    warningTimer -= dt;
    if (distance < 20 && warningTimer <= 0) {
      sound('echo');
      haptic(distance < 10 ? [18, 45, 14] : 10);
      warningTimer = distance < 10 ? 1.8 : 3.2;
    }
  } else {
    listenerMesh.visibility = 0;
  }

  engine.player = { x: state.x, z: state.z };
  const cameraEase = settings.motion ? 1 - Math.exp(-5.5 * dt) : 1;
  const desiredEye = [state.x + state.vx * 0.15, 14.2, state.z + 15.6 + state.vz * 0.12];
  const desiredTarget = [state.x + state.vx * 0.4, -0.1, state.z - 3.3 + state.vz * 0.38];
  for (let index = 0; index < 3; index += 1) {
    engine.camera.eye[index] += (desiredEye[index] - engine.camera.eye[index]) * cameraEase;
    engine.camera.target[index] += (desiredTarget[index] - engine.camera.target[index]) * cameraEase;
  }
  const shake = state.invulnerability > 0 && settings.motion ? 0.07 : 0;
  engine.camera.shakeX = (Math.random() - 0.5) * shake;
  engine.camera.shakeZ = (Math.random() - 0.5) * shake;
  engine.sonarRadius = state.sonarRadius;
  engine.sonarStrength = state.sonarAge < 1.45 ? clamp(1.35 - state.sonarAge * 0.5, 0.35, 1.35) : 0;
}

function updateHUD() {
  if (!state) {
    refreshMenu();
    return;
  }
  const baseDistance = Math.hypot(state.x, state.z);
  baseDistanceValue.textContent = `${Math.floor(baseDistance)}`;
  const bearing = Math.atan2(-state.x, state.z) * 180 / Math.PI;
  bearingArrow.style.transform = `rotate(${bearing}deg)`;
  oxygenValue.textContent = `${Math.ceil(state.oxygen)}`;
  oxygenFill.style.transform = `scaleX(${state.oxygen / 100})`;
  sonarValue.textContent = `${Math.floor(state.sonar)}`;
  sonarFill.style.transform = `scaleX(${state.sonar / 100})`;
  sonarButton.disabled = mode !== 'playing' || state.sonar < 28 || state.sonarCooldown > 0;
  sonarButton.dataset.ready = state.sonar >= 28 && state.sonarCooldown <= 0 ? 'true' : 'false';
  sonarCostLabel.textContent = state.sonarCooldown > 0 ? 'контур активен' : '28 ед.';

  hullMarks.innerHTML = '';
  for (let index = 0; index < state.maxHull; index += 1) {
    const mark = document.createElement('i');
    mark.dataset.alive = index < state.hull ? 'true' : 'false';
    hullMarks.append(mark);
  }

  cargoSlots.innerHTML = '';
  for (let index = 0; index < state.cargoLimit; index += 1) {
    const slot = document.createElement('i');
    const item = state.cargo[index];
    slot.dataset.filled = item ? 'true' : 'false';
    if (item) slot.dataset.type = item.type;
    cargoSlots.append(slot);
  }
  const total = state.cargo.reduce((sum, item) => sum + (item.value || 0), 0);
  cargoValue.textContent = `${total} фонд`;

  if (state.cargo.length === 0) {
    missionValue.textContent = 'НАЙТИ РЕЛИКВИЮ';
    missionHint.textContent = 'первая отметка — 20 м на север';
  } else {
    missionValue.textContent = 'ВЕРНУТЬСЯ К ШЛЮЗУ';
    missionHint.textContent = `${state.cargo.length}/${state.cargoLimit} креплений · стрелка справа`;
  }

  let echoLevel = 0;
  let label = 'ТИХО';
  if (state.listener) {
    const distance = Math.hypot(state.listener.x - state.x, state.listener.z - state.z);
    if (distance < 11) { echoLevel = 3; label = 'РЯДОМ'; }
    else if (distance < 24) { echoLevel = 2; label = 'ИЩЕТ'; }
    else { echoLevel = 1; label = 'ДАЛЕКО'; }
  } else if (state.attention > 58) {
    echoLevel = 1;
    label = 'СЛЕД';
  }
  echoPanel.dataset.level = `${echoLevel}`;
  echoLabel.textContent = label;
  dangerWash.style.opacity = `${dangerOpacity}`;
  impactFlash.style.opacity = `${impactOpacity * 0.42}`;
  dockProgress.classList.toggle('visible', state.dockHold > 0);
  dockProgress.querySelector('i').style.width = `${clamp(state.dockHold / 1.5, 0, 1) * 100}%`;
}

function refreshMenu() {
  fundsValue.textContent = `${profile.funds}`;
  successesValue.textContent = `${profile.successes}`;
  wreckNotice.hidden = !profile.wreck;
  if (profile.wreck) wreckMeta.textContent = `${lootLabel(profile.wreck.item?.type)} · ${profile.wreck.item?.value || 0} фонда`;
  startButton.querySelector('small').textContent = profile.wreck ? 'вернуться за чёрным ящиком' : 'первая реликвия гарантирована';
  for (const button of upgradeButtons) {
    const type = button.dataset.upgrade;
    const level = profile.upgrades[type];
    const cost = upgradeCost(type, level);
    const meta = button.querySelector('em');
    if (cost === null) {
      meta.textContent = 'МАКС';
      button.disabled = true;
    } else {
      meta.textContent = `${cost}`;
      button.disabled = profile.funds < cost;
    }
    button.dataset.level = `${level}`;
  }
  refreshSettings();
  refreshResume();
}

function buyUpgrade(type) {
  const level = profile.upgrades[type];
  const cost = upgradeCost(type, level);
  if (cost === null || profile.funds < cost) return;
  profile.funds -= cost;
  profile.upgrades[type] += 1;
  saveProfile();
  showToast('МОДУЛЬ УСТАНОВЛЕН');
  sound('upgrade');
  haptic([16, 28, 28]);
}

function refreshSettings() {
  for (const [button, key] of [[soundToggle, 'sound'], [hapticToggle, 'haptics'], [motionToggle, 'motion']]) {
    button.querySelector('em').textContent = settings[key] ? 'Вкл' : 'Выкл';
    button.dataset.enabled = settings[key] ? 'true' : 'false';
  }
  successesValue.textContent = `${profile.successes}`;
}

function openSettings() {
  settingsLayer.hidden = false;
  refreshSettings();
}

function closeSettings() {
  settingsLayer.hidden = true;
}

function toggleSetting(key) {
  settings[key] = !settings[key];
  saveJSON(SETTINGS_KEY, settings);
  refreshSettings();
  if (key === 'sound' && settings.sound) ensureAudio();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 1500);
}

function showHint(message) {
  contextHint.textContent = message;
  contextHint.classList.add('visible');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => { hintTimer = 0; contextHint.classList.remove('visible'); }, 4200);
}

function showContext(message) {
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = 0; }
  contextHint.textContent = message;
  contextHint.classList.add('visible');
}

function hideContext() {
  if (hintTimer) return;
  contextHint.classList.remove('visible');
}

function ensureAudio() {
  if (!settings.sound) return null;
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(frequency, duration, options = {}) {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = options.type || 'sine';
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  if (options.end) oscillator.frequency.exponentialRampToValueAtTime(options.end, context.currentTime + duration);
  gain.gain.setValueAtTime(options.volume || 0.035, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function sound(name) {
  if (!settings.sound) return;
  if (name === 'sonar') { tone(170, 0.85, { end: 620, volume: 0.06 }); tone(82, 1.1, { end: 48, volume: 0.035 }); }
  if (name === 'pickup') { tone(420, 0.13, { end: 670, volume: 0.045 }); setTimeout(() => tone(720, 0.18, { volume: 0.035 }), 80); }
  if (name === 'oxygen') { tone(250, 0.32, { end: 510, volume: 0.035 }); }
  if (name === 'impact') { tone(72, 0.42, { type: 'sawtooth', end: 38, volume: 0.075 }); }
  if (name === 'warning') { tone(96, 0.52, { end: 72, volume: 0.045 }); }
  if (name === 'echo') { tone(58, 0.26, { type: 'triangle', end: 43, volume: 0.028 }); }
  if (name === 'success') { tone(260, 0.22, { end: 390, volume: 0.045 }); setTimeout(() => tone(520, 0.38, { volume: 0.04 }), 180); }
  if (name === 'failure') { tone(110, 0.8, { end: 42, volume: 0.06 }); }
  if (name === 'upgrade') { tone(330, 0.15, { end: 520, volume: 0.04 }); }
}

function haptic(pattern) {
  if (settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function updateJoystickFromPointer(event) {
  const rect = joystick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radius = rect.width * 0.34;
  let dx = event.clientX - centerX;
  let dy = event.clientY - centerY;
  const length = Math.hypot(dx, dy);
  if (length > radius) {
    dx = dx / length * radius;
    dy = dy / length * radius;
  }
  joystickInput = { x: dx / radius, z: dy / radius, magnitude: clamp(length / radius, 0, 1) };
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  const loud = joystickInput.magnitude > 0.62;
  joystick.dataset.loud = loud ? 'true' : 'false';
  throttleLabel.textContent = loud ? 'ПОЛНЫЙ ХОД · ШУМ' : 'ТИХИЙ ХОД';
}

function resetJoystick() {
  joystickPointer = null;
  joystickInput = { x: 0, z: 0, magnitude: 0 };
  joystickKnob.style.transform = 'translate(0px, 0px)';
  joystick.dataset.loud = 'false';
  throttleLabel.textContent = 'ТИХИЙ ХОД';
}

function ensureLoop() {
  if (!frameId) frameId = requestAnimationFrame(frame);
}

function frame(now) {
  frameId = 0;
  const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
  lastFrame = now;
  if (mode === 'playing' && state) updateGame(dt);
  if (engine) {
    if (mode !== 'playing' && state) updateScene(dt);
    engine.render();
  }
  if (['playing', 'menu', 'result', 'tutorial'].includes(mode)) ensureLoop();
}

startButton.addEventListener('click', () => { ensureAudio(); startNewRun(true); });
resumeButton.addEventListener('click', () => { ensureAudio(); resumeSavedRun(); });
tutorialButton.addEventListener('click', () => {
  settings.tutorialSeen = true;
  saveJSON(SETTINGS_KEY, settings);
  tutorialOverlay.hidden = true;
  mode = 'playing';
  showHint('РЕЛИКВИЯ · 20 М ВПЕРЕДИ');
  lastFrame = performance.now();
  ensureLoop();
});
pauseButton.addEventListener('click', pauseGame);
continueButton.addEventListener('click', continueGame);
pauseSettingsButton.addEventListener('click', openSettings);
saveMenuButton.addEventListener('click', () => { saveRun(); pauseOverlay.hidden = true; showMenu(); });
restartButton.addEventListener('click', () => {
  if (restartButton.dataset.confirm === 'true') {
    restartButton.dataset.confirm = 'false';
    restartButton.textContent = 'Сбросить текущую экспедицию';
    clearSavedRun();
    startNewRun(false);
  } else {
    restartButton.dataset.confirm = 'true';
    restartButton.textContent = 'Нажать ещё раз для сброса';
    setTimeout(() => {
      restartButton.dataset.confirm = 'false';
      restartButton.textContent = 'Сбросить текущую экспедицию';
    }, 1800);
  }
});
againButton.addEventListener('click', () => { resultOverlay.hidden = true; startNewRun(false); });
resultMenuButton.addEventListener('click', () => { resultOverlay.hidden = true; showMenu(); });
settingsButton.addEventListener('click', openSettings);
settingsBackdrop.addEventListener('click', closeSettings);
closeSettingsButton.addEventListener('click', closeSettings);
soundToggle.addEventListener('click', () => toggleSetting('sound'));
hapticToggle.addEventListener('click', () => toggleSetting('haptics'));
motionToggle.addEventListener('click', () => toggleSetting('motion'));
sonarButton.addEventListener('click', fireSonar);
for (const button of upgradeButtons) button.addEventListener('click', () => buyUpgrade(button.dataset.upgrade));

clearDataButton.addEventListener('click', () => {
  if (clearDataButton.dataset.confirm === 'true') {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(RUN_KEY);
    Object.assign(profile, structuredClone(defaultProfile));
    Object.assign(settings, structuredClone(defaultSettings));
    clearDataButton.dataset.confirm = 'false';
    clearDataButton.textContent = 'Сбросить весь прогресс';
    closeSettings();
    showMenu();
    showToast('ПРОГРЕСС СБРОШЕН');
  } else {
    clearDataButton.dataset.confirm = 'true';
    clearDataButton.textContent = 'Нажать ещё раз для сброса';
    setTimeout(() => {
      clearDataButton.dataset.confirm = 'false';
      clearDataButton.textContent = 'Сбросить весь прогресс';
    }, 1800);
  }
});

joystick.addEventListener('pointerdown', (event) => {
  if (mode !== 'playing') return;
  event.preventDefault();
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateJoystickFromPointer(event);
});
joystick.addEventListener('pointermove', (event) => {
  if (joystickPointer !== event.pointerId) return;
  event.preventDefault();
  updateJoystickFromPointer(event);
});
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  joystick.addEventListener(eventName, (event) => {
    if (joystickPointer === event.pointerId) resetJoystick();
  });
}

window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Space' && !event.repeat) fireSonar();
  if (event.code === 'Escape') {
    if (!settingsLayer.hidden) closeSettings();
    else if (mode === 'playing') pauseGame();
    else if (mode === 'paused') continueGame();
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); resetJoystick(); });
window.addEventListener('pagehide', saveRun);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') pauseGame();
  if (document.hidden) saveRun();
});
window.addEventListener('appdatareset', () => {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(RUN_KEY);
  Object.assign(profile, structuredClone(defaultProfile));
  Object.assign(settings, structuredClone(defaultSettings));
  showMenu();
});

createWorkshopMode({
  appName: 'ГЛУБИНА 13',
  version: VERSION,
  cachePrefix: 'glubina-13-',
  storageNamespace: STORAGE_PREFIX,
  onReset() {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(RUN_KEY);
    window.dispatchEvent(new CustomEvent('appdatareset'));
  },
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

initEngine();
refreshMenu();
showMenu();
