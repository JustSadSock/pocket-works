import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';

const APP_VERSION = '1.0.0';
const STORAGE_NAMESPACE = 'pocket-works:emergence-lab';
const MAX_PARTICLES = 620;
const INITIAL_PARTICLES = 210;
const SPECIES_COLORS = ['#dc4a32', '#176f7d', '#d4a819'];
const SPECIES_NAMES = ['Vermilion', 'Teal', 'Ochre'];
const TAU = Math.PI * 2;

installMobileRuntime();

const PRESETS = {
  colony: {
    name: 'Colony',
    kin: 0.58,
    stranger: -0.18,
    reach: 70,
    swirl: 0.08,
    noise: 0.018,
    drag: 0.935,
    maxSpeed: 2.1,
    matrix: null
  },
  orbit: {
    name: 'Orbit',
    kin: -0.34,
    stranger: 0.78,
    reach: 102,
    swirl: 0.72,
    noise: 0.008,
    drag: 0.954,
    maxSpeed: 2.75,
    matrix: null
  },
  territory: {
    name: 'Territory',
    kin: 0.64,
    stranger: -0.82,
    reach: 76,
    swirl: 0.02,
    noise: 0.02,
    drag: 0.928,
    maxSpeed: 2.2,
    matrix: null
  },
  cycle: {
    name: 'Cycle',
    kin: 0.18,
    stranger: 0,
    reach: 92,
    swirl: 0.18,
    noise: 0.012,
    drag: 0.947,
    maxSpeed: 2.5,
    matrix: [
      [0.18, 0.88, -0.64],
      [-0.64, 0.18, 0.88],
      [0.88, -0.64, 0.18]
    ]
  },
  crystal: {
    name: 'Crystal',
    kin: 0.92,
    stranger: 0.34,
    reach: 48,
    swirl: -0.05,
    noise: 0.002,
    drag: 0.84,
    maxSpeed: 1.15,
    matrix: null
  }
};

const defaultState = {
  presetId: 'colony',
  config: { ...PRESETS.colony },
  paused: false,
  speed: 1,
  lifeEnabled: true,
  simTime: 0,
  world: null
};

const storage = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 1,
  defaults: defaultState
});

const stage = document.querySelector('#lab-stage');
const canvas = document.querySelector('#world');
const context = canvas?.getContext('2d', { alpha: false, desynchronized: true });
const loadingState = document.querySelector('#loading-state');
const emptyState = document.querySelector('#empty-state');
const inspector = document.querySelector('#inspector');
const toast = document.querySelector('#toast');
const mutationFlash = document.querySelector('#mutation-flash');

if (!stage || !canvas || !context) {
  throw new Error('Emergence Lab could not initialize its simulation field.');
}

const elements = {
  population: document.querySelector('#population-readout'),
  time: document.querySelector('#time-readout'),
  fps: document.querySelector('#fps-readout'),
  speciesCounts: [
    document.querySelector('#species-a-count'),
    document.querySelector('#species-b-count'),
    document.querySelector('#species-c-count')
  ],
  presetName: document.querySelector('#active-preset-name'),
  kinInput: document.querySelector('#kin-input'),
  strangerInput: document.querySelector('#stranger-input'),
  reachInput: document.querySelector('#reach-input'),
  swirlInput: document.querySelector('#swirl-input'),
  kinOutput: document.querySelector('#kin-output'),
  strangerOutput: document.querySelector('#stranger-output'),
  reachOutput: document.querySelector('#reach-output'),
  swirlOutput: document.querySelector('#swirl-output'),
  pause: document.querySelector('#pause-button'),
  step: document.querySelector('#step-button'),
  speed: document.querySelector('#speed-button'),
  speedGlyph: document.querySelector('#speed-glyph'),
  life: document.querySelector('#life-toggle'),
  undo: document.querySelector('#undo-button'),
  newDish: document.querySelector('#new-dish-button'),
  inspectTitle: document.querySelector('#inspect-title'),
  inspectAge: document.querySelector('#inspect-age'),
  inspectEnergy: document.querySelector('#inspect-energy'),
  inspectNeighbors: document.querySelector('#inspect-neighbors'),
  inspectReason: document.querySelector('#inspect-reason')
};

