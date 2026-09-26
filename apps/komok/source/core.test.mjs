import assert from 'node:assert/strict';
import { brushFalloff, brushRadius, clamp, decodePositions, encodePositions } from './core.js';

assert.equal(clamp(4, 0, 3), 3);
assert.equal(clamp(-2, 0, 3), 0);
assert.equal(brushFalloff(1, 1), 0);
assert.equal(brushFalloff(0, 1), 1);
assert.ok(brushFalloff(.5, 1) > 0 && brushFalloff(.5, 1) < 1);
assert.ok(brushRadius(18) < brushRadius(80));
assert.ok(brushRadius(46) > .4 && brushRadius(46) < .9);

const sample = new Float32Array([-1.2345, 0, .7777, 2.1]);
const restored = decodePositions(encodePositions(sample));
assert.equal(restored.length, sample.length);
for (let i = 0; i < sample.length; i += 1) {
  assert.ok(Math.abs(restored[i] - sample[i]) < 0.0002);
}
assert.ok(encodePositions(sample).length < 24);

console.log('КОМОК core tests passed');
