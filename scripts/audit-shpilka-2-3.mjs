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

  for (const type of ['speed', 'technical', 'mountain', 'cascade']) {
    shpPrefs.trackType = type;
    lengths[type] = [];
    for (let i = 0; i < 80; i += 1) {
      const seed = hashSeed(0x235000 + i * 977 + type.length * 31);
      prepareRoute(seed);
      assert(shpActiveArchetype.id === type, type + ': wrong archetype');
      assert(track.totalLength >= 4700 && track.totalLength <= 8800, type + ': invalid length ' + track.totalLength);
      assert(track.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.heading)), type + ': non-finite geometry');
      assert(shpRampIndices.length >= shpActiveArchetype.ramps[0] && shpRampIndices.length <= shpActiveArchetype.ramps[1], type + ': wrong ramp count');
      assert(shp23MedalTargets.gold < shp23MedalTargets.silver && shp23MedalTargets.silver < shp23MedalTargets.bronze, type + ': medal targets are not ordered');
      const code = shp23RouteCode();
      const parsed = shp23ParseRouteCode(code);
      assert(parsed?.seed === (trackSeed >>> 0) && parsed?.type === type, type + ': route code round-trip failed: ' + code);
      lengths[type].push(track.totalLength);
    }
    assert(new Set(lengths[type].map((value) => Math.round(value / 25))).size >= 12, type + ': insufficient route variety');
  }

  const dailyA = shp23DailySeed(new Date('2026-07-13T01:00:00Z'));
  const dailyB = shp23DailySeed(new Date('2026-07-13T23:59:59Z'));
  const dailyC = shp23DailySeed(new Date('2026-07-14T00:00:00Z'));
  assert(dailyA === dailyB && dailyA !== dailyC, 'daily route seed is not stable by UTC day');

  shpPrefs.trackType = 'technical';
  prepareRoute(hashSeed(991177));
  const skills = {};
  for (const difficulty of ['rookie', 'racer', 'maniac']) {
    shpPrefs.difficulty = difficulty;
    setupRace();
    skills[difficulty] = cars.slice(1).reduce((sum, car) => sum + car.skill, 0) / 4;
  }
  assert(skills.rookie < skills.racer && skills.racer < skills.maniac, 'AI difficulty pace is not monotonic');

  shpPrefs.controlMode = 'precision';
  setupRace();
  shpAnalog.steer = 0.42;
  shpAnalog.throttle = 0.82;
  shpAnalog.brake = 0;
  player.forwardSpeed = 0;
  const slowCommands = playerControls();
  player.forwardSpeed = MAX_SPEED * 0.94;
  const fastCommands = playerControls();
  assert(slowCommands.steer > fastCommands.steer && fastCommands.steer > 0.12, 'automatic steering ratio does not reduce high-speed steering');
  assert(Math.abs(fastCommands.throttle - 0.82) < 0.001, 'adaptive steering changed throttle');

  mode = 'race';
  shpAnalog.steer = 0;
  shpAnalog.throttle = 1;
  shpAnalog.brake = 0;
  for (let i = 0; i < 720; i += 1) updateSimulation(1 / 120);
  assert(cars.every((car) => [car.x, car.y, car.vx, car.vy, car.angle].every(Number.isFinite)), 'race simulation produced a non-finite car');
  assert(cars.slice(1).some((car) => car.progressDistance > 500), 'AI did not make meaningful progress');

  player.vx = 0;
  player.vy = 0;
  player.forwardSpeed = 0;
  player.lateralSpeed = 0;
  player.throttleInput = 0;
  player.brakeInput = 0;
  shpAnalog.throttle = 0;
  shpAnalog.brake = 1;
  for (let i = 0; i < 90; i += 1) updateCar(player, 1 / 120);
  assert(player.forwardSpeed < -180, 'reverse is too weak: ' + player.forwardSpeed);

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
  resolvePairCollision(a, b);
  const separationVelocity = b.vx - a.vx;
  assert(separationVelocity > 0, 'car collision did not produce separating velocity: ' + separationVelocity);
  assert(b.x - a.x > 24, 'car collision did not separate overlap');
  assert((a.bodyRattle || 0) === 0 && (b.bodyRattle || 0) === 0, 'car collision still uses body jitter');
  assert([a.vx, a.vy, a.yawRate, b.vx, b.vy, b.yawRate].every(Number.isFinite), 'car collision produced non-finite impulse');

  const wallCar = cars[0];
  const wallPoint = track[wallCar.trackIndex];
  wallCar.angle = wallPoint.heading;
  const projected = CAR_HALF_WIDTH;
  const limit = roadHalf + 24 - projected;
  wallCar.x = wallPoint.x + wallPoint.nx * (limit + 9);
  wallCar.y = wallPoint.y + wallPoint.ny * (limit + 9);
  wallCar.signedRoadOffset = limit + 9;
  wallCar.vx = wallPoint.nx * 180 + wallPoint.tx * 90;
  wallCar.vy = wallPoint.ny * 180 + wallPoint.ty * 90;
  resolveRoadCollision(wallCar);
  const wallOutward = wallCar.vx * wallPoint.nx + wallCar.vy * wallPoint.ny;
  assert(wallOutward < 0, 'wall collision did not rebound inward: ' + wallOutward);
  assert((wallCar.bodyRattle || 0) === 0, 'wall collision still uses body jitter');

  const gold = shp23MedalForTime(shp23MedalTargets.gold * 0.99);
  const silver = shp23MedalForTime((shp23MedalTargets.gold + shp23MedalTargets.silver) * 0.5);
  const bronze = shp23MedalForTime((shp23MedalTargets.silver + shp23MedalTargets.bronze) * 0.5);
  assert(gold === 'gold' && silver === 'silver' && bronze === 'bronze', 'medal classification failed');

  return { failures, lengths, skills, reverse: player.forwardSpeed, daily: dailyA, wallOutward, separationVelocity };
})()`).runInContext(context);

if (result.failures.length) {
  console.error('ШПИЛЬКА 2.3 audit failed:');
  result.failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}

const summary = Object.fromEntries(Object.entries(result.lengths).map(([key, values]) => [key, {
  min: Math.round(Math.min(...values)),
  max: Math.round(Math.max(...values)),
  average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}]));
console.log('ШПИЛЬКА 2.3 audit passed:', JSON.stringify({
  tracks: summary,
  ai: result.skills,
  reverse: Math.round(result.reverse),
  daily: result.daily,
  wallOutward: Math.round(result.wallOutward),
  separationVelocity: Math.round(result.separationVelocity)
}));
