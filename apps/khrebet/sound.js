function createNoiseBuffer(context, seconds = 2) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.84 + white * 0.16;
    channel[index] = previous * 0.72 + white * 0.28;
  }
  return buffer;
}

export class WindAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.windGain = null;
    this.windFilter = null;
    this.windSource = null;
    this.enabled = true;
    this.unlocked = false;
    this.running = false;
    this.lastEvent = 0;
    document.addEventListener('visibilitychange', () => {
      if (!this.context) return;
      if (document.hidden) this.context.suspend().catch(() => {});
      else if (this.unlocked && this.enabled) this.context.resume().catch(() => {});
    });
  }

  async unlock() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      this.context = new AudioContextClass({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.72 : 0;
      this.master.connect(this.context.destination);

      this.windSource = this.context.createBufferSource();
      this.windSource.buffer = createNoiseBuffer(this.context, 2.4);
      this.windSource.loop = true;
      this.windFilter = this.context.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 620;
      this.windFilter.Q.value = 0.56;
      this.windGain = this.context.createGain();
      this.windGain.gain.value = 0;
      this.windSource.connect(this.windFilter).connect(this.windGain).connect(this.master);
      this.windSource.start();
    }
    try {
      await this.context.resume();
      this.unlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.master || !this.context) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(this.enabled ? 0.72 : 0, this.context.currentTime, 0.035);
  }

  setRunning(running) {
    this.running = Boolean(running);
  }

  update(speed, folded, flowing) {
    if (!this.context || !this.windGain || !this.windFilter) return;
    const now = this.context.currentTime;
    const speedAmount = Math.max(0, Math.min(1, (speed - 18) / 34));
    const targetGain = this.running && this.enabled ? 0.025 + speedAmount * 0.11 + (flowing ? 0.055 : 0) : 0;
    const frequency = 380 + speedAmount * 1380 + (folded ? 260 : 0) + (flowing ? 420 : 0);
    this.windGain.gain.setTargetAtTime(targetGain, now, 0.08);
    this.windFilter.frequency.setTargetAtTime(frequency, now, 0.09);
    this.windFilter.Q.setTargetAtTime(flowing ? 0.9 : 0.56, now, 0.11);
  }

  tone(options = {}) {
    if (!this.context || !this.enabled || !this.unlocked) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = options.type || 'sine';
    oscillator.frequency.setValueAtTime(options.from || 440, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, options.to || options.from || 440), now + (options.duration || 0.18));
    filter.type = 'lowpass';
    filter.frequency.value = options.filter || 3600;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.gain || 0.08, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (options.duration || 0.18));
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + (options.duration || 0.18) + 0.04);
  }

  event(type, intensity = 1) {
    if (!this.context || !this.enabled || !this.unlocked) return;
    const now = performance.now();
    if (type === 'near' && now - this.lastEvent < 90) return;
    this.lastEvent = now;
    if (type === 'ui') {
      this.tone({ from: 250, to: 320, duration: 0.07, gain: 0.025, type: 'triangle' });
    } else if (type === 'gate') {
      this.tone({ from: 510, to: 920, duration: 0.19, gain: 0.075, type: 'triangle' });
      window.setTimeout(() => this.tone({ from: 760, to: 1120, duration: 0.13, gain: 0.043, type: 'sine' }), 54);
    } else if (type === 'near') {
      this.tone({ from: 190 + intensity * 50, to: 430 + intensity * 120, duration: 0.14, gain: 0.055, type: 'sawtooth', filter: 1250 });
    } else if (type === 'hit') {
      this.tone({ from: 115, to: 34, duration: 0.46, gain: 0.17, type: 'sawtooth', filter: 760 });
      this.tone({ from: 62, to: 27, duration: 0.58, gain: 0.13, type: 'sine', filter: 480 });
    } else if (type === 'flow') {
      this.tone({ from: 180, to: 780, duration: 0.62, gain: 0.09, type: 'sawtooth', filter: 2100 });
      window.setTimeout(() => this.tone({ from: 390, to: 1280, duration: 0.44, gain: 0.055, type: 'triangle' }), 80);
    } else if (type === 'fail') {
      this.tone({ from: 270, to: 72, duration: 0.7, gain: 0.1, type: 'triangle', filter: 1100 });
    }
  }
}
