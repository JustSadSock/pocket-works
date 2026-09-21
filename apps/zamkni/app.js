import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { createPocketLan, decodePocketLanSignal } from '../../shared/capabilities/lan.js';
import { applyMove, createGame, getTeamScores, validateGameState } from './game.js';
import { chooseAiMove } from './ai.js';

installMobileRuntime();
createWorkshopMode({
  appName: 'ЗАМКНИ',
  version: '1.1.0',
  cachePrefix: 'zamkni-',
  storageNamespace: 'pocket-works:zamkni'
});

const COLORS = ['#d65f45', '#2f6f9f', '#4e8b68', '#c29434'];
const STORAGE = 'pocket-works:zamkni';
const AI_SAVE = `${STORAGE}:ai-game`;
const PROFILE_KEY = `${STORAGE}:profile`;
const SETTINGS_KEY = `${STORAGE}:settings`;
const MODES = {
  ai: { label: 'Против ИИ', players: 2, network: false },
  duel: { label: '1 на 1', players: 2, network: true },
  team: { label: '2 на 2', players: 4, network: true, teams: [0, 1, 0, 1] },
  ffa3: { label: 'Трое · каждый за себя', players: 3, network: true },
  ffa4: { label: 'Четверо · каждый за себя', players: 4, network: true }
};

const $ = (selector) => document.querySelector(selector);
const homeScreen = $('#homeScreen');
const lobbyScreen = $('#lobbyScreen');
const gameScreen = $('#gameScreen');
const board = $('#board');
const resultOverlay = $('#resultOverlay');
const settingsDialog = $('#settingsDialog');
const rulesDialog = $('#rulesDialog');

let settings = loadJson(SETTINGS_KEY, { sound: true });
let profile = loadJson(PROFILE_KEY, null) || {
  id: crypto.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: 'Игрок'
};
let mode = null;
let game = null;
let localSeat = 0;
let aiBusy = false;
let lan = null;
let capabilities = null;
let room = null;
let isHost = false;
let hostPeerId = null;
let lobbyProfiles = [];
let peerSeats = new Map();
let pendingRoom = null;
let pendingAnswer = '';
let toastTimer = 0;
let audioContext = null;
let qrStream = null;
let qrScanFrame = 0;
let qrScanResolve = null;
let qrScanReject = null;
let qrScanExpectedKind = null;
let qrScanLastAt = 0;

$('#playerNameInput').value = profile.name;
$('#soundToggle').checked = settings.sound;
restoreAiCard();

for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => selectMode(button.dataset.mode));
}
$('#continueAiButton').addEventListener('click', continueAiGame);
$('#rulesButton').addEventListener('click', () => rulesDialog.showModal());
$('#openRulesFromSettings').addEventListener('click', () => { settingsDialog.close(); rulesDialog.showModal(); });
$('#openSettingsButton').addEventListener('click', () => settingsDialog.showModal());
$('#pauseButton').addEventListener('click', () => settingsDialog.showModal());
$('#closeSettingsButton').addEventListener('click', () => settingsDialog.close());
$('#soundToggle').addEventListener('change', () => {
  settings.sound = $('#soundToggle').checked;
  safeSetJson(SETTINGS_KEY, settings);
});
$('#leaveMatchButton').addEventListener('click', () => { settingsDialog.close(); leaveToHome(); });
$('#lobbyBackButton').addEventListener('click', leaveToHome);
$('#resultHomeButton').addEventListener('click', leaveToHome);
$('#rematchButton').addEventListener('click', rematch);
$('#hostButton').addEventListener('click', hostNetworkGame);
$('#joinButton').addEventListener('click', joinNetworkGame);
$('#refreshRoomsButton').addEventListener('click', discoverNativeRooms);
$('#newInviteButton').addEventListener('click', createBrowserInvite);
$('#scanAnswerButton').addEventListener('click', scanAndCompleteAnswer);
$('#scanOfferButton').addEventListener('click', scanAndAcceptOffer);
$('#shareOfferButton').addEventListener('click', () => shareSignal($('#offerOutput').value, 'Приглашение ЗАМКНИ'));
$('#copyOfferButton').addEventListener('click', () => copySignal($('#offerOutput').value));
$('#completeInviteButton').addEventListener('click', completeBrowserInvite);
$('#acceptInviteButton').addEventListener('click', acceptBrowserInvite);
$('#shareAnswerButton').addEventListener('click', () => shareSignal($('#answerOutput').value, 'Ответ ЗАМКНИ'));
$('#copyAnswerButton').addEventListener('click', () => copySignal($('#answerOutput').value));
$('#startNetworkGameButton').addEventListener('click', startNetworkMatch);
$('#playerNameInput').addEventListener('change', persistProfileName);
$('#closeQrScannerButton').addEventListener('click', () => finishQrScan(null, new Error('QR scan cancelled')));
$('#qrImageInput').addEventListener('change', handleQrImageFile);
$('#qrScannerDialog').addEventListener('cancel', (event) => { event.preventDefault(); finishQrScan(null, new Error('QR scan cancelled')); });
$('#qrScannerDialog').addEventListener('close', stopQrCamera);

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function safeSetJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function persistProfileName() {
  const value = $('#playerNameInput').value.trim().slice(0, 24) || 'Игрок';
  profile = { ...profile, name: value };
  $('#playerNameInput').value = value;
  safeSetJson(PROFILE_KEY, profile);
  return value;
}

