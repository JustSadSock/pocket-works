import assert from 'node:assert/strict';
import { ROUTES, carrierImpulse, climbAnchor, hasSupport, jumpStep, nearestSupportedZ, routePoint } from './traversal.js';

for (const [name, route] of Object.entries(ROUTES)) {
  const center = routePoint(name, 0, (route.minZ + route.maxZ) / 2);
  assert(Number.isFinite(center.y), `${name} center height should be finite`);
  assert(center.width > 1, `${name} should have usable width`);
  for (const [a, b] of route.pads) {
    assert(a < b, `${name} pad interval should be ordered`);
    assert(hasSupport(name, 0, (a + b) / 2), `${name} pad midpoint should be supported`);
  }
}

assert.equal(hasSupport('back', 0, -9.05, 0), false, 'dorsal visual gap should be a real physical gap');
assert.equal(hasSupport('back', 0, -9.4, 0), true, 'dorsal plate should support the traveler');
assert(Math.abs(nearestSupportedZ('back', -9.05) + 9.25) < 0.01, 'gap recovery should choose nearest plate edge');

let state = { y: 1.2, vy: 4.8 };
let landed = false;
for (let i = 0; i < 180; i += 1) {
  const step = jumpStep({ ...state, groundY: 1, dt: 1 / 60, supported: true });
  state = { y: step.y, vy: step.vy };
  if (step.landed) { landed = true; break; }
}
assert(landed, 'jump should return to a supported surface');
assert.equal(state.y, 1);

const loose = carrierImpulse({ x: 0, z: 0 }, { x: 1.4, z: -0.8 }, 1 / 30, false);
const braced = carrierImpulse({ x: 0, z: 0 }, { x: 1.4, z: -0.8 }, 1 / 30, true);
assert(Math.abs(loose.x) > Math.abs(braced.x), 'brace should reduce carrier inertia');
assert(Math.abs(loose.z) > Math.abs(braced.z), 'brace should reduce carrier inertia on both axes');

assert.equal(climbAnchor({ carrier: 'back', lightning: true, repaired: false, x: 0, z: 9.4 })?.type, 'shoulder');
assert.equal(climbAnchor({ carrier: 'shoulder', lightning: true, repaired: false, x: 0, z: 5.7 })?.type, 'hatch');
assert.equal(climbAnchor({ carrier: 'interior', lightning: true, repaired: true, x: 0, z: 11.2 })?.type, 'head');
assert.equal(climbAnchor({ carrier: 'back', lightning: false, repaired: false, x: 0, z: 9.4 }), null);

console.log('COLOSSUS traversal tests passed');
