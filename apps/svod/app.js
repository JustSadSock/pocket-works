import {
  bindPointerGesture,
  installMobileRuntime,
  setDocumentScrollLocked
} from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createAudioFeedback } from '../../shared/capabilities/audio.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  CARRIERS,
  CHARTERS,
  PROJECTS,
  RING_NAMES,
  SECTOR_TYPES,
  SLOT_COUNT,
  TOTAL_CYCLES,
  advanceFromResolution,
  applyEventChoice,
  buildProject,
  chainAt,
  createGame,
  describeForecast,
  enactOrder,
  evaluateBoard,
  formatCost,
  getCurrentEvent,
  getEventChoiceAvailability,
  isValidGame,
  locateSector,
  modulo,
  orderAvailability,
  projectAvailability,
  resolveCycle,
  rotateRing,
  rotationCost,
  sectorAt
} from './game-core.js';

installMobileRuntime();

const STORAGE_NAMESPACE = 'pocket-works:svod';
const APP_VERSION = '0.1.0';
const DEFAULT_SETTINGS = Object.freeze({
  sound: true,
  haptics: true,
  reducedFx: false
});
const DEFAULT_PROFILE = Object.freeze({
  runs: 0,
  wins: 0,
  bestIntegrity: 0,
  lastSeed: null
});

const storage = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 1,
  defaults: {
    game: null,
    settings: DEFAULT_SETTINGS,
    profile: DEFAULT_PROFILE
  },
  validate(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
});

let settings = { ...DEFAULT_SETTINGS, ...(storage.get('settings') || {}) };
let profile = { ...DEFAULT_PROFILE, ...(storage.get('profile') || {}) };
let game = storage.get('game');
if (game && !isValidGame(game)) {
  game = null;
  storage.set('game', null);
}

const audio = createAudioFeedback({ enabled: settings.sound, volume: 0.13 });

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const elements = {
  views: $$('.view'),
  startView: $('#start-view'),
  setupView: $('#setup-view'),
  gameView: $('#game-view'),
  completionView: $('#completion-view'),
  archiveStrip: $('#archive-strip'),
  continueButton: $('#continue-button'),
  continueDetail: $('#continue-detail'),
  newGameButton: $('#new-game-button'),
  rulesButton: $('#rules-button'),
  startSettingsButton: $('#start-settings-button'),
  setupBackButton: $('#setup-back-button'),
  seedLabel: $('#seed-label'),
  shuffleSeedButton: $('#shuffle-seed-button'),
  launchButton: $('#launch-button'),
  replaceWarning: $('#replace-warning'),
  charterOptions: $$('.charter-option'),
  pauseButton: $('#pause-button'),
  quickSoundButton: $('#quick-sound-button'),
  cycleValue: $('#cycle-value'),
  rationsValue: $('#rations-value'),
  partsValue: $('#parts-value'),
  mandateValue: $('#mandate-value'),
  rationsDelta: $('#rations-delta'),
  partsDelta: $('#parts-delta'),
  mandateDelta: $('#mandate-delta'),
  integrityValue: $('#integrity-value'),
  cohesionValue: $('#cohesion-value'),
  integrityTrack: $('#integrity-track'),
  cohesionTrack: $('#cohesion-track'),
  forecastKicker: $('#forecast-kicker'),
  forecastText: $('#forecast-text'),
  commandValue: $('#command-value'),
  canvas: $('#strategy-board'),
  boardFrame: $('#board-frame'),
  partialChains: $('#partial-chain-value'),
  fullChains: $('#full-chain-value'),
  shieldValue: $('#shield-value'),
  rotateLeft: $('#rotate-left-button'),
  rotateRight: $('#rotate-right-button'),
  ringButtons: $$('#ring-selector [data-ring]'),
  selectedRingName: $('#selected-ring-name'),
  sectorRingLabel: $('#sector-ring-label'),
  sectorSpokeLabel: $('#sector-spoke-label'),
  sectorName: $('#sector-name'),
  sectorCondition: $('#sector-condition'),
  sectorDescription: $('#sector-description'),
  sectorFlow: $('#sector-flow'),
  projectCount: $('#project-count'),
  projectNotches: $$('#project-notches i'),
  cityActionButton: $('#city-action-button'),
  cityActionLabel: $('#city-action-label'),
  resolveButton: $('#resolve-button'),
  seedGameLabel: $('#seed-game-label'),
  gameWorkshopButton: $('#game-workshop-button'),
  completionSeed: $('#completion-seed'),
  completionEmblem: $('#completion-emblem'),
  completionEyebrow: $('#completion-eyebrow'),
  completionTitle: $('#completion-title'),
  completionReason: $('#completion-reason'),
  completionLedger: $('#completion-ledger'),
  againButton: $('#again-button'),
  completionMenuButton: $('#completion-menu-button'),
  completionWorkshopButton: $('#completion-workshop-button'),
  sheetLayer: $('#sheet-layer'),
  sheetBackdrop: $('#sheet-backdrop'),
  sheet: $('#sheet'),
  sheetContent: $('#sheet-content'),
  toast: $('#toast'),
  gameLive: $('#game-live')
};

