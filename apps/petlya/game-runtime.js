function renderGame(rebuild = false) {
  if (!state.session || state.session.levelId !== currentLevel.id) ensureSession(currentIndex, true);
  currentSimulation = simulate(currentLevel, state.session.echoes, state.session.current);
  if (rebuild) buildBoard();
  const chapter = CHAPTERS.find((item) => item.id === currentLevel.chapter);
  dom.levelKicker.textContent = `КАМЕРА ${currentLevel.id} · ${chapter.number}`;
  dom.levelTitle.textContent = currentLevel.title;
  dom.beat.textContent = `${state.session.current.length} / ${currentLevel.loop}`;
  dom.echo.textContent = `${state.session.echoes.length} / ${currentLevel.maxEchoes}`;
  dom.hint.textContent = contextualHint();
  renderCells();
  renderTrails();
  renderActors();
  renderSeals();
  renderTimeline();
  syncControls();
  syncSoundButtons();
}

function renderCells() {
  for (const node of $$('.cell', dom.cells)) {
    const type = node.dataset.type;
    if (/[abcuvw]/.test(type)) node.classList.toggle('is-active', plateActive(currentLevel, currentSimulation.actors, type));
    if (/[ABCUVW]/.test(type)) node.classList.toggle('is-open', Boolean(currentSimulation.gates.get(type.toLowerCase())));
    if (type === 'E') {
      const allActive = currentLevel.required.every((key) => currentSimulation.active.get(key));
      node.classList.toggle('is-ready', allActive);
      node.classList.toggle('is-occupied', samePosition(currentSimulation.current.position, currentLevel.exit));
    }
  }
}

function pathData(trail) {
  return trail.map((point, index) => `${index ? 'L' : 'M'} ${point.x + 0.5} ${point.y + 0.5}`).join(' ');
}

function renderTrails() {
  dom.trails.innerHTML = currentSimulation.actors.map((actor) => {
    const className = actor.echo ? `trail echo-trail echo-${actor.index + 1}` : 'trail current-trail';
    return `<path class="${className}" d="${pathData(actor.trail)}"></path>`;
  }).join('');
}

function actorPositionStyle(position) {
  return `left:${((position.x + 0.5) / currentLevel.cols) * 100}%;top:${((position.y + 0.5) / currentLevel.rows) * 100}%`;
}

function renderActors() {
  dom.actors.innerHTML = currentSimulation.actors.map((actor) => {
    if (actor.echo) {
      return `<div class="actor echo-actor echo-${actor.index + 1}" style="${actorPositionStyle(actor.position)}"><span>${actor.index + 1}</span></div>`;
    }
    return `<div class="actor current-actor" style="${actorPositionStyle(actor.position)}"><span class="actor-hand"></span></div>`;
  }).join('');
}

function sealLabel(key, index) {
  const names = ['I', 'II', 'III'];
  return names[index] || key.toUpperCase();
}

function renderSeals() {
  if (!currentLevel.required.length) {
    dom.seals.innerHTML = '<span class="no-seals">ВЫХОД СВОБОДЕН</span>';
    return;
  }
  dom.seals.innerHTML = currentLevel.required.map((key, index) => {
    const active = currentSimulation.active.get(key);
    return `<span class="seal ${active ? 'is-active' : ''} ${isEchoOnlyPlate(key) ? 'is-ghost' : ''}" aria-label="Печать ${index + 1}: ${active ? 'активна' : 'неактивна'}">${sealLabel(key, index)}</span>`;
  }).join('');
}

function renderTimeline() {
  const route = state.session.current;
  dom.timeline.innerHTML = Array.from({ length: currentLevel.loop }, (_, index) => {
    const code = route[index];
    const label = code ? MOVES[code].label : String(index + 1).padStart(2, '0');
    return `<span class="tick ${code ? 'is-filled' : ''} ${index === route.length ? 'is-next' : ''}">${label}</span>`;
  }).join('');
}