let width = 1;
let height = 1;
let dpr = 1;
let particles = [];
let nextParticleId = 1;
let selectedParticleId = null;
let currentTool = 'pull';
let activePointers = new Map();
let presetId = storage.get('presetId', 'colony');
let config = normalizeConfig(storage.get('config', PRESETS.colony));
let paused = Boolean(storage.get('paused', false));
let speed = [1, 2, 4].includes(storage.get('speed')) ? storage.get('speed') : 1;
let lifeEnabled = storage.get('lifeEnabled', true) !== false;
let simTime = Number(storage.get('simTime', 0)) || 0;
let lastFrame = performance.now();
let frameAccumulator = 0;
let frameCounter = 0;
let frameSampleStarted = performance.now();
let persistTimer = 0;
let toastTimer = 0;
let newDishArmedUntil = 0;
let history = [];
let fieldClearPending = true;
let renderedFrames = 0;
let inspectRefreshAt = 0;
let mutationWave = 0;
let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function normalizeConfig(value) {
  const source = value && typeof value === 'object' ? value : PRESETS.colony;
  return {
    name: typeof source.name === 'string' ? source.name : 'Custom',
    kin: clamp(Number(source.kin) || 0, -1, 1),
    stranger: clamp(Number(source.stranger) || 0, -1, 1),
    reach: clamp(Number(source.reach) || 70, 34, 124),
    swirl: clamp(Number(source.swirl) || 0, -1, 1),
    noise: clamp(Number(source.noise) || 0.015, 0, 0.08),
    drag: clamp(Number(source.drag) || 0.935, 0.8, 0.98),
    maxSpeed: clamp(Number(source.maxSpeed) || 2.1, 0.8, 3.6),
    matrix: Array.isArray(source.matrix) ? source.matrix.map((row) => row.map((item) => clamp(Number(item) || 0, -1, 1))) : null
  };
}

function createParticle(x, y, type = Math.floor(Math.random() * 3), velocityScale = 1) {
  const angle = Math.random() * TAU;
  const speedValue = randomBetween(0.15, 0.75) * velocityScale;
  return {
    id: nextParticleId++,
    x: clamp(x, 12, Math.max(12, width - 12)),
    y: clamp(y, 12, Math.max(12, height - 12)),
    vx: Math.cos(angle) * speedValue,
    vy: Math.sin(angle) * speedValue,
    type: clamp(Math.floor(type), 0, 2),
    age: randomBetween(0, 18),
    energy: randomBetween(0.72, 1.15),
    maxAge: randomBetween(95, 170),
    neighbors: 0,
    reason: 'ambient drift',
    pulse: Math.random() * TAU
  };
}

function seedColony(count = INITIAL_PARTICLES, clear = true) {
  if (clear) {
    particles = [];
    selectedParticleId = null;
    closeInspector();
  }

  const centerX = width * 0.5;
  const centerY = height * 0.48;
  for (let index = 0; index < count && particles.length < MAX_PARTICLES; index += 1) {
    const angle = Math.random() * TAU;
    const radius = Math.sqrt(Math.random()) * Math.min(width, height) * 0.31;
    particles.push(createParticle(
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
      index % 3,
      1.1
    ));
  }

  emptyState.hidden = particles.length > 0;
  fieldClearPending = true;
  updateReadouts();
  schedulePersist();
}

function restoreWorld(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.particles) || snapshot.particles.length === 0) {
    seedColony();
    return;
  }

  const restored = [];
  for (const item of snapshot.particles.slice(0, MAX_PARTICLES)) {
    if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
    const particle = createParticle(item.x * width, item.y * height, item.type, 0);
    particle.id = Number.isInteger(item.id) ? item.id : particle.id;
    particle.vx = clamp(Number(item.vx) || 0, -4, 4);
    particle.vy = clamp(Number(item.vy) || 0, -4, 4);
    particle.age = clamp(Number(item.age) || 0, 0, 300);
    particle.energy = clamp(Number(item.energy) || 1, 0, 2.5);
    particle.maxAge = clamp(Number(item.maxAge) || 130, 40, 300);
    restored.push(particle);
    nextParticleId = Math.max(nextParticleId, particle.id + 1);
  }

  particles = restored;
  if (particles.length === 0) seedColony();
  emptyState.hidden = particles.length > 0;
}

