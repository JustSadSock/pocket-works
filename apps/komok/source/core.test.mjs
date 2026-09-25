import assert from 'node:assert/strict';
import { brushFalloff, brushRadius, clamp } from './core.js';

assert.equal(clamp(4, 0, 3), 3);
assert.equal(clamp(-2, 0, 3), 0);
assert.equal(brushFalloff(1, 1), 0);
assert.equal(brushFalloff(0, 1), 1);
assert.ok(brushFalloff(.5, 1) > 0 && brushFalloff(.5, 1) < 1);
assert.ok(brushRadius(18) < brushRadius(80));
assert.ok(brushRadius(46) > .4 && brushRadius(46) < .9);
console.log('КОМОК core tests passed');
