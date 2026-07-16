import assert from 'node:assert/strict';
import {
  AIRCRAFT_CORE_RADIUS,
  CHUNK_LENGTH,
  airframeCanyonClearance,
  awardScore,
  biomeAt,
  canyonClearance,
  comboMultiplier,
  courseAt,
  createChunkPlan,
  createFlightState,
  dailySeed,
  damageFactors,
  damageIntegrity,
  gateHit,
  impactSeverity,
  routeCode,
  sanitizeDamage,
  sanitizeProfile,
  sanitizeSavedRun,
  stepFlight,
  sweptAirframeClearance,
  sweptObstacleClearance,
  virtualStickInput,
} from './game-core.js';
import { RidgeWorld } from './world.js';

const seed = dailySeed('2026-07-15');
assert.equal(seed, dailySeed('2026-07-15'), 'daily seed must be deterministic');
assert.notEqual(seed, dailySeed('2026-07-16'), 'different dates must produce different routes');
assert.equal(routeCode(seed).length, 7, 'route code must stay compact');
const biomeIds = new Set(Array.from({ length: 8 }, (_, index) => biomeAt(index * 430 + 20, seed).id));
assert.ok(biomeIds.size >= 3, 'long routes must contain several distinct biomes');
assert.deepEqual(biomeAt(900, seed), biomeAt(900, seed), 'biome transitions must be deterministic');

const setpieces = new Set();
const obstacleKinds = new Set();
for (let index = -2; index < 180; index += 1) {
  const plan = createChunkPlan(index, seed);
  setpieces.add(plan.setpiece);
  assert.equal(plan.index, index);
  assert.equal(plan.zStart, index * CHUNK_LENGTH);
  assert.deepEqual(plan, createChunkPlan(index, seed), 'chunk plans must be reproducible');
  for (const gate of plan.gates) {
    const course = courseAt(gate.z, seed);
    assert.ok(Math.abs(gate.x - course.center) < course.width, 'gate center must remain in the canyon');
    assert.ok(gate.y - gate.radius > course.floor, 'gate opening must remain above the floor');
  }
  for (const obstacle of plan.obstacles) {
    obstacleKinds.add(obstacle.kind);
    const course = courseAt(obstacle.z, seed);
    assert.ok(Math.abs(obstacle.x - course.center) <= course.width + (obstacle.halfX || 0), 'obstacle anchor must remain in the canyon');
    if (obstacle.kind === 'needle') {
      assert.ok(obstacle.height > 6 && obstacle.radius > 0.6, 'rock needle must be visible');
    } else if (obstacle.kind === 'boulder') {
      assert.ok(obstacle.radius > 1 && obstacle.y > course.floor, 'boulder must hang above the floor');
    } else {
      assert.ok(obstacle.halfX > 0 && obstacle.halfY > 0 && obstacle.halfZ > 0, 'box obstacle must have a valid volume');
    }
  }
}
assert.ok(setpieces.size >= 6, 'routes must contain open space and all five setpiece families');
assert.deepEqual([...obstacleKinds].sort(), ['beam', 'boulder', 'cable', 'needle', 'pillar', 'shelf'], 'every obstacle family must be generated');

const normal = createFlightState();
const folded = createFlightState();
const pulled = createFlightState();
const course = courseAt(0, seed);
normal.x = folded.x = pulled.x = course.center;
normal.y = folded.y = pulled.y = course.floor + 18;
let maxPullStall = 0;
let maxPulledY = pulled.y;
let minPulledSpeed = pulled.speed;
for (let index = 0; index < 540; index += 1) {
  stepFlight(normal, { x: 0, y: 0, folded: false, sensitivity: 1 }, 1 / 60, course, 0);
  stepFlight(folded, { x: 0, y: 0, folded: true, sensitivity: 1 }, 1 / 60, course, 0);
  stepFlight(pulled, { x: 0, y: -1, folded: false, sensitivity: 1 }, 1 / 60, course, 0);
  maxPullStall = Math.max(maxPullStall, pulled.stall);
  maxPulledY = Math.max(maxPulledY, pulled.y);
  minPulledSpeed = Math.min(minPulledSpeed, pulled.speed);
}
assert.ok(folded.speed > normal.speed + 5, 'folded wings must exchange altitude for speed');
assert.ok(folded.y < normal.y - 18, 'folded wings must materially reduce lift');
assert.ok(maxPulledY > course.floor + 23, 'pulling up must create lift before the stall');
assert.ok(minPulledSpeed < normal.speed - 3, 'climbing must spend kinetic energy');
assert.ok(maxPullStall > 0.35, 'sustained excessive angle of attack must cause a stall');
assert.ok(normal.z > 60, 'a normal flight must move forward');

