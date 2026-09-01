import { installMobileRuntime } from '../../shared/mobile-runtime.js';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:munchkin-level-forge:state';
const STATE_VERSION = 1;
const TOKENS = ['sword', 'skull', 'potion', 'helmet', 'dragon', 'coin', 'shield', 'boot'];
const TOKEN_COLORS = ['#8d3d2f', '#4b5260', '#4f7750', '#73532e', '#7a3f56', '#a36b20', '#375c69', '#745536'];
const TOKEN_RADII = ['48% 44% 52% 46%', '42% 50% 44% 54%', '50% 50% 42% 42%', '46% 46% 54% 54%', '55% 41% 55% 41%', '50%', '28% 28% 48% 48%', '45% 55% 42% 58%'];
const DEFAULT_NAMES = Array.from({ length: 8 }, (_, index) => `Игрок ${index + 1}`);

const $ = (selector) => document.querySelector(selector);
const refs = {
  body: document.body,
  wheel: $('#wheel'), levelMarks: $('#levelMarks'), tokenLayer: $('#tokenLayer'), dragon: $('#dragonCrest'),
  selectedLevelBig: $('#selectedLevelBig'), selectedName: $('#selectedName'), selectedToken: $('#selectedToken'),
  modeLabel: $('#modeLabel'), targetLabel: $('#targetLabel'), playerLedger: $('#playerLedger'),
  minusButton: $('#minusButton'), plusButton: $('#plusButton'), selectedPlayerButton: $('#selectedPlayerButton'),
  undoButton: $('#undoButton'), editPlayersButton: $('#editPlayersButton'), muteButton: $('#muteButton'),
  tableButton: $('#tableButton'), settingsButton: $('#settingsButton'), homeScreen: $('#homeScreen'),
  continueButton: $('#continueButton'), newGameButton: $('#newGameButton'), setupScreen: $('#setupScreen'),
  setupBackButton: $('#setupBackButton'), playerCountMinus: $('#playerCountMinus'), playerCountPlus: $('#playerCountPlus'),
  playerCountValue: $('#playerCountValue'), setupPlayers: $('#setupPlayers'), quickGameButton: $('#quickGameButton'),
  startGameButton: $('#startGameButton'), sheetBackdrop: $('#sheetBackdrop'), settingsSheet: $('#settingsSheet'),
  settingsCloseButton: $('#settingsCloseButton'), soundSetting: $('#soundSetting'), ambientSetting: $('#ambientSetting'),
  soundSettingValue: $('#soundSettingValue'), ambientSettingValue: $('#ambientSettingValue'), settingsModeValue: $('#settingsModeValue'),
  sheetEditPlayers: $('#sheetEditPlayers'), sheetHomeButton: $('#sheetHomeButton'), resetButton: $('#resetButton'),
  editPlayersModal: $('#editPlayersModal'), editPlayersList: $('#editPlayersList'), editPlayersClose: $('#editPlayersClose'),
  savePlayersButton: $('#savePlayersButton'), confirmModal: $('#confirmModal'), confirmCancel: $('#confirmCancel'),
  confirmAccept: $('#confirmAccept'), victoryLayer: $('#victoryLayer'), winnerName: $('#winnerName'), winnerLine: $('#winnerLine'),
  victoryDismiss: $('#victoryDismiss'), victoryNewGame: $('#victoryNewGame'), coinBurst: $('#coinBurst'), toast: $('#toast'),
  liveRegion: $('#liveRegion')
};

let state = loadState();
let setupDraft = createSetupDraft(state?.players?.length || 4, state?.mode || 'normal');
let confirmAction = null;
let audioContext = null;
let pointerAccumulator = -54;
let lastSelectedId = null;
let renderedTarget = 0;
let toastTimer = 0;
let victoryTimer = 0;

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function cleanName(value) { return String(value ?? '').trim().slice(0, 28) || 'Безымянный манчкин'; }
function maxLevel(source = state) { return source?.mode === 'epic' ? 20 : 10; }
function selectedPlayer() { return state?.players.find((player) => player.id === state.selectedId) || state?.players[0]; }
function playerId(index) { return globalThis.crypto?.randomUUID?.() || `m-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`; }

function normalizeUniqueTokens(players) {
  const used = new Set();
  players.forEach((player, index) => {
    let token = TOKENS.includes(player.token) ? player.token : TOKENS[index];
    if (used.has(token)) token = TOKENS.find((candidate) => !used.has(candidate)) || token;
    player.token = token;
    used.add(token);
  });
  return players;
}

