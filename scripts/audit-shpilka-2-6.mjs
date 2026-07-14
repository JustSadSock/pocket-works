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
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.type = '';
    this.className = '';
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
    routeStats[type] = [];
    for (let i = 0; i < 24; i += 1) {
      const seed = hashSeed(0x260000 + i * 977 + type.length * 41);
      prepareRoute(seed);
      const firstSignature = shp26Landmarks.map((item) => item.kind + ':' + item.index).join('|');
      const firstLength = track.totalLength;
      assert(shp26Landmarks.length === 3, type + ': route does not have exactly three landmarks');
      assert(new Set(shp26Landmarks.map((item) => item.kind)).size === 3, type + ': landmark kinds repeat');
      for (let a = 0; a < shp26Landmarks.length; a += 1) {
        for (let b = a + 1; b < shp26Landmarks.length; b += 1) {
          assert(shp26CircularIndexGap(shp26Landmarks[a].index, shp26Landmarks[b].index) >= Math.floor(track.length * 0.14), type + ': landmarks overlap');
        }
      }
      prepareRoute(seed);
      const secondSignature = shp26Landmarks.map((item) => item.kind + ':' + item.index).join('|');
      assert(firstSignature === secondSignature, type + ': landmarks are not deterministic');
      assert(Math.abs(track.totalLength - firstLength) < 0.01, type + ': route geometry changed for same seed');
      assert(lapsToWin === 2, type + ': route stopped being two laps');
      routeStats[type].push({ length: Math.round(track.totalLength), landmarks: firstSignature });
    }
  }

  const cup = shp26BuildChampionship();
  assert(cup.stages.length === 3, 'championship does not contain three stages');
  assert(new Set(cup.stages.map((stage) => stage.type)).size === 3, 'championship stages are not varied');
  assert(new Set(cup.stages.map((stage) => stage.seed)).size === 3, 'championship seeds repeat');
  shp26Career.championship = cup;
  shp26ChampionshipRaceActive = true;
  setupRace();
  const winningOrder = [player, cars[1], cars[2], cars[3], cars[4]];
  shp26AwardChampionship(winningOrder);
  shp26ChampionshipRaceActive = true;
  shp26AwardChampionship(winningOrder);
  shp26ChampionshipRaceActive = true;
  shp26AwardChampionship(winningOrder);
  assert(cup.complete === true, 'championship did not finish after three stages');
  assert(cup.championId === 'player', 'championship winner is incorrect');
  assert(cup.points.player === 30, 'championship points are incorrect');
  assert(Object.values(cup.points).reduce((sum, value) => sum + value, 0) === 78, 'championship total points are incorrect');

  shp26Career.raceCount = 0;
  shp26Career.rivalry = { id: null, scores: { rook: 0, volt: 0, mara: 0, shunt: 0 }, playerWins: 0, rivalWins: 0 };
  setupRace();
  player.finishTime = 20;
  cars.find((car) => car.id === 'volt').finishTime = 20.7;
  cars.find((car) => car.id === 'rook').finishTime = 27;
  cars.find((car) => car.id === 'mara').finishTime = 29;
  cars.find((car) => car.id === 'shunt').finishTime = 31;
  const closeOrder = [player, cars.find((car) => car.id === 'volt'), cars.find((car) => car.id === 'rook'), cars.find((car) => car.id === 'mara'), cars.find((car) => car.id === 'shunt')];
  shp26UpdateRivalry(closeOrder);
  shp26UpdateRivalry(closeOrder);
  assert(shp26RivalId() === 'volt', 'closest repeated rival was not selected');

  shpPrefs.trackType = 'technical';
  shpPrefs.difficulty = 'racer';
  prepareRoute(hashSeed(991177));
  setupRace();
  mode = 'race';
  raceElapsed = 6;
  cars.forEach((car) => { car.finishTime = 1; });
  const attacker = cars.find((car) => car.id === 'mara');
  const leader = cars.find((car) => car.id === 'volt');
  attacker.finishTime = null;
  leader.finishTime = null;
  attacker.raceScore = 1000;
  leader.raceScore = 1125;
  attacker.forwardSpeed = 420;
  leader.forwardSpeed = 405;
  attacker.signedRoadOffset = 0;
  leader.signedRoadOffset = 16;
  shp26UpdateRacecraft(attacker, 1 / 60);
  assert(['attack', 'switchback'].includes(attacker.shp26Tactic), 'AI did not prepare an overtake');
  assert(Math.abs(attacker.shp26TacticSide) === 1, 'AI overtake has no committed side');

  cars.forEach((car) => { car.finishTime = 1; });
  const defender = cars.find((car) => car.id === 'rook');
  defender.finishTime = null;
  player.finishTime = null;
  defender.raceScore = 1200;
  player.raceScore = 1080;
  defender.forwardSpeed = 390;
  player.forwardSpeed = 405;
  const bendIndex = track.findIndex((point) => Math.abs(point.curvature) > 0.0008);
  defender.trackIndex = Math.max(0, bendIndex);
  player.trackIndex = Math.max(0, bendIndex - 8);
  shp26Career.rivalry.id = 'rook';
  defender.shp26DefenseCooldown = 0;
  defender.shp26Tactic = 'line';
  defender.shp26TacticTimer = 0;
  shp26UpdateRacecraft(defender, 1 / 60);
  assert(defender.shp26Tactic === 'defend', 'main rival did not defend the corner');
  const lockedSide = defender.shp26TacticSide;
  shp26UpdateRacecraft(defender, 1 / 60);
  assert(defender.shp26TacticSide === lockedSide, 'defender weaves instead of committing to one move');

  shp26Career.pilotUnlocked = true;
  shp26EnsurePilotOption();
  shpPrefs.difficulty = 'pilot';
  setupRace();
  assert(cars.slice(1).every((car) => car.skill >= 1.18), 'Pilot pace floor was not applied');
  assert(cars.slice(1).every((car) => car.shp25Profile.errorRate === 0 && car.shp25MistakeCooldown > 9000), 'Pilot still makes random mistakes');
  assert(player.progressDistance === Math.min(...cars.map((car) => car.progressDistance)), 'Pilot does not start player last');

  shp26Career.pilotUnlocked = false;
  shpPrefs.difficulty = 'maniac';
  shp26RaceDifficulty = 'maniac';
  shp26ChampionshipRaceActive = false;
  setupRace();
  player.finishTime = 10;
  cars.slice(1).forEach((car, index) => { car.finishTime = 11 + index; });
  mode = 'race';
  finishRace();
  assert(shp26Career.pilotUnlocked === true, 'winning Maniac did not unlock Pilot');

  shp26Career.championship = shp26BuildChampionship();
  shp26Career.championship.difficulty = 'racer';
  shp26PrepareChampionshipStage(shp26Career.championship);
  shp26ChampionshipRaceActive = true;
  mode = 'paused';
  beginRace();
  assert(shp26ChampionshipRaceActive === true && mode === 'countdown', 'restarting a stage abandoned the championship');

  setupRace();
  const feelCar = player;
  feelCar.vx = Math.cos(feelCar.angle) * 360;
  feelCar.vy = Math.sin(feelCar.angle) * 360 + 70;
  feelCar.steerInput = 0.7;
  feelCar.throttleInput = 1;
  feelCar.distanceFromRoad = 0;
  mode = 'race';
  updateCar(feelCar, 1 / 60);
  assert(Number.isFinite(feelCar.shp26BodyRoll) && Number.isFinite(feelCar.shp26BodyPitch), 'body motion is not finite');
  const particleCount = particles.length;
  shp26SpawnTyreSmoke(feelCar);
  assert(particles.length === particleCount + 2 && particles.slice(-2).every((particle) => particle.kind === 'smoke'), 'tyre smoke is not generated from both rear wheels');
  drawCar(feelCar);
  drawParticles();
  draw();

  shpPrefs.difficulty = 'pilot';
  shpPrefs.controlMode = 'precision';
  prepareRoute(hashSeed(260619));
  setupRace();
  mode = 'race';
  shpAnalog.throttle = 1;
  shpAnalog.brake = 0;
  shpAnalog.steer = 0;
  for (let i = 0; i < 1440; i += 1) updateSimulation(1 / 120);
  assert(cars.every((car) => [car.x, car.y, car.vx, car.vy, car.angle, car.raceScore].every(Number.isFinite)), 'full 2.6 simulation produced non-finite state');
  assert(cars.slice(1).some((car) => car.progressDistance > 1100), 'Pilot rivals did not make meaningful progress');

  return {
    failures,
    routeStats,
    cupPoints: cup.points,
    rival: shp26RivalId(),
    pilotSkills: cars.slice(1).map((car) => Number(car.skill.toFixed(3))),
    landmarks: shp26Landmarks.map((item) => item.kind),
    smokeParticles: particles.filter((particle) => particle.kind === 'smoke').length
  };
})()`).runInContext(context);

if (result.failures.length) {
  console.error('ШПИЛЬКА 2.6 audit failed:');
  result.failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}

const trackSummary = Object.fromEntries(Object.entries(result.routeStats).map(([key, routes]) => [key, {
  min: Math.min(...routes.map((route) => route.length)),
  max: Math.max(...routes.map((route) => route.length)),
  landmarkVariants: new Set(routes.map((route) => route.landmarks)).size
}]));
console.log('ШПИЛЬКА 2.6 audit passed:', JSON.stringify({
  tracks: trackSummary,
  cupPoints: result.cupPoints,
  rival: result.rival,
  pilotSkills: result.pilotSkills,
  landmarks: result.landmarks,
  smokeParticles: result.smokeParticles
}));
