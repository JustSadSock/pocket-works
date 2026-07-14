import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class MockClassList {
  add() {}
  remove() {}
  toggle() {}
  contains() { return false; }
}

class MockElement {
  constructor(id = '') {
    this.id = id;
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.dataset = {};
    this.children = [];
    this.classList = new MockClassList();
    this.style = { setProperty() {} };
    this.listeners = new Map();
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  after(...children) { this.children.push(...children); }
  remove() {}
  focus() {}
  select() {}
  querySelector() { return new MockElement(); }
  setAttribute() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() { return false; }
  getBoundingClientRect() {
    if (this.id === 'steeringArc') return { left: 0, top: 650, width: 210, height: 128 };
    if (this.id === 'powerGate') return { left: 290, top: 620, width: 96, height: 164 };
    return { left: 0, top: 0, width: 390, height: 844 };
  }
}

const elementMap = new Map();
const getElement = (id) => {
  if (!elementMap.has(id)) elementMap.set(id, new MockElement(id));
  return elementMap.get(id);
};

const canvas = getElement('game');
canvas.getContext = () => new Proxy({
  createRadialGradient() { return { addColorStop() {} }; },
  createLinearGradient() { return { addColorStop() {} }; },
  measureText() { return { width: 0 }; }
}, {
  get(target, property) {
    if (property in target) return target[property];
    return () => {};
  },
  set(target, property, value) { target[property] = value; return true; }
});

const trackButtons = ['mix', 'speed', 'technical', 'mountain', 'cascade'].map((value) => {
  const node = new MockElement(`track-${value}`);
  node.dataset.trackType = value;
  return node;
});
const difficultyButtons = ['rookie', 'racer', 'maniac'].map((value) => {
  const node = new MockElement(`difficulty-${value}`);
  node.dataset.difficulty = value;
  return node;
});

const storage = new Map();
const document = {
  visibilityState: 'visible',
  activeElement: null,
  documentElement: { style: { setProperty() {} } },
  head: new MockElement('head'),
  querySelector(selector) {
    if (selector.startsWith('#')) return getElement(selector.slice(1));
    return new MockElement(selector);
  },
  querySelectorAll(selector) {
    if (selector === '[data-track-type]') return trackButtons;
    if (selector === '[data-difficulty]') return difficultyButtons;
    return [];
  },
  createElement(tag) { return new MockElement(tag); },
  addEventListener() {},
  execCommand() { return true; }
};

const context = vm.createContext({
  console,
  Math,
  Date,
  Intl,
  JSON,
  Number,
  Object,
  Array,
  String,
  Boolean,
  Map,
  Set,
  Proxy,
  Promise,
  Error,
  TypeError,
  Infinity,
  NaN,
  parseInt,
  parseFloat,
  isFinite,
  document,
  navigator: { vibrate() {}, clipboard: { async writeText() {} } },
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  performance: { now: () => 1000 },
  Path2D: class Path2D { moveTo() {} lineTo() {} closePath() {} },
  requestAnimationFrame() { return 1; },
  cancelAnimationFrame() {},
  setTimeout(handler) { if (typeof handler === 'function') handler(); return 1; },
  clearTimeout() {},
  window: null
});
context.window = context;
context.window.innerWidth = 390;
context.window.devicePixelRatio = 3;
context.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
context.window.addEventListener = () => {};
context.window.visualViewport = { addEventListener() {} };

const parts = [
  ...Array.from({ length: 11 }, (_, index) => `apps/shpilka/engine-v2-${String(index + 1).padStart(2, '0')}.js`),
  'apps/shpilka/engine-v2-stability.js',
  'apps/shpilka/engine-v2-advanced.js',
  'apps/shpilka/engine-v2-advanced-fixes.js',
  'apps/shpilka/engine-v2-23-ui.js',
  'apps/shpilka/engine-v2-23.js',
  'apps/shpilka/engine-v2-23-fixes.js',
  'apps/shpilka/engine-v2-24.js',
  'apps/shpilka/engine-v2-12.js'
];

for (const file of parts) {
  const source = await readFile(file, 'utf8');
  new vm.Script(source, { filename: file }).runInContext(context);
}

const result = new vm.Script(`(() => {
  const failures = [];
  const assert = (condition, message) => { if (!condition) failures.push(message); };
  const lengths = {};
  const overtakeZones = {};

  for (const type of ['speed', 'technical', 'mountain', 'cascade']) {
    shpPrefs.trackType = type;
    lengths[type] = [];
    overtakeZones[type] = [];
    for (let i = 0; i < 80; i += 1) {
      const seed = hashSeed(0x240000 + i * 977 + type.length * 31);
      prepareRoute(seed);
      const metrics = track.shp24Metrics || shp24TrackMetrics(track);
      assert(shpActiveArchetype.id === type, type + ': wrong archetype');
      assert(track.totalLength >= 12000 && track.totalLength <= 20500, type + ': invalid length ' + track.totalLength);
      assert(lapsToWin === 2, type + ': race is not fixed to two laps');
      assert(metrics.overtakeZones >= 2, type + ': insufficient overtake zones');
      assert(metrics.longestTightRun <= 1050, type + ': tight sequence is too long');
      assert(roadWidth >= 174, type + ': road is too narrow');
      assert(track.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.heading)), type + ': non-finite geometry');
      assert(shp23MedalTargets.gold < shp23MedalTargets.silver && shp23MedalTargets.silver < shp23MedalTargets.bronze, type + ': medal targets are not ordered');
      const code = shp23RouteCode();
      const parsed = shp23ParseRouteCode(code);
      assert(parsed?.seed === (trackSeed >>> 0) && parsed?.type === type, type + ': route code round-trip failed: ' + code);
      lengths[type].push(track.totalLength);
      overtakeZones[type].push(metrics.overtakeZones);
    }
    assert(new Set(lengths[type].map((value) => Math.round(value / 40))).size >= 12, type + ': insufficient route variety');
  }

  shpPrefs.trackType = 'technical';
  prepareRoute(hashSeed(991177));
  setupRace();
  assert(lapsToWin === 2, 'setup changed the two-lap race');
  const gridSpan = Math.max(...cars.map((car) => car.progressDistance)) - Math.min(...cars.map((car) => car.progressDistance));
  assert(gridSpan > 130, 'starting grid is not stretched enough: ' + gridSpan);

  const skills = {};
  for (const difficulty of ['rookie', 'racer', 'maniac']) {
    shpPrefs.difficulty = difficulty;
    setupRace();
    skills[difficulty] = cars.slice(1).reduce((sum, car) => sum + car.skill, 0) / 4;
  }
  assert(skills.rookie < skills.racer && skills.racer < skills.maniac, 'AI difficulty pace is not monotonic');

  mode = 'race';
  shpPrefs.controlMode = 'precision';
  setupRace();
  shpAnalog.steer = 0;
  shpAnalog.throttle = 1;
  shpAnalog.brake = 0;
  for (let i = 0; i < 960; i += 1) updateSimulation(1 / 120);
  assert(cars.every((car) => [car.x, car.y, car.vx, car.vy, car.angle].every(Number.isFinite)), 'race simulation produced a non-finite car');
  assert(cars.slice(1).some((car) => car.progressDistance > 650), 'AI did not make meaningful progress');

  setupRace();
  mode = 'race';
  const a = cars[0];
  const b = cars[1];
  a.angle = 0;
  b.angle = 0;
  a.x = 0;
  a.y = 0;
  b.x = 24;
  b.y = 0;
  a.vx = 190;
  a.vy = 0;
  b.vx = -90;
  b.vy = 0;
  let peakContactSpeed = 0;
  for (let i = 0; i < 36; i += 1) {
    resolvePairCollision(a, b);
    a.x += a.vx / 120;
    a.y += a.vy / 120;
    b.x += b.vx / 120;
    b.y += b.vy / 120;
    raceElapsed += 1 / 120;
    peakContactSpeed = Math.max(peakContactSpeed, Math.hypot(a.vx, a.vy), Math.hypot(b.vx, b.vy));
  }
  assert(b.x - a.x > 40, 'sustained contact did not separate the cars');
  assert(peakContactSpeed < 380, 'sustained contact injected unstable energy: ' + peakContactSpeed);
  assert([a.vx, a.vy, a.yawRate, b.vx, b.vy, b.yawRate].every(Number.isFinite), 'contact solver produced non-finite values');

  const wallCar = cars[0];
  const wallPoint = track[wallCar.trackIndex];
  wallCar.angle = wallPoint.heading;
  const projected = CAR_HALF_WIDTH;
  const limit = roadHalf + 60 - projected;
  wallCar.x = wallPoint.x + wallPoint.nx * (limit + 6);
  wallCar.y = wallPoint.y + wallPoint.ny * (limit + 6);
  wallCar.signedRoadOffset = limit + 6;
  wallCar.vx = wallPoint.nx * 60 + wallPoint.tx * 180;
  wallCar.vy = wallPoint.ny * 60 + wallPoint.ty * 180;
  wallCar.yawRate = 0;
  resolveRoadCollision(wallCar);
  const lightOutward = wallCar.vx * wallPoint.nx + wallCar.vy * wallPoint.ny;
  assert(lightOutward <= 1, 'light wall touch still points outward: ' + lightOutward);
  assert(Math.abs(wallCar.yawRate) < 0.08, 'light wall touch spins the car: ' + wallCar.yawRate);

  setupRace();
  mode = 'race';
  player.shp24OffroadTimer = 1.17;
  player.distanceFromRoad = roadHalf + 22;
  player.angle = wrapAngle(track[player.trackIndex].heading + Math.PI);
  player.vx = 0;
  player.vy = 0;
  updateCar(player, 1 / 30);
  assert(player.shp24RecoveryImmunity > 1, 'automatic recovery did not grant contact immunity');
  assert(player.distanceFromRoad === 0, 'automatic recovery did not place the car back on track');

  return { failures, lengths, overtakeZones, skills, gridSpan, peakContactSpeed, lightOutward };
})()`).runInContext(context);

if (result.failures.length) {
  console.error('ШПИЛЬКА 2.4 audit failed:');
  result.failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}

const trackSummary = Object.fromEntries(Object.entries(result.lengths).map(([key, values]) => [key, {
  min: Math.round(Math.min(...values)),
  max: Math.round(Math.max(...values)),
  average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
  averageOvertakeZones: Number((result.overtakeZones[key].reduce((sum, value) => sum + value, 0) / result.overtakeZones[key].length).toFixed(1))
}]));

console.log('ШПИЛЬКА 2.4 audit passed:', JSON.stringify({
  tracks: trackSummary,
  ai: result.skills,
  gridSpan: Math.round(result.gridSpan),
  peakContactSpeed: Math.round(result.peakContactSpeed),
  lightOutward: Math.round(result.lightOutward)
}));
