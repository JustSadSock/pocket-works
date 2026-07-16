import assert from 'node:assert/strict';
import {
  AIRCRAFT_CORE_RADIUS,
  CHUNK_LENGTH,
  awardScore,
  biomeAt,
  canyonClearance,
  comboMultiplier,
  courseAt,
  createChunkPlan,
  createFlightState,
  dailySeed,
  gateHit,
  routeCode,
  sanitizeProfile,
  sanitizeSavedRun,
  stepFlight,
  sweptObstacleClearance,
} from './game-core.js';
import { RidgeWorld } from './world.js';

const seed = dailySeed('2026-07-15');
assert.equal(seed, dailySeed('2026-07-15'), 'daily seed must be deterministic');
assert.notEqual(seed, dailySeed('2026-07-16'), 'different dates must produce different routes');
assert.equal(routeCode(seed).length, 7, 'route code must stay compact');
const biomeIds = new Set(Array.from({ length: 8 }, (_, index) => biomeAt(index * 430 + 20, seed).id));
assert.ok(biomeIds.size >= 3, 'long routes must contain several distinct biomes');
assert.deepEqual(biomeAt(900, seed), biomeAt(900, seed), 'biome transitions must be deterministic');

for (let index = -2; index < 180; index += 1) {
  const plan = createChunkPlan(index, seed);
  assert.equal(plan.index, index);
  assert.equal(plan.zStart, index * CHUNK_LENGTH);
  assert.deepEqual(plan, createChunkPlan(index, seed), 'chunk plans must be reproducible');
  for (const gate of plan.gates) {
    const course = courseAt(gate.z, seed);
    assert.ok(Math.abs(gate.x - course.center) < course.width, 'gate center must remain in the canyon');
    assert.ok(gate.y - gate.radius > course.floor, 'gate opening must remain above the floor');
  }
  for (const obstacle of plan.obstacles) {
    const course = courseAt(obstacle.z, seed);
    assert.ok(Math.abs(obstacle.x - course.center) <= course.width, 'rock needle must remain in the playable canyon');
    assert.ok(obstacle.height > 6, 'rock needle must be visible');
  }
}

const normal = createFlightState();
const boosted = createFlightState();
const course = courseAt(0, seed);
normal.x = boosted.x = course.center;
normal.y = boosted.y = course.floor + 12;
for (let index = 0; index < 180; index += 1) {
  stepFlight(normal, { x: 0, y: 0, boosted: false, sensitivity: 1 }, 1 / 60, course, 0);
  stepFlight(boosted, { x: 0, y: 0, boosted: true, sensitivity: 1 }, 1 / 60, course, 0);
}
assert.ok(boosted.speed > normal.speed + 7, 'afterburner must materially increase speed');
assert.ok(boosted.y < normal.y - 1.5, 'afterburner must create a small, readable nose-down load');
assert.ok(normal.z > 60, 'a normal flight must move forward');

const steerRight = createFlightState();
for (let index = 0; index < 60; index += 1) {
  stepFlight(steerRight, { x: 1, y: 0, boosted: false, sensitivity: 1 }, 1 / 60, course, 0);
}
assert.ok(steerRight.vx < -4, 'screen-right input must move toward camera-right (-world X)');

const safe = { x: course.center, y: course.floor + 8, z: 0 };
assert.ok(canyonClearance(safe, course).minimum > 5, 'initial flight corridor must be safe');

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
assert.equal(profile.savedRun, null);

const saved = sanitizeSavedRun({
  version: 1,
  seed,
  mode: 'daily',
  flight: normal,
  score: 1200,
  integrity: 64,
  flow: 30,
  combo: 4,
  maxCombo: 7,
  passed: ['g:1'],
  grazed: ['r:2:0'],
});
assert.ok(saved);
assert.equal(saved.seed, seed);
assert.equal(saved.combo, 4);
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

console.log('ХРЕБЕТ audit passed: deterministic biomes, finite WebGL geometry, screen-relative steering, tapered swept collisions, aircraft physics, gates, scoring and persistence.');
