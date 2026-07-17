import {
  applyMove,
  BOARD_SIZE,
  CINNABAR,
  cloneGame,
  createGame,
  EMPTY,
  findWinningPath,
  hydrateGame,
  INDIGO,
  legalMoves,
  otherPlayer,
  replayBoard,
  rowCol
} from './engine.js';
import { chooseMove, shouldSwapOpening } from './ai.js';

const STORAGE_KEY = 'pocket-works:pereplet:v1';
const screens = [...document.querySelectorAll('.screen')];
const canvas = document.querySelector('#boardCanvas');
const ctx = canvas.getContext('2d');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ui = {
  menu: document.querySelector('#menuScreen'), setup: document.querySelector('#setupScreen'), game: document.querySelector('#gameScreen'), rules: document.querySelector('#rulesScreen'), lab: document.querySelector('#labScreen'),
  continueBtn: document.querySelector('#continueBtn'), menuRecord: document.querySelector('#menuRecord'), soundBtn: document.querySelector('#soundBtn'),
  status: document.querySelector('#gameStatus'), turnNumber: document.querySelector('#turnNumber'), indigoThread: document.querySelector('#indigoThread'), cinnabarThread: document.querySelector('#cinnabarThread'), indigoName: document.querySelector('#indigoName'), cinnabarName: document.querySelector('#cinnabarName'), indigoCaptures: document.querySelector('#indigoCaptures'), cinnabarCaptures: document.querySelector('#cinnabarCaptures'), thinking: document.querySelector('#thinking'),
  swapModal: document.querySelector('#swapModal'), confirmModal: document.querySelector('#confirmModal'), confirmTitle: document.querySelector('#confirmTitle'), confirmText: document.querySelector('#confirmText'), resultModal: document.querySelector('#resultModal'),
  resultKicker: document.querySelector('#resultKicker'), resultTitle: document.querySelector('#resultTitle'), resultText: document.querySelector('#resultText'), resultTurns: document.querySelector('#resultTurns'), resultCaptures: document.querySelector('#resultCaptures'), replaySlider: document.querySelector('#replaySlider'), replayLabel: document.querySelector('#replayLabel'),
  toast: document.querySelector('#toast')
};

const defaultState = {
  sound: true,
  haptics: true,
  difficulty: 'club',
  botStyle: 'adaptive',
  humanFirst: true,
  mode: null,
  game: null,
  colorSeat: { 1: 'A', 2: 'B' },
  seats: { A: { type: 'human', label: 'Ты' }, B: { type: 'bot', label: 'Станок' } },
  swapResolved: false,
  stats: { botGames: 0, botWins: 0, botLosses: 0, streak: 0 },
  replayStep: null,
  previousScreen: 'menu'
};

let state = loadState();
let boardRect = null;
let hoverIndex = null;
let placementPulse = null;
let captureEffects = [];
let winStartedAt = 0;
let renderScheduled = false;
let botTimer = 0;
let confirmAction = null;
let audioContext = null;
let toastTimer = 0;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(defaultState);
    const merged = { ...structuredClone(defaultState), ...saved };
    merged.stats = { ...defaultState.stats, ...(saved.stats || {}) };
    merged.game = hydrateGame(saved.game);
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast('Сохранение недоступно');
  }
}

function showScreen(name) {
  const map = { menu: ui.menu, setup: ui.setup, game: ui.game, rules: ui.rules, lab: ui.lab };
  screens.forEach((screen) => screen.classList.toggle('active', screen === map[name]));
  if (name !== 'rules') state.previousScreen = name;
  if (name === 'game') {
    requestAnimationFrame(resizeCanvas);
    renderGameUI();
  }
  if (name === 'menu') renderMenu();
}

function actorForColor(player) {
  return state.seats[state.colorSeat[player]];
}

function colorName(player) {
  return player === INDIGO ? 'Индиго' : 'Киноварь';
}

function renderMenu() {
  const savedPlayable = state.game && !state.game.winner && state.mode;
  ui.continueBtn.hidden = !savedPlayable;
  ui.menuRecord.textContent = `Матчей против бота: ${state.stats.botGames} · побед: ${state.stats.botWins}`;
  ui.soundBtn.setAttribute('aria-pressed', String(state.sound));
}

