import {
  LEVELS,
  PORTAL_META,
  defaultFacing,
  flipFacing,
  parseSlot,
  scoreRun,
  simulate,
  slotCenter,
  validFacings,
  validatePlacements
} from './game-core.js';

const STORAGE_KEY = 'pocket-works:rebro:state:v1';
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const dom = {
  app: document.querySelector('#app'),
  boardShell: document.querySelector('#boardShell'),
  canvas: document.querySelector('#boardCanvas'),
  levelCounter: document.querySelector('#levelCounter'),
  missionKicker: document.querySelector('#missionKicker'),
  missionTitle: document.querySelector('#missionTitle'),
  missionBrief: document.querySelector('#missionBrief'),
  compactStatus: document.querySelector('#compactStatus'),
  statusLamp: document.querySelector('#statusLamp'),
  crystalStatus: document.querySelector('#crystalStatus'),
  runStatus: document.querySelector('#runStatus'),
  runsValue: document.querySelector('#runsValue'),
  hintsValue: document.querySelector('#hintsValue'),
  bestValue: document.querySelector('#bestValue'),
  portalRack: document.querySelector('#portalRack'),
  flipButton: document.querySelector('#flipButton'),
  removeButton: document.querySelector('#removeButton'),
  resetButton: document.querySelector('#resetButton'),
  runButton: document.querySelector('#runButton'),
  hintButton: document.querySelector('#hintButton'),
  levelsButton: document.querySelector('#levelsButton'),
  dragLabel: document.querySelector('#dragLabel'),
  toast: document.querySelector('#toast'),
  introOverlay: document.querySelector('#introOverlay'),
  introStartButton: document.querySelector('#introStartButton'),
  mapOverlay: document.querySelector('#mapOverlay'),
  mapCloseButton: document.querySelector('#mapCloseButton'),
  levelGrid: document.querySelector('#levelGrid'),
  soundButton: document.querySelector('#soundButton'),
  hapticsButton: document.querySelector('#hapticsButton'),
  clearProgressButton: document.querySelector('#clearProgressButton'),
  resultOverlay: document.querySelector('#resultOverlay'),
  resultGlyph: document.querySelector('#resultGlyph'),
  resultKicker: document.querySelector('#resultKicker'),
  resultTitle: document.querySelector('#resultTitle'),
  resultCopy: document.querySelector('#resultCopy'),
  resultRuns: document.querySelector('#resultRuns'),
  resultHints: document.querySelector('#resultHints'),
  nextButton: document.querySelector('#nextButton'),
  replayButton: document.querySelector('#replayButton'),
  resultMapButton: document.querySelector('#resultMapButton')
};

const ctx = dom.canvas.getContext('2d', { alpha: true });

function defaultSave() {
  return {
    version: 1,
    seenIntro: false,
    currentLevel: 0,
    unlocked: 1,
    best: {},
    placements: {},
    sessions: {},
    sound: true,
    haptics: true
  };
}

function loadSave() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || parsed.version !== 1) return defaultSave();
    return {
      ...defaultSave(),
      ...parsed,
      best: parsed.best && typeof parsed.best === 'object' ? parsed.best : {},
      placements: parsed.placements && typeof parsed.placements === 'object' ? parsed.placements : {},
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {}
    };
  } catch {
    return defaultSave();
  }
}

const save = loadSave();

const state = {
  levelIndex: Math.min(Math.max(0, Number(save.currentLevel) || 0), LEVELS.length - 1),
  placements: {},
  selectedPortal: null,
  running: false,
  orbWorld: null,
  orbAlpha: 1,
  animatedCollected: new Set(),
  lastTrace: [],
  flashPortals: new Set(),
  hintSlot: null,
  drag: null,
  layout: null,
  socketHits: [],
  portalHits: [],
  toastTimer: 0,
  drawRequested: false,
  clearArmed: false,
  audioContext: null
};

function levelKey() {
  return String(currentLevel().id);
}

function currentLevel() {
  return LEVELS[state.levelIndex];
}

function currentSession() {
  const key = levelKey();
  if (!save.sessions[key]) save.sessions[key] = { runs: 0, hints: 0 };
  return save.sessions[key];
}

function sanitizePlacements(levelData, candidate) {
  const clean = {};
  const used = new Set();
  for (const portalId of levelData.portals) {
    const placement = candidate?.[portalId];
    if (!placement || !levelData.sockets.includes(placement.slot) || used.has(placement.slot)) continue;
    const facings = validFacings(placement.slot);
    clean[portalId] = {
      slot: placement.slot,
      facing: facings.includes(placement.facing) ? placement.facing : facings[0]
    };
    used.add(placement.slot);
  }
  return clean;
}

function persist() {
  save.currentLevel = state.levelIndex;
  save.placements[levelKey()] = structuredClone(state.placements);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // The game remains fully usable if private storage is unavailable.
  }
}

