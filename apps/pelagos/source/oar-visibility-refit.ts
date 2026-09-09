import { clamp, lerp } from './core';

export type OarVisualPose = {
  sweep: number;
  dip: number;
  power: number;
  recovery: number;
};

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Solve the ship-local blade angle required to put the centre of a deployed blade on the
 * waterline. Keeping this pure lets the modular ship rig be the only runtime owner of oar pose;
 * the old second OceanWorld wrapper could fight the shipyard rig and hide a freshly deployed bank.
 */
export function oarWaterlineDip(waterlineCenterY: number, verticalScale: number, shaftLength: number): number {
  const localWaterDrop = 0.49 + waterlineCenterY / Math.max(0.65, verticalScale);
  const bladeRadius = Math.max(1.8, shaftLength * 0.79);
  return Math.asin(clamp(localWaterDrop / bladeRadius, 0.16, 0.52));
}

/**
 * Human-speed rowing cycle. The first 62% is the immersed power stroke; the shorter recovery
 * lifts and feathers the blade before it reaches forward again.
 */
export function oarVisualPose(phase: number, strokeAmplitude = 0.76, dipAmplitude = 0.50): OarVisualPose {
  const p = ((phase % 1) + 1) % 1;
  const strokeScale = clamp(strokeAmplitude / 0.76, 0.72, 1.26);
  const dipScale = clamp(dipAmplitude / 0.50, 0.76, 1.20);

  if (p < 0.62) {
    const t = smoothstep(p / 0.62);
    return {
      sweep: lerp(0.43, -0.36, t) * strokeScale,
      dip: (0.235 + Math.sin(t * Math.PI) * 0.060) * dipScale,
      power: Math.sin(t * Math.PI),
      recovery: 0
    };
  }

  const t = smoothstep((p - 0.62) / 0.38);
  return {
    sweep: lerp(-0.36, 0.43, t) * strokeScale,
    dip: (0.105 - Math.sin(t * Math.PI) * 0.045) * dipScale,
    power: 0,
    recovery: Math.sin(t * Math.PI)
  };
}