function selectMode(nextMode) {
  if (!MODES[nextMode]) return;
  mode = nextMode;
  if (mode === 'ai') {
    startAiGame();
    return;
  }
  showLobby();
}

function showScreen(target) {
  for (const screen of [homeScreen, lobbyScreen, gameScreen]) screen.hidden = screen !== target;
}

function showLobby() {
  resetNetworkState();
  showScreen(lobbyScreen);
  $('#lobbyModeLabel').textContent = MODES[mode].label.toUpperCase();
  $('#lobbyChoice').hidden = false;
  $('#lobbyStatusPanel').hidden = true;
  $('#slotsPanel').hidden = true;
  $('#nativeRoomsPanel').hidden = true;
  $('#hostPairingPanel').hidden = true;
  $('#joinPairingPanel').hidden = true;
  $('#startNetworkGameButton').hidden = true;
  $('#lobbyMessage').textContent = 'Оба телефона должны видеть друг друга в одной локальной сети или hotspot.';
}

function makePlayers(count, profiles, ai = false) {
  return Array.from({ length: count }, (_, index) => {
    const source = profiles[index] || {};
    const team = mode === 'team' ? [0, 1, 0, 1][index] : index;
    return {
      id: source.id || (ai && index === 1 ? 'ai' : `seat-${index}`),
      name: source.name || (ai && index === 1 ? 'ИИ' : `Игрок ${index + 1}`),
      color: COLORS[index],
      team
    };
  });
}

function startAiGame() {
  mode = 'ai';
  localSeat = 0;
  const name = persistProfileName();
  game = createGame({ mode, players: makePlayers(2, [{ ...profile, name }], true) });
  openGame();
  saveAiGame();
}

function continueAiGame() {
  const saved = loadJson(AI_SAVE, null);
  if (!validateGameState(saved) || saved.mode !== 'ai' || saved.finished) {
    safeRemove(AI_SAVE);
    restoreAiCard();
    return startAiGame();
  }
  mode = 'ai';
  localSeat = 0;
  game = saved;
  openGame();
  if (game.currentPlayer === 1) queueAiTurn();
}

function saveAiGame() {
  if (mode === 'ai' && game && !game.finished) safeSetJson(AI_SAVE, game);
  else if (mode === 'ai' && game?.finished) safeRemove(AI_SAVE);
  restoreAiCard();
}

function restoreAiCard() {
  const saved = loadJson(AI_SAVE, null);
  const button = $('#continueAiButton');
  if (validateGameState(saved) && saved.mode === 'ai' && !saved.finished) {
    button.hidden = false;
    $('#continueAiMeta').textContent = `счёт ${saved.scores[0]}:${saved.scores[1]} · осталось ${saved.boxes.filter((x) => x === null).length}`;
  } else {
    button.hidden = true;
  }
}

function openGame() {
  showScreen(gameScreen);
  resultOverlay.hidden = true;
  renderGame();
}

function renderGame() {
  if (!game) return;
  renderScores();
  renderBoard();
  renderTurn();
  if (game.finished) showResult();
}

function renderScores() {
  const strip = $('#scoreStrip');
  strip.replaceChildren();
  game.players.forEach((player, index) => {
    const item = document.createElement('div');
    item.className = `score-player${game.currentPlayer === index && !game.finished ? ' active' : ''}`;
    item.innerHTML = `<span class="swatch" style="background:${player.color}"></span><div><b></b><strong>${game.scores[index]}</strong></div>`;
    item.querySelector('b').textContent = player.name;
    strip.append(item);
  });
}