function startGame(mode, options = {}) {
  clearTimeout(botTimer);
  state.mode = mode;
  state.game = createGame({ size: BOARD_SIZE });
  state.swapResolved = false;
  state.replayStep = null;
  if (mode === 'bot') {
    state.humanFirst = options.humanFirst ?? state.humanFirst;
    state.seats = { A: { type: 'human', label: 'Ты' }, B: { type: 'bot', label: botLabel() } };
    state.colorSeat = state.humanFirst ? { 1: 'A', 2: 'B' } : { 1: 'B', 2: 'A' };
  } else {
    state.seats = { A: { type: 'human', label: 'Игрок 1' }, B: { type: 'human', label: 'Игрок 2' } };
    state.colorSeat = { 1: 'A', 2: 'B' };
  }
  saveState();
  closeAllModals();
  showScreen('game');
  announceTurn();
  maybeRunBot();
}

function botLabel() {
  return ({ weave: 'Плетельщик', cut: 'Резчик', guard: 'Страж', adaptive: 'Станок' })[state.botStyle] || 'Станок';
}

function renderGameUI() {
  if (!state.game) return;
  const game = state.game;
  ui.turnNumber.textContent = String(game.turn + 1);
  ui.indigoThread.classList.toggle('active', !game.winner && game.currentPlayer === INDIGO);
  ui.cinnabarThread.classList.toggle('active', !game.winner && game.currentPlayer === CINNABAR);
  ui.indigoName.textContent = `${actorForColor(INDIGO).label} · ИНДИГО`;
  ui.cinnabarName.textContent = `${actorForColor(CINNABAR).label} · КИНОВАРЬ`;
  ui.indigoCaptures.textContent = `${game.captures[INDIGO]} срезано`;
  ui.cinnabarCaptures.textContent = `${game.captures[CINNABAR]} срезано`;
  requestRender();
}

function announceTurn() {
  if (!state.game || state.game.winner) return;
  const player = state.game.currentPlayer;
  const actor = actorForColor(player);
  const target = player === INDIGO ? 'соединяет левый и правый край' : 'соединяет верхний и нижний край';
  ui.status.textContent = actor.type === 'bot' ? `${actor.label} ищет ход` : `${actor.label}: ${target}`;
  renderGameUI();
}

function currentActorIsHuman() {
  return state.game && actorForColor(state.game.currentPlayer).type === 'human';
}

function handleBoardMove(index) {
  if (!state.game || state.game.winner || !currentActorIsHuman() || !ui.swapModal.hidden || !ui.resultModal.hidden) return;
  const result = applyMove(state.game, index);
  if (!result.legal) {
    const text = ({ occupied: 'Клетка уже занята', suicide: 'Этот узел задушит собственную группу', repeat: 'Нельзя вернуть уже бывшую позицию' })[result.reason] || 'Ход недоступен';
    showToast(text);
    feedback('invalid');
    return;
  }
  afterMove(result);
}

function afterMove(result) {
  placementPulse = { index: state.game.lastMove, start: performance.now() };
  captureEffects = result.captured.map((index, order) => ({ index, start: performance.now() + order * 35, seed: Math.random() }));
  feedback(result.captured.length ? 'capture' : 'place');
  saveState();
  renderGameUI();
  if (state.game.winner) {
    finishGame();
    return;
  }
  handleSwapWindow();
}

function handleSwapWindow() {
  if (state.game.moveHistory.length === 1 && !state.swapResolved && state.game.currentPlayer === CINNABAR) {
    const actor = actorForColor(CINNABAR);
    if (actor.type === 'bot') {
      const swap = shouldSwapOpening(state.game, state.botStyle);
      state.swapResolved = true;
      if (swap) {
        swapSeats();
        showToast(`${actor.label} забрал сторону Индиго`);
      }
      saveState();
      announceTurn();
      maybeRunBot();
    } else {
      ui.swapModal.hidden = false;
      ui.status.textContent = `${actor.label} решает, менять ли стороны`;
    }
    return;
  }
  if (state.game.moveHistory.length > 1) state.swapResolved = true;
  announceTurn();
  maybeRunBot();
}

