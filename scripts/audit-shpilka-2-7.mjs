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
  set innerHTML(value) {
    this._innerHTML = String(value);
    if (value === '') this.children = [];
  }
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

  for (const type of ['speed', 'technical', 'mountain', 'cascade']) {
    shpPrefs.trackType = type;
    shpPrefs.difficulty = 'pilot';
    prepareRoute(hashSeed(0x270000 + type.length * 977));
    setupRace();
    mode = 'race';
    player.finishTime = 0;
    player.shp24RecoveryImmunity = 9999;
    let offroadFrames = 0;
    let totalFrames = 0;
    let maximumDistance = 0;
    const startProgress = cars.slice(1).map((car) => car.progressDistance);

    const sampleCar = cars[1];
    const targetIndex = shp27TrackIndexAtDistance(sampleCar.trackIndex, 220);
    let indexDistance = track[targetIndex].distance - track[sampleCar.trackIndex].distance;
    if (indexDistance < 0) indexDistance += track.totalLength;
    assert(indexDistance >= 180 && indexDistance <= 270, type + ': distance look-ahead is not distance based');

    for (let frame = 0; frame < 4200; frame += 1) {
      raceElapsed += 1 / 120;
      for (const car of cars.slice(1)) {
        if (car.finishTime != null) continue;
        updateCar(car, 1 / 120);
        totalFrames += 1;
        if (car.distanceFromRoad > roadHalf + 8) offroadFrames += 1;
        maximumDistance = Math.max(maximumDistance, car.distanceFromRoad);
      }
      resolveCarCollisions();
      updateRaceOrder();
    }

    const progresses = cars.slice(1).map((car, index) => car.progressDistance - startProgress[index]);
    const offroadRatio = offroadFrames / Math.max(1, totalFrames);
    assert(cars.slice(1).every((car) => [car.x, car.y, car.vx, car.vy, car.angle, car.raceScore].every(Number.isFinite)), type + ': AI produced non-finite state');
    assert(Math.min(...progresses) > track.totalLength * 0.58, type + ': a Pilot bot failed to sustain race pace');
    assert(offroadRatio < 0.045, type + ': bots spend too much time beyond the road (' + offroadRatio.toFixed(3) + ')');
    assert(maximumDistance < roadHalf + 240, type + ': a bot escaped far into the terrain');
    assert(cars.slice(1).every((car) => car.shp27ErrorTimer === 0 && car.shp27ErrorCooldown > 9000), type + ': Pilot still receives random driving errors');
    routeStats[type] = {
      length: Math.round(track.totalLength),
      offroadRatio: Number(offroadRatio.toFixed(4)),
      minProgress: Math.round(Math.min(...progresses)),
      maxDistance: Math.round(maximumDistance)
    };
  }

  shpPrefs.trackType = 'speed';
  shpPrefs.difficulty = 'maniac';
  prepareRoute(hashSeed(270777));
  setupRace();
  mode = 'race';
  raceElapsed = 20;
  player.finishTime = 20;
  player.completedLaps = lapsToWin;
  player.progressDistance = lapsToWin * track.totalLength;

  const remaining = [320, 470, 620, 780];
  cars.slice(1).forEach((car, index) => {
    const progress = lapsToWin * track.totalLength - remaining[index];
    const lapDistance = ((progress % track.totalLength) + track.totalLength) % track.totalLength;
    const targetIndex = shp27TrackIndexAtDistance(0, lapDistance);
    const point = track[targetIndex];
    car.x = point.x + point.nx * (index % 2 ? 18 : -18);
    car.y = point.y + point.ny * (index % 2 ? 18 : -18);
    car.angle = point.heading;
    car.trackIndex = targetIndex;
    car.previousTrackIndex = targetIndex;
    car.progressDistance = progress;
    car.raceScore = progress;
    car.completedLaps = lapsToWin - 1;
    car.nextLapDistance = lapsToWin * track.totalLength;
    car.forwardSpeed = 430;
    car.vx = point.tx * 430;
    car.vy = point.ty * 430;
    car.finishTime = null;
    car.shp27StartProgress = car.progressDistance - track.totalLength;
    car.shp27ProgressSpeed = 430;
  });

  finishRace();
  assert(mode === 'postfinish', 'player finish did not enter live classification');
  assert(restartButtonFinish.disabled === true, 'new race remains active while classification is running');
  assert(resultsNode.children.length === 5, 'live classification does not show all five cars');

  let ticks = 0;
  while (mode === 'postfinish' && ticks < 2400) {
    updateSimulation(1 / 120);
    ticks += 1;
  }
  assert(mode === 'finished', 'live classification did not settle to final results');
  assert(cars.every((car) => Number.isFinite(car.finishTime)), 'not every bot received a finish time');
  assert(cars.slice(1).every((car) => car.finishTime > player.finishTime), 'bot finish times are not ordered after the player');
  assert(restartButtonFinish.disabled === false, 'new race was not restored after classification');
  assert(resultsNode.children.length === 5, 'final classification lost result rows');

  shpPrefs.difficulty = 'maniac';
  setupRace();
  assert(cars.slice(1).every((car) => car.shp25MistakeCooldown > 9000), 'Maniac still inherits deliberate sand-driving mistakes');

  return { failures, routeStats, finishTimes: cars.map((car) => car.finishTime), classificationTicks: ticks };
})()`).runInContext(context);

if (result.failures.length) {
  console.error('ШПИЛЬКА 2.7 audit failed:');
  result.failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}

console.log('ШПИЛЬКА 2.7 audit passed:', JSON.stringify(result));
