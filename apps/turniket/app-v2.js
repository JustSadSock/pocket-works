import {
  MATCH_TARGET,
  applyGate,
  applyMove,
  createMatch,
  directionLabel,
  getLegalMoves,
  hydrateState,
  placementSlots,
  restartRound,
  startNextRound
} from './game.js';
import { applyAiAction, chooseAiAction } from './ai.js';

const STORAGE_KEY = 'pocket-works:turniket:match';
const SETTINGS_KEY = 'pocket-works:turniket:settings';
const BOARD_VIEW = 700;
const BOARD_PADDING = 74;
const TILE_SIZE = 62;
const AI_LABELS = {
  apprentice: 'УЧЕНИК',
  strategist: 'СТРАТЕГ',
  oracle: 'ОРАКУЛ'
};
const COLORS = {
  board: '#d8d0c0',
  tile: '#f8f4ea',
  ink: '#293033',
  grid: '#a9a295',
  orange: '#db5a3a',
  blue: '#297c8a',
  paper: '#eee9dd',
  gate: '#343b3d'
};

const elements = {
  homeScreen: document.querySelector('#homeScreen'),
  gameScreen: document.querySelector('#gameScreen'),
  continueButton: document.querySelector('#continueButton'),
  continueMeta: document.querySelector('#continueMeta'),
  localMatchButton: document.querySelector('#localMatchButton'),
  aiMatchButton: document.querySelector('#aiMatchButton'),
  rulesButton: document.querySelector('#rulesButton'),
  settingsButton: document.querySelector('#settingsButton'),
  rulesDialog: document.querySelector('#rulesDialog'),
  settingsDialog: document.querySelector('#settingsDialog'),
  difficultyDialog: document.querySelector('#difficultyDialog'),
  soundToggle: document.querySelector('#soundToggle'),
  hapticsToggle: document.querySelector('#hapticsToggle'),
  restartRoundButton: document.querySelector('#restartRoundButton'),
  resetMatchButton: document.querySelector('#resetMatchButton'),
  openRulesFromSettings: document.querySelector('#openRulesFromSettings'),
  difficultySettingButton: document.querySelector('#difficultySettingButton'),
  player0Panel: document.querySelector('#player0Panel'),
  player1Panel: document.querySelector('#player1Panel'),
  player1Name: document.querySelector('#player1Name'),
  score0: document.querySelector('#score0'),
  score1: document.querySelector('#score1'),
  gates0: document.querySelector('#gates0'),
  gates1: document.querySelector('#gates1'),
  roundNumber: document.querySelector('#roundNumber'),
  turnDot: document.querySelector('#turnDot'),
  turnTitle: document.querySelector('#turnTitle'),
  turnHint: document.querySelector('#turnHint'),
  boardFrame: document.querySelector('#boardFrame'),
  board: document.querySelector('#board'),
  moveModeButton: document.querySelector('#moveModeButton'),
  gateModeButton: document.querySelector('#gateModeButton'),
  gateModeMeta: document.querySelector('#gateModeMeta'),
  placementPanel: document.querySelector('#placementPanel'),
  placementKicker: document.querySelector('#placementKicker'),
  placementDirection: document.querySelector('#placementDirection'),
  rotateGateButton: document.querySelector('#rotateGateButton'),
  cancelGateButton: document.querySelector('#cancelGateButton'),
  confirmGateButton: document.querySelector('#confirmGateButton'),
  lastAction: document.querySelector('#lastAction'),
  resultOverlay: document.querySelector('#resultOverlay'),
  resultKicker: document.querySelector('#resultKicker'),
  resultTitle: document.querySelector('#resultTitle'),
  resultText: document.querySelector('#resultText'),
  resultScore: document.querySelector('#resultScore'),
  nextRoundButton: document.querySelector('#nextRoundButton'),
  resultHomeButton: document.querySelector('#resultHomeButton'),
  toast: document.querySelector('#toast'),
  difficultyButtons: [...document.querySelectorAll('[data-ai-difficulty]')]
};

