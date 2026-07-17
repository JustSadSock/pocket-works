export function createFeedback(getPrefs) {
  let context = null;

  function ensureContext() {
    if (!getPrefs().sound) return null;
    if (!context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return null;
      context = new Context();
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  function tone(frequency, duration, options = {}) {
    const audioContext = ensureContext();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime + (options.delay || 0);
    oscillator.type = options.type || 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(options.to, now + duration);
    gain.gain.setValueAtTime(options.volume || 0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  return {
    haptic(pattern) {
      if (getPrefs().haptics && navigator.vibrate) navigator.vibrate(pattern);
    },
    place(color) {
      tone(color === 0 ? 310 : 245, 0.12, { to: color === 0 ? 220 : 175, volume: 0.055 });
    },
    rotate(direction) {
      for (let index = 0; index < 5; index += 1) {
        tone(direction === 1 ? 172 + index * 8 : 212 - index * 8, 0.05, {
          delay: index * 0.06, type: 'square', volume: 0.016
        });
      }
      tone(direction === 1 ? 112 : 94, 0.24, { delay: 0.27, to: 70, volume: 0.032 });
    },
    swap() {
      tone(205, 0.18, { to: 330, volume: 0.04 });
      tone(330, 0.18, { delay: 0.11, to: 205, volume: 0.035 });
    },
    win(color) {
      const base = color === 0 ? 196 : 174;
      [1, 1.25, 1.5, 2].forEach((ratio, index) => tone(base * ratio, 0.42, {
        delay: index * 0.1, volume: 0.045
      }));
    },
    invalid() {
      tone(92, 0.1, { to: 70, type: 'square', volume: 0.025 });
    }
  };
}
