import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  CAPTURE_TARGET,
  CELLS,
  DIRECTIONS,
  PHASES,
  RADIUS,
  allNeighbors,
  applyMove,
  cellKey,
  cloneState,
  createGame,
  findConnectionPath,
  getGroups,
  getLegalMoves,
  getLiberties,
  otherPlayer,
  parseCell,
  resolveSwap,
  validateState
} from './game.js';
import { AI_LEVELS, AI_STYLES, chooseMove, shouldSwap } from './ai.js';

installMobileRuntime();

const STORAGE_NAMESPACE = 'pocket-works:faza';
const DEFAULTS = {
  settings: {
    sound: true,
    level: 'tactician',
    style: 'adaptive',
    seriesTarget: 2
  },
  series: null,
  session: null
};

const storage = createVersionedStore({
  namespace: STORAGE_NAMESPACE,
  version: 1,
  defaults: DEFAULTS,
  validate(value) {
    return Boolean(value && typeof value === 'object' && value.settings);
  }
});

const dom = {
  menu: document.querySelector('#menu-screen'),
  game: document.querySelector('#game-screen'),
  board: document.querySelector('#board'),
  continueButton: document.querySelector('#continue-button'),
  pauseButton: document.querySelector('#pause-button'),
  soundButton: document.querySelector('#sound-button'),
  phasePicker: document.querySelector('#phase-picker'),
  cancelCell: document.querySelector('#cancel-cell'),
  phaseName: document.querySelector('#phase-name'),
  turnCounter: document.querySelector('#turn-counter'),
  turnKicker: document.querySelector('#turn-kicker'),
  turnTitle: document.querySelector('#turn-title'),
  turnDetail: document.querySelector('#turn-detail'),
  swapBanner: document.querySelector('#swap-banner'),
  toast: document.querySelector('#board-toast'),
  setup: document.querySelector('#setup-overlay'),
  rules: document.querySelector('#rules-overlay'),
  lab: document.querySelector('#lab-overlay'),
  pause: document.querySelector('#pause-overlay'),
  confirm: document.querySelector('#confirm-overlay'),
  result: document.querySelector('#result-overlay'),
  styleChoices: document.querySelector('#style-choices'),
  levelChoices: document.querySelector('#level-choices'),
  startButton: document.querySelector('#start-button'),
  resultMark: document.querySelector('#result-mark'),
  resultKicker: document.querySelector('#result-kicker'),
  resultTitle: document.querySelector('#result-title'),
  resultDetail: document.querySelector('#result-detail'),
  resultScore: document.querySelector('#result-score'),
  nextRound: document.querySelector('#next-round')
};

let settings = { ...DEFAULTS.settings, ...(storage.get('settings') || {}) };
let series = storage.get('series');
let session = storage.get('session');
let selectedCell = null;
let setupMode = 'ai';
let aiThinking = false;
let toastTimer = 0;
let resultTimer = 0;
let audioContext = null;

if (session?.game && !validateState(session.game)) {
  session = null;
  series = null;
  storage.patch({ session: null, series: null });
}

function save() {
  storage.patch({ settings, series, session });
}

function showScreen(name) {
  const showGame = name === 'game';
  dom.menu.hidden = showGame;
  dom.game.hidden = !showGame;
  dom.menu.classList.toggle('is-active', !showGame);
  dom.game.classList.toggle('is-active', showGame);
}

function overlayByName(name) {
  return dom[name] || document.querySelector(`#${name}-overlay`);
}

function openOverlay(name) {
  const overlay = overlayByName(name);
  if (!overlay) return;
  closeAllOverlays();
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.querySelector('button, [href], [tabindex]')?.focus({ preventScroll: true });
}

function closeOverlay(overlay) {
  if (!overlay) return;
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
}

function closeAllOverlays() {
  document.querySelectorAll('.overlay.is-open').forEach(closeOverlay);
}

function seatProfile(seat) {
  return series?.profiles?.[seat] || { name: seat === 'A' ? 'Игрок A' : 'Игрок B', type: 'human' };
}

function profileForColor(color) {
  const seat = session?.game?.seats?.[color] || (color === 1 ? 'A' : 'B');
  return seatProfile(seat);
}

function playerLabel(color) {
  return profileForColor(color).name;
}

