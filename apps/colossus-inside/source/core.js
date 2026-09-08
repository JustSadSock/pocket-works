export const CARRIERS = Object.freeze({
  back: Object.freeze({ minX: -8.2, maxX: 8.2, minZ: -13.6, maxZ: 13.6, floorY: 0.72 }),
  shoulder: Object.freeze({ minX: -6.2, maxX: 6.2, minZ: -8.5, maxZ: 8.5, floorY: 0.72 }),
  interior: Object.freeze({ minX: -5.9, maxX: 5.9, minZ: -12.4, maxZ: 13.2, floorY: 0.68 }),
  head: Object.freeze({ minX: -6.8, maxX: 6.8, minZ: -9.2, maxZ: 9.6, floorY: 0.72 })
});

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function damp(current, target, lambda, dt) {
  const t = 1 - Math.exp(-Math.max(0, lambda) * Math.max(0, dt));
  return current + (target - current) * t;
}

export function dampAngle(current, target, lambda, dt) {
  let delta = (target - current + Math.PI) % (Math.PI * 2) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-Math.max(0, lambda) * Math.max(0, dt)));
}

export function normalizedOrZero(x, y) {
  const length = Math.hypot(x, y);
  if (length < 1e-6) return { x: 0, y: 0, length: 0 };
  return { x: x / length, y: y / length, length };
}

export function clampToCarrier(carrier, position) {
  const bounds = CARRIERS[carrier];
  if (!bounds) throw new Error(`Unknown carrier: ${carrier}`);
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: bounds.floorY,
    z: clamp(position.z, bounds.minZ, bounds.maxZ)
  };
}

export function edgeDanger(carrier, x, z, margin = 1.0) {
  const b = CARRIERS[carrier];
  if (!b) return 0;
  const nearest = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
  return clamp(1 - nearest / Math.max(0.001, margin), 0, 1);
}

export function surfaceImpulse(previousVelocity, currentVelocity, dt, bracing = false) {
  const safeDt = Math.max(dt, 1 / 120);
  const ax = (currentVelocity.x - previousVelocity.x) / safeDt;
  const az = (currentVelocity.z - previousVelocity.z) / safeDt;
  const scale = bracing ? 0.0018 : 0.0042;
  return {
    x: clamp(-ax * scale, -2.0, 2.0),
    z: clamp(-az * scale, -2.0, 2.0),
    magnitude: Math.hypot(ax, az)
  };
}

export function scenarioFlags(state) {
  const lightningReady = state.carrier === 'back' && !state.lightning && state.localZ > -2.2;
  const shoulderReady = state.carrier === 'back' && state.lightning && state.localZ > 11.9;
  const hatchReady = state.carrier === 'shoulder' && state.localZ > 5.7;
  const repairReady = state.carrier === 'interior' && !state.repaired && state.localZ > 9.2;
  const ascentReady = state.carrier === 'interior' && state.repaired && state.localZ > 11.8;
  const finaleReady = state.carrier === 'head' && state.localZ > 6.2;
  return { lightningReady, shoulderReady, hatchReady, repairReady, ascentReady, finaleReady };
}
