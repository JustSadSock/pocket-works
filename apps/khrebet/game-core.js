export const CHUNK_LENGTH = 48;
export const START_ALTITUDE = 12;
export const RUN_SAVE_VERSION = 2;
export const AIRCRAFT_CORE_RADIUS = 0.24;

export const DAMAGE_DEFAULTS = Object.freeze({
  leftWing: 100,
  rightWing: 100,
  nose: 100,
  fold: 100,
});

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

  const setpieceIds = ['needles', 'arch', 'shelves', 'boulders', 'cables'];
  const setpiece = index < 2 ? 'open' : setpieceIds[Math.floor(random() * setpieceIds.length)];
  const setpieceLabels = {
    open: 'ОТКРЫТЫЙ ПОТОК',
    needles: 'КАМЕННЫЙ СЛАЛОМ',
    arch: 'РАЗЛОМАННАЯ АРКА',
    shelves: 'НАВИСШИЕ ПОЛКИ',
    boulders: 'КАМЕННЫЙ ДОЖДЬ',
    cables: 'СТАРЫЕ РАСТЯЖКИ',
  };
  let obstacleOrdinal = 0;
  const nextId = () => `o:${index}:${obstacleOrdinal++}`;
  const addNeedle = (z, lateral, scale = 1) => {
    const course = courseAt(z, seed);
    const radius = (1.05 + random() * (1.05 + difficulty * 0.5)) * scale;
    obstacles.push({
      id: nextId(), kind: 'needle', z,
      x: course.center + lateral * Math.max(3, course.width - radius - 2.4),
      baseY: course.floor - 0.8,
      height: (8 + random() * (11 + difficulty * 10)) * scale,
      radius,
      lean: (random() - 0.5) * 0.14,
      spin: random() * Math.PI * 2,
      hardness: 1,
    });
  };
  const addBoxObstacle = (kind, z, x, y, halfX, halfY, halfZ, extra = {}) => {
    obstacles.push({
      id: nextId(), kind, z, x, y, halfX, halfY, halfZ,
      hardness: kind === 'cable' ? 0.52 : kind === 'pillar' ? 1.08 : 0.94,
      spin: random() * Math.PI * 2,
      ...extra,
    });
  };

  if (setpiece === 'needles') {
    const count = difficulty > 0.52 ? 3 : 2;
    for (let item = 0; item < count; item += 1) {
      addNeedle(zStart + 10 + item * (26 / Math.max(1, count - 1)), (item % 2 ? 0.58 : -0.58) + (random() - 0.5) * 0.18, 0.9 + item * 0.07);
    }
  } else if (setpiece === 'arch') {
    const z = zStart + 18 + random() * 5;
    const course = courseAt(z, seed);
    const openingHalf = clamp(4.5 - difficulty * 0.7, 3.7, 4.5);
    const openingBottom = course.floor + 2.1;
    const openingTop = openingBottom + 9.4 - difficulty * 0.9;
    const pillarHalf = 1.05;
    const pillarY = course.floor + (openingTop - course.floor) * 0.5;
    const pillarHeight = (openingTop - course.floor) * 0.5;
    addBoxObstacle('pillar', z, course.center - openingHalf - pillarHalf, pillarY, pillarHalf, pillarHeight, 1.25, { group: `arch:${index}` });
    addBoxObstacle('pillar', z, course.center + openingHalf + pillarHalf, pillarY, pillarHalf, pillarHeight, 1.25, { group: `arch:${index}` });
    addBoxObstacle('beam', z, course.center, openingTop + 1.05, openingHalf + pillarHalf * 2, 1.05, 1.25, { group: `arch:${index}` });
  } else if (setpiece === 'shelves') {
    for (const [item, side] of [[0, -1], [1, 1]]) {
      const z = zStart + 12 + item * 20 + random() * 2;
      const course = courseAt(z, seed);
      const reach = course.width * (0.55 + difficulty * 0.08);
      const halfX = reach * 0.5;
      const x = course.center + side * (course.width - halfX + 0.3);
      const y = course.floor + (item ? 12.5 : 7.2) + random() * 1.4;
      addBoxObstacle('shelf', z, x, y, halfX, 0.72 + random() * 0.5, 1.65, { side });
    }
  } else if (setpiece === 'boulders') {
    const count = 3 + (difficulty > 0.62 ? 1 : 0);
    for (let item = 0; item < count; item += 1) {
      const z = zStart + 8 + item * (33 / Math.max(1, count - 1));
      const course = courseAt(z, seed);
      const radius = 1.15 + random() * (1.25 + difficulty * 0.5);
      obstacles.push({
        id: nextId(), kind: 'boulder', z,
        x: course.center + (random() * 2 - 1) * course.width * 0.68,
        y: course.floor + 4.5 + random() * (12 + difficulty * 4),
        radius,
        spin: random() * Math.PI * 2,
        hardness: 0.9,
      });
    }
  } else if (setpiece === 'cables') {
    for (let item = 0; item < 2 + (difficulty > 0.72 ? 1 : 0); item += 1) {
      const z = zStart + 11 + item * 13;
      const course = courseAt(z, seed);
      const height = item % 2 ? 13.2 : 7.1;
      addBoxObstacle('cable', z, course.center, course.floor + height, course.width * 0.86, 0.105, 0.14, { cableIndex: item });
    }
  }

  if (index >= 1 && random() > 0.13) {
    let z = zStart + 38 + random() * 5;
    if (obstacles.some((obstacle) => Math.abs(obstacle.z - z) < 5.5)) z = zStart + 6;
    const course = courseAt(z, seed);
    const riskBias = random() < 0.34 + difficulty * 0.22 ? (random() < 0.5 ? -1 : 1) : 0;
    const lateral = riskBias
      ? riskBias * course.width * (0.48 + random() * 0.16)
      : (random() * 2 - 1) * course.width * 0.42;
    gates.push({
      id: `g:${index}`,
      z,
      x: course.center + lateral,
      y: course.floor + 6.2 + random() * (6.8 + difficulty * 2),
      radius: 4.5 - difficulty * 0.35,
      yaw: (random() - 0.5) * 0.16,
    });
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

  return { index, zStart, setpiece, setpieceLabel: setpieceLabels[setpiece], gates, obstacles, wisps };
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
    pitch: -0.025,
    rollRate: 0,
    pitchRate: 0,
    angleOfAttack: 0,
    stall: 0,
  };
}

