import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = (path) => readFile(path, 'utf8');

const [
  indexSource,
  appSource,
  routeSource,
  aiSource,
  physicsSource,
  uiSource,
  bootSource,
  configSource,
  workerSource,
  stylesSource
] = await Promise.all([
  read('apps/shpilka/index.html'),
  read('apps/shpilka/app.js'),
  read('apps/shpilka/engine-v2-28-route.js'),
  read('apps/shpilka/engine-v2-28-ai.js'),
  read('apps/shpilka/engine-v2-28-physics.js'),
  read('apps/shpilka/engine-v2-28-ui.js'),
  read('apps/shpilka/engine-v2-12.js'),
  read('apps/shpilka/app.config.json'),
  read('apps/shpilka/sw.js'),
  read('apps/shpilka/systems-28.css')
]);
const config = JSON.parse(configSource);

assert(config.version === '2.8.0', 'app config version is not 2.8.0');
assert(config.cacheName === 'shpilka-v2.8.0-p1', 'app config cache name is stale');
assert(indexSource.includes('id="loadingScreen"') && indexSource.includes('id="loadingProgress"'), 'loading screen is missing');
assert(indexSource.includes('data-app-version="2.8.0"'), 'update manager version is stale');
assert(!indexSource.includes('data-workshop-trigger'), 'Workshop system control is still exposed in the final menu');
assert(!indexSource.includes('class="control-help"'), 'technical control-help copy is still present in the final menu');
assert(uiSource.includes('finishMenuButton') && uiSource.includes('pauseMenuButton'), 'internal main-menu exits are missing');
assert(uiSource.includes('shp28ReturnToMenu'), 'main-menu return flow is missing');
assert(bootSource.includes('requestAnimationFrame(() =>') && bootSource.includes('shp28LoadingVisible(true)'), 'route generation is not deferred behind the loading UI');
assert(stylesSource.includes('.loading-screen') && stylesSource.includes('@keyframes shp28-load'), 'loading screen styling is missing');

for (const filename of ['engine-v2-28-route.js', 'engine-v2-28-ai.js', 'engine-v2-28-physics.js', 'engine-v2-28-ui.js']) {
  assert(appSource.includes(`'./${filename}'`), `${filename} is not loaded by app.js`);
  assert(workerSource.includes(`'./${filename}'`), `${filename} is not cached by the service worker`);
}
assert(workerSource.includes("const APP_VERSION='2.8.0'"), 'service worker version is stale');
assert(workerSource.includes("'./systems-28.css'"), '2.8 styles are not cached');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
};
const hashSeed = (value) => {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
};
const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

class MockPath2D {
  constructor() { this.points = []; }
  moveTo(x, y) { this.points.push(['m', x, y]); }
  lineTo(x, y) { this.points.push(['l', x, y]); }
  closePath() {}
}

const track = Array.from({ length: 600 }, (_, index) => {
  const distance = index * 25;
  let curvature = 0.00008;
  if (index >= 80 && index < 160) curvature = 0.00076;
  else if (index >= 160 && index < 220) curvature = 0.00152;
  else if (index >= 300 && index < 380) curvature = -0.00082;
  else if (index >= 380 && index < 440) curvature = -0.00158;
  else if (index >= 520) curvature = 0.00068;
  const angle = index / 600 * Math.PI * 2;
  return {
    x: Math.cos(angle) * 2450,
    y: Math.sin(angle) * 1900,
    distance,
    curvature,
    heading: angle + Math.PI / 2,
    tx: -Math.sin(angle),
    ty: Math.cos(angle),
    nx: -Math.cos(angle),
    ny: -Math.sin(angle),
    raceOffset: 0
  };
});
track.totalLength = 15000;

const routeState = {
  roadWidth: 190,
  roadHalf: 95,
  track,
  trackSeed: 280041,
  shpActiveArchetype: { id: 'technical' },
  shpRampIndices: [],
  rampIndex: -1
};
const routeContext = vm.createContext({
  console, Math, Number, Object, Array, String, Boolean, Map, Set,
  clamp, lerp, smoothstep, hashSeed, mulberry32, Path2D: MockPath2D,
  track: routeState.track,
  roadWidth: routeState.roadWidth,
  roadHalf: routeState.roadHalf,
  trackSeed: routeState.trackSeed,
  shpActiveArchetype: routeState.shpActiveArchetype,
  shpRampIndices: routeState.shpRampIndices,
  rampIndex: routeState.rampIndex,
  prepareRoute() {}, rebuildTrackPaths() {}, updateRouteUi() {},
  shp271AverageRaceOffset() { return 10; },
  window: null
});
routeContext.window = routeContext;
new vm.Script(routeSource, { filename: 'engine-v2-28-route.js' }).runInContext(routeContext);

