import { clamp } from './core.js';

// One coherent wind field drives audio, airborne sand and slow footprint erosion.
// It is deliberately deterministic: visual/audio state stays stable across frame
// rates and doesn't need a second random simulation on mobile Safari.
export class DesertWind {
  constructor() {
    this.time = 0;
    this.direction = { x: 0.78, z: 0.62 };
    this.strength = 0.38;
    this.gust = 0;
    this.nextPulse = 7.5;
    this.pulseAge = 99;
    this.pulseStrength = 0;
  }

  update(dt, globalX = 0, globalZ = 0) {
    this.time += dt;
    this.nextPulse -= dt;
    if (this.nextPulse <= 0) {
      const seed = Math.sin(this.time * 1.731 + globalX * 0.0017 + globalZ * 0.0011) * 43758.5453;
      const fract = seed - Math.floor(seed);
      this.nextPulse = 8.5 + fract * 12.0;
      this.pulseAge = 0;
      this.pulseStrength = 0.45 + fract * 0.42;
    }
    this.pulseAge += dt;

    const slow = Math.sin(this.time * 0.071) * 0.5 + Math.sin(this.time * 0.029 + 1.7) * 0.5;
    const medium = Math.sin(this.time * 0.19 + Math.sin(this.time * 0.037) * 1.9);
    const pulse = this.pulseAge < 5.8
      ? Math.sin(Math.min(1, this.pulseAge / 1.25) * Math.PI * 0.5)
        * Math.max(0, 1 - Math.max(0, this.pulseAge - 2.2) / 3.6)
        * this.pulseStrength
      : 0;

    const heading = 0.66 + slow * 0.10 + Math.sin(this.time * 0.013) * 0.08;
    this.direction.x = Math.cos(heading);
    this.direction.z = Math.sin(heading);
    this.gust = clamp(0.5 + medium * 0.22 + pulse * 0.58, 0, 1);
    this.strength = clamp(0.24 + this.gust * 0.56 + Math.abs(slow) * 0.08, 0.18, 0.95);
    return this.state;
  }

  get state() {
    return {
      x: this.direction.x,
      z: this.direction.z,
      strength: this.strength,
      gust: this.gust,
      pulse: this.pulseAge < 5.8 ? this.pulseStrength : 0
    };
  }
}
