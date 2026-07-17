import { installMobileRuntime, setDocumentScrollLocked } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import {
  DIFFICULTIES,
  applyMove,
  chooseAIMove,
  createGame,
  directionFromDelta,
  forceTimeLoss,
  isBurned,
  legalMoves,
  moveDestination,
  normalizeSize,
  restoreGame,
  serializeGame,
  tileIndex
} from './engine.mjs';

installMobileRuntime();
setDocumentScrollLocked(true);

const APP_VERSION = '1.0.0';
const STORAGE_NAMESPACE = 'pocket-works:sled';
const STORAGE_KEY = `${STORAGE_NAMESPACE}:profile`;
const CLOCKS = Object.freeze({
  none: { initial: Infinity, increment: 0, label: 'без часов' },
  blitz: { initial: 180_000, increment: 2_000, label: '3+2' },
  rapid: { initial: 600_000, increment: 0, label: '10 минут' }
});

const byId = (id) => document.getElementById(id);
const elements = {
  menuScreen: byId('menuScreen'),
  setupScreen: byId('setupScreen'),
  rulesScreen: byId('rulesScreen'),
  gameScreen: byId('gameScreen'),
  duelButton: byId('duelButton'),
  aiButton: byId('aiButton'),
  resumeButton: byId('resumeButton'),
  resumeMeta: byId('resumeMeta'),
  gamesStat: byId('gamesStat'),
  humanWinsStat: byId('humanWinsStat'),
  streakStat: byId('streakStat'),
  rulesButton: byId('rulesButton'),
  soundButton: byId('soundButton'),
  setupBackButton: byId('setupBackButton'),
  setupKicker: byId('setupKicker'),
  setupTitle: byId('setupTitle'),
  sizeChoices: byId('sizeChoices'),
  clockChoices: byId('clockChoices'),
  difficultyChoices: byId('difficultyChoices'),
  aiFields: [...document.querySelectorAll('.ai-field')],
  pieRuleButton: byId('pieRuleButton'),
  humanFirstButton: byId('humanFirstButton'),
  startMatchButton: byId('startMatchButton'),
  rulesBackButton: byId('rulesBackButton'),
  rulesPlayButton: byId('rulesPlayButton'),
  pauseButton: byId('pauseButton'),
  turnKicker: byId('turnKicker'),
  turnLabel: byId('turnLabel'),
  clockBank: byId('clockBank'),
  clocks: [byId('clock0'), byId('clock1')],
  boardFrame: byId('boardFrame'),
  board: byId('board'),
  stone: byId('stone'),
  moveEcho: byId('moveEcho'),
  northExitButton: byId('northExitButton'),
  southExitButton: byId('southExitButton'),
  swapBanner: byId('swapBanner'),
  swapButton: byId('swapButton'),
  burnedCount: byId('burnedCount'),
  gameHint: byId('gameHint'),
  connectionMark: byId('connectionMark'),
  thinking: byId('thinking'),
  pauseOverlay: byId('pauseOverlay'),
  pauseMode: byId('pauseMode'),
  pauseTurn: byId('pauseTurn'),
  pauseBoard: byId('pauseBoard'),
  continueButton: byId('continueButton'),
  restartButton: byId('restartButton'),
  pauseSoundButton: byId('pauseSoundButton'),
  hapticsButton: byId('hapticsButton'),
  quitButton: byId('quitButton'),
  resultOverlay: byId('resultOverlay'),
  resultPath: byId('resultPath'),
  resultKicker: byId('resultKicker'),
  resultTitle: byId('resultTitle'),
  resultCopy: byId('resultCopy'),
  resultMoves: byId('resultMoves'),
  resultBoard: byId('resultBoard'),
  resultTime: byId('resultTime'),
  againButton: byId('againButton'),
  resultSetupButton: byId('resultSetupButton'),
  resultMenuButton: byId('resultMenuButton'),
  confirmOverlay: byId('confirmOverlay'),
  confirmRestartButton: byId('confirmRestartButton'),
  cancelRestartButton: byId('cancelRestartButton'),
  errorOverlay: byId('errorOverlay'),
  errorCopy: byId('errorCopy'),
  reloadButton: byId('reloadButton'),
  toast: byId('toast')
};

