const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

export const JOINT_LIMITS = {
  shoulderYaw: [-1.22, 1.22],
  shoulderPitch: [-0.92, 1.28],
  elbowFlex: [0.18, 2.18],
  elbowPlane: [-0.92, 0.92],
  wristYaw: [-0.72, 0.72],
  wristPitch: [-0.82, 0.82],
  wristRoll: [-1.28, 1.28]
};

const JOINTS = {
  shoulderYaw: { inertia: 1.8, stiffness: 92, damping: 24, maxTorque: 68 },
  shoulderPitch: { inertia: 1.65, stiffness: 98, damping: 25, maxTorque: 72 },
  elbowFlex: { inertia: 1.15, stiffness: 118, damping: 27, maxTorque: 82 },
  elbowPlane: { inertia: 1.1, stiffness: 84, damping: 23, maxTorque: 58 },
  wristYaw: { inertia: 0.52, stiffness: 132, damping: 22, maxTorque: 48 },
  wristPitch: { inertia: 0.48, stiffness: 138, damping: 22, maxTorque: 50 },
  wristRoll: { inertia: 0.42, stiffness: 126, damping: 20, maxTorque: 44 }
};

export const GUARD_JOINTS = {
  shoulderYaw: 0.26,
  shoulderPitch: -0.06,
  elbowFlex: 1.08,
  elbowPlane: 0.20,
  wristYaw: 0.08,
  wristPitch: 0.18,
  wristRoll: 0.10
};

function createJoint(name, value) {
  return { name, angle: value, velocity: 0, target: value };
}

function softLimitTorque(angle, velocity, min, max) {
  const margin = 0.18;
  let torque = 0;
  if (angle < min + margin) {
    const x = clamp((min + margin - angle) / margin, 0, 1.5);
    torque += x * x * 95 - Math.min(0, velocity) * 8;
  }
  if (angle > max - margin) {
    const x = clamp((angle - (max - margin)) / margin, 0, 1.5);
    torque -= x * x * 95 + Math.max(0, velocity) * 8;
  }
  return torque;
}

export function stepMuscleJoint(joint, target, dt, activation = 1) {
  const cfg = JOINTS[joint.name];
  const limits = JOINT_LIMITS[joint.name];
  const safeDt = clamp(dt, 1 / 240, 1 / 30);
  joint.target = clamp(target, limits[0], limits[1]);
  const error = joint.target - joint.angle;
  const nonlinearStiffness = cfg.stiffness * (0.72 + Math.min(1, Math.abs(error) / 0.65) * 0.48);
  let torque = error * nonlinearStiffness * activation - joint.velocity * cfg.damping;
  torque += softLimitTorque(joint.angle, joint.velocity, limits[0], limits[1]);
  torque = clamp(torque, -cfg.maxTorque, cfg.maxTorque);
  joint.velocity += (torque / cfg.inertia) * safeDt;
  joint.angle += joint.velocity * safeDt;
  if (joint.angle < limits[0]) { joint.angle = limits[0]; joint.velocity = Math.max(0, joint.velocity) * 0.18; }
  if (joint.angle > limits[1]) { joint.angle = limits[1]; joint.velocity = Math.min(0, joint.velocity) * 0.18; }
  return joint.angle;
}

function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp };
}