routeContext.shp28RebuildRacingLine();
const offsets = track.map((point) => point.raceOffset);
assert(Math.max(...offsets) > 20 && Math.min(...offsets) < -20, 'racing line does not create both left and right apex offsets');
assert(Math.max(...offsets.map(Math.abs)) > 35, 'racing line remains too close to the road centre');

routeContext.shpActiveArchetype.id = 'technical';
routeContext.trackSeed = 280041;
routeContext.shp28BuildSections();
const technicalSignature = routeContext.shp28Sections.map((item) => `${item.kind}:${Math.round(item.center)}`).join('|');
assert(routeContext.shp28Sections.length >= 3, 'technical route does not receive enough practical modules');
assert(routeContext.shp28Sections.some((item) => item.width < 0.9), 'route modules never narrow the road');
assert(routeContext.shp28Sections.some((item) => item.width > 1.15), 'route modules never create a wide multi-line section');
assert(routeContext.shp28Sections.some((item) => item.grip < 0.9), 'route modules never alter grip');
routeContext.shp28BuildSections();
const technicalRepeat = routeContext.shp28Sections.map((item) => `${item.kind}:${Math.round(item.center)}`).join('|');
assert(technicalSignature === technicalRepeat, 'route modules are not deterministic for the same route code');
routeContext.shp28ConfigureJump();
assert(routeContext.shp28Jump == null && routeContext.shpRampIndices.length === 0, 'technical route still receives a decorative ramp');

let cascadeJump = null;
for (let seed = 280100; seed < 280124 && !cascadeJump; seed += 1) {
  routeContext.trackSeed = seed;
  routeContext.shpActiveArchetype.id = 'cascade';
  routeContext.shp28BuildSections();
  routeContext.shp28ConfigureJump();
  cascadeJump = routeContext.shp28Jump;
}
assert(cascadeJump && cascadeJump.gapLength > 200, 'cascade routes cannot create a real jump over a gap');
assert(routeContext.shpRampIndices.length <= 1, 'legacy decorative ramp chains remain active');
assert(physicsSource.includes("fillText('ПРЫЖОК'") && physicsSource.includes('shp28Jump.gapLength'), 'jump is not visually marked as a gap crossing');

const aiCar = {
  id: 'mara', player: false, shp27ErrorTimer: 0, shp27ErrorCooldown: 0,
  shp28MistakeKind: null, trackIndex: 0, forwardSpeed: 420, completedLaps: 0,
  signedRoadOffset: 0, skill: 1, shp27Tactic: 'line'
};
const aiContext = vm.createContext({
  console, Math, Number, Object, Array, String, Boolean,
  clamp, lerp,
  shpPrefs: { difficulty: 'pilot' },
  raceElapsed: 10,
  MAX_SPEED: 760,
  track: [{ distance: 0 }],
  cars: [aiCar],
  shp28Jump: null,
  shp28SectionAtCar() { return { kind: 'gravel', grip: 0.78 }; },
  shp28ForwardDistance() { return 9999; },
  shp25Random() { return 0; },
  aiControls() { return { steer: 0.58, throttle: 1, brake: 0 }; },
  shp27TargetSpeed() { return 600; },
  setupRace() {},
  window: null
});
aiContext.window = aiContext;
new vm.Script(aiSource, { filename: 'engine-v2-28-ai.js' }).runInContext(aiContext);
assert(aiContext.shp28MistakeRates.pilot > 0, 'Pilot mistakes are still completely disabled');
assert(aiContext.shp28MistakeRates.pilot < aiContext.shp28MistakeRates.maniac, 'Pilot is not more consistent than Maniac');
assert(aiContext.shp28MistakeRates.maniac < aiContext.shp28MistakeRates.racer, 'high difficulty mistake hierarchy is inverted');
aiContext.shp27UpdateMildError(aiCar, 1, {}, { maximum: 0.0012, signed: 0.001 });
assert(aiCar.shp28MistakeKind === 'late' && aiCar.shp27ErrorTimer > 0, 'contextual high-difficulty mistake cannot start');
aiCar.shp27ErrorTimer = aiCar.shp28MistakeTotal * 0.35;
const mistakeControls = aiContext.aiControls(aiCar, 1 / 60);
assert(mistakeControls.brake >= 0.6 && mistakeControls.throttle <= 0.18, 'late-braking mistake has no visible recovery phase');
const gravelSpeed = aiContext.shp27TargetSpeed(aiCar, {}, {}, {}, null);
assert(gravelSpeed < 600, 'AI ignores low-grip route modules');

