import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import { PLAYER, SeamGame, chooseAIMove, shouldClaimOpening } from './engine.js';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:seam:v1';
const SETTINGS_KEY = 'pocket-works:seam:settings';
const VERSION = '1.0.0';
const $ = (selector) => document.querySelector(selector);

const elements = {
  startScreen: $('#startScreen'), gameScreen: $('#gameScreen'), startButton: $('#startButton'), resumeButton: $('#resumeButton'), resumeMeta: $('#resumeMeta'),
  modeChoices: $('#modeChoices'), levelChoices: $('#levelChoices'), levelLine: $('#levelLine'), board: $('#boardCanvas'), boardWrap: $('#boardWrap'), thinking: $('#thinking'), toast: $('#toast'),
  menuButton: $('#menuButton'), undoButton: $('#undoButton'), rulesButton: $('#rulesButton'), rulesStartButton: $('#rulesStartButton'), auditStartButton: $('#auditStartButton'),
  turnPill: $('#turnPill'), turnLabel: $('#turnLabel'), indigoStrip: $('#indigoStrip'), vermilionStrip: $('#vermilionStrip'), indigoStatus: $('#indigoStatus'), vermilionStatus: $('#vermilionStatus'),
  indigoName: $('#indigoName'), vermilionName: $('#vermilionName'), indigoCaptures: $('#indigoCaptures'), vermilionCaptures: $('#vermilionCaptures'),
  swapOffer: $('#swapOffer'), swapButton: $('#swapButton'), declineSwapButton: $('#declineSwapButton'),
  sheetLayer: $('#sheetLayer'), sheetBackdrop: $('#sheetBackdrop'), menuSheet: $('#menuSheet'), rulesSheet: $('#rulesSheet'), auditSheet: $('#auditSheet'), resultSheet: $('#resultSheet'),
  continueButton: $('#continueButton'), newGameButton: $('#newGameButton'), menuRulesButton: $('#menuRulesButton'), menuAuditButton: $('#menuAuditButton'), resignButton: $('#resignButton'),
  soundToggle: $('#soundToggle'), hapticToggle: $('#hapticToggle'), resultTitle: $('#resultTitle'), resultText: $('#resultText'), resultMark: $('#resultMark'), rematchButton: $('#rematchButton'), resultHomeButton: $('#resultHomeButton')
};

let mode = 'ai';
let level = 'club';
let game = null;
let snapshots = [];
let humanPlayer = PLAYER.INDIGO;
let aiPlayer = PLAYER.VERMILION;
let swapDeclined = false;
let localSeatSwap = false;
let aiBusy = false;
let resignArmed = false;
let newGameArmed = false;
let geometry = null;
let particles = [];
let animationFrame = 0;
let settings = loadSettings();
let audioContext = null;

function loadSettings() {
  try { return { sound: true, haptic: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { sound: true, haptic: true }; }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  elements.soundToggle.querySelector('em').textContent = settings.sound ? 'Вкл' : 'Выкл';
  elements.hapticToggle.querySelector('em').textContent = settings.haptic ? 'Вкл' : 'Выкл';
}

function saveGame() {
  if (!game) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: VERSION, mode, level, game: game.toJSON(), snapshots, humanPlayer, aiPlayer, swapDeclined, localSeatSwap
  }));
  refreshResume();
}

function loadSavedGame() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!data?.game || data.version !== VERSION) return false;
    mode = data.mode || 'ai'; level = data.level || 'club'; game = SeamGame.fromJSON(data.game);
    snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
    humanPlayer = data.humanPlayer || PLAYER.INDIGO; aiPlayer = data.aiPlayer || PLAYER.VERMILION;
    swapDeclined = Boolean(data.swapDeclined);
    localSeatSwap = Boolean(data.localSeatSwap);
    syncChoices();
    showGame();
    render();
    maybeAI();
    return true;
  } catch { return false; }
}

function refreshResume() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const available = data?.game && !data.game.winner;
    elements.resumeButton.classList.toggle('hidden', !available);
    if (available) elements.resumeMeta.textContent = `Ход ${data.game.moveNumber + 1} · ${data.mode === 'ai' ? 'против компьютера' : 'вдвоём'}`;
  } catch { elements.resumeButton.classList.add('hidden'); }
}

function syncChoices() {
  for (const button of elements.modeChoices.querySelectorAll('button')) button.classList.toggle('selected', button.dataset.value === mode);
  for (const button of elements.levelChoices.querySelectorAll('button')) button.classList.toggle('selected', button.dataset.value === level);
  elements.levelLine.classList.toggle('hidden', mode !== 'ai');
}