export function sanitizeDamage(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    leftWing: clamp(Number(source.leftWing ?? 100) || 0, 0, 100),
    rightWing: clamp(Number(source.rightWing ?? 100) || 0, 0, 100),
    nose: clamp(Number(source.nose ?? 100) || 0, 0, 100),
    fold: clamp(Number(source.fold ?? 100) || 0, 0, 100),
  };
}

export function damageIntegrity(value) {
  const damage = sanitizeDamage(value);
  return damage.leftWing * 0.28 + damage.rightWing * 0.28 + damage.nose * 0.18 + damage.fold * 0.26;
}

export function damageFactors(value) {
  const damage = sanitizeDamage(value);
  const left = damage.leftWing / 100;
  const right = damage.rightWing / 100;
  const fold = damage.fold / 100;
  const nose = damage.nose / 100;
  const wingAverage = (left + right) * 0.5;
  return {
    lift: clamp(wingAverage * (0.68 + fold * 0.32), 0.13, 1),
    control: clamp(Math.min(1, wingAverage * 1.12) * (0.58 + fold * 0.42), 0.16, 1),
    drag: 1 + (1 - nose) * 0.78 + (1 - fold) * 0.48 + Math.abs(left - right) * 0.42,
    rollBias: clamp((right - left) * 0.52, -0.48, 0.48),
  };
}

