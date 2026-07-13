import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class NodeMock {
  constructor(id = '') {
    this.id = id;
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.dataset = {};
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  addEventListener() {}
  append() {}
  appendChild(child) { return child; }
  querySelector() { return new NodeMock(); }
  setAttribute() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() { return false; }
  focus() {}
  select() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 844 }; }
}

const nodes = new Map();
const node = (id) => {
  if (!nodes.has(id)) nodes.set(id, new NodeMock(id));
  return nodes.get(id);
};
node('game').getContext = () => new Proxy({
  createRadialGradient: () => ({ addColorStop() {} }),
  createLinearGradient: () => ({ addColorStop() {} }),
  measureText: () => ({ width: 0 })
}, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true) });

const trackButtons = ['mix', 'speed', 'technical', 'mountain', 'cascade'].map((value) => Object.assign(new NodeMock(), { dataset: { trackType: value } }));
const difficultyButtons = ['rookie', 'racer', 'maniac'].map((value) => Object.assign(new NodeMock(), { dataset: { difficulty: value } }));
const storage = new Map();
const document = {
  visibilityState: 'visible',
  documentElement: { style: { setProperty() {} } },
  head: new NodeMock(),
  querySelector: (selector) => selector.startsWith('#') ? node(selector.slice(1)) : new NodeMock(),
  querySelectorAll: (selector) => selector === '[data-track-type]' ? trackButtons : selector === '[data-difficulty]' ? difficultyButtons : [],
  createElement: () => new NodeMock(),
  addEventListener() {},
  execCommand() { return true; }
};

const context = vm.createContext({
  console, Math, Date, JSON, Number, Object, Array, String, Boolean, Map, Set, WeakMap, Proxy, Promise, Error, TypeError,
  Infinity, NaN, parseInt, parseFloat, isFinite, document,
  navigator: { vibrate() {}, clipboard: { async writeText() {} } },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  },
  performance: { now: () => 1000 },
  Path2D: class { moveTo() {} lineTo() {} closePath() {} },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  setTimeout: (handler) => (typeof handler === 'function' && handler(), 1),
  clearTimeout() {},
  window: null
});
context.window = context;
Object.assign(context.window, {
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 3,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  visualViewport: { addEventListener() {} }
});

const parts = [
  ...Array.from({ length: 11 }, (_, index) => `apps/shpilka/engine-v2-${String(index + 1).padStart(2, '0')}.js`),
  'apps/shpilka/engine-v2-stability.js',
  'apps/shpilka/engine-v2-advanced.js',
  'apps/shpilka/engine-v2-advanced-fixes.js',
  'apps/shpilka/engine-v2-23.js',
  'apps/shpilka/engine-v2-12.js'
];
for (const file of parts) new vm.Script(await readFile(file, 'utf8'), { filename: file }).runInContext(context);

const result = new vm.Script(`(() => {
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };

  for (const type of ['speed', 'technical', 'mountain', 'cascade']) {
    shpPrefs.trackType = type;
    for (let i = 0; i < 12; i += 1) {
      prepareRoute(hashSeed(0x230000 + i * 997 + type.length));
      check(shpActiveArchetype.id === type, type + ': archetype mismatch');
      check(track.totalLength >= 4700 && track.totalLength <= 8800, type + ': invalid length');
      check(shp23MedalTargets.gold < shp23MedalTargets.silver && shp23MedalTargets.silver < shp23MedalTargets.bronze, type + ': medal order');
    }
  }

  const code = shp23EncodeRoute('mountain', 0xf234abcd);
  const parsed = shp23ParseRouteCode(code);
  check(parsed.type === 'mountain' && parsed.seed === 0xf234abcd, 'route code round-trip');
  check(Boolean(shp23ParseRouteCode(code.slice(0, -1) + (code.endsWith('Z') ? 'Y' : 'Z')).error), 'route checksum');
  check(shp23DailyRoute().code === shp23DailyRoute().code, 'daily route determinism');

  shpPrefs.trackType = 'technical';
  prepareRoute(hashSeed(991177));
  setupRace();
  shpPrefs.controlMode = 'precision';
  shpAnalog.steer = 0.45;
  player.forwardSpeed = 20;
  const low = Math.abs(playerControls().steer);
  player.forwardSpeed = MAX_SPEED * 0.92;
  const high = Math.abs(playerControls().steer);
  check(high < low, 'automatic steering ratio');
  shpAnalog.steer = 1;
  check(Math.abs(playerControls().steer) > 0.98, 'full steering lock');

  const a = cars[0];
  const b = cars[1];
  Object.assign(a, { x: 0, y: 0, angle: 0, vx: 250, vy: 0, yawRate: 0, airborne: false, z: 0 });
  Object.assign(b, { x: 42, y: 0, angle: 0, vx: 0, vy: 0, yawRate: 0, airborne: false, z: 0 });
  resolvePairCollision(a, b);
  check(a.vx < 245 && b.vx > 5 && b.vx - a.vx > 0, 'pair collision separation');
  const av = a.vx;
  const bv = b.vx;
  for (let i = 0; i < 8; i += 1) resolvePairCollision(a, b);
  check(Math.abs(a.vx - av) < 1 && Math.abs(b.vx - bv) < 1, 'pair collision jitter');

  const wall = cars[2];
  const point = track[wall.trackIndex];
  wall.angle = point.heading;
  wall.signedRoadOffset = roadHalf + 70;
  wall.x = point.x + point.nx * wall.signedRoadOffset;
  wall.y = point.y + point.ny * wall.signedRoadOffset;
  wall.vx = point.nx * 220 + point.tx * 90;
  wall.vy = point.ny * 220 + point.ty * 90;
  resolveRoadCollision(wall);
  check(wall.vx * point.nx + wall.vy * point.ny < -20, 'barrier reflection');

  return { failures, code, low, high };
})()`).runInContext(context);

if (result.failures.length) {
  console.error('ШПИЛЬКА 2.3 audit failed:');
  for (const failure of result.failures) console.error('-', failure);
  process.exit(1);
}
console.log('ШПИЛЬКА 2.3 audit passed:', JSON.stringify(result));
