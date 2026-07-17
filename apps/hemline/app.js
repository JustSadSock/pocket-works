import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  applyAction,
  canClaimOpening,
  coordsOf,
  createInitialState,
  deserializeState,
  indexOf,
  neighborsOf
} from './engine.js';
import { BOT_PERSONAS, chooseBotAction } from './bot.js';

installMobileRuntime();

const store = createVersionedStore({
  namespace: 'pocket-works:hemline',
  version: 1,
  defaults: {
    settings: { sound: true, persona: 'weaver', seenRules: false },
    session: null,
    stats: { games: 0, wins: 0 }
  }
});

const $ = (selector) => document.querySelector(selector);
const menuScreen = $('#menu-screen');
const gameScreen = $('#game-screen');
const canvas = $('#board');
const boardWrap = $('#board-wrap');
const ctx = canvas.getContext('2d');
const rulesDialog = $('#rules-dialog');
const pauseDialog = $('#pause-dialog');
const resultDialog = $('#result-dialog');
const thinkingIndicator = $('#thinking-indicator');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let settings = store.get('settings');
let session = normalizeSession(store.get('session'));
let actionMode = 'place';
let selectedStone = -1;
let centers = [];
let geometry = null;
let botBusy = false;
let audioContext = null;
let effects = [];
let animationFrame = 0;

function normalizeSession(value) {
  if (!value?.state) return null;
  try {
    return { ...value, state: deserializeState(value.state) };
  } catch {
    return null;
  }
}

function persist() {
  store.patch({ settings, session });
}