function swapSeats() {
  const old = state.colorSeat[INDIGO];
  state.colorSeat[INDIGO] = state.colorSeat[CINNABAR];
  state.colorSeat[CINNABAR] = old;
}

function resolveSwap(accept) {
  if (accept) swapSeats();
  state.swapResolved = true;
  ui.swapModal.hidden = true;
  showToast(accept ? 'Стороны поменялись' : 'Стороны сохранены');
  saveState();
  announceTurn();
  maybeRunBot();
}

function maybeRunBot() {
  clearTimeout(botTimer);
  if (!state.game || state.game.winner || actorForColor(state.game.currentPlayer).type !== 'bot' || !ui.swapModal.hidden) return;
  ui.thinking.hidden = false;
  ui.status.textContent = `${actorForColor(state.game.currentPlayer).label} считает ответы`;
  botTimer = window.setTimeout(() => {
    const move = chooseMove(state.game, { difficulty: state.difficulty, style: state.botStyle });
    ui.thinking.hidden = true;
    if (move === null) {
      showToast('У бота нет допустимых ходов');
      return;
    }
    const result = applyMove(state.game, move);
    afterMove(result);
  }, prefersReducedMotion ? 80 : 380);
}

function finishGame() {
  clearTimeout(botTimer);
  ui.thinking.hidden = true;
  winStartedAt = performance.now();
  const winner = state.game.winner;
  const winnerActor = actorForColor(winner);
  if (state.mode === 'bot') {
    state.stats.botGames += 1;
    if (winnerActor.type === 'human') {
      state.stats.botWins += 1;
      state.stats.streak += 1;
    } else {
      state.stats.botLosses += 1;
      state.stats.streak = 0;
    }
  }
  saveState();
  ui.resultSheetColor = winner;
  document.querySelector('.result-sheet').style.borderTopColor = winner === INDIGO ? '#304a73' : '#a94b3d';
  ui.resultKicker.textContent = state.game.endReason === 'connection' ? 'НИТЬ ЗАМКНУЛАСЬ' : 'ПОЛЕ ЗАТЯНУЛОСЬ';
  ui.resultTitle.textContent = `${winnerActor.label}: победа ${colorName(winner)}`;
  ui.resultText.textContent = state.game.endReason === 'connection'
    ? `${colorName(winner)} соединила свои противоположные края непрерывной нитью.`
    : `${colorName(winner)} выиграла по кратчайшему незавершённому пути и захватам.`;
  ui.resultTurns.textContent = String(state.game.turn);
  ui.resultCaptures.textContent = String(state.game.captures[INDIGO] + state.game.captures[CINNABAR]);
  ui.replaySlider.max = String(state.game.moveHistory.length);
  ui.replaySlider.value = String(state.game.moveHistory.length);
  state.replayStep = state.game.moveHistory.length;
  updateReplayLabel();
  window.setTimeout(() => { ui.resultModal.hidden = false; }, prefersReducedMotion ? 50 : 650);
  feedback('win');
  requestRender();
}

function setReplayStep(step) {
  if (!state.game) return;
  state.replayStep = Math.max(0, Math.min(Number(step), state.game.moveHistory.length));
  ui.replaySlider.value = String(state.replayStep);
  updateReplayLabel();
  requestRender();
}

function updateReplayLabel() {
  if (!state.game) return;
  ui.replayLabel.textContent = state.replayStep === state.game.moveHistory.length ? 'ФИНАЛ' : `ХОД ${state.replayStep}`;
}

function displayedBoard() {
  if (!state.game) return Array(BOARD_SIZE * BOARD_SIZE).fill(EMPTY);
  if (state.replayStep === null || state.replayStep === state.game.moveHistory.length) return state.game.board;
  return replayBoard(state.game, state.replayStep);
}

