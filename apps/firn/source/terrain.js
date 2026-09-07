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
  const nx = dx / sx;
  const nz = dz / sz;
  const r = Math.hypot(nx, nz);
  const angle = Math.atan2(nz, nx);
  const radial = Math.max(0, 1 - r);
  const facetNoise = fbm2(x * 0.0036, z * 0.0036, seed, 3);
  const facets = 0.64 + Math.abs(Math.sin(angle * 3.5 + facetNoise * 1.7)) * 0.36;
  const summit = Math.pow(radial, 1.22) * facets;
  const gullyA = Math.pow(Math.max(0, Math.sin(angle * 5.0 + r * 12.5 + facetNoise)), 6) * radial * 0.20;
  const gullyB = Math.pow(Math.max(0, Math.sin(angle * 9.0 - r * 7.0)), 9) * radial * 0.08;
  const cliffBand = smoothstep(0.25, 0.44, radial) * (1 - smoothstep(0.55, 0.78, radial));
  const ledges = Math.sin((r * 13.0 + facetNoise * 1.4) * Math.PI) * cliffBand * 0.035;
  return height * Math.max(0, summit - gullyA - gullyB + ledges);
}

function ridgeSpine(x, z, angle, width, amplitude, seed) {
  const p = rotate2(x, z, angle);
  const warp = fbm2(p.x * 0.0032, p.y * 0.0032, seed, 3) * 22;
  const distance = Math.abs(p.x + warp);
  const spine = Math.exp(-(distance * distance) / (width * width));
  const along = 0.72 + fbm2(p.y * 0.0022, p.x * 0.0013, seed + 2, 3) * 0.28;
  return spine * amplitude * along;
}

export function mountainHeight(x, z, seed = MOUNTAIN_SEED) {
  const broad = fbm2(x * 0.00072, z * 0.00072, seed + 1, 5) * 18;
  const continental = ridgeNoise(x * 0.0012, z * 0.0012, seed + 5, 5);
  const baseMassif = (continental - 0.5) * 36;

  const northWall = gaussianPeak(x, z, 40, 175, 190, 95, 112);
  const westPeak = carvedPeak(x, z, -128, 78, 155, 128, 132, seed + 31);
  const eastPeak = carvedPeak(x, z, 170, 54, 170, 142, 148, seed + 37);
  const distantCrown = carvedPeak(x, z, 18, 350, 285, 220, 188, seed + 41);
  const southShoulder = carvedPeak(x, z, -35, -240, 260, 210, 82, seed + 43);
  const spawnBasin = -gaussianPeak(x, z, 8, -12, 105, 88, 28);

  const spineA = ridgeSpine(x - 8, z - 125, 0.74, 34, 34, seed + 51);
  const spineB = ridgeSpine(x + 95, z - 80, -0.42, 27, 25, seed + 55);

  const p = rotate2(x, z, 0.2);
  const warpX = fbm2(x * 0.0035 + 4.1, z * 0.0035 - 8.3, seed + 61, 4) * 26;
  const warpZ = fbm2(x * 0.0031 - 7.4, z * 0.0031 + 5.2, seed + 63, 4) * 30;
  const qx = p.x + warpX;
  const qz = p.y + warpZ;
  const ridgeA = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(qx * 0.012 + qz * 0.0045))), 4.4);
  const ridgeB = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(qz * 0.009 - qx * 0.0038 + 1.2))), 5.2);
  const ridgeMask = smoothstep(-0.08, 0.72, fbm2(x * 0.0024, z * 0.0024, seed + 67, 4));
  const ridges = ridgeA * (5 + ridgeMask * 15) + ridgeB * (3 + (1 - ridgeMask) * 10);

  const shoulder = fbm2(x * 0.0065, z * 0.0065, seed + 71, 4) * 4.2;
  const gullies = -Math.pow(Math.max(0, fbm2(x * 0.0052, z * 0.0052, seed + 73, 3)), 2.6) * 9;
  const rockBreakup = (ridgeNoise(x * 0.015, z * 0.015, seed + 79, 3) - 0.5) * 3.2;

  return broad + baseMassif + northWall + westPeak + eastPeak + distantCrown + southShoulder + spawnBasin + spineA + spineB + ridges + shoulder + gullies + rockBreakup;
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
  const broad = fbm2(x * 0.0026, z * 0.0026, MOUNTAIN_SEED + 83, 3) * 0.35;
  return clamp(face * 0.72 + broad + 0.16, -1, 1);
}

export function terrainVariation(x, z) {
  const p = rotate2(x, z, WIND_ANGLE);
  return clamp(fbm2(p.x * 0.032, p.y * 0.021, MOUNTAIN_SEED + 89, 3), -1, 1);
}