function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(v, s) { return { x: v.x * s, y: v.y * s, z: v.z * s }; }
function normalize(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function forwardKinematics(angles) {
  const upper = dirFromAngles(angles.shoulderYaw, angles.shoulderPitch);
  const elbowYaw = angles.shoulderYaw - Math.sin(angles.elbowPlane) * angles.elbowFlex * 0.42;
  const elbowPitch = angles.shoulderPitch - Math.cos(angles.elbowPlane) * angles.elbowFlex * 0.72;
  const fore = dirFromAngles(elbowYaw, elbowPitch);
  const elbow = scale(upper, 0.34);
  const hand = add(elbow, scale(fore, 0.33));
  const blade = normalize(dirFromAngles(
    elbowYaw + angles.wristYaw,
    elbowPitch + angles.wristPitch + angles.elbowFlex * 0.28
  ));
  return { elbow, hand, blade, roll: angles.wristRoll };
}

export function strikeTargets(kind = 'horizontal', side = 1, vertical = 1) {
  const s = side >= 0 ? 1 : -1;
  if (kind === 'overhead') return {
    load: { shoulderYaw: .18*s, shoulderPitch: 1.00, elbowFlex: .72, elbowPlane: .15*s, wristYaw: .05*s, wristPitch: .46, wristRoll: .18*s },
    strike: { shoulderYaw: -.08*s, shoulderPitch: -.46, elbowFlex: .38, elbowPlane: -.08*s, wristYaw: -.12*s, wristPitch: -.30, wristRoll: .06*s },
    follow: { shoulderYaw: -.24*s, shoulderPitch: -.70, elbowFlex: .76, elbowPlane: -.18*s, wristYaw: -.26*s, wristPitch: -.42, wristRoll: -.16*s }
  };
  if (kind === 'rising') return {
    load: { shoulderYaw: .72*s, shoulderPitch: -.62, elbowFlex: 1.28, elbowPlane: .42*s, wristYaw: .28*s, wristPitch: -.34, wristRoll: -.48*s },
    strike: { shoulderYaw: -.18*s, shoulderPitch: .48, elbowFlex: .48, elbowPlane: -.18*s, wristYaw: -.12*s, wristPitch: .34, wristRoll: .42*s },
    follow: { shoulderYaw: -.48*s, shoulderPitch: .74, elbowFlex: .74, elbowPlane: -.34*s, wristYaw: -.26*s, wristPitch: .44, wristRoll: .62*s }
  };
  if (kind === 'diagonal') {
    const v = vertical >= 0 ? 1 : -1;
    return {
      load: { shoulderYaw: .76*s, shoulderPitch: -.50*v, elbowFlex: 1.02, elbowPlane: .36*s, wristYaw: .30*s, wristPitch: -.24*v, wristRoll: -.42*s*v },
      strike: { shoulderYaw: -.22*s, shoulderPitch: .34*v, elbowFlex: .42, elbowPlane: -.14*s, wristYaw: -.16*s, wristPitch: .26*v, wristRoll: .44*s*v },
      follow: { shoulderYaw: -.56*s, shoulderPitch: .55*v, elbowFlex: .72, elbowPlane: -.34*s, wristYaw: -.30*s, wristPitch: .36*v, wristRoll: .66*s*v }
    };
  }
  return {
    load: { shoulderYaw: .88*s, shoulderPitch: .12, elbowFlex: .92, elbowPlane: .44*s, wristYaw: .36*s, wristPitch: .05, wristRoll: -.30*s },
    strike: { shoulderYaw: -.32*s, shoulderPitch: -.03, elbowFlex: .34, elbowPlane: -.20*s, wristYaw: -.22*s, wristPitch: .04, wristRoll: .32*s },
    follow: { shoulderYaw: -.74*s, shoulderPitch: -.16, elbowFlex: .68, elbowPlane: -.42*s, wristYaw: -.36*s, wristPitch: -.08, wristRoll: .58*s }
  };
}

export class MuscleArm {
  constructor() {
    this.joints = Object.fromEntries(Object.entries(GUARD_JOINTS).map(([name, value]) => [name, createJoint(name, value)]));
  }

  reset() {
    for (const [name, joint] of Object.entries(this.joints)) {
      joint.angle = GUARD_JOINTS[name]; joint.target = GUARD_JOINTS[name]; joint.velocity = 0;
    }
  }

  angles() { return Object.fromEntries(Object.entries(this.joints).map(([name, joint]) => [name, joint.angle])); }

  step(targets, dt, activation = 1) {
    for (const [name, joint] of Object.entries(this.joints)) stepMuscleJoint(joint, targets[name] ?? GUARD_JOINTS[name], dt, activation);
    return forwardKinematics(this.angles());
  }
}

export function blendJointTargets(a, b, t) {
  const x = smoothstep(t);
  const result = {};
  for (const name of Object.keys(GUARD_JOINTS)) result[name] = mix(a[name], b[name], x);
  return result;
}