const screens = [elements.menuScreen, elements.setupScreen, elements.rulesScreen, elements.gameScreen];
const workshop = createWorkshopMode({
  appName: 'СЛЕД',
  version: APP_VERSION,
  cachePrefix: 'sled-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset() {
    profile = freshProfile();
    saveProfile();
    location.reload();
  }
});
void workshop;

function freshProfile() {
  return {
    version: 1,
    sound: true,
    haptics: true,
    games: 0,
    humanWins: 0,
    currentStreak: 0,
    bestStreak: 0,
    savedMatch: null,
    lastSetup: {
      size: 9,
      clock: 'none',
      pieRule: true,
      difficulty: 'tactician',
      humanFirst: true
    }
  };
}

function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || raw.version !== 1) return freshProfile();
    return {
      version: 1,
      sound: raw.sound !== false,
      haptics: raw.haptics !== false,
      games: nonNegativeInt(raw.games),
      humanWins: nonNegativeInt(raw.humanWins),
      currentStreak: nonNegativeInt(raw.currentStreak),
      bestStreak: nonNegativeInt(raw.bestStreak),
      savedMatch: sanitizeSavedMatch(raw.savedMatch),
      lastSetup: sanitizeSetup(raw.lastSetup)
    };
  } catch {
    return freshProfile();
  }
}

function nonNegativeInt(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function sanitizeSetup(raw = {}) {
  return {
    size: normalizeSize(raw.size),
    clock: CLOCKS[raw.clock] ? raw.clock : 'none',
    pieRule: raw.pieRule !== false,
    difficulty: DIFFICULTIES[raw.difficulty] ? raw.difficulty : 'tactician',
    humanFirst: raw.humanFirst !== false
  };
}

function sanitizeConfig(raw = {}) {
  const setup = sanitizeSetup(raw);
  const mode = raw.mode === 'ai' ? 'ai' : 'local';
  const humanParticipant = raw.humanParticipant === 1 ? 1 : 0;
  return { ...setup, mode, humanParticipant };
}

function sanitizeSavedMatch(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const game = restoreGame(raw.game);
  if (!game || game.ended) return null;
  const config = sanitizeConfig(raw.config);
  const clock = CLOCKS[config.clock];
  const fallback = clock.initial;
  const times = [0, 1].map((index) => {
    if (!Number.isFinite(fallback)) return Infinity;
    const value = Number(raw.times?.[index]);
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
  });
  return {
    game: serializeGame(game),
    config,
    times,
    elapsedMs: Math.max(0, Number(raw.elapsedMs) || 0)
  };
}

let profile = loadProfile();
let setup = { ...profile.lastSetup, mode: 'local' };
let match = null;
let activeScreen = 'menu';
let inputLocked = false;
let toastTimer = 0;
let aiGeneration = 0;
let frameHandle = 0;
let lastFrameAt = performance.now();
let lastSavedAt = 0;
let pointerStart = null;
let cells = [];

function saveProfile() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.warn('СЛЕД не смог сохранить партию', error);
  }
}

class TraceAudio {
  constructor(enabled) {
    this.enabled = enabled;
    this.context = null;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled && this.context?.state === 'running') this.context.suspend().catch(() => {});
  }

  ensure() {
    if (!this.enabled) return null;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    if (!this.context) this.context = new Context();
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    return this.context;
  }

  tone(frequency, duration = .08, gain = .045, type = 'sine', delay = 0) {
    const context = this.ensure();
    if (!context) return;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    volume.gain.setValueAtTime(.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + .008);
    volume.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(volume).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }

  noise(duration = .12, gain = .035) {
    const context = this.ensure();
    if (!context) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const volume = context.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 820;
    filter.Q.value = .7;
    volume.gain.value = gain;
    source.buffer = buffer;
    source.connect(filter).connect(volume).connect(context.destination);
    source.start();
  }

  move(goal) {
    this.tone(goal === 'north' ? 330 : 247, .07, .038, 'triangle');
    this.noise(.08, .018);
  }

  swap() {
    this.tone(250, .08, .035, 'triangle');
    this.tone(390, .11, .035, 'triangle', .07);
  }

  invalid() {
    this.tone(92, .11, .035, 'square');
  }

  victory() {
    this.tone(294, .22, .04, 'triangle');
    this.tone(440, .25, .04, 'triangle', .12);
    this.tone(587, .34, .045, 'triangle', .24);
  }

  timeout() {
    this.tone(150, .13, .045, 'square');
    this.tone(92, .24, .05, 'sawtooth', .12);
  }
}

