import type { CrowState, V3 } from './flight';

type SoundEvent = 'flap' | 'step' | 'impact' | 'caw' | 'pickup' | 'drop' | 'eat' | 'water' | 'perch';
type Ambient = { gain: GainNode; filter: BiquadFilterNode; source: AudioBufferSourceNode; panner: PannerNode };

/** Quiet, entirely local soundscape. Audio starts only after the player's sound gesture. */
export class CrowAudio {
  enabled = true;
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private wind?: Ambient;
  private ambience: Ambient[] = [];
  private nodes = new Set<AudioNode>();
  private state?: CrowState;
  private previousFlap = 0;
  private stepTime = 0;
  private elapsed = 0;
  private nextBird = 7;
  private muted = false;
  private disposed = false;

  async unlock(): Promise<void> {
    if (this.disposed || !this.enabled) return;
    if (!this.context) this.initialize();
    if (!this.context) return;
    const context=this.context;
    try { await context.resume(); } catch { return; }
    if(this.disposed||this.context!==context||!this.enabled)return;
    this.muted = false;
    this.master?.gain.setTargetAtTime(0.7, context.currentTime, 0.15);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(enabled && !this.muted ? 0.7 : 0, this.context.currentTime, 0.1);
    }
  }

  private initialize(): void {
    const AudioCtor = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = this.context = new AudioCtor();
    const master = this.master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -15;
    limiter.knee.value = 15;
    limiter.ratio.value = 4;
    master.connect(limiter); limiter.connect(ctx.destination);
    this.nodes.add(master); this.nodes.add(limiter);
    // A long, shared pink-ish buffer avoids noisy seamless short-loop repetition.
    const buffer = this.noise = ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let low = 0, mid = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      low = 0.985 * low + 0.015 * white;
      mid = 0.86 * mid + 0.14 * white;
      data[i] = low * 2.6 + mid * 0.8 + white * 0.09;
    }
    this.wind = this.loop({ x: 0, y: 0, z: 0 }, 'lowpass', 1200, 0);
    const water = this.loop({ x: 0, y: -.38, z: 15 }, 'bandpass', 1800, 0.095);
    water.filter.Q.value = 0.4;
    const city = this.loop({ x: 35, y: 0, z: 25 }, 'lowpass', 310, 0.08);
    const leaves = this.loop({ x: -7, y: 7, z: 0 }, 'highpass', 1600, 0.047);
    this.ambience = [water, city, leaves];
  }

  private panner(position: V3): PannerNode {
    const p = this.context!.createPanner();
    // Equalpower is considerably cheaper than HRTF for multiple environmental loops.
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
    p.refDistance = 9; p.maxDistance = 140; p.rolloffFactor = 1.1;
    this.place(p, position);
    return p;
  }

  private place(panner: PannerNode, position: V3): void {
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
  }

  private loop(position: V3, type: BiquadFilterType, frequency: number, volume: number): Ambient {
    const ctx = this.context!;
    const source = ctx.createBufferSource(); source.buffer = this.noise!; source.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.3;
    const gain = ctx.createGain(); gain.gain.value = volume;
    const panner = this.panner(position);
    source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(this.master!);
    source.start(0, Math.random() * 6);
    [source, filter, gain, panner].forEach(node => this.nodes.add(node));
    return { source, filter, gain, panner };
  }

  update(state: CrowState, dt: number): void {
    this.state = state;
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.enabled || this.muted) return;
    const t = ctx.currentTime;
    const listener = ctx.listener;
    const pos = state.position;
    const cp = Math.cos(state.pitch);
    const forward = { x: Math.sin(state.yaw) * cp, y: Math.sin(state.pitch), z: Math.cos(state.yaw) * cp };
    if (listener.positionX) {
      listener.positionX.value = pos.x; listener.positionY.value = pos.y; listener.positionZ.value = pos.z;
      listener.forwardX.value = forward.x; listener.forwardY.value = forward.y; listener.forwardZ.value = forward.z;
      listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
    } else {
      listener.setPosition(pos.x, pos.y, pos.z);
      listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
    if (this.wind) {
      const speed = Math.min(1, state.speed / 26);
      const dive = state.mode === 'dive' ? 0.025 : 0;
      this.place(this.wind.panner, pos);
      this.wind.gain.gain.setTargetAtTime(0.011 + speed * speed * 0.24 + dive, t, 0.15);
      this.wind.filter.frequency.setTargetAtTime(480 + speed * 3900, t, 0.2);
    }
    this.elapsed += dt;
    this.ambience[2]?.gain.gain.setTargetAtTime(0.04 + Math.sin(this.elapsed * 0.7) * 0.013, t, 0.3);
    if (state.flap > 0.15 && state.flapPhase < this.previousFlap && !state.grounded) this.event('flap', pos);
    this.previousFlap = state.flapPhase;
    this.stepTime -= dt;
    if (state.grounded && state.speed > 0.3 && this.stepTime <= 0) {
      this.event('step', pos);
      this.stepTime = Math.max(0.16, 0.42 - state.speed * 0.045);
    }
    if (this.elapsed >= this.nextBird) {
      this.event('caw', { x: -24 + Math.random() * 45, y: 8 + Math.random() * 14, z: 10 + Math.random() * 34 });
      this.nextBird = this.elapsed + 11 + Math.random() * 15;
    }
  }

  event(type: SoundEvent, position?: V3): void {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.enabled || this.muted || !this.noise) return;
    const p = position || this.state?.position || { x: 0, y: 0, z: 0 };
    if (type === 'caw') { this.caw(p); return; }
    const settings: Record<Exclude<SoundEvent, 'caw'>, [number, number, number, BiquadFilterType]> = {
      flap: [0.19, 620, 0.25, 'bandpass'], step: [0.055, 2900, 0.17, 'highpass'],
      impact: [0.18, 240, 0.45, 'lowpass'], pickup: [0.07, 1400, 0.13, 'bandpass'],
      drop: [0.08, 950, 0.18, 'bandpass'], eat: [0.12, 3100, 0.2, 'highpass'],
      water: [0.55, 1700, 0.45, 'bandpass'], perch: [0.17, 1650, 0.19, 'bandpass'],
    };
    const [duration, frequency, volume, filterType] = settings[type];
    const t = ctx.currentTime;
    const source = ctx.createBufferSource(); source.buffer = this.noise; source.playbackRate.value = 0.85 + Math.random() * 0.3;
    const filter = ctx.createBiquadFilter(); filter.type = filterType; filter.frequency.value = frequency * (0.82 + Math.random() * 0.36); filter.Q.value = 0.5;
    if (type === 'flap') filter.frequency.exponentialRampToValueAtTime(220, t + duration);
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const panner = this.panner(p);
    source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(this.master!);
    [source, filter, gain, panner].forEach(node => this.nodes.add(node));
    source.start(t, Math.random() * 5, duration + 0.03);
    source.onended = () => [source, filter, gain, panner].forEach(node => { node.disconnect(); this.nodes.delete(node); });
  }

  private caw(position: V3): void {
    const ctx = this.context!, t = ctx.currentTime;
    const duration = 0.26 + Math.random() * 0.13;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const base = 290 + Math.random() * 75;
    osc.frequency.setValueAtTime(base * 0.8, t);
    osc.frequency.exponentialRampToValueAtTime(base, t + 0.04);
    osc.frequency.exponentialRampToValueAtTime(base * 0.72, t + duration);
    const roughness = ctx.createOscillator(); roughness.frequency.value = 37 + Math.random() * 13;
    const roughGain = ctx.createGain(); roughGain.gain.value = 31;
    roughness.connect(roughGain); roughGain.connect(osc.frequency);
    const formant = ctx.createBiquadFilter(); formant.type = 'bandpass'; formant.Q.value = 1.8;
    formant.frequency.setValueAtTime(1250, t); formant.frequency.exponentialRampToValueAtTime(870, t + duration);
    const air = ctx.createBufferSource(); air.buffer = this.noise!;
    const airGain = ctx.createGain(); airGain.gain.value = 0.22;
    const envelope = ctx.createGain(); envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(0.14, t + 0.025);
    envelope.gain.setTargetAtTime(0.085, t + 0.07, 0.08);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const panner = this.panner(position);
    osc.connect(formant); air.connect(airGain); airGain.connect(formant);
    formant.connect(envelope); envelope.connect(panner); panner.connect(this.master!);
    const nodes = [osc, roughness, roughGain, formant, air, airGain, envelope, panner];
    nodes.forEach(node => this.nodes.add(node));
    osc.start(t); roughness.start(t); air.start(t, Math.random() * 5);
    osc.stop(t + duration + 0.02); roughness.stop(t + duration + 0.02); air.stop(t + duration + 0.02);
    osc.onended = () => nodes.forEach(node => { node.disconnect(); this.nodes.delete(node); });
  }

  pause(): void {
    this.muted = true;
    if (this.context) void this.context.suspend().catch(() => {});
  }

  dispose(): void {
    this.disposed = true;
    this.nodes.forEach(node => node.disconnect()); this.nodes.clear();
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined; this.noise = undefined; this.wind = undefined; this.ambience = [];
  }
}
