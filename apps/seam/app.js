import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  AxisGame, PLAYER, DIRECTIONS, boardCells, coordKey, parseCoordKey,
  lineBetween, chooseAIMove, shouldSwapOpening
} from './engine.js';

installMobileRuntime();

const VERSION = '2.2.0';
const STORAGE_KEY = 'pocket-works:seam:v3';
const SETTINGS_KEY = 'pocket-works:seam:settings:v2';
const TUTORIAL_KEY = 'pocket-works:seam:tutorial:v2';
const $ = (selector) => document.querySelector(selector);

const elements = {
  startScreen: $('#startScreen'), gameScreen: $('#gameScreen'), startButton: $('#startButton'), resumeButton: $('#resumeButton'), resumeMeta: $('#resumeMeta'),
  modeChoices: $('#modeChoices'), levelChoices: $('#levelChoices'), levelLine: $('#levelLine'), menuButton: $('#menuButton'),
  board: $('#boardCanvas'), boardFrame: $('#boardFrame'), boardCaption: $('#boardCaption'), thinking: $('#thinking'), thinkingText: $('#thinkingText'), toast: $('#toast'), tutorialCard: $('#tutorialCard'),
  azureStrip: $('#azureStrip'), ochreStrip: $('#ochreStrip'), azureName: $('#azureName'), ochreName: $('#ochreName'), azureStatus: $('#azureStatus'), ochreStatus: $('#ochreStatus'), azurePieces: $('#azurePieces'), ochrePieces: $('#ochrePieces'),
  azureReserve: $('#azureReserve'), ochreReserve: $('#ochreReserve'), azureReserveButton: $('#azureReserveButton'), ochreReserveButton: $('#ochreReserveButton'),
  swapOffer: $('#swapOffer'), swapButton: $('#swapButton'), declineSwapButton: $('#declineSwapButton'),
  turnPill: $('#turnPill'), turnLabel: $('#turnLabel'), clearButton: $('#clearButton'), undoButton: $('#undoButton'), rulesButton: $('#rulesButton'),
  rulesStartButton: $('#rulesStartButton'), auditStartButton: $('#auditStartButton'), sheetLayer: $('#sheetLayer'), sheetBackdrop: $('#sheetBackdrop'), menuSheet: $('#menuSheet'), rulesSheet: $('#rulesSheet'), auditSheet: $('#auditSheet'), resultSheet: $('#resultSheet'),
  continueButton: $('#continueButton'), newGameButton: $('#newGameButton'), menuRulesButton: $('#menuRulesButton'), menuAuditButton: $('#menuAuditButton'), soundToggle: $('#soundToggle'), hapticToggle: $('#hapticToggle'), resignButton: $('#resignButton'),
  resultTitle: $('#resultTitle'), resultMark: $('#resultMark'), resultReason: $('#resultReason'), resultText: $('#resultText'), rematchButton: $('#rematchButton'), resultHomeButton: $('#resultHomeButton')
};

const STYLE_NAMES = {
  rush: 'рывок к центру', ram: 'таранный натиск', shell: 'плотная крепость', flank: 'фланговый манёвр', balanced: 'смешанный строй'
};
const STYLE_THINKING = {
  rush: 'Соперник ищет проход к центру', ram: 'Соперник примеряется к толчку', shell: 'Соперник стягивает строй', flank: 'Соперник обходит фланг', balanced: 'Соперник перестраивает фронт'
};
const PLAYER_NAME = { 1: 'Лазурь', 2: 'Охра' };
const PLAYER_CLASS = { 1: 'azure', 2: 'ochre' };

let mode = 'ai';
let level = 'club';
let game = null;
let snapshots = [];
let seatForColor = { 1: 1, 2: 2 };
let starterSeat = 1;
let aiStyle = 'balanced';
let aiBusy = false;
let swapDeclined = false;
let selected = [];
let deploymentMode = false;
let geometry = null;
let moveHandles = [];
let particles = [];
let animationFrame = 0;
let lastPointer = null;
let resignArmed = false;
let newGameArmed = false;
let toastTimer = 0;
let audioContext = null;
let settings = loadSettings();

