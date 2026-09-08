import assert from 'node:assert/strict';
import { ConstraintArm, vec3 } from './constraint-model.js';

const dt = 1 / 120;
function validLengths(p, label) {
  assert(Math.abs(p.upperLength - .34) < .009, `${label}: upper arm stretched`);
  assert(Math.abs(p.lowerLength - .33) < .009, `${label}: forearm stretched`);
  assert(Math.abs(p.toolLength - 1.04) < .009, `${label}: tool stretched`);
  for (const point of [p.elbow, p.hand, p.tip]) for (const n of Object.values(point)) assert(Number.isFinite(n), `${label}: non-finite point`);
}
function runImpulse(dx, dy, label) {
  const arm = new ConstraintArm();
  const start = vec3();
  arm.reset(start);
  let maxSpeed = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let prev = arm.pose().tip;
  for (let i = 0; i < 220; i++) {
    const burst = i < 20 ? vec3(dx, dy, Math.hypot(dx, dy) * .08) : vec3();
    const pose = arm.step({ shoulder: start, guardHand: vec3(.24, -.13, .55), guardTip: vec3(.32, -.03, 1.57), drive: burst, brace: .8, dt });
    const speed = Math.hypot(pose.tip.x - prev.x, pose.tip.y - prev.y, pose.tip.z - prev.z) / dt;
    maxSpeed = Math.max(maxSpeed, speed);
    prev = pose.tip;
    minX = Math.min(minX, pose.tip.x); maxX = Math.max(maxX, pose.tip.x);
    minY = Math.min(minY, pose.tip.y); maxY = Math.max(maxY, pose.tip.y);
    minZ = Math.min(minZ, pose.tip.z); maxZ = Math.max(maxZ, pose.tip.z);
    validLengths(pose, label);
  }
  return { label, maxSpeed, x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
}

const reports = [
  runImpulse(1.8, 0, 'horizontal'),
  runImpulse(-1.8, 0, 'backhand'),
  runImpulse(0, -1.8, 'overhead'),
  runImpulse(0, 1.8, 'rising'),
  runImpulse(1.4, -1.4, 'diagonal')
];
for (const r of reports) {
  assert(r.x + r.y + r.z > .08, `${r.label}: input produced no meaningful motion`);
  assert(r.maxSpeed > 1, `${r.label}: solver stopped responding`);
  assert(r.maxSpeed < 32, `${r.label}: solver exploded`);
}

const arm = new ConstraintArm();
arm.reset(vec3());
for (let i = 0; i < 14400; i++) {
  const phase = (i % 720) / 720 * Math.PI * 2;
  const active = (i % 180) < 26;
  const drive = active ? vec3(Math.sin(phase) * 1.8, Math.cos(phase * 1.7) * 1.6, .12) : vec3();
  let p = arm.step({ shoulder: vec3(), guardHand: vec3(.24, -.13, .55), guardTip: vec3(.32, -.03, 1.57), drive, brace: .76, dt });
  if (i % 97 === 0) p = arm.contact(vec3(-.35, .18, -1), .08, .78);
  validLengths(p, 'long sparring/contact');
}

const contactArm = new ConstraintArm();
contactArm.reset(vec3());
for (let i = 0; i < 80; i++) contactArm.step({ shoulder: vec3(), guardHand: vec3(.2, -.2, .42), guardTip: vec3(.25, .4, 1.25), drive: vec3(0, 0, 1.5), brace: .65, dt });
const before = contactArm.pose();
const after = contactArm.contact(vec3(0, 0, -1), .12, .85);
assert(after.tip.z < before.tip.z - .025, 'contact should stop/retract the blade');
assert(Math.hypot(after.hand.x - before.hand.x, after.hand.y - before.hand.y, after.hand.z - before.hand.z) > .003, 'contact pressure should travel back into the wrist/arm');
validLengths(after, 'contact projection');

// Workspace is a gameplay contract: the physical arm must be able to settle into both
// a knee-line attack and a high guard without changing bone or weapon length.
function settleGuard(hand, tip, label) {
  const guardArm = new ConstraintArm({ restHand: hand, restTool: vec3(.10, .58, .80) });
  guardArm.reset(vec3());
  let pose;
  for (let i = 0; i < 300; i++) pose = guardArm.step({ shoulder: vec3(), guardHand: hand, guardTip: tip, drive: vec3(), brace: .92, dt, iterations: 10 });
  validLengths(pose, label);
  return pose;
}
const lowGuard = settleGuard(vec3(.12, -.55, .34), vec3(.18, -.70, 1.02), 'low guard');
const highGuard = settleGuard(vec3(.15, .28, .35), vec3(.24, 1.08, .92), 'high guard');
assert(highGuard.tip.y - lowGuard.tip.y > .95, 'combat workspace should cover legs through overhead guard');
assert(lowGuard.tip.y < -.35, 'low guard should reach the leg line');
assert(highGuard.tip.y > .65, 'high guard should reach above the head line');

console.log('SINEW constraint diagnostics:', reports.map((r) => `${r.label} ${r.maxSpeed.toFixed(1)}m/s span=${r.x.toFixed(2)}/${r.y.toFixed(2)}/${r.z.toFixed(2)}`).join(' | '));
console.log(`SINEW guard workspace: low=${lowGuard.tip.y.toFixed(2)} high=${highGuard.tip.y.toFixed(2)}`);
console.log('SINEW constraint/contact/workspace invariants passed');