const audio = new TraceAudio(profile.sound);

function haptic(pattern) {
  if (profile.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function showScreen(name) {
  activeScreen = name;
  const target = name === 'menu' ? elements.menuScreen : name === 'setup' ? elements.setupScreen : name === 'rules' ? elements.rulesScreen : elements.gameScreen;
  screens.forEach((screen) => {
    const active = screen === target;
    screen.hidden = !active;
    screen.classList.toggle('is-active', active);
  });
  if (name !== 'game') setPaused(true, false);
}

function setOverlay(element, visible) {
  element.hidden = !visible;
}

function toast(message, duration = 1500) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), duration);
}

function syncMenu() {
  elements.gamesStat.textContent = String(profile.games);
  elements.humanWinsStat.textContent = String(profile.humanWins);
  elements.streakStat.textContent = String(profile.bestStreak);
  elements.resumeButton.hidden = !profile.savedMatch;
  if (profile.savedMatch) {
    const saved = profile.savedMatch;
    const mode = saved.config.mode === 'ai' ? 'против машины' : 'дуэль';
    elements.resumeMeta.textContent = `${saved.config.size}×${saved.config.size} · ход ${saved.game.plies + 1} · ${mode}`;
  }
  syncSoundControls();
}

function syncSoundControls() {
  const soundLabel = profile.sound ? 'ВКЛ' : 'ВЫКЛ';
  elements.soundButton.textContent = `ЗВУК: ${soundLabel}`;
  elements.pauseSoundButton.textContent = `Звук: ${soundLabel.toLowerCase()}`;
  elements.soundButton.setAttribute('aria-pressed', String(profile.sound));
  elements.pauseSoundButton.setAttribute('aria-pressed', String(profile.sound));
  const hapticLabel = profile.haptics ? 'вкл' : 'выкл';
  elements.hapticsButton.textContent = `Отдача: ${hapticLabel}`;
  elements.hapticsButton.setAttribute('aria-pressed', String(profile.haptics));
}

function toggleSound() {
  profile.sound = !profile.sound;
  audio.setEnabled(profile.sound);
  saveProfile();
  syncSoundControls();
  if (profile.sound) audio.tone(420, .08, .035, 'triangle');
}

function toggleHaptics() {
  profile.haptics = !profile.haptics;
  saveProfile();
  syncSoundControls();
  if (profile.haptics) haptic(18);
}

function openSetup(mode) {
  setup = { ...profile.lastSetup, mode };
  elements.setupKicker.textContent = mode === 'ai' ? 'ДУЭЛЬ С МАШИНОЙ' : 'ЛОКАЛЬНАЯ ДУЭЛЬ';
  elements.setupTitle.textContent = mode === 'ai' ? 'Выбери противника' : 'Настрой поле';
  elements.aiFields.forEach((field) => { field.hidden = mode !== 'ai'; });
  syncSetupControls();
  showScreen('setup');
}

function syncSetupControls() {
  syncChoice(elements.sizeChoices, String(setup.size));
  syncChoice(elements.clockChoices, setup.clock);
  syncChoice(elements.difficultyChoices, setup.difficulty);
  syncSwitch(elements.pieRuleButton, setup.pieRule, 'ВКЛ', 'ВЫКЛ');
  syncSwitch(elements.humanFirstButton, setup.humanFirst, 'ДА', 'НЕТ');
}

function syncChoice(container, value) {
  [...container.querySelectorAll('button[data-value]')].forEach((button) => button.classList.toggle('is-selected', button.dataset.value === value));
}

