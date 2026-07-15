const Y_NODES = [1320, 1130, 925, 715, 505, 295, 82];
const WORLD_CENTER = 500;
const NAMES_A = ['Тихая', 'Мокрая', 'Латунная', 'Зелёная', 'Садовая', 'Старая', 'Лунная', 'Тёплая'];
const NAMES_B = ['галерея', 'клумба', 'полка', 'арка', 'аллея', 'чаша', 'рассада', 'петля'];
const NOTES = [
  'Оранжерея собрала маршрут из нескольких связанных сцен',
  'Короткая линия рискованнее, длинная оставляет место для ошибки',
  'Рельеф здесь является частью маршрута, а не декорацией',
  'Поверхность повторится только с тем же кодом',
  'Следующая секция уже выращивается за стеклом'
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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

function buildCenterline(random, depth) {
  const centers = [WORLD_CENTER + (random() - .5) * 45];
  const widths = [300 + random() * 38];
  const turnLimit = clamp(74 + depth * 2.2, 74, 114);
  for (let index = 1; index < Y_NODES.length; index += 1) {
    const previous = centers[index - 1];
    const drift = (random() - .5) * turnLimit * 2;
    const homePull = (WORLD_CENTER - previous) * .21;
    centers.push(clamp(previous + drift + homePull, 320, 680));
    widths.push(clamp(284 + random() * 84 - depth * 1.15, 242, 365));
  }
  return {
    centerline: Y_NODES.map((y, index) => ({ x: centers[index], y })),
    widths
  };
}

function routeOutline(centerline, widths) {
  const left = [];
  const right = [];
  for (let index = 0; index < centerline.length; index += 1) {
    const previous = centerline[Math.max(0, index - 1)];
    const next = centerline[Math.min(centerline.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    left.push({ x: centerline[index].x + nx * widths[index], y: centerline[index].y + ny * widths[index] });
    right.push({ x: centerline[index].x - nx * widths[index], y: centerline[index].y - ny * widths[index] });
  }
  return [...left, ...right.reverse()];
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

function addSideBunker(blueprint, random, t, side, difficulty) {
  const length = 245 + random() * 85;
  const width = 125 + random() * 40;
  blueprint.landforms.push({ kind: 'depression', t, side, length, width, height: 6 + difficulty * .45, angle: side * (.10 + random() * .22), falloff: 1.16 + random() * .18 });
  blueprint.surfaces.push({ type: 'sand', t, side, length, width, angle: side * (.10 + random() * .22) });
  blueprint.tags.push('bunker');
}

function addHillSplit(blueprint, random, t, difficulty) {
  blueprint.landforms.push({
    kind: 'mound', t, side: (random() - .5) * .10,
    length: 360 + random() * 100,
    width: 235 + random() * 60,
    height: 18 + Math.min(18, difficulty * 1.2),
    asymmetry: (random() - .5) * .80,
    falloff: 1.28 + random() * .32
  });
  const spread = .16 + random() * .07;
  blueprint.barriers.push(
    { material: 'wood', width: 18, height: 27, points: [{ t: t - .10, side: -spread }, { t, side: -spread * 1.65 }, { t: t + .10, side: -spread }] },
    { material: 'wood', width: 18, height: 27, points: [{ t: t - .10, side: spread }, { t, side: spread * 1.65 }, { t: t + .10, side: spread }] }
  );
  blueprint.tags.push('split');
}

function addObjectBypass(blueprint, random, t, side) {
  blueprint.props.push({ kind: 'stump', t, side: side * .12, r: 68 + random() * 20, height: 76 + random() * 18 });
  blueprint.props.push({
    kind: 'rockCluster', t: t + .04, side: -side * .58, r: 58 + random() * 18,
    parts: [{ x: -20, y: 4, r: 36 }, { x: 24, y: -7, r: 29 }, { x: 5, y: 24, r: 24 }]
  });
  blueprint.surfaces.push({ type: 'moss', t: t - .02, side: side * .50, length: 300, width: 165, angle: -side * .12 });
  blueprint.tags.push('bypass');
}

function addGate(blueprint, random, t, difficulty) {
  const gap = clamp(.20 - difficulty * .004, .11, .20);
  const material = random() > .62 ? 'stone' : 'wood';
  blueprint.barriers.push(
    { material, width: material === 'stone' ? 20 : 18, height: material === 'stone' ? 30 : 27, points: [{ t, side: -.68 }, { t, side: -gap }] },
    { material, width: material === 'stone' ? 20 : 18, height: material === 'stone' ? 30 : 27, points: [{ t, side: gap }, { t, side: .68 }] }
  );
  blueprint.tags.push('gate');
}

function addWaterCauseway(blueprint, random, t, difficulty) {
  const height = 15 + Math.min(9, difficulty * .7);
  for (const side of [-.52, .52]) {
    blueprint.landforms.push({ kind: 'depression', t, side, length: 360 + random() * 60, width: 190, height, angle: -side * .16, falloff: 1.12 });
    blueprint.surfaces.push({ type: 'water', t, side, length: 350, width: 185, angle: -side * .16 });
  }
  blueprint.landforms.push({ kind: 'ridge', a: { t: t - .11, side: 0 }, b: { t: t + .12, side: 0 }, width: 142, height: 8, falloff: 2.2 });
  blueprint.barriers.push(
    { material: 'stone', width: 18, height: 30, points: [{ t: t - .12, side: -.16 }, { t, side: -.15 }, { t: t + .12, side: -.14 }] },
    { material: 'stone', width: 18, height: 30, points: [{ t: t - .12, side: .16 }, { t, side: .15 }, { t: t + .12, side: .14 }] }
  );
  blueprint.tags.push('water');
}

function addRotor(blueprint, random, t, difficulty) {
  blueprint.rotors.push({
    t,
    side: (random() - .5) * .08,
    length: clamp(250 + random() * 90 - difficulty * 2, 225, 340),
    thickness: 24 + random() * 5,
    speed: (random() > .5 ? 1 : -1) * (.34 + random() * .34 + Math.min(.18, difficulty * .012)),
    angle: (random() - .5) * .60,
    material: random() > .55 ? 'brass' : 'wood'
  });
  blueprint.tags.push('rotor');
}

function addRampChoice(blueprint, random, t, side, difficulty) {
  blueprint.landforms.push({ kind: 'slope', t, side: side * .05, length: 300 + random() * 55, width: 190, height: 18 + Math.min(10, difficulty * .7), angle: side * .05, ramp: true, launch: 300 + difficulty * 5, minLaunchSpeed: 330 + difficulty * 4 });
  addSideBunker(blueprint, random, t + .11, -side * .48, difficulty);
  blueprint.barriers.push(
    { material: 'wood', width: 18, height: 27, points: [{ t: t - .09, side: -.38 }, { t, side: -.30 }, { t: t + .09, side: -.24 }] },
    { material: 'wood', width: 18, height: 27, points: [{ t: t - .09, side: .38 }, { t, side: .30 }, { t: t + .09, side: .24 }] }
  );
  blueprint.tags.push('ramp');
}

function addTunnelShortcut(blueprint, random, difficulty) {
  const side = random() > .5 ? 1 : -1;
  blueprint.tunnel = {
    width: clamp(90 - difficulty * .5, 76, 90),
    depth: 78,
    minSpeed: 90 + difficulty * 2,
    entry: { t: .22, side: side * .60, angle: side * .08 },
    exit: { t: .67, side: -side * .48, angle: -side * .04 }
  };
  blueprint.landforms.push({ kind: 'mound', t: .60, side: -side * .45, length: 390, width: 265, height: 22 + Math.min(10, difficulty), asymmetry: side * .35, falloff: 1.34 });
  blueprint.tags.push('tunnel');
}

function addRecovery(blueprint, random, t, side) {
  blueprint.surfaces.push({ type: 'moss', t, side: side * .52, length: 300 + random() * 70, width: 165 + random() * 25, angle: -side * .14 });
  blueprint.landforms.push({ kind: 'ridge', a: { t: t - .08, side: -side * .54 }, b: { t: t + .09, side: -side * .30 }, width: 165, height: 10 + random() * 6, falloff: 1.65 });
  blueprint.tags.push('recovery');
}

function addFinalFunnel(blueprint, random, t) {
  const spread = .56 + random() * .07;
  blueprint.barriers.push(
    { material: 'wood', width: 17, height: 26, points: [{ t: t - .08, side: -spread }, { t, side: -.30 }, { t: t + .08, side: -.09 }] },
    { material: 'wood', width: 17, height: 26, points: [{ t: t - .08, side: spread }, { t, side: .30 }, { t: t + .08, side: .09 }] }
  );
  blueprint.landforms.push({ kind: 'mound', t: t - .04, side: (random() - .5) * .20, length: 260, width: 190, height: 10 + random() * 6, asymmetry: (random() - .5) * .5, falloff: 1.7 });
  blueprint.tags.push('funnel');
}

function buildScenario(random, depth) {
  const difficulty = clamp(depth, 0, 18);
  const blueprint = { theme: 'procedural-scenario', landforms: [], surfaces: [], barriers: [], props: [], rotors: [], tunnel: null, tags: ['opening'] };
  const side = random() > .5 ? 1 : -1;

  if (random() > .45) addSideBunker(blueprint, random, .18, side * .50, difficulty);
  else addRecovery(blueprint, random, .18, side);

  const decision = Math.floor(random() * 3);
  if (decision === 0) addHillSplit(blueprint, random, .35, difficulty);
  else if (decision === 1) addObjectBypass(blueprint, random, .35, side);
  else addGate(blueprint, random, .36, difficulty);

  const tunnelEligible = depth >= 4 && depth % 4 === 3 && random() > .28;
  if (tunnelEligible) addTunnelShortcut(blueprint, random, difficulty);
  else {
    const hazardPool = ['bunker', ...(depth >= 2 ? ['water', 'rotor'] : []), ...(depth >= 3 ? ['ramp'] : [])];
    const hazard = choose(random, hazardPool);
    if (hazard === 'water') addWaterCauseway(blueprint, random, .54, difficulty);
    else if (hazard === 'rotor') addRotor(blueprint, random, .54, difficulty);
    else if (hazard === 'ramp') addRampChoice(blueprint, random, .51, -side, difficulty);
    else addSideBunker(blueprint, random, .54, -side * .44, difficulty);
  }

  addRecovery(blueprint, random, .70, -side);
  if (depth >= 6 && random() > .48 && blueprint.rotors.length === 0) addRotor(blueprint, random, .75, difficulty);
  addFinalFunnel(blueprint, random, .87);
  blueprint.theme = blueprint.tags.join('-');
  return blueprint;
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
  const { centerline, widths } = buildCenterline(random, safeDepth);
  const outline = routeOutline(centerline, widths);
  const first = centerline[0];
  const second = centerline[1];
  const last = centerline.at(-1);
  const beforeLast = centerline.at(-2);
  const start = { x: first.x + (second.x - first.x) * .14, y: first.y + (second.y - first.y) * .14 };
  const hole = { x: last.x + (beforeLast.x - last.x) * .14, y: last.y + (beforeLast.y - last.y) * .14, r: 31 + (safeDepth % 5 === 4 ? 1 : 0), depth: 64 };
  const blueprint = buildScenario(random, safeDepth);
  const featureWeight = blueprint.tags.length + blueprint.rotors.length * 1.4 + (blueprint.tunnel ? 1.2 : 0);
  const par = clamp(4 + Math.floor(featureWeight / 3.6) + Math.floor(safeDepth / 8), 4, 7);
  const numericId = 1000000000 + runSeed * 100000 + safeDepth;

  return {
    id: numericId,
    section: safeDepth + 1,
    name: `${choose(random, NAMES_A)} ${choose(random, NAMES_B)}`,
    note: choose(random, NOTES),
    par,
    start,
    hole,
    centerline,
    outline,
    obstacles: [],
    zones: [],
    walls: [],
    rotors: [],
    tunnels: [],
    decorations: [],
    fireflies: safeDepth % 3 === 2 ? 10 + Math.min(16, safeDepth) : 0,
    course19Blueprint: blueprint,
    endless: { seed: runSeed, depth: safeDepth, code: formatRunCode(runSeed), scenario: blueprint.theme }
  };
}

export function inspectEndlessLevel(level) {
  const issues = [];
  if (!Array.isArray(level?.outline) || level.outline.length < 6) issues.push('outline');
  if (!Array.isArray(level?.centerline) || level.centerline.length < 6) issues.push('centerline');
  if (!pointInPolygon(level.start, level.outline)) issues.push('start-outside');
  if (!pointInPolygon(level.hole, level.outline)) issues.push('hole-outside');
  const blueprint = level?.course19Blueprint;
  if (!blueprint || !Array.isArray(blueprint.landforms) || !Array.isArray(blueprint.barriers)) issues.push('scenario');
  if ((blueprint?.tags || []).length < 4) issues.push('scenario-depth');
  const finite = JSON.stringify(level, (_, value) => typeof value === 'number' && !Number.isFinite(value) ? null : value);
  if (finite.includes(':null')) issues.push('non-finite');
  return {
    ok: issues.length === 0,
    issues,
    code: level.endless?.code,
    section: level.section,
    scenario: blueprint?.theme
  };
}
