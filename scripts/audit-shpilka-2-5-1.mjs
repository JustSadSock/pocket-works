import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class MockClassList { add() {} remove() {} toggle() {} contains() { return false; } }
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
  visibilityState: 'visible', activeElement: null,
  documentElement: { style: { setProperty() {} } }, head: new MockElement('head'),
  querySelector(selector) { return selector.startsWith('#') ? getElement(selector.slice(1)) : new MockElement(selector); },
  querySelectorAll(selector) {
    if (selector === '[data-track-type]') return trackButtons;
    if (selector === '[data-difficulty]') return difficultyButtons;
    return [];
  },
  createElement(tag) { return new MockElement(tag); }, addEventListener() {}, execCommand() { return true; }
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
  'apps/shpilka/engine-v2-12.js'
];
for (const file of parts) {
  const source = await readFile(file, 'utf8');
  new vm.Script(source, { filename: file }).runInContext(context);
}

const result = new vm.Script(`(() => {
  const failures = [];
  const assert = (condition, message) => { if (!condition) failures.push(message); };

  shpPrefs.trackType = 'mix';
  prepareRoute(hashSeed(0x251251));
  assert(['speed', 'technical', 'mountain', 'cascade'].includes(shpActiveArchetype.id), 'mix did not choose a valid archetype');

  shpPrefs.difficulty = 'maniac';
  setupRace();
  const rivalScores = cars.slice(1).map((car) => car.raceScore);
  assert(player.raceScore < Math.min(...rivalScores), 'player does not start last on maniac');
  assert(cars.slice(1).every((car) => car.skill >= shp251SkillFloor[car.id] - 0.0001), 'maniac skill floor was not applied');
  assert(cars.slice(1).every((car) => car.shp25ReactionDelay <= 0.046), 'maniac launch reaction is still too slow');
  assert(cars.slice(1).every((car) => car.shp25Profile.errorRate <= shp25Profiles[car.id].errorRate * 0.221), 'maniac errors were not reduced');
  assert(shp25DifficultyErrorFactor.maniac <= 0.24, 'maniac error factor is too high');

  const sample = (difficulty) => {
    shpPrefs.difficulty = difficulty;
    setupRace();
    mode = 'race';
    raceElapsed = 8;
    const car = cars.find((entry) => entry.id === 'volt');
    cars.forEach((entry) => { if (entry !== car) entry.finishTime = 1; });
    let targetIndex = 0;
    let best = Infinity;
    for (let i = 0; i < track.length; i += 1) {
      const delta = Math.abs(Math.abs(track[i].curvature) - 0.00115);
      if (delta < best) { best = delta; targetIndex = i; }
    }
    const point = track[targetIndex];
    car.trackIndex = targetIndex;
    car.previousTrackIndex = targetIndex;
    car.x = point.x;
    car.y = point.y;
    car.angle = point.heading;
    car.forwardSpeed = 510;
    car.vx = point.tx * 510;
    car.vy = point.ty * 510;
    car.distanceFromRoad = 0;
    car.signedRoadOffset = 0;
    car.yawRate = 0;
    car.aiOffset = 0;
    car.overtakeTimer = 0;
    car.shp25MistakeKind = null;
    car.shp25MistakeCooldown = 99;
    car.shp25ReactionDelay = 0;
    const commands = aiControls(car, 1 / 120);
    return { commands, skill: car.skill, profile: car.shp25Profile };
  };

  const racer = sample('racer');
  const maniac = sample('maniac');
  assert(maniac.skill >= racer.skill + 0.07, 'maniac pace is not meaningfully above racer');
  assert(maniac.profile.corner > racer.profile.corner, 'maniac corner profile was not strengthened');
  assert(maniac.commands.brake <= racer.commands.brake + 0.001, 'maniac still brakes earlier than racer');
  assert(maniac.commands.throttle >= racer.commands.throttle - 0.001, 'maniac returns to throttle later than racer');

  shpPrefs.difficulty = 'maniac';
  setupRace();
  mode = 'race';
  raceElapsed = 8;
  const testCar = cars.find((entry) => entry.id === 'mara');
  testCar.shp25MistakeKind = null;
  testCar.shp25MistakeCooldown = 99;
  testCar.shp25ReactionDelay = 0;
  const state = { random: testCar.shp25RandomState, overtake: testCar.overtakeTimer, offset: testCar.aiOffset };
  player.raceScore = -100000;
  const playerBehind = aiControls(testCar, 1 / 120);
  testCar.shp25RandomState = state.random;
  testCar.overtakeTimer = state.overtake;
  testCar.aiOffset = state.offset;
  player.raceScore = 100000;
  const playerAhead = aiControls(testCar, 1 / 120);
  assert(Math.abs(playerBehind.throttle - playerAhead.throttle) < 0.0001, 'maniac throttle depends on player gap');
  assert(Math.abs(playerBehind.brake - playerAhead.brake) < 0.0001, 'maniac braking depends on player gap');

  setupRace();
  mode = 'race';
  shpAnalog.throttle = 1;
  shpAnalog.brake = 0;
  shpAnalog.steer = 0;
  for (let i = 0; i < 1440; i += 1) updateSimulation(1 / 120);
  assert(cars.every((car) => [car.x, car.y, car.vx, car.vy, car.angle].every(Number.isFinite)), 'maniac simulation produced non-finite state');
  assert(cars.slice(1).some((car) => car.progressDistance > 1100), 'maniac rivals did not make meaningful progress');

  return {
    failures,
    archetype: shpActiveArchetype.id,
    gridGap: Math.min(...rivalScores) - player.raceScore,
    racer: { skill: racer.skill, throttle: racer.commands.throttle, brake: racer.commands.brake },
    maniac: { skill: maniac.skill, throttle: maniac.commands.throttle, brake: maniac.commands.brake }
  };
})()`).runInContext(context);

if (result.failures.length) {
  console.error('ШПИЛЬКА 2.5.1 audit failed:');
  result.failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}
console.log('ШПИЛЬКА 2.5.1 audit passed:', JSON.stringify(result));
