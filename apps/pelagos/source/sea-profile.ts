import type { WaveComponent } from './core';
import { DEG, WAVE_COMPONENTS } from './core';

// The ocean runs at real game time, so phase speed has to read correctly at phone scale.
// The previous spectrum used deep-water-like speeds that were technically plausible but visually
// felt time-lapsed beside a 10–16 m cutter. This slower mixed swell keeps long waves authoritative
// while preserving enough short chop for surface detail. sampleWave(), hull physics and the shader
// all consume this exact shared array, so visible water and collision water never drift apart.
const waves = WAVE_COMPONENTS as unknown as WaveComponent[];

waves.splice(0, waves.length,
  { direction: 11 * DEG, amplitude: 0.43, wavelength: 31.6, speed: 3.82, steepness: 0.61 },
  { direction: 37 * DEG, amplitude: 0.31, wavelength: 18.4, speed: 3.18, steepness: 0.69 },
  { direction: -24 * DEG, amplitude: 0.235, wavelength: 10.7, speed: 2.52, steepness: 0.73 },
  { direction: 72 * DEG, amplitude: 0.155, wavelength: 6.15, speed: 1.94, steepness: 0.64 },
  { direction: -81 * DEG, amplitude: 0.097, wavelength: 3.48, speed: 1.47, steepness: 0.51 },
  { direction: 121 * DEG, amplitude: 0.061, wavelength: 2.06, speed: 1.10, steepness: 0.40 },
  { direction: -143 * DEG, amplitude: 0.038, wavelength: 1.17, speed: 0.78, steepness: 0.29 },
  { direction: 169 * DEG, amplitude: 0.022, wavelength: 0.67, speed: 0.56, steepness: 0.20 }
);