function syncSwitch(button, active, onText, offText) {
  button.classList.toggle('is-on', active);
  button.setAttribute('aria-pressed', String(active));
  button.querySelector('span').textContent = active ? onText : offText;
}

function bindChoice(container, key, parser = (value) => value) {
  container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    setup[key] = parser(button.dataset.value);
    syncChoice(container, button.dataset.value);
    audio.tone(310, .06, .026, 'triangle');
    haptic(8);
  });
}

function createMatch(config) {
  const clock = CLOCKS[config.clock];
  return {
    config,
    game: createGame({ size: config.size, pieRule: config.pieRule }),
    times: [clock.initial, clock.initial],
    elapsedMs: 0,
    running: true,
    finishedRecorded: false
  };
}

function startConfiguredMatch() {
  profile.lastSetup = sanitizeSetup(setup);
  const humanParticipant = setup.mode === 'ai' && setup.humanFirst === false ? 1 : 0;
  const config = sanitizeConfig({ ...setup, humanParticipant });
  match = createMatch(config);
  profile.savedMatch = null;
  saveProfile();
  beginMatchView();
}

function beginMatchView() {
  if (!match) return;
  aiGeneration += 1;
  inputLocked = false;
  setOverlay(elements.pauseOverlay, false);
  setOverlay(elements.resultOverlay, false);
  setOverlay(elements.confirmOverlay, false);
  buildBoard(match.game.size);
  showScreen('game');
  match.running = true;
  lastFrameAt = performance.now();
  renderGame();
  saveCurrentMatch();
  scheduleAIIfNeeded();
}

function resumeSavedMatch() {
  const saved = profile.savedMatch;
  if (!saved) return;
  const game = restoreGame(saved.game);
  if (!game) {
    profile.savedMatch = null;
    saveProfile();
    syncMenu();
    toast('Сохранённый след повреждён и удалён.');
    return;
  }
  match = {
    config: sanitizeConfig(saved.config),
    game,
    times: [...saved.times],
    elapsedMs: saved.elapsedMs,
    running: true,
    finishedRecorded: false
  };
  beginMatchView();
}

function saveCurrentMatch() {
  if (!match || match.game.ended) {
    profile.savedMatch = null;
  } else {
    profile.savedMatch = {
      game: serializeGame(match.game),
      config: { ...match.config },
      times: match.times.map((value) => Number.isFinite(value) ? value : null),
      elapsedMs: match.elapsedMs
    };
  }
  saveProfile();
  syncMenu();
}

function buildBoard(size) {
  elements.boardFrame.style.setProperty('--size', String(size));
  elements.board.innerHTML = '';
  cells = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell';
      button.dataset.x = String(x);
      button.dataset.y = String(y);
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', `Клетка ${x + 1}, ${y + 1}`);
      button.style.setProperty('--burn-tilt', `${((x * 13 + y * 7) % 7) - 3}deg`);
      elements.board.append(button);
      cells.push(button);
    }
  }
}

function participantName(participant) {
  if (match?.config.mode === 'ai') return participant === match.config.humanParticipant ? 'ТЫ' : 'МАШИНА';
  return `ИГРОК ${participant + 1}`;
}

function goalLabel(goal) {
  return goal === 'north' ? 'К ВЕРХУ' : 'К НИЗУ';
}

function currentIsAI() {
  return Boolean(match && match.config.mode === 'ai' && match.game.current !== match.config.humanParticipant);
}

function stepMoveForCell(x, y) {
  if (!match) return null;
  const dx = x - match.game.x;
  const dy = y - match.game.y;
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 0 && dy === -1) return 'N';
  return null;
}

