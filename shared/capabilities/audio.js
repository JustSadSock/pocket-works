export function createAudioFeedback(options = {}) {
  const {
    enabled = true,
    volume = 0.16
  } = options;

  let context = null;
  let master = null;
  let active = Boolean(enabled);
  let gainValue = Math.max(0, Math.min(1, volume));

  const ensureContext = async () => {
    if (!active) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!context) {
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = gainValue;
      master.connect(context.destination);
    }

    if (context.state === 'suspended') await context.resume();
    return context;
  };

  const tone = async (options = {}) => {
    const audioContext = await ensureContext();
    if (!audioContext || !master) return false;

    const {
      frequency = 440,
      endFrequency = frequency,
      duration = 0.08,
      type = 'sine',
      gain = 0.5,
      delay = 0
    } = options;

    const start = audioContext.currentTime + Math.max(0, delay);
    const stop = start + Math.max(0.015, duration);
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), stop);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(0.012, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, stop);

    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(stop + 0.01);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      envelope.disconnect();
    }, { once: true });
    return true;
  };

  const patterns = {
    click: () => tone({ frequency: 520, endFrequency: 420, duration: 0.045, type: 'triangle', gain: 0.22 }),
    success: async () => {
      await tone({ frequency: 540, endFrequency: 650, duration: 0.07, type: 'sine', gain: 0.28 });
      return tone({ frequency: 740, endFrequency: 880, duration: 0.1, type: 'sine', gain: 0.24, delay: 0.055 });
    },
    error: async () => {
      await tone({ frequency: 190, endFrequency: 150, duration: 0.12, type: 'sawtooth', gain: 0.16 });
      return tone({ frequency: 140, endFrequency: 110, duration: 0.14, type: 'sawtooth', gain: 0.12, delay: 0.075 });
    }
  };

  const visibilityHandler = () => {
    if (document.hidden && context?.state === 'running') context.suspend().catch(() => {});
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  return {
    unlock: ensureContext,
    tone,
    play(name) {
      return patterns[name]?.() ?? false;
    },
    setEnabled(value) {
      active = Boolean(value);
      if (!active && context?.state === 'running') context.suspend().catch(() => {});
    },
    setVolume(value) {
      gainValue = Math.max(0, Math.min(1, Number(value) || 0));
      if (master && context) master.gain.setTargetAtTime(gainValue, context.currentTime, 0.015);
    },
    get enabled() {
      return active;
    },
    async destroy() {
      document.removeEventListener('visibilitychange', visibilityHandler);
      if (context && context.state !== 'closed') await context.close();
      context = null;
      master = null;
    }
  };
}