function contextualHint() {
  if (samePosition(currentSimulation.current.position, currentLevel.exit) && !currentLevel.required.every((key) => currentSimulation.active.get(key))) {
    return 'Ты уже у выхода, но печати не совпали. Подожди несколько тактов.';
  }
  if (currentLevel.id === '02' && state.session.echoes.length === 0 && state.session.current === 'R') {
    return 'Теперь нажми «Записать и отмотать». Маршрут останется на кнопке.';
  }
  if (currentLevel.id === '13' && state.session.echoes.length === 0 && state.session.current.includes('R')) {
    return 'Ты стоишь на печати, но она глуха к настоящему. Сделай маршрут эхом.';
  }
  if (state.session.current.length === currentLevel.loop - 1) return 'Остался последний такт. После него маршрут запишется автоматически.';
  return currentLevel.hint;
}

function syncControls() {
  const hasCurrent = state.session.current.length > 0;
  dom.undo.disabled = !hasCurrent || busy;
  dom.record.disabled = !hasCurrent || busy;
  dom.eraseEcho.disabled = state.session.echoes.length === 0 || busy;
  for (const button of $$('[data-move]')) button.disabled = busy || state.session.current.length >= currentLevel.loop;
}

function applyMove(code) {
  if (activeScreen !== 'game' || busy || !state.session || !MOVES[code]) return;
  if (state.session.current.length >= currentLevel.loop) return;
  currentSimulation = simulate(currentLevel, state.session.echoes, state.session.current);
  if (!canCurrentMove(code)) {
    showFeedback('Затвор не пускает', 'bad');
    pulseBoard('blocked');
    playTone(92, 0.08, 0.045, 'square');
    vibrate(18);
    return;
  }
  state.session.current += code;
  saveState();
  playMoveSound(code);
  renderGame();
  if (currentSimulation.success) {
    completeLevel();
  } else if (state.session.current.length >= currentLevel.loop) {
    busy = true;
    syncControls();
    setTimeout(() => {
      archiveCurrent(true);
      busy = false;
      renderGame();
    }, reducedMotion ? 40 : 280);
  }
}

function archiveCurrent(automatic = false) {
  if (!state.session?.current) return;
  const route = state.session.current;
  if (state.session.echoes.length >= currentLevel.maxEchoes) {
    state.session.echoes.shift();
    showFeedback('Старейшее эхо вытеснено', 'warn');
  } else {
    showFeedback(automatic ? 'Цикл завершён · маршрут записан' : 'Маршрут записан', 'good');
  }
  state.session.echoes.push(route);
  state.session.current = '';
  state.session.recordings += 1;
  saveState();
  pulseBoard('rewinding');
  playRewindSound();
  vibrate([14, 24, 20]);
}

function undoMove() {
  if (!state.session?.current || busy) return;
  state.session.current = state.session.current.slice(0, -1);
  saveState();
  renderGame();
  playTone(150, 0.05, 0.025, 'triangle');
}

function eraseLastEcho() {
  if (!state.session?.echoes.length || busy) return;
  openConfirm('СТЕРЕТЬ ПОСЛЕДНЕЕ ЭХО?', 'Текущий незаписанный маршрут останется на месте.', () => {
    state.session.echoes.pop();
    state.session.recordings = Math.max(0, state.session.recordings - 1);
    saveState();
    closeSheets();
    renderGame();
    showFeedback('Последнее эхо стёрто', 'warn');
  });
}

function restartCurrentLevel() {
  ensureSession(currentIndex, true);
  closeSheets();
  showScreen('game');
  showFeedback('Камера очищена', 'warn');
}

function completeLevel() {
  busy = true;
  const recordings = state.session.recordings;
  const prior = state.completed[currentLevel.id]?.best;
  const best = Number.isFinite(prior) ? Math.min(prior, recordings) : recordings;
  state.completed[currentLevel.id] = { best };
  state.unlocked = Math.max(state.unlocked, Math.min(LEVELS.length, currentIndex + 2));
  state.currentLevel = Math.min(LEVELS.length - 1, currentIndex + 1);
  lastResult = { index: currentIndex, recordings, best, par: currentLevel.par };
  state.session = null;
  saveState();
  renderWin();
  playSuccessSound(recordings <= currentLevel.par);
  vibrate([18, 35, 24]);
  setTimeout(() => {
    showSheet(dom.winSheet);
    busy = false;
  }, reducedMotion ? 20 : 260);
}