function renderTurn() {
  const player = game.players[game.currentPlayer];
  $('#turnColor').style.background = player.color;
  const myTurn = isMyTurn();
  $('#turnTitle').textContent = game.finished ? 'Партия завершена' : (myTurn ? 'Твой ход' : `Ход: ${player.name}`);
  $('#turnHint').textContent = game.finished ? 'Все квадраты распределены' : (myTurn ? 'Нажми на свободную линию' : 'Ждём следующий ход');
  if (mode === 'team') {
    const teams = getTeamScores(game);
    $('#teamScore').hidden = false;
    $('#teamScore').textContent = `A ${teams.find((x) => x.team === 0)?.score || 0} · ${teams.find((x) => x.team === 1)?.score || 0} B`;
  } else {
    $('#teamScore').hidden = true;
  }
}

function renderBoard() {
  board.replaceChildren();
  const margin = 50;
  const step = 100;
  const size = game.size;

  game.boxes.forEach((owner, index) => {
    if (owner === null) return;
    const row = Math.floor(index / size);
    const col = index % size;
    const rect = svg('rect', {
      x: margin + col * step + 8,
      y: margin + row * step + 8,
      width: step - 16,
      height: step - 16,
      rx: 2,
      fill: game.players[owner].color,
      class: 'box-fill'
    });
    board.append(rect);
  });

  for (let row = 0; row <= size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      renderEdge('h', row, col, margin + col * step, margin + row * step, margin + (col + 1) * step, margin + row * step, game.horizontal[row * size + col]);
    }
  }
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col <= size; col += 1) {
      renderEdge('v', row, col, margin + col * step, margin + row * step, margin + col * step, margin + (row + 1) * step, game.vertical[row * (size + 1) + col]);
    }
  }
  for (let row = 0; row <= size; row += 1) {
    for (let col = 0; col <= size; col += 1) {
      board.append(svg('circle', { cx: margin + col * step, cy: margin + row * step, r: 8, class: 'dot' }));
    }
  }
}

function renderEdge(orientation, row, col, x1, y1, x2, y2, owner) {
  const id = `${orientation}:${row}:${col}`;
  const recent = game.lastMove?.edge === id;
  const visible = svg('line', {
    x1, y1, x2, y2,
    class: owner === null ? 'edge-visible edge-open edge-selectable' : `edge-visible edge-claimed${recent ? ' edge-recent' : ''}`,
    stroke: owner === null ? undefined : game.players[owner].color
  });
  const hit = svg('line', { x1, y1, x2, y2, class: 'edge-hit', 'data-edge-id': id, tabindex: owner === null && isMyTurn() ? '0' : '-1', role: 'button', 'aria-label': owner === null ? 'Свободная линия' : 'Занятая линия' });
  if (owner === null) {
    hit.addEventListener('click', () => requestMove(id));
    hit.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); requestMove(id); }
    });
  }
  board.append(visible, hit);
}

function svg(name, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  return node;
}

function isMyTurn() {
  if (!game || game.finished) return false;
  if (mode === 'ai') return game.currentPlayer === 0 && !aiBusy;
  return game.currentPlayer === localSeat;
}

function requestMove(edge) {
  if (!game || game.finished) return;
  if (!isMyTurn()) return pulseMessage('Сейчас ход другого игрока.');
  if (mode === 'ai') {
    const result = applyMove(game, edge, 0);
    if (!result.ok) return pulseMessage('Эта линия уже занята.');
    game = result.game;
    playTone(result.captured.length ? 'claim' : 'line');
    saveAiGame();
    renderGame();
    if (!game.finished && game.currentPlayer === 1) queueAiTurn();
    return;
  }

  if (isHost) {
    applyAuthoritativeMove(localSeat, edge);
  } else if (room && hostPeerId) {
    try {
      room.send(hostPeerId, 'move-request', { edge, revision: game.revision });
      $('#gameMessage').textContent = 'Ход отправлен хосту…';
    } catch {
      pulseMessage('Не удалось отправить ход.');
    }
  }
}

function applyAuthoritativeMove(seat, edge) {
  if (!isHost || !game || seat !== game.currentPlayer) return false;
  const result = applyMove(game, edge, seat);
  if (!result.ok) return false;
  game = result.game;
  playTone(result.captured.length ? 'claim' : 'line');
  renderGame();
  room?.broadcast('state', game);
  return true;
}