function renderGame(freshBurnIndex = null) {
  if (!match) return;
  const { game } = match;
  const moves = new Set(legalMoves(game));
  const humanCanMove = !currentIsAI() && !inputLocked && match.running && !game.ended;

  cells.forEach((cell) => {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const index = tileIndex(game, x, y);
    const burned = isBurned(game, x, y);
    const move = stepMoveForCell(x, y);
    const legal = Boolean(move && moves.has(move) && humanCanMove);
    cell.classList.toggle('is-burned', burned);
    cell.classList.toggle('is-legal', legal);
    cell.classList.toggle('is-last-target', Boolean(game.lastMove?.to && game.lastMove.to.x === x && game.lastMove.to.y === y));
    cell.disabled = !legal;
    cell.setAttribute('aria-disabled', String(!legal));
    if (index === freshBurnIndex) {
      cell.classList.remove('is-fresh-burn');
      void cell.offsetWidth;
      cell.classList.add('is-fresh-burn');
      setTimeout(() => cell.classList.remove('is-fresh-burn'), 450);
      positionEcho(cell);
    }
  });

  positionStone(game.x, game.y);
  elements.stone.classList.toggle('is-north', game.goals[game.current] === 'north');
  elements.stone.classList.toggle('is-south', game.goals[game.current] === 'south');
  elements.stone.classList.toggle('is-thinking', currentIsAI() && match.running);
  if (!game.ended) elements.stone.classList.remove('is-exiting');

  elements.turnKicker.textContent = `ХОД ${String(game.plies + 1).padStart(2, '0')}`;
  elements.turnLabel.textContent = `${participantName(game.current)} · ${goalLabel(game.goals[game.current])}`;
  elements.burnedCount.textContent = `${game.plies - (game.swapUsed ? 1 : 0)} / ${game.size * game.size}`;
  elements.gameHint.textContent = currentIsAI() ? 'Не моргай. Она тоже ищет карман.' : game.swapAvailable ? 'Можно поменяться целями или сделать обычный ход.' : 'Тапни соседнюю клетку или смахни камень.';

  elements.northExitButton.disabled = !(moves.has('EXIT_N') && humanCanMove);
  elements.southExitButton.disabled = !(moves.has('EXIT_S') && humanCanMove);
  elements.swapBanner.hidden = !(game.swapAvailable && humanCanMove);
  elements.thinking.hidden = !(currentIsAI() && match.running && !game.ended);
  renderClocks();
}

function positionStone(x, y) {
  const cell = cells[y * (match?.game.size || 1) + x];
  if (!cell) return;
  const frameRect = elements.boardFrame.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  elements.stone.style.setProperty('--stone-left', `${cellRect.left - frameRect.left}px`);
  elements.stone.style.setProperty('--stone-top', `${cellRect.top - frameRect.top}px`);
  elements.stone.style.setProperty('--stone-size', `${Math.min(cellRect.width, cellRect.height)}px`);
}

function positionEcho(cell) {
  const boardRect = elements.board.getBoundingClientRect();
  const frameRect = elements.boardFrame.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  elements.moveEcho.style.left = `${cellRect.left - frameRect.left}px`;
  elements.moveEcho.style.top = `${cellRect.top - frameRect.top}px`;
  elements.moveEcho.style.width = `${cellRect.width}px`;
  elements.moveEcho.style.height = `${cellRect.height}px`;
  elements.moveEcho.classList.remove('is-active');
  void elements.moveEcho.offsetWidth;
  elements.moveEcho.classList.add('is-active');
  setTimeout(() => elements.moveEcho.classList.remove('is-active'), 420);
  void boardRect;
}

function renderClocks() {
  if (!match) return;
  elements.clocks.forEach((clockElement, participant) => {
    clockElement.classList.toggle('is-active', match.game.current === participant && match.running && !match.game.ended);
    clockElement.classList.toggle('is-low', Number.isFinite(match.times[participant]) && match.times[participant] <= 15_000);
    clockElement.querySelector('span').textContent = match.config.mode === 'ai' ? (participant === match.config.humanParticipant ? 'Я' : 'ИИ') : String(participant + 1);
    clockElement.querySelector('b').textContent = formatClock(match.times[participant]);
  });
}

