import { clamp } from './core';

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
  private waveClock = 0;
  private sheetClock = 0;

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
    const previous = this.lastFrame;
    this.lastFrame = frame;
    if (!this.enabled || !this.context || this.context.state !== 'running') return;

    const now = this.context.currentTime;
    const wind = clamp(frame.windSpeed / 22, 0, 1);
    const speed = clamp(frame.speed / 8, 0, 1);
    const rough = clamp((frame.waveScale - 0.5) / 1.8, 0, 1);
    const load = clamp(frame.sailLoad, 0, 1);
    this.windGain?.gain.setTargetAtTime(0.016 + wind * 0.17 + load * 0.018, now, 0.12);
    this.waterGain?.gain.setTargetAtTime(0.018 + speed * 0.24 + rough * 0.045, now, 0.09);
    this.hullGain?.gain.setTargetAtTime(0.004 + rough * 0.032 + speed * 0.022 + load * 0.012, now, 0.18);
    this.rainGain?.gain.setTargetAtTime(frame.rain * 0.12, now, 0.13);
    this.windFilter?.frequency.setTargetAtTime(360 + wind * 1700 + load * 220, now, 0.18);
    this.waterFilter?.frequency.setTargetAtTime(390 + speed * 1420 + rough * 330, now, 0.12);

    this.creakClock -= dt;
    this.sheetClock -= dt;
    this.oarClock -= dt;
    this.waveClock -= dt;

    if (this.creakClock <= 0 && (rough > 0.20 || load > 0.30)) {
      this.creakClock = 0.85 + Math.random() * (2.7 - load * 1.15);
      const tension = Math.max(rough * 0.65, load);
      this.tone(78 + Math.random() * 50, 49 + Math.random() * 25, 0.16 + Math.random() * 0.20, 'triangle', 0.012 + tension * 0.030);
    }

    const unloading = previous.sailLoad - frame.sailLoad;
    if (this.sheetClock <= 0 && wind > 0.18 && unloading > 0.10) {
      this.sheetClock = 0.22 + Math.random() * 0.28;
      this.noiseBurst(0.075 + unloading * 0.12, 0.018 + unloading * 0.075, 520, 3100);
      this.tone(155, 88, 0.085, 'triangle', 0.009 + unloading * 0.025);
    }

    // One audible oar event per slow physical stroke instead of the old rapid metronome.
    if (frame.rowing > 0.18 && this.oarClock <= 0) {
      this.oarClock = 1.72 - clamp(frame.rowing, 0, 1) * 0.30;
      this.tone(178, 92, 0.12, 'sine', 0.018 + frame.rowing * 0.022);
      this.noiseBurst(0.15, 0.012 + frame.rowing * 0.020, 180, 1050);
    }

    if (this.waveClock <= 0 && rough > 0.30 && speed > 0.16) {
      this.waveClock = 0.82 + Math.random() * (1.9 - rough * 0.65);
      const hit = clamp(rough * 0.52 + speed * 0.48, 0, 1);
      this.tone(64 + Math.random() * 16, 37, 0.20 + hit * 0.10, 'triangle', 0.012 + hit * 0.030);
      this.noiseBurst(0.13 + hit * 0.10, 0.010 + hit * 0.022, 70, 720);
    }
  }

  impact(strength: number): void {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const amount = clamp(strength, 0, 1);
    this.tone(70, 36, 0.21 + amount * 0.08, 'triangle', amount * 0.075);
    this.noiseBurst(0.16 + amount * 0.10, 0.012 + amount * 0.045, 55, 680);
  }

  private noiseBurst(duration: number, gainValue: number, lowFrequency: number, highFrequency: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== 'running') return;
    const length = Math.max(128, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let low = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      low = low * 0.78 + white * 0.22;
      data[i] = white * 0.54 + low * 0.46;
    }
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const gain = context.createGain();
    highpass.type = 'highpass';
    highpass.frequency.value = Math.max(10, lowFrequency);
    lowpass.type = 'lowpass';
    lowpass.frequency.value = Math.max(lowFrequency + 20, highFrequency);
    const start = context.currentTime;
    const end = start + duration;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + Math.min(0.018, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.buffer = buffer;
    source.connect(highpass).connect(lowpass).connect(gain).connect(master);
    source.start(start);
    source.stop(end + 0.01);
    source.addEventListener('ended', () => {
      source.disconnect(); highpass.disconnect(); lowpass.disconnect(); gain.disconnect();
    }, { once: true });
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
      oscillator.disconnect(); gain.disconnect();
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