async function queueAiTurn() {
  if (aiBusy || !game || game.finished || game.currentPlayer !== 1) return;
  aiBusy = true;
  renderTurn();
  while (game && !game.finished && game.currentPlayer === 1) {
    await delay(330);
    const edge = chooseAiMove(game);
    if (!edge) break;
    const result = applyMove(game, edge, 1);
    if (!result.ok) break;
    game = result.game;
    playTone(result.captured.length ? 'claim' : 'line');
    saveAiGame();
    renderGame();
  }
  aiBusy = false;
  renderGame();
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function ensureLan() {
  persistProfileName();
  if (!lan) {
    lan = createPocketLan({
      applicationId: 'zamkni',
      protocolVersion: 1,
      player: { id: profile.id, name: profile.name, metadata: { app: 'zamkni' } }
    });
  }
  capabilities = await lan.getCapabilities();
  return capabilities;
}

async function hostNetworkGame() {
  try {
    $('#lobbyChoice').hidden = true;
    showLanStatus('Поднимаем локальную комнату…');
    const caps = await ensureLan();
    isHost = true;
    localSeat = 0;
    lobbyProfiles = [{ id: profile.id, name: profile.name }];
    peerSeats = new Map();
    room = await lan.hostRoom({
      name: `${profile.name} · ЗАМКНИ`,
      maxPlayers: MODES[mode].players,
      metadata: { app: 'zamkni', mode, players: MODES[mode].players }
    });
    bindRoomEvents();
    renderLobbySlots();
    $('#slotsPanel').hidden = false;
    $('#lobbyStatusPanel').hidden = false;
    setLanStatus(caps.automaticDiscovery ? 'Комната видна в локальной сети' : 'Комната создана · ручное pairing', 'ok');
    $('#lanStatusHint').textContent = caps.automaticDiscovery ? 'Игроки увидят комнату автоматически.' : 'В браузере нужен одноразовый обмен приглашением и ответом.';
    if (caps.automaticDiscovery) {
      $('#hostPairingPanel').hidden = true;
    } else {
      $('#hostPairingPanel').hidden = false;
      await createBrowserInvite();
    }
    updateStartButton();
  } catch (error) {
    showLobbyError(humanNetworkError(error));
  }
}

async function joinNetworkGame() {
  try {
    $('#lobbyChoice').hidden = true;
    showLanStatus('Проверяем локальную сеть…');
    const caps = await ensureLan();
    isHost = false;
    $('#slotsPanel').hidden = false;
    renderLobbySlots([]);
    $('#lobbyStatusPanel').hidden = false;
    if (caps.automaticDiscovery) {
      setLanStatus('Ищем комнаты рядом…', 'ok');
      $('#nativeRoomsPanel').hidden = false;
      await discoverNativeRooms();
    } else if (caps.manualPairing) {
      setLanStatus('QR-pairing через PocketLAN', 'ok');
      $('#joinPairingPanel').hidden = false;
      $('#lanStatusHint').textContent = 'Интернет не нужен. Отсканируй QR, который показывает хост.';
    } else {
      throw new Error(caps.reason || 'PocketLAN unavailable');
    }
  } catch (error) {
    showLobbyError(humanNetworkError(error));
  }
}

async function discoverNativeRooms() {
  if (!lan || !capabilities?.automaticDiscovery) return;
  const list = $('#nativeRoomsList');
  list.innerHTML = '<p class="inline-message">Поиск…</p>';
  try {
    const rooms = await lan.discoverRooms({ timeoutMs: 1600 });
    const compatible = rooms.filter((entry) => !entry.metadata?.mode || entry.metadata.mode === mode);
    list.replaceChildren();
    if (!compatible.length) {
      list.innerHTML = '<p class="inline-message">Комнат пока нет. Проверь, что оба устройства в одной локальной сети и это не Guest Wi‑Fi.</p>';
      return;
    }
    compatible.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'room-row';
      button.innerHTML = '<span><b></b><small></small></span><em>→</em>';
      button.querySelector('b').textContent = entry.name || 'Локальная игра';
      button.querySelector('small').textContent = `${entry.players || '?'} / ${entry.maxPlayers || MODES[mode].players}`;
      button.addEventListener('click', () => joinNativeRoom(entry));
      list.append(button);
    });
  } catch (error) {
    list.innerHTML = `<p class="inline-message">${humanNetworkError(error)}</p>`;
  }
}

async function joinNativeRoom(descriptor) {
  try {
    room = await lan.joinRoom(descriptor);
    bindRoomEvents();
    setLanStatus('Подключаемся к хосту…', 'ok');
    $('#nativeRoomsPanel').hidden = true;
  } catch (error) {
    showLobbyError(humanNetworkError(error));
  }
}

async function createBrowserInvite() {
  if (!room?.createInvite) return;
  try {
    $('#newInviteButton').disabled = true;
    const invite = await room.createInvite();
    $('#offerOutput').value = invite;
    $('#answerInput').value = '';
    await renderPairingQr($('#offerQr'), $('#offerQrHint'), invite, 'приглашение');
    $('#lobbyMessage').textContent = 'QR готов. Покажи его следующему игроку.';
  } catch (error) {
    showLobbyError(humanNetworkError(error));
  } finally {
    $('#newInviteButton').disabled = false;
  }
}