function formatClock(ms) {
  if (!Number.isFinite(ms)) return '∞';
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function requestMove(move, source = 'human') {
  if (!match || match.game.ended || !match.running || inputLocked) return;
  if (source === 'human' && currentIsAI()) return;
  const legal = legalMoves(match.game);
  if (!legal.includes(move)) {
    audio.invalid();
    haptic([12, 35, 12]);
    toast('Туда уже нет дороги.');
    return;
  }

  const previous = match.game;
  const mover = previous.current;
  const sourceIndex = tileIndex(previous, previous.x, previous.y);
  inputLocked = true;
  match.game = applyMove(previous, move);

  if (Number.isFinite(match.times[mover])) match.times[mover] += CLOCKS[match.config.clock].increment;

  if (move === 'SWAP') {
    audio.swap();
    haptic([12, 22, 18]);
    toast('Цели поменялись. Теперь первый идёт вниз.');
    renderGame();
  } else {
    audio.move(previous.goals[mover]);
    haptic(14);
    renderGame(sourceIndex);
  }
  saveCurrentMatch();

  if (match.game.ended) {
    if (move === 'EXIT_N' || move === 'EXIT_S') {
      const sourceCell = cells[sourceIndex];
      const shift = sourceCell ? sourceCell.getBoundingClientRect().height * 1.45 : 64;
      elements.stone.style.setProperty('--exit-shift', `${move === 'EXIT_N' ? -shift : shift}px`);
      elements.stone.classList.add('is-exiting');
    }
    setTimeout(finishMatch, 330);
    return;
  }

  setTimeout(() => {
    inputLocked = false;
    renderGame();
    scheduleAIIfNeeded();
  }, move === 'SWAP' ? 180 : 220);
}

function scheduleAIIfNeeded() {
  if (!match || !match.running || match.game.ended || !currentIsAI()) return;
  const generation = ++aiGeneration;
  inputLocked = true;
  renderGame();
  setTimeout(() => {
    if (generation !== aiGeneration || !match || !match.running || match.game.ended || !currentIsAI()) return;
    try {
      const move = chooseAIMove(match.game, match.config.difficulty);
      inputLocked = false;
      if (move) requestMove(move, 'ai');
    } catch (error) {
      console.error('Ошибка поиска хода', error);
      inputLocked = false;
      const fallback = legalMoves(match.game)[0];
      if (fallback) requestMove(fallback, 'ai');
      else showFatal('Машина потеряла дерево вариантов. Перезагрузи игру.');
    }
  }, 170);
}

function setPaused(paused, showOverlay = true) {
  if (!match || match.game.ended) return;
  match.running = !paused;
  aiGeneration += 1;
  inputLocked = paused;
  if (showOverlay) setOverlay(elements.pauseOverlay, paused);
  if (paused) {
    elements.pauseMode.textContent = match.config.mode === 'ai' ? `Против: ${DIFFICULTIES[match.config.difficulty].label}` : 'Локальная дуэль';
    elements.pauseTurn.textContent = `Ход ${match.game.plies + 1}`;
    elements.pauseBoard.textContent = `${match.game.size}×${match.game.size}`;
    saveCurrentMatch();
  } else {
    lastFrameAt = performance.now();
    renderGame();
    scheduleAIIfNeeded();
  }
}

function showRestartConfirm() {
  setOverlay(elements.confirmOverlay, true);
}

function restartMatch() {
  if (!match) return;
  const config = { ...match.config };
  match = createMatch(config);
  setOverlay(elements.confirmOverlay, false);
  setOverlay(elements.pauseOverlay, false);
  beginMatchView();
}

function quitMatch() {
  aiGeneration += 1;
  match = null;
  profile.savedMatch = null;
  saveProfile();
  setOverlay(elements.pauseOverlay, false);
  setOverlay(elements.confirmOverlay, false);
  syncMenu();
  showScreen('menu');
}

function finishMatch() {
  if (!match || !match.game.ended) return;
  match.running = false;
  inputLocked = true;
  aiGeneration += 1;
  profile.savedMatch = null;

  if (!match.finishedRecorded) {
    match.finishedRecorded = true;
    profile.games += 1;
    const winnerIsHuman = match.config.mode === 'local' || match.game.winner === match.config.humanParticipant;
    if (winnerIsHuman) profile.humanWins += 1;
    if (match.config.mode === 'ai') {
      if (winnerIsHuman) {
        profile.currentStreak += 1;
        profile.bestStreak = Math.max(profile.bestStreak, profile.currentStreak);
      } else {
        profile.currentStreak = 0;
      }
    }
    saveProfile();
  }

  const winner = match.game.winner;
  const winnerGoal = match.game.goals[winner];
  elements.resultKicker.textContent = match.game.reason === 'exit' ? 'ВЫХОД НАЙДЕН' : match.game.reason === 'time' ? 'ВРЕМЯ ИСЧЕРПАНО' : 'КОРИДОР ЗАКРЫТ';
  elements.resultTitle.textContent = `${participantName(winner)} победил`;
  if (match.game.reason === 'exit') {
    elements.resultCopy.textContent = `Камень вышел через ${winnerGoal === 'north' ? 'бирюзовый верхний' : 'коралловый нижний'} край.`;
  } else if (match.game.reason === 'time') {
    elements.resultCopy.textContent = `${participantName(1 - winner)} потратил всё время. Поле не принимает объяснительных.`;
  } else {
    elements.resultCopy.textContent = `${participantName(1 - winner)} остался без допустимого хода.`;
  }
  elements.resultMoves.textContent = String(match.game.plies - (match.game.swapUsed ? 1 : 0));
  elements.resultBoard.textContent = `${match.game.size}×${match.game.size}`;
  elements.resultTime.textContent = formatElapsed(match.elapsedMs);
  elements.resultPath.style.borderBottom = `6px solid ${winnerGoal === 'north' ? 'var(--north)' : 'var(--south)'}`;
  setOverlay(elements.resultOverlay, true);
  if (match.game.reason === 'time') audio.timeout(); else audio.victory();
  haptic([28, 45, 35]);
  syncMenu();
}

function handleTimeExpired(loser) {
  if (!match || match.game.ended) return;
  match.game = forceTimeLoss(match.game, loser);
  renderGame();
  finishMatch();
}

function tick(now) {
  const delta = Math.min(1000, Math.max(0, now - lastFrameAt));
  lastFrameAt = now;
  if (match && activeScreen === 'game' && match.running && !match.game.ended) {
    match.elapsedMs += delta;
    const current = match.game.current;
    if (Number.isFinite(match.times[current])) {
      match.times[current] = Math.max(0, match.times[current] - delta);
      if (match.times[current] <= 0) handleTimeExpired(current);
    }
    renderClocks();
    if (now - lastSavedAt > 2000) {
      lastSavedAt = now;
      saveCurrentMatch();
    }
  }
  frameHandle = requestAnimationFrame(tick);
}

function moveFromSwipe(dx, dy) {
  if (!match) return null;
  const direction = directionFromDelta(dx, dy);
  if (!direction) return null;
  if (direction === 'N' && match.game.y === 0 && legalMoves(match.game).includes('EXIT_N')) return 'EXIT_N';
  if (direction === 'S' && match.game.y === match.game.size - 1 && legalMoves(match.game).includes('EXIT_S')) return 'EXIT_S';
  return direction;
}

function showFatal(message) {
  setPaused(true, false);
  elements.errorCopy.textContent = message;
  setOverlay(elements.errorOverlay, true);
}

function syncConnectivity() {
  elements.connectionMark.classList.toggle('is-online', navigator.onLine);
  elements.connectionMark.querySelector('span').textContent = navigator.onLine ? 'ГОТОВ ОФЛАЙН' : 'ОФЛАЙН';
}

bindChoice(elements.sizeChoices, 'size', Number);
bindChoice(elements.clockChoices, 'clock');
bindChoice(elements.difficultyChoices, 'difficulty');

elements.duelButton.addEventListener('click', () => openSetup('local'));
elements.aiButton.addEventListener('click', () => openSetup('ai'));
elements.resumeButton.addEventListener('click', resumeSavedMatch);
elements.rulesButton.addEventListener('click', () => showScreen('rules'));
elements.soundButton.addEventListener('click', toggleSound);
elements.setupBackButton.addEventListener('click', () => { syncMenu(); showScreen('menu'); });
elements.rulesBackButton.addEventListener('click', () => showScreen('menu'));
elements.rulesPlayButton.addEventListener('click', () => openSetup('local'));
elements.pieRuleButton.addEventListener('click', () => { setup.pieRule = !setup.pieRule; syncSetupControls(); haptic(8); });
elements.humanFirstButton.addEventListener('click', () => { setup.humanFirst = !setup.humanFirst; syncSetupControls(); haptic(8); });
elements.startMatchButton.addEventListener('click', startConfiguredMatch);
elements.pauseButton.addEventListener('click', () => setPaused(true));
elements.continueButton.addEventListener('click', () => { setOverlay(elements.pauseOverlay, false); inputLocked = false; setPaused(false, false); });
elements.restartButton.addEventListener('click', showRestartConfirm);
elements.confirmRestartButton.addEventListener('click', restartMatch);
elements.cancelRestartButton.addEventListener('click', () => setOverlay(elements.confirmOverlay, false));
elements.pauseSoundButton.addEventListener('click', toggleSound);
elements.hapticsButton.addEventListener('click', toggleHaptics);
elements.quitButton.addEventListener('click', quitMatch);
elements.againButton.addEventListener('click', restartMatch);
elements.resultSetupButton.addEventListener('click', () => { const mode = match?.config.mode || 'local'; setOverlay(elements.resultOverlay, false); match = null; openSetup(mode); });
elements.resultMenuButton.addEventListener('click', () => { setOverlay(elements.resultOverlay, false); match = null; syncMenu(); showScreen('menu'); });
elements.swapButton.addEventListener('click', () => requestMove('SWAP'));
elements.northExitButton.addEventListener('click', () => requestMove('EXIT_N'));
elements.southExitButton.addEventListener('click', () => requestMove('EXIT_S'));
elements.reloadButton.addEventListener('click', () => location.reload());

elements.board.addEventListener('click', (event) => {
  const cell = event.target.closest('.cell');
  if (!cell || cell.disabled) return;
  const move = stepMoveForCell(Number(cell.dataset.x), Number(cell.dataset.y));
  if (move) requestMove(move);
});

elements.boardFrame.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
});

