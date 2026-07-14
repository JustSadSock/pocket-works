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
  const lengths = {};

  for (const type of ['speed', 'technical', 'mountain', 'cascade']) {
    shpPrefs.trackType = type;
    lengths[type] = [];
    for (let i = 0; i < 40; i += 1) {
      prepareRoute(hashSeed(0x250000 + i * 977 + type.length * 31));
      const metrics = track.shp24Metrics || shp24TrackMetrics(track);
      assert(track.totalLength >= 12000 && track.totalLength <= 20500, type + ': invalid length');
      assert(lapsToWin === 2, type + ': race is not two laps');
      assert(metrics.overtakeZones >= 2, type + ': missing overtake zones');
      assert(metrics.longestTightRun <= 1050, type + ': tight sequence too long');
      lengths[type].push(track.totalLength);
    }
  }

  shpPrefs.trackType = 'technical';
  shpPrefs.difficulty = 'racer';
  prepareRoute(hashSeed(991177));
  setupRace();
  const rivals = Object.fromEntries(cars.slice(1).map((car) => [car.id, car.shp25Profile]));
  assert(Object.keys(rivals).length === 4, 'rival profiles were not assigned');
  assert(rivals.volt.straight > rivals.mara.straight, 'VOLT is not stronger on straights');
  assert(rivals.mara.corner > rivals.volt.corner, 'MARA is not stronger in corners');
  assert(rivals.shunt.aggression > rivals.rook.aggression, 'SHUNT is not more aggressive');
  assert(new Set(cars.slice(1).map((car) => car.shp25ReactionDelay.toFixed(3))).size > 1, 'start reactions are identical');

  mode = 'race';
  raceElapsed = 6;
  const testRival = cars[2];
  testRival.forwardSpeed = 520;
  testRival.vx = Math.cos(testRival.angle) * 520;
  testRival.vy = Math.sin(testRival.angle) * 520;
  testRival.shp25MistakeCooldown = 99;
  testRival.shp25MistakeKind = null;
  const normal = aiControls(testRival, 1 / 60);
  shp25BeginMistake(testRival, 'late', 1);
  testRival.shp25MistakeTimer = testRival.shp25MistakeTotal * 0.25;
  const late = aiControls(testRival, 1 / 60);
  assert(late.brake > normal.brake || late.throttle < normal.throttle, 'late-braking mistake has no driving effect');

  player.finishTime = 1;
  testRival.shp25MistakeKind = null;
  testRival.shp25MistakeCooldown = 99;
  const savedState = {
    random: testRival.shp25RandomState,
    overtake: testRival.overtakeTimer,
    offset: testRival.aiOffset
  };
  player.raceScore = -100000;
  const behindPlayer = aiControls(testRival, 1 / 120);
  testRival.shp25RandomState = savedState.random;
  testRival.overtakeTimer = savedState.overtake;
  testRival.aiOffset = savedState.offset;
  player.raceScore = 100000;
  const aheadPlayer = aiControls(testRival, 1 / 120);
  assert(Math.abs(behindPlayer.throttle - aheadPlayer.throttle) < 0.0001 && Math.abs(behindPlayer.brake - aheadPlayer.brake) < 0.0001, 'AI pace depends on player gap');
  player.finishTime = null;

  player.shp25CleanLevel = 0;
  player.shp25CornerDuration = 1;
  player.shp25CornerDirty = false;
  shp25CompleteCleanCorner(player);
  player.shp25CornerDuration = 1;
  player.shp25CornerDirty = false;
  shp25CompleteCleanCorner(player);
  player.shp25CornerDuration = 1;
  player.shp25CornerDirty = false;
  shp25CompleteCleanCorner(player);
  assert(player.shp25CleanLevel === 3, 'clean-line rhythm did not reach level 3');
  const forwardX = Math.cos(player.angle);
  const forwardY = Math.sin(player.angle);
  const rightX = -forwardY;
  const rightY = forwardX;
  player.vx = forwardX * 400 + rightX * 100;
  player.vy = forwardY * 400 + rightY * 100;
  player.forwardSpeed = 400;
  player.lateralSpeed = 100;
  player.distanceFromRoad = 0;
  player.signedRoadOffset = 0;
  player.slip = 0;
  player.shp25LastContact = -Infinity;
  const speedBeforeClean = Math.hypot(player.vx, player.vy);
  shp25UpdateCleanLine(player, 1);
  const speedAfterClean = Math.hypot(player.vx, player.vy);
  assert(Math.abs(player.forwardSpeed - 400) < 0.01, 'clean-line bonus changed forward speed');
  assert(Math.abs(player.lateralSpeed) < 100, 'clean-line bonus did not improve stability');
  assert(speedAfterClean <= speedBeforeClean + 0.01, 'clean-line bonus added energy');
  shp25MarkImpact(player, 100, 'wall-hit');
  assert(player.shp25CleanLevel === 0, 'heavy impact did not reset clean rhythm');

  saved.routeRecords[String(trackSeed)] = { bestSectors: [10, 11, 12] };
  shp25SectorReference = [10, 11, 12];
  shp25LapSectorTimes = [];
  shpCompleteSector(0, 9.5);
  assert(shpLastSectorText.includes('S1') && shpLastSectorText.includes('−0.500'), 'sector delta is not informative');
  shpCompleteSector(1, 10.5);
  assert(shpLastSectorText.includes('Σ') && shpLastSectorText.includes('−1.000'), 'cumulative sector delta is missing');

  setupRace();
  mode = 'race';
  raceElapsed = 5;
  const a = cars[0];
  const b = cars[1];
  a.angle = 0; b.angle = 0;
  a.x = 0; a.y = 0; b.x = 24; b.y = 0;
  a.vx = 210; a.vy = 0; b.vx = 80; b.vy = 0;
  assert(shp25ClassifyContact(a, b) === 'rear-a', 'rear contact classification failed');
  resolvePairCollision(a, b);
  assert(a.shp25LastContactKind === 'rear-a' && b.shp25LastContactKind === 'rear-a', 'rear contact was not recorded');
  assert([a.vx, a.vy, a.yawRate, b.vx, b.vy, b.yawRate].every(Number.isFinite), 'rear contact produced non-finite state');

  a.angle = 0; b.angle = 0;
  a.x = 0; a.y = 0; b.x = 0; b.y = 22;
  assert(shp25ClassifyContact(a, b) === 'side', 'side contact classification failed');
  b.angle = Math.PI;
  assert(shp25ClassifyContact(a, b) === 'head-on', 'head-on contact classification failed');

  setupRace();
  mode = 'race';
  shpAnalog.throttle = 1;
  shpAnalog.brake = 0;
  shpAnalog.steer = 0;
  for (let i = 0; i < 1200; i += 1) updateSimulation(1 / 120);
  assert(cars.every((car) => [car.x, car.y, car.vx, car.vy, car.angle].every(Number.isFinite)), 'race simulation produced non-finite state');
  assert(cars.slice(1).some((car) => car.progressDistance > 900), 'rivals did not make meaningful progress');

  return { failures, lengths, rivalLabels: cars.slice(1).map((car) => car.name), cleanSpeed: [speedBeforeClean, speedAfterClean] };
})()`).runInContext(context);

if (result.failures.length) {
  console.error('ШПИЛЬКА 2.5 audit failed:');
  result.failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}
const tracks = Object.fromEntries(Object.entries(result.lengths).map(([key, values]) => [key, {
  min: Math.round(Math.min(...values)),
  max: Math.round(Math.max(...values)),
  average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}]));
console.log('ШПИЛЬКА 2.5 audit passed:', JSON.stringify({ tracks, rivals: result.rivalLabels, cleanSpeed: result.cleanSpeed.map(Math.round) }));