const workshop = createWorkshopMode({
  appName: 'СВОД',
  version: APP_VERSION,
  cachePrefix: 'svod-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset() {
    game = null;
    settings = { ...DEFAULT_SETTINGS };
    profile = { ...DEFAULT_PROFILE };
    audio.setEnabled(settings.sound);
    closeSheet(true);
    showStart();
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

let currentView = 'start';
let setupCharter = 'water';
let setupSeed = makeSeed();
let selectedRing = 0;
let selectedSectorUid = null;
let sheetMode = null;
let sheetDismissible = true;
let sheetLastFocus = null;
let actionTab = 'projects';
let toastTimer = 0;
let boardVisible = false;
let animationFrame = 0;
let lastFrameTime = 0;
let boardCssSize = 0;
let boardDpr = 1;

const boardMotion = {
  visualSteps: [0, 0, 0],
  targetSteps: [0, 0, 0],
  drag: null,
  stormFlashUntil: 0,
  chainFlashUntil: 0
};

const SEGMENT_ANGLE = (Math.PI * 2) / SLOT_COUNT;
const TAU = Math.PI * 2;

function makeSeed() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(6);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.random() * 0xffffffff;
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('');
}

function saveGame() {
  storage.patch({ game, settings, profile });
}

function persistSettings() {
  storage.set('settings', settings);
  audio.setEnabled(settings.sound);
  elements.quickSoundButton.textContent = `Звук: ${settings.sound ? 'да' : 'нет'}`;
  elements.quickSoundButton.setAttribute('aria-pressed', String(settings.sound));
}

function buzz(pattern = 7) {
  if (settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function sound(name) {
  if (!settings.sound) return;
  if (name === 'rotate') {
    audio.tone({ frequency: 310, endFrequency: 390, duration: 0.045, type: 'triangle', gain: 0.18 });
    return;
  }
  if (name === 'storm') {
    audio.tone({ frequency: 110, endFrequency: 58, duration: 0.34, type: 'sawtooth', gain: 0.12 });
    audio.tone({ frequency: 230, endFrequency: 120, duration: 0.2, type: 'triangle', gain: 0.08, delay: 0.08 });
    return;
  }
  audio.play(name);
}

function showToast(message, error = false) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('is-error', error);
  elements.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2200);
}

function announce(message) {
  elements.gameLive.textContent = '';
  window.requestAnimationFrame(() => { elements.gameLive.textContent = message; });
}

function switchView(name) {
  currentView = name;
  document.body.dataset.view = name;
  for (const view of elements.views) {
    const active = view.id === `${name}-view`;
    view.hidden = !active;
    view.classList.toggle('is-active', active);
  }
  boardVisible = name === 'game';
  if (boardVisible) {
    resizeBoard();
    startBoardLoop();
  } else {
    stopBoardLoop();
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function showStart() {
  closeSheet(true);
  renderStart();
  switchView('start');
}

function openSetup() {
  closeSheet(true);
  setupSeed = makeSeed();
  setupCharter = 'water';
  elements.seedLabel.textContent = setupSeed;
  elements.replaceWarning.hidden = !game;
  renderCharterSelection();
  switchView('setup');
}

function showGame() {
  if (!game || !isValidGame(game)) {
    showStart();
    return;
  }
  if (game.phase === 'complete') {
    showCompletion();
    return;
  }

  selectedSectorUid = selectedSectorUid && locateSector(game, selectedSectorUid)
    ? selectedSectorUid
    : sectorAt(game, selectedRing, 0).uid;
  boardMotion.visualSteps = [...game.offsets];
  boardMotion.targetSteps = [...game.offsets];
  boardMotion.drag = null;
  renderGameUI();
  switchView('game');

  if (game.phase === 'resolution') openResolutionSheet();
  if (game.phase === 'event') openEventSheet();
}

function recordOutcomeOnce() {
  if (!game?.outcome || game.outcome.recorded) return;
  if (game.outcome.won) profile.wins += 1;
  profile.bestIntegrity = Math.max(profile.bestIntegrity, game.integrity);
  profile.lastSeed = game.seed;
  game.outcome.recorded = true;
  saveGame();
}

function showCompletion() {
  if (!game?.outcome) {
    showStart();
    return;
  }
  closeSheet(true);
  recordOutcomeOnce();
  const won = game.outcome.won;
  elements.completionSeed.textContent = `КОД ${game.seed}`;
  elements.completionEmblem.classList.toggle('is-lost', !won);
  elements.completionEyebrow.textContent = won ? 'БЕЛАЯ БУРЯ ПРОШЛА' : 'ХРОНИКА ОБОРВАНА';
  elements.completionTitle.textContent = won ? 'Свод выстоял.' : 'Свод разомкнулся.';
  elements.completionReason.textContent = game.outcome.reason;
  const ledger = [
    ['Проекты', `${game.projects.length} / 3`],
    ['Целостность', String(game.integrity)],
    ['Полные цепи', String(game.stats.fullChains)],
    ['Удары отбиты', String(game.stats.stormsBlocked)],
    ['Повороты', String(game.stats.rotations)],
    ['Урон принят', String(game.stats.damageTaken)]
  ];
  elements.completionLedger.innerHTML = ledger.map(([label, value]) => (
    `<div><dt>${label}</dt><dd>${value}</dd></div>`
  )).join('');
  switchView('completion');
  sound(won ? 'success' : 'error');
  buzz(won ? [10, 35, 10, 45, 14] : [20, 50, 20]);
}

function renderStart() {
  const hasGame = Boolean(game && isValidGame(game));
  elements.continueButton.hidden = !hasGame;
  if (hasGame) {
    elements.continueDetail.textContent = game.phase === 'complete'
      ? 'Открыть финальную запись'
      : `Цикл ${game.cycle} из ${TOTAL_CYCLES} · проектов ${game.projects.length}/3`;
  }
  if (profile.runs > 0) {
    elements.archiveStrip.innerHTML = `<span>ХРОНИК: ${profile.runs}</span><span>ВЫСТОЯЛО: ${profile.wins} · ЛУЧШАЯ ЦЕЛОСТНОСТЬ: ${profile.bestIntegrity}</span>`;
  } else {
    elements.archiveStrip.innerHTML = '<span>АРХИВ ПУСТ</span><span>ГОРОД ЖДЁТ ПЕРВОГО ЗАПУСКА</span>';
  }
  persistSettings();
}

function renderCharterSelection() {
  for (const button of elements.charterOptions) {
    const selected = button.dataset.charter === setupCharter;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }
}

function sign(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function conditionInfo(damage) {
  if (damage >= 2) return { label: 'РАЗБИТ', className: 'is-broken' };
  if (damage === 1) return { label: 'ИЗНОС', className: 'is-worn' };
  return { label: 'ЦЕЛ', className: '' };
}

function renderSelectedSector() {
  if (!game) return;
  let location = locateSector(game, selectedSectorUid);
  if (!location) {
    selectedSectorUid = sectorAt(game, selectedRing, 0).uid;
    location = locateSector(game, selectedSectorUid);
  }
  selectedRing = location.ring;
  const { sector, spoke, ring } = location;
  const type = SECTOR_TYPES[sector.kind];
  const condition = conditionInfo(sector.damage);
  elements.sectorRingLabel.textContent = `КОЛЬЦО ${['I', 'II', 'III'][ring]}`;
  elements.sectorSpokeLabel.textContent = `ЛУЧ ${String(spoke + 1).padStart(2, '0')}`;
  elements.sectorName.textContent = type.name;
  elements.sectorCondition.textContent = condition.label;
  elements.sectorCondition.className = condition.className;
  elements.sectorDescription.textContent = type.description;
  if (ring === 0) elements.sectorFlow.textContent = `Выход: ${CARRIERS[type.output].name}`;
  if (ring === 1) elements.sectorFlow.textContent = `Нужно: ${CARRIERS[type.input].name} → ${CARRIERS[type.output].name}`;
  if (ring === 2) elements.sectorFlow.textContent = `Нужно: ${CARRIERS[type.input].name} → ${type.effect === 'bastion' ? 'щит' : type.effect === 'habitat' ? 'запас и сцепление' : 'воля города'}`;
  renderRingSelector();
}

function renderRingSelector() {
  for (const button of elements.ringButtons) {
    const selected = Number(button.dataset.ring) === selectedRing;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }
  elements.selectedRingName.textContent = RING_NAMES[selectedRing];
  if (!game) return;
  const leftCost = rotationCost(game, selectedRing, -1);
  const rightCost = rotationCost(game, selectedRing, 1);
  const locked = game.phase !== 'playing';
  elements.rotateLeft.disabled = locked || leftCost > game.command;
  elements.rotateRight.disabled = locked || rightCost > game.command;
}

function previewOffsets() {
  if (!game || !boardMotion.drag) return game?.offsets;
  const offsets = [...game.offsets];
  offsets[boardMotion.drag.ring] = modulo(offsets[boardMotion.drag.ring] + boardMotion.drag.previewSteps);
  return offsets;
}

function renderGameUI(offsets = game?.offsets) {
  if (!game) return;
  const evaluation = evaluateBoard(game, offsets || game.offsets);
  const expectedRations = evaluation.rations - (4 + (game.cycle >= 9 ? 1 : 0));
  elements.cycleValue.textContent = String(game.cycle).padStart(2, '0');
  elements.rationsValue.textContent = game.resources.rations;
  elements.partsValue.textContent = game.resources.parts;
  elements.mandateValue.textContent = game.resources.mandate;
  elements.rationsDelta.textContent = sign(expectedRations);
  elements.partsDelta.textContent = sign(evaluation.parts);
  elements.mandateDelta.textContent = sign(evaluation.mandate);
  elements.integrityValue.textContent = game.integrity;
  elements.cohesionValue.textContent = game.cohesion;
  elements.integrityTrack.style.width = `${game.integrity}%`;
  elements.cohesionTrack.style.width = `${game.cohesion}%`;
  elements.integrityTrack.style.background = game.integrity < 35 ? 'var(--rust)' : 'var(--ink)';
  elements.cohesionTrack.style.background = game.cohesion < 35 ? 'var(--rust-deep)' : 'var(--rust)';
  elements.forecastKicker.textContent = game.cycle === TOTAL_CYCLES ? 'БЕЛАЯ БУРЯ' : 'ПРОГНОЗ ФРОНТА';
  elements.forecastText.textContent = describeForecast(game).replace(/^.*?: /, '');
  elements.commandValue.textContent = `${game.command} КОМ.`;
  elements.partialChains.textContent = evaluation.partialChains.length;
  elements.fullChains.textContent = evaluation.fullChains.length;
  elements.shieldValue.textContent = evaluation.shieldSpokes.length;
  elements.projectCount.textContent = `${game.projects.length} / 3`;
  elements.projectNotches.forEach((notch, index) => notch.classList.toggle('is-filled', index < game.projects.length));
  elements.cityActionLabel.textContent = game.actionUsed ? 'Дело исполнено' : 'Проект или приказ';
  elements.cityActionButton.setAttribute('aria-disabled', String(game.phase !== 'playing'));
  elements.resolveButton.disabled = game.phase !== 'playing';
  elements.seedGameLabel.textContent = `КОД ${game.seed}`;
  elements.quickSoundButton.textContent = `Звук: ${settings.sound ? 'да' : 'нет'}`;
  elements.quickSoundButton.setAttribute('aria-pressed', String(settings.sound));
  elements.canvas.setAttribute('aria-label', `Кольцевая карта: ${evaluation.partialChains.length} рабочих линий, ${evaluation.fullChains.length} полных цепей, ${evaluation.shieldSpokes.length} щитов. Под ударом лучи ${game.stormTargets.map((spoke) => spoke + 1).join(', ')}.`);
  renderSelectedSector();
}

function launchNewGame() {
  audio.unlock();
  game = createGame(setupSeed, setupCharter);
  profile.runs += 1;
  profile.lastSeed = setupSeed;
  selectedRing = 0;
  selectedSectorUid = sectorAt(game, 0, 0).uid;
  saveGame();
  sound('success');
  buzz([8, 24, 10]);
  showGame();
  if (profile.runs === 1) openRulesSheet(true);
}

function performRotation(ring, steps, fromDrag = false) {
  if (!game) return;
  const result = rotateRing(game, ring, steps);
  if (!result.ok) {
    sound('error');
    buzz([12, 35, 12]);
    showToast(result.reason, true);
    boardMotion.drag = null;
    renderGameUI();
    return;
  }

  if (fromDrag && boardMotion.drag) {
    boardMotion.visualSteps[ring] += boardMotion.drag.angle / SEGMENT_ANGLE;
  }
  boardMotion.targetSteps[ring] += result.steps;
  boardMotion.drag = null;
  boardMotion.chainFlashUntil = performance.now() + 520;
  sound('rotate');
  buzz(5);
  saveGame();
  renderGameUI();
  const evaluation = evaluateBoard(game);
  announce(`${RING_NAMES[ring]} повёрнут. Полных цепей: ${evaluation.fullChains.length}. Команд осталось: ${game.command}.`);
}

function selectRing(ring) {
  selectedRing = ring;
  const existing = locateSector(game, selectedSectorUid);
  if (!existing || existing.ring !== ring) selectedSectorUid = sectorAt(game, ring, 0).uid;
  renderSelectedSector();
}

function angleFromPoint(x, y, size) {
  return Math.atan2(y - size / 2, x - size / 2);
}

function ringFromPoint(x, y, size) {
  const radius = Math.hypot(x - size / 2, y - size / 2) / size;
  if (radius >= .105 && radius <= .225) return 0;
  if (radius > .225 && radius <= .345) return 1;
  if (radius > .345 && radius <= .465) return 2;
  return null;
}

function spokeFromAngle(angle) {
  return modulo(Math.floor((angle + Math.PI / 2 + SEGMENT_ANGLE / 2) / SEGMENT_ANGLE));
}

function normalizeAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

function pointerCoordinates(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    size: rect.width
  };
}

bindPointerGesture(elements.canvas, {
  onStart(event) {
    if (!game || game.phase !== 'playing') return;
    const point = pointerCoordinates(event);
    const ring = ringFromPoint(point.x, point.y, point.size);
    if (ring == null) return;
    selectRing(ring);
    boardMotion.drag = {
      pointerId: event.pointerId,
      ring,
      startAngle: angleFromPoint(point.x, point.y, point.size),
      angle: 0,
      previewSteps: 0,
      moved: false,
      lastTick: 0
    };
  },
  onMove(event) {
    const drag = boardMotion.drag;
    if (!drag || drag.pointerId !== event.pointerId || !game) return;
    const point = pointerCoordinates(event);
    const current = angleFromPoint(point.x, point.y, point.size);
    let angle = normalizeAngle(current - drag.startAngle);
    const freeStep = game.charter === 'guild' && drag.ring === 1 && !game.freeMiddleUsed ? 1 : 0;
    const maxSteps = Math.max(0, game.command + freeStep);
    const limit = maxSteps * SEGMENT_ANGLE + SEGMENT_ANGLE * .36;
    angle = Math.max(-limit, Math.min(limit, angle));
    drag.angle = angle;
    drag.moved ||= Math.abs(angle) > .055;
    const nextTick = Math.max(-maxSteps, Math.min(maxSteps, Math.round(angle / SEGMENT_ANGLE)));
    if (nextTick !== drag.previewSteps) {
      drag.previewSteps = nextTick;
      if (nextTick !== drag.lastTick) {
        sound('rotate');
        buzz(3);
        drag.lastTick = nextTick;
      }
      renderGameUI(previewOffsets());
    }
  },
  onEnd(event) {
    const drag = boardMotion.drag;
    if (!drag || drag.pointerId !== event.pointerId || !game) return;
    const point = pointerCoordinates(event);
    if (drag.moved && drag.previewSteps !== 0) {
      performRotation(drag.ring, drag.previewSteps, true);
      return;
    }
    const spoke = spokeFromAngle(angleFromPoint(point.x, point.y, point.size));
    selectedSectorUid = sectorAt(game, drag.ring, spoke).uid;
    boardMotion.drag = null;
    renderGameUI();
    sound('click');
  },
  onCancel() {
    boardMotion.drag = null;
    renderGameUI();
  }
});

function openSheet(mode, html, options = {}) {
  sheetMode = mode;
  sheetDismissible = options.dismissible !== false;
  sheetLastFocus = document.activeElement;
  elements.sheetContent.innerHTML = html;
  elements.sheetLayer.hidden = false;
  elements.sheetLayer.setAttribute('aria-hidden', 'false');
  elements.sheetLayer.classList.add('is-open');
  setDocumentScrollLocked(true);
  window.requestAnimationFrame(() => elements.sheet.focus({ preventScroll: true }));
}

function closeSheet(force = false) {
  if (elements.sheetLayer.hidden) return;
  if (!sheetDismissible && !force) return;
  elements.sheetLayer.hidden = true;
  elements.sheetLayer.setAttribute('aria-hidden', 'true');
  elements.sheetLayer.classList.remove('is-open');
  elements.sheetContent.replaceChildren();
  sheetMode = null;
  setDocumentScrollLocked(false);
  if (!force) sheetLastFocus?.focus?.({ preventScroll: true });
}

function sheetHeader(kicker, title, close = true) {
  return `
    <header class="sheet-head">
      <div><p class="sheet-kicker">${kicker}</p><h2 id="sheet-title">${title}</h2></div>
      ${close ? '<button class="sheet-close" type="button" data-sheet-close data-native-press aria-label="Закрыть">×</button>' : ''}
    </header>
  `;
}

function openRulesSheet(firstRun = false) {
  openSheet('rules', `
    ${sheetHeader(firstRun ? 'ПЕРВЫЙ ЗАПУСК' : 'ПОЛЕВОЙ УСТАВ', 'Как держится Свод')}
    <p class="sheet-intro">В каждом цикле у тебя три команды, одно городское дело и заранее известный фронт бури.</p>
    <div class="chain-example" aria-label="Пример полной цепи">
      <span>КОНДЕНСЕР<br>вода</span><b>→</b><span>ТЕПЛИЦА<br>пища</span><b>→</b><span>КВАРТАЛ<br>запас</span>
    </div>
    <div class="rule-stack">
      <article class="rule-block"><span class="rule-number">01</span><div><h3>Совмещай входы и выходы</h3><p>Внутреннее кольцо даёт воду, ток или труд. Мастерские превращают поток в паёк, детали или мандат. Внешний город завершает цепь.</p></div></article>
      <article class="rule-block"><span class="rule-number">02</span><div><h3>Смотри, куда придёт буря</h3><p>Работающий Бастион полностью закрывает свой луч. Белая стена позже научит его прикрывать и соседей.</p></div></article>
      <article class="rule-block"><span class="rule-number">03</span><div><h3>Построй три великих проекта</h3><p>После двенадцатого цикла приходит Белая буря. Без трёх завершённых проектов даже целый город считается неготовым.</p></div></article>
    </div>
    <button class="sheet-continue" type="button" data-sheet-close data-native-press><span>${firstRun ? 'К кольцам' : 'Понятно'}</span><b>→</b></button>
  `);
}

function settingsHtml() {
  return `
    ${sheetHeader('НАСТРОЙКА ОТКЛИКА', 'Звук и ощущение')}
    <p class="sheet-intro">Никакого фонового радио. Только тихая механика, буря и короткий отклик на действия.</p>
    <div class="settings-list">
      <div class="switch-row"><span><strong>Звук механизма</strong><small>Повороты, цепи, ошибки и буря.</small></span><button type="button" data-setting="sound" aria-pressed="${settings.sound}" data-native-press>${settings.sound ? 'ВКЛ' : 'ВЫКЛ'}</button></div>
      <div class="switch-row"><span><strong>Тактильный отклик</strong><small>Короткая вибрация там, где она поддерживается.</small></span><button type="button" data-setting="haptics" aria-pressed="${settings.haptics}" data-native-press>${settings.haptics ? 'ВКЛ' : 'ВЫКЛ'}</button></div>
      <div class="switch-row"><span><strong>Спокойная схема</strong><small>Убирает поток частиц и лишнее движение карты.</small></span><button type="button" data-setting="reducedFx" aria-pressed="${settings.reducedFx}" data-native-press>${settings.reducedFx ? 'ВКЛ' : 'ВЫКЛ'}</button></div>
    </div>
  `;
}

function openSettingsSheet() {
  openSheet('settings', settingsHtml());
}

function openPauseSheet() {
  openSheet('pause', `
    ${sheetHeader('ХРОНИКА ПРИОСТАНОВЛЕНА', `Цикл ${game.cycle} / ${TOTAL_CYCLES}`)}
    <p class="sheet-intro">Состояние уже сохранено. Буря терпеливо подождёт — редкое проявление воспитания.</p>
    <div class="pause-actions">
      <button class="sheet-menu-command is-primary" type="button" data-pause-resume data-native-press><span>Продолжить</span><b>→</b></button>
      <button class="sheet-menu-command" type="button" data-pause-settings data-native-press><span>Звук и отклик</span><b>↗</b></button>
      <button class="sheet-menu-command" type="button" data-workshop-open data-native-press><span>Открыть Workshop</span><b>↗</b></button>
      <button class="sheet-menu-command" type="button" data-pause-menu data-native-press><span>В главное меню</span><b>⌂</b></button>
      <button class="sheet-menu-command is-danger" type="button" data-pause-new data-native-press><span>Начать другую хронику</span><b>＋</b></button>
      <a class="sheet-menu-command" href="../../" data-app-control data-native-press><span>В Pocket Works</span><b>←</b></a>
    </div>
  `);
}

const ORDERS = [
  { id: 'repair', mark: 'Р', name: 'Ремонт сектора', description: 'Снять 1 повреждение с выбранного сектора.', cost: '3 дет.' },
  { id: 'relief', mark: 'П', name: 'Выдать паёк', description: 'Потратить запас и вернуть 10 сцепления.', cost: '3 пайка' },
  { id: 'brace', mark: 'Щ', name: 'Поставить распорки', description: 'Все удары этой бури слабее на 3.', cost: '2 дет.' },
  { id: 'overdrive', mark: 'Ф', name: 'Форсаж привода', description: 'Получить 2 команды ценой 5 целостности.', cost: '−5 цел.' },
  { id: 'reroute', mark: '↯', name: 'Сменить прогноз', description: 'Перенести фронт бури на другие лучи.', cost: '2 манд.' }
];

function actionSheetBody() {
  const tabs = `
    <div class="action-tabs" role="tablist">
      <button type="button" role="tab" data-action-tab="projects" class="${actionTab === 'projects' ? 'is-selected' : ''}" aria-selected="${actionTab === 'projects'}" data-native-press>Великие проекты</button>
      <button type="button" role="tab" data-action-tab="orders" class="${actionTab === 'orders' ? 'is-selected' : ''}" aria-selected="${actionTab === 'orders'}" data-native-press>Разовый приказ</button>
    </div>`;

  if (actionTab === 'projects') {
    const cards = PROJECTS.map((project) => {
      const built = game.projects.includes(project.id);
      const availability = projectAvailability(game, project.id);
      const reason = built ? 'Завершён' : availability.ok ? 'Начать' : availability.reason;
      return `
        <button class="project-card ${built ? 'is-built' : ''}" type="button" data-project="${project.id}" ${availability.ok ? '' : 'disabled'} data-native-press>
          <span class="project-numeral">${project.numeral}</span>
          <span class="project-copy"><strong>${project.name}</strong><small>${project.description}</small></span>
          <span class="project-cost">${built ? 'ГОТОВ' : formatCost(project.cost)}<br>${reason}</span>
        </button>`;
    }).join('');
    return `${tabs}<div class="project-list">${cards}</div>`;
  }

  const cards = ORDERS.map((order) => {
    const availability = orderAvailability(game, order.id, { uid: selectedSectorUid });
    return `
      <button class="order-card" type="button" data-order="${order.id}" ${availability.ok ? '' : 'disabled'} data-native-press>
        <span class="order-mark">${order.mark}</span>
        <span class="order-copy"><strong>${order.name}</strong><small>${order.description}</small></span>
        <span class="order-cost">${order.cost}<br>${availability.ok ? 'ИСПОЛНИТЬ' : availability.reason}</span>
      </button>`;
  }).join('');
  return `${tabs}<div class="order-list">${cards}</div>`;
}

function openActionSheet(tab = actionTab) {
  actionTab = tab;
  openSheet('action', `
    ${sheetHeader('ОДНО ДЕЛО ЗА ЦИКЛ', game.actionUsed ? 'Дело уже исполнено' : 'Решение города')}
    <p class="sheet-intro">Проект и приказ используют один слот. Повороты колец — отдельные команды.</p>
    ${actionSheetBody()}
  `);
}

function rerenderActionSheet() {
  elements.sheetContent.innerHTML = `
    ${sheetHeader('ОДНО ДЕЛО ЗА ЦИКЛ', game.actionUsed ? 'Дело уже исполнено' : 'Решение города')}
    <p class="sheet-intro">Проект и приказ используют один слот. Повороты колец — отдельные команды.</p>
    ${actionSheetBody()}
  `;
}

function resolutionHtml() {
  const resolution = game.lastResolution;
  const attacks = resolution.attacks.map((attack) => {
    const blocked = attack.protection === 'direct';
    const adjacent = attack.protection === 'adjacent';
    const result = blocked ? 'Щит удержал' : adjacent ? `Стена: −${attack.damage}` : `Урон −${attack.damage}`;
    return `<li class="${blocked ? 'is-blocked' : ''}"><b>${String(attack.spoke + 1).padStart(2, '0')}</b><span>${attack.sector}${attack.sectorWorsened ? ' · повреждён' : ''}</span><i>${result}</i></li>`;
  }).join('');
  const nextLabel = game.phase === 'complete'
    ? 'Финальная запись'
    : game.pendingEvent
      ? 'Принять последствия'
      : `К циклу ${game.cycle + 1}`;
  return `
    ${sheetHeader(resolution.finalStorm ? 'БЕЛАЯ БУРЯ' : `ИТОГ ЦИКЛА ${String(resolution.cycle).padStart(2, '0')}`, resolution.finalStorm ? 'Фронт прошёл через город' : 'Город сделал вдох', false)}
    <div class="resolution-summary">
      <div class="resolution-grid">
        <div><span>Паёк после расхода</span><strong>${sign(resolution.after.resources.rations - resolution.before.resources.rations)}</strong></div>
        <div><span>Детали</span><strong>${sign(resolution.after.resources.parts - resolution.before.resources.parts)}</strong></div>
        <div><span>Мандат</span><strong>${sign(resolution.after.resources.mandate - resolution.before.resources.mandate)}</strong></div>
      </div>
      ${resolution.shortage > 0 ? `<p class="sheet-intro">Городу не хватило ${resolution.shortage} пайка. Сцепление и целостность просели.</p>` : `<p class="sheet-intro">Полных цепей: ${resolution.fullChains}. Город потребил ${resolution.consumption} пайка.</p>`}
      <ol class="attack-list">${attacks}</ol>
    </div>
    <button class="sheet-continue" type="button" data-resolution-next data-native-press><span>${nextLabel}</span><b>→</b></button>
  `;
}

function openResolutionSheet() {
  openSheet('resolution', resolutionHtml(), { dismissible: false });
}

function eventHtml() {
  const event = getCurrentEvent(game);
  if (!event) return '';
  const choices = event.choices.map((choice) => {
    const availability = getEventChoiceAvailability(game, choice.id);
    return `<button class="event-choice" type="button" data-event-choice="${choice.id}" ${availability.ok ? '' : 'disabled'} data-native-press><strong>${choice.label}</strong><small>${choice.detail}${availability.ok ? '' : ` · ${availability.reason}`}</small></button>`;
  }).join('');
  return `
    ${sheetHeader(event.eyebrow, event.title, false)}
    <div class="event-body"><p>${event.text}</p><div class="event-choices">${choices}</div></div>
  `;
}

function openEventSheet() {
  openSheet('event', eventHtml(), { dismissible: false });
}

function handleResolveCycle() {
  if (!game) return;
  const result = resolveCycle(game);
  if (!result.ok) {
    showToast(result.reason, true);
    return;
  }
  boardMotion.stormFlashUntil = performance.now() + 950;
  sound('storm');
  buzz([14, 38, 12]);
  saveGame();
  renderGameUI();
  openResolutionSheet();
}

function handleResolutionNext() {
  if (game.phase === 'complete') {
    showCompletion();
    return;
  }
  const result = advanceFromResolution(game);
  if (!result.ok) return;
  saveGame();
  renderGameUI();
  if (result.event) {
    elements.sheetContent.innerHTML = eventHtml();
    sheetMode = 'event';
    sheetDismissible = false;
    elements.sheet.scrollTop = 0;
  } else {
    closeSheet(true);
    showToast(`Цикл ${game.cycle}. Прогноз обновлён.`);
  }
}

function handleEventChoice(choiceId) {
  const result = applyEventChoice(game, choiceId);
  if (!result.ok) {
    showToast(result.reason, true);
    return;
  }
  const message = result.choice.result;
  saveGame();
  if (game.phase === 'complete') {
    closeSheet(true);
    showCompletion();
    return;
  }
  renderGameUI();
  closeSheet(true);
  sound('success');
  buzz(8);
  showToast(message);
}

function handleProject(projectId) {
  const result = buildProject(game, projectId);
  if (!result.ok) {
    showToast(result.reason, true);
    return;
  }
  saveGame();
  renderGameUI();
  closeSheet(true);
  sound('success');
  buzz([8, 26, 8]);
  showToast(`${result.project.name} завершён. Проектов: ${game.projects.length}/3.`);
}

function handleOrder(orderId) {
  const result = enactOrder(game, orderId, { uid: selectedSectorUid });
  if (!result.ok) {
    showToast(result.reason, true);
    return;
  }
  saveGame();
  renderGameUI();
  closeSheet(true);
  sound('success');
  buzz(7);
  const order = ORDERS.find((entry) => entry.id === orderId);
  showToast(`${order.name}: приказ исполнен.`);
}

function toggleSetting(key) {
  if (!(key in settings)) return;
  settings[key] = !settings[key];
  persistSettings();
  storage.set('settings', settings);
  if (key === 'sound' && settings.sound) {
    audio.unlock();
    sound('click');
  }
  if (key === 'haptics' && settings.haptics) buzz(8);
  if (sheetMode === 'settings') elements.sheetContent.innerHTML = settingsHtml();
}

elements.continueButton.addEventListener('click', () => {
  audio.unlock();
  game?.phase === 'complete' ? showCompletion() : showGame();
});
elements.newGameButton.addEventListener('click', openSetup);
elements.rulesButton.addEventListener('click', () => openRulesSheet(false));
elements.startSettingsButton.addEventListener('click', openSettingsSheet);
elements.setupBackButton.addEventListener('click', showStart);
elements.shuffleSeedButton.addEventListener('click', () => {
  setupSeed = makeSeed();
  elements.seedLabel.textContent = setupSeed;
  sound('rotate');
  buzz(4);
});
elements.launchButton.addEventListener('click', launchNewGame);

for (const option of elements.charterOptions) {
  option.addEventListener('click', () => {
    setupCharter = option.dataset.charter;
    renderCharterSelection();
    sound('click');
    buzz(5);
  });
}

elements.pauseButton.addEventListener('click', openPauseSheet);
elements.quickSoundButton.addEventListener('click', () => toggleSetting('sound'));
elements.rotateLeft.addEventListener('click', () => performRotation(selectedRing, -1));
elements.rotateRight.addEventListener('click', () => performRotation(selectedRing, 1));
for (const button of elements.ringButtons) {
  button.addEventListener('click', () => {
    selectRing(Number(button.dataset.ring));
    sound('click');
  });
}
elements.cityActionButton.addEventListener('click', () => {
  if (game?.phase === 'playing') openActionSheet();
});
elements.resolveButton.addEventListener('click', handleResolveCycle);
elements.againButton.addEventListener('click', openSetup);
elements.completionMenuButton.addEventListener('click', showStart);
elements.gameWorkshopButton.addEventListener('click', () => workshop.open());
elements.completionWorkshopButton.addEventListener('click', () => workshop.open());

elements.sheetBackdrop.addEventListener('click', () => closeSheet());
elements.sheetContent.addEventListener('click', (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('[data-sheet-close]')) closeSheet();
  if (target.matches('[data-setting]')) toggleSetting(target.dataset.setting);
  if (target.matches('[data-pause-resume]')) closeSheet();
  if (target.matches('[data-pause-settings]')) openSettingsSheet();
  if (target.matches('[data-workshop-open]')) {
    closeSheet(true);
    workshop.open();
  }
  if (target.matches('[data-pause-menu]')) showStart();
  if (target.matches('[data-pause-new]')) openSetup();
  if (target.matches('[data-action-tab]')) {
    actionTab = target.dataset.actionTab;
    rerenderActionSheet();
  }
  if (target.matches('[data-project]')) handleProject(target.dataset.project);
  if (target.matches('[data-order]')) handleOrder(target.dataset.order);
  if (target.matches('[data-resolution-next]')) handleResolutionNext();
  if (target.matches('[data-event-choice]')) handleEventChoice(target.dataset.eventChoice);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.sheetLayer.hidden) {
    closeSheet();
    return;
  }
  if (currentView !== 'game' || !game || game.phase !== 'playing' || !elements.sheetLayer.hidden) return;
  if (event.key === 'ArrowLeft') performRotation(selectedRing, -1);
  if (event.key === 'ArrowRight') performRotation(selectedRing, 1);
  if (event.key === '1' || event.key === '2' || event.key === '3') selectRing(Number(event.key) - 1);
});

window.addEventListener('appdatareset', () => {
  game = null;
  profile = { ...DEFAULT_PROFILE };
  settings = { ...DEFAULT_SETTINGS };
  showStart();
});

function resizeBoard() {
  const rect = elements.canvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const physical = Math.max(1, Math.round(rect.width * dpr));
  if (elements.canvas.width !== physical || elements.canvas.height !== physical) {
    elements.canvas.width = physical;
    elements.canvas.height = physical;
  }
  boardCssSize = rect.width;
  boardDpr = dpr;
}

const resizeObserver = new ResizeObserver(resizeBoard);
resizeObserver.observe(elements.boardFrame);
window.addEventListener('appviewportchange', resizeBoard);

function annularPath(context, cx, cy, innerRadius, outerRadius, start, end) {
  context.beginPath();
  context.arc(cx, cy, outerRadius, start, end);
  context.arc(cx, cy, innerRadius, end, start, true);
  context.closePath();
}

function carrierColor(carrier) {
  return CARRIERS[carrier]?.color || '#173f52';
}

const SECTOR_FILLS = Object.freeze({
  condenser: '#b7d0ca',
  dynamo: '#e3c780',
  forum: '#d9a28e',
  garden: '#c2cfad',
  forge: '#afc2c7',
  guild: '#c7b8ca',
  habitat: '#dbe2cf',
  bastion: '#b5c8cc',
  council: '#d2c5d4'
});

function drawGlyph(context, kind, x, y, size, angle) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.strokeStyle = '#173f52';
  context.fillStyle = '#173f52';
  context.lineWidth = Math.max(1, size * .08);
  context.lineCap = 'square';
  context.lineJoin = 'miter';

  if (kind === 'condenser') {
    context.beginPath();
    context.moveTo(0, -size * .46);
    context.quadraticCurveTo(size * .42, 0, 0, size * .46);
    context.quadraticCurveTo(-size * .42, 0, 0, -size * .46);
    context.stroke();
  }
  if (kind === 'dynamo') {
    context.beginPath();
    context.moveTo(size * .1, -size * .48);
    context.lineTo(-size * .26, size * .04);
    context.lineTo(size * .06, size * .02);
    context.lineTo(-size * .1, size * .48);
    context.lineTo(size * .3, -size * .08);
    context.lineTo(-size * .02, -size * .05);
    context.closePath();
    context.fill();
  }
  if (kind === 'forum') {
    for (const offset of [-.3, 0, .3]) {
      context.fillRect(offset * size - size * .055, -size * .32, size * .11, size * .64);
    }
    context.fillRect(-size * .45, -size * .43, size * .9, size * .1);
    context.fillRect(-size * .45, size * .33, size * .9, size * .1);
  }
  if (kind === 'garden') {
    context.beginPath();
    context.ellipse(0, -size * .05, size * .26, size * .44, Math.PI / 4, 0, TAU);
    context.stroke();
    context.beginPath();
    context.moveTo(-size * .34, size * .4);
    context.lineTo(size * .3, -size * .36);
    context.stroke();
  }
  if (kind === 'forge') {
    context.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const a = -Math.PI / 2 + index * Math.PI / 3;
      const px = Math.cos(a) * size * .4;
      const py = Math.sin(a) * size * .4;
      if (index === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath();
    context.stroke();
    context.fillRect(-size * .08, -size * .08, size * .16, size * .16);
  }
  if (kind === 'guild') {
    context.strokeRect(-size * .36, -size * .36, size * .72, size * .72);
    context.beginPath();
    context.moveTo(-size * .36, 0);
    context.lineTo(size * .36, 0);
    context.moveTo(0, -size * .36);
    context.lineTo(0, size * .36);
    context.stroke();
  }
  if (kind === 'habitat') {
    context.beginPath();
    context.moveTo(-size * .42, -size * .05);
    context.lineTo(0, -size * .42);
    context.lineTo(size * .42, -size * .05);
    context.lineTo(size * .32, size * .4);
    context.lineTo(-size * .32, size * .4);
    context.closePath();
    context.stroke();
    context.fillRect(-size * .07, size * .08, size * .14, size * .32);
  }
  if (kind === 'bastion') {
    context.beginPath();
    context.moveTo(-size * .38, -size * .35);
    context.lineTo(size * .38, -size * .35);
    context.lineTo(size * .29, size * .18);
    context.lineTo(0, size * .45);
    context.lineTo(-size * .29, size * .18);
    context.closePath();
    context.stroke();
    context.fillRect(-size * .05, -size * .25, size * .1, size * .52);
  }
  if (kind === 'council') {
    context.beginPath();
    context.arc(0, 0, size * .35, 0, TAU);
    context.stroke();
    context.beginPath();
    context.arc(0, 0, size * .09, 0, TAU);
    context.fill();
    for (let index = 0; index < 4; index += 1) {
      const a = index * Math.PI / 2;
      context.beginPath();
      context.moveTo(Math.cos(a) * size * .16, Math.sin(a) * size * .16);
      context.lineTo(Math.cos(a) * size * .48, Math.sin(a) * size * .48);
      context.stroke();
    }
  }
  context.restore();
}

function drawDamage(context, cx, cy, radius, angle, damage, scale) {
  if (damage <= 0) return;
  const x = cx + Math.cos(angle) * radius;
  const y = cy + Math.sin(angle) * radius;
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.strokeStyle = damage >= 2 ? '#df6537' : 'rgba(13,43,54,.55)';
  context.lineWidth = Math.max(1, scale * .004);
  context.beginPath();
  context.moveTo(-scale * .025, -scale * .04);
  context.lineTo(scale * .005, -scale * .012);
  context.lineTo(-scale * .012, scale * .015);
  context.lineTo(scale * .032, scale * .045);
  context.moveTo(scale * .005, -scale * .012);
  context.lineTo(scale * .038, -scale * .035);
  context.stroke();
  context.restore();
}

function drawBoard(time) {
  if (!game || !boardCssSize || !boardVisible) return;
  const context = elements.canvas.getContext('2d');
  const size = boardCssSize;
  const cx = size / 2;
  const cy = size / 2;
  const drag = boardMotion.drag;
  const preview = evaluateBoard(game, previewOffsets());
  const previewFull = new Set(preview.fullChains.map((chain) => chain.spoke));
  const previewPartial = new Set(preview.partialChains);

  context.setTransform(boardDpr, 0, 0, boardDpr, 0, 0);
  context.clearRect(0, 0, size, size);
  context.save();

  context.strokeStyle = 'rgba(23,63,82,.13)';
  context.lineWidth = 1;
  for (let spoke = 0; spoke < SLOT_COUNT; spoke += 1) {
    const angle = -Math.PI / 2 + spoke * SEGMENT_ANGLE;
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * size * .055, cy + Math.sin(angle) * size * .055);
    context.lineTo(cx + Math.cos(angle) * size * .48, cy + Math.sin(angle) * size * .48);
    context.stroke();
  }

  const stormPhase = settings.reducedFx ? 0 : Math.sin(time / 220) * .006;
  for (const spoke of game.stormTargets) {
    const centerAngle = -Math.PI / 2 + spoke * SEGMENT_ANGLE;
    context.save();
    context.strokeStyle = '#df6537';
    context.lineWidth = Math.max(2, size * .008);
    context.shadowColor = boardMotion.stormFlashUntil > time ? 'rgba(223,101,55,.9)' : 'transparent';
    context.shadowBlur = boardMotion.stormFlashUntil > time ? size * .045 : 0;
    for (let line = 0; line < 2; line += 1) {
      const radius = size * (.472 + line * .019 + stormPhase);
      context.beginPath();
      context.arc(cx, cy, radius, centerAngle - SEGMENT_ANGLE * .34, centerAngle + SEGMENT_ANGLE * .34);
      context.stroke();
    }
    context.restore();
  }

  const ringBounds = [
    [size * .105, size * .218],
    [size * .228, size * .34],
    [size * .35, size * .458]
  ];

  for (let ring = 0; ring < 3; ring += 1) {
    const [innerRadius, outerRadius] = ringBounds[ring];
    const dragSteps = drag?.ring === ring ? drag.angle / SEGMENT_ANGLE : 0;
    const visualOffset = boardMotion.visualSteps[ring] + dragSteps;
    for (let index = 0; index < SLOT_COUNT; index += 1) {
      const sector = game.rings[ring][index];
      const type = SECTOR_TYPES[sector.kind];
      const centerAngle = -Math.PI / 2 + (index + visualOffset) * SEGMENT_ANGLE;
      const gap = .018;
      const start = centerAngle - SEGMENT_ANGLE / 2 + gap;
      const end = centerAngle + SEGMENT_ANGLE / 2 - gap;
      const spoke = modulo(Math.round(index + visualOffset));
      const active = ring === 0 ? previewPartial.has(spoke) : ring === 1 ? previewPartial.has(spoke) : previewFull.has(spoke);
      const selected = sector.uid === selectedSectorUid;

      annularPath(context, cx, cy, innerRadius, outerRadius, start, end);
      context.fillStyle = sector.damage >= 2 ? '#9a9a8f' : SECTOR_FILLS[sector.kind];
      context.globalAlpha = sector.damage >= 2 ? .7 : active ? 1 : .78;
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = selected ? '#df6537' : '#173f52';
      context.lineWidth = selected ? Math.max(2.5, size * .007) : Math.max(1, size * .0025);
      context.stroke();

      if (active) {
        annularPath(context, cx, cy, innerRadius + 2, outerRadius - 2, start + .012, end - .012);
        context.strokeStyle = carrierColor(type.output || type.input);
        context.lineWidth = Math.max(1.5, size * .004);
        context.globalAlpha = .9;
        context.stroke();
        context.globalAlpha = 1;
      }

      const iconRadius = (innerRadius + outerRadius) / 2;
      const iconX = cx + Math.cos(centerAngle) * iconRadius;
      const iconY = cy + Math.sin(centerAngle) * iconRadius;
      let iconRotation = centerAngle + Math.PI / 2;
      if (Math.cos(centerAngle) < 0) iconRotation += Math.PI;
      drawGlyph(context, sector.kind, iconX, iconY, size * (ring === 2 ? .037 : .032), iconRotation);
      drawDamage(context, cx, cy, iconRadius, centerAngle + .14, sector.damage, size);

      const connectorColor = carrierColor(type.output || type.input);
      context.fillStyle = connectorColor;
      if (ring > 0) {
        const connectorX = cx + Math.cos(centerAngle) * (innerRadius + size * .007);
        const connectorY = cy + Math.sin(centerAngle) * (innerRadius + size * .007);
        context.beginPath();
        context.arc(connectorX, connectorY, size * .008, 0, TAU);
        context.fill();
      }
      if (ring < 2) {
        const outColor = carrierColor(type.output);
        context.fillStyle = outColor;
        const connectorX = cx + Math.cos(centerAngle) * (outerRadius - size * .007);
        const connectorY = cy + Math.sin(centerAngle) * (outerRadius - size * .007);
        context.beginPath();
        context.arc(connectorX, connectorY, size * .008, 0, TAU);
        context.fill();
      }
    }
  }

  for (const chain of preview.spokes) {
    if (!chain.middleActive) continue;
    const angle = -Math.PI / 2 + chain.spoke * SEGMENT_ANGLE;
    const endRadius = chain.outerActive ? size * .442 : size * .325;
    const color = chain.outerActive
      ? chain.effect === 'habitat' ? '#71896a' : chain.effect === 'bastion' ? '#4d8b91' : '#765f83'
      : carrierColor(chain.types[1].output);
    context.save();
    context.strokeStyle = color;
    context.lineWidth = Math.max(2, size * (chain.outerActive ? .009 : .006));
    context.globalAlpha = chain.outerActive ? .88 : .56;
    context.shadowColor = color;
    context.shadowBlur = boardMotion.chainFlashUntil > time ? size * .035 : size * .012;
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * size * .075, cy + Math.sin(angle) * size * .075);
    context.lineTo(cx + Math.cos(angle) * endRadius, cy + Math.sin(angle) * endRadius);
    context.stroke();
    if (!settings.reducedFx) {
      const progress = (time / 1050 + chain.spoke * .117) % 1;
      const radius = size * .085 + (endRadius - size * .085) * progress;
      context.globalAlpha = .95;
      context.fillStyle = '#f6f1e4';
      context.beginPath();
      context.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, size * .009, 0, TAU);
      context.fill();
    }
    context.restore();
  }

  const pulse = settings.reducedFx ? 1 : 1 + Math.sin(time / 290) * .07;
  context.save();
  context.translate(cx, cy);
  context.scale(pulse, pulse);
  context.fillStyle = '#173f52';
  context.beginPath();
  context.arc(0, 0, size * .078, 0, TAU);
  context.fill();
  context.strokeStyle = '#f6f1e4';
  context.lineWidth = Math.max(1.5, size * .005);
  context.beginPath();
  context.arc(0, 0, size * .055, 0, TAU);
  context.stroke();
  context.fillStyle = '#df6537';
  context.beginPath();
  context.arc(0, 0, size * .021, 0, TAU);
  context.fill();
  context.fillStyle = '#f6f1e4';
  context.font = `800 ${Math.max(8, size * .022)}px ui-monospace, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(game.cycle).padStart(2, '0'), 0, -size * .041);
  context.restore();

  context.restore();
}

function updateBoardMotion(deltaSeconds) {
  for (let ring = 0; ring < 3; ring += 1) {
    const difference = boardMotion.targetSteps[ring] - boardMotion.visualSteps[ring];
    if (Math.abs(difference) < .001 || settings.reducedFx) {
      boardMotion.visualSteps[ring] = boardMotion.targetSteps[ring];
      continue;
    }
    const factor = 1 - Math.pow(.001, Math.min(.05, deltaSeconds));
    boardMotion.visualSteps[ring] += difference * factor;
  }
}

function boardLoop(time) {
  if (!boardVisible || document.hidden) {
    animationFrame = 0;
    return;
  }
  const delta = lastFrameTime ? Math.min(.05, (time - lastFrameTime) / 1000) : .016;
  lastFrameTime = time;
  updateBoardMotion(delta);
  drawBoard(time);
  animationFrame = window.requestAnimationFrame(boardLoop);
}

function startBoardLoop() {
  if (animationFrame || !boardVisible || document.hidden) return;
  lastFrameTime = 0;
  animationFrame = window.requestAnimationFrame(boardLoop);
}

function stopBoardLoop() {
  if (animationFrame) window.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  lastFrameTime = 0;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopBoardLoop();
  else if (boardVisible) startBoardLoop();
});

window.addEventListener('pagehide', saveGame);

renderStart();
switchView('start');