function colorName(color) {
  return color === 1 ? 'синего' : 'охры';
}

function colorTitle(color) {
  return color === 1 ? 'Синий' : 'Охра';
}

function isHumanTurn() {
  if (!session?.game || session.game.winner || session.game.draw) return false;
  return profileForColor(session.game.current).type === 'human' && !aiThinking;
}

function currentSeat() {
  return session?.game?.seats?.[session.game.current] || 'A';
}

function unlockAudio() {
  if (!settings.sound) return null;
  if (!audioContext) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    audioContext = new Context();
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(frequency, duration = 0.08, type = 'sine', gainValue = 0.035, delay = 0) {
  const context = unlockAudio();
  if (!context || !settings.sound) return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playSound(kind) {
  if (!settings.sound) return;
  if (kind === 'place') tone(210, 0.07, 'triangle', 0.028);
  if (kind === 'phase') {
    tone(310, 0.06, 'sine', 0.025);
    tone(440, 0.08, 'sine', 0.018, 0.04);
  }
  if (kind === 'capture') {
    tone(175, 0.12, 'square', 0.026);
    tone(112, 0.16, 'triangle', 0.03, 0.04);
  }
  if (kind === 'win') {
    tone(260, 0.12, 'triangle', 0.03);
    tone(390, 0.13, 'triangle', 0.028, 0.09);
    tone(520, 0.18, 'triangle', 0.026, 0.18);
  }
}

function haptic(pattern = 10) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), 1500);
}

function axialToPoint(key) {
  const { q, r } = typeof key === 'string' ? parseCell(key) : key;
  const unit = 86;
  return {
    x: 360 + unit * (q + r / 2),
    y: 335 + unit * 0.8660254 * r
  };
}

function polygonPoints(center, radius = 33) {
  const points = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = Math.PI / 180 * (60 * index - 30);
    points.push(`${center.x + radius * Math.cos(angle)},${center.y + radius * Math.sin(angle)}`);
  }
  return points.join(' ');
}

function directionIndex(fromKey, toKey) {
  const from = parseCell(fromKey);
  const to = parseCell(toKey);
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  return DIRECTIONS.findIndex(([x, y]) => x === dq && y === dr);
}

function edgePath(filter, sort) {
  const points = CELLS.filter(filter).sort(sort).map((cell) => axialToPoint(cell.key));
  if (!points.length) return '';
  return `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')}`;
}

function threatenedStones(game) {
  const result = new Set();
  for (const player of [1, 2]) {
    for (const group of getGroups(game.board, game.phase, player)) {
      if (getLiberties(game.board, game.phase, group).size === 1) {
        for (const key of group) result.add(key);
      }
    }
  }
  return result;
}

function legalMoveMap(game) {
  const map = new Map();
  for (const move of getLegalMoves(game)) {
    if (!map.has(move.cell)) map.set(move.cell, new Set());
    map.get(move.cell).add(move.phase);
  }
  return map;
}

