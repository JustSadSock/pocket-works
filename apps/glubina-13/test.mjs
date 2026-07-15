import assert from 'node:assert/strict';
import {
  collectibleCollision,
  generateGate,
  gateCollision,
  sanitizeSavedRun,
  silenceMultiplier,
  speedForZone,
  zoneForDistance,
} from './game-core.js';

const gateA = generateGate(1337, 1, -60);
const gateB = generateGate(1337, 1, -60);
assert.deepEqual(gateA, gateB, 'procedural gates must be deterministic');
assert.ok(gateA.openingWidth >= 1.8 && gateA.openingWidth <= 3.7);
assert.ok(gateA.openingHeight >= 1.55 && gateA.openingHeight <= 3.05);
assert.equal(gateCollision(gateA, { x: gateA.x, y: gateA.y }), false, 'centre of opening must be safe');
assert.equal(gateCollision(gateA, { x: 4.4, y: 3.2 }), true, 'outer tunnel corner must collide');
assert.equal(collectibleCollision({ x: 1, y: 1 }, { x: 1.3, y: 1.2 }), true);
assert.equal(collectibleCollision({ x: 1, y: 1 }, { x: 3, y: 3 }), false);
assert.equal(zoneForDistance(0), 1);
assert.equal(zoneForDistance(249.99), 1);
assert.equal(zoneForDistance(250), 2);
assert.ok(speedForZone(8) > speedForZone(1));
assert.equal(silenceMultiplier(0), 1);
assert.ok(silenceMultiplier(10) > 1.5);
assert.equal(silenceMultiplier(100), 2.5);
assert.equal(sanitizeSavedRun(null), null);
assert.equal(sanitizeSavedRun({ distance: 'bad', oxygen: 50, hull: 2, world: [] }), null);
const saved = sanitizeSavedRun({
  seed: 5,
  distance: 120,
  oxygen: 72,
  hull: 2,
  sonar: 48,
  player: { x: 1, y: -1 },
  world: [{ type: 'gate', z: -30 }],
  nextSpawnZ: -80,
  pulses: 4,
  startedAt: 100,
});
assert.equal(saved.distance, 120);
assert.equal(saved.world.length, 1);
console.log('ГЛУБИНА 13 core audit: PASS');
