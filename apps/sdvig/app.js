import { installMobileRuntime, setDocumentScrollLocked } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import {
  COBALT,
  EMPTY,
  SIZE,
  VERMILION,
  applyMove,
  boardToOwners,
  createBoard,
  ejectionCoordinate,
  findConnection,
  insertionCoordinate,
  isImmediateReverse,
  resolveWinner,
  validateBoard
} from './game-core.js';
import { chooseMove, shouldSwapAfterOpening } from './ai.js';
import { ShiftAudio } from './audio.js';

installMobileRuntime();
setDocumentScrollLocked(true);

const APP_VERSION = '1.0.0';
const STORAGE_NAMESPACE = 'pocket-works:sdvig';
const STORAGE_KEY = `${STORAGE_NAMESPACE}:profile`;
const PLAYER_NAMES = { [VERMILION]: 'КИНОВАРЬ', [COBALT]: 'КОБАЛЬТ' };
const PLAYER_GOALS = {
  [VERMILION]: 'Соедини левый и правый край.',
  [COBALT]: 'Соедини верхний и нижний край.'
};
const ARROWS = { left: '→', right: '←', top: '↓', bottom: '↑' };
const byId = (id) => document.getElementById(id);

const elements = {
  app: byId('app'),
  menuButton: byId('menuButton'),
  pauseButton: byId('pauseButton'),
  scoreZero: byId('scoreZero'),
  scoreOne: byId('scoreOne'),
  seatZero: byId('seatZero'),
  seatOne: byId('seatOne'),
  roundLabel: byId('roundLabel'),
  turnLabel: byId('turnLabel'),
  turnHint: byId('turnHint'),
  turnBlock: document.querySelector('.turn-block'),
  turnTimer: byId('turnTimer'),
  timerFill: byId('timerFill'),
  timerText: byId('timerText'),
  machine: byId('machine'),
  boardCells: byId('boardCells'),
  tokenLayer: byId('tokenLayer'),
  boardFlash: byId('boardFlash'),
  ports: byId('ports'),
  moveLog: byId('moveLog'),
  pieStrip: byId('pieStrip'),
  pieTitle: byId('pieTitle'),
  keepColorsButton: byId('keepColorsButton'),
  swapColorsButton: byId('swapColorsButton'),
  toast: byId('toast'),
  menuOverlay: byId('menuOverlay'),
  modeChoices: byId('modeChoices'),
  bestOfChoices: byId('bestOfChoices'),
  clockChoices: byId('clockChoices'),
  difficultyField: byId('difficultyField'),
  difficultyChoices: byId('difficultyChoices'),
  matchesStat: byId('matchesStat'),
  botStat: byId('botStat'),
  streakStat: byId('streakStat'),
  startButton: byId('startButton'),
  resumeButton: byId('resumeButton'),
  rulesButton: byId('rulesButton'),
  soundButton: byId('soundButton'),
  hapticsButton: byId('hapticsButton'),
  rulesOverlay: byId('rulesOverlay'),
  rulesCloseButton: byId('rulesCloseButton'),
  rulesReadyButton: byId('rulesReadyButton'),
  pauseOverlay: byId('pauseOverlay'),
  pauseSeatZero: byId('pauseSeatZero'),
  pauseSeatOne: byId('pauseSeatOne'),
  continueButton: byId('continueButton'),
  pauseRulesButton: byId('pauseRulesButton'),
  pauseSoundButton: byId('pauseSoundButton'),
  pauseHapticsButton: byId('pauseHapticsButton'),
  returnMenuButton: byId('returnMenuButton'),
  resultOverlay: byId('resultOverlay'),
  resultSheet: document.querySelector('.result-sheet'),
  resultKicker: byId('resultKicker'),
  resultTitle: byId('resultTitle'),
  resultScoreZero: byId('resultScoreZero'),
  resultScoreOne: byId('resultScoreOne'),
  resultNote: byId('resultNote'),
  nextRoundButton: byId('nextRoundButton'),
  resultMenuButton: byId('resultMenuButton')
};

function freshProfile() {
  return {
    version: 1,
    sound: true,
    haptics: true,
    tutorialSeen: false,
    settings: { mode: 'local', bestOf: 3, clock: 0, difficulty: 'tactician' },
    stats: { matches: 0, botWins: 0, botLosses: 0, streak: 0, bestStreak: 0 },
    savedMatch: null
  };
}

function sanitizeSettings(value = {}) {
  return {
    mode: value.mode === 'bot' ? 'bot' : 'local',
    bestOf: [1, 3, 5].includes(Number(value.bestOf)) ? Number(value.bestOf) : 3,
    clock: [0, 5, 10].includes(Number(value.clock)) ? Number(value.clock) : 0,
    difficulty: ['cadet', 'tactician', 'predator'].includes(value.difficulty) ? value.difficulty : 'tactician'
  };
}

