export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function length2(x, y) {
  return Math.hypot(x, y);
}

export function clampArena(x, z, radius = 6.7) {
  const length = Math.hypot(x, z);
  if (length <= radius || length === 0) return { x, z };
  const scale = radius / length;
  return { x: x * scale, z: z * scale };
}

export function normalizedOrZero(x, y) {
  const length = Math.hypot(x, y);
  if (length < 1e-5) return { x: 0, y: 0, length: 0 };
  return { x: x / length, y: y / length, length };
}