async function completeBrowserInvite(answerOverride = '') {
  const answer = answerOverride || $('#answerInput').value.trim();
  if (!answer) return showLobbyError('Сначала отсканируй ответ второго телефона или вставь его вручную.');
  try {
    $('#completeInviteButton').disabled = true;
    await room.completeInvite(answer);
    $('#lobbyMessage').textContent = 'Ответ принят. Открываем прямое соединение…';
    $('#answerInput').value = '';
  } catch (error) {
    showLobbyError(humanNetworkError(error));
  } finally {
    $('#completeInviteButton').disabled = false;
  }
}

async function acceptBrowserInvite(offerOverride = '') {
  const offer = offerOverride || $('#offerInput').value.trim();
  if (!offer) return showLobbyError('Вставь приглашение хоста или отсканируй QR.');
  try {
    $('#acceptInviteButton').disabled = true;
    const result = await lan.joinInvite(offer);
    room = result.room;
    pendingRoom = result.room;
    pendingAnswer = result.answer;
    hostPeerId = result.host?.id || null;
    bindRoomEvents();
    $('#answerOutput').value = pendingAnswer;
    $('#answerOutputBlock').hidden = false;
    await renderPairingQr($('#answerQr'), $('#answerQrHint'), pendingAnswer, 'ответ');
    $('#lobbyMessage').textContent = 'Ответ готов. Покажи QR хосту и оставь этот экран открытым.';
  } catch (error) {
    showLobbyError(humanNetworkError(error));
  } finally {
    $('#acceptInviteButton').disabled = false;
  }
}

async function scanAndAcceptOffer() {
  try {
    const signal = await scanPairingSignal('offer');
    if (!signal) return;
    $('#offerInput').value = signal;
    await acceptBrowserInvite(signal);
  } catch (error) {
    if (error?.message !== 'QR scan cancelled') showLobbyError(humanQrError(error));
  }
}

async function scanAndCompleteAnswer() {
  try {
    const signal = await scanPairingSignal('answer');
    if (!signal) return;
    $('#answerInput').value = signal;
    await completeBrowserInvite(signal);
  } catch (error) {
    if (error?.message !== 'QR scan cancelled') showLobbyError(humanQrError(error));
  }
}

async function renderPairingQr(container, hint, signal, label) {
  container.replaceChildren();
  if (typeof globalThis.QRCode !== 'function') {
    hint.textContent = 'QR-модуль ещё не загружен. Используй «Поделиться» или длинный код.';
    return false;
  }
  const payload = await encodePairingQrPayload(signal);
  try {
    new globalThis.QRCode(container, {
      text: payload,
      width: 280,
      height: 280,
      colorDark: '#202625',
      colorLight: '#faf7f0',
      correctLevel: globalThis.QRCode.CorrectLevel.L
    });
    hint.textContent = payload.startsWith('PWQ1.') ? `Сжатый QR: ${label} передаётся полностью офлайн.` : `QR: ${label} передаётся полностью офлайн.`;
    return true;
  } catch {
    container.replaceChildren();
    hint.textContent = 'Сигнал слишком большой для QR. Используй «Поделиться» или длинный код ниже.';
    return false;
  }
}

async function encodePairingQrPayload(signal) {
  if (typeof signal !== 'string' || !signal.startsWith('PWL1.')) throw new TypeError('Not a PocketLAN signal');
  if (typeof CompressionStream !== 'function') return signal;
  try {
    const compressed = await transformBytes(new TextEncoder().encode(signal), new CompressionStream('gzip'));
    const packed = `PWQ1.${bytesToBase64Url(compressed)}`;
    return packed.length < signal.length ? packed : signal;
  } catch {
    return signal;
  }
}

async function decodePairingQrPayload(payload) {
  const value = String(payload || '').trim();
  if (value.startsWith('PWL1.')) return value;
  if (!value.startsWith('PWQ1.')) throw new TypeError('Это не QR-код PocketLAN.');
  if (typeof DecompressionStream !== 'function') throw new Error('Браузер не умеет распаковать этот QR. Используй ручной код.');
  const bytes = base64UrlToBytes(value.slice(5));
  const decoded = await transformBytes(bytes, new DecompressionStream('gzip'));
  const signal = new TextDecoder().decode(decoded);
  if (!signal.startsWith('PWL1.')) throw new TypeError('QR-код повреждён.');
  return signal;
}