function sanitizeStats(value = {}) {
  return {
    matches: Math.max(0, Math.floor(Number(value.matches) || 0)),
    botWins: Math.max(0, Math.floor(Number(value.botWins) || 0)),
    botLosses: Math.max(0, Math.floor(Number(value.botLosses) || 0)),
    streak: Math.max(0, Math.floor(Number(value.streak) || 0)),
    bestStreak: Math.max(0, Math.floor(Number(value.bestStreak) || 0))
  };
}

function sanitizeSavedMatch(value) {
  if (!value || typeof value !== 'object') return null;
  if (!validateBoard(value.board)) return null;
  const settings = sanitizeSettings(value.settings);
  const phase = ['playing', 'pie', 'roundover', 'matchover'].includes(value.phase) ? value.phase : 'playing';
  const seatColors = Array.isArray(value.seatColors) && value.seatColors.length === 2
    && new Set(value.seatColors).size === 2
    && value.seatColors.every((color) => color === VERMILION || color === COBALT)
    ? value.seatColors.slice()
    : [VERMILION, COBALT];
  const board = value.board.map((row) => row.map((piece) => {
    if (!piece) return EMPTY;
    if (typeof piece === 'object' && (piece.owner === VERMILION || piece.owner === COBALT)) {
      return { id: String(piece.id || `p-${cryptoRandom()}`), owner: piece.owner };
    }
    return { id: `p-${cryptoRandom()}`, owner: Number(piece) };
  }));
  return {
    settings,
    phase,
    board,
    scores: [Math.max(0, Number(value.scores?.[0]) || 0), Math.max(0, Number(value.scores?.[1]) || 0)],
    roundIndex: Math.max(0, Math.floor(Number(value.roundIndex) || 0)),
    startingSeat: value.startingSeat === 1 ? 1 : 0,
    activeSeat: value.activeSeat === 1 ? 1 : 0,
    seatColors,
    previousMove: value.previousMove && ['left', 'right', 'top', 'bottom'].includes(value.previousMove.side)
      ? { side: value.previousMove.side, index: Math.max(0, Math.min(4, Math.floor(Number(value.previousMove.index) || 0))) }
      : null,
    moveNumber: Math.max(0, Math.floor(Number(value.moveNumber) || 0)),
    history: Array.isArray(value.history) ? value.history.slice(-12).filter((entry) => entry && ['left', 'right', 'top', 'bottom'].includes(entry.side)).map((entry) => ({
      side: entry.side,
      index: Math.max(0, Math.min(4, Math.floor(Number(entry.index) || 0))),
      color: entry.color === COBALT ? COBALT : VERMILION,
      seat: entry.seat === 1 ? 1 : 0
    })) : [],
    roundWinnerSeat: value.roundWinnerSeat === 1 ? 1 : value.roundWinnerSeat === 0 ? 0 : null,
    resultReason: typeof value.resultReason === 'string' ? value.resultReason : '',
    matchWinnerSeat: value.matchWinnerSeat === 1 ? 1 : value.matchWinnerSeat === 0 ? 0 : null
  };
}

function loadProfile() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!value || value.version !== 1) return freshProfile();
    return {
      version: 1,
      sound: value.sound !== false,
      haptics: value.haptics !== false,
      tutorialSeen: Boolean(value.tutorialSeen),
      settings: sanitizeSettings(value.settings),
      stats: sanitizeStats(value.stats),
      savedMatch: sanitizeSavedMatch(value.savedMatch)
    };
  } catch {
    return freshProfile();
  }
}

let profile = loadProfile();
let match = null;
let pieceCounter = 0;
let interactionLocked = false;
let botTimer = 0;
let toastTimer = 0;
let animationTimer = 0;
let clockFrame = 0;
let hiddenAt = 0;
let pauseSnapshot = null;
const tokenElements = new Map();
const audio = new ShiftAudio(profile.sound);

const workshop = createWorkshopMode({
  appName: 'СДВИГ',
  version: APP_VERSION,
  cachePrefix: 'sdvig-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset() {
    profile = freshProfile();
    saveProfile();
    location.reload();
  }
});
void workshop;

function cryptoRandom() {
  if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

function saveProfile() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.warn('СДВИГ не смог сохранить матч', error);
  }
}

function haptic(pattern) {
  if (profile.haptics && navigator.vibrate) navigator.vibrate(pattern);
}

function activeColor() {
  return match?.seatColors?.[match.activeSeat] ?? VERMILION;
}

function targetWins() {
  return Math.ceil((match?.settings.bestOf ?? 3) / 2);
}