let state = loadState();
let screen = 'home';
let difficultyPurpose = 'new';
const ui = {
  mode: 'move',
  selectedSlot: null,
  selectedDir: null,
  legalMoves: [],
  availableSlots: [],
  aiThinking: false,
  aiTimer: null
};

const settings = loadSettings();
elements.soundToggle.checked = settings.sound;
elements.hapticsToggle.checked = settings.haptics;

function loadSettings() {
  try {
    return {
      sound: true,
      haptics: true,
      preferredDifficulty: 'strategist',
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    };
  } catch {
    return { sound: true, haptics: true, preferredDifficulty: 'strategist' };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadState() {
  const loaded = hydrateState(localStorage.getItem(STORAGE_KEY));
  if (!loaded) return null;
  loaded.playMode ||= 'local';
  loaded.aiDifficulty ||= 'strategist';
  return loaded;
}

function withSession(next, previous = state) {
  next.playMode = previous?.playMode || 'local';
  next.aiDifficulty = previous?.aiDifficulty || settings.preferredDifficulty || 'strategist';
  return next;
}

function saveState() {
  if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  else localStorage.removeItem(STORAGE_KEY);
  updateContinueButton();
}

function pluralGates(value) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} турникет`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} турникета`;
  return `${value} турникетов`;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, 1700);
}

function vibrate(pattern) {
  if (settings.haptics && 'vibrate' in navigator) navigator.vibrate(pattern);
}

