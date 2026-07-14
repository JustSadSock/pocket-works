import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class MockClassList { add() {} remove() {} toggle() {} contains() { return false; } }
class MockElement {
  constructor(id = '') {
    this.id = id; this.hidden = false; this.textContent = ''; this.innerHTML = ''; this.value = '';
    this.dataset = {}; this.children = []; this.classList = new MockClassList();
    this.style = { setProperty() {} }; this.listeners = new Map();
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  after(...children) { this.children.push(...children); }
  remove() {} focus() {} select() {} querySelector() { return new MockElement(); } setAttribute() {}
  setPointerCapture() {} releasePointerCapture() {} hasPointerCapture() { return false; }
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
  const node = new MockElement(`track-${value}`); node.dataset.trackType = value; return node;
});
const difficultyButtons = ['rookie', 'racer', 'maniac'].map((value) => {
  const node = new MockElement(`difficulty-${value}`); node.dataset.difficulty = value; return node;
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
  console, Math, Date, Intl, JSON, Number, Object, Array, String, Boolean, Map, Set, Proxy, Promise,
  Error, TypeError, Infinity, NaN, parseInt, parseFloat, isFinite, document,
  navigator: { vibrate() {}, clipboard: { async writeText() {} } },
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  performance: { now: () => 1000 },
  Path2D: class Path2D { moveTo() {} lineTo() {} closePath() {} },
  requestAnimationFrame() { return 1; }, cancelAnimationFrame() {},
  setTimeout(handler) { if (typeof handler === 'function') handler(); return 1; }, clearTimeout() {}, window: null
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
  new vm.Script(await readFile(file, 'utf8'), { filename: file }).runInContext(context);
}

const result = new vm.Script(`(() => {
  const failures = [];
  const assert = (condition, message) => { if (!condition) failures.push(message); };
  const lengths = {};

  for (const type of ['speed', 'technical', 'mountain', 'cascade']) {
    shpPrefs.trackType = type;
    lengths[type] = [];
    for (let i = 0; i < 36; i += 1) {
      prepareRoute(hashSeed(0x255000 + i * 977 + type.length * 37));
      const metrics = track.shp24Metrics || shp24TrackMetrics(track);
      assert(track.totalLength >= 12000 && track.totalLength <= 20500, type + ': invalid length');
      assert(lapsToWin === 2, type + ': not two laps');
      assert(metrics.overtakeZones >= 2, type + ': insufficient overtake zones');
      assert(metrics.longestTightRun <= 1050, type + ': tight sequence too long');
      assert(track.every((point) => [point.x, point.y, point.heading].every(Number.isFinite)), type + ': invalid geometry');
      lengths[type].push(track.totalLength);
    }
    assert(new Set(lengths[type].map((value) => Math.round(value / 50))).size >= 8, type + ': insufficient variety');
  }

  shpPrefs.trackType = 'technical';
  shpPrefs.difficulty = 'racer';
  prepareRoute(hashSeed(250519));
  setupRace();
  const rivals = cars.slice(1);
  const roles = rivals.map((car) => car.shp25Role);
  assert(new Set(roles).size === 4, 'expected four distinct roles: ' + roles.join(','));
  assert(shp25Profiles.volt.straightPace > shp25Profiles.mara.straightPace, 'sprinter straight pace missing');
  assert(shp25Profiles.mara.cornerPace > shp25Profiles.volt.cornerPace, 'technician corner pace missing');
  assert(shp25Profiles.shunt.aggression > shp25Profiles.rook.aggression, 'attacker aggression missing');

  const shunt = rivals.find((car) => car.id === 'shunt');
  const curveIndex = track.reduce((best, point, index) => Math.abs(point.curvature) > Math.abs(track[best].curvature) ? index : best, 0);
  const point = track[curveIndex];
  const savedCars = cars;
  cars = [shunt];
  const mistakeCommands = {};
  for (const type of ['late-brake', 'wide-exit', 'oversteer', 'failed-pass']) {
    shunt.trackIndex = curveIndex; shunt.previousTrackIndex = curveIndex;
    shunt.x = point.x; shunt.y = point.y; shunt.angle = point.heading;
    shunt.vx = point.tx * 520; shunt.vy = point.ty * 520;
    shunt.forwardSpeed = 520; shunt.lateralSpeed = 0; shunt.yawRate = 0;
    shunt.distanceFromRoad = 0; shunt.aiOffset = 0; shunt.overtakeTimer = 0;
    shunt.shp25Mistake = { type, remaining: 0.4, total: 0.8, direction: 1 };
    shunt.shp25MistakeCooldown = 999;
    mistakeCommands[type] = aiControls(shunt, 1 / 60);
    const command = mistakeCommands[type];
    assert([command.steer, command.throttle, command.brake].every(Number.isFinite), type + ': non-finite controls');
    assert(command.steer >= -1 && command.steer <= 1 && command.throttle >= 0 && command.throttle <= 1 && command.brake >= 0 && command.brake <= 1, type + ': controls out of range');
  }
  cars = savedCars;
  assert(mistakeCommands['oversteer'].steer !== mistakeCommands['late-brake'].steer, 'mistakes do not alter steering');
  assert(mistakeCommands['late-brake'].brake <= mistakeCommands['wide-exit'].brake, 'late braking does not delay brake');

  setupRace();
  mode = 'race';
  player.distanceFromRoad = 0; player.signedRoadOffset = 0; player.slip = 0; player.forwardSpeed = 420;
  const cleanPoint = track[player.trackIndex];
  player.angle = cleanPoint.heading; player.vx = cleanPoint.tx * 420; player.vy = cleanPoint.ty * 420;
  for (let i = 0; i < 1800; i += 1) shp25UpdateCleanRhythm(player, 1 / 120);
  const cleanGrip = player.shp25CleanGrip;
  assert(shp25CleanMeter > 0.70, 'clean rhythm builds too slowly: ' + shp25CleanMeter);
  assert(cleanGrip > 0 && cleanGrip <= 0.0251, 'clean grip outside 0..2.5%: ' + cleanGrip);
  shp25ResetCleanRhythm();
  assert(shp25CleanMeter === 0 && player.shp25CleanGrip === 0, 'clean rhythm does not reset');

  const dummy = (angle, x = 0, y = 0) => ({ angle, x, y });
  const rear = shp25ClassifyImpact(
    dummy(0, 0, 0), dummy(0, 38, 0),
    { vx: 250, vy: 0 }, { vx: 80, vy: 0 }
  );
  const frontal = shp25ClassifyImpact(
    dummy(0, 0, 0), dummy(Math.PI, 38, 0),
    { vx: 170, vy: 0 }, { vx: -140, vy: 0 }
  );
  const side = shp25ClassifyImpact(
    dummy(0, 0, 0), dummy(0, 0, 20),
    { vx: 150, vy: 90 }, { vx: 150, vy: -60 }
  );
  assert(rear.kind === 'rear', 'rear classified as ' + rear.kind);
  assert(frontal.kind === 'frontal', 'frontal classified as ' + frontal.kind);
  assert(side.kind === 'side', 'side classified as ' + side.kind);

  setupRace();
  mode = 'race';
  const a = cars[0]; const b = cars[1];
  a.x = 0; a.y = 0; b.x = 24; b.y = 0; a.angle = 0; b.angle = 0;
  a.vx = 190; a.vy = 0; b.vx = -90; b.vy = 0;
  let peakSpeed = 0;
  for (let i = 0; i < 42; i += 1) {
    resolvePairCollision(a, b);
    a.x += a.vx / 120; a.y += a.vy / 120;
    b.x += b.vx / 120; b.y += b.vy / 120;
    raceElapsed += 1 / 120;
    peakSpeed = Math.max(peakSpeed, Math.hypot(a.vx, a.vy), Math.hypot(b.vx, b.vy));
  }
  assert(b.x - a.x > 39, 'sustained contact did not separate');
  assert(peakSpeed < 410, 'sustained contact injected energy: ' + peakSpeed);
  assert([a.vx, a.vy, a.yawRate, b.vx, b.vy, b.yawRate].every(Number.isFinite), 'collision produced non-finite state');

  setupRace();
  mode = 'race';
  shpPrefs.controlMode = 'precision';
  shpAnalog.steer = 0; shpAnalog.throttle = 1; shpAnalog.brake = 0;
  for (let i = 0; i < 1200; i += 1) updateSimulation(1 / 120);
  assert(cars.every((car) => [car.x, car.y, car.vx, car.vy, car.angle].every(Number.isFinite)), 'race simulation produced non-finite state');
  assert(cars.slice(1).some((car) => car.progressDistance > 700), 'rivals made no progress');

  const oldRecord = saved.routeRecords[String(trackSeed)] || {};
  saved.routeRecords[String(trackSeed)] = { ...oldRecord, bestSectors: [12, null, null] };
  shpCompleteSector(0, 11.75);
  assert(shpLastSectorText.includes('11.750') && shpLastSectorText.includes('−0.250'), 'sector text incomplete: ' + shpLastSectorText);

  return { failures, lengths, roles, cleanGrip, impacts: [rear.kind, frontal.kind, side.kind], peakSpeed };
})()`).runInContext(context);

if (result.failures.length) {
  console.error('ШПИЛЬКА 2.5 audit failed:');
  result.failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}
const tracks = Object.fromEntries(Object.entries(result.lengths).map(([key, values]) => [key, {
  min: Math.round(Math.min(...values)), max: Math.round(Math.max(...values)),
  average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}]));
console.log('ШПИЛЬКА 2.5 audit passed:', JSON.stringify({
  tracks, roles: result.roles, cleanGrip: result.cleanGrip, impacts: result.impacts, peakSpeed: Math.round(result.peakSpeed)
}));