function loadSettings() {
  try { return { sound: true, haptic: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { sound: true, haptic: true }; }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  elements.soundToggle.querySelector('em').textContent = settings.sound ? 'Вкл' : 'Выкл';
  elements.hapticToggle.querySelector('em').textContent = settings.haptic ? 'Вкл' : 'Выкл';
}

function randomStyle() {
  const styles = Object.keys(STYLE_NAMES);
  const bytes = new Uint32Array(1);
  crypto.getRandomValues?.(bytes);
  return styles[(bytes[0] || Math.floor(Math.random() * 9999)) % styles.length];
}

function snapshot() {
  return {
    game: game.toJSON(), seatForColor: { ...seatForColor }, starterSeat, aiStyle, swapDeclined
  };
}

function restore(entry) {
  game = AxisGame.fromJSON(entry.game);
  seatForColor = { 1: Number(entry.seatForColor?.[1]) || 1, 2: Number(entry.seatForColor?.[2]) || 2 };
  starterSeat = Number(entry.starterSeat) || 1;
  aiStyle = entry.aiStyle || 'balanced';
  swapDeclined = Boolean(entry.swapDeclined);
  selected = [];
  deploymentMode = false;
}

function saveGame() {
  if (!game) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: VERSION, mode, level, current: snapshot(), snapshots
  }));
  refreshResume();
}

function loadSavedGame() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!data?.current?.game || data.version !== VERSION) return false;
    mode = data.mode || 'ai';
    level = data.level || 'club';
    snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
    restore(data.current);
    syncChoices();
    showGame();
    render();
    maybeAI();
    return true;
  } catch (error) {
    console.warn('Could not restore AXIS game', error);
    return false;
  }
}

function refreshResume() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const available = data?.version === VERSION && data?.current?.game && !data.current.game.winner;
    elements.resumeButton.classList.toggle('hidden', !available);
    if (available) {
      const gameData = data.current.game;
      elements.resumeMeta.textContent = `Ход ${gameData.moveNumber + 1} · ${data.mode === 'ai' ? 'против компьютера' : 'вдвоём'}`;
    }
  } catch { elements.resumeButton.classList.add('hidden'); }
}

function syncChoices() {
  for (const button of elements.modeChoices.querySelectorAll('button')) button.classList.toggle('selected', button.dataset.value === mode);
  for (const button of elements.levelChoices.querySelectorAll('button')) button.classList.toggle('selected', button.dataset.value === level);
  elements.levelLine.classList.toggle('hidden', mode !== 'ai');
}

function startGame({ alternate = false } = {}) {
  if (alternate) starterSeat = starterSeat === 1 ? 2 : 1;
  else starterSeat = 1;
  game = new AxisGame();
  seatForColor = { 1: starterSeat, 2: 3 - starterSeat };
  snapshots = [];
  aiStyle = randomStyle();
  aiBusy = false;
  swapDeclined = false;
  selected = [];
  deploymentMode = false;
  particles = [];
  saveGame();
  showGame();
  render();
  if (!localStorage.getItem(TUTORIAL_KEY)) elements.tutorialCard.classList.remove('hidden');
  maybeAI();
}

function showGame() {
  closeSheets();
  elements.startScreen.classList.add('hidden');
  elements.gameScreen.classList.remove('hidden');
  elements.menuButton.classList.remove('hidden');
  elements.startScreen.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    resizeCanvas();
  });
  ensureAnimation();
}

function showStart() {
  aiBusy = false;
  closeSheets();
  elements.gameScreen.classList.add('hidden');
  elements.startScreen.classList.remove('hidden');
  elements.menuButton.classList.add('hidden');
  refreshResume();
}

function actorSeat() {
  return game ? seatForColor[game.turn] : 0;
}

function humanCanAct() {
  return Boolean(game && !game.winner && !aiBusy && (mode === 'local' || actorSeat() === 1));
}

function declineOpeningSilently() {
  if (!game?.canClaimOpening()) return;
  game.swapAvailable = false;
  swapDeclined = true;
}

function performMove(move, actor = 'human') {
  if (!game || game.winner || aiBusy && actor !== 'ai') return;
  if (actor === 'human' && !humanCanAct()) return;
  if (actor === 'human' && game.canClaimOpening()) declineOpeningSilently();
  snapshots.push(snapshot());
  const result = game.applyMove(move);
  if (!result.ok) {
    snapshots.pop();
    showToast('Этот строй так не двигается');
    buzz('error');
    return;
  }
  selected = [];
  deploymentMode = false;
  elements.boardFrame.classList.remove('deploy-mode');
  if (result.move.kind === 'deploy') {
    playSound('deploy', result.player);
    buzz('move');
    showToast('Подкрепление вернулось в строй');
  } else if (result.move.kind === 'push') {
    elements.boardFrame.classList.remove('push-kick');
    void elements.boardFrame.offsetWidth;
    elements.boardFrame.classList.add('push-kick');
    spawnParticles(result.ejected, 3 - result.player);
    playSound(result.ejected.length ? 'eject' : 'push', result.player);
    buzz(result.ejected.length ? 'eject' : 'push');
  } else {
    playSound(result.move.kind === 'broadside' ? 'slide' : 'move', result.player);
    buzz('move');
  }
  if (result.centerClaim?.player === result.player && result.centerClaim.replies === 0) {
    playSound('claim', result.player);
    showToast(`${PLAYER_NAME[result.player]} заявляет Ось`);
  }

  if (!game.winner && game.legalMoves().length === 0) {
    game.winner = result.player;
    game.winReason = 'immobilized';
  }
  saveGame();
  render();
  if (game.winner) {
    playSound('win', game.winner);
    buzz('win');
    setTimeout(showResult, 430);
  } else if (actor === 'human') {
    maybeAI();
  }
}

