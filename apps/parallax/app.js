function setupEvents() {
  els.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  els.canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  els.canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  els.canvas.addEventListener('pointercancel', () => { pointer = null; });

  document.querySelectorAll('[data-dir]').forEach((button) => {
    button.addEventListener('click', () => move(button.dataset.dir));
  });

  els.continueButton.addEventListener('click', () => loadLevel(progress.current));
  els.homeLevelsButton.addEventListener('click', () => openScreen(els.levels));
  els.levelButton.addEventListener('click', () => openScreen(els.levels));
  els.menuButton.addEventListener('click', () => openScreen(els.settings));
  els.undoButton.addEventListener('click', undo);
  els.resetButton.addEventListener('click', restartLevel);
  els.hintButton.addEventListener('click', () => {
    showToast(state.level.hint, 5200);
    sound('hint');
  });

  els.nextButton.addEventListener('click', () => {
    if (state.index >= LEVELS.length - 1) openScreen(els.levels);
    else loadLevel(state.index + 1);
  });
  els.replayButton.addEventListener('click', restartLevel);

  els.soundToggle.addEventListener('click', () => toggleSetting('sound', els.soundToggle));
  els.hapticsToggle.addEventListener('click', () => toggleSetting('haptics', els.hapticsToggle));
  els.wipeButton.addEventListener('click', () => {
    const accepted = window.confirm('Удалить все пройденные уровни и рекорды?');
    if (!accepted) return;
    progress = defaultProgress();
    saveProgress();
    syncSettingsUI();
    buildLevelGrid();
    updateHomeProgress();
    loadLevel(0);
    openHome();
  });

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelector(`#${button.dataset.close}`).hidden = true;
      requestRender();
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') move('up');
    if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') move('down');
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') move('left');
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') move('right');
    if (event.key.toLowerCase() === 'z') undo();
    if (event.key.toLowerCase() === 'r') restartLevel();
    if (event.key === 'Escape') {
      if (isScreenOpen()) closeAllScreens();
      else openScreen(els.settings);
      requestRender();
    }
  });

  window.addEventListener('resize', requestRender);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(frameHandle);
    else requestRender();
  });
}

function ensureAudio() {
  if (!progress.sound) return null;
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function sound(type) {
  const audio = ensureAudio();
  if (!audio) return;
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.connect(audio.destination);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.045, now + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .18);

  const oscillator = audio.createOscillator();
  oscillator.type = type === 'invalid' ? 'square' : 'sine';
  const frequencies = {
    move: 240,
    lens: 370,
    shard: 620,
    complete: 780,
    invalid: 115,
    undo: 180,
    reset: 150,
    hint: 460
  };
  oscillator.frequency.setValueAtTime(frequencies[type] || 260, now);
  if (type === 'complete') oscillator.frequency.exponentialRampToValueAtTime(1170, now + .16);
  if (type === 'shard') oscillator.frequency.exponentialRampToValueAtTime(900, now + .12);
  oscillator.connect(gain);
  oscillator.start(now);
  oscillator.stop(now + .2);
}

function haptic(pattern) {
  if (!progress.haptics || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

function validateLevels() {
  LEVELS.forEach((level, index) => {
    const widths = level.grid.map((row) => row.length);
    if (new Set(widths).size !== 1) console.warn(`Level ${index + 1} has inconsistent row widths`, widths);
    const source = level.grid.join('');
    if (!source.includes('S') || !source.includes('E')) console.warn(`Level ${index + 1} misses S or E`);
  });
}

validateLevels();
setupEvents();
syncSettingsUI();
buildLevelGrid();
updateHomeProgress();
loadLevel(progress.current, { closeScreens: false });
openHome();
requestRender();
