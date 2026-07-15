import assert from 'node:assert/strict';
import {
  angularDistance,
  energyDeltaForDive,
  generateRings,
  isAligned,
  normalizeAngle,
  scoreForDive,
  TARGET_ANGLE,
} from './game-core.js';

assert.equal(normalizeAngle(Math.PI * 3), Math.PI);
assert.ok(angularDistance(-Math.PI + 0.1, Math.PI - 0.1) < 0.21);
assert.equal(isAligned(TARGET_ANGLE, 0.5), true);
assert.equal(isAligned(TARGET_ANGLE + 1, 0.5), false);
assert.deepEqual(generateRings(4, 42), generateRings(4, 42));
assert.ok(generateRings(20, 42).length <= 7);
assert.ok(scoreForDive(3, 4, 1) > scoreForDive(3, 0, 0));
assert.ok(energyDeltaForDive(1) > energyDeltaForDive(0));
console.log('PROSVET CORE PASS');