async function transformBytes(bytes, transform) {
  const writer = transform.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  return new Uint8Array(await new Response(transform.readable).arrayBuffer());
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function scanPairingSignal(expectedKind) {
  if (typeof globalThis.jsQR !== 'function') throw new Error('QR-сканер ещё не загружен. Открой длинный код или попробуй снова.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камера недоступна в этом браузере. Используй QR из Фото или ручной код.');
  stopQrCamera();
  qrScanExpectedKind = expectedKind;
  $('#qrScannerTitle').textContent = expectedKind === 'offer' ? 'Сканируй приглашение' : 'Сканируй ответ';
  $('#qrScannerStatus').textContent = 'Наведи камеру на QR-код второго телефона.';
  $('#qrImageInput').value = '';
  $('#qrScannerDialog').showModal();

  const promise = new Promise((resolve, reject) => {
    qrScanResolve = resolve;
    qrScanReject = reject;
  });

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    const video = $('#qrVideo');
    video.srcObject = qrStream;
    await video.play();
    qrScanLastAt = 0;
    qrScanFrame = requestAnimationFrame(scanQrFrame);
  } catch {
    $('#qrScannerStatus').textContent = 'Камера не открылась. Разреши доступ или выбери QR из Фото.';
  }

  return promise;
}

async function scanQrFrame(now) {
  if (!qrScanResolve || !$('#qrScannerDialog').open) return;
  qrScanFrame = requestAnimationFrame(scanQrFrame);
  if (now - qrScanLastAt < 110) return;
  qrScanLastAt = now;
  const video = $('#qrVideo');
  if (!video.videoWidth || video.readyState < 2) return;
  const canvas = $('#qrScanCanvas');
  const scale = Math.min(1, 720 / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const code = globalThis.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
  if (!code?.data) return;
  await acceptScannedQr(code.data);
}

async function acceptScannedQr(raw) {
  try {
    const signal = await decodePairingQrPayload(raw);
    const parsed = decodePocketLanSignal(signal);
    if (parsed.kind !== qrScanExpectedKind) {
      $('#qrScannerStatus').textContent = qrScanExpectedKind === 'offer' ? 'Это ответ. Нужен QR приглашения хоста.' : 'Это приглашение. Нужен QR ответа игрока.';
      return false;
    }
    playTone('claim');
    finishQrScan(signal);
    return true;
  } catch (error) {
    $('#qrScannerStatus').textContent = humanQrError(error);
    return false;
  }
}

async function handleQrImageFile(event) {
  const file = event.target.files?.[0];
  if (!file || typeof globalThis.jsQR !== 'function') return;
  try {
    const image = new Image();
    const url = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      });
      const canvas = $('#qrScanCanvas');
      const scale = Math.min(1, 1200 / image.naturalWidth);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = globalThis.jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
      if (!code?.data) throw new Error('QR не найден на изображении.');
      await acceptScannedQr(code.data);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    $('#qrScannerStatus').textContent = humanQrError(error);
  }
}

function finishQrScan(value, error = null) {
  stopQrCamera();
  if ($('#qrScannerDialog').open) $('#qrScannerDialog').close();
  const resolve = qrScanResolve;
  const reject = qrScanReject;
  qrScanResolve = null;
  qrScanReject = null;
  qrScanExpectedKind = null;
  if (error) reject?.(error);
  else resolve?.(value);
}

function stopQrCamera() {
  cancelAnimationFrame(qrScanFrame);
  qrScanFrame = 0;
  for (const track of qrStream?.getTracks?.() || []) track.stop();
  qrStream = null;
  const video = $('#qrVideo');
  if (video) video.srcObject = null;
}

function humanQrError(error) {
  const text = String(error?.message || error || '');
  if (/permission|denied|notallowed/i.test(text)) return 'Доступ к камере запрещён. Разреши камеру или выбери QR из Фото.';
  if (/notfound|device/i.test(text)) return 'Камера не найдена. Выбери QR из Фото или используй длинный код.';
  if (/PocketLAN|PWL1|PWQ1|QR/i.test(text)) return text;
  return 'Не удалось прочитать QR. Держи оба телефона ровно и попробуй ещё раз.';
}

function bindRoomEvents() {
  if (!room?.on) return;
  room.on('peerjoin', ({ peer }) => {
    if (!peer?.id) return;
    if (isHost) {
      if (!peerSeats.has(peer.id)) {
        const seat = nextOpenSeat();
        if (seat === null) return;
        peerSeats.set(peer.id, seat);
        lobbyProfiles[seat] = { id: peer.id, name: peer.name || `Игрок ${seat + 1}` };
      }
      broadcastLobby();
      renderLobbySlots();
      updateStartButton();
      if (!capabilities?.automaticDiscovery && lobbyProfiles.filter(Boolean).length < MODES[mode].players) createBrowserInvite();
    } else {
      hostPeerId = peer.id;
      setLanStatus('Соединение установлено', 'ok');
      $('#lobbyMessage').textContent = 'Подключено. Ждём остальных игроков и старт хоста.';
    }
  });
  room.on('peerleave', ({ peer }) => {
    if (game) {
      pulseMessage(`${peer?.name || 'Игрок'} отключился. Матч остановлен.`);
      setTimeout(leaveToHome, 900);
      return;
    }
    if (isHost && peer?.id && peerSeats.has(peer.id)) {
      const seat = peerSeats.get(peer.id);
      peerSeats.delete(peer.id);
      lobbyProfiles[seat] = null;
      renderLobbySlots();
      broadcastLobby();
      updateStartButton();
    }
  });
  room.on('message', (message) => handleRoomMessage(message));
  room.on('state', ({ type, state }) => {
    if (type === 'connection-state' && ['failed', 'closed'].includes(state)) {
      pulseMessage('Локальное соединение потеряно.');
    }
  });
}

