export class BroadcastAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private hum: OscillatorNode | null = null;
  private humGain: GainNode | null = null;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? 0.32 : 0;
  }

  isEnabled() { return this.enabled; }

  async unlock() {
    if (!this.context) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.context = new Ctx();
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.32 : 0;
      this.master.connect(this.context.destination);
      this.startHum();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  private startHum() {
    if (!this.context || !this.master || this.hum) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.value = 54;
    gain.gain.value = 0.014;
    osc.connect(gain).connect(this.master);
    osc.start();
    this.hum = osc;
    this.humGain = gain;
  }

  private tone(freq: number, duration = 0.08, type: OscillatorType = 'square', gainValue = 0.08, slide = 0) {
    if (!this.context || !this.master || !this.enabled) return;
    const t = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  shot() { this.tone(210 + Math.random()*35, 0.035, 'square', 0.028, 80); }
  jump() { this.tone(170, 0.08, 'triangle', 0.07, 210); }
  dash() { this.tone(95, 0.11, 'sawtooth', 0.06, 330); }
  hit() { this.tone(82 + Math.random()*25, 0.055, 'square', 0.045, -30); }
  impact() { this.tone(118 + Math.random()*34, 0.038, 'square', 0.038, -55); }
  phase() {
    this.tone(96, 0.20, 'sawtooth', 0.075, 260);
    setTimeout(() => this.tone(188, 0.16, 'square', 0.06, 420), 80);
  }
  hurt() { this.tone(130, 0.18, 'sawtooth', 0.11, -85); }
  parry() { this.tone(610, 0.11, 'triangle', 0.10, 620); }
  special() { this.tone(180, 0.24, 'sawtooth', 0.09, 760); }
  bossCue() { this.tone(74, 0.46, 'square', 0.10, 30); setTimeout(() => this.tone(112, 0.38, 'square', 0.08, 70), 170); }
  win() { [0, 130, 280, 430].forEach((d, i) => setTimeout(() => this.tone([220,330,440,660][i], 0.16, 'triangle', 0.08, 120), d)); }
  ui() { this.tone(460, 0.045, 'square', 0.035, 45); }
}