window.addEventListener('pointerup', (event) => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = null;
  const move = moveFromSwipe(dx, dy);
  if (move) requestMove(move);
});

window.addEventListener('pointercancel', () => { pointerStart = null; });

window.addEventListener('keydown', (event) => {
  if (activeScreen !== 'game' || !match) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (!elements.pauseOverlay.hidden) {
      setOverlay(elements.pauseOverlay, false);
      inputLocked = false;
      setPaused(false, false);
    } else {
      setPaused(true);
    }
    return;
  }
  const keys = { ArrowUp: 'N', w: 'N', W: 'N', ArrowDown: 'S', s: 'S', S: 'S', ArrowLeft: 'W', a: 'W', A: 'W', ArrowRight: 'E', d: 'E', D: 'E' };
  let move = keys[event.key];
  if (!move) return;
  event.preventDefault();
  if (move === 'N' && match.game.y === 0 && legalMoves(match.game).includes('EXIT_N')) move = 'EXIT_N';
  if (move === 'S' && match.game.y === match.game.size - 1 && legalMoves(match.game).includes('EXIT_S')) move = 'EXIT_S';
  requestMove(move);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && match && activeScreen === 'game' && match.running && !match.game.ended) setPaused(true);
  lastFrameAt = performance.now();
});

window.addEventListener('online', syncConnectivity);
window.addEventListener('offline', syncConnectivity);
window.addEventListener('beforeunload', saveCurrentMatch);
window.addEventListener('error', (event) => {
  if (activeScreen === 'game') showFatal(event.error?.message || 'Неизвестная ошибка интерфейса.');
});

try {
  syncMenu();
  syncSetupControls();
  syncConnectivity();
  showScreen('menu');
  frameHandle = requestAnimationFrame(tick);
} catch (error) {
  console.error(error);
  elements.errorCopy.textContent = error?.message || 'Неизвестная ошибка запуска.';
  setOverlay(elements.errorOverlay, true);
}
