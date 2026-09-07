export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function saturate(value) {
  return clamp(value, 0, 1);
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function wrapAngle(angle) {
  let value = angle % TAU;
  if (value > Math.PI) value -= TAU;
  if (value < -Math.PI) value += TAU;
  return value;
}

export function angleDelta(from, to) {
  return wrapAngle(to - from);
}

export function dampAngle(current, target, lambda, dt) {
  return wrapAngle(current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt)));
}

export function springScalar(state, target, stiffness, damping, dt) {
  const acceleration = (target - state.value) * stiffness - state.velocity * damping;
  state.velocity += acceleration * dt;
  state.value += state.velocity * dt;
  return state.value;
}

export function expSmoothing(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}

export function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export function length2(x, y) {
  return Math.hypot(x, y);
}

export function normalize2(x, y) {
  const length = Math.hypot(x, y);
  return length > 1e-8 ? { x: x / length, y: y / length, length } : { x: 0, y: 0, length: 0 };
}

export function pointSegmentDistanceSquared(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const apz = point.z - a.z;
  const denom = abx * abx + aby * aby + abz * abz;
  const t = denom > 1e-8 ? clamp((apx * abx + apy * aby + apz * abz) / denom, 0, 1) : 0;
  const dx = a.x + abx * t - point.x;
  const dy = a.y + aby * t - point.y;
  const dz = a.z + abz * t - point.z;
  return { distanceSquared: dx * dx + dy * dy + dz * dz, t };
}

export function weaponDamage(speed, tipFactor, multiplier = 1) {
  if (speed < 2.65) return 0;
  const energy = Math.pow(speed - 2.25, 1.12) * 4.2;
  return clamp(energy * lerp(0.42, 1, saturate(tipFactor)) * multiplier, 0, 34);
}

export function qualityFromFrameTime(frameMs) {
  if (frameMs > 22.5) return 'low';
  if (frameMs > 17.8) return 'medium';
  return 'high';
}