function serializeWorld() {
  return {
    width,
    height,
    particles: particles.map((particle) => ({
      id: particle.id,
      x: clamp(particle.x / Math.max(width, 1), 0, 1),
      y: clamp(particle.y / Math.max(height, 1), 0, 1),
      vx: Number(particle.vx.toFixed(3)),
      vy: Number(particle.vy.toFixed(3)),
      type: particle.type,
      age: Number(particle.age.toFixed(2)),
      energy: Number(particle.energy.toFixed(3)),
      maxAge: Number(particle.maxAge.toFixed(2))
    }))
  };
}

function persistState() {
  window.clearTimeout(persistTimer);
  persistTimer = 0;
  storage.patch({
    presetId,
    config,
    paused,
    speed,
    lifeEnabled,
    simTime,
    world: serializeWorld()
  });
}

function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistState, 1000);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1900);
}

function formatSignedRule(value) {
  const amount = Math.round(Math.abs(value) * 100);
  if (amount <= 1) return 'neutral';
  return `${value > 0 ? 'attract' : 'repel'} ${amount}`;
}

function formatSpin(value) {
  const amount = Math.round(Math.abs(value) * 100);
  if (amount <= 1) return 'none';
  return `${value > 0 ? 'clockwise' : 'counter'} ${amount}`;
}

function syncControlValues() {
  elements.kinInput.value = String(Math.round(config.kin * 100));
  elements.strangerInput.value = String(Math.round(config.stranger * 100));
  elements.reachInput.value = String(Math.round(config.reach));
  elements.swirlInput.value = String(Math.round(config.swirl * 100));
  elements.kinOutput.value = formatSignedRule(config.kin);
  elements.strangerOutput.value = formatSignedRule(config.stranger);
  elements.reachOutput.value = `${Math.round(config.reach)} px`;
  elements.swirlOutput.value = formatSpin(config.swirl);
  elements.presetName.textContent = presetId === 'custom' ? 'Custom' : (PRESETS[presetId]?.name || config.name || 'Custom');

  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.preset === presetId));
  });

  elements.pause.querySelector('span').textContent = paused ? '▶' : 'Ⅱ';
  elements.pause.querySelector('b').textContent = paused ? 'Play' : 'Pause';
  elements.step.disabled = !paused;
  elements.speedGlyph.textContent = `${speed}×`;
  elements.life.setAttribute('aria-pressed', String(lifeEnabled));
  elements.life.querySelector('b').textContent = lifeEnabled ? 'Life on' : 'Life off';
  elements.undo.disabled = history.length === 0;
}

function applyPreset(nextPresetId, announce = true) {
  const preset = PRESETS[nextPresetId];
  if (!preset) return;
  history.push({ presetId, config: structuredClone(config) });
  if (history.length > 12) history.shift();
  presetId = nextPresetId;
  config = normalizeConfig(preset);
  syncControlValues();
  schedulePersist();
  if (announce) showToast(`${preset.name} rules loaded`);
}

function applyCustomFromInputs() {
  presetId = 'custom';
  config = {
    ...config,
    name: 'Custom',
    kin: Number(elements.kinInput.value) / 100,
    stranger: Number(elements.strangerInput.value) / 100,
    reach: Number(elements.reachInput.value),
    swirl: Number(elements.swirlInput.value) / 100,
    matrix: null
  };
  syncControlValues();
  schedulePersist();
}