function createInitialState(count = 4, mode = 'normal', draftPlayers = null) {
  const players = normalizeUniqueTokens(Array.from({ length: count }, (_, index) => ({
    id: playerId(index),
    name: cleanName(draftPlayers?.[index]?.name || DEFAULT_NAMES[index]),
    token: TOKENS.includes(draftPlayers?.[index]?.token) ? draftPlayers[index].token : TOKENS[index],
    level: 1,
    colorIndex: index
  })));
  return {
    version: STATE_VERSION,
    mode: mode === 'epic' ? 'epic' : 'normal',
    players,
    selectedId: players[0].id,
    settings: { sound: true, ambient: true },
    history: [],
    updatedAt: Date.now()
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || parsed.version !== STATE_VERSION || !Array.isArray(parsed.players) || parsed.players.length < 2 || parsed.players.length > 8) return null;
    parsed.mode = parsed.mode === 'epic' ? 'epic' : 'normal';
    parsed.settings = { sound: parsed.settings?.sound !== false, ambient: parsed.settings?.ambient !== false };
    parsed.history = Array.isArray(parsed.history) ? parsed.history.slice(-30) : [];
    const target = maxLevel(parsed);
    parsed.players = normalizeUniqueTokens(parsed.players.map((player, index) => ({
      id: String(player.id || `restored-${index}`),
      name: cleanName(player.name || DEFAULT_NAMES[index]),
      token: TOKENS.includes(player.token) ? player.token : TOKENS[index],
      level: clamp(Number(player.level) || 1, 1, target),
      colorIndex: clamp(Number(player.colorIndex) || index, 0, TOKEN_COLORS.length - 1)
    })));
    if (!parsed.players.some((player) => player.id === parsed.selectedId)) parsed.selectedId = parsed.players[0].id;
    return parsed;
  } catch {
    return null;
  }
}

function saveState() {
  if (!state) return;
  state.updatedAt = Date.now();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Private browsing can reject storage. */ }
}

function snapshot(label = '') {
  return {
    label,
    mode: state.mode,
    selectedId: state.selectedId,
    players: state.players.map(({ id, name, token, level, colorIndex }) => ({ id, name, token, level, colorIndex }))
  };
}

function pushHistory(label) {
  state.history.push(snapshot(label));
  if (state.history.length > 30) state.history.shift();
}

function createSetupDraft(count, mode) {
  const source = state?.players || [];
  return {
    count: clamp(count, 2, 8),
    mode: mode === 'epic' ? 'epic' : 'normal',
    players: normalizeUniqueTokens(Array.from({ length: 8 }, (_, index) => ({
      name: cleanName(source[index]?.name || DEFAULT_NAMES[index]),
      token: TOKENS.includes(source[index]?.token) ? source[index].token : TOKENS[index]
    })))
  };
}

function angleForLevel(level, target = maxLevel()) { return -90 + level * (360 / target); }
function pointForLevel(level, radius = 42, target = maxLevel()) {
  const angle = angleForLevel(level, target) * Math.PI / 180;
  return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius, angle };
}

function renderAll({ mechanical = false } = {}) {
  if (!state) return;
  refs.body.classList.toggle('ambient-on', state.settings.ambient);
  refs.wheel.classList.toggle('epic', state.mode === 'epic');
  refs.modeLabel.textContent = state.mode === 'epic' ? 'Epic-партия' : 'Обычная партия';
  refs.targetLabel.textContent = `Цель: ${maxLevel()}`;
  refs.settingsModeValue.textContent = String(maxLevel());
  refs.soundSettingValue.textContent = state.settings.sound ? 'Вкл.' : 'Выкл.';
  refs.ambientSettingValue.textContent = state.settings.ambient ? 'Вкл.' : 'Выкл.';
  refs.muteButton.classList.toggle('is-muted', !state.settings.sound);
  refs.muteButton.textContent = state.settings.sound ? '♪' : '×';
  refs.muteButton.setAttribute('aria-label', state.settings.sound ? 'Выключить звук' : 'Включить звук');
  renderLevels();
  renderTokens();
  renderLedger();
  renderSelected(mechanical);
  refs.undoButton.disabled = state.history.length === 0;
  updateLeaderGaze();
}

function renderLevels() {
  const target = maxLevel();
  if (renderedTarget === target && refs.levelMarks.childElementCount === target) return;
  renderedTarget = target;
  refs.levelMarks.replaceChildren();
  for (let level = 1; level <= target; level += 1) {
    const point = pointForLevel(level);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `level-mark${level === target ? ' target' : ''}`;
    button.textContent = level;
    button.style.setProperty('--x', `${point.x}%`);
    button.style.setProperty('--y', `${point.y}%`);
    button.style.setProperty('--tilt', `${((level * 7) % 9) - 4}deg`);
    button.dataset.level = String(level);
    button.setAttribute('aria-label', `Переместить выбранного игрока на уровень ${level}`);
    button.addEventListener('click', () => moveSelectedTo(level, 'direct'));
    refs.levelMarks.append(button);
  }
}