function setStatus(text, mode = 'idle') {
  dom.runStatus.textContent = text;
  dom.runStatus.parentElement.classList.toggle('is-error', mode === 'error');
  dom.runStatus.parentElement.classList.toggle('is-success', mode === 'success');
  dom.compactStatus.textContent = mode === 'running' ? 'ИМПУЛЬС' : mode === 'success' ? 'ЗАМКНУТО' : mode === 'error' ? 'ОБРЫВ' : 'МОНТАЖ';
  dom.compactStatus.parentElement.classList.toggle('is-running', mode === 'running');
  dom.compactStatus.parentElement.classList.toggle('is-error', mode === 'error');
  dom.compactStatus.parentElement.classList.toggle('is-success', mode === 'success');
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add('is-visible');
  state.toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), 1800);
}

function haptic(pattern = 12) {
  if (!save.haptics || !('vibrate' in navigator)) return;
  navigator.vibrate(pattern);
}

function ensureAudio() {
  if (!save.sound) return null;
  if (!state.audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    state.audioContext = new AudioContext();
  }
  if (state.audioContext.state === 'suspended') state.audioContext.resume().catch(() => {});
  return state.audioContext;
}

function tone(frequency, duration = 0.08, gain = 0.035, type = 'sine', delay = 0) {
  const audio = ensureAudio();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const volume = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  volume.gain.setValueAtTime(0.0001, audio.currentTime + delay);
  volume.gain.exponentialRampToValueAtTime(gain, audio.currentTime + delay + 0.01);
  volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + duration);
  oscillator.connect(volume).connect(audio.destination);
  oscillator.start(audio.currentTime + delay);
  oscillator.stop(audio.currentTime + delay + duration + 0.02);
}

function portalTone(portalId) {
  const base = { A: 460, B: 610, C: 530, D: 720 }[portalId] || 520;
  tone(base, 0.09, 0.028, 'triangle');
  tone(base * 1.5, 0.11, 0.018, 'sine', 0.045);
}

function completionTone(score) {
  [392, 523, 659].slice(0, score).forEach((frequency, index) => tone(frequency, 0.22, 0.035, 'triangle', index * 0.1));
}

function buildPortalRack() {
  const levelData = currentLevel();
  dom.portalRack.replaceChildren();
  for (const portalId of levelData.portals) {
    const meta = PORTAL_META[portalId];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'portal-chip';
    button.dataset.portalId = portalId;
    button.style.setProperty('--portal-color', meta.color);
    button.innerHTML = `
      <i class="portal-chip__arch" aria-hidden="true"></i>
      <span class="portal-chip__copy"><b>${meta.name}</b><small></small></span>
      <span class="portal-chip__pair">${meta.pair}</span>
    `;
    button.addEventListener('pointerdown', (event) => beginPortalDrag(portalId, event, 'rack'));
    button.addEventListener('click', (event) => {
      if (event.detail === 0) selectPortal(portalId);
    });
    dom.portalRack.append(button);
  }
}

function renderPortalRack() {
  for (const button of dom.portalRack.querySelectorAll('.portal-chip')) {
    const portalId = button.dataset.portalId;
    const placement = state.placements[portalId];
    button.classList.toggle('is-selected', state.selectedPortal === portalId);
    const copy = button.querySelector('small');
    copy.textContent = placement ? `ребро ${shortSlot(placement.slot)} · выход ${arrowFor(placement.facing)}` : 'на стойке';
    button.setAttribute('aria-pressed', String(state.selectedPortal === portalId));
  }
  const selectedPlacement = state.selectedPortal ? state.placements[state.selectedPortal] : null;
  dom.flipButton.disabled = state.running || !selectedPlacement;
  dom.removeButton.disabled = state.running || !selectedPlacement;
}

function shortSlot(slotId) {
  const slot = parseSlot(slotId);
  return `${slot.axis.toUpperCase()}${slot.x}.${slot.y}`;
}

function arrowFor(facing) {
  return { N: '↑', E: '→', S: '↓', W: '←' }[facing] || '·';
}

function stars(score) {
  if (!score) return '—';
  return '◆'.repeat(score) + '◇'.repeat(3 - score);
}

function renderHUD() {
  const levelData = currentLevel();
  const session = currentSession();
  dom.levelCounter.textContent = `СХЕМА ${String(levelData.id).padStart(2, '0')} / ${LEVELS.length}`;
  dom.missionKicker.textContent = `КАМЕРА ${String(levelData.id).padStart(2, '0')}`;
  dom.missionTitle.textContent = levelData.title;
  dom.missionBrief.textContent = levelData.brief;
  dom.runsValue.textContent = String(session.runs);
  dom.hintsValue.textContent = String(session.hints);
  dom.bestValue.textContent = stars(save.best[levelKey()]);
  dom.crystalStatus.textContent = `${state.animatedCollected.size} / ${levelData.crystals.length}`;
  dom.runButton.disabled = state.running;
  dom.resetButton.disabled = state.running;
  dom.hintButton.disabled = state.running;
  dom.levelsButton.disabled = state.running;
  dom.runButton.classList.toggle('is-running', state.running);
  renderPortalRack();
}