function resizeCanvas() {
  const wrap = document.querySelector('#boardWrap').getBoundingClientRect();
  const size = Math.max(180, Math.floor(Math.min(wrap.width, wrap.height)));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  boardRect = { size, margin: Math.max(34, size * .095), board: size - Math.max(68, size * .19) };
  requestRender();
}

function requestRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(drawBoard);
}

function drawBoard(time) {
  renderScheduled = false;
  if (!boardRect || !state.game || !ui.game.classList.contains('active')) return;
  const { size, margin, board } = boardRect;
  ctx.clearRect(0, 0, size, size);
  drawLinen(size);
  const cell = board / BOARD_SIZE;

  ctx.fillStyle = 'rgba(48,74,115,.15)';
  ctx.fillRect(0, margin, margin - 5, board);
  ctx.fillRect(margin + board + 5, margin, margin - 5, board);
  ctx.fillStyle = 'rgba(169,75,61,.15)';
  ctx.fillRect(margin, 0, board, margin - 5);
  ctx.fillRect(margin, margin + board + 5, board, margin - 5);

  ctx.strokeStyle = 'rgba(43,42,37,.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= BOARD_SIZE; i += 1) {
    const p = margin + i * cell;
    ctx.beginPath(); ctx.moveTo(margin, p); ctx.lineTo(margin + board, p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, margin); ctx.lineTo(p, margin + board); ctx.stroke();
  }

  const boardData = displayedBoard();
  drawThreads(boardData, cell, margin);
  if (hoverIndex !== null && currentActorIsHuman() && state.replayStep === null && !state.game.winner) drawPreview(hoverIndex, cell, margin);
  for (let index = 0; index < boardData.length; index += 1) if (boardData[index]) drawKnot(index, boardData[index], cell, margin, time);
  drawEffects(cell, margin, time);

  const animate = captureEffects.length > 0 || (placementPulse && time - placementPulse.start < 420) || (state.game.winner && !prefersReducedMotion && time - winStartedAt < 5000);
  if (animate) requestRender();
}

function drawLinen(size) {
  ctx.fillStyle = '#ded2b9'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(70,58,42,.045)'; ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 6) { ctx.beginPath(); ctx.moveTo(0, i + .5); ctx.lineTo(size, i + .5); ctx.stroke(); }
  for (let i = 0; i < size; i += 8) { ctx.beginPath(); ctx.moveTo(i + .5, 0); ctx.lineTo(i + .5, size); ctx.stroke(); }
}

function cellCenter(index, cell, margin) {
  const [row, col] = rowCol(index, BOARD_SIZE);
  return [margin + (col + .5) * cell, margin + (row + .5) * cell];
}

function drawThreads(boardData, cell, margin) {
  for (let index = 0; index < boardData.length; index += 1) {
    const player = boardData[index];
    if (!player) continue;
    const [row, col] = rowCol(index, BOARD_SIZE);
    const [x, y] = cellCenter(index, cell, margin);
    const pairs = [[row + 1, col], [row, col + 1]];
    for (const [nr, nc] of pairs) {
      if (nr >= BOARD_SIZE || nc >= BOARD_SIZE) continue;
      const next = nr * BOARD_SIZE + nc;
      if (boardData[next] !== player) continue;
      const [nx, ny] = cellCenter(next, cell, margin);
      ctx.strokeStyle = player === INDIGO ? '#304a73' : '#a94b3d';
      ctx.lineWidth = Math.max(7, cell * .16); ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      ctx.strokeStyle = 'rgba(245,239,223,.35)'; ctx.lineWidth = Math.max(1, cell * .035);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    }
  }
}

