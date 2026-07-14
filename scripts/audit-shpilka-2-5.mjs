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
  'apps/shpilka/engine-v2-25.js',
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
    for (let i = 0; i < 48; i += 1) {
      const seed = hashSeed(0x250000 + i * 977 + type.length * 41);
      prepareRoute(seed);
      const metrics = track.shp24Metrics || shp24TrackMetrics(track);
      assert(shpActiveArchetype.id === type, type + ': wrong archetype');
      assert(track.totalLength >= 12000 && track.totalLength <= 20500, type + ': invalid length ' + track.totalLength);
      assert(lapsToWin === 2, type + ': race is not fixed to two laps');
      assert(metrics.overtakeZones >= 2, type + ': insufficient overtake zones');
      assert(metrics.longestTightRun <= 1050, type + ': tight sequence is too long');
      assert(track.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.heading)), type + ': non-finite geometry');
      lengths[type].push(track.totalLength);
    }
    assert(new Set(lengths[type].map((value) => Math.round(value / 50))).size >= 10, type + ': insufficient route variety');
  }

  shpPrefs.trackType = 'technical';
  shpPrefs.difficulty = 'racer';
  prepareRoute(hashSeed(250519));
  setupRace();

  const rivals = cars.slice(1);
  const roles = rivals.map((car) => car.shp25Role);
  assert(new Set(roles).size === 4, 'rivals do not have four distinct roles: ' + roles.join(','));
  assert(rivals.every((car) => car.shp25Profile && Number.isFinite(car.shp25RandomState)), 'rival profile state is incomplete');

  const lowCurveIndex = track.reduce((best, point, index) => Math.abs(point.curvature) < Math.abs(track[best].curvature) ? index : best, 0);
  const highCurveIndex = track.reduce((best, point, index) => Math.abs(point.curvature) > Math.abs(track[best].curvature) ? index : best, 0);

  function sampleCommand(car, index, speed) {
    const savedCars = cars;
    cars = [car];
    const point = track[index];
    car.trackIndex = index;
    car.previousTrackIndex = index;
    car.x = point.x;
    car.y = point.y;
    car.angle = point.heading;
    car.vx = point.tx * speed;
    car.vy = point.ty * speed;
    car.forwardSpeed = speed;
    car.lateralSpeed = 0;
    car.yawRate = 0;
    car.distanceFromRoad = 0;
    car.aiOffset = 0;
    car.overtakeTimer = 0;
    car.shp25Mistake = null;
    car.shp25MistakeCooldown = 999;
    const command = aiControls(car, 1 / 60);
    cars = savedCars;
    return command;
  }

  const rook = rivals.find((car) => car.id === 'rook');
  const volt = rivals.find((car) => car.id === 'volt');
  const mara = rivals.find((car) => car.id === 'mara');
  const shunt = rivals.find((car) => car.id === 'shunt');
  const straightVolt = sampleCommand(volt, lowCurveIndex, 570);
  const straightMara = sampleCommand(mara, lowCurveIndex, 570);
  const cornerVolt = sampleCommand(volt, highCurveIndex, 500);
  const cornerMara = sampleCommand(mara, highCurveIndex, 500);
  assert(straightVolt.throttle >= straightMara.throttle || straightVolt.brake <= straightMara.brake, 'sprinter has no straight-line advantage');
  assert(cornerMara.brake <= cornerVolt.brake || cornerMara.throttle >= cornerVolt.throttle, 'technician has no corner advantage');
  assert(shunt.shp25Profile.aggression > rook.shp25Profile.aggression, 'attacking rival is not more aggressive than stable rival');

  const mistakeOutputs = {};
  for (const type of ['late-brake', 'wide-exit', 'oversteer', 'failed-pass']) {
    const car = shunt;
    car.shp25Mistake = { type, remaining: 0.4, total: 0.8, direction: 1 };
    car.shp25MistakeCooldown = 999;
    const command = sampleCommand(car, highCurveIndex, 520);
    mistakeOutputs[type] = command;
    assert([command.steer, command.throttle, command.brake].every(Number.isFinite), type + ': mistake produced non-finite controls');
    assert(command.steer >= -1 && command.steer <= 1 && command.throttle >= 0 && command.throttle <= 1 && command.brake >= 0 && command.brake <= 1, type + ': mistake controls out of range');
  }
  assert(mistakeOutputs['oversteer'].steer !== mistakeOutputs['late-brake'].steer, 'mistake types do not change steering behavior');

  setupRace();
  mode = 'race';
  player.distanceFromRoad = 0;
  player.signedRoadOffset = 0;
  player.slip = 0;
  player.forwardSpeed = 420;
  const cleanPoint = track[player.trackIndex];
  player.angle = cleanPoint.heading;
  player.vx = cleanPoint.tx * 420;
  player.vy = cleanPoint.ty * 420;
  for (let i = 0; i < 1200; i += 1) shp25UpdateCleanRhythm(player, 1 / 120);
  assert(shp25CleanMeter > 0.65, 'clean rhythm does not build: ' + shp25CleanMeter);
  assert(player.shp25CleanGrip > 0 && player.shp25CleanGrip <= 0.0251, 'clean grip bonus outside 0..2.5%: ' + player.shp25CleanGrip);
  shp25ResetCleanRhythm();
  assert(shp25CleanMeter === 0 && player.shp25CleanGrip === 0, 'clean rhythm does not reset');

  setupRace();
  mode = 'race';
  function configureImpact(a, b, config) {
    shp24PairContacts.clear();
    a.shp24RecoveryImmunity = 0;
    b.shp24RecoveryImmunity = 0;
    a.x = config.ax; a.y = config.ay; b.x = config.bx; b.y = config.by;
    a.angle = config.aa; b.angle = config.ba;
    a.vx = config.avx; a.vy = config.avy; b.vx = config.bvx; b.vy = config.bvy;
    raceElapsed += 0.2;
    resolvePairCollision(a, b);
    return a.shp25LastImpactKind || b.shp25LastImpactKind;
  }

  const a = cars[0];
  const b = cars[1];
  const rearKind = configureImpact(a, b, { ax: 0, ay: 0, bx: 38, by: 0, aa: 0, ba: 0, avx: 250, avy: 0, bvx: 80, bvy: 0 });
  const frontalKind = configureImpact(a, b, { ax: 0, ay: 0, bx: 38, by: 0, aa: 0, ba: Math.PI, avx: 170, avy: 0, bvx: -140, bvy: 0 });
  const sideKind = configureImpact(a, b, { ax: 0, ay: 0, bx: 0, by: 20, aa: 0, ba: 0, avx: 150, avy: 90, bvx: 150, bvy: -60 });
  assert(rearKind === 'rear', 'rear impact misclassified as ' + rearKind);
  assert(frontalKind === 'frontal', 'frontal impact misclassified as ' + frontalKind);
  assert(sideKind === 'side', 'side impact misclassified as ' + sideKind);
  assert([a.vx, a.vy, a.yawRate, b.vx, b.vy, b.yawRate].every(Number.isFinite), 'impact character produced non-finite state');

  setupRace();
  mode = 'race';
  const contactA = cars[0];
  const contactB = cars[1];
  contactA.x = 0; contactA.y = 0; contactB.x = 24; contactB.y = 0;
  contactA.angle = 0; contactB.angle = 0;
  contactA.vx = 190; contactA.vy = 0; contactB.vx = -90; contactB.vy = 0;
  let peakSpeed = 0;
  for (let i = 0; i < 42; i += 1) {
    resolvePairCollision(contactA, contactB);
    contactA.x += contactA.vx / 120;
    contactB.x += contactB.vx / 120;
    raceElapsed += 1 / 120;
    peakSpeed = Math.max(peakSpeed, Math.abs(contactA.vx), Math.abs(contactB.vx));
  }
  assert(contactB.x - contactA.x > 39, 'sustained contact did not separate');
  assert(peakSpeed < 390, 'sustained contact injected energy: ' + peakSpeed);

  const oldRecord = saved.routeRecords[String(trackSeed)] || {};
  saved.routeRecords[String(trackSeed)] = { ...oldRecord, bestSectors: [12, null, null] };
  shpCompleteSector(0, 11.75);
  assert(shpLastSectorText.includes('11.750') && shpLastSectorText.includes('−0.250'), 'sector text is not informative: ' + shpLastSectorText);

  return {
    failures,
    lengths,
    roles,
    straightVolt,
    straightMara,
    cornerVolt,
    cornerMara,
    cleanGrip: player?.shp25CleanGrip || 0,
    impactKinds: { rearKind, frontalKind, sideKind },
    peakSpeed
  };
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

console.log('ШПИЛЬКА 2.5 audit passed:', JSON.stringify({
  tracks,
  roles: result.roles,
  impactKinds: result.impactKinds,
  peakSpeed: Math.round(result.peakSpeed)
}));