let audioContext = null;
function ensureAudio() {
  if (!settings.sound) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ||= new AudioContextClass();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function tone(frequency, duration, type = 'sine', volume = 0.035, delay = 0) {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function soundStep() {
  tone(180, 0.08, 'triangle', 0.025);
  tone(120, 0.09, 'sine', 0.018, 0.035);
}

function soundGate() {
  tone(255, 0.07, 'square', 0.018);
  tone(172, 0.12, 'triangle', 0.026, 0.04);
}

function soundFlip() {
  tone(420, 0.06, 'square', 0.018);
  tone(260, 0.1, 'triangle', 0.028, 0.055);
}

function soundInvalid() {
  tone(95, 0.16, 'sawtooth', 0.018);
}

function soundVictory() {
  [262, 330, 392, 523].forEach((frequency, index) => tone(frequency, 0.2, 'triangle', 0.035, index * 0.085));
}

function cancelAiTimer() {
  if (ui.aiTimer) clearTimeout(ui.aiTimer);
  ui.aiTimer = null;
  ui.aiThinking = false;
}

function startMatch(playMode, aiDifficulty = settings.preferredDifficulty) {
  if (state?.status === 'playing') {
    const accepted = window.confirm('Текущий матч будет стёрт. Начать новый?');
    if (!accepted) return;
  }
  cancelAiTimer();
  state = createMatch();
  state.playMode = playMode;
  state.aiDifficulty = aiDifficulty;
  ui.mode = 'move';
  ui.selectedSlot = null;
  ui.selectedDir = null;
  saveState();
  showGame();
  vibrate(18);
  soundGate();
}

function showHome() {
  cancelAiTimer();
  screen = 'home';
  elements.homeScreen.hidden = false;
  elements.gameScreen.hidden = true;
  elements.resultOverlay.hidden = true;
  updateContinueButton();
}

function showGame() {
  if (!state) {
    state = createMatch();
    state.playMode = 'local';
    state.aiDifficulty = settings.preferredDifficulty;
  }
  screen = 'game';
  elements.homeScreen.hidden = true;
  elements.gameScreen.hidden = false;
  render();
  maybeScheduleAi();
}

function updateContinueButton() {
  if (!state) {
    elements.continueButton.hidden = true;
    return;
  }
  elements.continueButton.hidden = false;
  const rival = state.playMode === 'ai' ? `против ИИ · ${AI_LABELS[state.aiDifficulty]}` : 'два игрока';
  const status = state.status === 'playing' ? `раунд ${state.round} · ${rival}` : `счёт ${state.scores[0]}:${state.scores[1]} · ${rival}`;
  elements.continueMeta.textContent = status;
}

function isAiTurn() {
  return Boolean(state?.playMode === 'ai' && state.turn === 1 && state.status === 'playing');
}

function canHumanAct() {
  return state?.status === 'playing' && !isAiTurn() && !ui.aiThinking;
}

function setMode(mode) {
  if (!canHumanAct()) return;
  if (mode === 'gate' && state.gatesLeft[state.turn] <= 0) {
    showToast('Турникеты закончились');
    soundInvalid();
    vibrate([12, 40, 12]);
    return;
  }
  ui.mode = mode;
  ui.selectedSlot = null;
  ui.selectedDir = null;
  render();
}

function playerName(player) {
  if (state?.playMode === 'ai' && player === 1) return 'ИИ';
  return `Игрок ${player + 1}`;
}

function lastActionText() {
  if (!state.lastAction) return `${playerName(state.starter)} начинает ${state.starter === 0 ? 'снизу' : 'сверху'}`;
  const action = state.lastAction;
  if (action.type === 'gate') {
    return `${playerName(action.player)} поставил ворота: ${directionLabel(action.gate, action.gate.dir).toLowerCase()}`;
  }
  const flipPart = action.flippedGateIds.length ? ` · перевёрнуто ворот: ${action.flippedGateIds.length}` : '';
  const moveName = action.kind === 'jump' ? 'перепрыгнул соперника' : action.kind === 'diagonal' ? 'обошёл соперника' : 'сделал ход';
  return `${playerName(action.player)} ${moveName}${flipPart}`;
}

function renderScore(container, score) {
  container.innerHTML = Array.from({ length: MATCH_TARGET }, (_, index) => `<i class="${index < score ? 'filled' : ''}"></i>`).join('');
}

function render() {
  if (!state) return;
  const player = state.turn;
  const aiTurn = isAiTurn();
  elements.gameScreen.classList.toggle('player-1', player === 1);
  elements.gameScreen.classList.toggle('ai-thinking', ui.aiThinking);
  elements.player0Panel.classList.toggle('active', player === 0 && state.status === 'playing');
  elements.player1Panel.classList.toggle('active', player === 1 && state.status === 'playing');
  elements.player1Name.textContent = state.playMode === 'ai' ? 'ИИ' : 'ИГРОК 2';
  renderScore(elements.score0, state.scores[0]);
  renderScore(elements.score1, state.scores[1]);
  elements.gates0.textContent = pluralGates(state.gatesLeft[0]);
  elements.gates1.textContent = pluralGates(state.gatesLeft[1]);
  elements.roundNumber.textContent = state.round;
  elements.turnDot.style.background = player === 0 ? COLORS.orange : COLORS.blue;
  elements.turnDot.style.boxShadow = player === 0 ? '0 0 0 5px rgba(219,90,58,.13)' : '0 0 0 5px rgba(41,124,138,.13)';
  elements.turnTitle.textContent = aiTurn ? `ХОД ИИ · ${AI_LABELS[state.aiDifficulty]}` : `ХОД ИГРОКА ${player + 1}`;
  elements.turnHint.textContent = ui.aiThinking
    ? 'Просчитывает маршруты и перевороты'
    : ui.mode === 'move' ? 'Выберите подсвеченную клетку' : 'Выберите щель между четырьмя клетками';
  elements.gateModeMeta.textContent = `осталось ${state.gatesLeft[player]}`;
  elements.moveModeButton.disabled = !canHumanAct();
  elements.gateModeButton.disabled = !canHumanAct() || state.gatesLeft[player] <= 0;
  elements.moveModeButton.classList.toggle('active', ui.mode === 'move');
  elements.gateModeButton.classList.toggle('active', ui.mode === 'gate');
  elements.moveModeButton.setAttribute('aria-pressed', String(ui.mode === 'move'));
  elements.gateModeButton.setAttribute('aria-pressed', String(ui.mode === 'gate'));
  elements.board.setAttribute('aria-busy', String(ui.aiThinking));
  elements.lastAction.textContent = ui.aiThinking ? 'ИИ перебирает маршруты…' : lastActionText();
  elements.difficultySettingButton.hidden = state.playMode !== 'ai';
  if (state.playMode === 'ai') elements.difficultySettingButton.textContent = `СЛОЖНОСТЬ: ${AI_LABELS[state.aiDifficulty]}`;

  renderBoard();
  renderPlacementPanel();
  renderResult();
  elements.restartRoundButton.disabled = !state || ui.aiThinking;
  elements.resetMatchButton.disabled = !state || ui.aiThinking;
}

function pointForCell(cell) {
  const step = (BOARD_VIEW - BOARD_PADDING * 2) / (state.size - 1);
  return {
    x: BOARD_PADDING + cell.c * step,
    y: BOARD_PADDING + cell.r * step
  };
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

function gateGeometry(gate) {
  const topLeft = pointForCell({ r: gate.r, c: gate.c });
  const bottomRight = pointForCell({ r: gate.r + 1, c: gate.c + 1 });
  if (gate.orientation === 'h') {
    const y = (topLeft.y + bottomRight.y) / 2;
    return {
      x1: topLeft.x - TILE_SIZE / 2,
      y1: y,
      x2: bottomRight.x + TILE_SIZE / 2,
      y2: y,
      arrows: [
        { x: topLeft.x, y, glyph: gate.dir === 1 ? '↓' : '↑' },
        { x: bottomRight.x, y, glyph: gate.dir === 1 ? '↓' : '↑' }
      ],
      caps: [
        { x: topLeft.x - TILE_SIZE / 2, y },
        { x: bottomRight.x + TILE_SIZE / 2, y }
      ]
    };
  }

  const x = (topLeft.x + bottomRight.x) / 2;
  return {
    x1: x,
    y1: topLeft.y - TILE_SIZE / 2,
    x2: x,
    y2: bottomRight.y + TILE_SIZE / 2,
    arrows: [
      { x, y: topLeft.y, glyph: gate.dir === 1 ? '→' : '←' },
      { x, y: bottomRight.y, glyph: gate.dir === 1 ? '→' : '←' }
    ],
    caps: [
      { x, y: topLeft.y - TILE_SIZE / 2 },
      { x, y: bottomRight.y + TILE_SIZE / 2 }
    ]
  };
}

function gateMarkup(gate, classes = '') {
  const geometry = gateGeometry(gate);
  const preview = classes.includes('preview');
  const barColor = preview ? (gate.owner === 1 ? COLORS.blue : COLORS.orange) : COLORS.gate;
  const ownerColor = gate.owner === 1 ? COLORS.blue : COLORS.orange;
  return `
    <g class="gate ${classes}" data-gate-id="${escapeAttribute(gate.id || 'preview')}">
      <line class="gate-bar" x1="${geometry.x1}" y1="${geometry.y1}" x2="${geometry.x2}" y2="${geometry.y2}" stroke="${barColor}" stroke-width="22" stroke-linecap="square" ${preview ? 'stroke-dasharray="16 9"' : ''}></line>
      ${geometry.caps.map((cap) => `<circle cx="${cap.x}" cy="${cap.y}" r="8" fill="${ownerColor}"></circle>`).join('')}
      ${geometry.arrows.map((arrow) => `<text x="${arrow.x}" y="${arrow.y + 1}" fill="${COLORS.paper}" font-size="24" font-weight="900" text-anchor="middle" dominant-baseline="central">${arrow.glyph}</text>`).join('')}
    </g>`;
}

function slotMarkup(slot, index) {
  const geometry = gateGeometry({ ...slot, dir: 1 });
  const centerX = (geometry.x1 + geometry.x2) / 2;
  const centerY = (geometry.y1 + geometry.y2) / 2;
  const markLength = 22;
  const line = slot.orientation === 'h'
    ? `<line x1="${centerX - markLength}" y1="${centerY}" x2="${centerX + markLength}" y2="${centerY}" stroke="${COLORS.grid}" stroke-width="6" stroke-linecap="round"></line>`
    : `<line x1="${centerX}" y1="${centerY - markLength}" x2="${centerX}" y2="${centerY + markLength}" stroke="${COLORS.grid}" stroke-width="6" stroke-linecap="round"></line>`;
  return `<g class="slot" tabindex="0" role="button" aria-label="Поставить ${slot.orientation === 'h' ? 'горизонтальные' : 'вертикальные'} ворота" data-slot-index="${index}">
    <rect x="${centerX - 31}" y="${centerY - 31}" width="62" height="62" fill="#000000" fill-opacity="0.001"></rect>${line}
  </g>`;
}

function renderBoard() {
  const step = (BOARD_VIEW - BOARD_PADDING * 2) / (state.size - 1);
  const parts = [
    `<rect x="0" y="0" width="700" height="700" fill="${COLORS.board}"></rect>`,
    `<text x="350" y="34" fill="${COLORS.ink}" fill-opacity="0.62" font-size="15" font-weight="900" letter-spacing="2" text-anchor="middle">ЦЕЛЬ ИГРОКА 1</text>`,
    `<text x="350" y="682" fill="${COLORS.ink}" fill-opacity="0.62" font-size="15" font-weight="900" letter-spacing="2" text-anchor="middle">ЦЕЛЬ ${state.playMode === 'ai' ? 'ИИ' : 'ИГРОКА 2'}</text>`
  ];

  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      const center = pointForCell({ r, c });
      if (c < state.size - 1) parts.push(`<line x1="${center.x}" y1="${center.y}" x2="${center.x + step}" y2="${center.y}" stroke="${COLORS.grid}" stroke-opacity="0.48" stroke-width="3"></line>`);
      if (r < state.size - 1) parts.push(`<line x1="${center.x}" y1="${center.y}" x2="${center.x}" y2="${center.y + step}" stroke="${COLORS.grid}" stroke-opacity="0.48" stroke-width="3"></line>`);
    }
  }

  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      const center = pointForCell({ r, c });
      parts.push(`<rect x="${center.x - TILE_SIZE / 2}" y="${center.y - TILE_SIZE / 2}" width="${TILE_SIZE}" height="${TILE_SIZE}" rx="7" fill="${COLORS.tile}" stroke="${COLORS.ink}" stroke-opacity="0.28" stroke-width="2"></rect>`);
    }
  }

  if (state.lastAction?.type === 'move') {
    const points = [state.lastAction.from, ...state.lastAction.path].map(pointForCell).map((point) => `${point.x},${point.y}`).join(' ');
    parts.push(`<polyline points="${points}" fill="none" stroke="${COLORS.ink}" stroke-opacity="0.46" stroke-width="7" stroke-linecap="round" stroke-dasharray="10 10"></polyline>`);
  }

  const flippedIds = new Set(state.lastAction?.type === 'move' ? state.lastAction.flippedGateIds : []);
  for (const gate of state.gates) parts.push(gateMarkup(gate, flippedIds.has(gate.id) ? 'flipped' : ''));

  if (ui.mode === 'gate' && canHumanAct()) {
    ui.availableSlots = placementSlots(state);
    ui.availableSlots.forEach((slot, index) => {
      const selected = ui.selectedSlot && slot.r === ui.selectedSlot.r && slot.c === ui.selectedSlot.c && slot.orientation === ui.selectedSlot.orientation;
      if (!selected) parts.push(slotMarkup(slot, index));
    });
    if (ui.selectedSlot) {
      parts.push(gateMarkup({ ...ui.selectedSlot, id: 'preview', dir: ui.selectedDir, owner: state.turn }, 'preview'));
    }
  } else {
    ui.availableSlots = [];
  }

  if (ui.mode === 'move' && canHumanAct()) {
    ui.legalMoves = getLegalMoves(state);
    const targetColor = state.turn === 0 ? COLORS.orange : COLORS.blue;
    ui.legalMoves.forEach((move, index) => {
      const point = pointForCell(move.to);
      parts.push(`<g data-move-index="${index}" role="button" aria-label="Перейти на строку ${move.to.r + 1}, столбец ${move.to.c + 1}" tabindex="0">
        <circle cx="${point.x}" cy="${point.y}" r="34" fill="${targetColor}" fill-opacity="0.13" stroke="${targetColor}" stroke-width="4" stroke-dasharray="7 5"></circle>
        <circle cx="${point.x}" cy="${point.y}" r="7" fill="${targetColor}"></circle>
      </g>`);
    });
  } else {
    ui.legalMoves = [];
  }

  state.pawns.forEach((pawn, player) => {
    const point = pointForCell(pawn);
    const fill = player === 0 ? COLORS.orange : COLORS.blue;
    parts.push(`<circle cx="${point.x}" cy="${point.y}" r="27" fill="${fill}" stroke="${COLORS.paper}" stroke-width="7"></circle>`);
    parts.push(`<text x="${point.x}" y="${point.y + 1}" fill="#ffffff" font-size="18" font-weight="900" text-anchor="middle" dominant-baseline="central">${player === 0 ? 'I' : 'II'}</text>`);
  });

  elements.board.innerHTML = parts.join('');
}

