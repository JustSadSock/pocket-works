export type GaitWeights = {
  idle: number;
  walk: number;
  jog: number;
  run: number;
};

export const MAX_SPEED = 5.2;
export const INPUT_DEAD_ZONE = 0.08;

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function speedFromMagnitude(magnitude: number): number {
  const raw = clamp01(magnitude);
  if (raw <= INPUT_DEAD_ZONE) return 0;
  const t = (raw - INPUT_DEAD_ZONE) / (1 - INPUT_DEAD_ZONE);
  return 0.55 + (MAX_SPEED - 0.55) * Math.pow(t, 1.45);
}

export function gaitWeights(speed: number): GaitWeights {
  const anchors = [0, 1.55, 3.05, MAX_SPEED];
  const s = Math.max(0, Math.min(MAX_SPEED, speed));
  const result: GaitWeights = { idle: 0, walk: 0, jog: 0, run: 0 };
  const keys: Array<keyof GaitWeights> = ['idle', 'walk', 'jog', 'run'];

  if (s <= anchors[0]) {
    result.idle = 1;
    return result;
  }
  if (s >= anchors[3]) {
    result.run = 1;
    return result;
  }

  for (let i = 0; i < anchors.length - 1; i += 1) {
    if (s >= anchors[i] && s <= anchors[i + 1]) {
      const span = anchors[i + 1] - anchors[i];
      const t = span > 0 ? (s - anchors[i]) / span : 0;
      result[keys[i]] = 1 - t;
      result[keys[i + 1]] = t;
      break;
    }
  }
  return result;
}

export function exponentialApproach(current: number, target: number, sharpness: number, dt: number): number {
  const factor = 1 - Math.exp(-Math.max(0, sharpness) * Math.max(0, dt));
  return current + (target - current) * factor;
}