export function stepFlight(state, input, delta, course, difficulty = 0) {
  const dt = clamp(delta, 0, 0.05);
  const sensitivity = clamp(input.sensitivity || 1, 0.6, 1.5);
  const folded = Boolean(input.folded ?? input.boosted);
  const damage = damageFactors(input.damage);
  const rightIntent = clamp(input.x || 0, -1, 1);
  const climbIntent = -clamp(input.y || 0, -1, 1);
  const controlAuthority = damage.control * (folded ? 0.43 : 1) * sensitivity;
  const flightAngle = Math.atan2(state.vy, Math.max(6, state.speed));
  const lowSpeed = clamp((20 - state.speed) / 7, 0, 1);
  const neutralPitch = -0.02 - lowSpeed * 0.09;
  const pitchTarget = folded
    ? -0.34 + climbIntent * 0.055 * controlAuthority
    : neutralPitch + climbIntent * 0.31 * controlAuthority;
  const forcedNoseDown = (state.stall || 0) * 0.27;
  const targetPitchRate = (pitchTarget - forcedNoseDown - state.pitch) * (folded ? 4.1 : 5.3);
  state.pitchRate = damp(state.pitchRate || 0, targetPitchRate, folded ? 3.1 : 4.4, dt);
  state.pitch = clamp(state.pitch + state.pitchRate * dt, -0.52, 0.34);

  const rawAoa = state.pitch - flightAngle;
  const highAoaStall = smoothstep(0.22, 0.37, rawAoa);
  const stallTarget = clamp(Math.max(lowSpeed, highAoaStall) + (damage.lift < 0.42 ? 0.18 : 0), 0, 1);
  state.stall = damp(state.stall || 0, stallTarget, stallTarget > (state.stall || 0) ? 5.2 : 1.8, dt);
  state.angleOfAttack = damp(state.angleOfAttack || 0, rawAoa, 7, dt);

  const wingArea = damage.lift * (folded ? 0.34 : 1);
  const liftCoefficient = clamp(0.86 + state.angleOfAttack * 2.75, 0.08, 1.58) * (1 - state.stall * 0.74);
  const dynamicPressure = Math.pow(state.speed / 28, 2);
  const lift = 9.81 * dynamicPressure * wingArea * liftCoefficient;
  const bankLift = lift * Math.cos(state.bank);
  state.vy += (bankLift - 9.81) * dt;

  const inducedDrag = Math.max(0, liftCoefficient - 0.72) ** 2 * 1.9;
  const dragCoefficient = (folded ? 0.00105 : 0.00142) * damage.drag;
  const drag = 0.16 + state.speed * state.speed * dragCoefficient + inducedDrag + state.stall * 3.8;
  const gravityAlongPath = -9.81 * Math.sin(flightAngle);
  state.speed = clamp(state.speed + (gravityAlongPath - drag) * dt, 8.5, 58);

  const stallWobble = state.stall * Math.sin(state.z * 0.19 + state.speed * 0.07) * 0.13;
  const targetBank = clamp(rightIntent * 0.72 * controlAuthority + damage.rollBias + stallWobble, -0.93, 0.93);
  const targetRollRate = (targetBank - state.bank) * (folded ? 3.3 : 5.8);
  state.rollRate = damp(state.rollRate || 0, targetRollRate, folded ? 2.5 : 4.5, dt);
  state.bank = clamp(state.bank + state.rollRate * dt, -1.08, 1.08);

  const lateralLift = -Math.sin(state.bank) * lift * 0.76;
  const windPush = course.wind * (0.36 + difficulty * 0.24);
  state.vx += (lateralLift + windPush - state.vx * (folded ? 0.32 : 0.48)) * dt;
  state.vx = clamp(state.vx, -18, 18);

  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z += state.speed * dt;
  return state;
}

export function canyonClearance(state, course) {
  const left = state.x - (course.center - course.width);
  const right = (course.center + course.width) - state.x;
  const floor = state.y - (course.floor + 1.1);
  return { left, right, floor, minimum: Math.min(left, right, floor) };
}