function renderLevelGrid() {
  dom.levelGrid.replaceChildren();
  LEVELS.forEach((levelData, index) => {
    const button = document.createElement('button');
    const unlocked = index < save.unlocked;
    button.type = 'button';
    button.className = 'level-button';
    button.disabled = !unlocked;
    button.classList.toggle('is-current', index === state.levelIndex);
    button.innerHTML = `<span>${unlocked ? `КАМЕРА ${String(levelData.id).padStart(2, '0')}` : 'ЗАКРЫТО'}</span><b>${unlocked ? levelData.title : '—'}</b><small>${unlocked ? stars(save.best[String(levelData.id)]) : '×'}</small>`;
    button.addEventListener('click', () => {
      loadLevel(index);
      closeMap();
    });
    dom.levelGrid.append(button);
  });
  dom.soundButton.innerHTML = `ЗВУК <b>${save.sound ? 'ВКЛ' : 'ВЫКЛ'}</b>`;
  dom.hapticsButton.innerHTML = `ВИБРАЦИЯ <b>${save.haptics ? 'ВКЛ' : 'ВЫКЛ'}</b>`;
}

function loadLevel(index, options = {}) {
  state.levelIndex = Math.min(Math.max(0, index), LEVELS.length - 1);
  const levelData = currentLevel();
  state.placements = sanitizePlacements(levelData, save.placements[String(levelData.id)]);
  state.selectedPortal = levelData.portals[0];
  state.running = false;
  state.orbWorld = null;
  state.orbAlpha = 1;
  state.animatedCollected = new Set();
  state.lastTrace = [];
  state.flashPortals.clear();
  state.hintSlot = null;
  buildPortalRack();
  setStatus(options.status || 'Выбери ворота и коснись монтажного ребра.');
  persist();
  renderHUD();
  requestDraw();
}

function selectPortal(portalId) {
  if (state.running || !currentLevel().portals.includes(portalId)) return;
  state.selectedPortal = portalId;
  renderPortalRack();
  requestDraw();
  tone(PORTAL_META[portalId].pair === 'I' ? 330 : 390, 0.05, 0.018, 'triangle');
}

function placePortal(portalId, slotId) {
  if (state.running || !currentLevel().sockets.includes(slotId)) return;
  const oldPlacement = state.placements[portalId];
  const occupyingPortal = Object.entries(state.placements).find(([otherId, placement]) => otherId !== portalId && placement.slot === slotId)?.[0];
  if (occupyingPortal) delete state.placements[occupyingPortal];

  let facing = oldPlacement?.facing;
  if (!validFacings(slotId).includes(facing)) facing = defaultFacing(slotId);
  state.placements[portalId] = { slot: slotId, facing };
  state.selectedPortal = portalId;
  state.lastTrace = [];
  state.animatedCollected.clear();
  persist();
  renderHUD();
  requestDraw();
  portalTone(portalId);
  haptic(10);
  setStatus(`${PORTAL_META[portalId].name}: ребро ${shortSlot(slotId)}, выход ${arrowFor(facing)}.`);
  if (occupyingPortal) showToast(`${PORTAL_META[occupyingPortal].name} возвращены на стойку.`);
}

function rotateSelected() {
  const portalId = state.selectedPortal;
  const placement = portalId ? state.placements[portalId] : null;
  if (!placement || state.running) return;
  placement.facing = flipFacing(placement.slot, placement.facing);
  state.lastTrace = [];
  persist();
  renderHUD();
  requestDraw();
  portalTone(portalId);
  haptic(8);
  setStatus(`${PORTAL_META[portalId].name}: выход развёрнут ${arrowFor(placement.facing)}.`);
}

function removeSelected() {
  const portalId = state.selectedPortal;
  if (!portalId || !state.placements[portalId] || state.running) return;
  delete state.placements[portalId];
  state.lastTrace = [];
  state.animatedCollected.clear();
  persist();
  renderHUD();
  requestDraw();
  tone(190, 0.06, 0.02, 'square');
  haptic(6);
  setStatus(`${PORTAL_META[portalId].name} сняты со схемы.`);
}

function resetBoard() {
  if (state.running) return;
  state.placements = {};
  state.lastTrace = [];
  state.orbWorld = null;
  state.animatedCollected.clear();
  state.hintSlot = null;
  persist();
  renderHUD();
  requestDraw();
  tone(160, 0.08, 0.02, 'square');
  haptic([6, 35, 6]);
  setStatus('Схема очищена. Ворота снова на стойке.');
}

function useHint() {
  if (state.running) return;
  const levelData = currentLevel();
  const session = currentSession();
  const target = levelData.portals.find((portalId) => state.placements[portalId]?.slot !== levelData.answer[portalId].slot)
    || levelData.portals.find((portalId) => state.placements[portalId]?.facing !== levelData.answer[portalId].facing)
    || levelData.portals[0];
  session.hints += 1;
  state.selectedPortal = target;
  state.hintSlot = levelData.answer[target].slot;
  persist();
  renderHUD();
  requestDraw();
  setStatus(`${PORTAL_META[target].name}: проверь подсвеченное ребро ${shortSlot(state.hintSlot)}.`);
  showToast('Подсвечено одно верное монтажное ребро.');
  tone(780, 0.12, 0.025, 'sine');
  window.setTimeout(() => {
    state.hintSlot = null;
    requestDraw();
  }, 2600);
}