function maybeAI() {
  if (!game || mode !== 'ai' || game.winner || aiBusy || actorSeat() !== 2) return;
  aiBusy = true;
  selected = [];
  deploymentMode = false;
  elements.thinkingText.textContent = STYLE_THINKING[aiStyle];
  elements.thinking.classList.remove('hidden');
  render();
  const delay = level === 'sharp' ? 380 : level === 'calm' ? 250 : 310;
  setTimeout(() => {
    if (!game || game.winner || actorSeat() !== 2) {
      aiBusy = false;
      elements.thinking.classList.add('hidden');
      return;
    }
    if (game.canClaimOpening()) {
      if (shouldSwapOpening(game, aiStyle)) {
        snapshots.push(snapshot());
        game.claimOpening();
        seatForColor = { 1: seatForColor[2], 2: seatForColor[1] };
        swapDeclined = true;
        aiBusy = false;
        elements.thinking.classList.add('hidden');
        playSound('swap');
        buzz('push');
        showToast('Компьютер забрал первый строй');
        saveGame();
        render();
        maybeAI();
        return;
      }
      declineOpeningSilently();
    }
    const move = chooseAIMove(game, { level, style: aiStyle });
    aiBusy = false;
    elements.thinking.classList.add('hidden');
    if (!move) {
      game.winner = 3 - game.turn;
      game.winReason = 'immobilized';
      saveGame();
      render();
      showResult();
      return;
    }
    performMove(move, 'ai');
  }, delay);
}

function claimOpening() {
  if (!game?.canClaimOpening() || !humanCanAct()) return;
  snapshots.push(snapshot());
  game.claimOpening();
  seatForColor = { 1: seatForColor[2], 2: seatForColor[1] };
  swapDeclined = true;
  selected = [];
  deploymentMode = false;
  playSound('swap');
  buzz('push');
  saveGame();
  render();
  maybeAI();
}

function declineOpening() {
  if (!game?.canClaimOpening() || !humanCanAct()) return;
  snapshots.push(snapshot());
  declineOpeningSilently();
  saveGame();
  render();
  maybeAI();
}

function undo() {
  if (!game || aiBusy || snapshots.length === 0) return;
  restore(snapshots.pop());
  if (mode === 'ai') {
    while (snapshots.length && actorSeat() !== 1) restore(snapshots.pop());
  }
  game.winner = 0;
  game.winReason = '';
  selected = [];
  deploymentMode = false;
  saveGame();
  render();
}

function clearSelection() {
  selected = [];
  deploymentMode = false;
  elements.boardFrame.classList.remove('deploy-mode');
  render();
}

function toggleDeployment(player) {
  if (!game || !humanCanAct() || game.turn !== player || game.reserve[player] <= 0) return;
  selected = [];
  deploymentMode = !deploymentMode;
  elements.boardFrame.classList.toggle('deploy-mode', deploymentMode);
  if (deploymentMode) showToast('Выберите подсвеченную клетку домашнего края');
  render();
}

function playerLabel(player) {
  const seat = seatForColor[player];
  if (mode === 'ai') return seat === 1 ? `Вы · ${PLAYER_NAME[player]}` : `Компьютер · ${PLAYER_NAME[player]}`;
  return `Игрок ${seat} · ${PLAYER_NAME[player]}`;
}

function statusFor(player) {
  if (!game) return '';
  if (game.winner) return game.winner === player ? 'Победа' : 'Поражение';
  if (game.centerClaim?.player === player) return `Ось: ${game.centerClaim.replies}/${game.centerReplies}`;
  if (aiBusy && seatForColor[player] === 2) return 'Думает';
  if (game.turn === player) return mode === 'ai' && seatForColor[player] === 1 ? 'Ваш ход' : 'Ходит';
  return 'Ждёт хода';
}

