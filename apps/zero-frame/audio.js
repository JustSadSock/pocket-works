const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class HauntAudio {
  constructor(enabled = true) {
    this.enabled = Boolean(enabled);
    this.context = null;
    this.master = null;
    this.ambient = null;
    this.noiseBuffer = null;
    this.threat = 0;
  }

  async unlock() {
    if (!this.enabled) return false;
    if (!this.context) this.createContext();
    if (this.context.state === 'suspended') await this.context.resume();
    this.ensureAmbience();
    return true;
  }

  createContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.enabled ? .28 : 0;
    this.master.connect(this.context.destination);
    this.noiseBuffer = this.createNoiseBuffer(2.2);
  }

  createNoiseBuffer(seconds = 1) {
    if (!this.context) return null;
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * .92 + white * .08;
      data[i] = last;
    }
    return buffer;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(this.enabled ? .28 : 0, this.context.currentTime, .035);
    }
    if (this.enabled) this.unlock().catch(() => {});
  }

  setThreat(value) {
    this.threat = clamp(value, 0, 100);
    if (!this.ambient || !this.context) return;
    const now = this.context.currentTime;
    this.ambient.drone.frequency.setTargetAtTime(36 + this.threat * .12, now, .8);
    this.ambient.pulse.frequency.setTargetAtTime(.52 + this.threat * .004, now, .9);
    this.ambient.gain.gain.setTargetAtTime(.025 + this.threat * .00025, now, .8);
  }

  ensureAmbience() {
    if (!this.context || !this.master || this.ambient) return;
    const ctx = this.context;
    const gain = ctx.createGain();
    gain.gain.value = .026;
    gain.connect(this.master);

    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 37;
    const droneGain = ctx.createGain();
    droneGain.gain.value = .55;
    drone.connect(droneGain).connect(gain);

    const overtone = ctx.createOscillator();
    overtone.type = 'triangle';
    overtone.frequency.value = 73;
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = .11;
    overtone.connect(overtoneGain).connect(gain);

    const pulse = ctx.createOscillator();
    pulse.type = 'sine';
    pulse.frequency.value = .6;
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = .012;
    pulse.connect(pulseGain);
    const mod = ctx.createGain();
    mod.gain.value = .018;
    pulseGain.connect(mod.gain);
    overtoneGain.connect(mod).connect(gain);

    drone.start();
    overtone.start();
    pulse.start();

    const roomNoise = ctx.createBufferSource();
    roomNoise.buffer = this.noiseBuffer;
    roomNoise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = .4;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = .026;
    roomNoise.connect(filter).connect(noiseGain).connect(gain);
    roomNoise.start();

    this.ambient = { gain, drone, overtone, pulse, roomNoise };
  }

  tone({ frequency = 440, endFrequency = frequency, duration = .08, gain = .1, type = 'sine', delay = 0, pan = 0 } = {}) {
    if (!this.enabled || !this.context || !this.master) return;
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), start + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    let target = envelope;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      envelope.connect(panner);
      target = panner;
    }
    target.connect(this.master);
    oscillator.connect(envelope);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
  }

  noise({ duration = .1, gain = .08, filter = 900, delay = 0, pan = 0 } = {}) {
    if (!this.enabled || !this.context || !this.master || !this.noiseBuffer) return;
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const biquad = ctx.createBiquadFilter();
    biquad.type = 'bandpass';
    biquad.frequency.value = filter;
    biquad.Q.value = .8;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), start + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(biquad).connect(envelope);
    let target = envelope;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      envelope.connect(panner);
      target = panner;
    }
    target.connect(this.master);
    source.start(start, Math.random() * 1.2, duration + .03);
  }

  click() {
    this.tone({ frequency: 170, endFrequency: 105, duration: .045, gain: .08, type: 'square' });
  }

  shutter() {
    this.noise({ duration: .034, gain: .18, filter: 1800 });
    this.tone({ frequency: 148, endFrequency: 62, duration: .065, gain: .12, type: 'square' });
    this.tone({ frequency: 780, endFrequency: 340, duration: .035, gain: .045, type: 'triangle', delay: .018 });
  }

  eject() {
    this.noise({ duration: .38, gain: .06, filter: 520, delay: .05 });
    for (let i = 0; i < 7; i += 1) {
      this.tone({ frequency: 92 + i * 7, endFrequency: 82 + i * 4, duration: .036, gain: .028, type: 'sawtooth', delay: .06 + i * .047 });
    }
  }

  developmentStep(index = 0) {
    const pans = [-.72, .63, -.34, .22];
    const pan = pans[index % pans.length];
    this.noise({ duration: .12, gain: .032, filter: 210 + index * 30, pan });
    this.tone({ frequency: 62 - index * 3, endFrequency: 48, duration: .18, gain: .065, type: 'sine', pan });
  }

  whisper(correct = false) {
    this.noise({ duration: .46, gain: correct ? .04 : .075, filter: correct ? 680 : 430, pan: Math.random() * 1.6 - .8 });
    this.tone({ frequency: correct ? 210 : 118, endFrequency: correct ? 154 : 72, duration: .52, gain: correct ? .022 : .048, type: 'triangle', pan: Math.random() * 1.5 - .75 });
  }

  focus() {
    this.tone({ frequency: 880, endFrequency: 720, duration: .028, gain: .035, type: 'sine' });
  }

  success() {
    this.tone({ frequency: 310, endFrequency: 420, duration: .14, gain: .07, type: 'sine' });
    this.tone({ frequency: 470, endFrequency: 590, duration: .19, gain: .055, type: 'sine', delay: .09 });
  }

  failure() {
    this.tone({ frequency: 122, endFrequency: 43, duration: .44, gain: .11, type: 'sawtooth' });
    this.noise({ duration: .28, gain: .08, filter: 330, delay: .05 });
  }

  win() {
    this.tone({ frequency: 190, endFrequency: 290, duration: .28, gain: .08, type: 'sine' });
    this.tone({ frequency: 290, endFrequency: 430, duration: .32, gain: .065, type: 'sine', delay: .16 });
    this.tone({ frequency: 430, endFrequency: 610, duration: .45, gain: .055, type: 'sine', delay: .31 });
  }

  lose() {
    this.tone({ frequency: 88, endFrequency: 30, duration: 1.05, gain: .13, type: 'sawtooth' });
    this.noise({ duration: .9, gain: .09, filter: 190, delay: .08 });
  }

  suspend() {
    if (this.context?.state === 'running') this.context.suspend().catch(() => {});
  }

  resume() {
    if (this.enabled && this.context?.state === 'suspended') this.context.resume().catch(() => {});
  }
}