function mutateRules() {
  history.push({ presetId, config: structuredClone(config) });
  if (history.length > 12) history.shift();

  const mutate = (value, range, min, max) => clamp(value + randomBetween(-range, range), min, max);
  config = {
    ...config,
    name: 'Mutation',
    kin: mutate(config.kin, 0.55, -1, 1),
    stranger: mutate(config.stranger, 0.55, -1, 1),
    reach: Math.round(mutate(config.reach, 28, 34, 124)),
    swirl: mutate(config.swirl, 0.55, -1, 1),
    noise: mutate(config.noise, 0.025, 0, 0.07),
    drag: mutate(config.drag, 0.045, 0.82, 0.975),
    maxSpeed: mutate(config.maxSpeed, 0.75, 1, 3.4),
    matrix: null
  };
  presetId = 'custom';
  mutationWave = 1;
  mutationFlash.classList.remove('is-active');
  void mutationFlash.offsetWidth;
  mutationFlash.classList.add('is-active');
  navigator.vibrate?.(18);
  syncControlValues();
  schedulePersist();
  showToast('Rules mutated. Watch the field reorganize.');
}

function undoRules() {
  const previous = history.pop();
  if (!previous) return;
  presetId = previous.presetId;
  config = normalizeConfig(previous.config);
  syncControlValues();
  schedulePersist();
  showToast('Previous rules restored');
}

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  const previousWidth = width;
  const previousHeight = height;
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.imageSmoothingEnabled = true;

  if (previousWidth > 1 && previousHeight > 1 && particles.length > 0) {
    const scaleX = width / previousWidth;
    const scaleY = height / previousHeight;
    for (const particle of particles) {
      particle.x *= scaleX;
      particle.y *= scaleY;
    }
  }
  fieldClearPending = true;
}

function gridKey(x, y) {
  return `${x}:${y}`;
}

function buildSpatialGrid(cellSize) {
  const grid = new Map();
  for (const particle of particles) {
    const cellX = Math.floor(particle.x / cellSize);
    const cellY = Math.floor(particle.y / cellSize);
    const key = gridKey(cellX, cellY);
    const bucket = grid.get(key);
    if (bucket) bucket.push(particle);
    else grid.set(key, [particle]);
  }
  return grid;
}

function interactionStrength(a, b) {
  if (config.matrix) return config.matrix[a.type]?.[b.type] ?? 0;
  return a.type === b.type ? config.kin : config.stranger;
}

function pointerForceFor(particle) {
  let fx = 0;
  let fy = 0;
  let influence = 0;

  for (const pointer of activePointers.values()) {
    if (pointer.mode !== 'pull' && pointer.mode !== 'push') continue;
    const dx = pointer.x - particle.x;
    const dy = pointer.y - particle.y;
    const distanceSquared = dx * dx + dy * dy;
    const radius = 170;
    if (distanceSquared <= 1 || distanceSquared > radius * radius) continue;
    const distance = Math.sqrt(distanceSquared);
    const falloff = 1 - distance / radius;
    const direction = pointer.mode === 'pull' ? 1 : -1;
    const force = direction * falloff * falloff * 0.34;
    fx += (dx / distance) * force;
    fy += (dy / distance) * force;
    influence += Math.abs(force);
  }

  return { fx, fy, influence };
}