function render() {
  if (!game) return;
  elements.azureName.textContent = playerLabel(PLAYER.AZURE);
  elements.ochreName.textContent = playerLabel(PLAYER.OCHRE);
  elements.azureStatus.textContent = statusFor(PLAYER.AZURE);
  elements.ochreStatus.textContent = statusFor(PLAYER.OCHRE);
  elements.azurePieces.textContent = game.cellsFor(PLAYER.AZURE).length;
  elements.ochrePieces.textContent = game.celsFor(PLAYER.OCHRE).length;
  elements.azureReserve.textContent = game.reserve[PLAYER.AZURE];
  elements.ochreReserve.textContent = game.reserve[PLAYER.OCHRE];
  elements.azureReserveButton.disabled = !humanCanAct() || game.turn !== PLAYER.AZURE || game.reserve[PLAYER.AZURE] <= 0;
  elements.ochreReserveButton.disabled = !humanCanAct() || game.turn !== PLAYER.OCHRE || game.reserve[PLAYER.OCHRE] <= 0;
  elements.azureReserveButton.classList.toggle('ready', deploymentMode && game.turn === PLAYER.AZURE);
  elements.ochreReserveButton.classList.toggle('ready', deploymentMode && game.turn === PLAYER.OCHRE);
  elements.azureStrip.classList.toggle('active', !game.winner && game.turn === PLAYER.AZURE);
  elements.ochreStrip.classList.toggle('active', !game.winner && game.turn === PLAYER.OCHRE);
  elements.turnLabel.textContent = game.winner ? 'Дуэль токончена' : `Ход ${PLAYER_NAME[game.turn]}`;
  elements.turnPill.querySelector('.turn-dot').className = `turn-dot ${PLAYER_CLASS[game.turn]}`;
  elements.undoButton.disabled = snapshots.length === 0 || aiBusy;
  elements.clearButton.disabled = selected.length === 0 && !deploymentMode || aiBusy;

  const canSwap = game.canClaimOpening() && !swapDeclined && humanCanAct();
  elements.swapOffer.classList.toggle('hidden', !canSwap);
  updateCaption();
  drawBoard(performance.now());
}

function updateCaption() {
  if (!game) return;
  if (game.winner) {
    elements.boardCaption.textContent = 'Партия окончена';
    return;
  }
  if (aiBusy) {
    elements.boardCaption.textContent = STYLE_NAMES[aiStyle];
    return;
  }
  if (!humanCanAct()) {
    elements.boardCaption.textContent = 'Ждём соперника';
    return;
  }
  if (deploymentMode) {
    const count = game.deploymentCells(game.turn).length;
    elements.boardCaption.textContent = count
      ? `�одкрепление: выберите одну из ${count} клеток домашнего края`
      : 'Нет поддержанной клетки для возвращения бойца';
    return;
  }
  if (game.centerClaim) {
    const isOurs = mode === 'local' || seatForColor[game.centerClaim.player] === 1;
    elements.boardCaption.textContent = isOurs
      ? `Удержите Ось: пережито ${game.centerClaim.replies} из ${game.centerReplies} ответов`
      : `Сорвите Ось: соперник пережил ${game.centerClaim.replies} из ${game.centerReplies} ответов`;
    return;
  }
  if (!selected.length) {
    elements.boardCaption.textContent = 'Выберите свою фишку';
    return;
  }
  if (selected.length === 1 && selected[0] === game.crown[game.turn]) {
    elements.boardCaption.textContent = 'Корень не ходит один — добавьте союзника в линию';
    return;
  }
  const legal = game.legalMovesForSelection(selected.map(parseCoordKey));
  elements.boardCaption.textContent = legal.length
    ? `Строй из ${selected.length}: нажмите стрелку движения`
    : 'Добавьте соседнюю фишку по прямой или выберите другую';
}

function resizeCanvas() {
  const rect = elements.boardFrame.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  elements.board.width = Math.max(1, Math.round(rect.width * dpr));
  elements.board.height = Math.max(1, Math.round(rect.height * dpr));
  elements.board.style.width = `${rect.width}px`;
  elements.board.style.height = `${rect.height}px`;
  const width = rect.width;
  const height = rect.height;
  const radius = game?.radius || 3;
  const size = Math.min(width / (Math.sqrt(3) * (radius * 2 + 1.65)), height / (1.5 * (radius * 2 + 1.5)));
  geometry = { width, height, dpr, size, cx: width / 2, cy: height / 2 - Math.min(6, height * .015) };
  drawBoard(performance.now());
}

function pixelFor(cell) {
  const { size, cx, cy } = geometry;
  return {
    x: cx + size * Math.sqrt(3) * (cell[0] + cell[1] / 2),
    y: cy + size * 1.5 * cell[1]
  };
}

