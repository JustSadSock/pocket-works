export class MyaloAudio {
  constructor(enabled = true) {
    this.context = null;
    this.enabled = Boolean(enabled);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  async unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      this.context = new AudioContextCtor();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  pluck(strength = 0.5, pitch = 1) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(150 * pitch, now);
    oscillator.frequency.exponentialRampToValueAtTime(72 * pitch, now + 0.12);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018 + strength * 0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 + strength * 0.12);
    oscillator.connect(filter).connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.34);
  }

  grab() {
    this.pluck(0.18, 1.7);
  }

  release(strength) {
    this.pluck(0.24 + strength * 0.7, 0.95 - strength * 0.18);
  }
}
