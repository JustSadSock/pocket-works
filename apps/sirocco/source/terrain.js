import { TAU, clamp, fbm2, rotate2, smoothstep, valueNoise2 } from './core.js';

export const DESERT_SEED = 1709;
export const WIND_ANGLE = 0.53;

function duneWave(phase, asymmetry = 0.23) {
  const s = Math.sin(phase);
  const h2 = Math.sin(phase * 2 - 0.72) * asymmetry;
  const h3 = Math.sin(phase * 3 + 0.35) * 0.06;
  return s + h2 + h3;
}

export function terrainHeight(x, z, seed = DESERT_SEED) {
  const p = rotate2(x, z, WIND_ANGLE);
  const broadWarp = fbm2(p.x * 0.0032, p.y * 0.0032, seed + 1, 4);
  const basin = fbm2(x * 0.0017, z * 0.0017, seed + 3, 4) * 2.6;

  const macroWavelength = 56 + fbm2(p.x * 0.005, p.y * 0.004, seed + 7, 3) * 9;
  const macroPhase = p.y / macroWavelength * TAU + broadWarp * 2.2 + Math.sin(p.x * 0.006) * 0.48;
  const macroAmplitude = 6.3 + (fbm2(p.x * 0.006, p.y * 0.006, seed + 11, 3) + 1) * 2.0;
  let macro = duneWave(macroPhase, 0.28) * macroAmplitude;

  const rare = smoothstep(0.22, 0.76, fbm2(x * 0.0023 + 4.2, z * 0.0023 - 8.4, seed + 19, 4));
  macro *= 0.82 + rare * 0.88;

  const secondaryWarp = valueNoise2(p.x * 0.02, p.y * 0.02, seed + 29) * 0.9;
  const secondary = duneWave(p.y / 14.5 * TAU + p.x * 0.017 + secondaryWarp, 0.18) * 1.35;

  const cross = Math.sin((p.x * 0.014 + p.y * 0.009) + fbm2(x * 0.015, z * 0.015, seed + 31, 2)) * 0.42;
  const lowland = -smoothstep(0.45, 0.84, -fbm2(x * 0.005, z * 0.005, seed + 37, 3)) * 1.8;
  return basin + macro + secondary + cross + lowland;
}

export function terrainNormal(x, z, step = 0.38) {
  const hx0 = terrainHeight(x - step, z);
  const hx1 = terrainHeight(x + step, z);
  const hz0 = terrainHeight(x, z - step);
  const hz1 = terrainHeight(x, z + step);
  let nx = -(hx1 - hx0) / (step * 2);
  let ny = 1;
  let nz = -(hz1 - hz0) / (step * 2);
  const inv = 1 / Math.hypot(nx, ny, nz);
  nx *= inv; ny *= inv; nz *= inv;
  return { x: nx, y: ny, z: nz };
}

export function terrainSlope(x, z) {
  return Math.acos(clamp(terrainNormal(x, z).y, -1, 1));
}

export function downhillDirection(x, z) {
  const n = terrainNormal(x, z);
  const len = Math.hypot(n.x, n.z) || 1;
  return { x: n.x / len, z: n.z / len };
}

export function sandVariation(x, z) {
  const p = rotate2(x, z, WIND_ANGLE);
  return clamp(
    fbm2(p.x * 0.035, p.y * 0.025, DESERT_SEED + 61, 3) * 0.5 +
    valueNoise2(x * 0.12, z * 0.12, DESERT_SEED + 67) * 0.18,
    -1,
    1
  );
}