function isBotSeat(seat) {
  return match?.settings.mode === 'bot' && seat === 1;
}

function createPiece(owner) {
  pieceCounter += 1;
  return { id: `piece-${Date.now().toString(36)}-${pieceCounter}`, owner };
}

function setHidden(element, hidden) {
  if (element) element.hidden = hidden;
}

function setChoice(container, value) {
  for (const button of container.querySelectorAll('button[data-value]')) {
    const selected = String(button.dataset.value) === String(value);
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

function syncMenuSettings() {
  const settings = profile.settings;
  setChoice(elements.modeChoices, settings.mode);
  setChoice(elements.bestOfChoices, settings.bestOf);
  setChoice(elements.clockChoices, settings.clock);
  setChoice(elements.difficultyChoices, settings.difficulty);
  setHidden(elements.difficultyField, settings.mode !== 'bot');
}

function syncProfileUi() {
  elements.matchesStat.textContent = String(profile.stats.matches);
  elements.botStat.textContent = `${profile.stats.botWins}—${profile.stats.botLosses}`;
  elements.streakStat.textContent = String(profile.stats.streak);
  elements.resumeButton.hidden = !profile.savedMatch;
  const soundLabel = profile.sound ? 'ВКЛ' : 'ВЫКЛ';
  const hapticsLabel = profile.haptics ? 'ВКЛ' : 'ВЫКЛ';
  elements.soundButton.textContent = `ЗВУК: ${soundLabel}`;
  elements.hapticsButton.textContent = `ВИБРАЦИЯ: ${hapticsLabel}`;
  elements.pauseSoundButton.textContent = `Звук: ${soundLabel.toLowerCase()}`;
  elements.pauseHapticsButton.textContent = `Вибрация: ${hapticsLabel.toLowerCase()}`;
  elements.soundButton.setAttribute('aria-pressed', String(profile.sound));
  elements.hapticsButton.setAttribute('aria-pressed', String(profile.haptics));
}

function buildBoard() {
  const cellFragment = document.createDocumentFragment();
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      const cell = document.createElement('i');
      cell.className = 'board-cell';
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      cellFragment.append(cell);
    }
  }
  elements.boardCells.replaceChildren(cellFragment);

  const portFragment = document.createDocumentFragment();
  for (const side of ['top', 'right', 'bottom', 'left']) {
    for (let index = 0; index < SIZE; index += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'port';
      button.dataset.side = side;
      button.dataset.index = String(index);
      button.dataset.nativePress = '';
      button.setAttribute('aria-label', portLabel(side, index));
      const arrow = document.createElement('i');
      arrow.className = 'port-arrow';
      button.append(arrow);
      if (side === 'top') button.style.gridArea = `1 / ${index + 2}`;
      if (side === 'bottom') button.style.gridArea = `7 / ${index + 2}`;
      if (side === 'left') button.style.gridArea = `${index + 2} / 1`;
      if (side === 'right') button.style.gridArea = `${index + 2} / 7`;
      button.addEventListener('pointerdown', () => button.classList.add('is-pressed'));
      button.addEventListener('pointerup', () => button.classList.remove('is-pressed'));
      button.addEventListener('pointercancel', () => button.classList.remove('is-pressed'));
      button.addEventListener('click', () => handlePort(side, index, button));
      portFragment.append(button);
    }
  }
  elements.ports.replaceChildren(portFragment);
}

function portLabel(side, index) {
  const line = side === 'left' || side === 'right' ? `строку ${index + 1}` : `колонку ${index + 1}`;
  return `Втолкнуть фишку ${side === 'left' ? 'слева в' : side === 'right' ? 'справа в' : side === 'top' ? 'сверху в' : 'снизу в'} ${line}`;
}

function clearTokens() {
  tokenElements.clear();
  elements.tokenLayer.replaceChildren();
}

function tokenAt(piece, row, column, entering = false) {
  let token = tokenElements.get(piece.id);
  if (!token) {
    token = document.createElement('i');
    token.className = `token${piece.owner === COBALT ? ' is-blue' : ''}${entering ? ' is-entering' : ''}`;
    token.dataset.id = piece.id;
    tokenElements.set(piece.id, token);
    elements.tokenLayer.append(token);
  }
  token.style.setProperty('--r', String(row));
  token.style.setProperty('--c', String(column));
  token.dataset.row = String(row);
  token.dataset.column = String(column);
  token.classList.toggle('is-blue', piece.owner === COBALT);
  return token;
}

function renderTokensInstant() {
  clearTokens();
  if (!match) return;
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      const piece = match.board[row][column];
      if (piece) tokenAt(piece, row, column);
    }
  }
}