function collectAtWorld(point) {
  const levelData = currentLevel();
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  const crystal = levelData.crystals.find((item) => item.x === x && item.y === y);
  if (!crystal) return;
  const key = `${x},${y}`;
  if (state.animatedCollected.has(key)) return;
  state.animatedCollected.add(key);
  tone(860 + state.animatedCollected.size * 80, 0.1, 0.024, 'triangle');
  haptic(8);
  renderHUD();
}

async function runSimulation() {
  if (state.running) return;
  const levelData = currentLevel();
  const validation = validatePlacements(levelData, state.placements);
  if (!validation.ok) {
    if (validation.reason === 'missing-portals') {
      for (const portalId of validation.missing) {
        const chip = dom.portalRack.querySelector(`[data-portal-id="${portalId}"]`);
        chip?.classList.add('is-missing');
        window.setTimeout(() => chip?.classList.remove('is-missing'), 650);
      }
      setStatus('Сначала поставь все ворота текущей камеры.', 'error');
      showToast('На стойке остались ворота. Геометрия не собрана.');
    } else {
      setStatus('Два портала не могут стоять на одном ребре.', 'error');
    }
    tone(120, 0.12, 0.035, 'sawtooth');
    haptic([18, 45, 18]);
    return;
  }

  const session = currentSession();
  session.runs += 1;
  persist();
  state.running = true;
  state.lastTrace = [];
  state.animatedCollected = new Set();
  state.orbAlpha = 1;
  setStatus('Импульс запущен. Читаем плоскости ворот…', 'running');
  renderHUD();
  tone(240, 0.08, 0.028, 'square');
  haptic(12);

  const result = simulate(levelData, state.placements);
  await playTrace(result.trace);
  state.running = false;
  state.lastTrace = result.trace;
  state.orbWorld = null;
  state.orbAlpha = 1;

  if (result.status === 'success') {
    completeLevel();
  } else {
    const failures = {
      void: 'Импульс ушёл за край камеры. Разверни выход или смени ребро.',
      wall: 'Импульс врезался в блок. Маршрут оборван.',
      'blocked-exit': 'Парный выход упирается в блок. Портал есть, смысла нет.',
      loop: 'Схема замкнулась сама на себя. Получился вечный круг ада.',
      timeout: 'Импульс не дошёл до приёмника.',
      invalid: 'Схема собрана некорректно.'
    };
    setStatus(failures[result.status] || 'Маршрут оборван.', 'error');
    tone(120, 0.16, 0.035, 'sawtooth');
    haptic([25, 60, 25]);
    renderHUD();
    requestDraw();
  }
}

async function playTrace(trace) {
  const motionScale = prefersReducedMotion.matches ? 0.08 : 1;
  for (const event of trace) {
    if (event.kind === 'spawn') {
      state.orbWorld = event.at;
      requestDraw();
      continue;
    }
    if (event.kind === 'move') {
      await tweenWorld(event.from, event.to, 190 * motionScale);
      collectAtWorld(event.to);
      continue;
    }
    if (event.kind === 'portal') {
      await tweenWorld(event.from, event.entry, 120 * motionScale);
      state.flashPortals.add(event.portalId);
      portalTone(event.portalId);
      haptic(7);
      await tweenValue(1, 0, 95 * motionScale, (value) => {
        state.orbAlpha = value;
        requestDraw();
      });
      state.orbWorld = event.exit;
      state.flashPortals.delete(event.portalId);
      state.flashPortals.add(event.mateId);
      state.orbAlpha = 0;
      requestDraw();
      await tweenValue(0, 1, 105 * motionScale, (value) => {
        state.orbAlpha = value;
        requestDraw();
      });
      portalTone(event.mateId);
      await tweenWorld(event.exit, event.to, 120 * motionScale);
      collectAtWorld(event.to);
      state.flashPortals.delete(event.mateId);
      requestDraw();
    }
  }
}

function tweenWorld(from, to, duration) {
  return tweenValue(0, 1, duration, (value) => {
    const eased = 1 - Math.pow(1 - value, 3);
    state.orbWorld = {
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased
    };
    requestDraw();
  });
}

