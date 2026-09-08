import assert from 'node:assert/strict';
import { CARRIERS, clamp, damp, normalizedOrZero, clampToCarrier, edgeDanger, surfaceImpulse, scenarioFlags } from './core.js';

assert.equal(clamp(4, 0, 3), 3);
assert.equal(clamp(-2, 0, 3), 0);
assert.ok(damp(0, 10, 10, .2) > 8);
assert.deepEqual(normalizedOrZero(0, 0), { x: 0, y: 0, length: 0 });
assert.ok(Math.abs(normalizedOrZero(3, 4).x - .6) < 1e-6);
assert.deepEqual(clampToCarrier('back', { x: 99, y: 99, z: -99 }), { x: CARRIERS.back.maxX, y: CARRIERS.back.floorY, z: CARRIERS.back.minZ });
assert.equal(edgeDanger('back', 0, 0), 0);
assert.ok(edgeDanger('back', CARRIERS.back.maxX - .1, 0) > .85);
const loose = surfaceImpulse({ x: 0, z: 0 }, { x: 2, z: 0 }, 1 / 30, false);
const braced = surfaceImpulse({ x: 0, z: 0 }, { x: 2, z: 0 }, 1 / 30, true);
assert.ok(loose.x < braced.x);
assert.ok(Math.abs(loose.x) > Math.abs(braced.x));
assert.equal(scenarioFlags({ carrier: 'back', lightning: false, repaired: false, localZ: -1 }).lightningReady, true);
assert.equal(scenarioFlags({ carrier: 'interior', lightning: true, repaired: false, localZ: 10 }).repairReady, true);
assert.equal(scenarioFlags({ carrier: 'head', lightning: true, repaired: true, localZ: 7 }).finaleReady, true);
console.log('COLOSSUS // INSIDE core tests passed');