const steadyGlide = createFlightState();
steadyGlide.x = course.center;
steadyGlide.y = course.floor + 18.5;
const steadyStartY = steadyGlide.y;
for (let index = 0; index < 600; index += 1) {
  stepFlight(steadyGlide, { x: 0, y: 0, flightAssist: true }, 1 / 60, course, 0);
}
assert.ok(steadyGlide.y > steadyStartY - 2.5, 'ridge airflow must keep a neutral paper plane on a safe shallow glide for at least ten seconds');
assert.ok(steadyGlide.speed > 27, 'neutral ridge flight must not bleed speed and fall immediately');

const asymmetric = createFlightState();
asymmetric.x = course.center;
asymmetric.y = course.floor + 18;
for (let index = 0; index < 150; index += 1) {
  stepFlight(asymmetric, { x: 0, y: 0, damage: { leftWing: 24, rightWing: 100, nose: 45, fold: 62 } }, 1 / 60, course, 0);
}
assert.ok(Math.abs(asymmetric.bank) > 0.28, 'asymmetric wing damage must create a persistent roll');
assert.ok(Math.abs(asymmetric.vx) > 1.2, 'asymmetric damage must pull the paper plane sideways');
const damagedFactors = damageFactors({ leftWing: 30, rightWing: 100, nose: 40, fold: 60 });
assert.ok(damagedFactors.lift < 0.75 && damagedFactors.drag > 1.4 && Math.abs(damagedFactors.rollBias) > 0.2, 'damage factors must affect lift, drag and trim');

const steerRight = createFlightState();
for (let index = 0; index < 60; index += 1) {
  stepFlight(steerRight, { x: 1, y: 0, boosted: false, sensitivity: 1 }, 1 / 60, course, 0);
}
assert.ok(steerRight.vx > 2.5, 'screen-right input must move toward the player-visible right side');

assert.deepEqual(virtualStickInput(2, 2, 390, 844), { x: 0, y: 0 }, 'tiny finger jitter must stay inside the stick deadzone');
const shortTouchMove = virtualStickInput(22, 0, 390, 844);
assert.ok(shortTouchMove.x > 0.3 && shortTouchMove.x < 0.5, 'a short phone gesture must create a useful steering command');
const fullDesktopMove = virtualStickInput(150, 0, 1280, 720);
assert.equal(fullDesktopMove.x, 1, 'desktop steering must reach full authority without a very long drag');

const assistedRelease = createFlightState();
const manualRelease = createFlightState();
for (let index = 0; index < 60; index += 1) {
  stepFlight(assistedRelease, { x: 1, y: 0, flightAssist: true }, 1 / 60, course, 0);
  stepFlight(manualRelease, { x: 1, y: 0, flightAssist: false }, 1 / 60, course, 0);
}
for (let index = 0; index < 90; index += 1) {
  stepFlight(assistedRelease, { x: 0, y: 0, flightAssist: true }, 1 / 60, course, 0);
  stepFlight(manualRelease, { x: 0, y: 0, flightAssist: false }, 1 / 60, course, 0);
}
assert.ok(Math.abs(assistedRelease.bank) < 0.01, 'flight assist must level the paper plane after releasing the controls');
assert.ok(Math.abs(assistedRelease.vx) < Math.abs(manualRelease.vx) * 0.5, 'flight assist must stop unwanted lateral drift quickly');

const safe = { x: course.center, y: course.floor + 8, z: 0 };
assert.ok(canyonClearance(safe, course).minimum > 5, 'initial flight corridor must be safe');
assert.ok(airframeCanyonClearance(safe, course).minimum > 4, 'the full paper airframe must fit the initial corridor');

const taperedNeedle = { x: 0, z: 10, baseY: 0, height: 20, radius: 2 };
const highPass = sweptObstacleClearance(
  { x: 1.15, y: 18, z: 8 },
  { x: 1.15, y: 18, z: 12 },
  taperedNeedle,
  AIRCRAFT_CORE_RADIUS
);
const lowHit = sweptObstacleClearance(
  { x: 1.15, y: 3, z: 8 },
  { x: 1.15, y: 3, z: 12 },
  taperedNeedle,
  AIRCRAFT_CORE_RADIUS
);
assert.ok(highPass.clearance > 0.3, 'needle tip must not keep the invisible radius of its base');
assert.ok(lowHit.clearance < 0, 'swept collision must still catch a visible low-altitude impact');

