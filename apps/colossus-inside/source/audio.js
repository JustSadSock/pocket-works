export function createColossusAudio() {
  let ctx = null;
  let master = null;
  let windGain = null;
  let windSource = null;
  let heartTimer = null;
  let muted = false;
  let inside = false;
  let repaired = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.72;
    master.connect(ctx.destination);

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 3.4;
    }
    windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 85;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 1100;
    windGain = ctx.createGain();
    windGain.gain.value = 0.16;
    windSource.connect(high).connect(low).connect(windGain).connect(master);
    windSource.start();
    startHeartClock();
    return ctx;
  }

  function tone({ frequency = 80, endFrequency = frequency * .6, duration = .4, gain = .18, type = 'sine', delay = 0 }) {
    const c = ensure();
    if (!c || !master) return;
    const now = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(18, endFrequency), now + duration);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + Math.min(.03, duration * .2));
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + duration + .03);
  }

  function noiseHit(duration = .28, gain = .12, cutoff = 900) {
    const c = ensure();
    if (!c || !master) return;
    const size = Math.max(16, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, size, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(master);
    src.start();
  }

  function startHeartClock() {
    if (heartTimer) clearInterval(heartTimer);
    heartTimer = setInterval(() => {
      if (!inside || !ctx || ctx.state !== 'running') return;
      const strength = repaired ? .11 : .16;
      tone({ frequency: repaired ? 52 : 46, endFrequency: 30, duration: .42, gain: strength, type: 'sine' });
      tone({ frequency: repaired ? 68 : 61, endFrequency: 35, duration: .28, gain: strength * .62, delay: .18, type: 'sine' });
    }, repaired ? 1420 : 1180);
  }

  return {
    ensure,
    setMuted(value) {
      muted = Boolean(value);
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : .72, ctx.currentTime, .035);
    },
    isMuted() { return muted; },
    setInside(value) { inside = Boolean(value); },
    setRepaired(value) { repaired = Boolean(value); startHeartClock(); },
    setWind(intensity) {
      if (windGain && ctx) windGain.gain.setTargetAtTime(Math.max(.035, intensity * .2), ctx.currentTime, .25);
    },
    step(weight = 1) {
      tone({ frequency: 74 + Math.random() * 10, endFrequency: 46, duration: .08, gain: .032 * weight, type: 'triangle' });
      if (Math.random() > .45) noiseHit(.055, .014 * weight, 1300);
    },
    colossusStep(damage = 0) {
      tone({ frequency: 31 + Math.random() * 3, endFrequency: 19, duration: 1.45, gain: .22 + damage * .06, type: 'sine' });
      tone({ frequency: 58, endFrequency: 30, duration: .82, gain: .07, type: 'triangle', delay: .06 });
      noiseHit(.55, .035 + damage * .018, 330);
    },
    creak(amount = 1) {
      tone({ frequency: 118 + Math.random() * 55, endFrequency: 70, duration: .5 + Math.random() * .3, gain: .025 * amount, type: 'sawtooth' });
    },
    lightning() {
      tone({ frequency: 44, endFrequency: 20, duration: 2.2, gain: .30, type: 'sine', delay: .08 });
      noiseHit(.9, .24, 1400);
      setTimeout(() => noiseHit(.7, .09, 520), 240);
    },
    debris() {
      noiseHit(.42, .13, 780);
      tone({ frequency: 132, endFrequency: 57, duration: .55, gain: .06, type: 'square' });
    },
    grab() {
      noiseHit(.09, .055, 1500);
      tone({ frequency: 110, endFrequency: 70, duration: .16, gain: .04, type: 'triangle' });
    },
    repairPulse(progress = 0) {
      tone({ frequency: 120 + progress * 190, endFrequency: 100 + progress * 160, duration: .10, gain: .025 + progress * .018, type: 'triangle' });
    },
    repairComplete() {
      for (let i = 0; i < 4; i += 1) tone({ frequency: 120 * Math.pow(1.25, i), endFrequency: 118 * Math.pow(1.25, i), duration: .55, gain: .045, type: 'sine', delay: i * .08 });
      tone({ frequency: 42, endFrequency: 28, duration: 1.8, gain: .16, type: 'sine' });
    },
    finale() {
      [130, 164, 196, 260].forEach((frequency, i) => tone({ frequency, endFrequency: frequency * .96, duration: 2.6, gain: .025, type: 'sine', delay: i * .14 }));
    },
    dispose() {
      if (heartTimer) clearInterval(heartTimer);
      try { windSource?.stop(); } catch {}
      void ctx?.close();
    }
  };
}