function renderWin() {
  if (!lastResult) return;
  const stars = starCount(LEVELS[lastResult.index], lastResult.recordings);
  dom.winStamp.textContent = '✦'.repeat(stars) + '·'.repeat(3 - stars);
  dom.winTitle.textContent = stars === 3 ? 'ЧИСТАЯ ПЕТЛЯ' : stars === 2 ? 'ПЕТЛЯ ДЕРЖИТСЯ' : 'АРХИВ ПРИНЯЛ';
  dom.winCopy.textContent = stars === 3
    ? 'Ни одной лишней перезаписи. Прошлое сработало как часы.'
    : stars === 2
      ? 'Решение устойчивое, но архив видел лишний виток.'
      : 'Камера закрыта. Красиво было не всегда, зато причинность выжила.';
  dom.winRecordings.textContent = String(lastResult.recordings);
  dom.winPar.textContent = String(lastResult.par);
  dom.winBest.textContent = String(lastResult.best);
  dom.next.textContent = lastResult.index >= LEVELS.length - 1 ? 'Вернуться в архив' : 'Следующая камера';
}

function showFeedback(message, tone = 'good') {
  clearTimeout(feedbackTimer);
  dom.feedback.textContent = message;
  dom.feedback.dataset.tone = tone;
  dom.feedback.hidden = false;
  requestAnimationFrame(() => dom.feedback.classList.add('is-visible'));
  feedbackTimer = setTimeout(() => {
    dom.feedback.classList.remove('is-visible');
    setTimeout(() => { dom.feedback.hidden = true; }, 180);
  }, 1500);
}

function pulseBoard(className) {
  dom.stage.classList.remove('blocked', 'rewinding');
  void dom.stage.offsetWidth;
  dom.stage.classList.add(className);
  setTimeout(() => dom.stage.classList.remove(className), reducedMotion ? 50 : 520);
}

function ensureAudio() {
  if (!state.sound) return null;
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function playTone(frequency, duration = 0.06, volume = 0.035, type = 'sine', delay = 0) {
  const context = ensureAudio();
  if (!context || !state.sound) return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function playChord(frequencies, volume = 0.035) {
  frequencies.forEach((frequency, index) => playTone(frequency, 0.12, volume, 'triangle', index * 0.045));
}

function playMoveSound(code) {
  const base = { U: 244, D: 196, L: 218, R: 276, W: 132 }[code];
  playTone(base, 0.045, code === 'W' ? 0.018 : 0.028, code === 'W' ? 'sine' : 'triangle');
}

function playRewindSound() {
  [310, 252, 204, 162].forEach((frequency, index) => playTone(frequency, 0.11, 0.03, 'triangle', index * 0.035));
}

function playSuccessSound(perfect) {
  const root = perfect ? 196 : 174;
  [1, 1.25, 1.5, 2].forEach((ratio, index) => playTone(root * ratio, 0.2, 0.036, 'triangle', index * 0.07));
}

function vibrate(pattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function toggleSound() {
  state.sound = !state.sound;
  saveState();
  syncSoundButtons();
  if (state.sound) playTone(280, 0.07, 0.03, 'triangle');
}

function syncSoundButtons() {
  for (const button of $$('[data-sound-toggle]')) {
    button.textContent = state.sound ? 'Звук' : 'Тихо';
    button.setAttribute('aria-pressed', String(state.sound));
    button.setAttribute('aria-label', state.sound ? 'Выключить звук' : 'Включить звук');
  }
}

function openHelp() {
  showSheet(dom.helpSheet);
}

function onPointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  dom.stage.setPointerCapture?.(event.pointerId);
}

function onPointerUp(event) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  const distance = Math.hypot(dx, dy);
  gesture = null;
  dom.stage.releasePointerCapture?.(event.pointerId);
  if (distance < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) applyMove(dx > 0 ? 'R' : 'L');
  else applyMove(dy > 0 ? 'D' : 'U');
}

function onPointerCancel(event) {
  if (gesture?.id === event.pointerId) gesture = null;
}

function onKeyDown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'Escape') {
    if (!dom.winSheet.hidden) return;
    if (!dom.confirmSheet.hidden || !dom.helpSheet.hidden || !dom.pauseSheet.hidden) closeSheets();
    else if (activeScreen === 'game') showSheet(dom.pauseSheet);
    return;
  }
  if (activeScreen !== 'game' || !dom.pauseSheet.hidden || !dom.winSheet.hidden) return;
  const keyMap = { ArrowUp: 'U', w: 'U', W: 'U', ArrowDown: 'D', s: 'D', S: 'D', ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ' ': 'W' };
  if (keyMap[event.key]) {
    event.preventDefault();
    applyMove(keyMap[event.key]);
  } else if (event.key === 'z' || event.key === 'Z') undoMove();
  else if (event.key === 'r' || event.key === 'R') archiveCurrent();
}

