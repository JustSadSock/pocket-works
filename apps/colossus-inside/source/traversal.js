export const TRAVERSAL_VERSION = 6;

export const ROUTES = {
  back: {
    minZ: -12.4,
    maxZ: 12.2,
    width: (z) => 5.8 - Math.max(0, z - 7) * 0.12,
    height: (x, z) => 1.02 + Math.max(0, 1 - (x * x) / 55) * 0.24 + Math.sin((z + 3) * 0.32) * 0.05,
    pads: [[-12.4, -9.25], [-8.85, -5.75], [-5.35, -2.15], [-1.70, 1.38], [1.82, 4.95], [5.38, 8.58], [8.98, 12.2]]
  },
  shoulder: {
    minZ: -7.7,
    maxZ: 7.4,
    width: (z) => 4.7 - Math.abs(z) * 0.08,
    height: (x, z) => 1.02 + Math.max(0, 1 - (x * x) / 25 - (z * z) / 85) * 0.52,
    pads: [[-7.7, -5.25], [-4.82, -2.05], [-1.62, 1.08], [1.52, 4.18], [4.62, 7.4]]
  },
  interior: {
    minZ: -11.5,
    maxZ: 12.6,
    width: () => 4,
    height: (_x, z) => 0.78 + Math.sin(z * 0.64) * 0.025,
    pads: [[-11.5, -8.45], [-8.02, -5.15], [-4.72, -1.84], [-1.42, 1.48], [1.92, 4.78], [5.20, 8.10], [8.52, 12.6]]
  },
  head: {
    minZ: -8.2,
    maxZ: 8.5,
    width: (z) => 5 - Math.max(0, z - 4) * 0.13,
    height: (x, z) => 1.02 + Math.max(0, 1 - (x * x) / 34 - (z * z) / 105) * 0.28,
    pads: [[-8.2, -5.15], [-4.73, -1.72], [-1.30, 1.70], [2.12, 5.14], [5.56, 8.5]]
  }
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function routePoint(carrier, x, z) {
  const route = ROUTES[carrier];
  if (!route) throw new Error(`Unknown carrier: ${carrier}`);
  const cz = clamp(z, route.minZ, route.maxZ);
  const width = Math.max(1.4, route.width(cz));
  const cx = clamp(x, -width, width);
  return { x: cx, y: route.height(cx, cz), z: cz, width };
}

export function supportInterval(carrier, z, margin = 0) {
  const route = ROUTES[carrier];
  if (!route) return null;
  return route.pads.find(([a, b]) => z >= a - margin && z <= b + margin) || null;
}

export function hasSupport(carrier, x, z, margin = 0.12) {
  const route = ROUTES[carrier];
  if (!route) return false;
  const width = route.width(clamp(z, route.minZ, route.maxZ));
  if (Math.abs(x) > width + margin) return false;
  return Boolean(supportInterval(carrier, z, margin));
}

export function nearestSupportedZ(carrier, z) {
  const route = ROUTES[carrier];
  if (!route) return z;
  let best = route.pads[0][0];
  let distance = Infinity;
  for (const [a, b] of route.pads) {
    if (z >= a && z <= b) return z;
    const candidate = Math.abs(z - a) < Math.abs(z - b) ? a : b;
    const d = Math.abs(z - candidate);
    if (d < distance) { best = candidate; distance = d; }
  }
  return best;
}

// Detects any ordinary traversal gap as a real handhold opportunity. This is
// intentionally independent from story transitions so JUMP-hold behaves the
// same way on every dorsal/shoulder/interior/head plate seam.
export function ledgeProbe(carrier, x, z, direction = 1, reach = 0.58) {
  const route = ROUTES[carrier];
  if (!route || Math.abs(direction) < 0.01) return null;
  const dir = direction >= 0 ? 1 : -1;
  const pads = route.pads;
  for (let i = 0; i < pads.length; i += 1) {
    const [a, b] = pads[i];
    if (z < a - reach || z > b + reach) continue;
    const edge = dir > 0 ? b : a;
    if (Math.abs(z - edge) > reach) continue;
    const next = pads[i + dir];
    if (!next) return null;
    const landingZ = dir > 0 ? next[0] + 0.34 : next[1] - 0.34;
    const gap = dir > 0 ? next[0] - b : a - next[1];
    const width = route.width(clamp(landingZ, route.minZ, route.maxZ));
    return {
      type: 'ledge',
      carrier,
      edgeZ: edge,
      landingZ,
      gap,
      x: clamp(x, -width * 0.88, width * 0.88),
      direction: dir
    };
  }
  return null;
}

export function carrierImpulse(previousVelocity, currentVelocity, dt, grip = 0) {
  const safeDt = Math.max(dt, 1 / 120);
  const ax = clamp((currentVelocity.x - previousVelocity.x) / safeDt, -11, 11);
  const az = clamp((currentVelocity.z - previousVelocity.z) / safeDt, -11, 11);
  const coupling = 0.25 - clamp(grip === true ? 1 : grip, 0, 1) * 0.18;
  return { x: -ax * coupling, z: -az * coupling, magnitude: Math.hypot(ax, az) };
}

export function balanceLean(surfaceVelocity, previousSurfaceVelocity, dt) {
  const safeDt = Math.max(dt, 1 / 120);
  const ax = clamp((surfaceVelocity.x - previousSurfaceVelocity.x) / safeDt, -8, 8);
  const az = clamp((surfaceVelocity.z - previousSurfaceVelocity.z) / safeDt, -8, 8);
  return { pitch: clamp(az * 0.018, -0.14, 0.14), roll: clamp(-ax * 0.022, -0.16, 0.16) };
}

export function jumpStep({ y, vy, groundY, dt, supported }) {
  const nextVy = vy - 10.8 * dt;
  const nextY = y + nextVy * dt;
  if (supported && nextVy <= 0 && nextY <= groundY) return { y: groundY, vy: 0, landed: true, airborne: false };
  return { y: nextY, vy: nextVy, landed: false, airborne: true };
}

export function climbAnchor(run) {
  const { carrier, lightning, repaired, x, z } = run;
  if (carrier === 'back' && lightning && z > 8.65 && Math.abs(x) < 4.2) return { type: 'shoulder', target: { carrier: 'shoulder', x: 0, z: -6.35 } };
  if (carrier === 'shoulder' && z > 5.0 && Math.abs(x) < 3.6) return { type: 'hatch', target: { carrier: 'interior', x: 0, z: -10.55 } };
  if (carrier === 'interior' && repaired && z > 10.55 && Math.abs(x) < 3.25) return { type: 'head', target: { carrier: 'head', x: 0, z: -6.85 } };
  return null;
}