function nextOpenSeat() {
  for (let seat = 1; seat < MODES[mode].players; seat += 1) if (!lobbyProfiles[seat]) return seat;
  return null;
}

function lobbySnapshot() {
  return {
    mode,
    required: MODES[mode].players,
    players: Array.from({ length: MODES[mode].players }, (_, seat) => lobbyProfiles[seat] ? { seat, ...lobbyProfiles[seat], color: COLORS[seat], team: mode === 'team' ? [0, 1, 0, 1][seat] : seat } : null)
  };
}

function broadcastLobby() {
  if (!isHost || !room) return;
  const snapshot = lobbySnapshot();
  room.broadcast('lobby', snapshot);
  for (const [peerId, seat] of peerSeats.entries()) room.send(peerId, 'welcome', { seat, ...snapshot });
}

function handleRoomMessage({ peer, type, payload }) {
  if (isHost) {
    if (type === 'move-request') {
      const seat = peerSeats.get(peer?.id);
      if (!Number.isInteger(seat) || !game || payload?.revision !== game.revision) {
        if (peer?.id && game) room.send(peer.id, 'state', game);
        return;
      }
      applyAuthoritativeMove(seat, payload?.edge);
    }
    return;
  }

  if (type === 'welcome') {
    if (!hostPeerId && peer?.id) hostPeerId = peer.id;
    if (hostPeerId && peer?.id && peer.id !== hostPeerId) return;
    if (Number.isInteger(payload?.seat)) localSeat = payload.seat;
    if (payload?.mode === mode) renderLobbySlots(payload.players);
  } else if (hostPeerId && peer?.id && peer.id !== hostPeerId) {
    return;
  } else if (type === 'lobby') {
    if (payload?.mode === mode) renderLobbySlots(payload.players);
  } else if (type === 'start' || type === 'state') {
    if (!validateGameState(payload)) return;
    game = payload;
    openGame();
  }
}

function renderLobbySlots(provided = null) {
  const required = MODES[mode]?.players || 2;
  const data = provided || Array.from({ length: required }, (_, seat) => lobbyProfiles[seat] ? { seat, ...lobbyProfiles[seat] } : null);
  const list = $('#slotsList');
  list.replaceChildren();
  let connected = 0;
  for (let seat = 0; seat < required; seat += 1) {
    const player = data[seat];
    if (player) connected += 1;
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.innerHTML = `<span class="slot-color" style="background:${COLORS[seat]}"></span><b></b><small></small>`;
    row.querySelector('b').textContent = player?.name || `Место ${seat + 1}`;
    row.querySelector('small').textContent = player ? (mode === 'team' ? `Команда ${seat % 2 === 0 ? 'A' : 'B'}` : 'подключён') : 'ожидаем';
    list.append(row);
  }
  $('#slotsCount').textContent = `${connected} / ${required}`;
  $('#slotsPanel').hidden = false;
}

function updateStartButton() {
  const button = $('#startNetworkGameButton');
  if (!isHost) { button.hidden = true; return; }
  const connected = lobbyProfiles.filter(Boolean).length;
  button.hidden = false;
  button.disabled = connected !== MODES[mode].players;
  button.textContent = connected === MODES[mode].players ? 'Начать матч' : `Ждём игроков · ${connected}/${MODES[mode].players}`;
}

function startNetworkMatch() {
  if (!isHost || lobbyProfiles.filter(Boolean).length !== MODES[mode].players) return;
  const players = makePlayers(MODES[mode].players, lobbyProfiles);
  game = createGame({ mode, players });
  localSeat = 0;
  room.broadcast('start', game);
  openGame();
}

function rematch() {
  resultOverlay.hidden = true;
  if (mode === 'ai') return startAiGame();
  if (!room) return leaveToHome();
  if (!isHost) {
    $('#gameMessage').textContent = 'Ждём, пока хост запустит реванш.';
    return;
  }
  const players = game.players.map((player) => ({ id: player.id, name: player.name }));
  game = createGame({ mode, players: makePlayers(players.length, players) });
  room.broadcast('start', game);
  openGame();
}