function nextFromWin() {
  if (!lastResult) return;
  if (lastResult.index >= LEVELS.length - 1) {
    showScreen('archive');
  } else {
    startLevel(lastResult.index + 1, true);
  }
}

function registerEvents() {
  dom.continue.addEventListener('click', () => {
    if (state.session) startLevel(resolveSessionIndex(), false);
    else if (Object.keys(state.completed).length === LEVELS.length) startLevel(LEVELS.length - 1, true);
    else startLevel(Math.min(state.unlocked - 1, LEVELS.length - 1), true);
  });
  dom.archiveButton.addEventListener('click', () => showScreen('archive'));
  dom.helpButton.addEventListener('click', openHelp);
  dom.archiveBack.addEventListener('click', () => showScreen('menu'));
  dom.pause.addEventListener('click', () => showSheet(dom.pauseSheet));
  dom.resume.addEventListener('click', closeSheets);
  dom.restart.addEventListener('click', () => openConfirm('НАЧАТЬ ЗАНОВО?', 'Все эха и текущий маршрут этой камеры будут стёрты.', restartCurrentLevel));
  dom.pauseArchive.addEventListener('click', () => showScreen('archive'));
  dom.pauseHelp.addEventListener('click', openHelp);
  dom.helpClose.addEventListener('click', closeSheets);
  dom.undo.addEventListener('click', undoMove);
  dom.eraseEcho.addEventListener('click', eraseLastEcho);
  dom.record.addEventListener('click', () => { archiveCurrent(false); renderGame(); });
  dom.next.addEventListener('click', nextFromWin);
  dom.replay.addEventListener('click', () => lastResult && startLevel(lastResult.index, true));
  dom.winArchive.addEventListener('click', () => showScreen('archive'));
  dom.confirmCancel.addEventListener('click', closeSheets);
  dom.confirmAccept.addEventListener('click', () => {
    const action = confirmAction;
    confirmAction = null;
    action?.();
  });
  for (const button of $$('[data-move]')) button.addEventListener('click', () => applyMove(button.dataset.move));
  for (const button of $$('[data-sound-toggle]')) button.addEventListener('click', toggleSound);
  dom.stage.addEventListener('pointerdown', onPointerDown);
  dom.stage.addEventListener('pointerup', onPointerUp);
  dom.stage.addEventListener('pointercancel', onPointerCancel);
  dom.stage.addEventListener('lostpointercapture', onPointerCancel);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(); });
  addEventListener('pagehide', saveState);
}

createWorkshopMode({
  appName: 'ПЕТЛЯ',
  version: '1.0.0',
  cachePrefix: 'petlya-',
  storageNamespace: 'pocket-works:petlya',
  onReset() {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
  dom.network.textContent = online ? 'СИНХРОНИЗАЦИЯ НЕ НУЖНА' : 'ОФЛАЙН ГОТОВ';
});

registerEvents();
renderMenu();
