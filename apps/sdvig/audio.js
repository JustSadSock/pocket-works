export class ShiftAudio {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
    this.master = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  async unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  tone(frequency, duration, { type = 'sine', gain = 0.22, endFrequency = null, delay = 0 } = {}) {
    if (!this.enabled || !this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  noise(duration = 0.12, gain = 0.08) {
    if (!this.enabled || !this.context || !this.master) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 840;
    filter.Q.value = 0.8;
    envelope.gain.setValueAtTime(gain, this.context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    source.start();
  }

  press(player = 1) {
    this.tone(player === 1 ? 146 : 174, 0.08, { type: 'square', gain: 0.12, endFrequency: player === 1 ? 122 : 146 });
  }

  shift(player = 1, ejected = false) {
    this.noise(0.1, 0.045);
    this.tone(player === 1 ? 196 : 233, 0.16, { type: 'triangle', gain: 0.17, endFrequency: player === 1 ? 130 : 155 });
    if (ejected) this.tone(82, 0.18, { type: 'sine', gain: 0.16, endFrequency: 52, delay: 0.07 });
  }

  invalid() {
    this.tone(96, 0.12, { type: 'square', gain: 0.13, endFrequency: 72 });
  }

  swap() {
    this.tone(160, 0.12, { type: 'triangle', gain: 0.14, endFrequency: 240 });
    this.tone(240, 0.12, { type: 'triangle', gain: 0.12, endFrequency: 160, delay: 0.06 });
  }

  warning() {
    this.tone(330, 0.08, { type: 'square', gain: 0.08 });
  }

  win(player = 1) {
    const base = player === 1 ? 196 : 233;
    [1, 1.25, 1.5, 2].forEach((ratio, index) => {
      this.tone(base * ratio, 0.28, { type: 'triangle', gain: 0.13, delay: index * 0.07 });
    });
  }
}