function fanOffset(index, total, point) {
  if (total <= 1) return { x: 0, y: 0 };
  const spacing = total <= 3 ? 18 : 14;
  const scalar = (index - (total - 1) / 2) * spacing;
  return { x: -Math.sin(point.angle) * scalar, y: Math.cos(point.angle) * scalar };
}

function renderTokens() {
  const groups = new Map();
  state.players.forEach((player) => {
    if (!groups.has(player.level)) groups.set(player.level, []);
    groups.get(player.level).push(player);
  });
  const existing = new Map([...refs.tokenLayer.children].map((node) => [node.dataset.playerId, node]));
  const live = new Set();

  state.players.forEach((player, playerIndex) => {
    const point = pointForLevel(player.level, state.mode === 'epic' ? 36.5 : 35.5);
    const group = groups.get(player.level);
    const groupIndex = group.findIndex((candidate) => candidate.id === player.id);
    const fan = fanOffset(groupIndex, group.length, point);
    let token = existing.get(player.id);
    if (!token) {
      token = document.createElement('button');
      token.type = 'button';
      token.className = 'player-token';
      token.dataset.playerId = player.id;
      token.addEventListener('click', (event) => { event.stopPropagation(); selectPlayer(player.id); });
      refs.tokenLayer.append(token);
      requestAnimationFrame(() => token.classList.add('token-mounted'));
    }
    live.add(player.id);
    token.innerHTML = tokenSvg(player.token);
    token.style.setProperty('--x', `${point.x}%`);
    token.style.setProperty('--y', `${point.y}%`);
    token.style.setProperty('--fan-x', `${fan.x}px`);
    token.style.setProperty('--fan-y', `${fan.y}px`);
    token.style.setProperty('--token-color', TOKEN_COLORS[player.colorIndex % TOKEN_COLORS.length]);
    token.style.setProperty('--token-radius', TOKEN_RADII[playerIndex % TOKEN_RADII.length]);
    token.style.setProperty('--token-tilt', `${((playerIndex * 5) % 9) - 4}deg`);
    token.classList.toggle('selected', player.id === state.selectedId);
    token.setAttribute('aria-label', `${player.name}, уровень ${player.level}. Выбрать игрока`);
  });

  existing.forEach((node, id) => { if (!live.has(id)) node.remove(); });
}

function renderLedger() {
  refs.playerLedger.replaceChildren();
  state.players.forEach((player, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `player-card${player.id === state.selectedId ? ' selected' : ''}`;
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', `Выбрать ${player.name}, уровень ${player.level}`);
    button.innerHTML = `<span class="player-card-token" style="color:${TOKEN_COLORS[player.colorIndex % TOKEN_COLORS.length]}">${tokenSvg(player.token)}</span><span class="player-card-name"><strong>${escapeHtml(player.name)}</strong><small>${tokenTitle(player.token)}</small></span><span class="player-card-level">${player.level}</span>`;
    button.addEventListener('click', () => selectPlayer(player.id));
    refs.playerLedger.append(button);
    if (index === 0 && state.players.length === 0) button.disabled = true;
  });
}

function renderSelected(mechanical = false) {
  const player = selectedPlayer();
  if (!player) return;
  refs.selectedName.textContent = player.name;
  refs.selectedLevelBig.textContent = String(player.level);
  refs.selectedToken.innerHTML = tokenSvg(player.token);
  refs.selectedToken.style.color = TOKEN_COLORS[player.colorIndex % TOKEN_COLORS.length];
  refs.minusButton.disabled = player.level <= 1;
  refs.plusButton.disabled = player.level >= maxLevel();

  const desired = angleForLevel(player.level);
  if (lastSelectedId !== player.id || !Number.isFinite(pointerAccumulator)) pointerAccumulator = desired;
  else {
    let delta = ((desired - pointerAccumulator + 540) % 360) - 180;
    if (Math.abs(delta) < .001 && desired !== pointerAccumulator) delta = 360 / maxLevel();
    pointerAccumulator += delta;
  }
  lastSelectedId = player.id;
  refs.wheel.style.setProperty('--pointer-angle', `${pointerAccumulator}deg`);
  refs.wheel.style.setProperty('--gear-angle', `${pointerAccumulator * 2.35}deg`);
  refs.wheel.style.setProperty('--gear-angle-b', `${-pointerAccumulator * 2.9}deg`);
  if (mechanical) refs.wheel.classList.add('mechanical-hit');
  requestAnimationFrame(() => refs.wheel.classList.remove('mechanical-hit'));
}