function renderPlacementPanel() {
  const active = ui.mode === 'gate' && canHumanAct();
  elements.placementPanel.hidden = !active;
  if (!active) return;

  if (!ui.selectedSlot) {
    elements.placementKicker.textContent = ui.availableSlots.length ? 'ВЫБЕРИТЕ ЩЕЛЬ НА ПОЛЕ' : 'НЕТ ДОПУСТИМЫХ МЕСТ';
    elements.placementDirection.textContent = ui.availableSlots.length ? 'Тонкие метки показывают доступные позиции' : 'Сделайте ход фишкой';
    elements.rotateGateButton.disabled = true;
    elements.cancelGateButton.disabled = true;
    elements.confirmGateButton.disabled = true;
    return;
  }

  elements.placementKicker.textContent = ui.selectedSlot.orientation === 'h' ? 'ГОРИЗОНТАЛЬНЫЙ ТУРНИКЕТ' : 'ВЕРТИКАЛЬНЫЙ ТУРНИКЕТ';
  elements.placementDirection.textContent = `ПРОПУСКАЕТ ${directionLabel(ui.selectedSlot, ui.selectedDir)}`;
  elements.rotateGateButton.disabled = ui.selectedSlot.legalDirs.length < 2;
  elements.cancelGateButton.disabled = false;
  elements.confirmGateButton.disabled = false;
}