function animateMove(previousBoard, nextBoard, move, inserted, ejected) {
  clearTimeout(animationTimer);
  const [startRow, startColumn] = insertionCoordinate(move);
  const insertedToken = tokenAt(inserted, startRow, startColumn, true);
  void insertedToken.offsetWidth;
  insertedToken.classList.remove('is-entering');

  const finalPieces = new Map();
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      const piece = nextBoard[row][column];
      if (piece) finalPieces.set(piece.id, { piece, row, column });
    }
  }

  requestAnimationFrame(() => {
    for (const { piece, row, column } of finalPieces.values()) tokenAt(piece, row, column);
    if (ejected) {
      const token = tokenElements.get(ejected.id);
      if (token) {
        const [row, column] = ejectionCoordinate(move);
        token.style.setProperty('--r', String(row));
        token.style.setProperty('--c', String(column));
        token.classList.add('is-ejected');
      }
    }
  });

  animationTimer = setTimeout(() => {
    if (ejected) {
      tokenElements.get(ejected.id)?.remove();
      tokenElements.delete(ejected.id);
    }
    for (const [id, token] of tokenElements) {
      if (!finalPieces.has(id)) {
        token.remove();
        tokenElements.delete(id);
      }
    }
    interactionLocked = false;
    syncPorts();
  }, 290);
}

function highlightPath(path) {
  for (const token of tokenElements.values()) token.classList.remove('is-winning');
  if (!path) return;
  const cells = new Set(path.map(([row, column]) => `${row}:${column}`));
  for (const token of tokenElements.values()) {
    if (cells.has(`${token.dataset.row}:${token.dataset.column}`)) token.classList.add('is-winning');
  }
}

function flashBoard(color) {
  elements.boardFlash.className = 'board-flash';
  void elements.boardFlash.offsetWidth;
  elements.boardFlash.className = `board-flash ${color === COBALT ? 'is-blue' : 'is-red'}`;
  setTimeout(() => { elements.boardFlash.className = 'board-flash'; }, 380);
}

function syncScores() {
  if (!match) return;
  elements.scoreZero.textContent = String(match.scores[0]);
  elements.scoreOne.textContent = String(match.scores[1]);
  elements.seatZero.classList.toggle('is-blue', match.seatColors[0] === COBALT);
  elements.seatOne.classList.toggle('is-blue', match.seatColors[1] === COBALT);
  elements.pauseSeatZero.innerHTML = `${seatName(0)} <b>${match.scores[0]}</b>`;
  elements.pauseSeatOne.innerHTML = `${seatName(1)} <b>${match.scores[1]}</b>`;
}

function seatName(seat) {
  if (match?.settings.mode === 'bot' && seat === 1) return 'СТАНОК';
  return `ИГРОК ${seat + 1}`;
}

function syncTurn() {
  if (!match) return;
  const color = activeColor();
  const bot = isBotSeat(match.activeSeat);
  elements.roundLabel.textContent = `РАУНД ${match.roundIndex + 1} / ${match.settings.bestOf}`;
  elements.turnLabel.textContent = match.phase === 'pie'
    ? `${seatName(match.activeSeat)} ВЫБИРАЕТ`
    : bot && match.botThinking
      ? 'СТАНОК СЧИТАЕТ'
      : `${PLAYER_NAMES[color]} ДВИГАЕТ`;
  elements.turnHint.textContent = match.phase === 'pie'
    ? 'Оставить цвета или забрать первый ход.'
    : `${seatName(match.activeSeat)} · ${PLAYER_GOALS[color]}`;
  elements.turnBlock.classList.toggle('is-red', color === VERMILION);
  elements.turnBlock.classList.toggle('is-blue', color === COBALT);
  elements.pieTitle.textContent = `${seatName(match.activeSeat)}, забрать ${PLAYER_NAMES[match.seatColors[match.startingSeat]].toLowerCase()}?`;
  elements.turnTimer.hidden = !match.settings.clock || match.phase !== 'playing';
}

function syncPorts() {
  if (!match) return;
  const color = activeColor();
  const canPlay = match.phase === 'playing' && !interactionLocked && !match.botThinking && !isBotSeat(match.activeSeat);
  for (const button of elements.ports.querySelectorAll('.port')) {
    const move = { side: button.dataset.side, index: Number(button.dataset.index) };
    const blocked = isImmediateReverse(move, match.previousMove);
    button.classList.toggle('is-red', color === VERMILION);
    button.classList.toggle('is-blue', color === COBALT);
    button.classList.toggle('is-blocked', blocked);
    button.disabled = !canPlay;
    button.setAttribute('aria-disabled', String(!canPlay || blocked));
  }
}

