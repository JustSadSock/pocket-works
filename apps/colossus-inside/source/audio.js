export function createColossusAudio() {
  let ctx = null;
  let master = null;
  let windGain = null;
  let windSource = null;
  let stormAssetGain = null;
  let stormAssetSource = null;
  let heartTimer = null;
  let muted = false;
  let inside = false;
  let repaired = false;
  let wantedWind = 0.8;
  let assetLoadStarted = false;
  const samples = new Map();

  const sampleUrls = {
    storm: './audio/generated/storm-bed.ogg',
    footfall: './audio/generated/colossus-footfall.ogg',
    lightning: './audio/generated/lightning-impact.ogg',
    grab: './audio/generated/armor-grab.ogg'
  };

  async function loadGeneratedSamples() {
    if (!ctx || assetLoadStarted) return;
    assetLoadStarted = true;
    await Promise.all(Object.entries(sampleUrls).map(async ([name, url]) => {
      try {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) return;
        const data = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(data.slice(0));
        samples.set(name, decoded);
      } catch {
        // Procedural Web Audio remains the deterministic fallback.
      }
    }));
    startStormAsset();
  }

  function startStormAsset() {
    if (!ctx || !master || stormAssetSource || !samples.has('storm')) return;
    stormAssetSource = ctx.createBufferSource();
    stormAssetSource.buffer = samples.get('storm');
    stormAssetSource.loop = true;
    stormAssetGain = ctx.createGain();
    stormAssetGain.gain.value = inside ? 0.005 : Math.max(0.008, wantedWind * 0.055);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 1250;
    stormAssetSource.connect(low).connect(stormAssetGain).connect(master);
    stormAssetSource.start();
  }

  function playSample(name, gain = 0.15, rate = 1) {
    if (!ctx || !master) return false;
    const buffer = samples.get(name);
    if (!buffer) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    source.connect(g).connect(master);
    source.start();
    return true;
  }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      void loadGeneratedSamples();
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
    windGain.gain.value = 0.14;
    windSource.connect(high).connect(low).connect(windGain).connect(master);
    windSource.start();
    startHeartClock();
    void loadGeneratedSamples();
    return ctx;
  }

  function tone({ frequency = 80, endFrequency = frequency * 0.6, duration = 0.4, gain = 0.18, type = 'sine', delay = 0 }) {
    const c = ensure();
    if (!c || !master) return;
    const now = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(18, endFrequency), now + duration);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.03, duration * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function noiseHit(duration = 0.28, gain = 0.12, cutoff = 900) {
    const c = ensure();
    if (!c || !master) return;
    const size = Math.max(16, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, size, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const source = c.createBufferSource();
    source.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.value = gain;
    source.connect(filter).connect(g).connect(master);
    source.start();
  }

  function startHeartClock() {
    if (heartTimer) clearInterval(heartTimer);
    heartTimer = setInterval(() => {
      if (!inside || !ctx || ctx.state !== 'running') return;
      const strength = repaired ? 0.11 : 0.16;
      tone({ frequency: repaired ? 52 : 46, endFrequency: 30, duration: 0.42, gain: strength, type: 'sine' });
      tone({ frequency: repaired ? 68 : 61, endFrequency: 35, duration: 0.28, gain: strength * 0.62, delay: 0.18, type: 'sine' });
    }, repaired ? 1420 : 1180);
  }

  return {
    ensure,
    setMuted(value) {
      muted = Boolean(value);
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.72, ctx.currentTime, 0.035);
    },
    isMuted() { return muted; },
    setInside(value) {
      inside = Boolean(value);
      if (stormAssetGain && ctx) stormAssetGain.gain.setTargetAtTime(inside ? 0.004 : Math.max(0.008, wantedWind * 0.055), ctx.currentTime, 0.35);
    },
    setRepaired(value) { repaired = Boolean(value); startHeartClock(); },
    setWind(intensity) {
      wantedWind = Math.max(0, intensity);
      if (windGain && ctx) windGain.gain.setTargetAtTime(Math.max(0.025, wantedWind * 0.17), ctx.currentTime, 0.25);
      if (stormAssetGain && ctx) stormAssetGain.gain.setTargetAtTime(inside ? 0.004 : Math.max(0.008, wantedWind * 0.055), ctx.currentTime, 0.35);
    },
    step(weight = 1) {
      tone({ frequency: 74 + Math.random() * 10, endFrequency: 46, duration: 0.08, gain: 0.032 * weight, type: 'triangle' });
      if (Math.random() > 0.45) noiseHit(0.055, 0.014 * weight, 1300);
    },
    colossusStep(damage = 0) {
      playSample('footfall', 0.17 + damage * 0.045, 0.88 + Math.random() * 0.08);
      tone({ frequency: 31 + Math.random() * 3, endFrequency: 19, duration: 1.45, gain: 0.20 + damage * 0.055, type: 'sine' });
      tone({ frequency: 58, endFrequency: 30, duration: 0.82, gain: 0.055, type: 'triangle', delay: 0.06 });
      noiseHit(0.55, 0.025 + damage * 0.015, 330);
    },
    creak(amount = 1) {
      tone({ frequency: 118 + Math.random() * 55, endFrequency: 70, duration: 0.5 + Math.random() * 0.3, gain: 0.025 * amount, type: 'sawtooth' });
    },
    lightning() {
      playSample('lightning', 0.30, 0.95 + Math.random() * 0.06);
      tone({ frequency: 44, endFrequency: 20, duration: 2.2, gain: 0.25, type: 'sine', delay: 0.08 });
      noiseHit(0.9, 0.17, 1400);
      setTimeout(() => noiseHit(0.7, 0.07, 520), 240);
    },
    debris() {
      noiseHit(0.42, 0.13, 780);
      tone({ frequency: 132, endFrequency: 57, duration: 0.55, gain: 0.06, type: 'square' });
    },
    grab() {
      playSample('grab', 0.11, 0.92 + Math.random() * 0.12);
      noiseHit(0.09, 0.04, 1500);
      tone({ frequency: 110, endFrequency: 70, duration: 0.16, gain: 0.032, type: 'triangle' });
    },
    repairPulse(progress = 0) {
      tone({ frequency: 120 + progress * 190, endFrequency: 100 + progress * 160, duration: 0.10, gain: 0.025 + progress * 0.018, type: 'triangle' });
    },
    repairComplete() {
      for (let i = 0; i < 4; i += 1) tone({ frequency: 120 * Math.pow(1.25, i), endFrequency: 118 * Math.pow(1.25, i), duration: 0.55, gain: 0.045, type: 'sine', delay: i * 0.08 });
      tone({ frequency: 42, endFrequency: 28, duration: 1.8, gain: 0.16, type: 'sine' });
    },
    finale() {
      [130, 164, 196, 260].forEach((frequency, i) => tone({ frequency, endFrequency: frequency * 0.96, duration: 2.6, gain: 0.025, type: 'sine', delay: i * 0.14 }));
    },
    dispose() {
      if (heartTimer) clearInterval(heartTimer);
      try { windSource?.stop(); } catch {}
      try { stormAssetSource?.stop(); } catch {}
      void ctx?.close();
    }
  };
}