function renderResult() {
  const finished = state.status !== 'playing';
  elements.resultOverlay.hidden = !finished || screen !== 'game';
  if (!finished) return;

  const winner = state.winner;
  const matchOver = state.status === 'match-over';
  elements.resultKicker.textContent = matchOver ? 'МАТЧ ЗАВЕРШЁН' : `РАУНД ${state.round} ЗАВЕРШЁН`;
  elements.resultTitle.textContent = playerName(winner).toUpperCase();
  elements.resultTitle.style.color = winner === 0 ? 'var(--orange-dark)' : 'var(--blue-dark)';
  elements.resultText.textContent = state.winReason === 'locked'
    ? 'Соперник остался без допустимого хода.'
    : 'Фишка достигла противоположного края.';
  elements.resultScore.textContent = `${state.scores[0]} : ${state.scores[1]}`;
  elements.nextRoundButton.textContent = matchOver ? 'НОВЫЙ МАТЧ' : 'СЛЕДУЮЩИЙ РАУНД';
}

function selectSlot(index) {
  if (!canHumanAct()) return;
  const slot = ui.availableSlots[index];
  if (!slot) return;
  ui.selectedSlot = { ...slot };
  const preferred = state.turn === 0 ? -1 : 1;
  ui.selectedDir = slot.legalDirs.includes(preferred) ? preferred : slot.legalDirs[0];
  soundGate();
  vibrate(10);
  render();
}