function showResult() {
  playTone('finish');
  resultOverlay.hidden = false;
  const teamScores = getTeamScores(game);
  const best = Math.max(...teamScores.map((entry) => entry.score));
  const winners = teamScores.filter((entry) => entry.score === best);
  if (winners.length > 1) {
    $('#resultTitle').textContent = 'Ничья';
    $('#resultText').textContent = 'Поле поделено поровну.';
  } else if (mode === 'team') {
    $('#resultTitle').textContent = `Команда ${winners[0].team === 0 ? 'A' : 'B'}`;
    $('#resultText').textContent = `Команда замкнула ${best} клеток.`;
  } else {
    const winnerSeat = game.players.findIndex((player) => player.team === winners[0].team);
    $('#resultTitle').textContent = game.players[winnerSeat].name;
    $('#resultText').textContent = `Замкнуто клеток: ${best}.`;
  }
  const scores = $('#resultScores');
  scores.replaceChildren();
  game.players.forEach((player, index) => {
    const row = document.createElement('div');
    row.className = 'result-score-row';
    row.innerHTML = `<span></span><strong>${game.scores[index]}</strong>`;
    row.querySelector('span').textContent = player.name;
    scores.append(row);
  });
  $('#rematchButton').textContent = mode !== 'ai' && !isHost ? 'Ждать реванш' : 'Ещё раз';
  saveAiGame();
}

function showLanStatus(text) {
  $('#lobbyStatusPanel').hidden = false;
  setLanStatus(text, 'waiting');
}

function setLanStatus(text, kind = 'waiting') {
  $('#lanStatusText').textContent = text;
  $('#lanStatusDot').className = `status-dot${kind === 'ok' ? ' ok' : kind === 'bad' ? ' bad' : ''}`;
}

function showLobbyError(message) {
  setLanStatus('Нужно проверить соединение', 'bad');
  $('#lobbyStatusPanel').hidden = false;
  $('#lobbyMessage').textContent = message;
}

function humanNetworkError(error) {
  const text = String(error?.message || error || 'Неизвестная ошибка');
  if (/protocol|application/i.test(text)) return 'Версии игры не совпадают. Обнови ЗАМКНИ на обоих устройствах.';
  if (/WebRTC|browser|unavailable/i.test(text)) return 'Этот браузер не поддерживает текущий режим PocketLAN.';
  if (/corrupt|signal|pair/i.test(text)) return 'Код pairing повреждён или относится к другой игре.';
  return 'Не удалось соединить устройства. Проверь общую Wi‑Fi/hotspot сеть и отключи Guest Wi‑Fi или client isolation.';
}

async function copySignal(value) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    showToast('Скопировано');
  } catch {
    showToast('Выдели текст и скопируй вручную');
  }
}

async function shareSignal(value, title) {
  if (!value) return;
  if (navigator.share) {
    try { await navigator.share({ title, text: value }); return; } catch { /* user cancelled */ }
  }
  copySignal(value);
}

function pulseMessage(text) {
  $('#gameMessage').textContent = text;
  if (navigator.vibrate) navigator.vibrate(12);
}

function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 1400);
}

function playTone(kind) {
  if (!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = kind === 'claim' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(kind === 'finish' ? 310 : kind === 'claim' ? 520 : 240, now);
    if (kind === 'finish') oscillator.frequency.exponentialRampToValueAtTime(620, now + .18);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === 'finish' ? .09 : .045, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + (kind === 'finish' ? .28 : .1));
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + .3);
  } catch { /* audio is optional */ }
}

function resetNetworkState() {
  try { room?.close?.(); } catch { /* best effort */ }
  room = null;
  pendingRoom = null;
  pendingAnswer = '';
  hostPeerId = null;
  isHost = false;
  lobbyProfiles = [];
  peerSeats = new Map();
  lan = null;
  capabilities = null;
  $('#offerOutput').value = '';
  $('#offerInput').value = '';
  $('#answerOutput').value = '';
  $('#answerInput').value = '';
  $('#answerOutputBlock').hidden = true;
  $('#offerQr')?.replaceChildren();
  $('#answerQr')?.replaceChildren();
  stopQrCamera();
}

function leaveToHome() {
  resultOverlay.hidden = true;
  if (settingsDialog.open) settingsDialog.close();
  if (mode !== 'ai') resetNetworkState();
  game = null;
  mode = null;
  aiBusy = false;
  showScreen(homeScreen);
  restoreAiCard();
}

window.addEventListener('pagehide', () => {
  if (mode === 'ai') saveAiGame();
  else room?.close?.();
});
