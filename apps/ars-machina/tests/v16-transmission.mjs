import assert from 'node:assert/strict';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const moment = (rotor) => Math.max(40, rotor.radius * rotor.radius * .8);

function couple(a, b, sign, strength, step) {
  const invA = 1 / moment(a), invB = 1 / moment(b);
  const jacA = -sign * a.radius, jacB = b.radius;
  const error = b.omega * b.radius - sign * a.omega * a.radius;
  const impulse = -error / (jacA * jacA * invA + jacB * jacB * invB) * clamp(strength * step, 0, 1);
  a.omega += invA * jacA * impulse;
  b.omega += invB * jacB * impulse;
}

function rackContact(rack, gear, side = 1, step = .5) {
  const invA = 1, invB = 1;
  const invRack = (invA + invB) * .25;
  const invGear = 1 / moment(gear);
  const error = rack.velocity + side * gear.omega * gear.radius;
  const impulse = -error / (invRack + gear.radius * gear.radius * invGear) * clamp(.58 * step, 0, .9);
  rack.velocity += impulse * invRack;
  gear.omega += side * gear.radius * impulse * invGear;
}

const drive = { radius: 28, omega: 1 };
const middle = { radius: 52, omega: 0 };
const output = { radius: 40, omega: 0 };
const rack = { velocity: 0 };

for (let frame = 0; frame < 180; frame += 1) {
  couple(drive, middle, 1, .92, .5);
  couple(middle, output, 1, .64, .5);
  rackContact(rack, output, 1, .5);
  for (const rotor of [drive, middle, output]) assert.ok(Number.isFinite(rotor.omega));
  assert.ok(Number.isFinite(rack.velocity));
}

assert.ok(rack.velocity < -.1, 'the output gear must move the rack');
assert.ok(Math.abs(rack.velocity + output.omega * output.radius) < .001, 'rack and gear surface speed must converge');
assert.ok(Math.abs(middle.omega * middle.radius - drive.omega * drive.radius) < .001, 'chain stage must preserve tangential speed');
assert.ok(Math.abs(output.omega * output.radius - middle.omega * middle.radius) < .001, 'belt stage must preserve tangential speed');

console.log('ARS MACHINA 1.6 transmission test passed');
