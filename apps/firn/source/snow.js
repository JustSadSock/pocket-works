import { clamp, fbm2, smoothstep, valueNoise2 } from './core.js';
import { MOUNTAIN_SEED, mountainHeight, terrainNormal, windExposure } from './terrain.js';

export function snowSample(x, z, normal = null) {
  const n = normal || terrainNormal(x, z, 0.72);
  const slope = Math.acos(clamp(n.y, -1, 1));
  const exposure = windExposure(x, z, n);
  const driftNoise = fbm2(x * 0.009, z * 0.009, MOUNTAIN_SEED + 71, 4);
  const micro = valueNoise2(x * 0.055, z * 0.055, MOUNTAIN_SEED + 73);

  const leeward = smoothstep(-0.15, 0.75, -exposure);
  const scoured = smoothstep(0.25, 0.8, exposure);
  const steepLoss = smoothstep(0.48, 0.88, slope);
  const depth = clamp(0.25 + leeward * 0.5 + driftNoise * 0.18 - scoured * 0.34 - steepLoss * 0.22, 0.03, 0.96);

  const crust = clamp(scoured * 0.72 + smoothstep(0.12, 0.58, -driftNoise) * 0.24 + Math.max(0, micro) * 0.08, 0, 1);
  const ice = clamp(smoothstep(0.62, 0.93, scoured + smoothstep(0.42, 0.9, slope) * 0.48) * (0.58 + Math.max(0, -micro) * 0.28), 0, 1);
  const powder = clamp(depth * (1 - crust * 0.58) * (1 - ice * 0.85), 0, 1);
  const hardness = clamp(crust * 0.72 + ice * 0.92 + (1 - depth) * 0.2, 0.05, 1);
  const traction = clamp(0.92 - ice * 0.78 - crust * 0.12 + powder * 0.08, 0.08, 1);
  const instability = clamp(smoothstep(0.43, 0.78, slope) * depth * (0.6 + leeward * 0.65) * (1 - ice), 0, 1);
  const sink = clamp(depth * (0.72 + powder * 0.3) * (1 - hardness * 0.55), 0.03, 0.72);

  let kind = 'packed';
  if (ice > 0.56) kind = 'ice';
  else if (powder > 0.56 && depth > 0.48) kind = 'powder';
  else if (crust > 0.58) kind = 'crust';
  else if (leeward > 0.66 && depth > 0.58) kind = 'drift';

  return { depth, crust, ice, powder, hardness, traction, instability, sink, exposure, slope, kind, normal: n };
}

export function snowTint(sample) {
  const ice = sample.ice;
  const powder = sample.powder;
  const shade = 0.91 + powder * 0.07 - sample.crust * 0.025;
  return {
    r: clamp(shade - ice * 0.09, 0.73, 1),
    g: clamp(shade + 0.025 - ice * 0.035, 0.77, 1),
    b: clamp(shade + 0.065 + ice * 0.025, 0.82, 1)
  };
}

export function snowSurfaceOffset(x, z, sample) {
  const drift = fbm2(x * 0.038, z * 0.038, MOUNTAIN_SEED + 91, 2) * sample.powder * 0.075;
  return sample.depth * 0.16 + drift;
}

export function snowSurfaceHeight(x, z, sample = null) {
  const s = sample || snowSample(x, z);
  return mountainHeight(x, z) + snowSurfaceOffset(x, z, s);
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
  const deepDrag = 1 - sample.sink * 0.52;
  const uphillPenalty = 1 - Math.max(0, uphillDot) * clamp(sample.slope / 0.9, 0, 1) * 0.42;
  const downhillAssist = 1 + Math.max(0, -uphillDot) * clamp(sample.slope / 0.9, 0, 1) * 0.14;
  const sprint = sprintIntent ? 1.34 - sample.sink * 0.22 : 1;
  return clamp(deepDrag * uphillPenalty * downhillAssist * sprint, 0.28, 1.35);
}