function stepSimulation(delta = 1) {
  if (particles.length === 0) return;

  const reach = config.reach;
  const cellSize = Math.max(24, reach);
  const grid = buildSpatialGrid(cellSize);
  const births = [];
  const deaths = [];
  const padding = 13;

  for (const particle of particles) {
    const cellX = Math.floor(particle.x / cellSize);
    const cellY = Math.floor(particle.y / cellSize);
    let fx = 0;
    let fy = 0;
    let neighbors = 0;
    let kinForce = 0;
    let otherForce = 0;

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const bucket = grid.get(gridKey(cellX + offsetX, cellY + offsetY));
        if (!bucket) continue;
        for (const other of bucket) {
          if (other === particle) continue;
          const dx = other.x - particle.x;
          const dy = other.y - particle.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared <= 0.001 || distanceSquared > reach * reach) continue;

          const distance = Math.sqrt(distanceSquared);
          const nx = dx / distance;
          const ny = dy / distance;
          const normalized = distance / reach;
          let force = 0;

          if (distance < 9) {
            force -= (1 - distance / 9) * 0.62;
          }

          const strength = interactionStrength(particle, other);
          if (strength >= 0) {
            force += strength * Math.sin(Math.PI * normalized) * 0.052;
          } else {
            force += strength * Math.pow(1 - normalized, 1.4) * 0.095;
          }

          fx += nx * force;
          fy += ny * force;

          const swirlForce = config.swirl * Math.sin(Math.PI * normalized) * 0.024;
          fx += -ny * swirlForce;
          fy += nx * swirlForce;

          neighbors += 1;
          if (particle.type === other.type) kinForce += Math.abs(force);
          else otherForce += Math.abs(force);
        }
      }
    }

    const pointerForce = pointerForceFor(particle);
    fx += pointerForce.fx;
    fy += pointerForce.fy;

    const edgeRange = 42;
    let wallForce = 0;
    if (particle.x < edgeRange) {
      const force = (edgeRange - particle.x) / edgeRange * 0.18;
      fx += force;
      wallForce += force;
    } else if (particle.x > width - edgeRange) {
      const force = (particle.x - (width - edgeRange)) / edgeRange * 0.18;
      fx -= force;
      wallForce += force;
    }
    if (particle.y < edgeRange) {
      const force = (edgeRange - particle.y) / edgeRange * 0.18;
      fy += force;
      wallForce += force;
    } else if (particle.y > height - edgeRange) {
      const force = (particle.y - (height - edgeRange)) / edgeRange * 0.18;
      fy -= force;
      wallForce += force;
    }

    particle.pulse += 0.04 * delta;
    const noiseAngle = particle.pulse * 0.73 + particle.id * 1.917;
    fx += Math.cos(noiseAngle) * config.noise;
    fy += Math.sin(noiseAngle) * config.noise;

    particle.vx = (particle.vx + fx * delta) * Math.pow(config.drag, delta);
    particle.vy = (particle.vy + fy * delta) * Math.pow(config.drag, delta);

    const speedSquared = particle.vx * particle.vx + particle.vy * particle.vy;
    const maxSpeedSquared = config.maxSpeed * config.maxSpeed;
    if (speedSquared > maxSpeedSquared) {
      const scale = config.maxSpeed / Math.sqrt(speedSquared);
      particle.vx *= scale;
      particle.vy *= scale;
    }

    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;

    if (particle.x < padding) {
      particle.x = padding;
      particle.vx = Math.abs(particle.vx) * 0.72;
    } else if (particle.x > width - padding) {
      particle.x = width - padding;
      particle.vx = -Math.abs(particle.vx) * 0.72;
    }
    if (particle.y < padding) {
      particle.y = padding;
      particle.vy = Math.abs(particle.vy) * 0.72;
    } else if (particle.y > height - padding) {
      particle.y = height - padding;
      particle.vy = -Math.abs(particle.vy) * 0.72;
    }

    particle.neighbors = neighbors;

    const reasons = [
      { label: 'kin', value: kinForce },
      { label: 'other species', value: otherForce },
      { label: 'boundary', value: wallForce },
      { label: 'touch field', value: pointerForce.influence },
      { label: 'turbulence', value: config.noise * 3 }
    ].sort((a, b) => b.value - a.value);
    const strongest = reasons.filter((reason) => reason.value > 0.012).slice(0, 2).map((reason) => reason.label);
    particle.reason = strongest.length ? strongest.join(' + ') : 'inertia';

    if (lifeEnabled) {
      particle.age += 0.0075 * delta;
      const densityGain = neighbors >= 2 && neighbors <= 10 ? 0.0007 * delta : -0.00045 * delta;
      particle.energy = clamp(particle.energy + densityGain - 0.00008 * delta, 0, 2.2);

      if (
        particle.energy > 1.36 &&
        neighbors >= 3 &&
        neighbors <= 8 &&
        particles.length + births.length < MAX_PARTICLES &&
        Math.random() < 0.00042 * delta
      ) {
        particle.energy *= 0.61;
        const child = createParticle(
          particle.x + randomBetween(-7, 7),
          particle.y + randomBetween(-7, 7),
          Math.random() < 0.035 ? (particle.type + 1 + Math.floor(Math.random() * 2)) % 3 : particle.type,
          0.65
        );
        child.energy = 0.76;
        births.push(child);
      }

      if (particle.age > particle.maxAge || particle.energy <= 0.03) deaths.push(particle.id);
    }
  }

  if (deaths.length > 0) {
    const dead = new Set(deaths);
    particles = particles.filter((particle) => !dead.has(particle.id));
    if (selectedParticleId && dead.has(selectedParticleId)) closeInspector();
  }
  if (births.length > 0) particles.push(...births);

  simTime += 0.01667 * delta;
  emptyState.hidden = particles.length > 0;
}