function drawKnot(index, player, cell, margin, time) {
  const [x, y] = cellCenter(index, cell, margin);
  let scale = 1;
  if (placementPulse?.index === index) {
    const progress = Math.min(1, (time - placementPulse.start) / 360);
    scale = 1 + Math.sin(progress * Math.PI) * .22;
    if (progress >= 1) placementPulse = null;
  }
  const winning = state.game?.winningPath?.includes(index) && state.replayStep === state.game.moveHistory.length;
  const pulse = winning && !prefersReducedMotion ? 1 + Math.sin((time - winStartedAt) / 170) * .06 : 1;
  const radius = cell * .28 * scale * pulse;
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = player === INDIGO ? '#304a73' : '#a94b3d';
  ctx.strokeStyle = winning ? '#f7f0df' : player === INDIGO ? '#1e3150' : '#763128';
  ctx.lineWidth = winning ? 4 : 2;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2); ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.38)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-radius * .6, -radius); ctx.lineTo(radius, radius * .6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(radius * .6, -radius); ctx.lineTo(-radius, radius * .6); ctx.stroke();
  ctx.restore();
}

function drawPreview(index, cell, margin) {
  if (!state.game || state.game.board[index] !== EMPTY) return;
  const [x, y] = cellCenter(index, cell, margin);
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = state.game.currentPlayer === INDIGO ? 'rgba(48,74,115,.55)' : 'rgba(169,75,61,.55)';
  ctx.setLineDash([4, 4]); ctx.lineWidth = 2; const r = cell * .24; ctx.strokeRect(-r, -r, r * 2, r * 2); ctx.restore();
}

function drawEffects(cell, margin, time) {
  captureEffects = captureEffects.filter((effect) => time - effect.start < 620);
  for (const effect of captureEffects) {
    const age = Math.max(0, time - effect.start); const p = age / 620;
    const [x, y] = cellCenter(effect.index, cell, margin);
    ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#5c5142'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      const angle = effect.seed * 6 + i * 1.25;
      const length = cell * (.15 + p * .45);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length); ctx.stroke();
    }
    ctx.restore();
  }
}

function pointerIndex(event) {
  if (!boardRect) return null;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left - boardRect.margin;
  const y = event.clientY - rect.top - boardRect.margin;
  if (x < 0 || y < 0 || x >= boardRect.board || y >= boardRect.board) return null;
  const col = Math.floor(x / (boardRect.board / BOARD_SIZE));
  const row = Math.floor(y / (boardRect.board / BOARD_SIZE));
  return row * BOARD_SIZE + col;
}

function feedback(type) {
  if (state.haptics && navigator.vibrate) {
    const pattern = type === 'capture' ? [16, 30, 18] : type === 'win' ? [22, 35, 22, 35, 40] : type === 'invalid' ? [8, 18, 8] : [10];
    navigator.vibrate(pattern);
  }
  if (!state.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const notes = type === 'capture' ? [180, 115] : type === 'win' ? [220, 330, 440] : type === 'invalid' ? [90] : [260];
    notes.forEach((frequency, i) => {
      const osc = audioContext.createOscillator(); const gain = audioContext.createGain();
      osc.type = type === 'capture' ? 'triangle' : 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, now + i * .07); gain.gain.exponentialRampToValueAtTime(.055, now + i * .07 + .01); gain.gain.exponentialRampToValueAtTime(.0001, now + i * .07 + .11);
      osc.connect(gain).connect(audioContext.destination); osc.start(now + i * .07); osc.stop(now + i * .07 + .12);
    });
  } catch { /* audio is optional */ }
}

function showToast(text) {
  clearTimeout(toastTimer); ui.toast.textContent = text; ui.toast.classList.add('show');
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('show'), 1900);
}

function closeAllModals() {
  ui.swapModal.hidden = true; ui.confirmModal.hidden = true; ui.resultModal.hidden = true;
}

function askConfirm(title, text, action) {
  ui.confirmTitle.textContent = title; ui.confirmText.textContent = text; confirmAction = action; ui.confirmModal.hidden = false;
}

function returnToMenu() {
  clearTimeout(botTimer); ui.thinking.hidden = true; closeAllModals(); state.replayStep = null; showScreen('menu'); saveState();
}