function updateLeaderGaze() {
  if (!state?.players.length) return;
  const leader = state.players.reduce((best, player) => player.level > best.level ? player : best, state.players[0]);
  const point = pointForLevel(leader.level, 1);
  refs.dragon.style.setProperty('--look-x', `${clamp((point.x - 50) * .12, -3.2, 3.2)}px`);
  refs.dragon.style.setProperty('--look-y', `${clamp((point.y - 50) * .12, -2.4, 2.4)}px`);
}

function selectPlayer(id) {
  if (!state || !state.players.some((player) => player.id === id)) return;
  if (state.selectedId === id) return;
  state.selectedId = id;
  lastSelectedId = null;
  saveState();
  clickSound('select');
  haptic(10);
  renderAll({ mechanical: true });
  announce(`Выбран ${selectedPlayer().name}, уровень ${selectedPlayer().level}`);
}

function changeSelected(delta) {
  const player = selectedPlayer();
  if (!player) return;
  moveSelectedTo(player.level + delta, delta > 0 ? 'up' : 'down');
}

function moveSelectedTo(rawLevel, source = 'direct') {
  const player = selectedPlayer();
  if (!player) return;
  const next = clamp(Number(rawLevel) || player.level, 1, maxLevel());
  if (next === player.level) {
    clickSound('blocked');
    haptic(18);
    refs.wheel.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }], { duration: 150 });
    return;
  }

  const previous = player.level;
  pushHistory(`${player.name}: ${previous} → ${next}`);
  player.level = next;
  saveState();
  clickSound(next > previous ? 'up' : 'down');
  haptic(next > previous ? 12 : [10, 22, 10]);
  renderAll({ mechanical: true });
  announce(`${player.name}: уровень ${next}`);

  if (next < previous) animateLoss(player.id, previous);
  if (next === maxLevel()) triggerVictory(player);
  else if (source === 'direct') showToast(`${player.name} → уровень ${next}`);
}

function animateLoss(playerIdValue, previousLevel) {
  const token = [...refs.tokenLayer.children].find((node) => node.dataset.playerId === playerIdValue);
  token?.classList.add('level-loss');
  setTimeout(() => token?.classList.remove('level-loss'), 450);
  if (previousLevel === maxLevel() - 1) {
    refs.dragon.classList.remove('wince');
    void refs.dragon.offsetWidth;
    refs.dragon.classList.add('wince');
    setTimeout(() => refs.dragon.classList.remove('wince'), 520);
    showToast(`С ${previousLevel}-го вниз. Дракон осуждает.`);
  }
}

function undo() {
  if (!state?.history.length) {
    clickSound('blocked');
    showToast('Отматывать уже некуда.');
    return;
  }
  const currentSettings = { ...state.settings };
  const previous = state.history.pop();
  state.mode = previous.mode;
  state.players = normalizeUniqueTokens(previous.players.map((player) => ({ ...player })));
  state.selectedId = previous.selectedId;
  state.settings = currentSettings;
  renderedTarget = 0;
  lastSelectedId = null;
  saveState();
  clickSound('undo');
  haptic([8, 20, 8]);
  renderAll({ mechanical: true });
  showToast(previous.label ? `Отменено: ${previous.label}` : 'Последнее изменение отменено');
}

function triggerVictory(player) {
  clearTimeout(victoryTimer);
  refs.winnerName.textContent = player.name;
  refs.winnerLine.textContent = `Уровень ${maxLevel()}. Остальные официально могут завидовать.`;
  refs.victoryLayer.hidden = false;
  refs.dragon.classList.remove('celebrate');
  void refs.dragon.offsetWidth;
  refs.dragon.classList.add('celebrate');
  const winnerToken = [...refs.tokenLayer.children].find((node) => node.dataset.playerId === player.id);
  winnerToken?.animate?.([
    { transform: getComputedStyle(winnerToken).transform, filter: 'brightness(1)' },
    { transform: `${getComputedStyle(winnerToken).transform} scale(1.35)`, filter: 'brightness(1.5)' },
    { transform: getComputedStyle(winnerToken).transform, filter: 'brightness(1.08)' }
  ], { duration: 520, easing: 'cubic-bezier(.13,.82,.28,1.4)' });
  burstCoins();
  victorySound();
  haptic([28, 30, 28, 30, 70]);
  announce(`${player.name} победил на уровне ${maxLevel()}`);
  victoryTimer = setTimeout(() => {
    refs.victoryLayer.hidden = true;
    refs.dragon.classList.remove('celebrate');
  }, 4300);
}

