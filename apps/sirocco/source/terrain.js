import { TAU, clamp, fbm2, rotate2, smoothstep, valueNoise2 } from './core.js';

export const DESERT_SEED = 1709;
export const WIND_ANGLE = 0.53;

function duneWave(phase, asymmetry = 0.23) {
  const s = Math.sin(phase);
  return s + Math.sin(phase * 2 - 0.72) * asymmetry + Math.sin(phase * 3 + 0.35) * 0.055;
}

export function terrainHeight(x, z, seed = DESERT_SEED) {
  const p = rotate2(x, z, WIND_ANGLE);
  const regional = fbm2(x * 0.0015, z * 0.0015, seed + 2, 4);
  const warpX = fbm2(x * 0.0031 + 12.4, z * 0.0031 - 7.8, seed + 5, 4);
  const warpZ = fbm2(x * 0.0034 - 5.1, z * 0.0034 + 9.6, seed + 7, 4);
  const basin = fbm2(x * 0.0016, z * 0.0016, seed + 3, 4) * 2.15;

  // Wind still gives the desert a dominant direction, but local orientation bends by region.
  const bend = fbm2(x * 0.0022, z * 0.0022, seed + 9, 3) * 0.34;
  const cb = Math.cos(bend), sb = Math.sin(bend);
  const qx = p.x * cb - p.y * sb + warpX * 16;
  const qz = p.x * sb + p.y * cb + warpZ * 22;

  const spacingNoise = fbm2(x * 0.0048, z * 0.0048, seed + 11, 3);
  const wavelength = 62 + spacingNoise * 13;
  const phaseBreak = fbm2(x * 0.0062, z * 0.0062, seed + 13, 3) * 2.5;
  const macroPhase = qz / wavelength * TAU + phaseBreak;
  const ridgeMask = smoothstep(-0.45, 0.58, fbm2(x * 0.0027 + 3.7, z * 0.0027 - 6.2, seed + 17, 4));
  const amplitude = 3.7 + ridgeMask * 4.2 + Math.max(0, regional) * 1.8;
  let macro = duneWave(macroPhase, 0.25) * amplitude;

  // Break long ridges into lobes and saddles instead of endless parallel sine rows.
  const lobe = fbm2(qx * 0.008, qz * 0.005, seed + 23, 3);
  macro *= 0.68 + smoothstep(-0.72, 0.72, lobe) * 0.62;
  macro += Math.sin(qz * 0.052 + qx * 0.024 + warpX * 1.8) * (0.38 + ridgeMask * 0.42);

  const secondaryWarp = valueNoise2(qx * 0.018, qz * 0.018, seed + 29) * 0.72;
  const secondaryMask = 0.35 + smoothstep(-0.7, 0.65, fbm2(x * 0.007, z * 0.007, seed + 31, 3)) * 0.65;
  const secondary = duneWave(qz / 18.5 * TAU + qx * 0.011 + secondaryWarp, 0.13) * 0.78 * secondaryMask;

  const cross = Math.sin(qx * 0.019 + qz * 0.010 + fbm2(x * 0.012, z * 0.012, seed + 37, 2) * 1.7) * 0.34;
  const lowland = -smoothstep(0.5, 0.86, -fbm2(x * 0.0045, z * 0.0045, seed + 41, 3)) * 1.25;
  return basin + macro + secondary + cross + lowland;
}

export function terrainNormal(x, z, step = 0.38) {
  const hx0 = terrainHeight(x - step, z), hx1 = terrainHeight(x + step, z);
  const hz0 = terrainHeight(x, z - step), hz1 = terrainHeight(x, z + step);
  let nx = -(hx1 - hx0) / (step * 2), ny = 1, nz = -(hz1 - hz0) / (step * 2);
  const inv = 1 / Math.hypot(nx, ny, nz); nx *= inv; ny *= inv; nz *= inv;
  return { x: nx, y: ny, z: nz };
}
export function terrainSlope(x, z) { return Math.acos(clamp(terrainNormal(x, z).y, -1, 1)); }
export function downhillDirection(x, z) { const n = terrainNormal(x, z); const len = Math.hypot(n.x, n.z) || 1; return { x: n.x / len, z: n.z / len }; }
export function sandVariation(x, z) {
  const p = rotate2(x, z, WIND_ANGLE);
  return clamp(fbm2(p.x * 0.035, p.y * 0.025, DESERT_SEED + 61, 3) * 0.5 + valueNoise2(x * 0.12, z * 0.12, DESERT_SEED + 67) * 0.18, -1, 1);
}
