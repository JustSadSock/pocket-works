export function createCrabAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  const ensure = async () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!context) {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);
      noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.16), context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (context.state === 'suspended') await context.resume();
    return context;
  };

  const ping = async (frequency, duration = 0.09, gain = 0.2, delay = 0) => {
    const ctx = await ensure();
    if (!ctx || !master) return;
    const now = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = Math.random() > 0.5 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency * (0.97 + Math.random() * 0.06), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.82), now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain * (0.88 + Math.random() * 0.22), now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  };

  const noiseHit = async (duration = 0.085, cutoff = 1200, gain = 0.13) => {
    const ctx = await ensure();
    if (!ctx || !master || !noiseBuffer) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff * (0.82 + Math.random() * 0.35);
    filter.Q.value = 1.2 + Math.random() * 1.8;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain * (0.85 + Math.random() * 0.25), now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(now, Math.random() * 0.035, duration);
  };

  return {
    unlock: ensure,
    async collect(index = 0) {
      const root = 620 + (index % 4) * 55;
      await ping(root, 0.075, 0.18);
      void ping(root * 1.48, 0.12, 0.13, 0.045);
    },
    pinch() {
      void noiseHit(0.075, 900, 0.16);
      void ping(150 + Math.random() * 25, 0.065, 0.15);
    },
    step(intensity = 1) {
      if (Math.random() > 0.45) return;
      void noiseHit(0.045, 420 + Math.random() * 260, 0.045 * intensity);
    },
    victory() {
      [440, 554, 659, 880].forEach((frequency, index) => void ping(frequency, 0.16, 0.14, index * 0.075));
    }
  };
}