const wingTrap = { kind: 'cable', x: 0.94, y: 5, z: 10, halfX: 0.09, halfY: 0.12, halfZ: 0.2, hardness: 0.52 };
const wingContact = sweptAirframeClearance(
  { ...createFlightState(), x: 0, y: 5, z: 9.2 },
  { ...createFlightState(), x: 0, y: 5, z: 10.8 },
  wingTrap
);
assert.ok(wingContact.clearance < 0, 'airframe sweep must catch a cable that only touches a wing');
assert.equal(wingContact.zone, 'leftWing', 'wing-only contact must report the damaged zone');
const wingSlice = impactSeverity(34, -0.12, 'leftWing', wingTrap);
const softCore = impactSeverity(20, -0.02, 'fold', { kind: 'boulder', hardness: 0.9 });
assert.ok(wingSlice > softCore, 'a fast cable strike must tear a wing more than a soft low-speed core brush');

const freshDamage = sanitizeDamage(null);
const tornDamage = sanitizeDamage({ leftWing: 20, rightWing: 75, nose: 60, fold: 45 });
assert.equal(damageIntegrity(freshDamage), 100);
assert.ok(damageIntegrity(tornDamage) < 55, 'component health must produce a weighted total condition');

const gate = { x: 2, y: 7, z: 10, radius: 4 };
assert.equal(gateHit({ x: 0, y: 7, z: 9 }, { x: 3, y: 7, z: 11 }, gate), true);
assert.equal(gateHit({ x: -8, y: 7, z: 9 }, { x: -7, y: 7, z: 11 }, gate), false);
assert.equal(comboMultiplier(1), 1);
assert.ok(awardScore(100, 5, true) > awardScore(100, 5, false));

const dirtyProfile = {
  flights: -20,
  bestDistance: '900',
  settings: { sound: false, haptics: true, sensitivity: 999, effects: false },
  savedRun: { version: 999 },
};
const profile = sanitizeProfile(dirtyProfile);
assert.equal(profile.flights, 0);
assert.equal(profile.bestDistance, 900);
assert.equal(profile.settings.sound, false);
assert.equal(profile.settings.sensitivity, 1);
assert.equal(profile.settings.flightAssist, true);
assert.equal(profile.savedRun, null);

const saved = sanitizeSavedRun({
  version: 2,
  seed,
  mode: 'daily',
  flight: normal,
  score: 1200,
  damage: { leftWing: 72, rightWing: 84, nose: 61, fold: 77 },
  flow: 30,
  combo: 4,
  maxCombo: 7,
  passed: ['g:1'],
  grazed: ['r:2:0'],
});
assert.ok(saved);
assert.equal(saved.seed, seed);
assert.equal(saved.combo, 4);
assert.equal(saved.damage.nose, 61);
assert.equal(saved.integrity, damageIntegrity(saved.damage));
assert.deepEqual(saved.passed, ['g:1']);

const collectedGeometry = [];
const fakeEngine = {
  particles: {
    visible: true,
    size: 0,
    alpha: 0,
    color: [1, 1, 1],
    update() {},
  },
  createMesh(geometry, options = {}) {
    collectedGeometry.push(geometry);
    return {
      position: options.position ? [...options.position] : [0, 0, 0],
      rotation: options.rotation ? [...options.rotation] : [0, 0, 0],
      scale: options.scale ? [...options.scale] : [1, 1, 1],
      color: options.color ? [...options.color] : [1, 1, 1],
      material: options.material || 0,
      emissive: options.emissive || 0,
      alpha: options.alpha ?? 1,
    };
  },
  remove() {},
};
const world = new RidgeWorld(fakeEngine, seed);
world.updateChunks(0);
assert.ok(world.chunks.size >= 6, 'world manager must fill the camera horizon');
assert.ok(collectedGeometry.length > 30, 'world manager must build terrain, pilot, gates and rocks');
for (const geometry of collectedGeometry) {
  assert.ok(geometry.count > 0, 'every WebGL mesh must contain vertices');
  assert.equal(geometry.positions.length, geometry.normals.length, 'positions and normals must match');
  assert.ok(geometry.positions.every(Number.isFinite), 'terrain must not contain NaN coordinates');
  assert.ok(geometry.normals.every(Number.isFinite), 'terrain normals must stay finite');
}

console.log('ХРЕБЕТ audit passed: deterministic biomes and setpieces, finite WebGL geometry, paper-plane aerodynamics, stalls, zonal swept collisions, persistent damage, gates, scoring and saves.');