function rotateSelectedGate() {
  if (!ui.selectedSlot || ui.selectedSlot.legalDirs.length < 2 || !canHumanAct()) return;
  const currentIndex = ui.selectedSlot.legalDirs.indexOf(ui.selectedDir);
  ui.selectedDir = ui.selectedSlot.legalDirs[(currentIndex + 1) % ui.selectedSlot.legalDirs.length];
  soundFlip();
  vibrate(12);
  render();
}

function afterAction() {
  saveState();
  render();
  if (state.status !== 'playing') {
    setTimeout(soundVictory, 100);
    vibrate([35, 45, 35, 45, 70]);
    return;
  }
  maybeScheduleAi();
}

function commitSelectedGate() {
  if (!ui.selectedSlot || !canHumanAct()) return;
  const next = applyGate(state, ui.selectedSlot, ui.selectedDir);
  if (!next) {
    soundInvalid();
    vibrate([10, 35, 10]);
    showToast('Так поставить ворота нельзя');
    return;
  }
  state = withSession(next);
  ui.mode = 'move';
  ui.selectedSlot = null;
  ui.selectedDir = null;
  soundGate();
  vibrate(22);
  afterAction();
}

function commitMove(index) {
  if (!canHumanAct()) return;
  const move = ui.legalMoves[index];
  if (!move) return;
  const next = applyMove(state, move);
  if (!next) {
    soundInvalid();
    vibrate([10, 35, 10]);
    showToast('Этот путь сейчас закрыт');
    return;
  }
  state = withSession(next);
  soundStep();
  if (state.lastAction.flippedGateIds.length) setTimeout(soundFlip, 65);
  vibrate(state.lastAction.flippedGateIds.length ? [15, 35, 25] : 15);
  afterAction();
}

