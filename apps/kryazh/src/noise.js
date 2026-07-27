export function hash32(x, y, z, seed) {
  let h = seed | 0;
  h = Math.imul(h ^ (x | 0), 0x45d9f3b);
  h = Math.imul(h ^ (y | 0), 0x45d9f3b);
  h = Math.imul(h ^ (z | 0), 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}
export const rand = (x, y, z, seed) => hash32(x, y, z, seed) / 4294967295;
const smooth = (t) => t * t * (3 - 2 * t);
export function valueNoise2(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const a = rand(xi, 0, zi, seed), b = rand(xi + 1, 0, zi, seed);
  const c = rand(xi, 0, zi + 1, seed), d = rand(xi + 1, 0, zi + 1, seed);
  const u = smooth(xf), v = smooth(zf);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}
export function fbm2(x, z, seed, octaves = 4) {
  let sum = 0, amp = .5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, z * freq, seed + i * 193) * amp;
    norm += amp; amp *= .5; freq *= 2;
  }
  return sum / norm;
}
export function valueNoise3(x, y, z, seed) {
  const yi = Math.floor(y), yf = y - yi;
  const a = valueNoise2(x + yi * 13.37, z - yi * 7.11, seed);
  const b = valueNoise2(x + (yi + 1) * 13.37, z - (yi + 1) * 7.11, seed);
  return a + (b - a) * smooth(yf);
}
export function seedFromText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
