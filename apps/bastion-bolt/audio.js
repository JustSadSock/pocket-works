export class SiegeAudio {
  constructor(isEnabled = () => true) { this.ctx = null; this.master = null; this.isEnabled = isEnabled; }
  ensure() {
    if (!this.isEnabled()) return false;
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = .24;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }
  tone(freq, duration, type = 'sine', gain = .2, slide = 0) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime, oscillator = this.ctx.createOscillator(), envelope = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, t);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    envelope.gain.setValueAtTime(.001, t);
    envelope.gain.exponentialRampToValueAtTime(gain, t + .02);
    envelope.gain.exponentialRampToValueAtTime(.001, t + duration);
    oscillator.connect(envelope); envelope.connect(this.master); oscillator.start(t); oscillator.stop(t + duration + .03);
  }
  noise(duration = .25, gain = .18, low = 700) {
    if (!this.ensure()) return;
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), envelope = this.ctx.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = low; envelope.gain.value = gain;
    source.connect(filter); filter.connect(envelope); envelope.connect(this.master); source.start();
  }
  creak() { this.tone(92, .42, 'sawtooth', .09, -32); this.tone(145, .3, 'triangle', .05, -50); }
  fire() { this.tone(185, .24, 'sawtooth', .24, -145); this.noise(.2, .15, 2200); }
  impact(power = 1, wood = false) { this.noise(.55, .22 * power, wood ? 680 : 420); this.tone(wood ? 78 : 46, .5, 'sine', .22 * power, -20); }
}
