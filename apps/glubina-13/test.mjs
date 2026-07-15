import assert from 'node:assert/strict';
import {
  CHUNK_SIZE,
  TREASURE_TYPES,
  canExtract,
  cargoValue,
  chunkCoordinate,
  chunkKey,
  circleVsCircle,
  distanceToBase,
  generateChunk,
  hash2D,
  listenerStep,
  movementNoise,
  resolveCircleObstacle,
  sanitizeProfile,
  sanitizeSavedRun,
  upgradeCost,
} from './game-core.js';

assert.equal(chunkCoordinate(0), 0);
assert.equal(chunkCoordinate(CHUNK_SIZE / 2 + 0.01), 1);
assert.equal(chunkCoordinate(-CHUNK_SIZE / 2 - 0.01), -1);
assert.equal(chunkKey(-2, 7), '-2:7');
assert.equal(hash2D(13, 4, -3), hash2D(13, 4, -3));
assert.notEqual(hash2D(13, 4, -3), hash2D(13, 5, -3));

const chunkA = generateChunk(130013, 2, -4);
const chunkB = generateChunk(130013, 2, -4);
assert.deepEqual(chunkA, chunkB, 'chunk generation must be deterministic');
assert.equal(chunkA.cx, 2);
assert.equal(chunkA.cz, -4);
assert.ok(chunkA.obstacles.length >= 4);
for (const pickup of chunkA.pickups) {
  if (pickup.type === 'treasure') {
    assert.ok(TREASURE_TYPES[pickup.treasureType]);
    assert.equal(pickup.value, TREASURE_TYPES[pickup.treasureType].value);
  }
}

const base = generateChunk(130013, 0, 0);
assert.equal(base.isBase, true);
assert.equal(base.pickups.length, 0);
assert.equal(base.obstacles.filter((item) => item.visual === 'wall').length, 0);

const circleObstacle = { kind: 'circle', x: 0, z: 0, radius: 2 };
const circleResolution = resolveCircleObstacle({ x: 1, z: 0 }, 1, circleObstacle);
assert.equal(circleResolution.hit, true);
assert.ok(Math.abs(circleResolution.x - 3) < 1e-8);

const wallObstacle = { kind: 'aabb', x: 0, z: 0, halfW: 2, halfD: 1 };
const wallResolution = resolveCircleObstacle({ x: 2.2, z: 0 }, 0.8, wallObstacle);
assert.equal(wallResolution.hit, true);
assert.ok(wallResolution.x >= 2.79);
assert.equal(resolveCircleObstacle({ x: 5, z: 5 }, 0.8, wallObstacle).hit, false);
assert.equal(circleVsCircle(0, 0, 1, 1.5, 0, 1), true);
assert.equal(circleVsCircle(0, 0, 1, 3, 0, 1), false);

assert.ok(movementNoise(1, 0) > movementNoise(1, 2));
assert.equal(movementNoise(0.2, 0), 0);
assert.equal(cargoValue([{ value: 30 }, { value: 70 }, { nope: 1 }]), 100);
assert.equal(distanceToBase({ x: 3, z: 4 }), 5);
assert.equal(canExtract({ x: 1, z: 1 }, [{ value: 30 }], 1), true);
assert.equal(canExtract({ x: 1, z: 1 }, [], 1), false);
assert.equal(canExtract({ x: 5, z: 0 }, [{ value: 30 }], 1), false);
assert.equal(canExtract({ x: 1, z: 1 }, [{ value: 30 }], 2), false);

const listener = listenerStep({ x: 0, z: 0, heading: 0 }, { x: 10, z: 0 }, 1, 1);
assert.ok(listener.x > 0);
assert.ok(Math.abs(listener.z) < 1e-8);
assert.ok(listener.heading > 1.5 && listener.heading < 1.7);

assert.equal(upgradeCost('quiet', 0), 90);
assert.equal(upgradeCost('quiet', 2), null);
assert.equal(upgradeCost('missing', 0), null);

const profile = sanitizeProfile({
  credits: -40,
  bestValue: 120,
  upgrades: { quiet: 99, hull: 1.8, cargo: -3 },
  wreck: { seed: 42, x: 10, z: -5, item: { value: 70 } },
});
assert.equal(profile.credits, 0);
assert.equal(profile.bestValue, 120);
assert.deepEqual(profile.upgrades, { quiet: 2, hull: 1, cargo: 0 });
assert.equal(profile.wreck.seed, 42);

const saved = sanitizeSavedRun({
  seed: 77,
  player: { x: 12, z: -8, heading: 0.4 },
  oxygen: 84,
  hull: 3,
  sonar: 45,
  cargo: [{ treasureType: 'archive', value: 70 }],
  collected: ['1:2:treasure:0'],
  elapsed: 50,
  distanceTravelled: 120,
  maxRange: 44,
  attention: 0.7,
  listener: { active: true, x: 20, z: 21, heading: 1 },
});
assert.equal(saved.seed, 77);
assert.equal(saved.cargo.length, 1);
assert.equal(saved.collected.length, 1);
assert.equal(saved.listener.active, true);
assert.equal(sanitizeSavedRun({}), null);

console.log('ГЛУБИНА 13 2.0.0 core audit: PASS');
