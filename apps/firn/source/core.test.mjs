import assert from 'node:assert/strict';
import { clamp, fbm2, ridgeNoise, smoothstep, signedAngleDelta } from './core.js';
import { mountainHeight, terrainNormal } from './terrain.js';
import { snowSample } from './snow.js';

assert.equal(clamp(3, 0, 2), 2);
assert.equal(smoothstep(0, 1, 0), 0);
assert.equal(smoothstep(0, 1, 1), 1);
assert.equal(fbm2(12.3, -9.1, 4), fbm2(12.3, -9.1, 4));
assert.ok(ridgeNoise(0.2, 0.7, 8) >= 0);
assert.ok(Math.abs(signedAngleDelta(0, Math.PI * 1.5) + Math.PI * 0.5) < 1e-6);
const h = mountainHeight(25, -42);
assert.ok(Number.isFinite(h));
const n = terrainNormal(25, -42);
assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-4);
const snow = snowSample(25, -42);
assert.ok(snow.depth >= 0 && snow.depth <= 1);
assert.ok(snow.traction >= 0.05 && snow.traction <= 1);
console.log('FIRN core tests passed');

const { appendBabylonGroundCell, interpolateGroundCell } = await import('./mesh.js');
const idx = [];
appendBabylonGroundCell(idx, 0, 1, 2, 3);
assert.deepEqual(idx, [1, 3, 2, 0, 1, 2]);
assert.equal(interpolateGroundCell(0, 10, 20, 30, 0.25, 0.25), 7.5);
assert.equal(interpolateGroundCell(0, 10, 20, 30, 0.75, 0.75), 22.5);
