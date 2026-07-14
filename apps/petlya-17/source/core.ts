export type Vec3Tuple = readonly [number, number, number];

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

export function wrap(value: number, maximum: number): number {
  return ((value % maximum) + maximum) % maximum;
}

export function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

export function catmullRomClosed(points: readonly Vec3Tuple[], u: number): Vec3Tuple {
  const count = points.length;
  if (count < 4) throw new Error('Closed Catmull-Rom path requires at least four points.');
  const scaled = wrap(u, 1) * count;
  const index = Math.floor(scaled);
  const t = scaled - index;
  const p0 = points[wrap(index - 1, count)];
  const p1 = points[wrap(index, count)];
  const p2 = points[wrap(index + 1, count)];
  const p3 = points[wrap(index + 2, count)];
  return [
    catmullRomScalar(p0[0], p1[0], p2[0], p3[0], t),
    catmullRomScalar(p0[1], p1[1], p2[1], p3[1], t),
    catmullRomScalar(p0[2], p1[2], p2[2], p3[2], t)
  ];
}

export function speedFeel(speedKph: number, maximumKph = 320): number {
  const normalized = clamp(speedKph / maximumKph, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

export function signedWrappedDelta(a: number, b: number, length: number): number {
  let delta = wrap(a - b, length);
  if (delta > length * 0.5) delta -= length;
  return delta;
}