function startGame() {
  game = new SeamGame({ size: 7, pieRule: true });
  snapshots = [];
  humanPlayer = PLAYER.INDIGO;
  aiPlayer = PLAYER.VERMILION;
  swapDeclined = false;
  localSeatSwap = false;
  aiBusy = false;
  particles = [];
  saveGame();
  showGame();
  render();
}

function showGame() {
  elements.menuButton.classList.remove('hidden');
  elements.startScreen.classList.add('hidden');
  elements.gameScreen.classList.remove('hidden');
  requestAnimationFrame(resizeCanvas);
}

function showStart() {
  elements.menuButton.classList.add('hidden');
  closeSheets();
  elements.gameScreen.classList.add('hidden');
  elements.startScreen.classList.remove('hidden');
  refreshResume();
}

function snapshot() {
  return { game: game.toJSON(), humanPlayer, aiPlayer, swapDeclined, localSeatSwap };
}

function restore(entry) {
  game = SeamGame.fromJSON(entry.game);
  humanPlayer = entry.humanPlayer;
  aiPlayer = entry.aiPlayer;
  swapDeclined = entry.swapDeclined;
  localSeatSwap = Boolean(entry.localSeatSwap);
}

function performMove(index, actor = 'human') {
  if (!game || game.winner || aiBusy) return;
  snapshots.push(snapshot());
  const result = game.play(index);
  if (!result.ok) {
    snapshots.pop();
    showToast(result.reason === 'suicide' ? 'У группы не останется свобод' : result.reason === 'superko' ? 'Эта позиция уже была' : 'Сюда нельзя');
    buzz('error');
    return;
  }
  playSound(result.captured.length ? 'capture' : 'place', result.player);
  buzz(result.captured.length ? 'capture' : 'place');
  spawnCaptureParticles(result.captured);
  swapDeclined = false;
  saveGame();
  render();
  if (result.winner) {
    setTimeout(showResult, 480);
    return;
  }
  if (actor === 'human') maybeAI();
}

function maybeAI() {
  if (!game || mode !== 'ai' || game.winner || game.turn !== aiPlayer || aiBusy) return;
  aiBusy = true;
  elements.thinking.classList.remove('hidden');
  renderStatus();
  setTimeout(() => {
    if (game.canClaimOpening() && shouldClaimOpening(game, level)) {
      snapshots.push(snapshot());
      game.claimOpening();
      [humanPlayer, aiPlayer] = [aiPlayer, humanPlayer];
      swapDeclined = true;
      playSound('swap'); buzz('capture');
      showToast('Компьютер забрал Индиго');
      aiBusy = false;
      elements.thinking.classList.add('hidden');
      saveGame(); render();
      return;
    }
    if (game.canClaimOpening()) swapDeclined = true;
    const move = chooseAIMove(game, level);
    aiBusy = false;
    elements.thinking.classList.add('hidden');
    if (move >= 0) performMove(move, 'ai');
  }, level === 'sharp' ? 520 : 360);
}

function claimOpening() {
  if (!game?.canClaimOpening()) return;
  snapshots.push(snapshot());
  game.claimOpening();
  if (mode === 'ai') [humanPlayer, aiPlayer] = [aiPlayer, humanPlayer];
  else localSeatSwap = !localSeatSwap;
  swapDeclined = true;
  playSound('swap'); buzz('capture');
  saveGame(); render(); maybeAI();
}

function declineSwap() {
  swapDeclined = true;
  game.swapAvailable = false;
  saveGame(); render(); maybeAI();
}

function undo() {
  if (!game || aiBusy || snapshots.length === 0) return;
  let entry = snapshots.pop();
  restore(entry);
  if (mode === 'ai' && game.turn !== humanPlayer && snapshots.length) {
    entry = snapshots.pop();
    restore(entry);
  }
  game.winner = 0; game.winReason = ''; game.winningPath = [];
  saveGame(); render();
}


function confirmNewGame() {
  if (!newGameArmed) {
    newGameArmed = true;
    elements.newGameButton.querySelector('small').textContent = 'Нажмите ещё раз — сохранение будет заменено';
    setTimeout(() => {
      newGameArmed = false;
      elements.newGameButton.querySelector('small').textContent = 'Заменит текущую сохранённую позицию';
    }, 2600);
    return;
  }
  newGameArmed = false;
  closeSheets();
  startGame();
}

