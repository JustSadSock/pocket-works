const WORLD_CENTER = 500;
const Y_NODES = [1320, 1130, 925, 715, 505, 295, 82];
const MATERIALS = ['stone', 'pot', 'wood', 'cup', 'sugar', 'spoon'];
const DECORATIONS = ['leaf', 'mushroom', 'snail', 'frog'];
const NAMES_A = ['Тихая', 'Мокрая', 'Латунная', 'Зелёная', 'Стеклянная', 'Старая', 'Лунная', 'Тёплая'];
const NAMES_B = ['галерея', 'клумба', 'полка', 'арка', 'аллея', 'чаша', 'рассада', 'петля'];
const NOTES = [
  'Оранжерея переставила горшки, пока никто не смотрел',
  'Маршрут повторится только с тем же кодом',
  'Чем глубже путь, тем смелее механика',
  'Мох здесь растёт быстрее памяти',
  'Следующая секция уже собирается за стеклом'
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rect = (x, y, w, h, extra = {}) => ({ shape: 'rect', x, y, w, h, ...extra });
const circle = (x, y, r, extra = {}) => ({ shape: 'circle', x, y, r, ...extra });

function normalizeSeed(seed) {
  const number = Number(seed);
  if (Number.isFinite(number)) return (Math.trunc(number) >>> 0) || 1;
  let hash = 2166136261;
  for (const char of String(seed || 'moss')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function mulberry32(seed) {
  let state = normalizeSeed(seed);
  return () => {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function mixSeed(seed, depth) {
  let value = normalizeSeed(seed) ^ Math.imul(depth + 1, 0x9E3779B1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x85EBCA6B);
  value ^= value >>> 13;
  value = Math.imul(value, 0xC2B2AE35);
  value ^= value >>> 16;
  return value >>> 0;
}

function choose(random, values) {
  return values[Math.floor(random() * values.length) % values.length];
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1) : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function distanceToOutline(point, outline) {
  let distance = Infinity;
  for (let index = 0; index < outline.length; index += 1) {
    distance = Math.min(distance, distanceToSegment(point, outline[index], outline[(index + 1) % outline.length]));
  }
  return distance;
}

function interpolateProfile(profile, y) {
  for (let index = 0; index < Y_NODES.length - 1; index += 1) {
    const y0 = Y_NODES[index];
    const y1 = Y_NODES[index + 1];
    if (y <= y0 && y >= y1) {
      const t = (y0 - y) / (y0 - y1);
      return profile[index] + (profile[index + 1] - profile[index]) * t;
    }
  }
  return y > Y_NODES[0] ? profile[0] : profile[profile.length - 1];
}

function buildProfile(random, depth) {
  const centers = [WORLD_CENTER];
  const widths = [300 + random() * 38];
  const turnLimit = clamp(72 + depth * 2.5, 72, 112);
  for (let index = 1; index < Y_NODES.length; index += 1) {
    const previous = centers[index - 1];
    const drift = (random() - .5) * turnLimit * 2;
    const homePull = (WORLD_CENTER - previous) * .22;
    centers.push(clamp(previous + drift + homePull, 330, 670));
    widths.push(clamp(268 + random() * 88 - depth * 1.4, 238, 356));
  }
  return { centers, widths };
}

function makeOutline(profile) {
  const left = Y_NODES.map((y, index) => ({ x: profile.centers[index] - profile.widths[index], y }));
  const right = Y_NODES.map((y, index) => ({ x: profile.centers[index] + profile.widths[index], y })).reverse();
  return [...left, ...right];
}

function hasClearance(candidate, obstacles, start, hole, outline, extra = 0) {
  if (!pointInPolygon(candidate, outline)) return false;
  if (distanceToOutline(candidate, outline) < candidate.r + 30 + extra) return false;
  if (Math.hypot(candidate.x - start.x, candidate.y - start.y) < candidate.r + 150) return false;
  if (Math.hypot(candidate.x - hole.x, candidate.y - hole.y) < candidate.r + 150) return false;
  return obstacles.every((obstacle) => Math.hypot(candidate.x - obstacle.x, candidate.y - obstacle.y) > candidate.r + obstacle.r + 58);
}

function createObstacles(random, depth, profile, outline, start, hole) {
  const obstacles = [];
  const target = clamp(2 + Math.floor(depth / 2), 2, 7);
  let attempts = 0;
  while (obstacles.length < target && attempts < 80) {
    attempts += 1;
    const y = 1040 - random() * 720;
    const center = interpolateProfile(profile.centers, y);
    const width = interpolateProfile(profile.widths, y);
    const side = (obstacles.length + Math.floor(random() * 2)) % 2 ? 1 : -1;
    const radius = 44 + random() * clamp(42 + depth * 1.7, 42, 72);
    const candidate = circle(
      center + side * width * (.42 + random() * .18),
      y,
      radius,
      { material: choose(random, MATERIALS) }
    );
    if (hasClearance(candidate, obstacles, start, hole, outline)) obstacles.push(candidate);
  }
  return obstacles;
}

function createSurfaceZones(random, depth, profile) {
  const zones = [];
  const count = clamp(1 + Math.floor(depth / 3), 1, 3);
  const usedBands = new Set();
  for (let index = 0; index < count; index += 1) {
    let y = 0;
    let band = 0;
    do {
      band = 1 + Math.floor(random() * 4);
      y = Y_NODES[band + 1] + 22;
    } while (usedBands.has(band) && usedBands.size < 4);
    usedBands.add(band);
    const center = interpolateProfile(profile.centers, y + 72);
    const width = interpolateProfile(profile.widths, y + 72);
    const zoneWidth = width * (1.25 + random() * .35);
    const type = choose(random, depth > 3 ? ['moss', 'sand', 'slope'] : ['moss', 'sand']);
    const zone = rect(center - zoneWidth / 2, y, zoneWidth, 135 + random() * 45, { type });
    if (type === 'slope') {
      zone.forceX = (random() - .5) * (150 + depth * 4);
      zone.forceY = (random() - .5) * 65;
    }
    zones.push(zone);
  }
  return zones;
}

function createWaterCrossing(random, depth, profile, zones, walls) {
  if (depth < 2 || random() > Math.min(.18 + depth * .025, .48)) return;
  const y = 480 + random() * 260;
  const center = interpolateProfile(profile.centers, y + 95);
  const width = interpolateProfile(profile.widths, y + 95);
  const inset = 32;
  const waterWidth = width * 2 - inset * 2;
  const bridgeWidth = 112 + random() * 22;
  zones.push(rect(center - width + inset, y, waterWidth, 185, { type: 'water' }));
  zones.push(rect(center - bridgeWidth / 2, y - 8, bridgeWidth, 201, { type: 'bridge' }));
  walls.push(
    { ax: center - bridgeWidth / 2, ay: y - 8, bx: center - bridgeWidth / 2, by: y + 193, thickness: 18, material: 'glass' },
    { ax: center + bridgeWidth / 2, ay: y - 8, bx: center + bridgeWidth / 2, by: y + 193, thickness: 18, material: 'glass' }
  );
}

function createSplitGate(random, depth, profile, walls) {
  if (depth < 3 || random() > Math.min(.22 + depth * .02, .52)) return;
  const y = 350 + random() * 550;
  const center = interpolateProfile(profile.centers, y);
  const width = interpolateProfile(profile.widths, y);
  const gap = 72 + random() * 42;
  const left = center - width + 28;
  const right = center + width - 28;
  const material = random() > .55 ? 'glass' : 'wood';
  walls.push(
    { ax: left, ay: y, bx: center - gap, by: y, thickness: 20, material },
    { ax: center + gap, ay: y, bx: right, by: y, thickness: 20, material }
  );
}

function createRotor(random, depth, profile, rotors) {
  if (depth < 1 || random() > Math.min(.30 + depth * .025, .68)) return;
  const y = 430 + random() * 520;
  const center = interpolateProfile(profile.centers, y);
  const width = interpolateProfile(profile.widths, y);
  rotors.push({
    x: center,
    y,
    length: clamp(width * (1.0 + random() * .35), 240, 430),
    thickness: 24 + random() * 10,
    speed: (random() > .5 ? 1 : -1) * (.34 + random() * .52),
    angle: random() * Math.PI,
    material: random() > .5 ? 'brass' : 'wood'
  });
}

function createTunnel(random, depth, profile, tunnels) {
  if (depth < 4 || depth % 4 !== 3 || random() > .72) return;
  const entryY = 950 + random() * 150;
  const exitY = 270 + random() * 150;
  const entryCenter = interpolateProfile(profile.centers, entryY);
  const exitCenter = interpolateProfile(profile.centers, exitY);
  const entryWidth = interpolateProfile(profile.widths, entryY);
  const exitWidth = interpolateProfile(profile.widths, exitY);
  const side = random() > .5 ? 1 : -1;
  tunnels.push({
    entry: { x: entryCenter + side * entryWidth * .48, y: entryY, r: 44 },
    exit: { x: exitCenter - side * exitWidth * .42, y: exitY, r: 44 }
  });
}

function createDecorations(random, profile) {
  const decorations = [];
  for (let index = 0; index < 5; index += 1) {
    const y = 210 + random() * 930;
    const center = interpolateProfile(profile.centers, y);
    const width = interpolateProfile(profile.widths, y);
    const side = random() > .5 ? 1 : -1;
    decorations.push({
      type: choose(random, DECORATIONS),
      x: center + side * width * (.72 + random() * .12),
      y
    });
  }
  return decorations;
}

export function createRunSeed() {
  const time = Date.now() >>> 0;
  const entropy = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0xFFFFFFFF);
  return (time ^ entropy) >>> 0 || 1;
}

export function formatRunCode(seed) {
  return normalizeSeed(seed).toString(36).toUpperCase().padStart(7, '0').slice(-7);
}

export function generateEndlessLevel(seed, depth = 0) {
  const safeDepth = Math.max(0, Math.trunc(Number(depth) || 0));
  const runSeed = normalizeSeed(seed);
  const sectionSeed = mixSeed(runSeed, safeDepth);
  const random = mulberry32(sectionSeed);
  const profile = buildProfile(random, safeDepth);
  const outline = makeOutline(profile);
  const start = { x: profile.centers[0], y: 1235 };
  const hole = { x: profile.centers[profile.centers.length - 1], y: 150, r: 31 + (safeDepth % 5 === 4 ? 1 : 0) };
  const obstacles = createObstacles(random, safeDepth, profile, outline, start, hole);
  const zones = createSurfaceZones(random, safeDepth, profile);
  const walls = [];
  const rotors = [];
  const tunnels = [];
  createWaterCrossing(random, safeDepth, profile, zones, walls);
  createSplitGate(random, safeDepth, profile, walls);
  createRotor(random, safeDepth, profile, rotors);
  createTunnel(random, safeDepth, profile, tunnels);
  const decorations = createDecorations(random, profile);
  const featureWeight = obstacles.length + zones.length + walls.length * .7 + rotors.length * 1.5 + tunnels.length;
  const par = clamp(3 + Math.floor(featureWeight / 3.2), 3, 6);
  const numericId = 1000000000 + runSeed * 100000 + safeDepth;

  return {
    id: numericId,
    section: safeDepth + 1,
    name: `${choose(random, NAMES_A)} ${choose(random, NAMES_B)}`,
    note: choose(random, NOTES),
    par,
    start,
    hole,
    outline,
    obstacles,
    zones,
    walls,
    rotors,
    tunnels,
    decorations,
    fireflies: safeDepth % 3 === 2 ? 10 + Math.min(14, safeDepth) : 0,
    endless: { seed: runSeed, depth: safeDepth, code: formatRunCode(runSeed) }
  };
}

export function inspectEndlessLevel(level) {
  const issues = [];
  if (!Array.isArray(level?.outline) || level.outline.length < 6) issues.push('outline');
  if (!pointInPolygon(level.start, level.outline)) issues.push('start-outside');
  if (!pointInPolygon(level.hole, level.outline)) issues.push('hole-outside');
  if (distanceToOutline(level.start, level.outline) < 40) issues.push('start-clearance');
  if (distanceToOutline(level.hole, level.outline) < level.hole.r + 18) issues.push('hole-clearance');
  for (const obstacle of level.obstacles || []) {
    if (!hasClearance(obstacle, (level.obstacles || []).filter((item) => item !== obstacle), level.start, level.hole, level.outline, -20)) {
      issues.push('obstacle-clearance');
      break;
    }
  }
  const finite = JSON.stringify(level, (_, value) => typeof value === 'number' && !Number.isFinite(value) ? null : value);
  if (finite.includes(':null')) issues.push('non-finite');
  return { ok: issues.length === 0, issues, code: level.endless?.code, section: level.section };
}
