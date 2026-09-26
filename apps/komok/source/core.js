export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function brushFalloff(distance, radius) {
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0 || distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t * (3 - 2 * t);
}

export function brushRadius(sliderValue) {
  const t = clamp((Number(sliderValue) - 18) / 62, 0, 1);
  return 0.24 + t * 0.72;
}

const POSITION_SCALE = 8192;
const POSITION_LIMIT = 3.95;

export function encodePositions(values) {
  const source = values instanceof Float32Array ? values : new Float32Array(values);
  const packed = new Int16Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    packed[i] = Math.round(clamp(source[i], -POSITION_LIMIT, POSITION_LIMIT) * POSITION_SCALE);
  }
  const bytes = new Uint8Array(packed.buffer);
  let binary = '';
  const chunk = 0x4000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return btoa(binary);
}

export function decodePositions(text) {
  const binary = atob(text);
  if (binary.length % 2 !== 0) throw new Error('Invalid sculpt payload');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const packed = new Int16Array(bytes.buffer);
  const result = new Float32Array(packed.length);
  for (let i = 0; i < packed.length; i += 1) result[i] = packed[i] / POSITION_SCALE;
  return result;
}
