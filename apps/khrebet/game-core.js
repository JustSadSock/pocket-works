export const CHUNK_LENGTH = 48;
export const START_ALTITUDE = 12;
export const RUN_SAVE_VERSION = 1;
export const AIRCRAFT_CORE_RADIUS = 0.34;

export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const lerp = (from, to, amount) => from + (to - from) * amount;
export const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / Math.max(0.00001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function damp(current, target, smoothing, delta) {
  return lerp(current, target, 1 - Math.exp(-smoothing * delta));
}

export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function hashInteger(value, seed) {
  let mixed = Math.imul((value | 0) ^ (seed | 0), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed ^= mixed >>> 16;
  return (mixed >>> 0) / 4294967295;
}

function fade(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

export function noise1d(position, seed = 1) {
  const left = Math.floor(position);
  const amount = fade(position - left);
  return lerp(hashInteger(left, seed), hashInteger(left + 1, seed), amount);
}

export function seedFromText(text) {
  let hash = 2166136261;
  for (const character of String(text)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function dailySeed(date = new Date()) {
  const key = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  return seedFromText(`khrebet:${key}`);
}

export function routeCode(seed) {
  return (seed >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(-7);
}

const BIOME_IDS = Object.freeze(['alpine', 'ochre', 'glacier', 'basalt']);
const BIOME_SHAPES = Object.freeze({
  alpine: { width: 1.08, ridge: 1.06, floor: 0.15, roughness: 1 },
  ochre: { width: 0.84, ridge: 0.82, floor: -0.45, roughness: 1.28 },
  glacier: { width: 1.24, ridge: 1.24, floor: 0.65, roughness: 0.72 },
  basalt: { width: 0.94, ridge: 1.42, floor: -0.8, roughness: 1.42 },
});

function biomeIdForZone(zone, seed) {
  if (zone <= 0) return 'alpine';
  const start = 1 + Math.floor(hashInteger(911, seed ^ 0x6b10d5) * 3);
  const direction = hashInteger(1931, seed ^ 0x40a76f) > 0.5 ? 1 : 3;
  const index = (start + (zone - 1) * direction) % BIOME_IDS.length;
  return BIOME_IDS[index];
}

export function biomeAt(z, seed) {
  const zoneLength = 430;
  const position = Math.max(0, z) / zoneLength;
  const zone = Math.floor(position);
  const local = position - zone;
  const id = biomeIdForZone(zone, seed);
  const nextId = biomeIdForZone(zone + 1, seed);
  return {
    id,
    nextId,
    zone,
    local,
    blend: smoothstep(0.76, 1, local),
  };
}

export function courseAt(z, seed) {
  const seedA = (seed ^ 0x51f15e) >>> 0;
  const seedB = (seed ^ 0xa117c9) >>> 0;
  const seedC = (seed ^ 0x73bd42) >>> 0;
  const biome = biomeAt(z, seed);
  const fromShape = BIOME_SHAPES[biome.id];
  const toShape = BIOME_SHAPES[biome.nextId];
  const shape = {
    width: lerp(fromShape.width, toShape.width, biome.blend),
    ridge: lerp(fromShape.ridge, toShape.ridge, biome.blend),
    floor: lerp(fromShape.floor, toShape.floor, biome.blend),
    roughness: lerp(fromShape.roughness, toShape.roughness, biome.blend),
  };
  const longBend = (noise1d(z * 0.0065, seedA) - 0.5) * 29;
  const shortBend = (noise1d(z * 0.018 + 41.7, seedB) - 0.5) * (6.3 * shape.roughness);
  const center = longBend + shortBend + Math.sin(z * 0.004 + (seed % 97)) * 3.2;
  const width = clamp(
    (11.4 + noise1d(z * 0.014 + 13.3, seedC) * 6.4 + Math.sin(z * 0.021) * 1.2) * shape.width,
    9.8,
    22.8
  );
  const floor = -2.3 + shape.floor + (noise1d(z * 0.025 + 67, seedA) - 0.5) * (3.2 * shape.roughness);
  const leftRidge = (22 + noise1d(z * 0.016 + 8, seedB) * 21) * shape.ridge;
  const rightRidge = (20 + noise1d(z * 0.015 + 88, seedC) * 23) * shape.ridge;
  const wind = (noise1d(z * 0.03 + 101, seedA) - 0.5) * 2;
  return { center, width, floor, leftRidge, rightRidge, wind, biome };
}

export function progressDifficulty(distance) {
  return clamp(distance / 2100, 0, 1);
}

function planRandom(seed, index) {
  return mulberry32((seed ^ Math.imul(index + 2048, 0x9e3779b1)) >>> 0);
}

export function createChunkPlan(index, seed) {
  const random = planRandom(seed, index);
  const zStart = index * CHUNK_LENGTH;
  const distance = Math.max(0, zStart);
  const difficulty = progressDifficulty(distance);
  const gates = [];
  const obstacles = [];
  const wisps = [];

  if (index >= 1 && random() > 0.13) {
    const z = zStart + 27 + random() * 12;
    const course = courseAt(z, seed);
    const riskBias = random() < 0.34 + difficulty * 0.22 ? (random() < 0.5 ? -1 : 1) : 0;
    const lateral = riskBias
      ? riskBias * course.width * (0.54 + random() * 0.18)
      : (random() * 2 - 1) * course.width * 0.48;
    gates.push({
      id: `g:${index}`,
      z,
      x: course.center + lateral,
      y: course.floor + 6.2 + random() * (6.8 + difficulty * 2),
      radius: 4.5 - difficulty * 0.35,
      yaw: (random() - 0.5) * 0.16,
    });
  }

  const baseCount = index < 2 ? 0 : 1;
  const obstacleCount = baseCount + (random() < 0.5 + difficulty * 0.34 ? 1 : 0) + (difficulty > 0.58 && random() < 0.32 ? 1 : 0);
  for (let obstacleIndex = 0; obstacleIndex < obstacleCount; obstacleIndex += 1) {
    let obstacle;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const z = zStart + 7 + random() * (CHUNK_LENGTH - 13);
      const course = courseAt(z, seed);
      const radius = 1.15 + random() * (1.35 + difficulty * 0.7);
      const x = course.center + (random() * 2 - 1) * Math.max(2, course.width - radius - 2.2);
      const height = 6.5 + random() * (9 + difficulty * 11);
      const gate = gates[0];
      const tooCloseToGate = gate && Math.hypot(x - gate.x, z - gate.z) < gate.radius + radius + 3.5;
      if (!tooCloseToGate || attempt === 7) {
        obstacle = {
          id: `r:${index}:${obstacleIndex}`,
          z,
          x,
          baseY: course.floor - 0.8,
          height,
          radius,
          lean: (random() - 0.5) * 0.16,
          spin: random() * Math.PI * 2,
        };
        break;
      }
    }
    if (obstacle) obstacles.push(obstacle);
  }

  const wispCount = 2 + Math.floor(random() * 3);
  for (let wispIndex = 0; wispIndex < wispCount; wispIndex += 1) {
    const z = zStart + random() * CHUNK_LENGTH;
    const course = courseAt(z, seed);
    wisps.push({
      id: `w:${index}:${wispIndex}`,
      x: course.center + (random() * 2 - 1) * course.width * 0.8,
      y: course.floor + 4 + random() * 18,
      z,
      drift: random() * Math.PI * 2,
    });
  }

  return { index, zStart, gates, obstacles, wisps };
}

export function createFlightState() {
  return {
    x: courseAt(0, 1).center,
    y: START_ALTITUDE,
    z: 0,
    vx: 0,
    vy: 0,
    speed: 29,
    bank: 0,
    pitch: -0.05,
  };
}

export function stepFlight(state, input, delta, course, difficulty = 0) {
  const dt = clamp(delta, 0, 0.05);
  const sensitivity = clamp(input.sensitivity || 1, 0.6, 1.5);
  const boosted = Boolean(input.boosted ?? input.folded);
  // The chase camera looks along +Z, so its visual right points toward -world X.
  // Input remains screen-relative: dragging right always moves the aircraft right on screen.
  const lateralTarget = -clamp(input.x || 0, -1, 1) * (10.2 + difficulty * 2.2) * sensitivity;
  const climbIntent = -clamp(input.y || 0, -1, 1);
  const verticalTarget = climbIntent * (6.9 + difficulty * 0.4) - (boosted ? 1.35 : 0) + 0.18;
  const windPush = course.wind * (0.28 + difficulty * 0.24);

  state.vx = damp(state.vx, lateralTarget + windPush, boosted ? 4.2 : 5.8, dt);
  state.vy = damp(state.vy, verticalTarget, boosted ? 4.1 : 4.8, dt);

  const diveGain = clamp(-state.vy, 0, 10) * 0.78;
  const climbCost = clamp(state.vy, 0, 8) * 0.64;
  const speedTarget = 28.5 + difficulty * 8.5 + (boosted ? 12.5 : 0) + diveGain - climbCost;
  state.speed = damp(state.speed, clamp(speedTarget, 21, 55), boosted ? 3.1 : 2.15, dt);

  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z += state.speed * dt;
  state.bank = damp(state.bank, -state.vx * 0.049, 6.2, dt);
  state.pitch = damp(state.pitch, state.vy * 0.042 - (boosted ? 0.045 : 0), 5.1, dt);
  return state;
}

export function canyonClearance(state, course) {
  const left = state.x - (course.center - course.width);
  const right = (course.center + course.width) - state.x;
  const floor = state.y - (course.floor + 1.1);
  return { left, right, floor, minimum: Math.min(left, right, floor) };
}

export function obstacleClearance(state, obstacle) {
  const bottom = obstacle.baseY;
  const top = obstacle.baseY + obstacle.height;
  const heightAmount = clamp((state.y - bottom) / Math.max(0.001, obstacle.height), 0, 1);
  const lowerProfile = lerp(1.04, 0.66, smoothstep(0, 0.58, heightAmount));
  const upperProfile = lerp(0.66, 0.07, smoothstep(0.58, 1, heightAmount));
  const radius = obstacle.radius * (heightAmount <= 0.58 ? lowerProfile : upperProfile);
  const horizontal = Math.hypot(state.x - obstacle.x, state.z - obstacle.z) - radius;
  const vertical = state.y < bottom ? bottom - state.y : state.y > top ? state.y - top : 0;
  return vertical > 0 ? Math.hypot(horizontal, vertical) : horizontal;
}

export function sweptObstacleClearance(previousState, nextState, obstacle, aircraftRadius = AIRCRAFT_CORE_RADIUS) {
  const dx = nextState.x - previousState.x;
  const dz = nextState.z - previousState.z;
  const lengthSquared = dx * dx + dz * dz;
  const closest = lengthSquared > 0.000001
    ? clamp(((obstacle.x - previousState.x) * dx + (obstacle.z - previousState.z) * dz) / lengthSquared, 0, 1)
    : 1;
  const candidates = [0, closest, 1];
  let best = { clearance: Infinity, progress: closest, x: nextState.x, y: nextState.y, z: nextState.z };
  for (const progress of candidates) {
    const sample = {
      x: lerp(previousState.x, nextState.x, progress),
      y: lerp(previousState.y, nextState.y, progress),
      z: lerp(previousState.z, nextState.z, progress),
    };
    const clearance = obstacleClearance(sample, obstacle) - aircraftRadius;
    if (clearance < best.clearance) best = { clearance, progress, ...sample };
  }
  return best;
}

export function gateProgress(previousZ, nextZ, gate) {
  if (previousZ > gate.z || nextZ < gate.z) return null;
  const span = Math.max(0.0001, nextZ - previousZ);
  return clamp((gate.z - previousZ) / span, 0, 1);
}

export function gateHit(previousState, nextState, gate) {
  const progress = gateProgress(previousState.z, nextState.z, gate);
  if (progress === null) return false;
  const x = lerp(previousState.x, nextState.x, progress);
  const y = lerp(previousState.y, nextState.y, progress);
  return Math.hypot(x - gate.x, y - gate.y) <= gate.radius;
}

export function comboMultiplier(combo) {
  return 1 + Math.min(9, Math.max(0, combo - 1)) * 0.35;
}

export function awardScore(base, combo, flowing = false) {
  return Math.round(base * comboMultiplier(combo) * (flowing ? 2 : 1));
}

const PROFILE_DEFAULTS = Object.freeze({
  version: 1,
  tutorialSeen: false,
  flights: 0,
  bestDistance: 0,
  bestScore: 0,
  daily: {},
  settings: {
    sound: true,
    haptics: true,
    sensitivity: 1,
    effects: true,
  },
  savedRun: null,
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function sanitizeSavedRun(value) {
  if (!value || typeof value !== 'object' || value.version !== RUN_SAVE_VERSION) return null;
  if (!Number.isInteger(value.seed) || !['free', 'daily'].includes(value.mode)) return null;
  const sourceState = value.flight;
  if (!sourceState || typeof sourceState !== 'object') return null;
  const flight = {
    x: finite(sourceState.x),
    y: clamp(finite(sourceState.y, START_ALTITUDE), -20, 100),
    z: clamp(finite(sourceState.z), 0, 10000000),
    vx: clamp(finite(sourceState.vx), -80, 80),
    vy: clamp(finite(sourceState.vy), -80, 80),
    speed: clamp(finite(sourceState.speed, 27), 0, 80),
    bank: clamp(finite(sourceState.bank), -Math.PI, Math.PI),
    pitch: clamp(finite(sourceState.pitch), -Math.PI, Math.PI),
  };
  const boundedIds = (list) => Array.isArray(list)
    ? list.filter((item) => typeof item === 'string').slice(-500)
    : [];
  return {
    version: RUN_SAVE_VERSION,
    seed: value.seed >>> 0,
    mode: value.mode,
    flight,
    score: clamp(Math.floor(finite(value.score)), 0, 1000000000),
    integrity: clamp(finite(value.integrity, 100), 1, 100),
    flow: clamp(finite(value.flow), 0, 100),
    flowTime: clamp(finite(value.flowTime), 0, 12),
    combo: clamp(Math.floor(finite(value.combo, 1)), 1, 99),
    maxCombo: clamp(Math.floor(finite(value.maxCombo, 1)), 1, 99),
    comboTime: clamp(finite(value.comboTime), 0, 12),
    gates: clamp(Math.floor(finite(value.gates)), 0, 100000),
    nearMisses: clamp(Math.floor(finite(value.nearMisses)), 0, 100000),
    passed: boundedIds(value.passed),
    grazed: boundedIds(value.grazed),
    savedAt: finite(value.savedAt, Date.now()),
  };
}

export function sanitizeProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const daily = source.daily && typeof source.daily === 'object' && !Array.isArray(source.daily) ? source.daily : {};
  const cleanDaily = {};
  for (const [key, record] of Object.entries(daily).slice(-31)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !record || typeof record !== 'object') continue;
    cleanDaily[key] = {
      score: clamp(Math.floor(finite(record.score)), 0, 1000000000),
      distance: clamp(Math.floor(finite(record.distance)), 0, 10000000),
    };
  }
  return {
    ...PROFILE_DEFAULTS,
    tutorialSeen: Boolean(source.tutorialSeen),
    flights: clamp(Math.floor(finite(source.flights)), 0, 1000000),
    bestDistance: clamp(Math.floor(finite(source.bestDistance)), 0, 10000000),
    bestScore: clamp(Math.floor(finite(source.bestScore)), 0, 1000000000),
    daily: cleanDaily,
    settings: {
      sound: settings.sound !== false,
      haptics: settings.haptics !== false,
      sensitivity: [0.75, 1, 1.25].includes(settings.sensitivity) ? settings.sensitivity : 1,
      effects: settings.effects !== false,
    },
    savedRun: sanitizeSavedRun(source.savedRun),
  };
}

export function freshProfile() {
  return sanitizeProfile(null);
}