function syncMoveLog() {
  if (!match) return;
  const fragment = document.createDocumentFragment();
  for (const [index, move] of match.history.slice(-8).entries()) {
    const mark = document.createElement('i');
    mark.className = `log-move${move.color === COBALT ? ' is-blue' : ''}${index === Math.min(7, match.history.length - 1) ? ' is-current' : ''}`;
    mark.textContent = ARROWS[move.side];
    mark.title = `${PLAYER_NAMES[move.color]}: ${portLabel(move.side, move.index)}`;
    fragment.append(mark);
  }
  elements.moveLog.replaceChildren(fragment);
}

function syncPie() {
  elements.pieStrip.hidden = !match || match.phase !== 'pie' || isBotSeat(match.activeSeat);
}

function syncGameUi() {
  syncScores();
  syncTurn();
  syncPorts();
  syncMoveLog();
  syncPie();
}

function announce(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.remove('is-visible');
  void elements.toast.offsetWidth;
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 1650);
}

function serializeMatch() {
  if (!match) return null;
  return {
    settings: match.settings,
    phase: match.phase,
    board: match.board,
    scores: match.scores,
    roundIndex: match.roundIndex,
    startingSeat: match.startingSeat,
    activeSeat: match.activeSeat,
    seatColors: match.seatColors,
    previousMove: match.previousMove,
    moveNumber: match.moveNumber,
    history: match.history,
    roundWinnerSeat: match.roundWinnerSeat,
    resultReason: match.resultReason,
    matchWinnerSeat: match.matchWinnerSeat
  };
}

function persistMatch() {
  if (!match) return;
  profile.savedMatch = serializeMatch();
  saveProfile();
  syncProfileUi();
}

function beginClock() {
  if (!match) return;
  match.clockWarned = false;
  if (!match.settings.clock || match.phase !== 'playing') {
    match.deadline = 0;
    return;
  }
  match.deadline = performance.now() + match.settings.clock * 1000;
}

function createNewMatch(settings) {
  match = {
    settings: sanitizeSettings(settings),
    phase: 'playing',
    board: createBoard(),
    scores: [0, 0],
    roundIndex: 0,
    startingSeat: 0,
    activeSeat: 0,
    seatColors: [VERMILION, COBALT],
    previousMove: null,
    moveNumber: 0,
    history: [],
    roundWinnerSeat: null,
    resultReason: '',
    matchWinnerSeat: null,
    botThinking: false,
    deadline: 0
  };
  startRound(true);
}

function startRound(first = false) {
  clearTimeout(botTimer);
  interactionLocked = false;
  match.phase = 'playing';
  match.board = createBoard();
  match.startingSeat = match.roundIndex % 2;
  match.activeSeat = match.startingSeat;
  match.seatColors = match.startingSeat === 0 ? [VERMILION, COBALT] : [COBALT, VERMILION];
  match.previousMove = null;
  match.moveNumber = 0;
  match.history = [];
  match.roundWinnerSeat = null;
  match.resultReason = '';
  match.matchWinnerSeat = null;
  match.botThinking = false;
  clearTokens();
  highlightPath(null);
  elements.resultOverlay.hidden = true;
  elements.pauseOverlay.hidden = true;
  elements.menuOverlay.hidden = true;
  beginClock();
  syncGameUi();
  persistMatch();
  if (first && !profile.tutorialSeen) openRules(true);
  else scheduleBotIfNeeded();
}

function resumeSavedMatch() {
  const saved = sanitizeSavedMatch(profile.savedMatch);
  if (!saved) {
    profile.savedMatch = null;
    saveProfile();
    syncProfileUi();
    announce('Сохранение оказалось битым. Матч не пострадал — его просто нет.');
    return;
  }
  match = { ...saved, botThinking: false, deadline: 0 };
  elements.menuOverlay.hidden = true;
  elements.pauseOverlay.hidden = true;
  renderTokensInstant();
  syncGameUi();
  if (match.phase === 'roundover' || match.phase === 'matchover') showSavedResult();
  else {
    beginClock();
    scheduleBotIfNeeded();
  }
}

function handlePort(side, index, button) {
  if (!match || match.phase !== 'playing' || interactionLocked || match.botThinking || isBotSeat(match.activeSeat)) return;
  const move = { side, index };
  if (isImmediateReverse(move, match.previousMove)) {
    button.classList.remove('is-invalid');
    void button.offsetWidth;
    button.classList.add('is-invalid');
    audio.invalid();
    haptic(22);
    announce('Эту линию нельзя сразу толкнуть обратно.');
    return;
  }
  void audio.unlock();
  playMove(move);
}