function canvasPoint(event) {
  const rect = elements.board.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function nearestCell(point) {
  if (!geometry || !game) return null;
  let best = null;
  let distance = Infinity;
  for (const cell of boardCells(game.radius)) {
    const pixel = pixelFor(cell);
    const current = Math.hypot(point.x - pixel.x, point.y - pixel.y);
    if (current < distance) { distance = current; best = cell; }
  }
  return distance <= geometry.size * .52 ? best : null;
}

function selectedLineFrom(firstKey, targetCell) {
  const first = parseCoordKey(firstKey);
  return lineBetween(first, targetCell, game).map(coordKey);
}

function handlePointer(point) {
  if (!humanCanAct() || !game) return;
  const handle = moveHandles.find((candidate) => Math.hypot(point.x - candidate.x, point.y - candidate.y) <= candidate.radius * 1.3);
  if (handle) {
    performMove(handle.move);
    return;
  }
  const cell = nearestCell(point);
  if (!cell) {
    clearSelection();
    return;
  }
  const key = coordKey(cell);
  if (deploymentMode) {
    const move = game.legalMoves().find((candidate) => candidate.kind === 'deploy' && candidate.destinations?.[0] === key);
    if (move) performMove(move);
    else showToast('Подкреплению нужна свободная клетка рядом со своим бойцом');
    return;
  }
  if (game.valueAt(cell) !== game.turn) {
    clearSelection();
    return;
  }
  if (!selected.length) selected = [key];
  else {
    const line = selectedLineFrom(selected[0], cell);
    selected = line.length ? line : [key];
  }
  playSound('select', game.turn);
  buzz('select');
  render();
}

function drawHex(ctx, x, y, radius, rotation = Math.PI / 6) {
  ctx.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = rotation + index * Math.PI / 3;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawArrow(ctx, x, y, direction, radius, kind) {
  const origin = pixelFor([0, 0]);
  const vector = pixelFor(DIRECTIONS[direction]);
  const angle = Math.atan2(vector.y - origin.y, vector.x - origin.x);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(radius * .35, 0);
  ctx.lineTo(-radius * .18, -radius * .3);
  ctx.lineTo(-radius * .05, 0);
  ctx.lineTo(-radius * .18, radius * .3);
  ctx.closePath();
  ctx.fillStyle = kind === 'push' ? '#f2d29e' : '#ede5d7';
  ctx.fill();
  ctx.restore();
}

function drawPiece(ctx, cell, player, time) {
  const pixel = pixelFor(cell);
  const radius = geometry.size * .37;
  const key = coordKey(cell);
  const isSelected = selected.includes(key);
  const isCrown = game.crown[player] === key;
  const isLast = game.lastMove?.destinations?.includes(key);
  const claimPulse = game.centerClaim?.player === player && isCrown ? 1 + Math.sin(time / 180) * .04 : 1;
  ctx.save();
  ctx.translate(pixel.x, pixel.y);
  ctx.scale(claimPulse, claimPulse);
  ctx.shadowColor = 'rgba(42,33,24,.3)';
  ctx.shadowBlur = radius * .38;
  ctx.shadowOffsetY = radius * .18;
  const gradient = ctx.createRadialGradient(-radius * .28, -radius * .32, radius * .08, 0, 0, radius);
  if (player === PLAYER.AZURE) {
    gradient.addColorStop(0, '#7ba8ba'); gradient.addColorStop(.55, '#315f7a'); gradient.addColorStop(1, '#173b50');
  } else {
    gradient.addColorStop(0, '#dda36d'); gradient.addColorStop(.55, '#b66b31'); gradient.addColorStop(1, '#6d341b');
  }
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fillStyle = gradient; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = isSelected ? Math.max(3, radius * .12) : 1.5;
  ctx.strokeStyle = isSelected ? '#d7b16d' : 'rgba(24,28,29,.55)';
  ctx.stroke();
  if (isLast) {
    ctx.beginPath(); ctx.arc(0, 0, radius * 1.14, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(157,122,67,.7)'; ctx.lineWidth = 2; ctx.stroke();
  }
  if (isCrown) {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#e8dfcf';
    ctx.fillRect(-radius * .17, -radius * .17, radius * .34, radius * .34);
    ctx.strokeStyle = 'rgba(30,33,32,.55)'; ctx.lineWidth = 1; ctx.strokeRect(-radius * .17, -radius * .17, radius * .34, radius * .34);
  }
  ctx.restore();
}

function drawBoard(time = performance.now()) {
  if (!geometry || !game || elements.gameScreen.classList.contains('hidden')) return;
  const ctx = elements.board.getContext('2d');
  const { dpr, width, height, size, cx, cy } = geometry;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  moveHandles = [];

  const outerRadius = size * (game.radius * Math.sqrt(3) + .75);
  drawHex(ctx, cx, cy, outerRadius, Math.PI / 6);
  const fieldGradient = ctx.createRadialGradient(cx, cy, size, cx, cy, outerRadius);
  fieldGradient.addColorStop(0, '#e6dcc9'); fieldGradient.addColorStop(1, '#d2c4ae');
  ctx.fillStyle = fieldGradient; ctx.fill();
  ctx.strokeStyle = 'rgba(61,55,45,.35)'; ctx.lineWidth = 1.5; ctx.stroke();

  const cells = boardCells(game.radius);
  const deploymentKeys = deploymentMode && humanCanAct()
    ? new Set(game.deploymentCells(game.turn).map(coordKey))
    : new Set();
  ctx.lineWidth = 1;
  for (const cell of cells) {
    const origin = pixelFor(cell);
    for (const direction of [DIRECTIONS[0], DIRECTIONS[1], DIRECTIONS[2]]) {
      const neighbor = [cell[0] + direction[0], cell[1] + direction[1]];
      if (!game.onBoard(neighbor)) continue;
      const destination = pixelFor(neighbor);
      ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(destination.x, destination.y);
      ctx.strokeStyle = 'rgba(50,48,43,.09)'; ctx.stroke();
    }
  }

  for (const cell of cells) {
    const pixel = pixelFor(cell);
    const homeAzure = cell[1] === -game.radius;
    const homeOchre = cell[1] === game.radius;
    drawHex(ctx, pixel.x, pixel.y, size * .45);
    ctx.fillStyle = homeAzure ? 'rgba(49,95,122,.09)' : homeOchre ? 'rgba(182,107,49,.1)' : 'rgba(239,232,218,.42)';
    ctx.fill();
    ctx.strokeStyle = deploymentKeys.has(coordKey(cell)) ? 'rgba(157,122,67,.95)' : 'rgba(44,47,44,.14)';
    ctx.lineWidth = deploymentKeys.has(coordKey(cell)) ? 3 : 1;
    ctx.stroke();
    if (deploymentKeys.has(coordKey(cell))) {
      ctx.beginPath(); ctx.arc(pixel.x, pixel.y, size * .22, 0, Math.PI * 2); ctx.fillStyle = 'rgba(157,122,67,.28)'; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(pixel.x, pixel.y, size * .08, 0, Math.PI * 2); ctx.fillStyle = 'rgba(69,63,53,.16)'; ctx.fill();
  }

  const center = pixelFor([0, 0]);
  const pulse = 1 + Math.sin(time / 420) * .025;
  ctx.save(); ctx.translate(center.x, center.y); ctx.scale(pulse, pulse);
  ctx.beginPath(); ctx.arc(0, 0, size * .58, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(157,122,67,.8)'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, size * .46, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(157,122,67,.3)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();

  if (game.centerClaim) {
    const color = game.centerClaim.player === PLAYER.AZURE ? '#315f7a' : '#b66b31';
    ctx.save(); ctx.translate(center.x, center.y); ctx.rotate(time / 900);
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let index = 0; index < game.centerReplies; index += 1) {
      ctx.beginPath();
      const segment = Math.PI * 2 / game.centerReplies;
      const start = -Math.PI / 2 + index * segment;
      ctx.arc(0, 0, size * .7, start, start + (game.centerClaim.replies > index ? .78 : .3) * segment);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const [key, player] of Object.entries(game.board)) drawPiece(ctx, parseCoordKey(key), player, time);

  if (selected.length && humanCanAct() && !deploymentMode) {
    const moves = game.legalMovesForSelection(selected.map(parseCoordKey));
    if (moves.length) {
      const pixels = selected.map((key) => pixelFor(parseCoordKey(key)));
      const centroid = pixels.reduce((acc, point) => ({ x: acc.x + point.x / pixels.length, y: acc.y + point.y / pixels.length }), { x: 0, y: 0 });
      const zero = pixelFor([0, 0]);
      for (const move of moves) {
        const step = pixelFor(DIRECTIONS[move.direction]);
        const dx = step.x - zero.x; const dy = step.y - zero.y;
        const length = Math.hypot(dx, dy) || 1;
        const offset = size * (selected.length > 1 ? .9 : .78);
        const x = centroid.x + dx / length * offset;
        const y = centroid.y + dy / length * offset;
        const radius = Math.max(11, size * .22);
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = move.kind === 'push' ? '#8c5b2f' : '#263335'; ctx.fill();
        ctx.strokeStyle = move.kind === 'push' ? '#e1bd80' : '#d6cbb8'; ctx.lineWidth = 1.5; ctx.stroke();
        drawArrow(ctx, x, y, move.direction, radius, move.kind);
        moveHandles.push({ x, y, radius, move });
      }
    }
  }

  particles = particles.filter((particle) => time - particle.created < 720);
  for (const particle of particles) {
    const life = (time - particle.created) / 720;
    ctx.globalAlpha = 1 - life;
    ctx.beginPath();
    ctx.arc(particle.x + particle.vx * life, particle.y + particle.vy * life + life * life * 24, particle.radius * (1 - life * .5), 0, Math.PI * 2);
    ctx.fillStyle = particle.color; ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function spawnParticles(ejectedKeys, player) {
  if (!geometry || !ejectedKeys?.length) return;
  const color = player === PLAYER.AZURE ? '#315f7a' : '#b66b31';
  for (const key of ejectedKeys) {
    const cell = parseCoordKey(key);
    const point = pixelFor(cell);
    for (let index = 0; index < 10; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      particles.push({ x: point.x, y: point.y, vx: Math.cos(angle) * (18 + Math.random() * 24), vy: Math.sin(angle) * (18 + Math.random() * 24), radius: 2 + Math.random() * 3, color, created: performance.now() });
    }
  }
}

function ensureAnimation() {
  if (animationFrame) return;
  const tick = (time) => {
    animationFrame = requestAnimationFrame(tick);
    if (!elements.gameScreen.classList.contains('hidden') && (particles.length || game?.centerClaim || selected.length)) drawBoard(time);
  };
  animationFrame = requestAnimationFrame(tick);
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 1800);
}

function openSheet(sheet) {
  elements.sheetLayer.classList.remove('hidden');
  for (const candidate of [elements.menuSheet, elements.rulesSheet, elements.auditSheet, elements.resultSheet]) candidate.classList.add('hidden');
  sheet.classList.remove('hidden');
}

function closeSheets() {
  elements.sheetLayer.classList.add('hidden');
  for (const candidate of [elements.menuSheet, elements.rulesSheet, elements.auditSheet, elements.resultSheet]) candidate.classList.add('hidden');
}

function showResult() {
  if (!game?.winner || game.winner < 0) return;
  const player = game.winner;
  elements.resultTitle.textContent = `${PLAYER_NAME[player]} победила`;
  elements.resultMark.className = `player-mark ${PLAYER_CLASS[player]}`;
  if (game.winReason === 'crown-ejected') {
    elements.resultReason.textContent = 'Корень выбит';
    elements.resultText.textContent = 'Вражеский Корень вытолкнули за край поля. Строй развалился буквально.';
  } else if (game.winReason === 'immobilized') {
    elements.resultReason.textContent = 'Строй заперт';
    elements.resultText.textContent = 'У соперника не осталось ни одного законного движения.';
  } else if (game.winReason === 'resign') {
    elements.resultReason.textContent = 'Соперник сдался';
    elements.resultText.textContent = 'Иногда лучший тактический манёвр — прекратить позор вовремя.';
  } else {
    elements.resultReason.textContent = 'Ось удержана';
    elements.resultText.textContent = 'Корень в центре с четырьмя союзниками пережил три полных ответных хода.';
  }
  openSheet(elements.resultSheet);
}

function confirmNewGame() {
  if (!newGameArmed) {
    newGameArmed = true;
    elements.newGameButton.querySelector('small').textContent = 'Нажмите ещё раз — позиция будет заменена';
    setTimeout(() => {
      newGameArmed = false;
      elements.newGameButton.querySelector('small').textContent = 'Заменит текущее сохранение';
    }, 2500);
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
    }, 2500);
    return;
  }
  const loser = game.turn;
  game.winner = 3 - loser;
  game.winReason = 'resign';
  saveGame();
  closeSheets();
  showResult();
}

function audio() {
  if (!settings.sound) return null;
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function tone(frequency, duration, gain = .035, type = 'sine', delay = 0) {
  const context = audio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + delay);
  volume.gain.setValueAtTime(0.0001, context.currentTime + delay);
  volume.gain.exponentialRampToValueAtTime(gain, context.currentTime + delay + .012);
  volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
  oscillator.connect(volume).connect(context.destination);
  oscillator.start(context.currentTime + delay);
  oscillator.stop(context.currentTime + delay + duration + .03);
}

function playSound(kind, player = PLAYER.AZURE) {
  const base = player === PLAYER.AZURE ? 180 : 220;
  if (kind === 'select') tone(base * 1.6, .045, .018, 'triangle');
  if (kind === 'move') { tone(base, .075, .032, 'triangle'); tone(base * 1.26, .05, .018, 'sine', .035); }
  if (kind === 'slide') { tone(base * .82, .12, .026, 'triangle'); tone(base * 1.05, .09, .018, 'sine', .06); }
  if (kind === 'push') { tone(92, .12, .05, 'square'); tone(150, .08, .028, 'triangle', .04); }
  if (kind === 'eject') { tone(72, .2, .07, 'sawtooth'); tone(220, .08, .025, 'triangle', .08); }
  if (kind === 'deploy') { tone(base * .72, .11, .03, 'triangle'); tone(base * 1.18, .09, .02, 'sine', .055); }
  if (kind === 'claim') { tone(330, .22, .035, 'sine'); tone(495, .25, .025, 'sine', .08); }
  if (kind === 'swap') { tone(150, .12, .03, 'triangle'); tone(230, .13, .03, 'triangle', .08); }
  if (kind === 'win') { [262, 330, 392, 523].forEach((frequency, index) => tone(frequency, .38, .028, 'sine', index * .07)); }
}

function buzz(kind) {
  if (!settings.haptic || !navigator.vibrate) return;
  const pattern = kind === 'push' ? [24, 20, 34] : kind === 'eject' ? [38, 24, 60] : kind === 'win' ? [40, 30, 50, 30, 80] : kind === 'error' ? [18, 20, 18] : 10;
  navigator.vibrate(pattern);
}

for (const group of [elements.modeChoices, elements.levelChoices]) {
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    if (group === elements.modeChoices) mode = button.dataset.value;
    else level = button.dataset.value;
    syncChoices();
    playSound('select');
  });
}

elements.startButton.addEventListener('click', () => startGame());
elements.resumeButton.addEventListener('click', loadSavedGame);
elements.menuButton.addEventListener('click', () => openSheet(elements.menuSheet));
elements.rulesButton.addEventListener('click', () => openSheet(elements.rulesSheet));
elements.rulesStartButton.addEventListener('click', () => openSheet(elements.rulesSheet));
elements.auditStartButton.addEventListener('click', () => openSheet(elements.auditSheet));
elements.continueButton.addEventListener('click', closeSheets);
elements.newGameButton.addEventListener('click', confirmNewGame);
elements.menuRulesButton.addEventListener('click', () => openSheet(elements.rulesSheet));
elements.menuAuditButton.addEventListener('click', () => openSheet(elements.auditSheet));
elements.swapButton.addEventListener('click', claimOpening);
elements.declineSwapButton.addEventListener('click', declineOpening);
elements.undoButton.addEventListener('click', undo);
elements.clearButton.addEventListener('click', clearSelection);
elements.azureReserveButton.addEventListener('click', () => toggleDeployment(PLAYER.AZURE));
elements.ochreReserveButton.addEventListener('click', () => toggleDeployment(PLAYER.OCHRE));
elements.resignButton.addEventListener('click', resign);
elements.rematchButton.addEventListener('click', () => { closeSheets(); startGame({ alternate: true }); });
elements.resultHomeButton.addEventListener('click', showStart);
elements.sheetBackdrop.addEventListener('click', closeSheets);
for (const button of document.querySelectorAll('[data-close-sheet]')) button.addEventListener('click', closeSheets);
elements.soundToggle.addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); if (settings.sound) playSound('select'); });
elements.hapticToggle.addEventListener('click', () => { settings.haptic = !settings.haptic; saveSettings(); buzz('select'); });
elements.tutorialCard.addEventListener('click', () => { localStorage.setItem(TUTORIAL_KEY, 'seen'); elements.tutorialCard.classList.add('hidden'); });

