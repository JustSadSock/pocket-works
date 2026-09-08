export function createBellforgeAudio() {
  let context = null, master = null, compressor = null, muted = false;
  let windGain = null, humGain = null, musicGain = null, lastIntensity = -1;

  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

  function connectWithPan(node, pan = 0) {
    if (!context || !master) return;
    if (typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(panner).connect(master);
    } else {
      node.connect(master);
    }
  }

  function noiseBuffer(seconds = 1.5) {
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.965 + white * 0.035;
      channel[i] = previous * 2.1;
    }
    return buffer;
  }

  function ensure() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return context;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    context = new AC();

    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.3;
    compressor.connect(context.destination);

    master = context.createGain();
    master.gain.value = muted ? 0 : 0.56;
    master.connect(compressor);

    const wind = context.createBufferSource();
    const windFilter = context.createBiquadFilter();
    windGain = context.createGain();
    wind.buffer = noiseBuffer(1.7);
    wind.loop = true;
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.25;
    windGain.gain.value = 0.032;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();

    const rumble = context.createBufferSource();
    const rumbleFilter = context.createBiquadFilter();
    humGain = context.createGain();
    rumble.buffer = noiseBuffer(1.25);
    rumble.loop = true;
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 105;
    humGain.gain.value = 0.012;
    rumble.connect(rumbleFilter).connect(humGain).connect(master);
    rumble.start();

    musicGain = context.createGain();
    musicGain.gain.value = 0.012;
    musicGain.connect(master);
    for (const [frequency, gain] of [[55, 0.55], [82.41, 0.26], [110, 0.13]]) {
      const osc = context.createOscillator();
      const amp = context.createGain();
      osc.type = frequency === 55 ? 'sine' : 'triangle';
      osc.frequency.value = frequency;
      amp.gain.value = gain;
      osc.connect(amp).connect(musicGain);
      osc.start();
    }

    if (context.state === 'suspended') void context.resume();
    return context;
  }

  function tone({
    frequency = 220, duration = 0.1, gain = 0.08, type = 'sine', detune = 0,
    filter = 2800, pan = 0, attack = 0.008
  } = {}) {
    const ctx = ensure();
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const biquad = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = Math.max(18, frequency);
    osc.detune.value = detune;
    biquad.type = 'lowpass';
    biquad.frequency.value = filter;
    const now = ctx.currentTime;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + Math.max(0.002, attack));
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(biquad).connect(amp);
    connectWithPan(amp, pan);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  function noiseBurst({ duration = 0.08, gain = 0.05, frequency = 900, q = 0.8, pan = 0 } = {}) {
    const ctx = ensure();
    if (!ctx || !master) return;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    source.buffer = noiseBuffer(Math.max(0.09, duration + 0.03));
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const now = ctx.currentTime;
    amp.gain.setValueAtTime(Math.max(0.001, gain), now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(amp);
    connectWithPan(amp, pan);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  function setIntensity(value) {
    const v = clamp01(value);
    if (!context || Math.abs(v - lastIntensity) < 0.025) return;
    lastIntensity = v;
    const now = context.currentTime;
    humGain?.gain.setTargetAtTime(0.01 + v * 0.04, now, 0.28);
    windGain?.gain.setTargetAtTime(0.026 + v * 0.018, now, 0.4);
    musicGain?.gain.setTargetAtTime(0.009 + v * 0.022, now, 0.5);
  }

  function step(surface = 'stone') {
    const profile = surface === 'metal'
      ? { f: 1250, tone: 165, gain: 0.047 }
      : surface === 'wood'
        ? { f: 720, tone: 104, gain: 0.052 }
        : { f: 430, tone: 76, gain: 0.056 };
    const pan = (Math.random() - 0.5) * 0.18;
    noiseBurst({ duration: 0.045 + Math.random() * 0.025, gain: profile.gain, frequency: profile.f * (0.9 + Math.random() * 0.2), q: 0.7, pan });
    tone({ frequency: profile.tone + Math.random() * 18, duration: 0.052, gain: profile.gain * 0.6, type: 'triangle', filter: profile.f * 1.7, pan });
  }

  function mechanism(pan = 0) {
    noiseBurst({ duration: 0.07, gain: 0.065, frequency: 1150, q: 1.5, pan });
    tone({ frequency: 118 + Math.random() * 18, duration: 0.16, gain: 0.072, type: 'square', filter: 980, pan });
    setTimeout(() => tone({ frequency: 176 + Math.random() * 20, duration: 0.09, gain: 0.042, type: 'triangle', filter: 1800, pan }), 26);
  }

  function note(step = 0, pan = 0, gain = 0.045) {
    const value = ((Math.trunc(Number(step) || 0) % 8) + 8) % 8;
    const frequency = 146.83 * Math.pow(2, value / 12);
    tone({ frequency, duration: 0.28, gain, type: 'sine', filter: 3600, pan, attack: 0.006 });
    tone({ frequency: frequency * 2, duration: 0.18, gain: gain * 0.22, type: 'triangle', filter: 4200, pan, attack: 0.004 });
  }

  function chord(values = [2,5,1], power = 0.62) {
    values.slice(0,3).forEach((value,index) => {
      setTimeout(() => note(value,(index-1)*0.3,0.045*clamp01(power)),index*42);
    });
  }

  function resonance(power = 1, pan = 0) {
    const p = clamp01(power);
    for (const [frequency, delay, gain] of [[330,0,0.075],[495,24,0.055],[660,48,0.032]]) {
      setTimeout(() => tone({ frequency, duration: 0.72 - delay / 260, gain: gain * p, type: 'sine', filter: 4200, pan }), delay);
    }
  }

  function voice(style = 'warm', pan = 0) {
    const base = style === 'warden' ? 82 : style === 'old' ? 112 : 142;
    const formant = style === 'warden' ? 520 : style === 'old' ? 920 : 1180;
    [0, 115, 235, 365, 510].forEach((delay, index) => {
      setTimeout(() => {
        const pitch = base * (0.92 + Math.random() * 0.16);
        tone({ frequency: pitch, duration: 0.13 + Math.random() * 0.08, gain: style === 'warden' ? 0.038 : 0.026, type: 'sawtooth', filter: formant + index * 70, pan, attack: 0.014 });
      }, delay);
    });
  }

  function alarm(pan = 0) {
    tone({ frequency: 92, duration: 0.38, gain: 0.11, type: 'sawtooth', filter: 760, pan });
    setTimeout(() => tone({ frequency: 72, duration: 0.34, gain: 0.085, type: 'square', filter: 620, pan }), 190);
  }

  function lift() {
    const ctx = ensure();
    if (!ctx || !master) return;
    tone({ frequency: 61, duration: 2.7, gain: 0.075, type: 'sawtooth', filter: 310 });
    [260, 720, 1180, 1660, 2140].forEach((delay, index) => {
      setTimeout(() => mechanism(index % 2 ? 0.25 : -0.25), delay);
    });
  }

  function bell() {
    const partials = [
      [92, 3.6, 0.13], [184.4, 3.0, 0.085], [276.8, 2.6, 0.058],
      [367.2, 2.2, 0.044], [515.5, 1.8, 0.031], [689, 1.45, 0.021]
    ];
    noiseBurst({ duration: 0.12, gain: 0.12, frequency: 620, q: 0.45 });
    partials.forEach(([frequency, duration, gain], index) => {
      setTimeout(() => tone({ frequency, duration, gain, type: 'sine', filter: 6200, detune: index % 2 ? 3 : -2, attack: 0.004 }), index * 12);
    });
  }

  return {
    ensure,
    setMuted(value) {
      muted = !!value;
      if (master && context) master.gain.setTargetAtTime(muted ? 0.0001 : 0.56, context.currentTime, 0.025);
    },
    setIntensity,
    step,
    mechanism,
    resonance,
    note,
    chord,
    voice,
    alarm,
    lift,
    bell,
    suspend() { if (context?.state === 'running') void context.suspend(); },
    resume() { if (context?.state === 'suspended') void context.resume(); }
  };
}