function playMove(move) {
  if (!match || match.phase !== 'playing') return;
  const moverSeat = match.activeSeat;
  const moverColor = match.seatColors[moverSeat];
  const previousBoard = match.board;
  const inserted = createPiece(moverColor);
  const result = applyMove(previousBoard, move, inserted);
  match.board = result.board;
  match.previousMove = result.move;
  match.moveNumber += 1;
  match.history.push({ ...result.move, color: moverColor, seat: moverSeat });
  match.history = match.history.slice(-12);
  interactionLocked = true;
  animateMove(previousBoard, match.board, result.move, inserted, result.ejected || null);
  audio.shift(moverColor, Boolean(result.ejected));
  haptic(result.ejected ? [18, 22, 28] : 24);
  flashBoard(moverColor);

  const winner = resolveWinner(match.board, moverColor);
  if (winner) {
    const winnerSeat = match.seatColors.indexOf(winner.player);
    setTimeout(() => finishRound(winnerSeat, winner.reason, winner.path), 265);
    persistMatch();
    syncGameUi();
    return;
  }

  match.activeSeat = moverSeat === 0 ? 1 : 0;
  if (match.moveNumber === 1) match.phase = 'pie';
  else match.phase = 'playing';
  match.botThinking = false;
  beginClock();
  syncGameUi();
  persistMatch();

  if (match.phase === 'pie') resolvePieForBot();
  else scheduleBotIfNeeded();
}

function keepColors() {
  if (!match || match.phase !== 'pie') return;
  match.phase = 'playing';
  audio.press(activeColor());
  haptic(16);
  beginClock();
  syncGameUi();
  persistMatch();
  scheduleBotIfNeeded();
}

function swapColors() {
  if (!match || match.phase !== 'pie') return;
  match.seatColors = [match.seatColors[1], match.seatColors[0]];
  match.activeSeat = match.startingSeat;
  match.phase = 'playing';
  audio.swap();
  haptic([20, 35, 20]);
  announce('Цвета забраны. Первый игрок теперь играет вторым цветом.');
  beginClock();
  syncGameUi();
  persistMatch();
  scheduleBotIfNeeded();
}

function resolvePieForBot() {
  if (!match || match.phase !== 'pie') return;
  if (!isBotSeat(match.activeSeat)) {
    syncPie();
    return;
  }
  match.botThinking = true;
  syncGameUi();
  clearTimeout(botTimer);
  botTimer = setTimeout(() => {
    if (!match || match.phase !== 'pie' || !isBotSeat(match.activeSeat)) return;
    const take = shouldSwapAfterOpening(boardToOwners(match.board), match.previousMove, match.settings.difficulty);
    match.botThinking = false;
    if (take) swapColors();
    else keepColors();
  }, 520);
}

function scheduleBotIfNeeded() {
  clearTimeout(botTimer);
  if (!match || match.phase !== 'playing' || !isBotSeat(match.activeSeat)) return;
  match.botThinking = true;
  interactionLocked = true;
  syncGameUi();
  botTimer = setTimeout(() => {
    if (!match || match.phase !== 'playing' || !isBotSeat(match.activeSeat)) return;
    const move = chooseMove({
      board: boardToOwners(match.board),
      aiColor: activeColor(),
      previousMove: match.previousMove,
      difficulty: match.settings.difficulty
    });
    match.botThinking = false;
    interactionLocked = false;
    syncGameUi();
    playMove(move);
  }, match.settings.difficulty === 'predator' ? 520 : 390);
}

function finishRound(winnerSeat, reason, path = null) {
  if (!match || !['playing', 'pie'].includes(match.phase)) return;
  clearTimeout(botTimer);
  interactionLocked = true;
  match.botThinking = false;
  match.roundWinnerSeat = winnerSeat;
  match.resultReason = reason;
  match.scores[winnerSeat] += 1;
  const wonMatch = match.scores[winnerSeat] >= targetWins();
  match.matchWinnerSeat = wonMatch ? winnerSeat : null;
  match.phase = wonMatch ? 'matchover' : 'roundover';
  const color = match.seatColors[winnerSeat];
  const winningPath = path || findConnection(match.board, color);
  highlightPath(winningPath);
  audio.win(color);
  haptic([30, 45, 30, 45, 70]);
  showResult(winnerSeat, reason, wonMatch);

  if (wonMatch) {
    profile.stats.matches += 1;
    if (match.settings.mode === 'bot') {
      if (winnerSeat === 0) {
        profile.stats.botWins += 1;
        profile.stats.streak += 1;
        profile.stats.bestStreak = Math.max(profile.stats.bestStreak, profile.stats.streak);
      } else {
        profile.stats.botLosses += 1;
        profile.stats.streak = 0;
      }
    }
    profile.savedMatch = null;
  } else {
    profile.savedMatch = serializeMatch();
  }
  saveProfile();
  syncProfileUi();
  syncGameUi();
}

