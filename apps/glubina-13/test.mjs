import assert from 'node:assert/strict';
import {
  BASE_RADIUS,
  attentionSpawnReady,
  canExtract,
  cargoCapacity,
  createListener,
  generateChunk,
  maxHull,
  moveWithCollisions,
  sanitizeSavedRun,
  stepListener,
  updateAttention,
  upgradeCost,
} from './game-core.js';

const seed = 0x13c0ffee;
const starterChunk = generateChunk(seed, 0, -1, null);
const starter = starterChunk.pickups.find((item) => item.id === 'starter-relic');
assert.ok(starter, 'starter relic must always exist');
assert.equal(starter.x, 0);
assert.equal(starter.z, -20);
for (const wall of starterChunk.walls) {
  const corridorOverlap = Math.abs(wall.x) < wall.w / 2 + 5.4 && wall.z + wall.d / 2 > -34 && wall.z - wall.d / 2 < -6;
  assert.equal(corridorOverlap, false, 'starter corridor must remain clear');
}

const baseChunk = generateChunk(seed, 0, 0, null);
for (const wall of baseChunk.walls) {
  assert.ok(Math.hypot(wall.x, wall.z) > 11, 'base must not contain collision walls');
}

const starterWalls = [...baseChunk.walls, ...starterChunk.walls];
let routePosition = { x: 0, z: 0 };
let routeCollisions = 0;
for (let step = 0; step < 40; step += 1) {
  const moved = moveWithCollisions(routePosition, { x: 0, z: -0.5 }, starterWalls);
  routePosition = { x: moved.x, z: moved.z };
  routeCollisions += Number(moved.collided);
}
assert.ok(routePosition.z < -19.5, 'starter relic must be reachable by a straight quiet route');
assert.equal(routeCollisions, 0, 'starter route must not scrape invisible geometry');
for (let step = 0; step < 40; step += 1) {
  const moved = moveWithCollisions(routePosition, { x: 0, z: 0.5 }, starterWalls);
  routePosition = { x: moved.x, z: moved.z };
}
assert.ok(Math.hypot(routePosition.x, routePosition.z) < 0.6, 'the same route must lead back to the gate');
assert.equal(canExtract({ cargoCount: 1, distanceFromBase: 2, speed: 0.1, hold: 1.6 }), 1.6, 'a stopped capsule with cargo must be extractable');

const wall = { x: 2, z: 0, w: 2, d: 8 };
const collision = moveWithCollisions({ x: 0, z: 0 }, { x: 4, z: 0 }, [wall]);
assert.equal(collision.collided, true);
assert.ok(collision.x <= 0.2, 'collision resolver must prevent tunneling through a wall');

assert.equal(maxHull({ hull: 0 }), 4, 'base hull should have four sections');
assert.equal(maxHull({ hull: 2 }), 6);
assert.equal(cargoCapacity({ cargo: 0 }), 3);
assert.equal(cargoCapacity({ cargo: 2 }), 5);
assert.equal(upgradeCost('propeller', 0), 100);
assert.equal(upgradeCost('propeller', 2), null);

assert.equal(attentionSpawnReady({ elapsed: 81, distanceFromBase: 80, cargoCount: 2, attention: 100, successes: 0 }), false, 'first expedition must keep its full grace period');
assert.equal(attentionSpawnReady({ elapsed: 83, distanceFromBase: 80, cargoCount: 1, attention: 63, successes: 0 }), true);
assert.equal(attentionSpawnReady({ elapsed: 200, distanceFromBase: 20, cargoCount: 3, attention: 100, successes: 4 }), false, 'listener must not spawn near the base');
assert.equal(attentionSpawnReady({ elapsed: 200, distanceFromBase: 80, cargoCount: 0, attention: 100, successes: 4 }), false, 'listener must not spawn before any cargo is found');

let attention = updateAttention(0, { dt: 4, throttle: 0.1, noiseFactor: 1 });
assert.equal(attention, 0, 'quiet movement must not create attention');
attention = updateAttention(0, { dt: 0, throttle: 0, sonar: true, noiseFactor: 1 });
assert.equal(attention, 23);
attention = updateAttention(attention, { dt: 10, throttle: 0, noiseFactor: 1 });
assert.equal(attention, 0, 'attention must decay while silent');

let listener = createListener(20, 0, 0);
listener.targetX = 0;
listener.targetZ = 0;
let outcome = stepListener(listener, {
  player: { x: 0, z: 0 },
  noise: { x: 0, z: 0, strength: 60, age: 0 },
  elapsed: 1,
  playerInvulnerability: 0,
}, 1);
assert.ok(outcome.listener.x < 20, 'listener must move toward the last audible event');

listener = { ...outcome.listener, x: 41.1, z: 0, state: 'investigate', hitCooldown: 0 };
outcome = stepListener(listener, {
  player: { x: 40, z: 0 },
  noise: null,
  elapsed: 2,
  playerInvulnerability: 0,
}, 0.05);
assert.equal(outcome.hit, true, 'listener may damage the player once at close range');
assert.equal(outcome.listener.state, 'flee', 'listener must flee after a hit');

outcome = stepListener(outcome.listener, {
  player: { x: 40, z: 0 },
  noise: null,
  elapsed: 2.1,
  playerInvulnerability: 4,
}, 0.05);
assert.equal(outcome.hit, false, 'invulnerability must block chain damage');

listener = createListener(20, 0, 0);
listener.lastHeardAt = 0;
outcome = stepListener(listener, {
  player: { x: 0, z: 0 },
  noise: { x: 0, z: 0, strength: 0, age: 99 },
  elapsed: 13,
  playerInvulnerability: 0,
}, 0.1);
assert.equal(outcome.listener.state, 'retreat', 'listener must lose the trail after silence');

const saved = sanitizeSavedRun({
  schema: 3,
  seed,
  x: 12,
  z: -24,
  oxygen: 80,
  hull: 4,
  sonar: 50,
  cargo: [{ type: 'relic', value: 30 }],
  collected: ['starter-relic'],
});
assert.ok(saved);
assert.equal(saved.cargo.length, 1);
assert.equal(sanitizeSavedRun({ schema: 2, x: 0, z: 0, oxygen: 100 }), null, 'old incompatible runs must fail safely');

assert.ok(BASE_RADIUS >= 7, 'base should provide a readable safe zone');
console.log('ГЛУБИНА 13 2.1 audit: PASS');
