import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const TAU = Math.PI * 2;

function rotorMoment(rotor) {
  const factor = rotor.type === 'flywheel' ? rotor.inertia ?? 4 : rotor.type === 'wheel' ? 1.4 : .8;
  return Math.max(40, rotor.radius * rotor.radius * factor);
}

function shaftOmega(rotors) {
  const total = rotors.reduce((sum, rotor) => sum + rotorMoment(rotor), 0);
  return rotors.reduce((sum, rotor) => sum + rotor.omega * rotorMoment(rotor), 0) / total;
}

function springAngularMomentumGain(rotors, torque, step = 1) {
  const totalMoment = rotors.reduce((sum, rotor) => sum + rotorMoment(rotor), 0);
  const deltaOmega = clamp(torque * 24 / totalMoment * step, -.12, .12);
  return deltaOmega * totalMoment;
}

function sequencer(angle, steps, pattern) {
  const phase = ((angle / TAU) % 1 + 1) % 1;
  const index = Math.floor(phase * steps) % steps;
  if (pattern === 'pulseA') return { index, a: index === 0, b: false };
  if (pattern === 'both') return { index, a: true, b: true };
  if (pattern === 'gallop') {
    const beat = index % 4;
    return { index, a: beat === 0 || beat === 3, b: beat === 2 || beat === 3 };
  }
  return { index, a: index % 2 === 0, b: index % 2 === 1 };
}

function wingForce(a, b, velocity, { liftSide = -1, camber = .18, lift = 1 } = {}) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const span = Math.hypot(dx, dy) || 1;
  const geometric = { x: -dy / span, y: dx / span };
  const upward = geometric.y <= 0 ? geometric : { x: -geometric.x, y: -geometric.y };
  const side = liftSide === 1 ? -1 : 1;
  const normal = { x: upward.x * side, y: upward.y * side };
  const speed = Math.hypot(velocity.x, velocity.y);
  const normalFlow = Math.abs(velocity.x * geometric.x + velocity.y * geometric.y) / speed;
  const incidence = clamp(normalFlow + camber, .08, 1.35);
  const magnitude = speed * speed * span * .00012 * lift * incidence;
  return { x: normal.x * magnitude, y: normal.y * magnitude };
}

function buoyancy(volume, mass, submerged = 1) {
  return clamp((volume * .36 - Math.max(.3, mass) * .016) * submerged, -.08, 1.05);
}

function armorRetention(thickness, projectileMass) {
  return clamp(.74 - thickness * .14 - projectileMass * .012, .28, .68);
}

function risingEdgeSequence(values) {
  let previous = false;
  let shots = 0;
  for (const value of values) {
    if (value && !previous) shots += 1;
    previous = value;
  }
  return shots;
}

{
  const light = { type: 'gear', radius: 30, omega: 1 };
  const heavy = { type: 'flywheel', radius: 60, inertia: 5, omega: 0 };
  const target = shaftOmega([light, heavy]);
  assert.ok(target > 0 && target < .1, 'a heavy flywheel must dominate a light gear on the same shaft');
  const before = rotorMoment(light) * light.omega + rotorMoment(heavy) * heavy.omega;
  const after = (rotorMoment(light) + rotorMoment(heavy)) * target;
  assert.ok(Math.abs(before - after) < 1e-9, 'shaft synchronization must conserve angular momentum');
}

{
  const single = [{ type: 'gear', radius: 38, omega: 0 }];
  const decorated = [
    { type: 'gear', radius: 38, omega: 0 },
    { type: 'cam', radius: 24, omega: 0 },
    { type: 'drum', radius: 31, omega: 0 }
  ];
  assert.ok(Math.abs(springAngularMomentumGain(single, 2) - springAngularMomentumGain(decorated, 2)) < 1e-9,
    'adding components to a shaft must not multiply mainspring torque');
}

{
  assert.deepEqual(sequencer(0, 8, 'alternate'), { index: 0, a: true, b: false });
  assert.deepEqual(sequencer(TAU * .13, 8, 'alternate'), { index: 1, a: false, b: true });
  assert.deepEqual(sequencer(TAU * .26, 8, 'gallop'), { index: 2, a: false, b: true });
  assert.deepEqual(sequencer(TAU * .39, 8, 'gallop'), { index: 3, a: true, b: true });
  assert.equal(sequencer(TAU * .2, 4, 'pulseA').a, true, 'pulse A spans exactly the indexed first drum position');
  assert.equal(sequencer(TAU * .3, 4, 'pulseA').a, false);
}

{
  const forward = wingForce({ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 6, y: .4 });
  const reversed = wingForce({ x: 180, y: 0 }, { x: 0, y: 0 }, { x: 6, y: .4 });
  assert.ok(forward.y < 0 && reversed.y < 0, 'default wing lift must remain upward when endpoints are reversed');
  const inverted = wingForce({ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 6, y: .4 }, { liftSide: 1 });
  assert.ok(inverted.y > 0, 'the inspector must be able to deliberately invert the physical lift side');
}

{
  const deflated = buoyancy(.22, 4);
  const inflated = buoyancy(2.4, 4);
  assert.ok(inflated > deflated + .6, 'an inflated air bag must create clearly stronger buoyancy');
}

{
  const thin = armorRetention(.6, 2);
  const heavy = armorRetention(1.6, 2);
  assert.ok(heavy < thin, 'thicker armor must retain less projectile speed after impact');
}

{
  assert.equal(risingEdgeSequence([false, true, true, true, false, true]), 2,
    'a launcher must fire once per control-channel rising edge');
}

const appSource = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
const swSource = fs.readFileSync(path.join(appRoot, 'sw.js'), 'utf8');
const qualitySource = fs.readFileSync(path.join(appRoot, 'engine/part-21a.txt'), 'utf8');
const visionSource = fs.readFileSync(path.join(appRoot, 'engine/part-21b.txt'), 'utf8');
const folioSource = fs.readFileSync(path.join(appRoot, 'engine/part-21c.txt'), 'utf8');
const truthSource = fs.readFileSync(path.join(appRoot, 'engine/part-21d.txt'), 'utf8');

for (const filename of ['part-21a.txt', 'part-21b.txt', 'part-21c.txt', 'part-21d.txt']) {
  assert.match(appSource, new RegExp(filename.replace('.', '\\.')),
    `${filename} must be loaded by app.js`);
  assert.match(swSource, new RegExp(filename.replace('.', '\\.')),
    `${filename} must be available offline`);
}
assert.match(appSource, /vision-v21\.css/);
assert.match(swSource, /vision-v21\.css/);
assert.match(qualitySource, /synchronizePhysicalShaftsV21/);
assert.match(qualitySource, /updateChannelLaunchersV21/);
assert.match(qualitySource, /componentIssuesV21/);
assert.match(visionSource, /drawSelectionGraphV21/);
assert.match(visionSource, /drawRunForcesV21/);
assert.match(visionSource, /ПОДЪЁМ/);
assert.match(folioSource, /buildGiantCrossbowV21/);
assert.match(folioSource, /interaction-bench/);
assert.match(folioSource, /Путь силы/);
assert.match(truthSource, /liftSideV21/);
assert.match(truthSource, /driverB/);
assert.match(truthSource, /drawTruthfulTransmissionReadoutsV21/);

console.log('ARS MACHINA 2.1 interaction tests passed');
