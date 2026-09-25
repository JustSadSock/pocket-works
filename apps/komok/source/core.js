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

export function encodeFloat32(values) {
  const source = values instanceof Float32Array ? values : new Float32Array(values);
  const bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + chunk)));
  }
  return btoa(binary);
}

export function decodeFloat32(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
