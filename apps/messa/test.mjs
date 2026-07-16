import assert from 'node:assert/strict';
import {
  OUTER_RADIUS,
  SUN_RADIUS,
  VOICE_COUNT,
  createWorld,
  freshRun,
  sanitizeRun,
  serializeRun,
  stepOrbit,
  targetPosition
} from './game-core.js';

const world = createWorld(123456);
assert.equal(world.targets.length, VOICE_COUNT);
assert.equal(world.obstacles.length, 24);
assert.deepEqual(createWorld(123456), world, 'world generation must be deterministic');

for (const target of world.targets) {
  const point = targetPosition(target, 17);
  const radius = Math.hypot(point.x, point.z);
  assert(radius > SUN_RADIUS + 1);
  assert(radius < OUTER_RADIUS - 1);
}

const orbit = freshRun(42);
for (let index = 0; index < 60 * 20; index += 1) stepOrbit(orbit, null, 1 / 60);
const radiusAfter = Math.hypot(orbit.x, orbit.z);
assert(radiusAfter > 6.2 && radiusAfter < 7.8, `unforced orbit drifted to ${radiusAfter}`);

const free = freshRun(42);
const bent = freshRun(42);
for (let index = 0; index < 120; index += 1) {
  stepOrbit(free, null, 1 / 60);
  stepOrbit(bent, { active: true, x: 10, z: 5, power: 1 }, 1 / 60);
}
assert(Math.hypot(free.x - bent.x, free.z - bent.z) > .3, 'gravity well must materially bend the orbit');

const saved = serializeRun(freshRun(77));
assert(sanitizeRun(saved), 'valid run should round-trip through persistence');
assert.equal(sanitizeRun({ ...saved, x: 0, z: 0 }), null, 'run inside the sun must be rejected');
assert.equal(sanitizeRun({ ...saved, voice: 99 }), null, 'invalid voice index must be rejected');

console.log('МЕССА physics and persistence checks passed.');
