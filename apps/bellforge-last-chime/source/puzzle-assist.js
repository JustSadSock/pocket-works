export const TONE_FREQUENCIES = [220, 277.18, 349.23, 440, 554.37, 698.46, 880, 1108.73];
export const PUZZLE_TARGETS = {
  market: [2, 5, 1],
  tower: [6, 2, 4]
};

export function normalizeToneValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? ((Math.trunc(numeric) % 8) + 8) % 8 : 0;
}

export function toneFrequency(value) {
  return TONE_FREQUENCIES[normalizeToneValue(value)];
}

export function puzzleModeFromTitle(title = '') {
  return String(title).toUpperCase().includes('БАШЕН') ? 'tower' : 'market';
}

export function installPuzzleAssist() {
  const panel = document.querySelector('#puzzlePanel');
  const title = document.querySelector('#puzzleTitle');
  const referenceButton = document.querySelector('#referencePattern');
  const referenceBars = [...document.querySelectorAll('[data-reference-tone]')];
  const ringButtons = [...document.querySelectorAll('.ring-button')];
  if (!panel || !title || !referenceButton || ringButtons.length !== 3) return;

  let audioContext = null;
  let patternToken = 0;

  const settingsMuted = () => {
    try {
      const settings = JSON.parse(localStorage.getItem('pocket-works:bellforge-last-chime:settings') || '{}');
      return Boolean(settings?.muted);
    } catch {
      return false;
    }
  };

  const context = () => {
    if (settingsMuted()) return null;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    audioContext ||= new AC();
    if (audioContext.state === 'suspended') void audioContext.resume();
    return audioContext;
  };

  const playTone = (value, pan = 0, duration = 0.34, gain = 0.07) => {
    const ctx = context();
    if (!ctx) return;
    const frequency = toneFrequency(value);
    const now = ctx.currentTime;
    const master = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const oscillator = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    overtone.type = normalizeToneValue(value) % 2 ? 'triangle' : 'sine';
    overtone.frequency.value = frequency * 2;
    overtoneGain.gain.value = 0.18;
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(5600, frequency * 5.5);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(filter);
    overtone.connect(overtoneGain).connect(filter);
    filter.connect(master);
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      master.connect(panner).connect(ctx.destination);
    } else {
      master.connect(ctx.destination);
    }
    oscillator.start(now);
    overtone.start(now);
    oscillator.stop(now + duration + 0.04);
    overtone.stop(now + duration + 0.04);
  };

  const syncReference = () => {
    const mode = puzzleModeFromTitle(title.textContent);
    const target = PUZZLE_TARGETS[mode];
    referenceBars.forEach((bar, index) => {
      const value = target[index];
      const ratio = (value + 1) / 8;
      bar.style.setProperty('--reference-level', String(ratio));
      bar.dataset.tone = String(value);
    });
    referenceButton.dataset.mode = mode;
  };

  const syncRing = (button, index) => {
    const valueNode = button.querySelector('b');
    const value = normalizeToneValue(valueNode?.textContent);
    button.dataset.tone = String(value);
    button.style.setProperty('--tone-level', String((value + 1) / 8));
    button.setAttribute('aria-label', `Кольцо ${index + 1}, резонанс ${value}. Коснись, чтобы изменить.`);
  };

  const syncAllRings = () => ringButtons.forEach(syncRing);

  referenceButton.addEventListener('click', () => {
    syncReference();
    const mode = referenceButton.dataset.mode || 'market';
    const target = PUZZLE_TARGETS[mode];
    const token = ++patternToken;
    referenceButton.classList.add('playing');
    target.forEach((value, index) => {
      setTimeout(() => {
        if (token !== patternToken) return;
        playTone(value, (index - 1) * 0.34, 0.42, 0.085);
        const bar = referenceBars[index];
        bar?.classList.add('active');
        setTimeout(() => bar?.classList.remove('active'), 280);
      }, index * 520);
    });
    setTimeout(() => {
      if (token === patternToken) referenceButton.classList.remove('playing');
    }, 1550);
  });

  ringButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      setTimeout(() => {
        syncRing(button, index);
        const value = normalizeToneValue(button.querySelector('b')?.textContent);
        playTone(value, (index - 1) * 0.34, 0.34, 0.075);
        button.classList.remove('tone-hit');
        requestAnimationFrame(() => button.classList.add('tone-hit'));
        setTimeout(() => button.classList.remove('tone-hit'), 220);
      }, 0);
    });
  });

  const observer = new MutationObserver(() => {
    if (!panel.classList.contains('hidden')) {
      syncReference();
      syncAllRings();
    }
  });
  observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
  observer.observe(title, { childList: true, subtree: true });
  ringButtons.forEach((button) => observer.observe(button, { childList: true, subtree: true }));

  syncReference();
  syncAllRings();
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    patternToken += 1;
    if (audioContext?.state === 'running') void audioContext.suspend();
  }, { once: true });
}
