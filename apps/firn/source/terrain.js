import { TAU, clamp, fbm2, ridgeNoise, rotate2, smoothstep } from './core.js';

export const MOUNTAIN_SEED = 260908;
export const WIND_ANGLE = -0.62;

export function mountainHeight(x, z, seed = MOUNTAIN_SEED) {
  const p = rotate2(x, z, 0.27);
  const basin = fbm2(x * 0.00115, z * 0.00115, seed + 1, 5) * 18;
  const massif = ridgeNoise(x * 0.00165, z * 0.00165, seed + 5, 5);
  const massifBias = (massif - 0.46) * 56;

  const warpX = fbm2(x * 0.0032 + 4.1, z * 0.0032 - 8.3, seed + 9, 4) * 26;
  const warpZ = fbm2(x * 0.0027 - 7.4, z * 0.0027 + 5.2, seed + 11, 4) * 31;
  const qx = p.x + warpX;
  const qz = p.y + warpZ;

  const ridgeA = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(qx * 0.0125 + qz * 0.004))), 3.1);
  const ridgeB = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(qz * 0.0092 - qx * 0.0037 + 1.2))), 4.2);
  const ridgeMask = smoothstep(-0.1, 0.72, fbm2(x * 0.0022, z * 0.0022, seed + 17, 4));
  const ridges = ridgeA * (7 + ridgeMask * 12) + ridgeB * (3 + (1 - ridgeMask) * 9);

  const shoulder = fbm2(x * 0.006, z * 0.006, seed + 21, 4) * 3.4;
  const bowls = -Math.pow(Math.max(0, fbm2(x * 0.0041, z * 0.0041, seed + 31, 3)), 2) * 5.6;
  const cornice = Math.max(0, Math.sin((qx + qz * 0.32) * 0.031 + fbm2(x * 0.008, z * 0.008, seed + 37, 2) * 1.7));
  const corniceMask = smoothstep(0.55, 0.86, ridgeA) * smoothstep(0.1, 0.68, ridgeMask);

  return basin + massifBias + ridges + shoulder + bowls + cornice * corniceMask * 2.4;
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
  const broad = fbm2(x * 0.0026, z * 0.0026, MOUNTAIN_SEED + 51, 3) * 0.35;
  return clamp(face * 0.7 + broad + 0.18, -1, 1);
}

export function terrainVariation(x, z) {
  const p = rotate2(x, z, WIND_ANGLE);
  return clamp(fbm2(p.x * 0.032, p.y * 0.021, MOUNTAIN_SEED + 61, 3), -1, 1);
}
