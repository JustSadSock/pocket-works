import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  CELLS,
  DIRECTIONS,
  PHASES,
  RADIUS,
  allNeighbors,
  applyMove,
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

const APP_VERSION = '1.1.0';
const STORAGE_NAMESPACE = 'pocket-works:faza';
const AXES = Object.freeze([
  { id: 0, symbol: '↔', title: 'Без ↔', noun: 'горизонтали', explanation: 'лево и право больше не считаются соседями' },
  { id: 1, symbol: '↗', title: 'Без ↗', noun: 'восходящей диагонали', explanation: 'низ-слева и верх-справа больше не считаются соседями' },
  { id: 2, symbol: '↘', title: 'Без ↘', noun: 'нисходящей диагонали', explanation: 'верх-слева и низ-справа больше не считаются соседями' }
]);
const DEFAULTS = {
  settings: { sound: true, level: 'tactician', style: 'adaptive', seriesTarget: 2 },
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
  boardStage: document.querySelector('.board-stage'),
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
let previewPhase = null;
let setupMode = 'ai';
let aiThinking = false;
let aiStage = '';
let committing = false;
let toastTimer = 0;
let resultTimer = 0;
let audioContext = null;

if (session?.game && !validateState(session.game)) {
  session = null;
  series = null;
  storage.patch({ session: null, series: null });
}

function injectClarityUI() {
  if (!document.querySelector('link[href="./clarity.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './clarity.css';
    document.head.append(link);
  }

  document.querySelector('.menu-lead').textContent = 'Ставь камень, затем выключай одну ось соседства. Разрезай группы, забирай воздух и удерживай путь через поле.';
  document.querySelector('.phase-readout span').textContent = 'Не соседи';
  document.querySelector('.menu-footer span').textContent = `v${APP_VERSION}`;

  dom.phasePicker.querySelectorAll('[data-phase]').forEach((button) => {
    const axis = AXES[Number(button.dataset.phase)];
    button.innerHTML = `
      <span class="phase-axis" aria-hidden="true">${axis.symbol}</span>
      <span class="phase-card-copy"><b>${axis.title}</b><small data-phase-impact>Отключает ${axis.noun}</small></span>
      <span class="phase-state" aria-hidden="true"></span>
    `;
    button.setAttribute('aria-label', `${axis.title}. ${axis.explanation}.`);
  });

  const explainer = document.createElement('div');
  explainer.id = 'phase-explainer';
  explainer.className = 'phase-explainer';
  explainer.setAttribute('aria-live', 'polite');
  dom.boardStage.insertBefore(explainer, dom.board);
  dom.phaseExplainer = explainer;

  const impact = document.createElement('div');
  impact.id = 'move-impact';
  impact.className = 'move-impact';
  impact.hidden = true;
  dom.phasePicker.insertAdjacentElement('afterend', impact);
  dom.moveImpact = impact;

  const confirmMove = document.createElement('button');
  confirmMove.id = 'confirm-move';
  confirmMove.className = 'confirm-move';
  confirmMove.type = 'button';
  confirmMove.hidden = true;
  confirmMove.setAttribute('data-native-press', '');
  confirmMove.addEventListener('click', commitPreviewedMove);
  impact.insertAdjacentElement('afterend', confirmMove);
  dom.confirmMove = confirmMove;

  const rulesList = dom.rules.querySelector('.rule-list');
  rulesList.innerHTML = `
    <li><b>Камни не двигаются.</b><span>На ходу вы ставите один новый камень, затем выбираете, какая ось соседства не работает.</span></li>
    <li><b>«Без ↔» значит буквально: пары слева и справа не соседи.</b><span>Они не склеиваются в группу, не делятся дыханием и не продолжают путь. Правило действует сразу для обоих цветов.</span></li>
    <li><b>Каждый следующий ход может включить другую ось.</b><span>Поэтому одна и та же расстановка распадается на разные группы в «Без ↔», «Без ↗» и «Без ↘».</span></li>
    <li><b>Чужая группа без свободной активной соседней клетки снимается.</b><span>Сначала снимаются чужие камни. Самозахват запрещён.</span></li>
    <li><b>Победа — пять захватов или удержанный путь.</b><span>Путь должен существовать в выбранной фазе и пережить ответ соперника.</span></li>
  `;
  dom.rules.querySelector('.sheet-head p').textContent = 'ГЛАВНОЕ ПРАВИЛО';
  dom.rules.querySelector('#rules-title').textContent = 'Фаза — это разрез соседства';
  const legend = dom.rules.querySelector('.phase-legend');
  legend.innerHTML = AXES.map((axis) => `
    <div><span class="phase-axis">${axis.symbol}</span><b>${axis.title}</b><small>${axis.explanation}</small></div>
  `).join('');
  legend.insertAdjacentHTML('beforebegin', `
    <div class="phase-demo" aria-label="Пример действия фазы">
      <div class="demo-case"><span class="demo-stone"></span><i class="demo-link"></i><span class="demo-stone"></span><p>Ось работает: это одна группа, дыхание общее.</p></div>
      <div class="demo-case is-cut"><span class="demo-stone"></span><i class="demo-link"></i><b>×</b><span class="demo-stone"></span><p>«Без ↔»: связь разрезана, это уже две группы.</p></div>
    </div>
  `);
}

injectClarityUI();

function save() {
  storage.patch({ settings, series, session });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function colorTitle(color) {
  return color === 1 ? 'Синий' : 'Охра';
}

function isHumanTurn() {
  if (!session?.game || session.game.winner || session.game.draw) return false;
  return profileForColor(session.game.current).type === 'human' && !aiThinking && !committing;
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
    tone(300, 0.07, 'sine', 0.024);
    tone(455, 0.1, 'sine', 0.02, 0.06);
  }
  if (kind === 'capture') {
    tone(170, 0.13, 'square', 0.026);
    tone(108, 0.18, 'triangle', 0.03, 0.05);
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

function showToast(message, duration = 1800) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), duration);
}

function axialToPoint(key) {
  const { q, r } = typeof key === 'string' ? parseCell(key) : key;
  const unit = 86;
  return { x: 360 + unit * (q + r / 2), y: 335 + unit * 0.8660254 * r };
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

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function activeInPhase(direction, phase) {
  return !PHASES[phase].closedAxis.includes(direction);
}

function legalMoveMap(game) {
  const map = new Map();
  for (const move of getLegalMoves(game)) {
    if (!map.has(move.cell)) map.set(move.cell, new Set());
    map.get(move.cell).add(move.phase);
  }
  return map;
}

function moveProjection(game, cell = selectedCell, phase = previewPhase) {
  if (!game || !cell || phase == null) return null;
  const result = applyMove(game, { cell, phase });
  return result.ok ? result : null;
}

function countChangedPairs(board, oldPhase, nextPhase, owner) {
  const seen = new Set();
  let cut = 0;
  let formed = 0;
  for (const [key, player] of Object.entries(board)) {
    if (player !== owner) continue;
    for (const neighbor of allNeighbors(key)) {
      if (board[neighbor] !== owner) continue;
      const id = pairKey(key, neighbor);
      if (seen.has(id)) continue;
      seen.add(id);
      const direction = directionIndex(key, neighbor);
      const was = activeInPhase(direction, oldPhase);
      const now = activeInPhase(direction, nextPhase);
      if (was && !now) cut += 1;
      if (!was && now) formed += 1;
    }
  }
  return { cut, formed };
}

function analyzeMove(game, cell, phase) {
  const projection = moveProjection(game, cell, phase);
  if (!projection) return null;
  const mover = game.current;
  const opponent = otherPlayer(mover);
  const boardBeforeCapture = { ...game.board, [cell]: mover };
  const ownChange = countChangedPairs(boardBeforeCapture, game.phase, phase, mover);
  const enemyChange = countChangedPairs(boardBeforeCapture, game.phase, phase, opponent);
  const ownGroup = getGroups(projection.state.board, phase, mover).find((group) => group.has(cell));
  const liberties = ownGroup ? getLiberties(projection.state.board, phase, ownGroup).size : 0;
  const captured = projection.state.lastAction?.removed?.length || 0;
  const madePath = Boolean(projection.state.pending[mover]);
  const brokePath = Boolean(game.pending[opponent] && !projection.state.pending[opponent]);
  return { projection, boardBeforeCapture, ownChange, enemyChange, liberties, captured, madePath, brokePath };
}

function conciseImpact(report) {
  if (!report) return 'Недоступно';
  const parts = [];
  if (report.captured) parts.push(`снимет ${report.captured}`);
  if (report.enemyChange.cut) parts.push(`режет врагу ${report.enemyChange.cut}`);
  if (report.ownChange.formed) parts.push(`соединит ${report.ownChange.formed}`);
  if (report.madePath) parts.push('создаёт путь');
  if (!parts.length) parts.push(`${report.liberties} дых.`);
  return parts.slice(0, 2).join(' · ');
}

function fullImpact(report, axis) {
  if (!report) return '';
  const cards = [
    `<span><b>${axis.symbol}</b><small>выключенная ось</small></span>`,
    `<span><b>${report.captured}</b><small>камней снимется</small></span>`,
    `<span><b>${report.liberties}</b><small>дыханий у новой группы</small></span>`
  ];
  const notes = [];
  if (report.enemyChange.cut) notes.push(`разрежет ${report.enemyChange.cut} связи соперника`);
  if (report.ownChange.cut) notes.push(`разрежет ${report.ownChange.cut} ваши связи`);
  if (report.ownChange.formed) notes.push(`создаст ${report.ownChange.formed} ваши связи`);
  if (report.brokePath) notes.push('сломает удерживаемый путь соперника');
  if (report.madePath) notes.push('создаст путь, который соперник обязан разорвать');
  if (!notes.length) notes.push('перестроит группы без немедленного захвата');
  return `<div class="impact-metrics">${cards.join('')}</div><p>${notes.join('; ')}.</p>`;
}

function threatenedStones(board, phase) {
  const result = new Set();
  for (const player of [1, 2]) {
    for (const group of getGroups(board, phase, player)) {
      if (getLiberties(board, phase, group).size === 1) {
        for (const key of group) result.add(key);
      }
    }
  }
  return result;
}

function renderBoard() {
  if (!session?.game) return;
  const game = session.game;
  const phase = previewPhase ?? game.phase;
  const projection = moveProjection(game);
  const baseBoard = selectedCell ? { ...game.board, [selectedCell]: game.current } : { ...game.board };
  const finalBoard = projection?.state.board || game.board;
  const removed = new Set(projection?.state.lastAction?.removed || []);
  const threat = threatenedStones(finalBoard, phase);
  const pathOne = findConnectionPath(finalBoard, phase, 1) || [];
  const pathTwo = findConnectionPath(finalBoard, phase, 2) || [];
  const activePaths = new Set([...(projection?.state.pending[1] ? pathOne : []), ...(projection?.state.pending[2] ? pathTwo : [])]);
  const legalMap = legalMoveMap(game);
  const fragments = [];
  const drawnPairs = new Set();

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
      const closed = !activeInPhase(direction, phase);
      const changing = previewPhase != null && activeInPhase(direction, game.phase) !== activeInPhase(direction, phase);
      fragments.push(`<line class="grid-link axis-${direction}${closed ? ' is-closed' : ''}${changing ? ' is-changing' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
    }
  }

  for (const [key, owner] of Object.entries(baseBoard)) {
    for (const neighbor of allNeighbors(key)) {
      if (baseBoard[neighbor] !== owner) continue;
      const id = pairKey(key, neighbor);
      if (drawnPairs.has(id)) continue;
      drawnPairs.add(id);
      const direction = directionIndex(key, neighbor);
      const a = axialToPoint(key);
      const b = axialToPoint(neighbor);
      const active = activeInPhase(direction, phase);
      const wasActive = activeInPhase(direction, game.phase);
      const changedClass = previewPhase == null || active === wasActive ? '' : active ? ' will-form' : ' will-break';
      if (active) {
        fragments.push(`<line class="stone-link player-${owner}${changedClass}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
      } else {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        fragments.push(`<line class="broken-link player-${owner}${changedClass}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
        fragments.push(`<g class="cut-mark${changedClass}"><circle cx="${mx}" cy="${my}" r="11"></circle><path d="M ${mx - 5} ${my - 5} L ${mx + 5} ${my + 5} M ${mx + 5} ${my - 5} L ${mx - 5} ${my + 5}"></path></g>`);
      }
    }
  }

  for (const cell of CELLS) {
    const center = axialToPoint(cell.key);
    const isLegal = legalMap.has(cell.key) && isHumanTurn() && !game.swapAvailable && !selectedCell;
    const preview = selectedCell === cell.key;
    const label = baseBoard[cell.key]
      ? `${colorTitle(baseBoard[cell.key])} камень, ${cell.q}, ${cell.r}`
      : `Свободная клетка ${cell.q}, ${cell.r}`;
    fragments.push(`
      <g class="cell${isLegal ? ' is-legal' : ''}${preview ? ' is-preview' : ''}" data-cell="${cell.key}" role="gridcell" tabindex="${isLegal ? '0' : '-1'}" aria-label="${label}">
        <polygon class="cell-shape" points="${polygonPoints(center)}"></polygon>
        <circle class="cell-hit" cx="${center.x}" cy="${center.y}" r="39"></circle>
      </g>
    `);
  }

  if (projection && selectedCell) {
    const ownGroup = getGroups(projection.state.board, phase, game.current).find((group) => group.has(selectedCell));
    if (ownGroup) {
      for (const liberty of getLiberties(projection.state.board, phase, ownGroup)) {
        const point = axialToPoint(liberty);
        fragments.push(`<circle class="liberty-dot player-${game.current}" cx="${point.x}" cy="${point.y}" r="6"></circle>`);
      }
    }
  }

  for (const [key, player] of Object.entries(baseBoard)) {
    const center = axialToPoint(key);
    const classes = [
      'stone',
      `player-${player}`,
      game.lastAction?.cell === key && !selectedCell ? 'is-new' : '',
      selectedCell === key ? 'preview-stone' : '',
      activePaths.has(key) ? 'is-path' : '',
      threat.has(key) ? 'is-threat' : '',
      removed.has(key) ? 'will-capture' : '',
      aiStage === 'cell' && selectedCell === key ? 'ai-focus' : ''
    ].filter(Boolean).join(' ');
    fragments.push(`<circle class="${classes}" cx="${center.x}" cy="${center.y}" r="25" pointer-events="none"></circle>`);
  }

  dom.board.classList.toggle('is-previewing', previewPhase != null);
  dom.board.classList.toggle('is-committing', committing);
  dom.board.innerHTML = fragments.join('');
}

function renderPhaseExplainer() {
  if (!session?.game) return;
  const game = session.game;
  const phase = previewPhase ?? game.phase;
  const axis = AXES[phase];
  const previewing = previewPhase != null;
  dom.phaseExplainer.classList.toggle('is-preview', previewing);
  dom.phaseExplainer.innerHTML = `
    <span class="explainer-axis">${axis.symbol}</span>
    <span><b>${previewing ? 'После хода не соседи' : 'Сейчас не соседи'}: ${axis.symbol}</b><small>${axis.explanation}. Камни по этой оси не делят дыхание и не продолжают путь.</small></span>
  `;
}

function renderPhasePicker() {
  if (!session?.game) return;
  const game = session.game;
  const legal = legalMoveMap(game);
  const phases = selectedCell ? legal.get(selectedCell) || new Set() : new Set();
  dom.phasePicker.classList.toggle('is-ready', Boolean(selectedCell));

  dom.phasePicker.querySelectorAll('[data-phase]').forEach((button) => {
    const phase = Number(button.dataset.phase);
    const axis = AXES[phase];
    const report = selectedCell && phases.has(phase) ? analyzeMove(game, selectedCell, phase) : null;
    button.disabled = !selectedCell || !phases.has(phase) || (!isHumanTurn() && !aiThinking) || game.swapAvailable || committing;
    button.classList.toggle('is-selected-phase', previewPhase === phase);
    button.classList.toggle('is-current-phase', previewPhase == null && game.phase === phase);
    button.querySelector('[data-phase-impact]').textContent = selectedCell
      ? phases.has(phase) ? conciseImpact(report) : 'самозахват'
      : `Отключает ${axis.noun}`;
    button.querySelector('.phase-state').textContent = previewPhase === phase ? 'ПРЕДПРОСМОТР' : (game.phase === phase ? 'СЕЙЧАС' : '');
  });

  const report = previewPhase != null ? analyzeMove(game, selectedCell, previewPhase) : null;
  dom.moveImpact.hidden = !report;
  dom.confirmMove.hidden = !report || !isHumanTurn() || aiThinking;
  if (report) {
    dom.moveImpact.innerHTML = fullImpact(report, AXES[previewPhase]);
    dom.confirmMove.textContent = `Сделать ход · ${AXES[previewPhase].title}`;
  }
  dom.cancelCell.hidden = !selectedCell || aiThinking || committing;
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
  dom.phaseName.textContent = AXES[previewPhase ?? game.phase].title;
  dom.phaseName.classList.toggle('is-preview', previewPhase != null);
  dom.turnCounter.textContent = `Ход ${game.turn + 1}`;
  dom.soundButton.textContent = settings.sound ? '♪' : '×';
  dom.soundButton.setAttribute('aria-pressed', String(settings.sound));
}

function aiReason(report, profile) {
  if (!report) return 'Проверяет, как изменятся группы и дыхание.';
  if (report.captured) return `${profile.name} выбрал разрез, который снимает ${report.captured} камн${report.captured === 1 ? 'ь' : 'я'}.`;
  if (report.brokePath) return `${profile.name} выключает ось, чтобы разорвать ваш удерживаемый путь.`;
  if (report.enemyChange.cut) return `${profile.name} разрезает ${report.enemyChange.cut} связи соперника и меняет форму групп.`;
  if (report.madePath) return `${profile.name} создаёт путь через поле — его придётся ломать следующим ходом.`;
  if (profile.style === 'architect') return `${profile.name} соединяет камни так, чтобы цепь переживала разные разрезы.`;
  if (profile.style === 'warden') return `${profile.name} выбирает больше дыхания и безопасную форму группы.`;
  return `${profile.name} оставляет новой группе ${report.liberties} дыханий и перестраивает соседства.`;
}

function renderTurnCopy() {
  if (!session?.game) return;
  const game = session.game;
  const profile = profileForColor(game.current);
  dom.turnKicker.textContent = `ХОД ${colorTitle(game.current).toUpperCase()} · ${profile.name.toUpperCase()}`;

  if (game.winner || game.draw) {
    dom.turnTitle.textContent = 'Раунд завершён';
    dom.turnDetail.textContent = 'Итог сохранён.';
  } else if (committing) {
    dom.turnTitle.textContent = `Применяется ${AXES[previewPhase].title}`;
    dom.turnDetail.textContent = 'Сначала разрываются выключенные связи, затем снимаются группы без дыхания.';
  } else if (aiStage === 'cell') {
    dom.turnTitle.textContent = `${profile.name} ставит камень`;
    dom.turnDetail.textContent = 'Камень показан полупрозрачно. Фаза ещё не изменилась.';
  } else if (aiStage === 'phase') {
    const report = analyzeMove(game, selectedCell, previewPhase);
    dom.turnTitle.textContent = `${profile.name}: ${AXES[previewPhase].title}`;
    dom.turnDetail.textContent = aiReason(report, profile);
  } else if (aiThinking) {
    dom.turnTitle.textContent = `${profile.name} ищет ход`;
    dom.turnDetail.textContent = 'Сравнивает клетку и три возможных разреза соседства.';
  } else if (game.swapAvailable) {
    dom.turnTitle.textContent = 'Решите, менять ли стороны';
    dom.turnDetail.textContent = 'Первый камень останется на месте.';
  } else if (selectedCell && previewPhase == null) {
    dom.turnTitle.textContent = 'Теперь выберите разрез';
    dom.turnDetail.textContent = 'Нажмите «Без ↔», «Без ↗» или «Без ↘». Поле покажет результат до подтверждения.';
  } else if (selectedCell) {
    dom.turnTitle.textContent = `Предпросмотр: ${AXES[previewPhase].title}`;
    dom.turnDetail.textContent = 'Толстые линии — действующие связи. Кресты показывают пары, которые перестанут быть группой.';
  } else if (game.pending[otherPlayer(game.current)]) {
    dom.turnTitle.textContent = 'Разорвите удерживаемый путь';
    dom.turnDetail.textContent = 'Поставьте камень и выберите разрез, который уничтожит связную цепь соперника.';
  } else {
    dom.turnTitle.textContent = 'Поставьте камень';
    dom.turnDetail.textContent = 'После клетки вы выберете одну ось, по которой соседства временно не работают.';
  }
}

function renderSwap() {
  if (!session?.game) return;
  const human = profileForColor(session.game.current).type === 'human';
  dom.swapBanner.hidden = !session.game.swapAvailable || !human || aiThinking;
}

function render() {
  dom.continueButton.hidden = !session?.game;
  if (!session?.game || !series) return;
  renderHeader();
  renderBoard();
  renderPhaseExplainer();
  renderPhasePicker();
  renderTurnCopy();
  renderSwap();
}

function clearPreview() {
  selectedCell = null;
  previewPhase = null;
  aiStage = '';
}

function beginSetup(mode) {
  setupMode = mode;
  dom.setup.querySelectorAll('.ai-only').forEach((section) => { section.hidden = mode !== 'ai'; });
  openOverlay('setup');
}

function buildSetupControls() {
  dom.styleChoices.innerHTML = Object.entries(AI_STYLES).map(([id, style]) => `
    <button type="button" data-style="${id}" data-native-press><strong>${style.name}</strong><small>${style.description}</small></button>
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
  clearPreview();
  series = {
    mode: setupMode,
    target: settings.seriesTarget,
    scores: { A: 0, B: 0 },
    round: 1,
    roundStarterSeat: 'A',
    profiles: setupMode === 'ai'
      ? { A: { name: 'Ты', type: 'human' }, B: { name: AI_STYLES[settings.style].name, type: 'ai', style: settings.style, level: settings.level } }
      : { A: { name: 'Игрок A', type: 'human' }, B: { name: 'Игрок B', type: 'human' } }
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
  clearPreview();
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
    showToast('В этой клетке все три разреза дают самозахват.');
    haptic([12, 40, 12]);
    return;
  }
  selectedCell = key;
  previewPhase = null;
  render();
  playSound('place');
  haptic(8);
}

function selectPhase(phase) {
  if (!selectedCell || !session?.game || committing) return;
  const legal = legalMoveMap(session.game).get(selectedCell);
  if (!legal?.has(phase)) {
    showToast('Этот разрез оставит ваш новый камень без дыхания.');
    return;
  }
  previewPhase = phase;
  render();
  playSound('phase');
  haptic(8);
}

async function commitPreviewedMove() {
  if (previewPhase == null || !selectedCell || !session?.game || !isHumanTurn()) return;
  const result = applyMove(session.game, { cell: selectedCell, phase: previewPhase });
  if (!result.ok) {
    showToast(result.error);
    haptic([15, 35, 15]);
    return;
  }
  const captured = result.state.lastAction?.removed?.length || 0;
  committing = true;
  render();
  playSound(captured ? 'capture' : 'phase');
  haptic(captured ? [18, 30, 26] : 10);
  await wait(captured ? 620 : 420);
  session.game = result.state;
  committing = false;
  clearPreview();
  save();
  render();
  afterMove();
}

function afterMove() {
  if (!session?.game) return;
  if (session.game.winner || session.game.draw) {
    window.clearTimeout(resultTimer);
    resultTimer = window.setTimeout(showResult, 520);
    return;
  }
  scheduleAIIfNeeded();
}

async function scheduleAIIfNeeded() {
  if (!session?.game || session.game.winner || session.game.draw || aiThinking || committing) return;
  const profile = profileForColor(session.game.current);
  if (profile.type !== 'ai') {
    render();
    return;
  }

  aiThinking = true;
  aiStage = '';
  render();
  await wait(520);
  if (!session?.game || profileForColor(session.game.current).type !== 'ai') {
    aiThinking = false;
    render();
    return;
  }

  if (session.game.swapAvailable) {
    const swap = shouldSwap(session.game, { level: profile.level, style: profile.style });
    session.game = resolveSwap(session.game, swap).state;
    save();
    showToast(swap ? `${profile.name} забирает синий цвет.` : `${profile.name} оставляет цвета как есть.`, 1500);
    await wait(900);
    aiThinking = false;
    render();
    if (profileForColor(session.game.current).type === 'ai') scheduleAIIfNeeded();
    return;
  }

  const move = chooseMove(session.game, { level: profile.level, style: profile.style });
  if (!move) {
    session.game.draw = true;
    session.game.winReason = 'no-moves';
    aiThinking = false;
    save();
    render();
    afterMove();
    return;
  }

  selectedCell = move.cell;
  previewPhase = null;
  aiStage = 'cell';
  render();
  playSound('place');
  await wait(720);

  previewPhase = move.phase;
  aiStage = 'phase';
  render();
  playSound('phase');
  await wait(1250);

  const result = applyMove(session.game, move);
  if (result.ok) {
    const captured = result.state.lastAction?.removed?.length || 0;
    committing = true;
    render();
    playSound(captured ? 'capture' : 'phase');
    await wait(captured ? 640 : 430);
    session.game = result.state;
  }
  committing = false;
  aiThinking = false;
  clearPreview();
  save();
  render();
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
  clearPreview();
  save();
  closeAllOverlays();
  render();
  scheduleAIIfNeeded();
}

function restartRound() {
  if (!series) return;
  session = { game: createGame({ startingSeat: series.roundStarterSeat }), scored: false };
  clearPreview();
  save();
  closeAllOverlays();
  render();
  scheduleAIIfNeeded();
}

function abandonToSetup() {
  const mode = series?.mode || setupMode;
  session = null;
  series = null;
  clearPreview();
  save();
  closeAllOverlays();
  showScreen('menu');
  beginSetup(mode);
}

function resetApplication() {
  settings = { ...DEFAULTS.settings };
  series = null;
  session = null;
  clearPreview();
  storage.reset();
  closeAllOverlays();
  showScreen('menu');
  render();
}

buildSetupControls();
render();
showScreen('menu');

for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => beginSetup(button.dataset.mode));
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
  if (!button || button.disabled || aiThinking) return;
  selectPhase(Number(button.dataset.phase));
});

dom.cancelCell.addEventListener('click', () => {
  clearPreview();
  render();
});

dom.swapBanner.addEventListener('click', (event) => {
  const button = event.target.closest('[data-swap]');
  if (button) resolveHumanSwap(button.dataset.swap === 'yes');
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
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('appdatareset', resetApplication);

createWorkshopMode({
  appName: 'ФАЗА',
  version: APP_VERSION,
  cachePrefix: 'faza-',
  storageNamespace: STORAGE_NAMESPACE,
  onReset: resetApplication
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});