function resign() {
  if (!game || game.winner) return;
  if (!resignArmed) {
    resignArmed = true;
    elements.resignButton.querySelector('small').textContent = 'Нажмите ещё раз, чтобы закончить';
    setTimeout(() => {
      resignArmed = false;
      elements.resignButton.querySelector('small').textContent = 'Потребуется второе нажатие';
    }, 2600);
    return;
  }
  game.winner = 3 - game.turn;
  game.winReason = 'resign';
  game.winningPath = [];
  saveGame(); closeSheets(); showResult();
}

function showResult() {
  const name = game.winner === PLAYER.INDIGO ? 'Индиго' : 'Киноварь';
  elements.resultTitle.textContent = `${name} победил`;
  elements.resultText.textContent = game.winReason === 'resign'
    ? 'Соперник признал, что дальше будет только хуже.'
    : game.winner === PLAYER.INDIGO ? 'Цепь соединила верхний и нижний края.' : 'Цепь соединила левый и правый края.';
  elements.resultMark.className = `player-mark ${game.winner === PLAYER.INDIGO ? 'indigo' : 'vermilion'}`;
  openSheet(elements.resultSheet);
}

function render() {
  renderStatus();
  drawBoard();
  const canHumanSwap = game?.canClaimOpening() && !swapDeclined && (mode === 'local' || game.turn === humanPlayer);
  elements.swapOffer.classList.toggle('hidden', !canHumanSwap);
  elements.undoButton.disabled = !snapshots.length || aiBusy;
}

function renderStatus() {
  if (!game) return;
  const isIndigo = game.turn === PLAYER.INDIGO;
  elements.indigoStrip.classList.toggle('active', isIndigo && !game.winner);
  elements.vermilionStrip.classList.toggle('active', !isIndigo && !game.winner);
  elements.indigoCaptures.textContent = game.captures[PLAYER.INDIGO];
  elements.vermilionCaptures.textContent = game.captures[PLAYER.VERMILION];
  elements.turnLabel.textContent = game.winner ? 'Партия окончена' : `Ход ${isIndigo ? 'Индиго' : 'Киновари'}`;
  elements.turnPill.querySelector('.turn-dot').className = `turn-dot ${isIndigo ? 'indigo' : 'vermilion'}`;

  if (mode === 'ai') {
    elements.indigoName.textContent = humanPlayer === PLAYER.INDIGO ? 'Вы · Индиго' : 'Компьютер · Индиго';
    elements.vermilionName.textContent = humanPlayer === PLAYER.VERMILION ? 'Вы · Киноварь' : 'Компьютер · Киноварь';
  } else {
    elements.indigoName.textContent = `${localSeatSwap ? 'Игрок 2' : 'Игрок 1'} · Индиго`;
    elements.vermilionName.textContent = `${localSeatSwap ? 'Игрок 1' : 'Игрок 2'} · Киноварь`;
  }
  const statusFor = (player) => {
    if (game.winner) return game.winner === player ? 'Победа' : 'Поражение';
    if (aiBusy && player === aiPlayer) return 'Думает';
    return game.turn === player ? (mode === 'ai' && player === humanPlayer ? 'Ваш ход' : 'Ходит') : 'Ждёт хода';
  };
  elements.indigoStatus.textContent = statusFor(PLAYER.INDIGO);
  elements.vermilionStatus.textContent = statusFor(PLAYER.VERMILION);
}

function resizeCanvas() {
  const rect = elements.boardWrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  elements.board.width = Math.max(1, Math.round(rect.width * dpr));
  elements.board.height = Math.max(1, Math.round(rect.height * dpr));
  elements.board.style.width = `${rect.width}px`;
  elements.board.style.height = `${rect.height}px`;
  const ctx = elements.board.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  geometry = computeGeometry(rect.width, rect.height);
  drawBoard();
}

function computeGeometry(width, height) {
  const n = 7;
  const maxStepByWidth = (width - 56) / ((n - 1) * 1.5);
  const maxStepByHeight = (height - 58) / ((n - 1) * 0.866);
  const step = Math.max(20, Math.min(50, maxStepByWidth, maxStepByHeight));
  const boardWidth = step * (n - 1) * 1.5;
  const boardHeight = step * (n - 1) * 0.866;
  return { step, radius: Math.min(16, step * .31), ox: (width - boardWidth) / 2, oy: (height - boardHeight) / 2, width, height };
}

