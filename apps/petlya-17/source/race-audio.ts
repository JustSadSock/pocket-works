import { clamp } from './core';

export class RaceAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private tyreGain: GainNode | null = null;
  private engineLow: OscillatorNode | null = null;
  private engineHigh: OscillatorNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private tyreFilter: BiquadFilterNode | null = null;

  constructor(private readonly isEnabled: () => boolean) {}

  async unlock(): Promise<void> {
    if (!this.isEnabled()) return;
    if (!this.context) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.context.destination);

      this.engineGain = this.context.createGain();
      this.windGain = this.context.createGain();
      this.tyreGain = this.context.createGain();
      this.engineGain.connect(this.master);
      this.windGain.connect(this.master);
      this.tyreGain.connect(this.master);

      const engineFilter = this.context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 1400;
      engineFilter.connect(this.engineGain);

      this.engineLow = this.context.createOscillator();
      this.engineLow.type = 'sawtooth';
      this.engineLow.connect(engineFilter);
      this.engineLow.start();

      this.engineHigh = this.context.createOscillator();
      this.engineHigh.type = 'square';
      const highGain = this.context.createGain();
      highGain.gain.value = 0.065;
      this.engineHigh.connect(highGain).connect(engineFilter);
      this.engineHigh.start();

      const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;

      const windSource = this.context.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;
      this.windFilter = this.context.createBiquadFilter();
      this.windFilter.type = 'highpass';
      this.windFilter.frequency.value = 820;
      windSource.connect(this.windFilter).connect(this.windGain);
      windSource.start();

      const tyreSource = this.context.createBufferSource();
      tyreSource.buffer = noiseBuffer;
      tyreSource.loop = true;
      this.tyreFilter = this.context.createBiquadFilter();
      this.tyreFilter.type = 'bandpass';
      this.tyreFilter.frequency.value = 310;
      this.tyreFilter.Q.value = 0.8;
      tyreSource.connect(this.tyreFilter).connect(this.tyreGain);
      tyreSource.start();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  update(speed: number, maxSpeed: number, active: boolean, offroad: number, drafting: number, slipAngle: number, acceleration: number): void {
    if (!this.context || !this.master || !this.engineGain || !this.windGain || !this.tyreGain || !this.engineLow || !this.engineHigh) return;
    const now = this.context.currentTime;
    const feel = clamp(speed / maxSpeed, 0, 1.2);
    const gear = clamp(Math.floor(speed / 50) + 1, 1, 6);
    const gearPhase = (speed % 50) / 50;
    const load = clamp(acceleration / 40, -1, 1);
    const rpm = 58 + gearPhase * 215 + gear * 9 + load * 9;
    this.engineLow.frequency.setTargetAtTime(rpm, now, 0.035);
    this.engineHigh.frequency.setTargetAtTime(rpm * 2.02, now, 0.035);
    this.engineGain.gain.setTargetAtTime(active && this.isEnabled() ? 0.035 + feel * 0.09 + Math.max(0, load) * 0.018 : 0.0001, now, 0.05);
    this.windGain.gain.setTargetAtTime(active && this.isEnabled() ? feel * feel * (0.16 + drafting * 0.07) : 0.0001, now, 0.08);
    const slipNoise = clamp(Math.abs(slipAngle) * 0.74, 0, 0.18);
    this.tyreGain.gain.setTargetAtTime(active && this.isEnabled() ? 0.012 + feel * 0.025 + offroad * 0.08 + slipNoise : 0.0001, now, 0.055);
    this.windFilter?.frequency.setTargetAtTime(760 + feel * 1100, now, 0.1);
    this.tyreFilter?.frequency.setTargetAtTime(250 + feel * 180 + slipNoise * 900, now, 0.08);
    this.master.gain.setTargetAtTime(active && this.isEnabled() ? 0.76 : 0.0001, now, 0.06);
  }

  beep(frequency = 520, duration = 0.09, gainValue = 0.11): void {
    if (!this.context || !this.isEnabled()) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }

  impact(strength = 1): void {
    if (!this.context || !this.isEnabled()) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(95 + strength * 45, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(35, this.context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.18 * strength, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.2);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.22);
  }

  mute(): void {
    if (this.context && this.master) this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.03);
  }
}
