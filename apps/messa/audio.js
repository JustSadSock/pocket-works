const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class OrbitAudio {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
    this.master = null;
    this.windGain = null;
    this.windFilter = null;
    this.wellGain = null;
    this.wellOscillator = null;
    this.droneGain = null;
    this.started = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.context?.state === 'running') this.context.suspend().catch(() => {});
    });
  }

  async unlock() {
    if (!this.enabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context ||= new AudioContext();
    if (!this.started) this.buildBed();
    if (this.context.state === 'suspended') await this.context.resume().catch(() => {});
    this.master?.gain.setTargetAtTime(this.enabled ? .36 : .0001, this.context.currentTime, .04);
  }

  buildBed() {
    const context = this.context;
    this.master = context.createGain();
    this.master.gain.value = .0001;
    this.master.connect(context.destination);

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 14;
    compressor.ratio.value = 5;
    compressor.attack.value = .01;
    compressor.release.value = .28;
    compressor.connect(this.master);
    this.bus = compressor;

    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let memory = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      memory = memory * .975 + white * .025;
      samples[index] = white * .24 + memory * .76;
    }
    const wind = context.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    this.windFilter = context.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 760;
    this.windFilter.Q.value = .42;
    this.windGain = context.createGain();
    this.windGain.gain.value = .035;
    wind.connect(this.windFilter).connect(this.windGain).connect(compressor);
    wind.start();

    this.droneGain = context.createGain();
    this.droneGain.gain.value = .025;
    this.droneGain.connect(compressor);
    for (const [frequency, type, detune] of [[42,'sine',0],[63,'triangle',-6],[84,'sine',4]]) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      oscillator.connect(this.droneGain);
      oscillator.start();
    }

    this.wellOscillator = context.createOscillator();
    this.wellOscillator.type = 'sine';
    this.wellOscillator.frequency.value = 38;
    this.wellGain = context.createGain();
    this.wellGain.gain.value = .0001;
    this.wellOscillator.connect(this.wellGain).connect(compressor);
    this.wellOscillator.start();
    this.started = true;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.enabled ? .36 : .0001, now, .045);
  }

  setDynamics(speed = 2.8, wellPower = 0, rewinding = false) {
    if (!this.context || !this.started || !this.enabled) return;
    const now = this.context.currentTime;
    const normalizedSpeed = clamp((speed - 1.8) / 3.4, 0, 1);
    this.windGain.gain.setTargetAtTime(.028 + normalizedSpeed * .12 + (rewinding ? .08 : 0), now, .07);
    this.windFilter.frequency.setTargetAtTime(520 + normalizedSpeed * 1480 + (rewinding ? 900 : 0), now, .08);
    this.wellGain.gain.setTargetAtTime(wellPower > 0 ? .035 + wellPower * .12 : .0001, now, .045);
    this.wellOscillator.frequency.setTargetAtTime(34 + wellPower * 31, now, .055);
    this.droneGain.gain.setTargetAtTime(rewinding ? .008 : .025, now, .09);
  }

  event(type) {
    if (!this.context || !this.started || !this.enabled || this.context.state !== 'running') return;
    const context = this.context;
    const now = context.currentTime;
    const definitions = {
      ui: { from: 180, to: 240, duration: .08, gain: .045, wave: 'square' },
      voice: { from: 310, to: 930, duration: .48, gain: .16, wave: 'sine' },
      near: { from: 170, to: 460, duration: .18, gain: .1, wave: 'triangle' },
      rewind: { from: 620, to: 62, duration: .62, gain: .2, wave: 'sawtooth' },
      impact: { from: 92, to: 34, duration: .38, gain: .24, wave: 'square' },
      win: { from: 98, to: 784, duration: 1.2, gain: .2, wave: 'sine' },
      lose: { from: 130, to: 38, duration: .8, gain: .18, wave: 'sawtooth' }
    };
    const cue = definitions[type] || definitions.ui;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    oscillator.type = cue.wave;
    oscillator.frequency.setValueAtTime(Math.max(1, cue.from), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, cue.to), now + cue.duration);
    filter.type = 'lowpass';
    filter.frequency.value = type === 'impact' ? 480 : 2800;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(cue.gain, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + cue.duration);
    oscillator.connect(filter).connect(gain).connect(this.bus);
    oscillator.start(now);
    oscillator.stop(now + cue.duration + .03);

    if (type === 'voice' || type === 'win') {
      const overtone = context.createOscillator();
      const overtoneGain = context.createGain();
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(cue.from * 1.5, now + .04);
      overtone.frequency.exponentialRampToValueAtTime(cue.to * 1.25, now + cue.duration * .9);
      overtoneGain.gain.setValueAtTime(.0001, now);
      overtoneGain.gain.exponentialRampToValueAtTime(cue.gain * .46, now + .06);
      overtoneGain.gain.exponentialRampToValueAtTime(.0001, now + cue.duration * 1.2);
      overtone.connect(overtoneGain).connect(this.bus);
      overtone.start(now + .04);
      overtone.stop(now + cue.duration * 1.24);
    }
  }
}
