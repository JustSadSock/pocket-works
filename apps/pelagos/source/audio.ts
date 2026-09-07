import { clamp, smoothTo } from './core';

type AudioFrame = {
  speed: number;
  windSpeed: number;
  waveScale: number;
  rain: number;
  rowing: number;
  sailLoad: number;
};

type ExtendedWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export class SeaAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private hullGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private enabled = true;
  private lastFrame: AudioFrame = { speed: 0, windSpeed: 0, waveScale: 1, rain: 0, rowing: 0, sailLoad: 0 };
  private creakClock = 0;
  private oarClock = 0;

  setEnabled(value: boolean): void {
    this.enabled = Boolean(value);
    if (!this.enabled) void this.suspend();
  }

  async unlock(): Promise<boolean> {
    if (!this.enabled) return false;
    if (!this.context) this.createGraph();
    if (!this.context) return false;
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context.state === 'running';
  }

  private createGraph(): void {
    const AudioContextClass = window.AudioContext || (window as ExtendedWindow).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0.34;
    master.connect(context.destination);

    const windGain = context.createGain();
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.55;
    windGain.connect(windFilter).connect(master);
    this.connectNoise(context, windGain, 8.1);

    const waterGain = context.createGain();
    const waterFilter = context.createBiquadFilter();
    waterFilter.type = 'lowpass';
    waterFilter.Q.value = 0.7;
    waterGain.connect(waterFilter).connect(master);
    this.connectNoise(context, waterGain, 6.7);

    const hullGain = context.createGain();
    hullGain.connect(master);
    this.connectNoise(context, hullGain, 3.4);

    const rainGain = context.createGain();
    const rainFilter = context.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 2400;
    rainGain.connect(rainFilter).connect(master);
    this.connectNoise(context, rainGain, 2.2);

    windGain.gain.value = 0.0001;
    waterGain.gain.value = 0.0001;
    hullGain.gain.value = 0.0001;
    rainGain.gain.value = 0.0001;

    this.context = context;
    this.master = master;
    this.windGain = windGain;
    this.waterGain = waterGain;
    this.hullGain = hullGain;
    this.rainGain = rainGain;
    this.windFilter = windFilter;
    this.waterFilter = waterFilter;
  }

  private connectNoise(context: AudioContext, destination: AudioNode, seconds: number): void {
    const length = Math.max(2048, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.86 + white * 0.14;
      data[i] = white * 0.52 + last * 0.48;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(destination);
    source.start();
  }

  update(frame: AudioFrame, dt: number): void {
    this.lastFrame = frame;
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const wind = clamp(frame.windSpeed / 22, 0, 1);
    const speed = clamp(frame.speed / 8, 0, 1);
    const rough = clamp((frame.waveScale - 0.5) / 1.8, 0, 1);
    this.windGain?.gain.setTargetAtTime(0.018 + wind * 0.17, now, 0.12);
    this.waterGain?.gain.setTargetAtTime(0.02 + speed * 0.23 + rough * 0.035, now, 0.09);
    this.hullGain?.gain.setTargetAtTime(0.004 + rough * 0.028 + speed * 0.018, now, 0.18);
    this.rainGain?.gain.setTargetAtTime(frame.rain * 0.12, now, 0.13);
    this.windFilter?.frequency.setTargetAtTime(380 + wind * 1700, now, 0.18);
    this.waterFilter?.frequency.setTargetAtTime(430 + speed * 1300 + rough * 280, now, 0.12);

    this.creakClock -= dt;
    if (this.creakClock <= 0 && (rough > 0.28 || frame.sailLoad > 0.45)) {
      this.creakClock = 1.4 + Math.random() * 3.4;
      this.tone(92 + Math.random() * 42, 64 + Math.random() * 26, 0.13 + Math.random() * 0.14, 'triangle', 0.017 + rough * 0.018);
    }

    this.oarClock -= dt;
    if (frame.rowing > 0.2 && this.oarClock <= 0) {
      this.oarClock = 0.72 - frame.rowing * 0.16;
      this.tone(210, 96, 0.11, 'sine', 0.025 + frame.rowing * 0.02);
    }
  }

  impact(strength: number): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const gain = clamp(strength, 0, 1) * 0.07;
    this.tone(72, 42, 0.18, 'triangle', gain);
  }

  private tone(startFrequency: number, endFrequency: number, duration: number, type: OscillatorType, gainValue: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    const end = start + duration;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend().catch(() => {});
  }

  async resume(): Promise<void> {
    if (this.enabled && this.context?.state === 'suspended') await this.context.resume().catch(() => {});
  }

  async destroy(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.master = null;
    this.windGain = null;
    this.waterGain = null;
    this.hullGain = null;
    this.rainGain = null;
    this.windFilter = null;
    this.waterFilter = null;
    if (context && context.state !== 'closed') await context.close().catch(() => {});
  }
}
