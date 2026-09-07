import { clamp, fbm2, ridgeNoise, rotate2, smoothstep } from './core.js';

export const MOUNTAIN_SEED = 260908;
export const WIND_ANGLE = -0.62;

function gaussianPeak(x, z, px, pz, sx, sz, height) {
  const dx = (x - px) / sx;
  const dz = (z - pz) / sz;
  return Math.exp(-(dx * dx + dz * dz)) * height;
}

function carvedPeak(x, z, px, pz, sx, sz, height, seed) {
  const dx = x - px;
  const dz = z - pz;
  const r = Math.hypot(dx / sx, dz / sz);
  const angle = Math.atan2(dz, dx);
  const radial = Math.max(0, 1 - r);
  const facets = 0.7 + Math.abs(Math.sin(angle * 3 + fbm2(x * 0.003, z * 0.003, seed, 2))) * 0.3;
  const summit = Math.pow(radial, 1.45) * facets;
  const gullies = Math.pow(Math.max(0, Math.sin(angle * 5.0 + r * 10.0)), 5) * radial * 0.18;
  return height * Math.max(0, summit - gullies);
}

export function mountainHeight(x, z, seed = MOUNTAIN_SEED) {
  const p = rotate2(x, z, 0.24);
  const broad = fbm2(x * 0.0009, z * 0.0009, seed + 1, 5) * 22;
  const ridgeField = ridgeNoise(x * 0.0017, z * 0.0017, seed + 5, 5);
  const baseMassif = (ridgeField - 0.48) * 42;

  // Deliberately authored macro-landforms around the spawn so the experience
  // opens inside a mountain basin instead of on an arbitrary noise field.
  const northWall = gaussianPeak(x, z, 45, 150, 170, 95, 95);
  const westPeak = carvedPeak(x, z, -135, 65, 160, 135, 116, seed + 31);
  const eastPeak = carvedPeak(x, z, 185, 25, 175, 145, 132, seed + 37);
  const distantCrown = carvedPeak(x, z, 20, 330, 270, 210, 168, seed + 41);
  const spawnBasin = -gaussianPeak(x, z, 8, -12, 95, 82, 22);

  const warpX = fbm2(x * 0.0033 + 4.1, z * 0.0033 - 8.3, seed + 9, 4) * 30;
  const warpZ = fbm2(x * 0.0029 - 7.4, z * 0.0029 + 5.2, seed + 11, 4) * 34;
  const qx = p.x + warpX;
  const qz = p.y + warpZ;

  const ridgeA = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(qx * 0.011 + qz * 0.004))), 3.4);
  const ridgeB = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(qz * 0.008 - qx * 0.0035 + 1.2))), 4.5);
  const ridgeMask = smoothstep(-0.1, 0.72, fbm2(x * 0.0022, z * 0.0022, seed + 17, 4));
  const ridges = ridgeA * (7 + ridgeMask * 18) + ridgeB * (4 + (1 - ridgeMask) * 12);

  const shoulder = fbm2(x * 0.006, z * 0.006, seed + 21, 4) * 4.8;
  const bowls = -Math.pow(Math.max(0, fbm2(x * 0.0041, z * 0.0041, seed + 51, 3)), 2) * 7.5;
  const microRidges = ridgeNoise(x * 0.012, z * 0.012, seed + 61, 3) * 3.5;

  return broad + baseMassif + northWall + westPeak + eastPeak + distantCrown + spawnBasin + ridges + shoulder + bowls + microRidges;
}

export function terrainNormal(x, z, step = 0.5) {
  const hx0 = mountainHeight(x - step, z), hx1 = mountainHeight(x + step, z);
  const hz0 = mountainHeight(x, z - step), hz1 = mountainHeight(x, z + step);
  let nx = -(hx1 - hx0) / (step * 2), ny = 1, nz = -(hz1 - hz0) / (step * 2);
  const inv = 1 / Math.hypot(nx, ny, nz);
  nx *= inv; ny *= inv; nz *= inv;
  return { x: nx, y: ny, z: nz };
}

export function slopeRadians(x, z) {
  return Math.acos(clamp(terrainNormal(x, z).y, -1, 1));
}

export function downhillDirection(x, z) {
  const n = terrainNormal(x, z);
  const len = Math.hypot(n.x, n.z) || 1;
  return { x: n.x / len, z: n.z / len };
}

export function windExposure(x, z, normal = null) {
  const n = normal || terrainNormal(x, z, 1.25);
  const wx = Math.cos(WIND_ANGLE), wz = Math.sin(WIND_ANGLE);
  const face = clamp(-(n.x * wx + n.z * wz), -1, 1);
  const broad = fbm2(x * 0.0026, z * 0.0026, MOUNTAIN_SEED + 71, 3) * 0.35;
  return clamp(face * 0.7 + broad + 0.18, -1, 1);
}

export function terrainVariation(x, z) {
  const p = rotate2(x, z, WIND_ANGLE);
  return clamp(fbm2(p.x * 0.032, p.y * 0.021, MOUNTAIN_SEED + 81, 3), -1, 1);
}