function bindControls() {
  document.querySelector('#botModeBtn').addEventListener('click', () => showScreen('setup'));
  document.querySelector('#localModeBtn').addEventListener('click', () => startGame('local'));
  ui.continueBtn.addEventListener('click', () => { closeAllModals(); state.replayStep = null; showScreen('game'); announceTurn(); handleSwapWindow(); });
  document.querySelector('#rulesBtn').addEventListener('click', () => { state.previousScreen = 'menu'; showScreen('rules'); });
  document.querySelector('#labBtn').addEventListener('click', () => showScreen('lab'));
  document.querySelector('#gameRulesBtn').addEventListener('click', () => { state.previousScreen = 'game'; showScreen('rules'); });
  document.querySelector('#rulesPlayBtn').addEventListener('click', () => state.game ? showScreen('game') : showScreen('menu'));
  document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => {
    const target = button.dataset.back === 'previous' ? state.previousScreen : button.dataset.back;
    showScreen(target || 'menu');
  }));
  document.querySelectorAll('[data-difficulty]').forEach((button) => button.addEventListener('click', () => {
    state.difficulty = button.dataset.difficulty; document.querySelectorAll('[data-difficulty]').forEach((item) => item.classList.toggle('selected', item === button));
  }));
  document.querySelectorAll('[data-style]').forEach((button) => button.addEventListener('click', () => {
    state.botStyle = button.dataset.style; document.querySelectorAll('[data-style]').forEach((item) => item.classList.toggle('selected', item === button));
  }));
  document.querySelector('#humanFirstBtn').addEventListener('click', () => setFirst(true));
  document.querySelector('#botFirstBtn').addEventListener('click', () => setFirst(false));
  document.querySelector('#startBotBtn').addEventListener('click', () => startGame('bot', { humanFirst: state.humanFirst }));
  ui.soundBtn.addEventListener('click', () => { state.sound = !state.sound; ui.soundBtn.setAttribute('aria-pressed', String(state.sound)); saveState(); feedback('place'); });
  document.querySelector('#acceptSwapBtn').addEventListener('click', () => resolveSwap(true));
  document.querySelector('#declineSwapBtn').addEventListener('click', () => resolveSwap(false));
  document.querySelector('#resignBtn').addEventListener('click', () => askConfirm('Сдаться?', 'Победа будет отдана сопернику.', () => {
    state.game.winner = otherPlayer(state.game.currentPlayer); state.game.endReason = 'resign'; state.game.winningPath = findWinningPath(state.game.board, state.game.winner, state.game.size); finishGame();
  }));
  document.querySelector('#restartBtn').addEventListener('click', () => askConfirm('Начать заново?', 'Текущая позиция будет потеряна.', () => startGame(state.mode, { humanFirst: state.humanFirst })));
  document.querySelector('#confirmCancelBtn').addEventListener('click', () => { ui.confirmModal.hidden = true; confirmAction = null; });
  document.querySelector('#confirmOkBtn').addEventListener('click', () => { ui.confirmModal.hidden = true; const action = confirmAction; confirmAction = null; action?.(); });
  document.querySelector('#rematchBtn').addEventListener('click', () => startGame(state.mode, { humanFirst: state.mode === 'bot' ? !state.humanFirst : true }));
  document.querySelector('#resultMenuBtn').addEventListener('click', returnToMenu);
  ui.replaySlider.addEventListener('input', (event) => setReplayStep(event.target.value));
  document.querySelector('#replayPrevBtn').addEventListener('click', () => setReplayStep((state.replayStep ?? state.game.moveHistory.length) - 1));
  document.querySelector('#replayNextBtn').addEventListener('click', () => setReplayStep((state.replayStep ?? 0) + 1));
  canvas.addEventListener('pointermove', (event) => { hoverIndex = pointerIndex(event); requestRender(); });
  canvas.addEventListener('pointerleave', () => { hoverIndex = null; requestRender(); });
  canvas.addEventListener('pointerdown', (event) => { event.preventDefault(); const index = pointerIndex(event); if (index !== null) handleBoardMove(index); });
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { resizeCanvas(); maybeRunBot(); } });
}

function setFirst(humanFirst) {
  state.humanFirst = humanFirst;
  document.querySelector('#humanFirstBtn').classList.toggle('selected', humanFirst);
  document.querySelector('#botFirstBtn').classList.toggle('selected', !humanFirst);
}

bindControls();
renderMenu();
showScreen('menu');