function finishByTimeout(loserSeat) {
  if (!match || match.phase !== 'playing') return;
  const winnerSeat = loserSeat === 0 ? 1 : 0;
  finishRound(winnerSeat, 'timeout', findConnection(match.board, match.seatColors[winnerSeat]));
}

function showResult(winnerSeat, reason, wonMatch) {
  if (!match) return;
  const color = match.seatColors[winnerSeat];
  elements.resultSheet.classList.toggle('is-red', color === VERMILION);
  elements.resultSheet.classList.toggle('is-blue', color === COBALT);
  elements.resultKicker.textContent = wonMatch ? 'МАТЧ ЗАКРЫТ' : reason === 'timeout' ? 'ВРЕМЯ ВЫШЛО' : reason === 'gifted' ? 'ЧУЖАЯ ЦЕПЬ ЗАМКНУТА' : 'ЦЕПЬ ЗАМКНУТА';
  elements.resultTitle.textContent = `${seatName(winnerSeat)} берёт ${wonMatch ? 'матч' : 'раунд'}.`;
  elements.resultScoreZero.textContent = String(match.scores[0]);
  elements.resultScoreOne.textContent = String(match.scores[1]);
  elements.resultNote.textContent = resultNote(reason, color, wonMatch, winnerSeat);
  elements.nextRoundButton.firstChild.textContent = wonMatch ? 'РЕВАНШ ' : 'СЛЕДУЮЩИЙ РАУНД ';
  elements.resultOverlay.hidden = false;
}

function showSavedResult() {
  if (!match || match.roundWinnerSeat === null) return;
  const color = match.seatColors[match.roundWinnerSeat];
  highlightPath(findConnection(match.board, color));
  showResult(match.roundWinnerSeat, match.resultReason, match.phase === 'matchover');
}

function resultNote(reason, color, wonMatch, winnerSeat) {
  if (reason === 'timeout') return `${seatName(winnerSeat === 0 ? 1 : 0)} слишком долго искал идеальный ход. Поле не дождалось.`;
  if (reason === 'gifted') return `Последний сдвиг собрал цепь соперника. Иногда поле само выписывает приговор.`;
  if (wonMatch && match.settings.mode === 'bot' && winnerSeat === 0) return 'Станок пересчитал всё, кроме твоей наглости.';
  if (wonMatch && match.settings.mode === 'bot' && winnerSeat === 1) return 'Станок не радуется. Это почему-то бесит сильнее.';
  return `${PLAYER_NAMES[color]} связала свои края. Пять клеток. Ноль оправданий.`;
}

function nextRoundOrRematch() {
  if (!match) return;
  if (match.phase === 'matchover') {
    const settings = { ...match.settings };
    createNewMatch(settings);
    return;
  }
  match.roundIndex += 1;
  startRound();
}

function openMenu() {
  clearTimeout(botTimer);
  if (match && !['matchover'].includes(match.phase)) persistMatch();
  elements.pauseOverlay.hidden = true;
  elements.resultOverlay.hidden = true;
  elements.rulesOverlay.hidden = true;
  elements.menuOverlay.hidden = false;
  interactionLocked = false;
  syncProfileUi();
  syncMenuSettings();
}

function openPause() {
  if (!match || elements.menuOverlay.hidden === false || match.phase === 'roundover' || match.phase === 'matchover') return;
  pauseSnapshot = {
    phase: match.phase,
    remaining: match.deadline ? Math.max(0, match.deadline - performance.now()) : 0,
    botThinking: match.botThinking
  };
  clearTimeout(botTimer);
  match.botThinking = false;
  interactionLocked = true;
  elements.pauseOverlay.hidden = false;
  syncScores();
  syncProfileUi();
}

function closePause() {
  if (!match) return;
  elements.pauseOverlay.hidden = true;
  interactionLocked = false;
  if (pauseSnapshot) {
    match.phase = pauseSnapshot.phase;
    match.deadline = match.settings.clock && match.phase === 'playing'
      ? performance.now() + Math.max(500, pauseSnapshot.remaining)
      : 0;
    pauseSnapshot = null;
  }
  syncGameUi();
  if (match.phase === 'pie') resolvePieForBot();
  else scheduleBotIfNeeded();
}

function openRules(fromStart = false) {
  elements.rulesOverlay.dataset.fromStart = fromStart ? 'true' : 'false';
  elements.rulesOverlay.hidden = false;
}

function closeRules() {
  const fromStart = elements.rulesOverlay.dataset.fromStart === 'true';
  elements.rulesOverlay.hidden = true;
  elements.rulesOverlay.dataset.fromStart = 'false';
  profile.tutorialSeen = true;
  saveProfile();
  if (fromStart) scheduleBotIfNeeded();
}

