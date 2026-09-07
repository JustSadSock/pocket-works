export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const fract = (v) => v - Math.floor(v);
export const hash2 = (x, y, seed = 0) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123);

export function valueNoise2(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}

export function fbm2(x, y, seed = 0, octaves = 4) {
  let value = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise2(x, y, seed + i * 17) * amp;
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.01 - 11.7;
    amp *= 0.5;
  }
  return value / norm;
}

export function rotate2(x, z, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - z * s, y: x * s + z * c };
}

export function rollingAverage(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const v of samples) sum += v;
  return sum / samples.length;
}