function pointFor(index) {
  const [row, column] = game.coordinates(index);
  return { x: geometry.ox + (column + row * .5) * geometry.step, y: geometry.oy + row * geometry.step * .866 };
}

function drawBoard() {
  if (!game || !geometry) return;
  const ctx = elements.board.getContext('2d');
  ctx.clearRect(0, 0, geometry.width, geometry.height);
  const points = game.board.map((_, index) => pointFor(index));
  ctx.lineCap = 'round';

  drawEdgeThreads(ctx, points);
  ctx.strokeStyle = 'rgba(83, 72, 55, .30)';
  ctx.lineWidth = 1.2;
  for (let index = 0; index < game.board.length; index += 1) {
    const a = points[index];
    for (const next of game.neighbors(index)) {
      if (next < index) continue;
      const b = points[next];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  if (game.winningPath.length) {
    ctx.strokeStyle = game.winner === PLAYER.INDIGO ? '#274466' : '#b65338';
    ctx.lineWidth = 8;
    ctx.globalAlpha = .33;
    ctx.beginPath();
    game.winningPath.forEach((index, position) => {
      const point = points[index];
      if (position === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  for (let index = 0; index < game.board.length; index += 1) {
    const point = points[index];
    const value = game.board[index];
    if (!value) {
      ctx.fillStyle = 'rgba(48,45,38,.16)';
      ctx.beginPath(); ctx.arc(point.x, point.y, 2.4, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    drawStone(ctx, point, value, index === game.lastMove, game.winningPath.includes(index));
  }

  drawParticles(ctx);
  if (particles.length) animationFrame = requestAnimationFrame(drawBoard);
}

function drawEdgeThreads(ctx, points) {
  const n = game.size;
  const indigoTop = [points[game.index(0, 0)], points[game.index(0, n - 1)]];
  const indigoBottom = [points[game.index(n - 1, 0)], points[game.index(n - 1, n - 1)]];
  const vermilionLeft = [points[game.index(0, 0)], points[game.index(n - 1, 0)]];
  const vermilionRight = [points[game.index(0, n - 1)], points[game.index(n - 1, n - 1)]];
  const line = (pair, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.globalAlpha = .65;
    ctx.beginPath(); ctx.moveTo(pair[0].x, pair[0].y); ctx.lineTo(pair[1].x, pair[1].y); ctx.stroke(); ctx.globalAlpha = 1;
  };
  line(indigoTop, '#274466'); line(indigoBottom, '#274466'); line(vermilionLeft, '#b65338'); line(vermilionRight, '#b65338');
}

function drawStone(ctx, point, player, last, winning) {
  const radius = geometry.radius + (winning ? 1.8 : 0);
  const gradient = ctx.createRadialGradient(point.x - radius * .35, point.y - radius * .45, radius * .1, point.x, point.y, radius);
  if (player === PLAYER.INDIGO) { gradient.addColorStop(0, '#4f7199'); gradient.addColorStop(.45, '#294b70'); gradient.addColorStop(1, '#172b43'); }
  else { gradient.addColorStop(0, '#dd8060'); gradient.addColorStop(.45, '#b65338'); gradient.addColorStop(1, '#78301f'); }
  ctx.shadowColor = 'rgba(31,27,20,.34)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  if (last) { ctx.strokeStyle = '#fff9e9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(point.x, point.y, radius - 4, 0, Math.PI * 2); ctx.stroke(); }
  if (winning) { ctx.strokeStyle = player === PLAYER.INDIGO ? '#172b43' : '#78301f'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(point.x, point.y, radius + 4, 0, Math.PI * 2); ctx.stroke(); }
}

function spawnCaptureParticles(indices) {
  if (!geometry || !indices.length) return;
  const now = performance.now();
  for (const index of indices) {
    const point = pointFor(index);
    for (let count = 0; count < 7; count += 1) {
      const angle = Math.random() * Math.PI * 2;
      particles.push({ x: point.x, y: point.y, vx: Math.cos(angle) * (12 + Math.random() * 18), vy: Math.sin(angle) * (12 + Math.random() * 18), born: now, life: 420 + Math.random() * 180 });
    }
  }
}

function drawParticles(ctx) {
  const now = performance.now();
  particles = particles.filter((particle) => now - particle.born < particle.life);
  for (const particle of particles) {
    const age = (now - particle.born) / 1000;
    const alpha = 1 - (now - particle.born) / particle.life;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#6f6556';
    ctx.fillRect(particle.x + particle.vx * age, particle.y + particle.vy * age + age * age * 20, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function boardIndexFromPointer(event) {
  if (!geometry || !game) return -1;
  const rect = elements.board.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let best = -1; let distance = geometry.radius * 1.8;
  for (let index = 0; index < game.board.length; index += 1) {
    const point = pointFor(index);
    const current = Math.hypot(point.x - x, point.y - y);
    if (current < distance) { distance = current; best = index; }
  }
  return best;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 1500);
}

function openSheet(sheet) {
  for (const item of [elements.menuSheet, elements.rulesSheet, elements.auditSheet, elements.resultSheet]) item.classList.add('hidden');
  sheet.classList.remove('hidden');
  elements.sheetLayer.classList.remove('hidden');
}

function closeSheets() {
  elements.sheetLayer.classList.add('hidden');
  for (const item of [elements.menuSheet, elements.rulesSheet, elements.auditSheet, elements.resultSheet]) item.classList.add('hidden');
}

function playSound(type, player = PLAYER.INDIGO) {
  if (!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type === 'capture' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(type === 'swap' ? 220 : player === PLAYER.INDIGO ? 165 : 205, now);
    oscillator.frequency.exponentialRampToValueAtTime(type === 'capture' ? 80 : 120, now + (type === 'capture' ? .18 : .08));
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(type === 'capture' ? .16 : .09, now + .008); gain.gain.exponentialRampToValueAtTime(.0001, now + (type === 'capture' ? .2 : .1));
    oscillator.connect(gain).connect(audioContext.destination); oscillator.start(now); oscillator.stop(now + .22);
  } catch {}
}

function buzz(type) {
  if (!settings.haptic || !navigator.vibrate) return;
  navigator.vibrate(type === 'capture' ? [18, 18, 26] : type === 'error' ? [8, 24, 8] : 10);
}

for (const group of [elements.modeChoices, elements.levelChoices]) {
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    if (group === elements.modeChoices) mode = button.dataset.value; else level = button.dataset.value;
    syncChoices(); playSound('place');
  });
}

elements.startButton.addEventListener('click', startGame);
elements.resumeButton.addEventListener('click', loadSavedGame);
elements.board.addEventListener('pointerup', (event) => {
  if (!game || game.winner || aiBusy || (mode === 'ai' && game.turn !== humanPlayer) || (game.canClaimOpening() && !swapDeclined)) return;
  const index = boardIndexFromPointer(event);
  if (index >= 0) performMove(index);
});
elements.menuButton.addEventListener('click', () => game && !elements.gameScreen.classList.contains('hidden') ? openSheet(elements.menuSheet) : showStart());
elements.undoButton.addEventListener('click', undo);
elements.rulesButton.addEventListener('click', () => openSheet(elements.rulesSheet));
elements.rulesStartButton.addEventListener('click', () => openSheet(elements.rulesSheet));
elements.auditStartButton.addEventListener('click', () => openSheet(elements.auditSheet));
elements.swapButton.addEventListener('click', claimOpening);
elements.declineSwapButton.addEventListener('click', declineSwap);
elements.continueButton.addEventListener('click', closeSheets);
elements.newGameButton.addEventListener('click', confirmNewGame);
elements.menuRulesButton.addEventListener('click', () => openSheet(elements.rulesSheet));
elements.menuAuditButton.addEventListener('click', () => openSheet(elements.auditSheet));
elements.resignButton.addEventListener('click', resign);
elements.soundToggle.addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); if (settings.sound) playSound('place'); });
elements.hapticToggle.addEventListener('click', () => { settings.haptic = !settings.haptic; saveSettings(); buzz('place'); });
elements.rematchButton.addEventListener('click', () => { closeSheets(); startGame(); });
elements.resultHomeButton.addEventListener('click', showStart);
elements.sheetBackdrop.addEventListener('click', closeSheets);
for (const button of document.querySelectorAll('[data-close-sheet]')) button.addEventListener('click', closeSheets);
window.addEventListener('resize', resizeCanvas);
new ResizeObserver(resizeCanvas).observe(elements.boardWrap);

createWorkshopMode({
  appName: 'ШОВ', version: VERSION, cachePrefix: 'seam-', storageNamespace: 'pocket-works:seam',
  onReset() { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SETTINGS_KEY); window.location.reload(); }
});
watchConnectivity((online) => { document.documentElement.dataset.network = online ? 'online' : 'offline'; });

saveSettings(); syncChoices(); refreshResume();
elements.menuButton.classList.add('hidden');