function maybeScheduleAi() {
  if (screen !== 'game' || !isAiTurn() || ui.aiThinking || state.status !== 'playing') return;
  ui.aiThinking = true;
  render();
  const delay = state.aiDifficulty === 'apprentice' ? 420 : state.aiDifficulty === 'strategist' ? 620 : 760;
  ui.aiTimer = setTimeout(() => {
    ui.aiTimer = null;
    const action = chooseAiAction(state, state.aiDifficulty);
    const next = applyAiAction(state, action);
    ui.aiThinking = false;
    if (!next) {
      showToast('ИИ не нашёл допустимого хода');
      render();
      return;
    }
    state = withSession(next);
    if (action.type === 'gate') soundGate();
    else soundStep();
    if (state.lastAction?.flippedGateIds?.length) setTimeout(soundFlip, 65);
    vibrate(action.type === 'gate' ? 22 : 15);
    afterAction();
  }, delay);
}

function handleBoardActivation(target) {
  if (!canHumanAct()) return;
  const moveTarget = target.closest('[data-move-index]');
  if (moveTarget) {
    commitMove(Number(moveTarget.dataset.moveIndex));
    return;
  }
  const slotTarget = target.closest('[data-slot-index]');
  if (slotTarget) selectSlot(Number(slotTarget.dataset.slotIndex));
}

