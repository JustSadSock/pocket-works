function bindEvents() {
  playButton.addEventListener('click', () => {
    if (state.fossilIndex !== null) exitFossil();
    state.paused = !state.paused;
    syncTransportUI();
    tone(state.paused ? 180 : 290, .05, .018, 'square');
  });

  speedButton.addEventListener('click', () => {
    state.speedIndex = (state.speedIndex + 1) % 3;
    syncTransportUI();
    tone([240, 320, 410][state.speedIndex], .045, .016, 'triangle');
    showToast(`Скорость ${['×1', '×4', '×16'][state.speedIndex]}`, 900);
  });

  historyRange.addEventListener('input', () => selectHistory(Number(historyRange.value)));
  nowButton.addEventListener('click', () => { exitFossil(); tone(330, .05, .018); });

  const pressureBindings = [
    [temperatureInput, temperatureOutput, 'temperature'],
    [foodInput, foodOutput, 'food'],
    [mutationInput, mutationOutput, 'mutation']
  ];
  for (const [input, output, key] of pressureBindings) {
    input.addEventListener('input', () => {
      exitFossil();
      state.env[key] = Number(input.value) / 100;
      output.textContent = input.value;
      syncPressureUI();
    });
    input.addEventListener('change', () => {
      tone(220 + Number(input.value) * 2, .04, .012);
      saveState();
    });
  }

  viewTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    state.view = button.dataset.view;
    clearSelection();
    syncViewUI();
    tone(state.view === 'world' ? 260 : state.view === 'tree' ? 340 : 190, .05, .016, 'triangle');
  });

  cataclysmButton.addEventListener('click', openCataclysmSheet);
  seedButton.addEventListener('click', () => {
    if (state.fossilIndex !== null) exitFossil();
    state.seedMode = !state.seedMode;
    seedButton.setAttribute('aria-pressed', String(state.seedMode));
    showToast(state.seedMode ? 'Коснись среды, чтобы поселить основателя' : 'Заселение отменено', 1600);
    pulse(7);
  });
  reseedEmpty.addEventListener('click', () => seedAt(.5, .5, 18));
  lensButton.addEventListener('click', () => {
    state.lens = !state.lens;
    lensButton.setAttribute('aria-pressed', String(state.lens));
    showToast(state.lens ? 'Линза отбора показывает приспособленность' : 'Линза отбора выключена', 1500);
    tone(state.lens ? 470 : 230, .06, .015, 'sine');
  });

  menuButton.addEventListener('click', openMenuSheet);
  soundButton.addEventListener('click', () => {
    settings.sound = !settings.sound;
    persistSettings();
    syncSoundButton();
    if (settings.sound) tone(360, .07, .025, 'triangle');
  });

  backdrop.addEventListener('click', closeSheet);
  closeSheetButton.addEventListener('click', closeSheet);
  sheetBody.addEventListener('click', (event) => {
    const shock = event.target.closest('[data-shock]');
    if (shock) {
      applyCataclysm(shock.dataset.shock);
      return;
    }
    const menu = event.target.closest('[data-menu]');
    if (menu) {
      const action = menu.dataset.menu;
      if (action === 'sound') {
        settings.sound = !settings.sound;
        persistSettings();
        syncSoundButton();
        openMenuSheet();
      } else if (action === 'export') exportWorld();
      else if (action === 'import') importInput.click();
      else if (action === 'about') openAboutSheet();
      else if (action === 'reset') confirmReset();
      return;
    }
    const confirmation = event.target.closest('[data-confirm]');
    if (confirmation?.dataset.confirm === 'cancel') closeSheet();
    if (confirmation?.dataset.confirm === 'reset') {
      removeStoredWorld();
      state.paused = true;
      syncTransportUI();
      closeSheet();
      selectedSeed = 'garden';
      intro.hidden = false;
      syncIntroSeeds();
    }
  });

  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (file) importWorld(file);
    importInput.value = '';
  });

  document.querySelector('.world-seeds').addEventListener('click', (event) => {
    const button = event.target.closest('[data-seed]');
    if (!button) return;
    selectedSeed = button.dataset.seed;
    syncIntroSeeds();
    tone(250 + [...document.querySelectorAll('[data-seed]')].indexOf(button) * 70, .05, .015, 'triangle');
  });
  introStart.addEventListener('click', () => {
    buildWorld(selectedSeed);
    intro.hidden = true;
    chord('birth');
  });

  canvas.addEventListener('pointerdown', (event) => {
    pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* synthetic or cancelled pointers do not need capture */ }
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    const elapsed = performance.now() - pointerDown.time;
    pointerDown = null;
    if (moved < 14 && elapsed < 650) handleCanvasTap(event);
  });
  canvas.addEventListener('pointercancel', () => { pointerDown = null; });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      wasRunningBeforeHidden = !state.paused;
      state.paused = true;
      saveState();
    } else if (wasRunningBeforeHidden) {
      state.paused = false;
      wasRunningBeforeHidden = false;
    }
    syncTransportUI();
  });
  window.addEventListener('beforeunload', saveState);
}

function syncIntroSeeds() {
  document.querySelectorAll('[data-seed]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.seed === selectedSeed)));
}

function boot() {
  bindEvents();
  resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(observatory);
  syncIntroSeeds();
  syncSoundButton();
  if (!loadState()) {
    intro.hidden = false;
    buildWorld('garden');
    removeStoredWorld();
    state.paused = true;
  } else {
    intro.hidden = true;
  }
  requestAnimationFrame(frame);
}

boot();