function toggleSound() {
  profile.sound = !profile.sound;
  audio.setEnabled(profile.sound);
  saveProfile();
  syncProfileUi();
  if (profile.sound) {
    void audio.unlock().then(() => audio.press(activeColor()));
  }
}

function toggleHaptics() {
  profile.haptics = !profile.haptics;
  saveProfile();
  syncProfileUi();
  if (profile.haptics) haptic([15, 20, 15]);
}

function handleChoice(container, settingName, parser = (value) => value) {
  container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    profile.settings[settingName] = parser(button.dataset.value);
    setChoice(container, profile.settings[settingName]);
    if (settingName === 'mode') elements.difficultyField.hidden = profile.settings.mode !== 'bot';
    saveProfile();
    void audio.unlock().then(() => audio.press(VERMILION));
  });
}

function clockLoop(now) {
  clockFrame = requestAnimationFrame(clockLoop);
  if (!match || !match.settings.clock || match.phase !== 'playing' || !elements.pauseOverlay.hidden || !elements.menuOverlay.hidden || !elements.rulesOverlay.hidden || document.hidden) return;
  const remaining = Math.max(0, match.deadline - now);
  const fraction = Math.max(0, Math.min(1, remaining / (match.settings.clock * 1000)));
  elements.timerFill.style.transform = `scaleX(${fraction})`;
  elements.timerText.textContent = String(Math.max(0, Math.ceil(remaining / 1000)));
  elements.turnTimer.classList.toggle('is-danger', fraction < .28);
  if (fraction < .28 && !match.clockWarned) {
    match.clockWarned = true;
    audio.warning();
  }
  if (remaining <= 0) {
    const loser = match.activeSeat;
    match.deadline = 0;
    finishByTimeout(loser);
  }
}

function onVisibilityChange() {
  if (document.hidden) {
    hiddenAt = performance.now();
    return;
  }
  if (hiddenAt && match?.deadline) match.deadline += performance.now() - hiddenAt;
  hiddenAt = 0;
}

function bindEvents() {
  handleChoice(elements.modeChoices, 'mode');
  handleChoice(elements.bestOfChoices, 'bestOf', Number);
  handleChoice(elements.clockChoices, 'clock', Number);
  handleChoice(elements.difficultyChoices, 'difficulty');

  elements.startButton.addEventListener('click', async () => {
    await audio.unlock();
    audio.press(VERMILION);
    createNewMatch(profile.settings);
  });
  elements.resumeButton.addEventListener('click', async () => {
    await audio.unlock();
    audio.press(VERMILION);
    resumeSavedMatch();
  });
  elements.menuButton.addEventListener('click', openMenu);
  elements.pauseButton.addEventListener('click', openPause);
  elements.keepColorsButton.addEventListener('click', keepColors);
  elements.swapColorsButton.addEventListener('click', swapColors);
  elements.rulesButton.addEventListener('click', () => openRules(false));
  elements.rulesCloseButton.addEventListener('click', closeRules);
  elements.rulesReadyButton.addEventListener('click', closeRules);
  elements.continueButton.addEventListener('click', closePause);
  elements.pauseRulesButton.addEventListener('click', () => openRules(false));
  elements.returnMenuButton.addEventListener('click', openMenu);
  elements.nextRoundButton.addEventListener('click', nextRoundOrRematch);
  elements.resultMenuButton.addEventListener('click', openMenu);
  elements.soundButton.addEventListener('click', toggleSound);
  elements.pauseSoundButton.addEventListener('click', toggleSound);
  elements.hapticsButton.addEventListener('click', toggleHaptics);
  elements.pauseHapticsButton.addEventListener('click', toggleHaptics);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!elements.rulesOverlay.hidden) closeRules();
      else if (!elements.pauseOverlay.hidden) closePause();
      else if (elements.menuOverlay.hidden) openPause();
      return;
    }
    if (!match || match.phase !== 'playing' || interactionLocked || match.botThinking || isBotSeat(match.activeSeat)) return;
    const sideMap = { ArrowDown: 'top', ArrowUp: 'bottom', ArrowRight: 'left', ArrowLeft: 'right' };
    const side = sideMap[event.key];
    if (!side) return;
    event.preventDefault();
    const index = Number.isInteger(match.keyboardIndex) ? match.keyboardIndex : 2;
    const button = elements.ports.querySelector(`.port[data-side="${side}"][data-index="${index}"]`);
    handlePort(side, index, button);
  });
}

function initialize() {
  buildBoard();
  bindEvents();
  syncMenuSettings();
  syncProfileUi();
  clockFrame = requestAnimationFrame(clockLoop);
}

initialize();
