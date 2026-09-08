export class FootstepAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;

  constructor(public enabled: boolean) {}

  async unlock(): Promise<void> {
    if (!this.enabled) return;
    if (!this.context) {
      const webkit = (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const AudioCtor = window.AudioContext || webkit;
      if (!AudioCtor) return;
      this.context = new AudioCtor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.48;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(enabled ? 0.48 : 0.0001, this.context.currentTime, 0.035);
    }
  }

  step(intensity: number, side: number): void {
    if (!this.enabled || !this.context || !this.master || this.context.state !== 'running') return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const duration = 0.11;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.7);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.playbackRate.value = 0.9 + Math.random() * 0.16 + intensity * 0.08;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 145 + intensity * 205 + side * 12;
    filter.Q.value = 0.68;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055 + intensity * 0.095, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(filter).connect(gain).connect(this.master);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(75 + intensity * 10 + side * 2, now);
    thump.frequency.exponentialRampToValueAtTime(43, now + 0.075);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.045 + intensity * 0.052, now + 0.004);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);
    thump.connect(thumpGain).connect(this.master);
    noise.start(now); noise.stop(now + duration);
    thump.start(now); thump.stop(now + 0.1);
  }
}
