export function createYardSound({ enabled = true } = {}) {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let activeVoices = 0;
  let isEnabled = Boolean(enabled);

  function ensureContext() {
    if (!isEnabled) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!context) {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.38;
      master.connect(context.destination);
      const length = Math.max(1, Math.floor(context.sampleRate * 0.45));
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const channel = noiseBuffer.getChannelData(0);
      let previous = 0;
      for (let index = 0; index < length; index += 1) {
        const white = Math.random() * 2 - 1;
        previous = previous * 0.18 + white * 0.82;
        channel[index] = previous;
      }
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  function voice() {
    if (activeVoices >= 6) return false;
    activeVoices += 1;
    return true;
  }

  function finishVoice(node) {
    node.addEventListener('ended', () => { activeVoices = Math.max(0, activeVoices - 1); }, { once: true });
  }

  function noise({ duration = 0.1, frequency = 1300, q = 1.1, gain = 0.13, type = 'bandpass' } = {}) {
    const audio = ensureContext();
    if (!audio || !voice()) return;
    const now = audio.currentTime;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const envelope = audio.createGain();
    source.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency * (0.975 + Math.random() * 0.05), now);
    filter.Q.value = q;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration * (0.96 + Math.random() * 0.08));
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(now);
    source.stop(now + duration + 0.03);
    finishVoice(source);
  }

  function tone({ frequency = 180, duration = 0.12, gain = 0.08, wave = 'triangle', slide = 0.82 } = {}) {
    const audio = ensureContext();
    if (!audio || !voice()) return;
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency * (0.98 + Math.random() * 0.04), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * slide), now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
    finishVoice(oscillator);
  }

  return {
    unlock() { ensureContext(); },
    hit() {
      noise({ duration: 0.075, frequency: 1850, q: 1.7, gain: 0.12 });
      tone({ frequency: 245, duration: 0.13, gain: 0.09, wave: 'triangle', slide: 0.58 });
      tone({ frequency: 910, duration: 0.045, gain: 0.035, wave: 'sine', slide: 0.7 });
    },
    miss() {
      noise({ duration: 0.09, frequency: 540, q: 0.8, gain: 0.1, type: 'lowpass' });
      tone({ frequency: 92, duration: 0.12, gain: 0.06, wave: 'triangle', slide: 0.72 });
    },
    select() {
      noise({ duration: 0.035, frequency: 2600, q: 2.4, gain: 0.035, type: 'highpass' });
    },
    finish() {
      noise({ duration: 0.12, frequency: 1450, q: 1.1, gain: 0.07 });
      tone({ frequency: 330, duration: 0.2, gain: 0.075, wave: 'triangle', slide: 1.38 });
    },
    setEnabled(value) {
      isEnabled = Boolean(value);
      if (!isEnabled && master && context) master.gain.setTargetAtTime(0, context.currentTime, 0.035);
      if (isEnabled && master && context) master.gain.setTargetAtTime(0.38, context.currentTime, 0.035);
    },
    dispose() {
      if (context && context.state !== 'closed') context.close().catch(() => {});
      context = null;
      master = null;
      noiseBuffer = null;
      activeVoices = 0;
    }
  };
}
