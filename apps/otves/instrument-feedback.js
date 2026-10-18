// ОТВЕС — locally synthesized instrument acoustics.
// One context, one filtered noise source for continuous glass-on-ceramic roll,
// short resonant partials for collisions, and no external sound assets.
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));

export function rollingEnvelope(speed) {
  const normalized = clamp((speed - .16) / 4.8, 0, 1);
  return {
    gain: normalized * normalized * .24,
    cutoff: 220 + normalized * 1250,
    resonance: 90 + normalized * 110,
    pitch: 86 + normalized * 52
  };
}
export function impactEnvelope(speed) {
  const intensity = clamp(speed / 5.7, 0, 1);
  return {
    gain: .025 + intensity * .16,
    frequency: 740 + intensity * 340,
    secondaryFrequency: 1480 + intensity * 610,
    duration: .060 + intensity * .055
  };
}
export function hapticDuration(kind, strength = 1) {
  if (kind === 'collision') return clamp(Math.round(strength * 9), 5, 12);
  if (kind === 'landing') return 9;
  if (kind === 'click') return 5;
  if (kind === 'success') return [12, 35, 18];
  return 0;
}

function noiseBuffer(context) {
  const len = Math.floor(context.sampleRate * 1.65);
  const buffer = context.createBuffer(1, len, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x812ab3cf;
  let last = 0;
  for (let i = 0; i < len; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    last = last * .87 + white * .13;
    data[i] = last * .68 + white * .32;
  }
  return buffer;
}

export function createInstrumentAudio({ enabled = true, volume = .28 } = {}) {
  let active = Boolean(enabled);
  let context = null, master = null, noise = null, rollGain = null;
  let rollFilter = null, rollTone = null, toneGain = null;
  let paused = true, lastImpact = -Infinity;
  let destroyed = false;
  const nodes = [];

  function makeContext() {
    if (!active || destroyed) return null;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    if (context) return context;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = clamp(volume, 0, 1);
    master.connect(context.destination);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    filter.Q.value = .55;
    rollFilter = filter;
    rollGain = context.createGain();
    rollGain.gain.value = 0;
    noise = context.createBufferSource();
    noise.buffer = noiseBuffer(context);
    noise.loop = true;
    noise.connect(filter);
    filter.connect(rollGain);
    rollGain.connect(master);
    noise.start();
    rollTone = context.createOscillator();
    rollTone.type = 'sine';
    rollTone.frequency.value = 84;
    toneGain = context.createGain();
    toneGain.gain.value = 0;
    rollTone.connect(toneGain);
    toneGain.connect(master);
    rollTone.start();
    nodes.push(noise, filter, rollGain, rollTone, toneGain, master);
    return context;
  }

  async function unlock() {
    const ctx = makeContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { return false; }
    }
    return ctx.state === 'running';
  }

  function oscillator({frequency, endFrequency = frequency, duration = .06,
    type = 'sine', gain = .06, delay = 0}) {
    if (!active || !context || context.state !== 'running' || destroyed) return false;
    const start = context.currentTime + Math.max(0,delay);
    const stop = start + clamp(duration,.015,.7);
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1,frequency),start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1,endFrequency),stop);
    env.gain.setValueAtTime(.0001,start);
    env.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),start + Math.min(.008,(stop-start)/4));
    env.gain.exponentialRampToValueAtTime(.0001,stop);
    osc.connect(env); env.connect(master);
    osc.start(start); osc.stop(stop+.01);
    osc.addEventListener('ended',()=>{
      osc.disconnect(); env.disconnect();
    },{once:true});
    return true;
  }

  function rolling(speed) {
    if (!context || !rollGain || !rollFilter || !toneGain) return;
    const shape = rollingEnvelope(speed);
    const now = context.currentTime;
    const audible = active && !paused && context.state === 'running';
    rollGain.gain.setTargetAtTime(audible ? shape.gain : 0,now,.043);
    rollFilter.frequency.setTargetAtTime(shape.cutoff,now,.070);
    toneGain.gain.setTargetAtTime(audible ? shape.gain * .12 : 0,now,.055);
    rollTone.frequency.setTargetAtTime(shape.pitch,now,.065);
  }
  function setPaused(value) {
    paused=Boolean(value);
    if (paused) rolling(0);
  }

  function impact(speed) {
    if (!active || paused || !context || context.state !== 'running') return;
    const ms=context.currentTime*1000;
    if (ms-lastImpact<63) return;
    lastImpact=ms;
    const part=impactEnvelope(speed);
    oscillator({frequency:part.frequency,endFrequency:part.frequency*.77,
      gain:part.gain,duration:part.duration,type:'sine'});
    oscillator({frequency:part.secondaryFrequency,endFrequency:part.secondaryFrequency*.92,
      gain:part.gain*.36,duration:part.duration*.62,type:'sine',delay:.003});
  }
  function play(name) {
    switch(name) {
      case 'click':
        return oscillator({frequency:410,endFrequency:270,duration:.038,gain:.115,type:'triangle'});
      case 'pause':
        return oscillator({frequency:320,endFrequency:215,duration:.085,gain:.095,type:'triangle'});
      case 'resume':
        return oscillator({frequency:290,endFrequency:430,duration:.075,gain:.090,type:'triangle'});
      case 'calibrate':
        oscillator({frequency:450,endFrequency:490,duration:.072,gain:.060,type:'sine'});
        return oscillator({frequency:700,endFrequency:730,duration:.090,gain:.035,type:'sine',delay:.035});
      case 'rim':
        return oscillator({frequency:620,endFrequency:390,duration:.145,gain:.19,type:'triangle'});
      case 'landing':
        oscillator({frequency:182,endFrequency:105,duration:.18,gain:.17,type:'sine'});
        return oscillator({frequency:550,endFrequency:345,duration:.080,gain:.05,type:'triangle',delay:.008});
      case 'success':
        oscillator({frequency:490,endFrequency:640,duration:.17,gain:.17,type:'sine'});
        return oscillator({frequency:742,endFrequency:880,duration:.26,gain:.14,type:'sine',delay:.092});
      default: return false;
    }
  }
  function setEnabled(value) {
    active=Boolean(value);
    if (!active) {
      setPaused(true);
      if(context?.state==='running') context.suspend().catch(()=>{});
    }
  }
  function setVolume(value) {
    volume=clamp(value,0,1);
    if(master&&context) master.gain.setTargetAtTime(volume,context.currentTime,.02);
  }
  const visibilityHandler=()=>{
    if(document.hidden) {
      setPaused(true);
      if(context?.state==='running') context.suspend().catch(()=>{});
    }
  };
  document.addEventListener('visibilitychange',visibilityHandler);

  return {
    unlock, play, impact, rolling, setPaused, setEnabled, setVolume,
    tone:oscillator,
    get enabled() {return active;},
    get available() {return Boolean(globalThis.AudioContext||globalThis.webkitAudioContext);},
    async destroy() {
      if(destroyed) return;
      destroyed=true;
      document.removeEventListener('visibilitychange',visibilityHandler);
      if(context) {
        for(const node of [noise,rollTone]) { try {node.stop();} catch {} }
        for(const node of nodes) { try {node.disconnect();} catch {} }
        if(context.state!=='closed') await context.close();
      }
      context=null;nodes.length=0;
    }
  };
}

export function createInstrumentHaptics({ enabled = true } = {}) {
  let active=Boolean(enabled);
  let last= -Infinity;
  return {
    pulse(kind,strength=1,now=performance.now()) {
      if (!active || typeof navigator.vibrate!=='function') return false;
      const cooldown=kind==='collision'?95:kind==='click'?48:0;
      if(now-last<cooldown) return false;
      const pattern=hapticDuration(kind,strength);
      if(!pattern) return false;
      try {
        const result=navigator.vibrate(pattern);
        if(result) last=now;
        return Boolean(result);
      } catch {return false;}
    },
    setEnabled(value) { active=Boolean(value); },
    get enabled() {return active;},
    get available() {return typeof navigator.vibrate==='function';}
  };
}
