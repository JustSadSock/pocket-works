import { clamp } from './core.js';

export class DesertAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.windGain = null;
    this.windFilter = null;
    this.gustGain = null;
    this.gustFilter = null;
    this.sandGain = null;
    this.sandFilter = null;
    this.noiseBuffer = null;
    this.gustPhase = 0;
    this.enabled = localStorage.getItem('pocket-works:sirocco:sound') !== 'off';
  }

  async ensure() {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  makeNoiseBuffer(seconds = 3) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      brown = brown * 0.965 + white * 0.035;
      data[i] = clamp(white * 0.42 + brown * 1.8, -1, 1);
    }
    return buffer;
  }

  loopNoise(filterType, frequency, q, gainValue) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = 0.92 + Math.random() * 0.14;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    return { source, filter, gain };
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.48;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.24;
    this.master.connect(compressor).connect(this.ctx.destination);

    this.noiseBuffer = this.makeNoiseBuffer(3.2);

    const wind = this.loopNoise('bandpass', 520, 0.42, 0.055);
    this.windGain = wind.gain;
    this.windFilter = wind.filter;

    const gust = this.loopNoise('lowpass', 290, 0.65, 0.018);
    this.gustGain = gust.gain;
    this.gustFilter = gust.filter;

    const sand = this.loopNoise('highpass', 1500, 0.5, 0.0001);
    this.sandGain = sand.gain;
    this.sandFilter = sand.filter;
  }

  update(speed, slope) {
    if (!this.ctx || !this.windGain) return;
    const now = this.ctx.currentTime;
    this.gustPhase += 0.013 + speed * 0.0015;
    const gust = 0.5 + 0.5 * Math.sin(this.gustPhase + Math.sin(this.gustPhase * 0.37) * 1.7);
    const speedNorm = clamp(speed / 3.5, 0, 1);
    const slopeNorm = clamp(slope / 0.65, 0, 1);

    this.windGain.gain.setTargetAtTime(0.038 + speedNorm * 0.036 + gust * 0.018, now, 0.22);
    this.windFilter.frequency.setTargetAtTime(440 + speedNorm * 260 + gust * 110, now, 0.30);
    this.gustGain.gain.setTargetAtTime(0.010 + gust * 0.035, now, 0.42);
    this.gustFilter.frequency.setTargetAtTime(210 + gust * 170, now, 0.36);
    this.sandGain.gain.setTargetAtTime(0.001 + speedNorm * 0.010 + slopeNorm * 0.016, now, 0.12);
    this.sandFilter.frequency.setTargetAtTime(1450 + speedNorm * 850, now, 0.16);
  }

  footstep(strength = 1) {
    if (!this.ctx || !this.noiseBuffer || !this.enabled) return;
    const now = this.ctx.currentTime;
    const pan = this.ctx.createStereoPanner?.();
    if (pan) pan.pan.value = (Math.random() - 0.5) * 0.28;

    const body = this.ctx.createBufferSource();
    body.buffer = this.noiseBuffer;
    body.playbackRate.value = 0.48 + Math.random() * 0.10;
    const bodyFilter = this.ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 430 + Math.random() * 130;
    const bodyGain = this.ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.11 * strength, now + 0.008);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    const grit = this.ctx.createBufferSource();
    grit.buffer = this.noiseBuffer;
    grit.playbackRate.value = 1.05 + Math.random() * 0.30;
    const gritFilter = this.ctx.createBiquadFilter();
    gritFilter.type = 'bandpass';
    gritFilter.frequency.value = 1550 + Math.random() * 650;
    gritFilter.Q.value = 0.75;
    const gritGain = this.ctx.createGain();
    gritGain.gain.setValueAtTime(0.0001, now);
    gritGain.gain.exponentialRampToValueAtTime(0.034 * strength, now + 0.004);
    gritGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

    const destination = pan || this.master;
    if (pan) pan.connect(this.master);
    body.connect(bodyFilter).connect(bodyGain).connect(destination);
    grit.connect(gritFilter).connect(gritGain).connect(destination);
    body.start(now, Math.random() * 1.4, 0.18);
    grit.start(now + 0.006, Math.random() * 1.4, 0.09);
    body.stop(now + 0.19);
    grit.stop(now + 0.11);
  }

  slide(strength = 0.5) {
    if (!this.ctx || !this.noiseBuffer || !this.enabled || strength < 0.08) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.82 + Math.random() * 0.18;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 920 + Math.random() * 320;
    filter.Q.value = 0.55;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035 * clamp(strength, 0, 1), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random() * 1.8, 0.20);
    source.stop(now + 0.22);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem('pocket-works:sirocco:sound', enabled ? 'on' : 'off');
    if (!enabled && this.master && this.ctx) this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
    else if (enabled) {
      void this.ensure();
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(0.48, this.ctx.currentTime, 0.05);
    }
  }
}
