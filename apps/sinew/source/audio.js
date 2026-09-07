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
      this.context = new AudioContextClass({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }

    // iOS Safari may report "interrupted" instead of "suspended" after app switches,
    // lock-screen transitions or PWA lifecycle changes. Resume for every non-running state.
    if (this.context.state !== 'running') {
      try { await this.context.resume(); } catch {}
    }
    if (this.context.state !== 'running') return;

    // Prime the output from the user gesture. A one-frame silent source avoids the common
    // iOS case where the graph exists but the hardware output route is still asleep.
    const buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.start();
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
    this.noise({ duration: 0.06, gain: 0.075 + strength * 0.05, highpass: 65, lowpass: 1000 });
    this.tone({ frequency: 92, frequencyEnd: 54, duration: 0.08, gain: 0.04 + strength * 0.03, type: 'triangle' });
  }

  whoosh(speed) {
    const now = performance.now();
    if (now - this.lastWhoosh < 135 || speed < 4.7) return;
    this.lastWhoosh = now;
    const strength = clamp((speed - 4.7) / 7, 0, 1);
    this.noise({ duration: 0.12 + strength * 0.09, gain: 0.055 + strength * 0.095, highpass: 750, lowpass: 6500 });
  }

  clash(intensity = 0.7) {
    const strength = clamp(intensity, 0, 1);
    this.tone({ frequency: 1850, frequencyEnd: 610, duration: 0.14, gain: 0.12 + strength * 0.12, type: 'square' });
    this.tone({ frequency: 790, frequencyEnd: 330, duration: 0.18, gain: 0.055 + strength * 0.055, type: 'triangle' });
    this.noise({ duration: 0.085, gain: 0.10 + strength * 0.09, highpass: 1500, lowpass: 9800 });
    navigator.vibrate?.(strength > 0.65 ? 18 : 9);
  }

  block(intensity = 0.7) {
    const strength = clamp(intensity, 0, 1);
    this.tone({ frequency: 430, frequencyEnd: 165, duration: 0.14, gain: 0.12 + strength * 0.10, type: 'triangle' });
    this.noise({ duration: 0.105, gain: 0.11 + strength * 0.09, highpass: 240, lowpass: 2600 });
    navigator.vibrate?.(strength > 0.65 ? 20 : 10);
  }

  hit(intensity = 0.7) {
    const strength = clamp(intensity, 0, 1);
    this.tone({ frequency: 126, frequencyEnd: 48, duration: 0.18, gain: 0.13 + strength * 0.12, type: 'sawtooth' });
    this.noise({ duration: 0.095, gain: 0.09 + strength * 0.09, highpass: 90, lowpass: 1900 });
    navigator.vibrate?.(strength > 0.5 ? 26 : 12);
  }
}
