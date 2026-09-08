import assert from 'node:assert/strict';
import { clamp, clampArena, normalizedOrZero } from './core.js';

assert.equal(clamp(12, 0, 10), 10);
assert.deepEqual(clampArena(3, 4, 6.7), { x: 3, z: 4 });
const edge = clampArena(10, 0, 6.7);
assert.ok(Math.abs(edge.x - 6.7) < 1e-9);
const direction = normalizedOrZero(3, 4);
assert.ok(Math.abs(direction.x - 0.6) < 1e-9);
assert.ok(Math.abs(direction.y - 0.8) < 1e-9);
assert.equal(normalizedOrZero(0, 0).length, 0);
console.log('CARAPACE FORGE core tests passed');
