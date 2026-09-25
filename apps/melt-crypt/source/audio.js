export class CryptAudio {
  constructor(enabled = true) {
    this.enabled = Boolean(enabled);
    this.ctx = null;
    this.master = null;
    this.droneA = null;
    this.droneB = null;
    this.droneGain = null;
    this.filter = null;
  }

  async ensure() {
    if (!this.enabled) return false;
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 460;
      filter.Q.value = 0.7;
      filter.connect(master);

      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.025;
      droneGain.connect(filter);

      const a = ctx.createOscillator();
      const b = ctx.createOscillator();
      a.type = 'sawtooth';
      b.type = 'triangle';
      a.frequency.value = 43;
      b.frequency.value = 64.5;
      b.detune.value = 7;
      a.connect(droneGain);
      b.connect(droneGain);
      a.start();
      b.start();

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 18;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();

      this.ctx = ctx;
      this.master = master;
      this.droneA = a;
      this.droneB = b;
      this.droneGain = droneGain;
      this.filter = filter;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return true;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (this.enabled) void this.ensure();
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.enabled ? 0.18 : 0.0001, this.ctx.currentTime, 0.03);
  }

  setFloor(floor) {
    if (!this.ctx || !this.droneA || !this.droneB) return;
    const now = this.ctx.currentTime;
    const root = 38 + (floor % 7) * 2.7;
    this.droneA.frequency.setTargetAtTime(root, now, 0.7);
    this.droneB.frequency.setTargetAtTime(root * (1.47 + (floor % 3) * 0.02), now, 0.7);
    this.filter.frequency.setTargetAtTime(390 + floor * 13, now, 0.7);
  }

  tone(kind = 'shot', strength = 1) {
    if (!this.enabled) return;
    void this.ensure().then((ok) => {
      if (!ok || !this.ctx || !this.master) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      const presets = {
        shot: ['square', 230, 82, 0.09, 0.10],
        hit: ['sawtooth', 92, 42, 0.12, 0.08],
        hurt: ['square', 74, 31, 0.18, 0.13],
        loot: ['triangle', 330, 720, 0.20, 0.09],
        dash: ['sine', 170, 58, 0.16, 0.08],
        gate: ['triangle', 120, 510, 0.42, 0.10],
        drink: ['sine', 280, 108, 0.32, 0.08],
        death: ['sawtooth', 110, 24, 0.8, 0.12],
        blink: ['triangle', 620, 210, 0.14, 0.07]
      };
      const p = presets[kind] || presets.shot;
      osc.type = p[0];
      osc.frequency.setValueAtTime(p[1], now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, p[2]), now + p[3]);
      filter.type = 'lowpass';
      filter.frequency.value = kind === 'shot' ? 1800 : 1100;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.002, p[4] * strength), now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + p[3]);
      osc.connect(filter).connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + p[3] + 0.03);
    });
  }

  setDanger(value) {
    if (!this.ctx || !this.droneGain || !this.filter) return;
    const now = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(this.enabled ? 0.02 + Math.min(1, value) * 0.025 : 0.0001, now, 0.18);
    this.filter.Q.setTargetAtTime(0.65 + Math.min(1, value) * 2.2, now, 0.18);
  }

  suspend() {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }
}
