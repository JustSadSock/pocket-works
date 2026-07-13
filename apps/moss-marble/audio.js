export class AudioGarden {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.ambientTimer = 0;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled && this.master) this.master.gain.setTargetAtTime(0, this.context.currentTime, .04);
    if (this.enabled && this.master) this.master.gain.setTargetAtTime(.42, this.context.currentTime, .08);
  }

  async unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.context = new Ctx();
      this.master = this.context.createGain();
      this.master.gain.value = .42;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume().catch(() => {});
  }

  tone({ frequency = 220, end = frequency, duration = .08, gain = .05, type = 'sine', when = 0 }) {
    if (!this.enabled || !this.context || !this.master) return;
    const t = this.context.currentTime + when;
    const osc = this.context.createOscillator();
    const amp = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    amp.gain.setValueAtTime(.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), t + .008);
    amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(amp).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + .02);
  }

  noise({ duration = .08, gain = .025, cutoff = 1100 }) {
    if (!this.enabled || !this.context || !this.master) return;
    const sampleCount = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    amp.gain.value = gain;
    source.buffer = buffer;
    source.connect(filter).connect(amp).connect(this.master);
    source.start();
  }

  ui() {
    this.tone({ frequency: 420, end: 520, duration: .055, gain: .026, type: 'triangle' });
  }

  strike(power) {
    this.noise({ duration: .035, gain: .024 + power * .02, cutoff: 900 + power * 1300 });
    this.tone({ frequency: 130 + power * 95, end: 90, duration: .11, gain: .055 + power * .035, type: 'triangle' });
  }

  collision(material, speed) {
    const strength = Math.min(1, speed / 900);
    const map = { glass: 780, brass: 620, stone: 230, cup: 410, sugar: 500, spoon: 560, wood: 155, pot: 320 };
    const f = map[material] || 180;
    this.tone({ frequency: f, end: Math.max(50, f * .58), duration: .055 + strength * .055, gain: .022 + strength * .045, type: material === 'glass' || material === 'brass' ? 'sine' : 'triangle' });
  }

  water() {
    this.noise({ duration: .32, gain: .05, cutoff: 680 });
    this.tone({ frequency: 190, end: 70, duration: .34, gain: .035, type: 'sine' });
  }

  tunnel() {
    this.tone({ frequency: 260, end: 740, duration: .25, gain: .04, type: 'sine' });
    this.tone({ frequency: 520, end: 310, duration: .2, gain: .02, type: 'triangle', when: .08 });
  }

  cup(perfect = false) {
    [0, .09, .19].forEach((when, i) => this.tone({ frequency: [392, 523, perfect ? 784 : 659][i], end: [430, 560, perfect ? 840 : 710][i], duration: .24, gain: .045, type: 'sine', when }));
  }

  ambientTick(dt) {
    if (!this.enabled || !this.context) return;
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 2.8 + Math.random() * 4.6;
    const base = 650 + Math.random() * 260;
    this.tone({ frequency: base, end: base * 1.12, duration: .45, gain: .006, type: 'sine' });
  }

  suspend() {
    if (this.context?.state === 'running') this.context.suspend().catch(() => {});
  }
}
