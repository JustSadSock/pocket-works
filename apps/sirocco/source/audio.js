import { clamp } from './core.js';

export class DesertAudio {
  constructor() {
    this.ctx = null;
    this.windGain = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = localStorage.getItem('pocket-works:sirocco:sound') !== 'off';
  }

  async ensure() {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);

    const length = Math.floor(this.ctx.sampleRate * 2);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      prev = prev * 0.82 + white * 0.18;
      data[i] = prev;
    }
    this.noiseBuffer = buffer;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 620;
    filter.Q.value = 0.5;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.055;
    source.connect(filter).connect(this.windGain).connect(this.master);
    source.start();
  }

  update(speed, slope) {
    if (!this.windGain || !this.ctx) return;
    const target = 0.045 + clamp(speed / 3.5, 0, 1) * 0.035 + clamp(slope / 0.65, 0, 1) * 0.012;
    this.windGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.18);
  }

  footstep(strength = 1) {
    if (!this.ctx || !this.noiseBuffer || !this.enabled) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 0.58 + Math.random() * 0.12;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 540 + Math.random() * 120;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12 * strength, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random() * 0.8, 0.14);
    source.stop(now + 0.16);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem('pocket-works:sirocco:sound', enabled ? 'on' : 'off');
    if (!enabled && this.master && this.ctx) this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
    else if (enabled) {
      this.ensure();
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(0.42, this.ctx.currentTime, 0.05);
    }
  }
}
