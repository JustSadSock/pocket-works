export const TAU = Math.PI * 2;
export const TARGET_ANGLE = -Math.PI / 2;

export function normalizeAngle(value) {
  let angle = value % TAU;
  if (angle <= -Math.PI) angle += TAU;
  if (angle > Math.PI) angle -= TAU;
  return angle;
}

export function angularDistance(a, b) {
  return Math.abs(normalizeAngle(a - b));
}

export function isAligned(ringAngle, gapSize, target = TARGET_ANGLE, margin = 0.045) {
  return angularDistance(ringAngle, target) <= Math.max(0.04, gapSize / 2 - margin);
}

export function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRings(level, seed) {
  const random = mulberry32(seed);
  const count = Math.min(7, 4 + Math.floor((level + 1) / 2));
  const difficulty = Math.min(1, (level - 1) / 14);
  const minGap = 0.26;
  const maxGap = 0.66;

  return Array.from({ length: count }, (_, index) => {
    const inward = index / Math.max(1, count - 1);
    const gapSize = maxGap - difficulty * 0.25 - inward * 0.08 + random() * 0.08;
    const direction = random() > 0.5 ? 1 : -1;
    const speed = (0.22 + difficulty * 0.42 + inward * 0.12 + random() * 0.22) * direction;
    return {
      angle: normalizeAngle(random() * TAU - Math.PI),
      velocity: speed,
      gapSize: Math.max(minGap, gapSize),
      notch: random() > 0.6 ? 2 : 1,
      accent: index % 3,
    };
  });
}

export function scoreForDive(level, combo, precision) {
  const precisionBonus = Math.round(Math.max(0, Math.min(1, precision)) * 60);
  return 90 + level * 18 + combo * 22 + precisionBonus;
}

export function energyDeltaForDive(precision) {
  return 10 + Math.round(Math.max(0, Math.min(1, precision)) * 8);
}