function showScreen(name) {
  menuScreen.classList.toggle('is-active', name === 'menu');
  gameScreen.classList.toggle('is-active', name === 'game');
  if (name === 'game') requestAnimationFrame(resizeCanvas);
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function setStatus(message) {
  $('#game-status').textContent = message;
}

function playerName(player) {
  if (session?.mode === 'local') return `Игрок ${player}`;
  return player === 1 ? 'Ты' : BOT_PERSONAS[session?.persona || settings.persona].name;
}

function renderPersonas() {
  const grid = $('#persona-grid');
  grid.replaceChildren();
  for (const [key, persona] of Object.entries(BOT_PERSONAS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `persona-card${settings.persona === key ? ' is-active' : ''}`;
    button.dataset.persona = key;
    button.innerHTML = `<b>${persona.name}</b><small>${persona.detail}</small>`;
    button.addEventListener('click', () => {
      settings.persona = key;
      persist();
      renderPersonas();
      updateMenuResume();
      playSound('tap');
    });
    grid.append(button);
  }
}

function updateMenuResume() {
  const button = $('#play-ai-button');
  const title = button.querySelector('span');
  const caption = button.querySelector('small');
  if (session && !session.state.winner) {
    title.textContent = 'Продолжить партию';
    caption.textContent = session.mode === 'ai' ? `Против ${BOT_PERSONAS[session.persona].name}` : 'Два игрока';
  } else {
    title.textContent = 'Против бота';
    caption.textContent = `${BOT_PERSONAS[settings.persona].name} · ${BOT_PERSONAS[settings.persona].detail.toLowerCase()}`;
  }
  $('#sound-button').textContent = `Звук: ${settings.sound ? 'вкл' : 'выкл'}`;
}

function startGame(mode, persona = settings.persona) {
  session = {
    mode,
    persona,
    state: createInitialState(),
    startedAt: Date.now()
  };
  actionMode = 'place';
  selectedStone = -1;
  persist();
  showScreen('game');
  renderGame();
  if (!settings.seenRules) {
    settings.seenRules = true;
    persist();
    setTimeout(() => openDialog(rulesDialog), 250);
  }
}

function resumeGame() {
  if (!session || session.state.winner) return;
  showScreen('game');
  renderGame();
  if (session.mode === 'ai' && session.state.turn === 2) scheduleBot();
}

function renderGame() {
  if (!session) return;
  const state = session.state;
  const persona = BOT_PERSONAS[session.persona || settings.persona];
  $('#mode-label').textContent = session.mode === 'ai' ? `Против ${persona.name}` : 'Локальная дуэль';
  $('#round-label').textContent = `Ход ${state.moveNo + 1}`;
  $('#player-one-name').textContent = playerName(1);
  $('#player-two-name').textContent = playerName(2);
  $('#p1-shifts').textContent = state.shiftsLeft[1];
  $('#p2-shifts').textContent = state.shiftsLeft[2];
  $('#p1-captures').textContent = state.captures[1];
  $('#p2-captures').textContent = state.captures[2];
  $('#player-one-card').classList.toggle('is-turn', state.turn === 1 && !state.winner);
  $('#player-two-card').classList.toggle('is-turn', state.turn === 2 && !state.winner);
  const humanTurn = isHumanTurn();
  $('#turn-text').textContent = state.winner ? 'Финиш' : humanTurn ? `${playerName(state.turn)} ходит` : `${persona.name} думает`;
  $('#place-mode-button').classList.toggle('is-active', actionMode === 'place');
  $('#shift-mode-button').classList.toggle('is-active', actionMode === 'shift');
  $('#shift-mode-button').disabled = state.shiftsLeft[state.turn] <= 0 || !humanTurn;
  $('#shift-caption').textContent = `Осталось ${state.shiftsLeft[state.turn]}`;
  $('#claim-button').hidden = !canClaimOpening(state) || !humanTurn;
  drawBoard(performance.now());
}

function isHumanTurn() {
  return !!session && (session.mode === 'local' || session.state.turn === 1) && !botBusy && !session.state.winner;
}

function resizeCanvas() {
  if (!gameScreen.classList.contains('is-active')) return;
  const rect = boardWrap.getBoundingClientRect();
  const cssWidth = Math.max(260, rect.width);
  const cssHeight = Math.max(260, rect.height);
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const size = session?.state.size || 8;
  const sqrt3 = Math.sqrt(3);
  const radius = Math.max(15, Math.min((cssWidth - 20) / (1.5 * (size - 1) + 2.15), (cssHeight - 18) / (sqrt3 * ((size - 1) * 1.5) + 2.15)));
  const boardWidth = radius * (1.5 * (size - 1) + 2);
  const boardHeight = radius * (sqrt3 * ((size - 1) * 1.5) + 2);
  const offsetX = (cssWidth - boardWidth) / 2 + radius;
  const offsetY = (cssHeight - boardHeight) / 2 + radius;
  geometry = { cssWidth, cssHeight, radius, offsetX, offsetY, sqrt3 };
  centers = [];
  for (let q = 0; q < size; q += 1) {
    for (let r = 0; r < size; r += 1) {
      centers[indexOf(q, r, size)] = {
        x: offsetX + 1.5 * radius * q,
        y: offsetY + sqrt3 * radius * (r + q / 2)
      };
    }
  }
  drawBoard(performance.now());
}

function hexPath(x, y, radius) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 3 * i;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawBoard(now) {
  if (!geometry || !session) return;
  const { cssWidth, cssHeight, radius } = geometry;
  const state = session.state;
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const fabric = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
  fabric.addColorStop(0, '#eee6d2');
  fabric.addColorStop(1, '#d9c9aa');
  ctx.fillStyle = fabric;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = '#6e6048';
  ctx.lineWidth = 1;
  for (let y = 4; y < cssHeight; y += 7) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssWidth, y + 2); ctx.stroke(); }
  ctx.globalAlpha = 1;

  for (let i = 0; i < state.board.length; i += 1) {
    const [q, r] = coordsOf(i, state.size);
    const { x, y } = centers[i];
    const edgeOne = r === 0 || r === state.size - 1;
    const edgeTwo = q === 0 || q === state.size - 1;
    if (edgeOne || edgeTwo) {
      hexPath(x, y, radius * 1.02);
      ctx.fillStyle = edgeOne ? 'rgba(185,100,44,.16)' : 'rgba(50,75,114,.16)';
      ctx.fill();
    }
    hexPath(x, y, radius * 0.88);
    ctx.fillStyle = 'rgba(248,242,226,.42)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(73,63,47,.28)';
    ctx.lineWidth = Math.max(1, radius * 0.055);
    ctx.stroke();
  }

  if (actionMode === 'shift' && selectedStone >= 0) {
    const selected = centers[selectedStone];
    ctx.beginPath();
    ctx.arc(selected.x, selected.y, radius * 0.9, 0, Math.PI * 2);
    ctx.strokeStyle = '#292b2d';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const target of neighborsOf(selectedStone, state.size)) {
      if (state.board[target] !== 0) continue;
      const point = centers[target];
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(41,43,45,.48)';
      ctx.fill();
    }
  }

  for (let i = 0; i < state.board.length; i += 1) {
    const player = state.board[i];
    if (!player) continue;
    drawStone(centers[i].x, centers[i].y, radius * 0.67, player, 1);
  }

  let activeEffects = false;
  for (const effect of effects) {
    const elapsed = now - effect.started;
    const progress = Math.min(1, elapsed / effect.duration);
    if (progress < 1) activeEffects = true;
    const point = centers[effect.index];
    if (!point) continue;
    if (effect.type === 'place') {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * (0.7 + progress * 0.85), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${effect.player === 1 ? '185,100,44' : '50,75,114'},${1 - progress})`;
      ctx.lineWidth = 3 * (1 - progress);
      ctx.stroke();
    } else if (effect.type === 'capture') {
      drawStone(point.x, point.y - progress * radius * 0.65, radius * 0.67 * (1 - progress * 0.45), effect.player, 1 - progress);
    }
  }
  effects = effects.filter((effect) => now - effect.started < effect.duration);
  if (activeEffects && !reduceMotion) animationFrame = requestAnimationFrame(drawBoard);
}

function drawStone(x, y, radius, player, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(42,34,23,.28)';
  ctx.shadowBlur = radius * 0.35;
  ctx.shadowOffsetY = radius * 0.22;
  const gradient = ctx.createRadialGradient(x - radius * .35, y - radius * .4, radius * .1, x, y, radius);
  if (player === 1) { gradient.addColorStop(0, '#e2a06a'); gradient.addColorStop(.45, '#b9642c'); gradient.addColorStop(1, '#733716'); }
  else { gradient.addColorStop(0, '#6f8cad'); gradient.addColorStop(.45, '#324b72'); gradient.addColorStop(1, '#1d2d49'); }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath();
  ctx.arc(x, y, radius * .68, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = Math.max(1, radius * .08);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - radius * .32, y + radius * .08);
  ctx.lineTo(x + radius * .32, y - radius * .08);
  ctx.strokeStyle = 'rgba(255,255,255,.36)';
  ctx.lineWidth = Math.max(1.2, radius * .1);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function nearestCell(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let nearest = -1;
  let distance = Infinity;
  centers.forEach((point, index) => {
    const next = Math.hypot(point.x - x, point.y - y);
    if (next < distance) { distance = next; nearest = index; }
  });
  return distance <= geometry.radius * 1.05 ? nearest : -1;
}

function handleBoardTap(event) {
  if (!isHumanTurn()) return;
  const cell = nearestCell(event.clientX, event.clientY);
  if (cell < 0) return;
  const state = session.state;
  if (actionMode === 'place') {
    if (state.board[cell] !== 0) return invalidFeedback('Эта клетка уже занята.');
    performAction({ type: 'place', to: cell });
    return;
  }
  if (selectedStone < 0) {
    if (state.board[cell] !== state.turn) return invalidFeedback('Сначала выбери свой камень.');
    selectedStone = cell;
    setStatus('Теперь выбери соседнюю пустую клетку.');
    renderGame();
    playSound('tap');
    return;
  }
  if (state.board[cell] === state.turn) {
    selectedStone = cell;
    setStatus('Выбран другой камень.');
    renderGame();
    return;
  }
  if (state.board[cell] !== 0 || !neighborsOf(selectedStone, state.size).includes(cell)) return invalidFeedback('Сдвиг возможен только в соседнюю пустую клетку.');
  performAction({ type: 'shift', from: selectedStone, to: cell });
}

function performAction(action) {
  const before = session.state;
  const result = applyAction(before, action);
  if (!result.ok) return invalidFeedback(result.reason);
  const movingPlayer = before.turn;
  session.state = result.state;
  selectedStone = -1;
  actionMode = 'place';
  const started = performance.now();
  if (action.type === 'place' || action.type === 'shift') effects.push({ type: 'place', index: action.to, player: movingPlayer, started, duration: 420 });
  for (const index of result.captured) effects.push({ type: 'capture', index, player: 3 - movingPlayer, started, duration: 440 });
  persist();
  playSound(result.captured.length ? 'capture' : action.type === 'shift' ? 'shift' : action.type === 'claim' ? 'claim' : 'place');
  if (navigator.vibrate) navigator.vibrate(result.captured.length ? [18, 28, 22] : 12);
  setStatus(result.captured.length ? `Пара снята: ${result.captured.length} камня.` : action.type === 'claim' ? 'Первый камень перехвачен.' : 'Ход принят.');
  renderGame();
  if (result.winner) {
    setTimeout(() => showResult(result.winner), reduceMotion ? 0 : 520);
  } else if (session.mode === 'ai' && session.state.turn === 2) {
    scheduleBot();
  }
}

function scheduleBot() {
  if (botBusy || !session || session.mode !== 'ai' || session.state.turn !== 2 || session.state.winner) return;
  botBusy = true;
  thinkingIndicator.hidden = false;
  renderGame();
  setTimeout(() => {
    const action = chooseBotAction(session.state, session.persona);
    botBusy = false;
    thinkingIndicator.hidden = true;
    if (!action) return invalidFeedback('Бот не нашёл допустимый ход.');
    performAction(action);
  }, reduceMotion ? 40 : 430);
}

function showResult(winner) {
  const state = session.state;
  const humanWon = session.mode === 'local' ? null : winner === 1;
  $('#result-kicker').textContent = 'Путь замкнут';
  $('#result-title').textContent = session.mode === 'local' ? `${playerName(winner)} победил` : humanWon ? 'Победа' : `${playerName(winner)} победил`;
  $('#result-copy').textContent = winner === 1 ? 'Охровый шов дошёл сверху вниз.' : 'Индиговый шов связал левый и правый край.';
  $('#result-moves').textContent = state.moveNo;
  $('#result-captures').textContent = state.captures[winner];
  $('#result-shifts').textContent = 2 - state.shiftsLeft[winner];
  $('#result-emblem').style.background = winner === 1 ? 'var(--ochre)' : 'var(--indigo)';
  const stats = store.get('stats');
  stats.games += 1;
  if (session.mode === 'ai' && winner === 1) stats.wins += 1;
  store.set('stats', stats);
  playSound('win');
  openDialog(resultDialog);
}

function invalidFeedback(message) {
  setStatus(message);
  boardWrap.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: reduceMotion ? 1 : 150 });
  playSound('bad');
}

function playSound(type) {
  if (!settings.sound) return;
  try {
    audioContext ||= new AudioContext();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const map = { tap: [260, .025], place: [180, .055], shift: [240, .07], claim: [140, .1], capture: [110, .13], bad: [80, .05], win: [330, .22] };
    const [frequency, duration] = map[type] || map.tap;
    oscillator.type = type === 'capture' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    if (type === 'win') oscillator.frequency.exponentialRampToValueAtTime(660, now + duration);
    else if (type === 'capture') oscillator.frequency.exponentialRampToValueAtTime(70, now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.055, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  } catch {}
}

$('#play-ai-button').addEventListener('click', () => session && !session.state.winner ? resumeGame() : startGame('ai', settings.persona));
$('#play-local-button').addEventListener('click', () => startGame('local', settings.persona));
$('#rules-button').addEventListener('click', () => openDialog(rulesDialog));
$('#game-rules-button').addEventListener('click', () => openDialog(rulesDialog));
$('#pause-button').addEventListener('click', () => openDialog(pauseDialog));
$('#resume-button').addEventListener('click', () => closeDialog(pauseDialog));
$('#restart-button').addEventListener('click', () => { closeDialog(pauseDialog); startGame(session?.mode || 'ai', session?.persona || settings.persona); });
$('#rematch-button').addEventListener('click', () => { closeDialog(resultDialog); startGame(session?.mode || 'ai', session?.persona || settings.persona); });
$('#menu-button').addEventListener('click', () => { closeDialog(resultDialog); session = null; persist(); updateMenuResume(); showScreen('menu'); });
$('#sound-button').addEventListener('click', () => { settings.sound = !settings.sound; persist(); updateMenuResume(); if (settings.sound) playSound('tap'); });
$('#place-mode-button').addEventListener('click', () => { if (!isHumanTurn()) return; actionMode = 'place'; selectedStone = -1; setStatus('Выбери пустую клетку.'); renderGame(); });
$('#shift-mode-button').addEventListener('click', () => { if (!isHumanTurn() || session.state.shiftsLeft[session.state.turn] <= 0) return; actionMode = 'shift'; selectedStone = -1; setStatus('Выбери свой камень для сдвига.'); renderGame(); });
$('#claim-button').addEventListener('click', () => performAction({ type: 'claim' }));
canvas.addEventListener('pointerdown', handleBoardTap);
window.addEventListener('resize', resizeCanvas);
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));

createWorkshopMode({
  appName: 'ШОВ',
  version: '1.0.0',
  cachePrefix: 'hemline-',
  storageNamespace: 'pocket-works:hemline',
  onReset() {
    store.reset();
    settings = store.get('settings');
    session = null;
    renderPersonas();
    updateMenuResume();
    showScreen('menu');
  }
});

watchConnectivity((online) => { document.documentElement.dataset.network = online ? 'online' : 'offline'; });
window.addEventListener('appdatareset', () => { session = null; showScreen('menu'); });

renderPersonas();
updateMenuResume();
showScreen('menu');
