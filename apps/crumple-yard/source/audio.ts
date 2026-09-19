type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export class VehicleAudio {
  private context: AudioContext | null = null;
  private engineGain: GainNode | null = null;
  private engineA: OscillatorNode | null = null;
  private engineB: OscillatorNode | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;

  setMuted(value: boolean) {
    this.muted = value;
    if (this.engineGain && this.context) {
      this.engineGain.gain.setTargetAtTime(value ? 0 : 0.035, this.context.currentTime, 0.04);
    }
  }

  async unlock() {
    const AudioCtor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioCtor) return;
    if (!this.context) {
      this.context = new AudioCtor();
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = this.muted ? 0 : 0.028;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 650;
      this.engineA = this.context.createOscillator();
      this.engineB = this.context.createOscillator();
      this.engineA.type = 'sawtooth';
      this.engineB.type = 'triangle';
      this.engineA.frequency.value = 46;
      this.engineB.frequency.value = 92;
      const gainA = this.context.createGain();
      const gainB = this.context.createGain();
      gainA.gain.value = 0.5;
      gainB.gain.value = 0.22;
      this.engineA.connect(gainA).connect(filter);
      this.engineB.connect(gainB).connect(filter);
      filter.connect(this.engineGain).connect(this.context.destination);
      this.engineA.start();
      this.engineB.start();

      const length = Math.floor(this.context.sampleRate * 0.34);
      this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let seed = 0x1234567;
      for (let i = 0; i < data.length; i += 1) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
      }
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  update(speedMps: number, throttle: number, engineHealth: number, temperature: number) {
    if (!this.context || !this.engineGain || !this.engineA || !this.engineB) return;
    const now = this.context.currentTime;
    const speed = Math.abs(speedMps);
    const base = 38 + speed * 3.2 + Math.abs(throttle) * 46;
    const stumble = engineHealth < 0.45 ? Math.sin(performance.now() * 0.021) * (1 - engineHealth) * 12 : 0;
    const heatSag = Math.max(0, temperature - 0.9) * 18;
    this.engineA.frequency.setTargetAtTime(Math.max(28, base + stumble - heatSag), now, 0.035);
    this.engineB.frequency.setTargetAtTime(Math.max(54, base * 2.03 + stumble * 0.8), now, 0.035);
    const volume = this.muted ? 0 : 0.018 + Math.min(0.035, speed * 0.0007) + Math.abs(throttle) * 0.018;
    this.engineGain.gain.setTargetAtTime(volume, now, 0.045);
  }

  impact(severity: number, material = 'hard') {
    if (!this.context || !this.noiseBuffer || this.muted || severity < 0.018) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = material === 'metal' ? 1.5 : material === 'soft' ? 0.7 : 1;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 120 + Math.min(1, severity) * 1180;
    filter.Q.value = material === 'metal' ? 2.8 : 0.72;
    const gain = this.context.createGain();
    const peak = Math.min(0.48, 0.04 + severity * 0.35);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06 + Math.min(0.22, severity * 0.15));
    source.connect(filter).connect(gain).connect(this.context.destination);
    source.start(now);
    source.stop(now + 0.28);
  }
}