elements.board.addEventListener('pointerdown', (event) => {
  lastPointer = canvasPoint(event);
  elements.board.setPointerCapture?.(event.pointerId);
});
elements.board.addEventListener('pointerup', (event) => {
  const point = canvasPoint(event);
  if (lastPointer && Math.hypot(point.x - lastPointer.x, point.y - lastPointer.y) < 18) handlePointer(point);
  else {
    const startCell = lastPointer ? nearestCell(lastPointer) : null;
    const endCell = nearestCell(point);
    if (startCell && endCell && game?.valueAt(startCell) === game.turn && game.valueAt(endCell) === game.turn) {
      const line = lineBetween(startCell, endCell, game).map(coordKey);
      if (line.length) { selected = line; render(); }
    }
  }
  lastPointer = null;
});
elements.board.addEventListener('pointercancel', () => { lastPointer = null; });
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 150));
document.addEventListener('visibilitychange', () => { if (!document.hidden) { resizeCanvas(); render(); } });

createWorkshopMode({
  appName: 'ОСЬ',
  version: VERSION,
  cachePrefix: 'seam-',
  storageNamespace: 'pocket-works:seam',
  onReset() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(TUTORIAL_KEY);
    window.location.reload();
  }
});

watchConnectivity((online) => {
  document.documentElement.dataset.network = online ? 'online' : 'offline';
});

saveSettings();
syncChoices();
refreshResume();
showStart();
