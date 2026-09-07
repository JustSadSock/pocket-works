import type { WaveComponent } from './core';
import { DEG, WAVE_COMPONENTS } from './core';

// Replace the original nearly harmonic spectrum before world.ts compiles the ocean shader.
// sampleWave() and the shader both consume this same array, so hull physics and visible water stay aligned.
const waves = WAVE_COMPONENTS as unknown as WaveComponent[];

waves.splice(0, waves.length,
  { direction: 11 * DEG, amplitude: 0.43, wavelength: 31.6, speed: 6.22, steepness: 0.61 },
  { direction: 37 * DEG, amplitude: 0.31, wavelength: 18.4, speed: 5.18, steepness: 0.69 },
  { direction: -24 * DEG, amplitude: 0.235, wavelength: 10.7, speed: 4.06, steepness: 0.73 },
  { direction: 72 * DEG, amplitude: 0.155, wavelength: 6.15, speed: 3.05, steepness: 0.64 },
  { direction: -81 * DEG, amplitude: 0.097, wavelength: 3.48, speed: 2.27, steepness: 0.51 },
  { direction: 121 * DEG, amplitude: 0.061, wavelength: 2.06, speed: 1.72, steepness: 0.40 },
  { direction: -143 * DEG, amplitude: 0.038, wavelength: 1.17, speed: 1.23, steepness: 0.29 },
  { direction: 169 * DEG, amplitude: 0.022, wavelength: 0.67, speed: 0.87, steepness: 0.20 }
);
