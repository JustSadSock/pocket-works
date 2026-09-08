import assert from 'node:assert/strict';
import { naturalLookDelta, shapeLookDelta, shapeStick } from './input.js';

const rightDrag = naturalLookDelta({ x: 140, y: 90 }, { x: 100, y: 90 });
assert.equal(rightDrag.x, -40, 'right drag must produce negative input because game camera subtracts lookX');
assert.equal(rightDrag.y, 0);

const upDrag = naturalLookDelta({ x: 100, y: 60 }, { x: 100, y: 90 });
assert.equal(upDrag.y, 30, 'up drag must produce positive input because game camera subtracts lookY');

const microLook = shapeLookDelta(0.05, 0.05);
assert.deepEqual(microLook, { x: 0, y: 0 }, 'sub-pixel look jitter must be ignored');
const preciseLook = shapeLookDelta(-2, 0);
assert.ok(preciseLook.x < -1.9 && preciseLook.x > -2.2, 'slow drag should remain close to 1:1 for aiming precision');
const fastLook = shapeLookDelta(-28, 0);
assert.ok(fastLook.x < -40, 'fast drag should accelerate camera turning without a second control');

const dead = shapeStick(2, 2, 60, 0.08);
assert.equal(dead.magnitude, 0, 'stick must ignore tiny thumb jitter');

const full = shapeStick(60, 0, 60, 0.08);
assert.ok(full.x > 0.99 && full.magnitude > 0.99, 'full right deflection must reach full movement');

const forward = shapeStick(0, -60, 60, 0.08);
assert.ok(forward.y > 0.99, 'upward thumb movement must move the player forward');

console.log('BELLFORGE input tests passed');