function tweenValue(from, to, duration, update) {
  if (duration <= 1) {
    update(to);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      update(from + (to - from) * progress);
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

function completeLevel() {
  const levelData = currentLevel();
  const session = currentSession();
  const rating = scoreRun(levelData, session.runs, session.hints);
  const oldBest = save.best[levelKey()] || 0;
  save.best[levelKey()] = Math.max(oldBest, rating);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, state.levelIndex + 2));
  persist();
  setStatus('Маршрут замкнут. Все кристаллы доставлены.', 'success');
  completionTone(rating);
  haptic([16, 45, 16, 45, 28]);
  renderHUD();
  requestDraw();

  dom.resultGlyph.dataset.score = String(rating);
  dom.resultKicker.textContent = rating === 3 ? 'ЧИСТАЯ ГЕОМЕТРИЯ' : rating === 2 ? 'МАРШРУТ ЗАМКНУТ' : 'СХЕМА РАБОТАЕТ';
  dom.resultTitle.textContent = state.levelIndex === LEVELS.length - 1 ? 'Все камеры пройдены.' : `${levelData.title}: готово.`;
  dom.resultCopy.textContent = rating === 3
    ? 'Один взгляд, минимум запусков, никакой возни. Красиво.'
    : rating === 2
      ? 'Маршрут найден без подсказок. Камера принимает решение.'
      : 'Подсказка спасла схему. Не героично, зато импульс не сдох.';
  dom.resultRuns.textContent = String(session.runs);
  dom.resultHints.textContent = String(session.hints);
  dom.nextButton.textContent = state.levelIndex === LEVELS.length - 1 ? 'К СПИСКУ СХЕМ →' : 'СЛЕДУЮЩАЯ КАМЕРА →';
  window.setTimeout(() => {
    dom.resultOverlay.hidden = false;
  }, prefersReducedMotion.matches ? 0 : 260);
}

function openMap() {
  if (state.running) return;
  renderLevelGrid();
  dom.mapOverlay.hidden = false;
}

function closeMap() {
  dom.mapOverlay.hidden = true;
  state.clearArmed = false;
  dom.clearProgressButton.textContent = 'СБРОСИТЬ ПРОГРЕСС';
}

function closeResult() {
  dom.resultOverlay.hidden = true;
}

function clearProgress() {
  if (!state.clearArmed) {
    state.clearArmed = true;
    dom.clearProgressButton.textContent = 'ЕЩЁ РАЗ — УДАЛИТЬ ВСЁ';
    window.setTimeout(() => {
      if (!state.clearArmed) return;
      state.clearArmed = false;
      dom.clearProgressButton.textContent = 'СБРОСИТЬ ПРОГРЕСС';
    }, 3500);
    return;
  }
  const sound = save.sound;
  const haptics = save.haptics;
  Object.assign(save, defaultSave(), { sound, haptics, seenIntro: true });
  state.clearArmed = false;
  loadLevel(0, { status: 'Прогресс очищен. Камеры снова закрыты.' });
  renderLevelGrid();
  showToast('Прогресс удалён. Бюрократия победила.');
}

function beginPortalDrag(portalId, event, source) {
  if (state.running || event.button > 0) return;
  event.preventDefault();
  selectPortal(portalId);
  state.drag = {
    pointerId: event.pointerId,
    portalId,
    source,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    active: false
  };
  document.addEventListener('pointermove', onPortalDragMove, { passive: false });
  document.addEventListener('pointerup', onPortalDragEnd, { once: true });
  document.addEventListener('pointercancel', onPortalDragEnd, { once: true });
}

function onPortalDragMove(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  event.preventDefault();
  state.drag.x = event.clientX;
  state.drag.y = event.clientY;
  const distance = Math.hypot(event.clientX - state.drag.startX, event.clientY - state.drag.startY);
  if (distance > 7) state.drag.active = true;
  if (state.drag.active) {
    dom.dragLabel.hidden = false;
    dom.dragLabel.style.left = `${event.clientX}px`;
    dom.dragLabel.style.top = `${event.clientY}px`;
    dom.dragLabel.textContent = PORTAL_META[state.drag.portalId].name;
    requestDraw();
  }
}

function onPortalDragEnd(event) {
  document.removeEventListener('pointermove', onPortalDragMove);
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  const drag = state.drag;
  state.drag = null;
  dom.dragLabel.hidden = true;

  if (drag.active) {
    const point = clientToCanvas(event.clientX, event.clientY);
    const hit = nearestSocket(point.x, point.y, 44);
    if (hit) placePortal(drag.portalId, hit.slotId);
    else showToast('Брось ворота на светлое монтажное ребро.');
  } else if (drag.source === 'canvas' && state.placements[drag.portalId]) {
    state.selectedPortal = drag.portalId;
    rotateSelected();
  }
  requestDraw();
}