function burstCoins() {
  refs.coinBurst.replaceChildren();
  const count = matchMedia('(prefers-reduced-motion: reduce)').matches ? 8 : 28;
  for (let index = 0; index < count; index += 1) {
    const coin = document.createElement('span');
    coin.className = 'burst-coin';
    const angle = (Math.PI * 2 * index / count) + (Math.random() - .5) * .35;
    const distance = 120 + Math.random() * 220;
    coin.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    coin.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    coin.style.setProperty('--spin', `${Math.random() * 160 - 80}deg`);
    coin.style.setProperty('--dur', `${680 + Math.random() * 430}ms`);
    refs.coinBurst.append(coin);
  }
  setTimeout(() => refs.coinBurst.replaceChildren(), 1250);
}

function openHome() {
  if (!state) return openSetup();
  closeSettings();
  refs.setupScreen.hidden = true;
  refs.editPlayersModal.hidden = true;
  refs.confirmModal.hidden = true;
  refs.victoryLayer.hidden = true;
  refs.homeScreen.hidden = false;
  saveState();
}

function closeOverlaysForGame() {
  refs.homeScreen.hidden = true;
  refs.setupScreen.hidden = true;
  refs.editPlayersModal.hidden = true;
  refs.confirmModal.hidden = true;
  refs.victoryLayer.hidden = true;
  closeSettings();
}

function openSetup() {
  closeSettings();
  setupDraft = createSetupDraft(state?.players.length || 4, state?.mode || 'normal');
  refs.homeScreen.hidden = true;
  refs.victoryLayer.hidden = true;
  refs.setupScreen.hidden = false;
  renderSetup();
}

function renderSetup() {
  refs.playerCountValue.textContent = String(setupDraft.count);
  refs.playerCountMinus.disabled = setupDraft.count <= 2;
  refs.playerCountPlus.disabled = setupDraft.count >= 8;
  document.querySelectorAll('input[name="setupMode"]').forEach((radio) => { radio.checked = radio.value === setupDraft.mode; });
  refs.setupPlayers.replaceChildren();
  for (let index = 0; index < setupDraft.count; index += 1) {
    const row = document.createElement('div');
    row.className = 'setup-player-row';
    const player = setupDraft.players[index];
    row.innerHTML = `<button class="token-cycle" type="button" data-native-press aria-label="Сменить жетон игрока ${index + 1}" style="--token-color:${TOKEN_COLORS[index]};--token-radius:${TOKEN_RADII[index]}">${tokenSvg(player.token)}</button><input class="player-name-input" type="text" maxlength="28" autocomplete="off" enterkeyhint="done" value="${escapeHtml(player.name)}" aria-label="Имя игрока ${index + 1}">`;
    const button = row.querySelector('button');
    const input = row.querySelector('input');
    button.addEventListener('click', () => {
      player.token = nextUnusedToken(player.token, index, setupDraft.players, setupDraft.count);
      button.innerHTML = tokenSvg(player.token);
      clickSoundForSetup();
    });
    input.addEventListener('input', () => { player.name = input.value.slice(0, 28); });
    input.addEventListener('blur', () => { player.name = cleanName(input.value); input.value = player.name; });
    refs.setupPlayers.append(row);
  }
}

function nextUnusedToken(current, ownerIndex, players, activeCount) {
  const used = new Set(players.slice(0, activeCount).filter((_, index) => index !== ownerIndex).map((player) => player.token));
  const start = TOKENS.indexOf(current);
  for (let offset = 1; offset <= TOKENS.length; offset += 1) {
    const candidate = TOKENS[(start + offset + TOKENS.length) % TOKENS.length];
    if (!used.has(candidate)) return candidate;
  }
  return current;
}

function startGameFromDraft() {
  setupDraft.players.slice(0, setupDraft.count).forEach((player) => { player.name = cleanName(player.name); });
  state = createInitialState(setupDraft.count, setupDraft.mode, setupDraft.players);
  renderedTarget = 0;
  lastSelectedId = null;
  pointerAccumulator = angleForLevel(1, maxLevel(state));
  saveState();
  closeOverlaysForGame();
  clickSound('start');
  haptic([12, 28, 18]);
  renderAll({ mechanical: true });
  showToast('Партия выкована. Можно портить дружбу.');
}

