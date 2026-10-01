type ToneShape = OscillatorType;

class AudioDirector {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: { noise: AudioBufferSourceNode; drone: OscillatorNode; gain: GainNode } | null = null;
  private enabled = true;

  setEnabled(value: boolean) {
    this.enabled = value;
    if (this.master) this.master.gain.value = value ? 0.48 : 0;
  }

  async unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.48;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (!this.ambience) this.startAmbience();
  }

  private osc(freq: number, duration: number, gain: number, shape: ToneShape = 'sine', slide = 1) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = shape;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + duration);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  private noise(duration: number, gain: number, cutoff: number) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    amp.gain.value = gain;
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start();
  }

  private startAmbience() {
    if (!this.ctx || !this.master || this.ambience) return;
    const seconds = 4;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    let drift = 0;
    for (let i = 0; i < channel.length; i += 1) {
      drift = drift * 0.995 + (Math.random() * 2 - 1) * 0.02;
      channel[i] = drift;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 540;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.10;
    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 41;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.018;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    drone.connect(droneGain);
    droneGain.connect(this.master);
    noise.start();
    drone.start();
    this.ambience = { noise, drone, gain };
  }

  ui() { this.osc(620, 0.045, 0.035, 'triangle', 0.72); }
  step() { this.noise(0.04, 0.018, 520); }
  swing() { this.noise(0.12, 0.09, 1500); this.osc(120, 0.08, 0.025, 'triangle', 0.55); }
  hit() { this.noise(0.09, 0.16, 880); this.osc(72, 0.12, 0.08, 'sine', 0.68); }
  block() { this.osc(390, 0.16, 0.05, 'square', 0.48); this.osc(860, 0.08, 0.018, 'triangle', 0.52); }
  door() { this.noise(0.45, 0.08, 320); this.osc(58, 0.42, 0.055, 'sine', 0.72); }
  pickup() { this.osc(440, 0.18, 0.025, 'triangle', 1.45); this.osc(660, 0.25, 0.018, 'sine', 1.2); }
  oath() { this.osc(92, 0.75, 0.075, 'sine', 1.03); this.osc(184, 0.64, 0.025, 'triangle', 0.98); }
  whisper() { this.noise(0.55, 0.045, 1100); this.osc(154, 0.55, 0.012, 'sine', 0.82); }
}

export const audio = new AudioDirector();