function drawParticle(particle) {
  const color = SPECIES_COLORS[particle.type];
  const speedValue = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
  const radius = 3.1 + clamp(particle.energy, 0, 1.8) * 1.15;

  if (!reducedMotion && speedValue > 0.5) {
    context.globalAlpha = clamp(speedValue / 5, 0.08, 0.24);
    context.strokeStyle = color;
    context.lineWidth = radius * 0.75;
    context.beginPath();
    context.moveTo(particle.x, particle.y);
    context.lineTo(particle.x - particle.vx * 4.6, particle.y - particle.vy * 4.6);
    context.stroke();
  }

  context.globalAlpha = 0.96;
  context.fillStyle = color;
  context.strokeStyle = '#171714';
  context.lineWidth = 0.65;
  context.beginPath();
  if (particle.type === 0) {
    context.arc(particle.x, particle.y, radius, 0, TAU);
  } else if (particle.type === 1) {
    context.rect(particle.x - radius, particle.y - radius, radius * 2, radius * 2);
  } else {
    context.moveTo(particle.x, particle.y - radius * 1.15);
    context.lineTo(particle.x + radius, particle.y + radius * 0.8);
    context.lineTo(particle.x - radius, particle.y + radius * 0.8);
    context.closePath();
  }
  context.fill();
  context.stroke();
}

function drawPointerFields() {
  context.save();
  for (const pointer of activePointers.values()) {
    if (pointer.mode === 'seed' || pointer.mode === 'erase' || pointer.mode === 'inspect') continue;
    const color = pointer.mode === 'pull' ? '#176f7d' : '#dc4a32';
    context.strokeStyle = color;
    context.globalAlpha = 0.38;
    context.lineWidth = 1.2;
    for (const radius of [26, 54, 88]) {
      context.beginPath();
      context.arc(pointer.x, pointer.y, radius, 0, TAU);
      context.stroke();
    }
    context.fillStyle = color;
    context.globalAlpha = 0.7;
    context.beginPath();
    context.arc(pointer.x, pointer.y, 3.5, 0, TAU);
    context.fill();
  }
  context.restore();
}

function drawSelectedParticle() {
  if (!selectedParticleId) return;
  const particle = particles.find((item) => item.id === selectedParticleId);
  if (!particle) return;
  context.save();
  context.strokeStyle = '#171714';
  context.lineWidth = 1.4;
  context.setLineDash([4, 4]);
  context.globalAlpha = 0.85;
  context.beginPath();
  context.arc(particle.x, particle.y, 13 + Math.sin(performance.now() / 180) * 2, 0, TAU);
  context.stroke();
  context.restore();
}

function renderField() {
  context.save();
  context.globalCompositeOperation = 'source-over';
  if (fieldClearPending || reducedMotion) {
    context.globalAlpha = 1;
    context.fillStyle = '#f2eddc';
    context.fillRect(0, 0, width, height);
    fieldClearPending = false;
  } else {
    context.globalAlpha = 0.2 + mutationWave * 0.13;
    context.fillStyle = '#f2eddc';
    context.fillRect(0, 0, width, height);
  }

  if (mutationWave > 0.001) {
    context.globalAlpha = mutationWave * 0.08;
    context.fillStyle = '#dc4a32';
    context.fillRect(0, 0, width, height);
    mutationWave *= 0.92;
  }

  for (const particle of particles) drawParticle(particle);
  context.globalAlpha = 1;
  drawPointerFields();
  drawSelectedParticle();
  context.restore();
}

function updateReadouts() {
  elements.population.textContent = String(particles.length);
  elements.time.textContent = simTime < 1000 ? simTime.toFixed(1) : `${(simTime / 1000).toFixed(1)}k`;
  const counts = [0, 0, 0];
  for (const particle of particles) counts[particle.type] += 1;
  counts.forEach((value, index) => { elements.speciesCounts[index].textContent = String(value); });
}