function quickGame() {
  setupDraft = createSetupDraft(4, 'normal');
  setupDraft.count = 4;
  setupDraft.mode = 'normal';
  setupDraft.players.slice(0, 4).forEach((player, index) => { player.name = DEFAULT_NAMES[index]; player.token = TOKENS[index]; });
  startGameFromDraft();
}

function openEditPlayers() {
  if (!state) return;
  closeSettings();
  refs.editPlayersList.replaceChildren();
  state.players.forEach((player, index) => {
    const row = document.createElement('div');
    row.className = 'setup-player-row';
    row.dataset.playerId = player.id;
    row.dataset.token = player.token;
    row.innerHTML = `<button class="token-cycle" type="button" data-native-press aria-label="Сменить жетон ${escapeHtml(player.name)}" style="--token-color:${TOKEN_COLORS[player.colorIndex]};--token-radius:${TOKEN_RADII[index]}">${tokenSvg(player.token)}</button><input class="player-name-input" type="text" maxlength="28" autocomplete="off" value="${escapeHtml(player.name)}" aria-label="Имя игрока ${index + 1}">`;
    const button = row.querySelector('button');
    button.addEventListener('click', () => {
      const editRows = [...refs.editPlayersList.querySelectorAll('.setup-player-row')];
      const used = new Set(editRows.filter((candidate) => candidate !== row).map((candidate) => candidate.dataset.token));
      let tokenIndex = TOKENS.indexOf(row.dataset.token);
      do { tokenIndex = (tokenIndex + 1) % TOKENS.length; } while (used.has(TOKENS[tokenIndex]));
      row.dataset.token = TOKENS[tokenIndex];
      button.innerHTML = tokenSvg(row.dataset.token);
      clickSound('select');
    });
    refs.editPlayersList.append(row);
  });
  refs.editPlayersModal.hidden = false;
}

function saveEditedPlayers() {
  const rows = [...refs.editPlayersList.querySelectorAll('.setup-player-row')];
  if (!rows.length) return;
  pushHistory('редактирование игроков');
  rows.forEach((row) => {
    const player = state.players.find((candidate) => candidate.id === row.dataset.playerId);
    if (!player) return;
    player.name = cleanName(row.querySelector('input').value);
    player.token = TOKENS.includes(row.dataset.token) ? row.dataset.token : player.token;
  });
  normalizeUniqueTokens(state.players);
  refs.editPlayersModal.hidden = true;
  saveState();
  renderAll();
  showToast('Жетоны перекованы.');
}

function openSettings() {
  if (!state) return;
  refs.sheetBackdrop.hidden = false;
  refs.settingsSheet.classList.add('open');
  refs.settingsSheet.setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  refs.settingsSheet.classList.remove('open');
  refs.settingsSheet.setAttribute('aria-hidden', 'true');
  refs.sheetBackdrop.hidden = true;
}

function toggleSound() {
  if (!state) return;
  state.settings.sound = !state.settings.sound;
  saveState();
  renderAll();
  if (state.settings.sound) clickSound('select');
  showToast(state.settings.sound ? 'Звук включён' : 'Звук выключен');
}

function toggleAmbient() {
  if (!state) return;
  state.settings.ambient = !state.settings.ambient;
  saveState();
  renderAll();
  showToast(state.settings.ambient ? 'Стол снова подозрительно живой' : 'Декорации притихли');
}

function askReset() {
  closeSettings();
  confirmAction = () => {
    refs.confirmModal.hidden = true;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignored */ }
    state = null;
    renderedTarget = 0;
    lastSelectedId = null;
    refs.tokenLayer.replaceChildren();
    openSetup();
  };
  refs.confirmModal.hidden = false;
}

async function toggleTableMode() {
  const entering = !refs.body.classList.contains('table-mode');
  refs.body.classList.toggle('table-mode', entering);
  refs.tableButton.classList.toggle('is-active', entering);
  refs.tableButton.setAttribute('aria-label', entering ? 'Выйти из столового режима' : 'Столовый режим');
  if (entering && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { /* Embedded Safari can reject fullscreen. */ }
  } else if (!entering && document.fullscreenElement && document.exitFullscreen) {
    try { await document.exitFullscreen(); } catch { /* ignored */ }
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  refs.toast.textContent = message;
  refs.toast.classList.add('show');
  toastTimer = setTimeout(() => refs.toast.classList.remove('show'), 2200);
}

function announce(message) {
  refs.liveRegion.textContent = '';
  requestAnimationFrame(() => { refs.liveRegion.textContent = message; });
}

function haptic(pattern) { try { navigator.vibrate?.(pattern); } catch { /* progressive enhancement */ } }
function ensureAudio() {
  if (audioContext) return audioContext;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  audioContext = new Context();
  return audioContext;
}

function clickSoundForSetup() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  if (!audioContext) audioContext = new Context();
  playClick(audioContext, 'select');
}

