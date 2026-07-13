class RaceAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineGain = null;
    this.engine = null;
    this.engineSub = null;
    this.skidGain = null;
    this.skid = null;
    this.windGain = null;
    this.wind = null;
    this.enabled = saved.sound;
    this.lastGear = 1;
    this.shiftDrop = 0;
  }

  async unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.62 : 0;
      this.master.connect(this.context.destination);

      const engineFilter = this.context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 1150;
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      this.engine = this.context.createOscillator();
      this.engine.type = 'sawtooth';
      this.engineSub = this.context.createOscillator();
      this.engineSub.type = 'square';
      const subGain = this.context.createGain();
      subGain.gain.value = 0.11;
      this.engine.connect(engineFilter);
      this.engineSub.connect(subGain).connect(engineFilter);
      engineFilter.connect(this.engineGain).connect(this.master);
      this.engine.start();
      this.engineSub.start();

      const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;

      const skidFilter = this.context.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 1750;
      skidFilter.Q.value = 0.75;
      this.skidGain = this.context.createGain();
      this.skidGain.gain.value = 0;
      this.skid = this.context.createBufferSource();
      this.skid.buffer = buffer;
      this.skid.loop = true;
      this.skid.connect(skidFilter).connect(this.skidGain).connect(this.master);
      this.skid.start();

      const windFilter = this.context.createBiquadFilter();
      windFilter.type = 'highpass';
      windFilter.frequency.value = 950;
      this.windGain = this.context.createGain();
      this.windGain.gain.value = 0;
      this.wind = this.context.createBufferSource();
      this.wind.buffer = buffer;
      this.wind.loop = true;
      this.wind.connect(windFilter).connect(this.windGain).connect(this.master);
      this.wind.start();
    }
    if (this.context.state !== 'running') await this.context.resume();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    saved.sound = enabled;
    saveState();
    if (this.master && this.context) this.master.gain.setTargetAtTime(enabled ? 0.62 : 0, this.context.currentTime, 0.02);
    updateSoundLabels();
  }

  update(car, active) {
    if (!this.context || !this.engineGain || !car) return;
    const now = this.context.currentTime;
    const speed = Math.abs(car.forwardSpeed || 0);
    const gear = Math.max(1, Math.min(6, 1 + Math.floor(speed / 118)));
    if (gear !== this.lastGear && active && speed > 120) {
      this.lastGear = gear;
      this.shiftDrop = 1;
      this.blip('shift', 0.42);
    }
    this.shiftDrop *= 0.90;
    const withinGear = (speed % 118) / 118;
    const rpm = 52 + withinGear * 92 + gear * 6 + (car.throttleInput || 0) * 25 - this.shiftDrop * 28;
    this.engine.frequency.setTargetAtTime(Math.max(36, rpm), now, 0.035);
    this.engineSub.frequency.setTargetAtTime(Math.max(20, rpm * 0.5), now, 0.045);
    this.engineGain.gain.setTargetAtTime(active && this.enabled ? 0.055 + speed / MAX_SPEED * 0.12 + (car.throttleInput || 0) * 0.035 : 0, now, 0.055);
    this.skidGain.gain.setTargetAtTime(active && this.enabled ? clamp((car.slip || 0) / 230, 0, 0.145) : 0, now, 0.04);
    this.windGain.gain.setTargetAtTime(active && this.enabled ? clamp((speed - 260) / 900, 0, 0.085) : 0, now, 0.08);
  }

  blip(type, strength = 1) {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = type === 'impact' ? 700 : 1600;
    oscillator.type = type === 'impact' ? 'square' : type === 'countdown' ? 'sine' : 'triangle';
    const frequency = type === 'impact' ? 78 : type === 'countdown' ? 280 : type === 'go' ? 520 : type === 'shift' ? 145 : type === 'jump' ? 210 : 390;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * (type === 'go' ? 1.35 : 0.55)), now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.10 * strength + 0.012, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.21);
  }
}

const audio = new RaceAudio();


function createCar(options) {
  return {
    id: options.id,
    name: options.name,
    color: options.color,
    accent: options.accent,
    player: Boolean(options.player),
    skill: options.skill ?? 1,
    aggression: options.aggression ?? 0.5,
    lane: options.lane ?? 0,
    x: 0,
    y: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    yawRate: 0,
    steerAngle: 0,
    z: 0,
    vz: 0,
    airborne: false,
    jumpCooldown: 0,
    trackIndex: 0,
    previousTrackIndex: 0,
    completedLaps: 0,
    lapArmed: false,
    progressDistance: 0,
    nextLapDistance: 0,
    lapStartTime: 0,
    bestLap: null,
    finishTime: null,
    throttleInput: 0,
    brakeInput: 0,
    steerInput: 0,
    slip: 0,
    distanceFromRoad: 0,
    signedRoadOffset: 0,
    safeIndex: 0,
    stuckTime: 0,
    collisionCooldown: 0,
    markTimer: 0,
    dustTimer: 0,
    aiPhase: options.aiPhase ?? 0,
    aiOffset: options.lane ?? 0,
    overtakeTimer: 0,
    overtakeSide: 0,
    mistakeTimer: 0,
    raceScore: 0,
    lastImpact: 0,
    progressTimer: 0,
    lastProgressScore: 0,
    longitudinalAccel: 0,
    lateralAccel: 0
  };
}
