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
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}

export function fbm2(x, y, seed = 0, octaves = 4) {
  let value = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise2(x, y, seed + i * 19) * amp;
    norm += amp;
    x = x * 2.01 + 17.3;
    y = y * 2.03 - 11.9;
    amp *= 0.5;
  }
  return value / norm;
}

export function ridgeNoise(x, y, seed = 0, octaves = 4) {
  let value = 0, amp = 0.55, norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(valueNoise2(x, y, seed + i * 23));
    value += n * n * amp;
    norm += amp;
    x = x * 2.07 + 8.1;
    y = y * 2.02 - 5.7;
    amp *= 0.48;
  }
  return value / norm;
}

export function rotate2(x, z, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: x * c - z * s, y: x * s + z * c };
}

export function signedAngleDelta(a, b) {
  let d = (b - a + Math.PI) % TAU - Math.PI;
  if (d < -Math.PI) d += TAU;
  return d;
}