export function obstacleClearance(state, obstacle) {
  if (obstacle.kind === 'boulder') {
    return Math.hypot(state.x - obstacle.x, state.y - obstacle.y, state.z - obstacle.z) - obstacle.radius;
  }
  if (['beam', 'pillar', 'shelf', 'cable'].includes(obstacle.kind)) {
    const qx = Math.abs(state.x - obstacle.x) - obstacle.halfX;
    const qy = Math.abs(state.y - obstacle.y) - obstacle.halfY;
    const qz = Math.abs(state.z - obstacle.z) - obstacle.halfZ;
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
    return outside + Math.min(Math.max(qx, qy, qz), 0);
  }
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

export function airframePoints(state) {
  const bank = state.bank || 0;
  const pitch = state.pitch || 0;
  const wingY = Math.sin(bank) * 0.94;
  const wingX = Math.cos(bank) * 0.94;
  return [
    { zone: 'fold', x: state.x, y: state.y, z: state.z - 0.08, radius: AIRCRAFT_CORE_RADIUS },
    { zone: 'nose', x: state.x, y: state.y + Math.sin(pitch) * 0.92, z: state.z + Math.cos(pitch) * 0.92, radius: 0.18 },
    { zone: 'leftWing', x: state.x + wingX, y: state.y + wingY, z: state.z - 0.2, radius: 0.2 },
    { zone: 'rightWing', x: state.x - wingX, y: state.y - wingY, z: state.z - 0.2, radius: 0.2 },
  ];
}

export function airframeCanyonClearance(state, course) {
  const boundaryLeft = course.center - course.width;
  const boundaryRight = course.center + course.width;
  const floorY = course.floor + 1.1;
  let best = { minimum: Infinity, side: 'floor', zone: 'fold', left: Infinity, right: Infinity, floor: Infinity };
  for (const point of airframePoints(state)) {
    const left = point.x - boundaryLeft - point.radius;
    const right = boundaryRight - point.x - point.radius;
    const floor = point.y - floorY - point.radius;
    const minimum = Math.min(left, right, floor);
    if (minimum < best.minimum) {
      best = {
        minimum,
        side: floor <= left && floor <= right ? 'floor' : left < right ? 'left' : 'right',
        zone: point.zone,
        left,
        right,
        floor,
        point,
      };
    }
  }
  return best;
}

function sweptPointClearance(previousPoint, nextPoint, obstacle) {
  const dz = nextPoint.z - previousPoint.z;
  const crossing = Math.abs(dz) > 0.000001 ? clamp((obstacle.z - previousPoint.z) / dz, 0, 1) : 0.5;
  const candidates = [0, crossing, 0.5, 1];
  let best = { clearance: Infinity, progress: crossing, x: nextPoint.x, y: nextPoint.y, z: nextPoint.z };
  for (const progress of candidates) {
    const sample = {
      x: lerp(previousPoint.x, nextPoint.x, progress),
      y: lerp(previousPoint.y, nextPoint.y, progress),
      z: lerp(previousPoint.z, nextPoint.z, progress),
    };
    const clearance = obstacleClearance(sample, obstacle) - nextPoint.radius;
    if (clearance < best.clearance) best = { clearance, progress, ...sample };
  }
  return best;
}

export function sweptAirframeClearance(previousState, nextState, obstacle) {
  const previousPoints = airframePoints(previousState);
  const nextPoints = airframePoints(nextState);
  let best = { clearance: Infinity, progress: 1, zone: 'fold', x: nextState.x, y: nextState.y, z: nextState.z };
  for (let index = 0; index < nextPoints.length; index += 1) {
    const contact = sweptPointClearance(previousPoints[index], nextPoints[index], obstacle);
    if (contact.clearance < best.clearance) best = { ...contact, zone: nextPoints[index].zone };
  }
  return best;
}

export function sweptObstacleClearance(previousState, nextState, obstacle, aircraftRadius = AIRCRAFT_CORE_RADIUS) {
  const previous = { ...previousState, radius: aircraftRadius };
  const next = { ...nextState, radius: aircraftRadius };
  return sweptPointClearance(previous, next, obstacle);
}

export function impactSeverity(speed, penetration, zone, obstacle = {}) {
  const hardness = Number.isFinite(obstacle.hardness) ? obstacle.hardness : 1;
  const zoneFactor = zone === 'nose' ? 1.12 : zone === 'fold' ? 0.94 : 0.72;
  const cableFactor = obstacle.kind === 'cable' && zone.includes('Wing') ? 1.3 : 1;
  const energy = Math.max(0, speed - 13) * 0.62 + Math.max(0, -penetration) * 11;
  return clamp(Math.round((4 + energy) * hardness * zoneFactor * cableFactor), 4, 56);
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
    rollRate: clamp(finite(sourceState.rollRate), -4, 4),
    pitchRate: clamp(finite(sourceState.pitchRate), -4, 4),
    angleOfAttack: clamp(finite(sourceState.angleOfAttack), -1, 1),
    stall: clamp(finite(sourceState.stall), 0, 1),
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
    damage: sanitizeDamage(value.damage),
    integrity: damageIntegrity(value.damage),
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