function updateInspector() {
  if (!selectedParticleId || !inspector.classList.contains('is-open')) return;
  const particle = particles.find((item) => item.id === selectedParticleId);
  if (!particle) {
    closeInspector();
    return;
  }
  elements.inspectTitle.textContent = `${SPECIES_NAMES[particle.type]} #${particle.id}`;
  elements.inspectAge.textContent = `${particle.age.toFixed(1)} u`;
  elements.inspectEnergy.textContent = `${Math.round(clamp(particle.energy / 1.5, 0, 1) * 100)}%`;
  elements.inspectNeighbors.textContent = String(particle.neighbors);
  elements.inspectReason.textContent = `Motion is currently dominated by ${particle.reason}.`;
}

function animationLoop(now) {
  const rawDelta = clamp((now - lastFrame) / 16.667, 0.2, 2.4);
  lastFrame = now;
  frameCounter += 1;
  renderedFrames += 1;

  if (!paused && document.visibilityState === 'visible') {
    const iterations = speed;
    for (let index = 0; index < iterations; index += 1) stepSimulation(rawDelta);
  }

  renderField();

  if (now - frameSampleStarted >= 500) {
    const fps = Math.round((frameCounter * 1000) / (now - frameSampleStarted));
    elements.fps.textContent = String(fps);
    frameCounter = 0;
    frameSampleStarted = now;
    updateReadouts();
  }

  if (now >= inspectRefreshAt) {
    inspectRefreshAt = now + 180;
    updateInspector();
  }

  if (renderedFrames === 2) loadingState.classList.add('is-hidden');
  requestAnimationFrame(animationLoop);
}

function findNearestParticle(x, y, radius = 28) {
  let nearest = null;
  let nearestDistance = radius * radius;
  for (const particle of particles) {
    const dx = particle.x - x;
    const dy = particle.y - y;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = particle;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function openInspectorFor(particle) {
  if (!particle) {
    showToast('No specimen under the probe');
    navigator.vibrate?.(6);
    return;
  }
  selectedParticleId = particle.id;
  inspector.classList.add('is-open');
  inspector.setAttribute('aria-hidden', 'false');
  updateInspector();
}

function closeInspector() {
  selectedParticleId = null;
  inspector.classList.remove('is-open');
  inspector.setAttribute('aria-hidden', 'true');
}

function localPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height)
  };
}

function seedAt(x, y, count = 9) {
  for (let index = 0; index < count && particles.length < MAX_PARTICLES; index += 1) {
    particles.push(createParticle(x + randomBetween(-11, 11), y + randomBetween(-11, 11), Math.floor(Math.random() * 3), 1.2));
  }
  emptyState.hidden = particles.length > 0;
  updateReadouts();
  schedulePersist();
}

function eraseAt(x, y, radius = 34) {
  const radiusSquared = radius * radius;
  particles = particles.filter((particle) => {
    const dx = particle.x - x;
    const dy = particle.y - y;
    return dx * dx + dy * dy > radiusSquared;
  });
  if (selectedParticleId && !particles.some((particle) => particle.id === selectedParticleId)) closeInspector();
  emptyState.hidden = particles.length > 0;
  updateReadouts();
  schedulePersist();
}

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  const point = localPoint(event);
  try { canvas.setPointerCapture?.(event.pointerId); } catch {}
  activePointers.set(event.pointerId, {
    ...point,
    startX: point.x,
    startY: point.y,
    mode: currentTool,
    lastActionAt: performance.now()
  });

  if (currentTool === 'seed') seedAt(point.x, point.y, 12);
  else if (currentTool === 'erase') eraseAt(point.x, point.y, 38);
});

canvas.addEventListener('pointermove', (event) => {
  const pointer = activePointers.get(event.pointerId);
  if (!pointer) return;
  event.preventDefault();
  const point = localPoint(event);
  pointer.x = point.x;
  pointer.y = point.y;

  const now = performance.now();
  if (pointer.mode === 'seed' && now - pointer.lastActionAt > 34) {
    seedAt(point.x, point.y, 3);
    pointer.lastActionAt = now;
  } else if (pointer.mode === 'erase' && now - pointer.lastActionAt > 30) {
    eraseAt(point.x, point.y, 32);
    pointer.lastActionAt = now;
  }
});