function clientToCanvas(clientX, clientY) {
  const rect = dom.canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function nearestSocket(x, y, maxDistance = 34) {
  let best = null;
  let bestDistance = maxDistance;
  for (const hit of state.socketHits) {
    const distance = Math.hypot(x - hit.x, y - hit.y);
    if (distance < bestDistance) {
      best = hit;
      bestDistance = distance;
    }
  }
  return best;
}

function portalAtPoint(x, y) {
  let best = null;
  let bestDistance = 34;
  for (const hit of state.portalHits) {
    const distance = Math.hypot(x - hit.x, y - hit.y);
    if (distance < bestDistance) {
      best = hit;
      bestDistance = distance;
    }
  }
  return best;
}

function onCanvasPointerDown(event) {
  if (state.running || event.button > 0) return;
  const point = clientToCanvas(event.clientX, event.clientY);
  const portalHit = portalAtPoint(point.x, point.y);
  if (portalHit) {
    beginPortalDrag(portalHit.portalId, event, 'canvas');
    return;
  }
  const socketHit = nearestSocket(point.x, point.y, 38);
  if (socketHit && state.selectedPortal) {
    placePortal(state.selectedPortal, socketHit.slotId);
    return;
  }
  state.selectedPortal = null;
  renderPortalRack();
  requestDraw();
}

function project(worldX, worldY, z = 0) {
  const layout = state.layout;
  return {
    x: layout.originX + (worldX - worldY) * layout.tileW * 0.5,
    y: layout.originY + (worldX + worldY) * layout.tileH * 0.5 - z * layout.tileW
  };
}

function computeLayout(width, height) {
  const levelData = currentLevel();
  const tileW = Math.max(33, Math.min(62, (width - 42) * 2 / (levelData.width + levelData.height)));
  const tileH = tileW * 0.55;
  const baseHeight = (levelData.width + levelData.height) * tileH * 0.5;
  const originY = Math.max(68, (height - baseHeight) * 0.47);
  return {
    width,
    height,
    tileW,
    tileH,
    originX: width * 0.5,
    originY,
    portalHeight: tileW * 0.88
  };
}

function resizeCanvas() {
  const rect = dom.canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  dom.canvas.width = Math.round(width * dpr);
  dom.canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.layout = computeLayout(width, height);
  requestDraw();
}

function requestDraw() {
  if (state.drawRequested) return;
  state.drawRequested = true;
  requestAnimationFrame(() => {
    state.drawRequested = false;
    drawScene();
  });
}

function polygon(points, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function line(from, to, stroke, lineWidth = 1, dash = []) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.restore();
}

function drawScene() {
  if (!state.layout) return;
  const levelData = currentLevel();
  ctx.clearRect(0, 0, state.layout.width, state.layout.height);
  state.socketHits = [];
  state.portalHits = [];

  drawAmbientGrid();
  drawFloor(levelData);
  drawTrace(state.lastTrace);
  drawSockets(levelData);
  drawBlocks(levelData);
  drawMarkers(levelData);
  drawCrystals(levelData);
  drawPortals(levelData);
  drawOrb();
  drawDragGhost();
}

function drawAmbientGrid() {
  const { width, height } = state.layout;
  ctx.save();
  ctx.strokeStyle = 'rgba(238,235,220,.045)';
  ctx.lineWidth = 1;
  for (let x = -height; x < width + height; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  for (let x = 0; x < width + height; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - height, height);
    ctx.stroke();
  }
  ctx.restore();
}

function tilePoints(x, y, z = 0) {
  return [project(x, y, z), project(x + 1, y, z), project(x + 1, y + 1, z), project(x, y + 1, z)];
}

function drawFloor(levelData) {
  for (let depth = 0; depth <= levelData.width + levelData.height - 2; depth += 1) {
    for (let y = 0; y < levelData.height; y += 1) {
      const x = depth - y;
      if (x < 0 || x >= levelData.width) continue;
      const points = tilePoints(x, y);
      const checker = (x + y) % 2;
      polygon(points, checker ? '#292d2b' : '#252826', 'rgba(237,234,220,.075)', 1);
      const center = project(x + 0.5, y + 0.5);
      ctx.fillStyle = 'rgba(235,232,216,.12)';
      ctx.font = '700 7px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${x + 1}.${y + 1}`, center.x, center.y + 2);
    }
  }
  const frontLeftTop = project(0, levelData.height);
  const frontRightTop = project(levelData.width, levelData.height);
  const rightBackTop = project(levelData.width, 0);
  polygon([
    frontLeftTop,
    frontRightTop,
    { x: frontRightTop.x, y: frontRightTop.y + 9 },
    { x: frontLeftTop.x, y: frontLeftTop.y + 9 }
  ], '#101211');
  polygon([
    frontRightTop,
    rightBackTop,
    { x: rightBackTop.x, y: rightBackTop.y + 9 },
    { x: frontRightTop.x, y: frontRightTop.y + 9 }
  ], '#141715');
}

function slotEndpoints(slotId, z = 0.025) {
  const slot = parseSlot(slotId);
  return slot.axis === 'h'
    ? [project(slot.x, slot.y, z), project(slot.x + 1, slot.y, z)]
    : [project(slot.x, slot.y, z), project(slot.x, slot.y + 1, z)];
}

function drawSockets(levelData) {
  const occupied = new Set(Object.values(state.placements).map((placement) => placement.slot));
  for (const slotId of levelData.sockets) {
    const [a, b] = slotEndpoints(slotId);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const hinted = state.hintSlot === slotId;
    const available = !occupied.has(slotId);
    line(a, b, hinted ? '#fff3a6' : available ? 'rgba(239,236,220,.52)' : 'rgba(239,236,220,.18)', hinted ? 5 : 3, hinted ? [] : [4, 4]);
    for (const endpoint of [a, b]) {
      ctx.beginPath();
      ctx.arc(endpoint.x, endpoint.y, hinted ? 3.6 : 2.3, 0, Math.PI * 2);
      ctx.fillStyle = hinted ? '#fff3a6' : 'rgba(239,236,220,.58)';
      ctx.fill();
    }
    if (hinted) {
      ctx.beginPath();
      ctx.arc(center.x, center.y, 18 + Math.sin(performance.now() / 130) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,243,166,.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    state.socketHits.push({ slotId, x: center.x, y: center.y });
  }
}

function drawBlocks(levelData) {
  const sorted = [...levelData.blocks].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  for (const block of sorted) {
    const z = 0.46;
    const bottom = tilePoints(block.x, block.y, 0.01);
    const top = tilePoints(block.x, block.y, z);
    polygon([bottom[1], bottom[2], top[2], top[1]], '#111412', 'rgba(255,255,255,.07)');
    polygon([bottom[2], bottom[3], top[3], top[2]], '#171a18', 'rgba(255,255,255,.07)');
    polygon(top, '#373b38', 'rgba(240,237,221,.16)');
    const center = project(block.x + 0.5, block.y + 0.5, z + 0.01);
    ctx.strokeStyle = 'rgba(240,237,221,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center.x - 6, center.y);
    ctx.lineTo(center.x + 6, center.y);
    ctx.moveTo(center.x, center.y - 3);
    ctx.lineTo(center.x, center.y + 3);
    ctx.stroke();
  }
}

function drawMarkers(levelData) {
  const emitter = project(levelData.emitter.x + 0.5, levelData.emitter.y + 0.5, 0.05);
  const direction = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[levelData.emitter.dir];
  const arrowWorld = project(levelData.emitter.x + 0.5 + direction[0] * 0.34, levelData.emitter.y + 0.5 + direction[1] * 0.34, 0.06);
  ctx.beginPath();
  ctx.arc(emitter.x, emitter.y, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#d9d6c8';
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 3;
  ctx.stroke();
  line(emitter, arrowWorld, '#111', 3);
  drawArrowHead(emitter, arrowWorld, '#111', 6);

  const target = project(levelData.target.x + 0.5, levelData.target.y + 0.5, 0.04);
  const ready = state.animatedCollected.size === levelData.crystals.length;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 13, 0, Math.PI * 2);
  ctx.fillStyle = ready ? 'rgba(129,232,155,.25)' : 'rgba(235,232,216,.08)';
  ctx.fill();
  ctx.strokeStyle = ready ? '#81e89b' : 'rgba(235,232,216,.5)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(target.x, target.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = ready ? '#dfffe7' : '#666a64';
  ctx.fill();
}

function drawCrystals(levelData) {
  for (const crystal of levelData.crystals) {
    const key = `${crystal.x},${crystal.y}`;
    if (state.animatedCollected.has(key)) continue;
    const center = project(crystal.x + 0.5, crystal.y + 0.5, 0.09);
    const size = 6;
    polygon([
      { x: center.x, y: center.y - size },
      { x: center.x + size * 0.72, y: center.y },
      { x: center.x, y: center.y + size },
      { x: center.x - size * 0.72, y: center.y }
    ], '#fff3a6', '#fffbe2', 1);
    ctx.shadowColor = '#fff3a6';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255,243,166,.18)';
    ctx.fillRect(center.x - 1, center.y - 1, 2, 2);
    ctx.shadowBlur = 0;
  }
}

function drawPortals(levelData) {
  const portals = levelData.portals
    .filter((portalId) => state.placements[portalId])
    .sort((a, b) => {
      const ca = slotCenter(state.placements[a].slot);
      const cb = slotCenter(state.placements[b].slot);
      return (ca.x + ca.y) - (cb.x + cb.y);
    });
  for (const portalId of portals) drawPortal(portalId, state.placements[portalId]);
}

function drawPortal(portalId, placement, options = {}) {
  const meta = PORTAL_META[portalId];
  const [baseA, baseB] = slotEndpoints(placement.slot, 0.035);
  const height = state.layout.portalHeight;
  const topA = { x: baseA.x, y: baseA.y - height * 0.53 };
  const topB = { x: baseB.x, y: baseB.y - height * 0.53 };
  const apex = { x: (baseA.x + baseB.x) / 2, y: (baseA.y + baseB.y) / 2 - height };
  const selected = state.selectedPortal === portalId;
  const flashing = state.flashPortals.has(portalId);
  const alpha = options.alpha ?? 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(baseA.x, baseA.y);
  ctx.lineTo(topA.x, topA.y);
  ctx.bezierCurveTo(topA.x, apex.y + height * 0.12, apex.x - 8, apex.y, apex.x, apex.y);
  ctx.bezierCurveTo(apex.x + 8, apex.y, topB.x, apex.y + height * 0.12, topB.x, topB.y);
  ctx.lineTo(baseB.x, baseB.y);
  ctx.lineWidth = flashing ? 15 : selected ? 12 : 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.65)';
  ctx.stroke();
  ctx.strokeStyle = meta.color;
  ctx.shadowColor = meta.color;
  ctx.shadowBlur = flashing ? 24 : selected ? 15 : 9;
  ctx.lineWidth = flashing ? 10 : selected ? 8 : 7;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,.72)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  line(baseA, baseB, flashing ? 'rgba(255,255,255,.9)' : meta.color, selected ? 5 : 3);
  drawFacingArrow(placement.slot, placement.facing, meta.color);

  const hit = {
    portalId,
    x: apex.x,
    y: apex.y + height * 0.42
  };
  state.portalHits.push(hit);
  ctx.restore();
}

