import { clamp } from './core.js';

export class DuelAudio {
  constructor(storageNamespace) {
    this.storageNamespace = storageNamespace;
    this.enabled = localStorage.getItem(`${storageNamespace}:sound`) !== 'off';
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.lastWhoosh = 0;
    this.lastStep = 0;
  }

  async ensure() {
    if (!this.enabled) return;
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  createNoiseBuffer() {
    const length = Math.floor(this.context.sampleRate * 0.18);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.78 + white * 0.22;
      data[i] = last;
    }
    return buffer;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    localStorage.setItem(`${this.storageNamespace}:sound`, this.enabled ? 'on' : 'off');
    if (!this.enabled && this.context?.state === 'running') void this.context.suspend();
  }

  tone({ frequency = 220, frequencyEnd = frequency, duration = 0.1, gain = 0.12, type = 'sine' } = {}) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequencyEnd), now + duration);
    envelope.gain.setValueAtTime(Math.max(0.0001, gain), now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  noise({ duration = 0.08, gain = 0.12, highpass = 500, lowpass = 7000 } = {}) {
    if (!this.enabled || !this.context || this.context.state !== 'running' || !this.noiseBuffer) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const hp = this.context.createBiquadFilter();
    const lp = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this.noiseBuffer;
    hp.type = 'highpass';
    hp.frequency.value = highpass;
    lp.type = 'lowpass';
    lp.frequency.value = lowpass;
    envelope.gain.setValueAtTime(Math.max(0.0001, gain), now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(hp);
    hp.connect(lp);
    lp.connect(envelope);
    envelope.connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.01);
  }

  step(intensity = 0.5) {
    const now = performance.now();
    if (now - this.lastStep < 90) return;
    this.lastStep = now;
    const strength = clamp(intensity, 0, 1);
    this.noise({ duration: 0.055, gain: 0.05 + strength * 0.035, highpass: 70, lowpass: 900 });
    this.tone({ frequency: 86, frequencyEnd: 58, duration: 0.07, gain: 0.025 + strength * 0.02, type: 'triangle' });
  }

  whoosh(speed) {
    const now = performance.now();
    if (now - this.lastWhoosh < 150 || speed < 5.2) return;
    this.lastWhoosh = now;
    const strength = clamp((speed - 5.2) / 7, 0, 1);
    this.noise({ duration: 0.11 + strength * 0.08, gain: 0.035 + strength * 0.065, highpass: 900, lowpass: 6000 });
  }

  clash(intensity = 0.7) {
    const strength = clamp(intensity, 0, 1);
    this.tone({ frequency: 1750, frequencyEnd: 620, duration: 0.13, gain: 0.08 + strength * 0.09, type: 'square' });
    this.noise({ duration: 0.07, gain: 0.07 + strength * 0.07, highpass: 1800, lowpass: 9500 });
    navigator.vibrate?.(strength > 0.65 ? 18 : 9);
  }

  block(intensity = 0.7) {
    const strength = clamp(intensity, 0, 1);
    this.tone({ frequency: 410, frequencyEnd: 180, duration: 0.12, gain: 0.08 + strength * 0.07, type: 'triangle' });
    this.noise({ duration: 0.09, gain: 0.08 + strength * 0.06, highpass: 280, lowpass: 2400 });
    navigator.vibrate?.(strength > 0.65 ? 20 : 10);
  }

  hit(intensity = 0.7) {
    const strength = clamp(intensity, 0, 1);
    this.tone({ frequency: 120, frequencyEnd: 54, duration: 0.16, gain: 0.09 + strength * 0.09, type: 'sawtooth' });
    this.noise({ duration: 0.08, gain: 0.06 + strength * 0.06, highpass: 120, lowpass: 1800 });
    navigator.vibrate?.(strength > 0.5 ? 26 : 12);
  }
}
