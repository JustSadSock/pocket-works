export type GaitWeights = {
  idle: number;
  walk: number;
  jog: number;
  run: number;
};

export type DirectionalWeights = {
  forward: number;
  back: number;
  left: number;
  right: number;
  pivotLeft: number;
  pivotRight: number;
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

export function shortestAngleDelta(current: number, target: number): number {
  const twoPi = Math.PI * 2;
  return ((target - current + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
}

export function moveAngleTowards(current: number, target: number, maxStep: number): number {
  const delta = shortestAngleDelta(current, target);
  const step = Math.max(0, maxStep);
  if (Math.abs(delta) <= step) return current + delta;
  return current + Math.sign(delta) * step;
}

export function localMotionComponents(x: number, z: number, facingYaw: number): { forward: number; right: number } {
  const length = Math.hypot(x, z);
  if (length < 0.00001) return { forward: 1, right: 0 };
  const nx = x / length;
  const nz = z / length;
  const forwardX = -Math.sin(facingYaw);
  const forwardZ = -Math.cos(facingYaw);
  const rightX = Math.cos(facingYaw);
  const rightZ = -Math.sin(facingYaw);
  return {
    forward: Math.max(-1, Math.min(1, nx * forwardX + nz * forwardZ)),
    right: Math.max(-1, Math.min(1, nx * rightX + nz * rightZ))
  };
}

export function directionalWeights(
  localForward: number,
  localRight: number,
  speed: number,
  turnError: number
): DirectionalWeights {
  const speedFade = clamp01((3.25 - Math.max(0, speed)) / 2.25);
  const backIntent = clamp01((-localForward - 0.12) / 0.88) * speedFade;
  const sideIntent = clamp01((Math.abs(localRight) - 0.12) / 0.88) * speedFade;
  const pivotIntent = speed < 0.55
    ? clamp01((Math.abs(turnError) - 0.18) / 1.05) * (1 - speed / 0.55)
    : 0;

  const moveBudget = 1 - pivotIntent;
  const rawBack = backIntent;
  const rawSide = sideIntent * (1 - backIntent * 0.35);
  const rawForward = Math.max(0, 1 - Math.max(rawBack, rawSide));
  const total = Math.max(0.0001, rawForward + rawBack + rawSide);
  const sideWeight = moveBudget * rawSide / total;

  return {
    forward: moveBudget * rawForward / total,
    back: moveBudget * rawBack / total,
    left: localRight < 0 ? sideWeight : 0,
    right: localRight >= 0 ? sideWeight : 0,
    pivotLeft: turnError < 0 ? pivotIntent : 0,
    pivotRight: turnError >= 0 ? pivotIntent : 0
  };
}
