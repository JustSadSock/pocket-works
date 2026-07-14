import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class MockClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    if (force === true) { this.values.add(value); return true; }
    if (force === false) { this.values.delete(value); return false; }
    if (this.values.has(value)) { this.values.delete(value); return false; }
    this.values.add(value); return true;
  }
  contains(value) { return this.values.has(value); }
}

class MockElement {
  constructor(id = '') {
    this.id = id;
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.type = '';
    this.className = '';
    this.dataset = {};
    this.children = [];
    this.classList = new MockClassList();
    this.style = { setProperty() {} };
    this.listeners = new Map();
  }
  set innerHTML(value) { this._innerHTML = String(value); if (value === '') this.children = []; }
  get innerHTML() { return this._innerHTML; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  after(...children) { this.children.push(...children); }
  before(...children) { this.children.unshift(...children); }
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

const elements = new Map();
const getElement = (id) => {
  if (!elements.has(id)) elements.set(id, new MockElement(id));
  return elements.get(id);
};
const canvas = getElement('game');
canvas.getContext = () => new Proxy({
  createRadialGradient() { return { addColorStop() {} }; },
  createLinearGradient() { return { addColorStop() {} }; },
  measureText() { return { width: 0 }; }
}, {
  get(target, property) { return property in target ? target[property] : () => {}; },
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
  console, Math, Date, Intl, JSON, Number, Object, Array, String, Boolean, Map, Set, Proxy,
  Promise, Error, TypeError, Infinity, NaN, parseInt, parseFloat, isFinite, document,
  navigator: { vibrate() {}, clipboard: { async writeText() {} } },
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  performance: { now: () => 1000 },
  Path2D: class Path2D { moveTo() {} lineTo() {} closePath() {} },
  requestAnimationFrame() { return 1; }, cancelAnimationFrame() {},
  setTimeout(handler) { if (typeof handler === 'function') handler(); return 1; }, clearTimeout() {},
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
  'apps/shpilka/engine-v2-25-ai.js',
  'apps/shpilka/engine-v2-25-race.js',
  'apps/shpilka/engine-v2-25-1.js',
  'apps/shpilka/engine-v2-25-contacts.js',
  'apps/shpilka/engine-v2-25-wall.js',
  'apps/shpilka/engine-v2-26-career.js',
  'apps/shpilka/engine-v2-26-racecraft.js',
  'apps/shpilka/engine-v2-26-landmarks.js',
  'apps/shpilka/engine-v2-26-feel.js',
  'apps/shpilka/engine-v2-26-fixes.js',
  'apps/shpilka/engine-v2-27-ai.js',
  'apps/shpilka/engine-v2-27-fixes.js',
  'apps/shpilka/engine-v2-27-1.js',
  'apps/shpilka/engine-v2-12.js'
];
for (const file of parts) {
  const source = await readFile(file, 'utf8');
  new vm.Script(source, { filename: file }).runInContext(context);
}

const result = new vm.Script(`(() => {
  const failures = [];
  const assert = (condition, message) => { if (!condition) failures.push(message); };
  const routeStats = {};

  const probe = { shp271Steer: 0 };
  let probeSignChanges = 0;
  let probeSign = 0;
  for (let frame = 0; frame < 180; frame += 1) {
    const raw = frame % 2 === 0 ? 0.38 : -0.38;
    const value = shp271SmoothSteer(probe, raw, 1 / 120, 0, 0, shp271SteeringTune.pilot);
    const sign = Math.abs(value) > 0.025 ? Math.sign(value) : 0;
    if (sign && probeSign && sign !== probeSign) probeSignChanges += 1;
    if (sign) probeSign = sign;
  }
  assert(probeSignChanges <= 2, 'steering smoother follows frame-by-frame alternating commands');

  for (const type of ['speed', 'technical', 'mountain', 'cascade']) {
    shpPrefs.trackType = type;
    shpPrefs.difficulty = 'pilot';
    prepareRoute(hashSeed(0x271000 + type.length * 1103));
    setupRace();
    mode = 'race';
    player.finishTime = 0;
    player.shp24RecoveryImmunity = 9999;

    const stats = new Map(cars.slice(1).map((car) => [car.id, {
      previousSteer: 0,
      previousSign: 0,
      lastReversal: -9999,
      reversals: 0,
      rapidReversals: 0,
      straightReversals: 0,
      straightFrames: 0,
      maxDelta: 0,
      absoluteSteer: 0,
      samples: 0,
      startProgress: car.progressDistance
    }]));
    let offroadFrames = 0;
    let totalFrames = 0;

    for (let frame = 0; frame < 4200; frame += 1) {
      raceElapsed += 1 / 120;
      for (const car of cars.slice(1)) {
        if (car.finishTime != null) continue;
        updateCar(car, 1 / 120);
        const sample = stats.get(car.id);
        const steer = car.shp271Steer || 0;
        const delta = Math.abs(steer - sample.previousSteer);
        sample.maxDelta = Math.max(sample.maxDelta, delta);
        sample.absoluteSteer += Math.abs(steer);
        sample.samples += 1;

        const preview = shp27CurvePreview(car, 190);
        const straight = Math.abs(track[car.trackIndex].curvature || 0) < 0.00042 && preview.maximum < 0.00062;
        if (straight) sample.straightFrames += 1;
        const sign = Math.abs(steer) > 0.15 ? Math.sign(steer) : 0;
        if (sign && sample.previousSign && sign !== sample.previousSign) {
          sample.reversals += 1;
          if (frame - sample.lastReversal < 42) sample.rapidReversals += 1;
          if (straight) sample.straightReversals += 1;
          sample.lastReversal = frame;
        }
        if (sign) sample.previousSign = sign;
        sample.previousSteer = steer;

        totalFrames += 1;
        if (car.distanceFromRoad > roadHalf + 8) offroadFrames += 1;
      }
      resolveCarCollisions();
      updateRaceOrder();
    }

    const values = [...stats.values()];
    const progresses = cars.slice(1).map((car) => car.progressDistance - stats.get(car.id).startProgress);
    const rapidReversals = values.reduce((sum, value) => sum + value.rapidReversals, 0);
    const straightReversals = values.reduce((sum, value) => sum + value.straightReversals, 0);
    const straightSeconds = values.reduce((sum, value) => sum + value.straightFrames, 0) / 120;
    const maximumDelta = Math.max(...values.map((value) => value.maxDelta));
    const meanSteer = values.reduce((sum, value) => sum + value.absoluteSteer / Math.max(1, value.samples), 0) / values.length;
    const offroadRatio = offroadFrames / Math.max(1, totalFrames);

    assert(maximumDelta < 0.075, type + ': steering command changes too abruptly (' + maximumDelta.toFixed(3) + ')');
    assert(rapidReversals <= 5, type + ': bots still make rapid left-right steering reversals (' + rapidReversals + ')');
    assert(straightReversals / Math.max(1, straightSeconds) < 0.55, type + ': bots weave repeatedly on straights');
    assert(meanSteer < 0.66, type + ': average steering correction is excessive (' + meanSteer.toFixed(3) + ')');
    assert(offroadRatio < 0.05, type + ': anti-weaving changes pushed bots off road');
    assert(Math.min(...progresses) > track.totalLength * 0.52, type + ': stable steering lost too much race pace');
    assert(cars.slice(1).every((car) => [car.x, car.y, car.vx, car.vy, car.angle, car.shp271Steer].every(Number.isFinite)), type + ': non-finite steering state');

    routeStats[type] = {
      rapidReversals,
      straightReversals,
      straightSeconds: Number(straightSeconds.toFixed(2)),
      maximumDelta: Number(maximumDelta.toFixed(4)),
      meanSteer: Number(meanSteer.toFixed(3)),
      offroadRatio: Number(offroadRatio.toFixed(4)),
      minProgress: Math.round(Math.min(...progresses))
    };
  }

  shpPrefs.trackType = 'speed';
  shpPrefs.difficulty = 'pilot';
  prepareRoute(hashSeed(271771));
  setupRace();
  mode = 'race';
  const a = cars[1];
  const b = cars[2];
  const point = track[100];
  for (const [car, offset] of [[a, -6], [b, 6]]) {
    car.x = point.x + point.nx * offset;
    car.y = point.y + point.ny * offset;
    car.trackIndex = 100;
    car.previousTrackIndex = 100;
    car.signedRoadOffset = offset;
    car.raceScore = 1000;
    car.progressDistance = 1000;
    car.finishTime = null;
  }
  const firstAvoidance = shp271AvoidanceOffset(a, 1 / 60);
  const lockedSide = a.shp271AvoidSide;
  b.signedRoadOffset = -12;
  const secondAvoidance = shp271AvoidanceOffset(a, 1 / 60);
  assert(firstAvoidance !== 0 && lockedSide !== 0, 'close-car avoidance did not select a side');
  assert(a.shp271AvoidSide === lockedSide && Math.sign(secondAvoidance) === lockedSide, 'avoidance flips side while the manoeuvre is active');

  return { failures, probeSignChanges, routeStats };
})()`).runInContext(context);

if (result.failures.length) {
  console.error('ШПИЛЬКА 2.7.1 anti-weaving audit failed:');
  result.failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}

console.log('ШПИЛЬКА 2.7.1 anti-weaving audit passed:', JSON.stringify(result));
