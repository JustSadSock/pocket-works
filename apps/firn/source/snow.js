import { clamp, fbm2, smoothstep, valueNoise2 } from './core.js';
import { MOUNTAIN_SEED, mountainHeight, terrainNormal, windExposure } from './terrain.js';
import { interpolateGroundCell } from './mesh.js';

export function snowSample(x, z, normal = null) {
  const n = normal || terrainNormal(x, z, 0.72);
  const slope = Math.acos(clamp(n.y, -1, 1));
  const exposure = windExposure(x, z, n);
  const driftNoise = fbm2(x * 0.008, z * 0.008, MOUNTAIN_SEED + 101, 4);
  const micro = valueNoise2(x * 0.052, z * 0.052, MOUNTAIN_SEED + 103);

  const leeward = smoothstep(-0.18, 0.78, -exposure);
  const scoured = smoothstep(0.22, 0.82, exposure);
  const steepLoss = smoothstep(0.62, 1.02, slope);
  const basinLoad = smoothstep(-0.25, 0.72, fbm2(x * 0.0032, z * 0.0032, MOUNTAIN_SEED + 107, 3));
  const depth = clamp(0.34 + leeward * 0.52 + basinLoad * 0.2 + driftNoise * 0.2 - scoured * 0.32 - steepLoss * 0.34, 0.05, 1);

  const crust = clamp(scoured * 0.7 + smoothstep(0.1, 0.62, -driftNoise) * 0.2 + Math.max(0, micro) * 0.08, 0, 1);
  const ice = clamp(smoothstep(0.6, 0.94, scoured + smoothstep(0.5, 0.98, slope) * 0.5) * (0.56 + Math.max(0, -micro) * 0.3), 0, 1);
  const powder = clamp(depth * (1 - crust * 0.55) * (1 - ice * 0.86), 0, 1);
  const hardness = clamp(crust * 0.72 + ice * 0.94 + (1 - depth) * 0.18, 0.04, 1);
  const traction = clamp(0.92 - ice * 0.8 - crust * 0.1 + powder * 0.06, 0.07, 1);
  const instability = clamp(smoothstep(0.46, 0.86, slope) * depth * (0.62 + leeward * 0.7) * (1 - ice), 0, 1);
  const sink = clamp(depth * (0.82 + powder * 0.36) * (1 - hardness * 0.58), 0.04, 0.92);
  const depthMeters = 0.12 + depth * 0.7;
  const sinkDepth = clamp(depthMeters * sink * 0.62, 0.02, 0.48);

  let kind = 'packed';
  if (ice > 0.56) kind = 'ice';
  else if (powder > 0.56 && depth > 0.48) kind = 'powder';
  else if (crust > 0.58) kind = 'crust';
  else if (leeward > 0.66 && depth > 0.58) kind = 'drift';

  return { depth, depthMeters, sinkDepth, crust, ice, powder, hardness, traction, instability, sink, exposure, slope, kind, normal: n };
}

export function snowTint(sample) {
  const ice = sample.ice;
  const powder = sample.powder;
  const shade = 0.89 + powder * 0.09 - sample.crust * 0.03;
  return {
    r: clamp(shade - ice * 0.1, 0.7, 1),
    g: clamp(shade + 0.03 - ice * 0.035, 0.75, 1),
    b: clamp(shade + 0.08 + ice * 0.03, 0.82, 1)
  };
}

export function snowSurfaceOffset(x, z, sample) {
  const drift = fbm2(x * 0.034, z * 0.034, MOUNTAIN_SEED + 121, 2) * sample.powder * 0.12;
  const sastrugi = Math.sin((x * 0.22 + z * 0.11) + fbm2(x * 0.02, z * 0.02, MOUNTAIN_SEED + 127, 2) * 2.4) * sample.exposure * 0.025;
  return sample.depthMeters + drift + sastrugi;
}

export function snowSurfaceHeight(x, z, sample = null) {
  const s = sample || snowSample(x, z);
  return mountainHeight(x, z) + snowSurfaceOffset(x, z, s);
}

function meshSnowVertexHeight(x, z, step) {
  const h = mountainHeight(x, z);
  let nx = -(mountainHeight(x + step, z) - mountainHeight(x - step, z)) / (step * 2);
  let ny = 1;
  let nz = -(mountainHeight(x, z + step) - mountainHeight(x, z - step)) / (step * 2);
  const inv = 1 / Math.hypot(nx, ny, nz);
  nx *= inv; ny *= inv; nz *= inv;
  const sample = snowSample(x, z, { x: nx, y: ny, z: nz });
  return h + snowSurfaceOffset(x, z, sample);
}

export function meshSnowSurfaceHeight(x, z, segments, chunkSize = 56) {
  const seg = Math.max(2, segments | 0);
  const step = chunkSize / seg;
  const cx = Math.floor(x / chunkSize);
  const cz = Math.floor(z / chunkSize);
  const localX = x - cx * chunkSize;
  const localZ = z - cz * chunkSize;
  const ix = Math.min(seg - 1, Math.max(0, Math.floor(localX / step)));
  const iz = Math.min(seg - 1, Math.max(0, Math.floor(localZ / step)));
  const x0 = cx * chunkSize + ix * step;
  const z0 = cz * chunkSize + iz * step;
  const tx = clamp((x - x0) / step, 0, 1);
  const tz = clamp((z - z0) / step, 0, 1);
  const ha = meshSnowVertexHeight(x0, z0, step);
  const hb = meshSnowVertexHeight(x0 + step, z0, step);
  const hd = meshSnowVertexHeight(x0, z0 + step, step);
  const he = meshSnowVertexHeight(x0 + step, z0 + step, step);
  return interpolateGroundCell(ha, hb, hd, he, tx, tz);
}

export function snowSurfaceNormal(x, z, step = 0.48) {
  const hx0 = snowSurfaceHeight(x - step, z), hx1 = snowSurfaceHeight(x + step, z);
  const hz0 = snowSurfaceHeight(x, z - step), hz1 = snowSurfaceHeight(x, z + step);
  let nx = -(hx1 - hx0) / (step * 2), ny = 1, nz = -(hz1 - hz0) / (step * 2);
  const inv = 1 / Math.hypot(nx, ny, nz);
  nx *= inv; ny *= inv; nz *= inv;
  return { x: nx, y: ny, z: nz };
}

export function movementResponse(sample, uphillDot, sprintIntent) {
  const deepDrag = 1 - sample.sink * 0.68;
  const uphillPenalty = 1 - Math.max(0, uphillDot) * clamp(sample.slope / 0.92, 0, 1) * 0.58;
  const downhillAssist = 1 + Math.max(0, -uphillDot) * clamp(sample.slope / 0.9, 0, 1) * 0.12;
  const sprint = sprintIntent ? 1.28 - sample.sink * 0.32 : 1;
  return clamp(deepDrag * uphillPenalty * downhillAssist * sprint, 0.16, 1.28);
}
