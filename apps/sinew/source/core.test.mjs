import assert from 'node:assert/strict';
import { angleDelta, clamp, pointSegmentDistanceSquared, weaponDamage, wrapAngle } from './core.js';

assert.equal(clamp(4, 0, 3), 3);
assert.ok(Math.abs(wrapAngle(Math.PI * 3) - Math.PI) < 1e-9 || Math.abs(wrapAngle(Math.PI * 3) + Math.PI) < 1e-9);
assert.ok(Math.abs(angleDelta(3.1, -3.1)) < 0.2);

const distance = pointSegmentDistanceSquared(
  { x: 0.5, y: 1, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 }
);
assert.ok(Math.abs(distance.distanceSquared - 1) < 1e-9);
assert.ok(Math.abs(distance.t - 0.5) < 1e-9);
assert.equal(weaponDamage(1.5, 1), 0);
assert.ok(weaponDamage(7, 1) > weaponDamage(4, 1));
assert.ok(weaponDamage(7, 1) > weaponDamage(7, 0));

console.log('SINEW core tests passed');
