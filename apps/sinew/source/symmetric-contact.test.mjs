import assert from 'node:assert/strict';
import { ConstraintArm, vec3 } from './constraint-model.js';

const dt = 1 / 120;
const left = new ConstraintArm({ upper: .34, lower: .33, tool: 1.04, handed: 1 });
const right = new ConstraintArm({ upper: .34, lower: .33, tool: 1.04, handed: -1 });
left.reset(vec3());
right.reset(vec3());

function finiteAndRigid(pose, label) {
  assert(Math.abs(pose.upperLength - .34) < .01, `${label}: upper-arm length drift`);
  assert(Math.abs(pose.lowerLength - .33) < .01, `${label}: forearm length drift`);
  assert(Math.abs(pose.toolLength - 1.04) < .01, `${label}: sword length drift`);
  for (const point of [pose.elbow, pose.hand, pose.tip]) {
    for (const value of Object.values(point)) assert(Number.isFinite(value), `${label}: non-finite solver state`);
  }
}

let leftYield = 0;
let rightYield = 0;
let contacts = 0;
for (let i = 0; i < 4800; i += 1) {
  const phase = i * .021;
  const pulse = (i % 160) < 28 ? 1 : 0;
  let poseL = left.step({
    shoulder: vec3(),
    guardHand: vec3(.18, -.18 + Math.sin(phase) * .08, .44),
    guardTip: vec3(.27, .39 + Math.sin(phase * .73) * .18, 1.28),
    drive: pulse ? vec3(1.35, Math.sin(phase) * .55, .72) : vec3(),
    brace: .74,
    dt,
    iterations: 10
  });
  let poseR = right.step({
    shoulder: vec3(),
    guardHand: vec3(-.18, -.18 + Math.sin(phase + .6) * .08, .44),
    guardTip: vec3(-.27, .39 + Math.sin(phase * .73 + .5) * .18, 1.28),
    drive: pulse ? vec3(-1.35, Math.sin(phase + .4) * .55, .72) : vec3(),
    brace: .74,
    dt,
    iterations: 10
  });

  if (i % 37 === 0) {
    const beforeL = poseL.hand;
    const beforeR = poseR.hand;
    poseL = left.contact(vec3(-.42, .10, -.90), .055, .76);
    poseR = right.contact(vec3(.42, .10, -.90), .055, .76);
    leftYield += Math.hypot(poseL.hand.x - beforeL.x, poseL.hand.y - beforeL.y, poseL.hand.z - beforeL.z);
    rightYield += Math.hypot(poseR.hand.x - beforeR.x, poseR.hand.y - beforeR.y, poseR.hand.z - beforeR.z);
    contacts += 1;
  }

  finiteAndRigid(poseL, 'fighter A');
  finiteAndRigid(poseR, 'fighter B');
}

assert(contacts > 100, 'stress test should contain repeated contacts');
assert(leftYield > .15 && rightYield > .15, 'both fighters must yield through wrist/elbow chains under pressure');
const ratio = leftYield / rightYield;
assert(ratio > .65 && ratio < 1.55, `contact response should be symmetric, got ratio ${ratio.toFixed(2)}`);

console.log(`SINEW symmetric contact stress passed: ${contacts} contacts, yield=${leftYield.toFixed(3)}/${rightYield.toFixed(3)}`);
