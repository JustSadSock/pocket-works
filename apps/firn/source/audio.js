export class MountainAudio {
  constructor() {
    this.enabled = localStorage.getItem('pocket-works:firn:sound') !== 'off';
    this.ctx = null;
    this.windGain = null;
    this.windFilter = null;
    this.noiseBuffer = null;
  }

  async ensure() {
    if (!this.enabled || this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.noiseBuffer = this.makeNoiseBuffer(2.2);
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer; source.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 420; this.windFilter.Q.value = 0.38;
    this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0.035;
    source.connect(this.windFilter).connect(this.windGain).connect(this.ctx.destination);
    source.start();
  }

  makeNoiseBuffer(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.15; data[i] = last; }
    return buffer;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    localStorage.setItem('pocket-works:firn:sound', this.enabled ? 'on' : 'off');
    if (!this.enabled) this.ctx?.suspend?.(); else { void this.ensure().then(() => this.ctx?.resume?.()); }
  }

  update(speed, wind, sliding, bracing) {
    if (!this.ctx || !this.enabled || !this.windGain) return;
    const now = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.018 + wind * 0.075 + Math.min(0.02, speed * 0.004), now, 0.18);
    this.windFilter.frequency.setTargetAtTime(260 + wind * 730 + sliding * 220, now, 0.2);
    this.windFilter.Q.setTargetAtTime(0.3 + bracing * 0.18, now, 0.2);
  }

  footstep(powder, hardness, intensity = 1) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource(); source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass';
    filter.frequency.value = 420 + hardness * 1200; filter.Q.value = 0.7 + hardness * 1.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime((0.035 + powder * 0.035) * intensity, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085 + powder * 0.06);
    source.connect(filter).connect(gain).connect(this.ctx.destination);
    source.start(now, Math.random() * 0.8, 0.18);
    source.stop(now + 0.22);
  }
}