function renderBoard() {
  if (!session?.game) return;
  const game = session.game;
  const legalMap = legalMoveMap(game);
  const threat = threatenedStones(game);
  const pathOne = game.pending[1] ? new Set(findConnectionPath(game.board, game.phase, 1) || []) : new Set();
  const pathTwo = game.pending[2] ? new Set(findConnectionPath(game.board, game.phase, 2) || []) : new Set();
  const activePaths = new Set([...pathOne, ...pathTwo]);
  const fragments = [];

  fragments.push(`<path class="goal-band goal-blue" d="${edgePath((cell) => cell.q === -RADIUS, (a, b) => a.r - b.r)}" />`);
  fragments.push(`<path class="goal-band goal-blue" d="${edgePath((cell) => cell.q === RADIUS, (a, b) => a.r - b.r)}" />`);
  fragments.push(`<path class="goal-band goal-clay" d="${edgePath((cell) => cell.r === -RADIUS, (a, b) => a.q - b.q)}" />`);
  fragments.push(`<path class="goal-band goal-clay" d="${edgePath((cell) => cell.r === RADIUS, (a, b) => a.q - b.q)}" />`);

  for (const cell of CELLS) {
    for (const neighbor of allNeighbors(cell.key)) {
      const direction = directionIndex(cell.key, neighbor);
      if (![0, 1, 2].includes(direction)) continue;
      const a = axialToPoint(cell.key);
      const b = axialToPoint(neighbor);
      const inactive = PHASES[game.phase].closedAxis.includes(direction);
      fragments.push(`<line class="link${inactive ? ' inactive' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
    }
  }

  for (const cell of CELLS) {
    const center = axialToPoint(cell.key);
    const isLegal = legalMap.has(cell.key) && isHumanTurn() && !game.swapAvailable;
    const preview = selectedCell === cell.key;
    const label = game.board[cell.key]
      ? `${colorTitle(game.board[cell.key])} камень, ${cell.q}, ${cell.r}`
      : `Свободная клетка ${cell.q}, ${cell.r}`;
    fragments.push(`
      <g class="cell${isLegal ? ' is-legal' : ''}${preview ? ' is-preview' : ''}" data-cell="${cell.key}" role="gridcell" tabindex="${isLegal ? '0' : '-1'}" aria-label="${label}">
        <polygon class="cell-shape" points="${polygonPoints(center)}"></polygon>
        <circle class="cell-hit" cx="${center.x}" cy="${center.y}" r="39"></circle>
      </g>
    `);
  }

  for (const [key, player] of Object.entries(game.board)) {
    const center = axialToPoint(key);
    const classes = [
      'stone',
      `player-${player}`,
      game.lastAction?.cell === key ? 'is-new' : '',
      activePaths.has(key) ? 'is-path' : '',
      threat.has(key) ? 'is-threat' : ''
    ].filter(Boolean).join(' ');
    fragments.push(`<circle class="${classes}" cx="${center.x}" cy="${center.y}" r="25" pointer-events="none"></circle>`);
  }

  if (selectedCell && !game.board[selectedCell]) {
    const center = axialToPoint(selectedCell);
    fragments.push(`<circle class="stone player-${game.current} preview-stone" cx="${center.x}" cy="${center.y}" r="25" pointer-events="none"></circle>`);
  }

  dom.board.innerHTML = fragments.join('');
}

function renderPhasePicker() {
  if (!session?.game) return;
  const game = session.game;
  const legal = legalMoveMap(game);
  const phases = selectedCell ? legal.get(selectedCell) || new Set() : new Set();
  dom.phasePicker.classList.toggle('is-ready', Boolean(selectedCell));
  dom.phasePicker.querySelectorAll('[data-phase]').forEach((button) => {
    const phase = Number(button.dataset.phase);
    button.disabled = !selectedCell || !phases.has(phase) || !isHumanTurn() || game.swapAvailable;
    button.classList.toggle('is-current-phase', game.phase === phase);
  });
  dom.cancelCell.hidden = !selectedCell;
}

function renderHeader() {
  if (!session?.game || !series) return;
  const game = session.game;
  for (const color of [1, 2]) {
    const seat = game.seats[color];
    const panel = document.querySelector(`[data-player-panel="${color}"]`);
    document.querySelector(`[data-player-name="${color}"]`).textContent = playerLabel(color);
    document.querySelector(`[data-captures="${color}"]`).textContent = game.captures[color];
    document.querySelector(`[data-series-score="${color}"]`).textContent = series.scores[seat] || 0;
    panel.classList.toggle('is-current', game.current === color && !game.winner && !game.draw);
  }
  dom.phaseName.textContent = PHASES[game.phase].name;
  dom.turnCounter.textContent = `Ход ${game.turn + 1}`;
  dom.soundButton.textContent = settings.sound ? '♪' : '×';
  dom.soundButton.setAttribute('aria-pressed', String(settings.sound));
}

function renderTurnCopy() {
  if (!session?.game) return;
  const game = session.game;
  const profile = profileForColor(game.current);
  dom.turnKicker.textContent = `ХОД ${colorTitle(game.current).toUpperCase()} · ${profile.name.toUpperCase()}`;

  if (game.winner || game.draw) {
    dom.turnTitle.textContent = 'Раунд завершён';
    dom.turnDetail.textContent = 'Итог сохранён.';
  } else if (aiThinking) {
    dom.turnTitle.textContent = `${profile.name} просчитывает фазу`;
    dom.turnDetail.textContent = 'Оцениваются захваты, пути и лучший ответ.';
  } else if (game.swapAvailable) {
    dom.turnTitle.textContent = 'Решите, менять ли стороны';
    dom.turnDetail.textContent = 'Первый камень останется на месте.';
  } else if (selectedCell) {
    dom.turnTitle.textContent = 'Выберите фазу связности';
    dom.turnDetail.textContent = 'Недоступные фазы привели бы к самозахвату.';
  } else if (game.pending[otherPlayer(game.current)]) {
    dom.turnTitle.textContent = 'Разорвите удерживаемый путь';
    dom.turnDetail.textContent = 'Иначе соперник победит в начале следующего хода.';
  } else {
    dom.turnTitle.textContent = 'Поставьте камень';
    dom.turnDetail.textContent = 'После клетки выберите одну из трёх фаз.';
  }
}

function renderSwap() {
  if (!session?.game) return;
  const game = session.game;
  const human = profileForColor(game.current).type === 'human';
  dom.swapBanner.hidden = !game.swapAvailable || !human || aiThinking;
}

function render() {
  dom.continueButton.hidden = !session?.game;
  if (!session?.game || !series) return;
  renderHeader();
  renderBoard();
  renderPhasePicker();
  renderTurnCopy();
  renderSwap();
}

function beginSetup(mode) {
  setupMode = mode;
  dom.setup.querySelectorAll('.ai-only').forEach((section) => { section.hidden = mode !== 'ai'; });
  openOverlay('setup');
}

function buildSetupControls() {
  dom.styleChoices.innerHTML = Object.entries(AI_STYLES).map(([id, style]) => `
    <button type="button" data-style="${id}" data-native-press>
      <strong>${style.name}</strong>
      <small>${style.description}</small>
    </button>
  `).join('');
  dom.levelChoices.innerHTML = Object.entries(AI_LEVELS).map(([id, level]) => `
    <button type="button" data-level="${id}" data-native-press>${level.name}</button>
  `).join('');
  syncSetupSelections();
}

function syncSetupSelections() {
  document.querySelectorAll('[data-style]').forEach((button) => button.classList.toggle('is-selected', button.dataset.style === settings.style));
  document.querySelectorAll('[data-level]').forEach((button) => button.classList.toggle('is-selected', button.dataset.level === settings.level));
  document.querySelectorAll('[data-series]').forEach((button) => button.classList.toggle('is-selected', Number(button.dataset.series) === settings.seriesTarget));
}

function startSeries() {
  closeAllOverlays();
  selectedCell = null;
  series = {
    mode: setupMode,
    target: settings.seriesTarget,
    scores: { A: 0, B: 0 },
    round: 1,
    roundStarterSeat: 'A',
    profiles: setupMode === 'ai'
      ? {
          A: { name: 'Ты', type: 'human' },
          B: { name: AI_STYLES[settings.style].name, type: 'ai', style: settings.style, level: settings.level }
        }
      : {
          A: { name: 'Игрок A', type: 'human' },
          B: { name: 'Игрок B', type: 'human' }
        }
  };
  session = { game: createGame({ startingSeat: series.roundStarterSeat }), scored: false };
  save();
  showScreen('game');
  render();
  playSound('phase');
  scheduleAIIfNeeded();
}

function continueSession() {
  if (!session?.game || !series) return;
  selectedCell = null;
  showScreen('game');
  render();
  if (session.game.winner || session.game.draw) showResult();
  else scheduleAIIfNeeded();
}

function chooseCell(key) {
  if (!session?.game || !isHumanTurn() || session.game.swapAvailable) return;
  if (session.game.board[key]) {
    showToast('Клетка занята.');
    haptic(12);
    return;
  }
  const available = legalMoveMap(session.game).get(key);
  if (!available?.size) {
    showToast('В этой клетке любой выбор фазы ведёт к самозахвату.');
    haptic([12, 40, 12]);
    return;
  }
  selectedCell = key;
  render();
  playSound('place');
  haptic(8);
}

function commitPhase(phase) {
  if (!selectedCell || !session?.game || !isHumanTurn()) return;
  const result = applyMove(session.game, { cell: selectedCell, phase });
  if (!result.ok) {
    showToast(result.error);
    haptic([15, 35, 15]);
    return;
  }
  const captured = result.state.lastAction?.removed?.length || 0;
  session.game = result.state;
  selectedCell = null;
  save();
  render();
  playSound(captured ? 'capture' : 'phase');
  haptic(captured ? [18, 30, 26] : 10);
  afterMove();
}

function afterMove() {
  if (!session?.game) return;
  if (session.game.winner || session.game.draw) {
    window.clearTimeout(resultTimer);
    resultTimer = window.setTimeout(showResult, 380);
    return;
  }
  scheduleAIIfNeeded();
}

async function scheduleAIIfNeeded() {
  if (!session?.game || session.game.winner || session.game.draw || aiThinking) return;
  const profile = profileForColor(session.game.current);
  if (profile.type !== 'ai') {
    render();
    return;
  }

  aiThinking = true;
  render();
  await new Promise((resolve) => window.setTimeout(resolve, 260));
  if (!session?.game || profileForColor(session.game.current).type !== 'ai') {
    aiThinking = false;
    render();
    return;
  }

  if (session.game.swapAvailable) {
    const swap = shouldSwap(session.game, { level: profile.level, style: profile.style });
    session.game = resolveSwap(session.game, swap).state;
    save();
    aiThinking = false;
    render();
    playSound('phase');
    if (profileForColor(session.game.current).type === 'ai') scheduleAIIfNeeded();
    return;
  }

  const move = chooseMove(session.game, { level: profile.level, style: profile.style });
  if (!move) {
    session.game.draw = true;
    session.game.winReason = 'no-moves';
  } else {
    const result = applyMove(session.game, move);
    if (result.ok) session.game = result.state;
  }
  aiThinking = false;
  save();
  render();
  const captured = session.game.lastAction?.removed?.length || 0;
  playSound(captured ? 'capture' : 'phase');
  haptic(captured ? [12, 25, 18] : 8);
  afterMove();
}

function resolveHumanSwap(take) {
  if (!session?.game || !session.game.swapAvailable || !isHumanTurn()) return;
  const result = resolveSwap(session.game, take);
  if (!result.ok) return;
  session.game = result.state;
  save();
  render();
  playSound('phase');
  scheduleAIIfNeeded();
}

function scoreRoundIfNeeded() {
  if (!session || session.scored || !series) return;
  const game = session.game;
  if (game.winner) {
    const seat = game.seats[game.winner];
    series.scores[seat] = (series.scores[seat] || 0) + 1;
  }
  session.scored = true;
  save();
}

function reasonText(game) {
  if (game.draw) {
    if (game.winReason === 'repetition') return 'Позиция повторилась трижды.';
    if (game.winReason === 'limit') return 'Лимит ходов исчерпан, дополнительные показатели равны.';
    return 'Допустимых ходов не осталось.';
  }
  if (game.winReason === 'capture') return `${playerLabel(game.winner)} снял пять камней соперника.`;
  if (game.winReason === 'hold') return `${playerLabel(game.winner)} удержал путь через ответный ход.`;
  if (game.winReason === 'tiebreak') return `${playerLabel(game.winner)} выиграл по захватам и фазовой устойчивости.`;
  return `${playerLabel(game.winner)} выиграл раунд.`;
}

function showResult() {
  if (!session?.game || (!session.game.winner && !session.game.draw)) return;
  scoreRoundIfNeeded();
  const game = session.game;
  const winnerSeat = game.winner ? game.seats[game.winner] : null;
  const seriesWon = winnerSeat && series.scores[winnerSeat] >= series.target;

  dom.resultMark.className = `result-mark ${game.draw ? 'draw' : `player-${game.winner}`}`;
  dom.resultKicker.textContent = seriesWon ? 'СЕРИЯ ЗАВЕРШЕНА' : 'РАУНД ЗАВЕРШЁН';
  dom.resultTitle.textContent = game.draw ? 'Ничья' : seriesWon ? `${seatProfile(winnerSeat).name} выиграл серию` : `${playerLabel(game.winner)} победил`;
  dom.resultDetail.textContent = reasonText(game);
  dom.resultScore.innerHTML = `<span>${seatProfile('A').name} ${series.scores.A}</span><span>${series.scores.B} ${seatProfile('B').name}</span>`;
  dom.nextRound.textContent = seriesWon ? 'Новая серия' : 'Следующий раунд';
  dom.nextRound.dataset.seriesWon = String(Boolean(seriesWon));
  openOverlay('result');
  playSound('win');
  haptic([20, 40, 20, 40, 35]);
}

function startNextRound() {
  if (dom.nextRound.dataset.seriesWon === 'true') {
    closeAllOverlays();
    showScreen('menu');
    beginSetup(series.mode);
    return;
  }
  series.round += 1;
  series.roundStarterSeat = series.roundStarterSeat === 'A' ? 'B' : 'A';
  session = { game: createGame({ startingSeat: series.roundStarterSeat }), scored: false };
  selectedCell = null;
  save();
  closeAllOverlays();
  render();
  scheduleAIIfNeeded();
}

function restartRound() {
  if (!series) return;
  session = { game: createGame({ startingSeat: series.roundStarterSeat }), scored: false };
  selectedCell = null;
  save();
  closeAllOverlays();
  render();
  scheduleAIIfNeeded();
}

function abandonToSetup() {
  const mode = series?.mode || setupMode;
  session = null;
  series = null;
  save();
  closeAllOverlays();
  showScreen('menu');
  beginSetup(mode);
}

function resetApplication() {
  settings = { ...DEFAULTS.settings };
  series = null;
  session = null;
  selectedCell = null;
  storage.reset();
  closeAllOverlays();
  showScreen('menu');
  render();
}

buildSetupControls();
render();
showScreen('menu');

for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => beginSetup(button.dataset.mode));
}

dom.continueButton.addEventListener('click', continueSession);
dom.startButton.addEventListener('click', startSeries);

dom.styleChoices.addEventListener('click', (event) => {
  const button = event.target.closest('[data-style]');
  if (!button) return;
  settings.style = button.dataset.style;
  syncSetupSelections();
  save();
});

dom.levelChoices.addEventListener('click', (event) => {
  const button = event.target.closest('[data-level]');
  if (!button) return;
  settings.level = button.dataset.level;
  syncSetupSelections();
  save();
});

document.querySelector('#series-choices').addEventListener('click', (event) => {
  const button = event.target.closest('[data-series]');
  if (!button) return;
  settings.seriesTarget = Number(button.dataset.series);
  syncSetupSelections();
  save();
});

dom.board.addEventListener('click', (event) => {
  const cell = event.target.closest('[data-cell]');
  if (cell) chooseCell(cell.dataset.cell);
});

dom.board.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const cell = event.target.closest('[data-cell]');
  if (!cell) return;
  event.preventDefault();
  chooseCell(cell.dataset.cell);
});

dom.phasePicker.addEventListener('click', (event) => {
  const button = event.target.closest('[data-phase]');
  if (!button || button.disabled) return;
  commitPhase(Number(button.dataset.phase));
});

dom.cancelCell.addEventListener('click', () => {
  selectedCell = null;
  render();
});

dom.swapBanner.addEventListener('click', (event) => {
  const button = event.target.closest('[data-swap]');
  if (!button) return;
  resolveHumanSwap(button.dataset.swap === 'yes');
});

dom.pauseButton.addEventListener('click', () => openOverlay('pause'));
dom.soundButton.addEventListener('click', () => {
  settings.sound = !settings.sound;
  if (settings.sound) playSound('place');
  save();
  render();
});

document.addEventListener('click', (event) => {
  const open = event.target.closest('[data-open]');
  if (open) {
    event.preventDefault();
    openOverlay(open.dataset.open);
    return;
  }
  const close = event.target.closest('[data-close]');
  if (close) closeOverlay(close.closest('.overlay'));
});

document.querySelector('#restart-round').addEventListener('click', () => openOverlay('confirm'));
document.querySelector('#confirm-restart').addEventListener('click', restartRound);
document.querySelector('#new-match').addEventListener('click', abandonToSetup);
document.querySelector('#result-new-match').addEventListener('click', abandonToSetup);
dom.nextRound.addEventListener('click', startNextRound);

window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});
window.addEventListener('appdatareset', resetApplication);

createWorkshopMode({
  appName: 'ФАЗА',
  version: '1.0.0',
  cachePrefix: 'faza-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset: resetApplication
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
