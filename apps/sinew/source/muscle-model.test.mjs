import assert from 'node:assert/strict';
import { GUARD_JOINTS, JOINT_LIMITS, MuscleArm, blendJointTargets, forwardKinematics, strikeTargets } from './muscle-model.js';

const dt = 1 / 120;
const phases = { load: 0.12, strike: 0.18, follow: 0.16, recover: 0.34 };
const kinds = [
  ['horizontal', 1, 1],
  ['horizontal', -1, 1],
  ['diagonal', 1, 1],
  ['diagonal', -1, -1],
  ['overhead', 1, 1],
  ['rising', -1, 1]
];

function tipOf(pose) {
  return {
    x: pose.hand.x + pose.blade.x * 1.04,
    y: pose.hand.y + pose.blade.y * 1.04,
    z: pose.hand.z + pose.blade.z * 1.04
  };
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

function simulate(kind, side, vertical) {
  const arm = new MuscleArm();
  const strike = strikeTargets(kind, side, vertical);
  const samples = [];
  let previousTip = tipOf(forwardKinematics(GUARD_JOINTS));
  let peakTipSpeed = 0;

  const run = (from, to, duration, activation) => {
    const count = Math.ceil(duration / dt);
    for (let i = 0; i < count; i += 1) {
      const t = Math.min(1, (i + 1) / count);
      const target = blendJointTargets(from, to, t);
      const pose = arm.step(target, dt, activation);
      const tip = tipOf(pose);
      peakTipSpeed = Math.max(peakTipSpeed, distance(tip, previousTip) / dt);
      previousTip = tip;
      const angles = arm.angles();
      for (const [name, angle] of Object.entries(angles)) {
        const [min, max] = JOINT_LIMITS[name];
        assert(Number.isFinite(angle), `${kind}: ${name} became non-finite`);
        assert(angle >= min - 1e-6 && angle <= max + 1e-6, `${kind}: ${name} violated hard limit`);
      }
      assert(Math.hypot(pose.hand.x, pose.hand.y, pose.hand.z) <= 0.671, `${kind}: rigid arm length stretched`);
      samples.push({ ...pose, tip });
    }
  };

  run(GUARD_JOINTS, strike.load, phases.load, 1.08);
  run(strike.load, strike.strike, phases.strike, 1.34);
  run(strike.strike, strike.follow, phases.follow, 0.82);
  run(strike.follow, GUARD_JOINTS, phases.recover, 0.92);
  for (let i = 0; i < 120; i += 1) arm.step(GUARD_JOINTS, dt, 1);

  const tipXs = samples.map((s) => s.tip.x);
  const tipYs = samples.map((s) => s.tip.y);
  const tipZs = samples.map((s) => s.tip.z);
  const final = arm.angles();
  const guardError = Math.sqrt(Object.keys(GUARD_JOINTS).reduce((sum, name) => sum + (final[name] - GUARD_JOINTS[name]) ** 2, 0));
  return {
    kind, side, vertical,
    peakTipSpeed,
    xSpan: Math.max(...tipXs) - Math.min(...tipXs),
    ySpan: Math.max(...tipYs) - Math.min(...tipYs),
    zSpan: Math.max(...tipZs) - Math.min(...tipZs),
    guardError
  };
}

const reports = kinds.map((args) => simulate(...args));
for (const report of reports) {
  assert(report.peakTipSpeed > 2.8, `${report.kind}: strike never develops useful tip speed`);
  assert(report.guardError < 0.08, `${report.kind}: arm does not settle back into guard`);
  assert(report.zSpan > 0.22, `${report.kind}: trajectory has insufficient depth`);
}

const horizontal = reports.filter((r) => r.kind === 'horizontal');
assert(horizontal.every((r) => r.xSpan > 0.65), 'horizontal cuts must traverse laterally');
const overhead = reports.find((r) => r.kind === 'overhead');
const rising = reports.find((r) => r.kind === 'rising');
assert(overhead.ySpan > 0.75, 'overhead cut must traverse vertically');
assert(rising.ySpan > 0.70, 'rising cut must traverse vertically');
assert(reports.some((r) => r.kind === 'diagonal' && r.xSpan > 0.45 && r.ySpan > 0.45), 'diagonal cut must occupy two axes');

// Deterministic synthetic sparring: alternate six attack families for 90 seconds worth of actions.
for (let i = 0; i < 360; i += 1) {
  const report = simulate(...kinds[i % kinds.length]);
  assert(report.peakTipSpeed < 35, 'synthetic sparring produced an explosive/unbounded sword velocity');
}

console.log('SINEW muscle sparring:', reports.map((r) => `${r.kind}:${r.side} peak=${r.peakTipSpeed.toFixed(1)}m/s span=${r.xSpan.toFixed(2)}/${r.ySpan.toFixed(2)}/${r.zSpan.toFixed(2)}`).join(' | '));