const physicsTrack = [{ distance: 0, shp28WidthFactor: 1, heading: 0, x: 0, y: 0 }];
physicsTrack.totalLength = 15000;
const physicsContext = vm.createContext({
  console, Math, Number, Object, Array, String, Boolean,
  clamp, lerp, smoothstep,
  roadWidth: 190, roadHalf: 95, MAX_SPEED: 760, CAR_WHEELBASE: 45,
  track: physicsTrack,
  shp28BaseRoadWidth: 190, shp28BaseRoadHalf: 95,
  shp28Sections: [], shp28Jump: null,
  shp28LocalHalf() { return 95; },
  shp28SectionAtCar() { return null; },
  shp28InJumpGap() { return false; },
  shp28PointAtDistance() { return physicsTrack[0]; },
  updateCar(car, dt) {
    car.angle = 0;
    car.vx = Math.min(760, (car.vx || 0) + 520 * dt);
    car.vy = car.vy || 0;
    car.forwardSpeed = car.vx;
    car.lateralSpeed = car.vy;
    car.airborne = false;
    car.collisionCooldown = 0;
  },
  drawTrackSurface() {}, drawRamp() {}, draw() {}, drawFinishLine() {},
  drawWorldBackground() {}, drawSkidMarks() {}, drawCars() {}, drawParticles() {},
  drawSpeedStreaks() {}, drawVignette() {},
  ctx: new Proxy({}, { get: () => () => {}, set: () => true }),
  theme: { terrain: '#ccc', terrainDark: '#999', shoulder: '#777', asphalt: '#333' },
  dpr: 1, viewportWidth: 390, viewportHeight: 844,
  player: null, cameraZoom: 0.8, cameraShake: 0, cameraShakeX: 0, cameraShakeY: 0,
  cameraX: 0, cameraY: 0, cameraAngle: 0, mode: 'race',
  recoverCar() {}, showRaceMessage() {},
  window: null
});
physicsContext.window = physicsContext;
new vm.Script(physicsSource, { filename: 'engine-v2-28-physics.js' }).runInContext(physicsContext);

const physicsCar = {
  player: true, x: 0, y: 0, angle: 0, vx: 0, vy: 0, forwardSpeed: 0,
  lateralSpeed: 0, steerAngle: 0, yawRate: 0, trackIndex: 0,
  collisionCooldown: 0, airborne: false, bodyRattle: 0
};
let speedAtThree = 0;
for (let frame = 0; frame < 960; frame += 1) {
  physicsContext.updateCar(physicsCar, 1 / 120);
  if (frame === 359) speedAtThree = physicsCar.forwardSpeed;
}
const speedAtEight = physicsCar.forwardSpeed;
assert(speedAtThree > 280 && speedAtThree < 570, `three-second acceleration is still too fast or too weak (${speedAtThree.toFixed(1)})`);
assert(speedAtEight > 620, `vehicle no longer reaches racing speed in a reasonable time (${speedAtEight.toFixed(1)})`);

physicsCar.vx = 700;
physicsCar.forwardSpeed = 700;
physicsCar.steerAngle = 0.58;
physicsCar.yawRate = 5;
physicsContext.updateCar(physicsCar, 1 / 120);
assert(Number.isFinite(physicsCar.yawRate) && Math.abs(physicsCar.yawRate) < 5, 'high-speed yaw is not stabilised');
assert(physicsSource.includes('shp28StableTrackHeading') && physicsSource.includes('cameraShake > 0.7'), 'camera still follows raw high-speed jitter');

assert(routeSource.includes('external') === false, 'route generation unexpectedly depends on an external service');
assert(config.changelog.length === 4, '2.8 changelog is incomplete');

if (failures.length) {
  console.error('ШПИЛЬКА 2.8 audit failed:');
  failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}

console.log('ШПИЛЬКА 2.8 audit passed:', JSON.stringify({
  modules: technicalSignature,
  racingLineRange: [Number(Math.min(...offsets).toFixed(1)), Number(Math.max(...offsets).toFixed(1))],
  cascadeGap: cascadeJump ? Math.round(cascadeJump.gapLength) : null,
  speedAtThree: Number(speedAtThree.toFixed(1)),
  speedAtEight: Number(speedAtEight.toFixed(1)),
  pilotMistakeRate: aiContext.shp28MistakeRates.pilot
}));