function clickSound(kind = 'up') {
  if (!state?.settings?.sound) return;
  const context = ensureAudio();
  if (!context) return;
  playClick(context, kind);
}

function playClick(context, kind) {
  if (context.state === 'suspended') context.resume().catch(() => {});
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const map = { up: [245, 330, .045], down: [180, 118, .055], select: [280, 245, .032], blocked: [95, 70, .045], undo: [220, 170, .05], start: [170, 260, .08] };
  const [from, to, duration] = map[kind] || map.up;
  oscillator.type = kind === 'blocked' ? 'square' : 'triangle';
  oscillator.frequency.setValueAtTime(from, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, to), now + duration);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === 'blocked' ? .028 : .048, now + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration + .055);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + .065);
}

function victorySound() {
  if (!state?.settings?.sound) return;
  const context = ensureAudio();
  if (!context) return;
  if (context.state === 'suspended') context.resume().catch(() => {});
  const now = context.currentTime;
  [261.63, 329.63, 392, 523.25].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * .095;
    oscillator.type = index === 3 ? 'square' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.03, start + .17);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(.06, start + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .32);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + .34);
  });
}

function tokenTitle(type) {
  return ({ sword: 'меч', skull: 'череп', potion: 'зелье', helmet: 'рогатый шлем', dragon: 'дракон', coin: 'монета', shield: 'щит', boot: 'сапог' })[type] || 'жетон';
}