function drawFacingArrow(slotId, facing, color) {
  const center = slotCenter(slotId);
  const vector = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } }[facing];
  const from = project(center.x - vector.x * 0.08, center.y - vector.y * 0.08, 0.055);
  const to = project(center.x + vector.x * 0.42, center.y + vector.y * 0.42, 0.055);
  line(from, to, color, 3);
  drawArrowHead(from, to, color, 7);
}

function drawArrowHead(from, to, color, size) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  polygon([
    { x: to.x, y: to.y },
    { x: to.x - Math.cos(angle - 0.55) * size, y: to.y - Math.sin(angle - 0.55) * size },
    { x: to.x - Math.cos(angle + 0.55) * size, y: to.y - Math.sin(angle + 0.55) * size }
  ], color);
}

function drawTrace(trace) {
  if (!trace.length) return;
  ctx.save();
  ctx.globalAlpha = 0.26;
  for (const event of trace) {
    if (event.kind === 'move') {
      line(project(event.from.x, event.from.y, 0.08), project(event.to.x, event.to.y, 0.08), '#f6f1df', 2, [3, 5]);
    }
    if (event.kind === 'portal') {
      line(project(event.from.x, event.from.y, 0.08), project(event.entry.x, event.entry.y, 0.08), '#f6f1df', 2, [3, 5]);
      line(project(event.exit.x, event.exit.y, 0.08), project(event.to.x, event.to.y, 0.08), '#f6f1df', 2, [3, 5]);
    }
  }
  ctx.restore();
}