elements.board.addEventListener('click', (event) => handleBoardActivation(event.target));
elements.board.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionable = event.target.closest('[data-move-index], [data-slot-index]');
  if (!actionable) return;
  event.preventDefault();
  handleBoardActivation(actionable);
});

elements.localMatchButton.addEventListener('click', () => startMatch('local'));
elements.aiMatchButton.addEventListener('click', () => {
  difficultyPurpose = 'new';
  openDialog(elements.difficultyDialog);
});
elements.continueButton.addEventListener('click', showGame);
elements.rulesButton.addEventListener('click', () => openDialog(elements.rulesDialog));
elements.settingsButton.addEventListener('click', () => {
  elements.restartRoundButton.hidden = !state;
  elements.resetMatchButton.hidden = !state;
  elements.difficultySettingButton.hidden = !state || state.playMode !== 'ai';
  openDialog(elements.settingsDialog);
});
elements.moveModeButton.addEventListener('click', () => setMode('move'));
elements.gateModeButton.addEventListener('click', () => setMode('gate'));
elements.rotateGateButton.addEventListener('click', rotateSelectedGate);
elements.cancelGateButton.addEventListener('click', () => {
  ui.selectedSlot = null;
  ui.selectedDir = null;
  render();
});
elements.confirmGateButton.addEventListener('click', commitSelectedGate);

elements.difficultyButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const difficulty = button.dataset.aiDifficulty;
    settings.preferredDifficulty = difficulty;
    saveSettings();
    closeDialog(elements.difficultyDialog);
    if (difficultyPurpose === 'new') {
      startMatch('ai', difficulty);
    } else if (state?.playMode === 'ai') {
      state.aiDifficulty = difficulty;
      saveState();
      render();
      showToast(`Сложность: ${AI_LABELS[difficulty]}`);
    }
  });
});

elements.difficultySettingButton.addEventListener('click', () => {
  closeDialog(elements.settingsDialog);
  difficultyPurpose = 'change';
  setTimeout(() => openDialog(elements.difficultyDialog), 80);
});

elements.soundToggle.addEventListener('change', () => {
  settings.sound = elements.soundToggle.checked;
  saveSettings();
  if (settings.sound) soundGate();
});
elements.hapticsToggle.addEventListener('change', () => {
  settings.haptics = elements.hapticsToggle.checked;
  saveSettings();
  vibrate(18);
});

elements.restartRoundButton.addEventListener('click', () => {
  if (!state || ui.aiThinking || !window.confirm('Переиграть текущий раунд? Счёт матча сохранится.')) return;
  state = withSession(restartRound(state));
  ui.mode = 'move';
  ui.selectedSlot = null;
  saveState();
  closeDialog(elements.settingsDialog);
  showGame();
});

elements.resetMatchButton.addEventListener('click', () => {
  if (!state || ui.aiThinking || !window.confirm('Удалить текущий матч и вернуться в меню?')) return;
  cancelAiTimer();
  state = null;
  saveState();
  closeDialog(elements.settingsDialog);
  showHome();
});

elements.openRulesFromSettings.addEventListener('click', () => {
  closeDialog(elements.settingsDialog);
  setTimeout(() => openDialog(elements.rulesDialog), 80);
});

elements.nextRoundButton.addEventListener('click', () => {
  const session = { playMode: state.playMode, aiDifficulty: state.aiDifficulty };
  if (state.status === 'match-over') state = createMatch();
  else state = startNextRound(state);
  state.playMode = session.playMode;
  state.aiDifficulty = session.aiDifficulty;
  ui.mode = 'move';
  ui.selectedSlot = null;
  ui.selectedDir = null;
  saveState();
  render();
  soundGate();
  vibrate(20);
  maybeScheduleAi();
});

elements.resultHomeButton.addEventListener('click', showHome);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && ui.selectedSlot) {
    ui.selectedSlot = null;
    ui.selectedDir = null;
    render();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

updateContinueButton();
showHome();