function tokenSvg(type) {
  const common = 'fill="currentColor" stroke="#25160e" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';
  const paths = {
    sword: `<path ${common} d="M47 8 55 16 38 59 31 52Z"/><path ${common} d="M17 50 48 21 55 28 25 58Z"/><path ${common} d="M18 54 30 66 22 72 10 60Z"/><path ${common} d="M31 45 44 58 39 63 26 50Z"/>`,
    skull: `<path ${common} d="M18 14 Q32 3 46 14 Q57 23 52 40 Q49 50 40 54 L39 64 H25 L24 54 Q14 50 12 39 Q8 24 18 14Z"/><circle cx="24" cy="32" r="6" fill="#25160e"/><circle cx="42" cy="32" r="6" fill="#25160e"/><path d="M29 44 33 40 37 44" fill="none" stroke="#25160e" stroke-width="4"/><path d="M26 57v7M33 56v8M40 57v7" stroke="#25160e" stroke-width="4"/>`,
    potion: `<path ${common} d="M25 9H43V18L39 23Q53 36 49 53Q45 67 34 69Q22 67 18 53Q14 36 29 23L25 18Z"/><path d="M22 45Q34 38 47 45L49 54Q44 67 34 69Q23 67 18 54Z" fill="#e9d894" stroke="#25160e" stroke-width="4"/><path d="M23 10h22" stroke="#25160e" stroke-width="5"/>`,
    helmet: `<path ${common} d="M12 48Q12 19 34 12Q56 19 56 48L47 61H40V43H28V61H21Z"/><path ${common} d="M14 24 5 13 8 33M54 24 63 13 60 33"/><path d="M20 34h28" stroke="#25160e" stroke-width="5"/>`,
    dragon: `<path ${common} d="M11 53Q9 28 26 20L31 8 37 21Q52 22 58 35L66 29 61 50Q54 66 36 65Q20 67 11 53Z"/><path d="M20 42Q29 35 35 42Q43 34 52 42" fill="none" stroke="#25160e" stroke-width="5"/><circle cx="27" cy="38" r="3" fill="#25160e"/><circle cx="45" cy="38" r="3" fill="#25160e"/><path d="M29 53Q36 58 43 52" fill="none" stroke="#25160e" stroke-width="4"/>`,
    coin: `<circle ${common} cx="36" cy="36" r="27"/><circle cx="36" cy="36" r="18" fill="none" stroke="#f3d77d" stroke-width="3"/><path d="M38 18 29 35h10l-6 19 14-24H37Z" fill="#25160e"/>`,
    shield: `<path ${common} d="M10 14Q36 4 62 14V35Q58 57 36 69Q14 57 10 35Z"/><path d="M36 11v52M15 31h42" fill="none" stroke="#ead79d" stroke-width="4" opacity=".75"/>`,
    boot: `<path ${common} d="M20 9H45L42 39Q48 48 64 51L61 63Q42 69 14 61L12 50 22 42Z"/><path d="M20 24h24M18 33h25" stroke="#25160e" stroke-width="4"/>`
  };
  return `<svg viewBox="0 0 72 72" aria-hidden="true" focusable="false">${paths[type] || paths.sword}</svg>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

refs.minusButton.addEventListener('click', () => changeSelected(-1));
refs.plusButton.addEventListener('click', () => changeSelected(1));
refs.undoButton.addEventListener('click', undo);
refs.editPlayersButton.addEventListener('click', openEditPlayers);
refs.selectedPlayerButton.addEventListener('click', () => {
  if (!state) return;
  const currentIndex = state.players.findIndex((player) => player.id === state.selectedId);
  selectPlayer(state.players[(currentIndex + 1) % state.players.length].id);
});
refs.muteButton.addEventListener('click', toggleSound);
refs.tableButton.addEventListener('click', toggleTableMode);
refs.settingsButton.addEventListener('click', openSettings);
refs.settingsCloseButton.addEventListener('click', closeSettings);
refs.sheetBackdrop.addEventListener('click', closeSettings);
refs.soundSetting.addEventListener('click', toggleSound);
refs.ambientSetting.addEventListener('click', toggleAmbient);
refs.sheetEditPlayers.addEventListener('click', openEditPlayers);
refs.sheetHomeButton.addEventListener('click', openHome);
refs.resetButton.addEventListener('click', askReset);
refs.continueButton.addEventListener('click', () => { closeOverlaysForGame(); renderAll(); clickSound('select'); });
refs.newGameButton.addEventListener('click', openSetup);
refs.setupBackButton.addEventListener('click', () => { if (state) openHome(); else location.href = '../../'; });
refs.quickGameButton.addEventListener('click', quickGame);
refs.startGameButton.addEventListener('click', startGameFromDraft);
refs.playerCountMinus.addEventListener('click', () => { setupDraft.count = clamp(setupDraft.count - 1, 2, 8); renderSetup(); });
refs.playerCountPlus.addEventListener('click', () => { setupDraft.count = clamp(setupDraft.count + 1, 2, 8); renderSetup(); });
document.querySelectorAll('input[name="setupMode"]').forEach((radio) => radio.addEventListener('change', (event) => { setupDraft.mode = event.target.value; }));
refs.editPlayersClose.addEventListener('click', () => { refs.editPlayersModal.hidden = true; });
refs.savePlayersButton.addEventListener('click', saveEditedPlayers);
refs.confirmCancel.addEventListener('click', () => { refs.confirmModal.hidden = true; confirmAction = null; });
refs.confirmAccept.addEventListener('click', () => { const action = confirmAction; confirmAction = null; action?.(); });
refs.victoryDismiss.addEventListener('click', () => { clearTimeout(victoryTimer); refs.victoryLayer.hidden = true; refs.dragon.classList.remove('celebrate'); });
refs.victoryNewGame.addEventListener('click', () => { clearTimeout(victoryTimer); refs.victoryLayer.hidden = true; openSetup(); });

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && refs.body.classList.contains('table-mode')) {
    refs.body.classList.remove('table-mode');
    refs.tableButton.classList.remove('is-active');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;
  if (!refs.confirmModal.hidden || !refs.editPlayersModal.hidden || !refs.setupScreen.hidden) {
    if (event.key === 'Escape') {
      refs.confirmModal.hidden = true;
      refs.editPlayersModal.hidden = true;
      if (!refs.setupScreen.hidden && state) openHome();
    }
    return;
  }
  if (event.key === 'Escape') {
    if (refs.settingsSheet.classList.contains('open')) closeSettings();
    else if (!refs.victoryLayer.hidden) refs.victoryLayer.hidden = true;
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); return; }
  if (['ArrowUp', 'ArrowRight', '+', '='].includes(event.key)) { event.preventDefault(); changeSelected(1); return; }
  if (['ArrowDown', 'ArrowLeft', '-'].includes(event.key)) { event.preventDefault(); changeSelected(-1); return; }
  if (/^[1-8]$/.test(event.key) && state) {
    const player = state.players[Number(event.key) - 1];
    if (player) selectPlayer(player.id);
  }
});

window.addEventListener('pagehide', saveState);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveState(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true });
}

if (state) {
  pointerAccumulator = angleForLevel(selectedPlayer().level);
  renderAll();
  openHome();
} else {
  refs.homeScreen.hidden = true;
  refs.setupScreen.hidden = false;
  renderSetup();
}