function drawOrb() {
  if (!state.orbWorld) return;
  const center = project(state.orbWorld.x, state.orbWorld.y, 0.15);
  ctx.save();
  ctx.globalAlpha = state.orbAlpha;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(center.x - 2, center.y - 2, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#d8fff9';
  ctx.fill();
  ctx.restore();
}

function drawDragGhost() {
  if (!state.drag?.active) return;
  const point = clientToCanvas(state.drag.x, state.drag.y);
  const hit = nearestSocket(point.x, point.y, 56);
  if (!hit) return;
  const old = state.placements[state.drag.portalId];
  const facing = validFacings(hit.slotId).includes(old?.facing) ? old.facing : defaultFacing(hit.slotId);
  drawPortal(state.drag.portalId, { slot: hit.slotId, facing }, { alpha: 0.48 });
}

function setupEvents() {
  dom.canvas.addEventListener('pointerdown', onCanvasPointerDown);
  dom.flipButton.addEventListener('click', rotateSelected);
  dom.removeButton.addEventListener('click', removeSelected);
  dom.resetButton.addEventListener('click', resetBoard);
  dom.hintButton.addEventListener('click', useHint);
  dom.runButton.addEventListener('click', runSimulation);
  dom.levelsButton.addEventListener('click', openMap);
  dom.mapCloseButton.addEventListener('click', closeMap);
  dom.mapOverlay.addEventListener('click', (event) => { if (event.target === dom.mapOverlay) closeMap(); });
  dom.introStartButton.addEventListener('click', () => {
    save.seenIntro = true;
    dom.introOverlay.hidden = true;
    persist();
    ensureAudio();
    tone(360, 0.1, 0.025, 'triangle');
  });
  dom.soundButton.addEventListener('click', () => {
    save.sound = !save.sound;
    persist();
    renderLevelGrid();
    if (save.sound) tone(440, 0.08, 0.025, 'triangle');
  });
  dom.hapticsButton.addEventListener('click', () => {
    save.haptics = !save.haptics;
    persist();
    renderLevelGrid();
    haptic(12);
  });
  dom.clearProgressButton.addEventListener('click', clearProgress);
  dom.nextButton.addEventListener('click', () => {
    closeResult();
    if (state.levelIndex < LEVELS.length - 1) loadLevel(state.levelIndex + 1);
    else openMap();
  });
  dom.replayButton.addEventListener('click', () => {
    closeResult();
    setStatus('Схема оставлена на поле. Можно улучшить результат.');
  });
  dom.resultMapButton.addEventListener('click', () => {
    closeResult();
    openMap();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.audioContext?.state === 'running') state.audioContext.suspend().catch(() => {});
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!dom.resultOverlay.hidden) closeResult();
      else if (!dom.mapOverlay.hidden) closeMap();
    }
    if ((event.key === ' ' || event.key === 'Enter') && event.target === document.body && !state.running) {
      event.preventDefault();
      runSimulation();
    }
  });
}

function init() {
  dom.introOverlay.hidden = save.seenIntro;
  setupEvents();
  loadLevel(state.levelIndex);
  const observer = new ResizeObserver(resizeCanvas);
  observer.observe(dom.boardShell);
  resizeCanvas();
}

init();