function endPointer(event) {
  const pointer = activePointers.get(event.pointerId);
  if (!pointer) return;
  activePointers.delete(event.pointerId);
  try { canvas.releasePointerCapture?.(event.pointerId); } catch {}

  if (pointer.mode === 'inspect') {
    const distance = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
    if (distance < 10) openInspectorFor(findNearestParticle(pointer.x, pointer.y));
  }
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', (event) => activePointers.delete(event.pointerId));

for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => {
    currentTool = button.dataset.tool;
    document.querySelectorAll('[data-tool]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
    });
    if (currentTool !== 'inspect') closeInspector();
    showToast(`${button.querySelector('span').textContent} tool active`);
  });
}

for (const button of document.querySelectorAll('[data-preset]')) {
  button.addEventListener('click', () => applyPreset(button.dataset.preset));
}

for (const input of [elements.kinInput, elements.strangerInput, elements.reachInput, elements.swirlInput]) {
  input.addEventListener('input', applyCustomFromInputs);
}

elements.pause.addEventListener('click', () => {
  paused = !paused;
  syncControlValues();
  schedulePersist();
  showToast(paused ? 'Simulation paused' : 'Simulation resumed');
});

elements.step.addEventListener('click', () => {
  if (!paused) return;
  stepSimulation(1);
  renderField();
  updateReadouts();
});

elements.speed.addEventListener('click', () => {
  speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
  syncControlValues();
  schedulePersist();
  showToast(`Simulation speed ${speed}×`);
});

elements.life.addEventListener('click', () => {
  lifeEnabled = !lifeEnabled;
  syncControlValues();
  schedulePersist();
  showToast(lifeEnabled ? 'Birth and death enabled' : 'Population frozen; motion continues');
});

document.querySelector('#mutation-button').addEventListener('click', mutateRules);
elements.undo.addEventListener('click', undoRules);
document.querySelector('#seed-colony-button').addEventListener('click', () => seedColony(INITIAL_PARTICLES, true));
document.querySelector('#close-inspector').addEventListener('click', closeInspector);

elements.newDish.addEventListener('click', () => {
  const now = Date.now();
  if (now > newDishArmedUntil) {
    newDishArmedUntil = now + 3500;
    elements.newDish.textContent = 'Tap again to replace';
    elements.newDish.dataset.armed = 'true';
    window.setTimeout(() => {
      if (Date.now() <= newDishArmedUntil) return;
      elements.newDish.textContent = 'New dish';
      delete elements.newDish.dataset.armed;
    }, 3600);
    return;
  }
  newDishArmedUntil = 0;
  elements.newDish.textContent = 'New dish';
  delete elements.newDish.dataset.armed;
  simTime = 0;
  seedColony(INITIAL_PARTICLES, true);
  navigator.vibrate?.(12);
  showToast('Fresh dish seeded');
});

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(stage);
window.addEventListener('resize', resizeCanvas, { passive: true });
window.visualViewport?.addEventListener('resize', resizeCanvas, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    activePointers.clear();
    persistState();
  } else {
    lastFrame = performance.now();
    fieldClearPending = true;
  }
});
window.addEventListener('pagehide', persistState);
window.addEventListener('beforeunload', persistState);

window.addEventListener('appdatareset', () => {
  presetId = 'colony';
  config = normalizeConfig(PRESETS.colony);
  paused = false;
  speed = 1;
  lifeEnabled = true;
  simTime = 0;
  history = [];
  seedColony(INITIAL_PARTICLES, true);
  syncControlValues();
});

createWorkshopMode({
  appName: 'Emergence Lab',
  version: APP_VERSION,
  cachePrefix: 'emergence-lab-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset() {
    storage.reset();
    window.dispatchEvent(new CustomEvent('appdatareset'));
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
  const label = document.querySelector('#network-state span');
  if (label) label.textContent = online ? 'online' : 'offline ready';
});

resizeCanvas();
restoreWorld(storage.get('world'));
syncControlValues();
updateReadouts();
requestAnimationFrame(animationLoop);
