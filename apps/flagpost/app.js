import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { PocketNet } from '../../shared/capabilities/net.js';

installMobileRuntime();
createWorkshopMode({
  appName: 'ФЛАГПОСТ', version: '1.0.0',
  cachePrefix: 'flagpost-', storageNamespace: 'pocket-works:flagpost',
  onReset() { try { sessionStorage.removeItem('pocket-works:flagpost:identity'); } catch {} }
});

const root = document.querySelector('#view');
const toastNode = document.querySelector('#toast');
const dialog = document.querySelector('#dialog');
const indicator = document.querySelector('#connection');
const URL_SERVER = location.origin + '/pocketnet';
const STORE = 'pocket-works:flagpost:';
const params = new URLSearchParams(location.search);
const messages = {
  room_not_found: 'Комната не найдена. Проверь код приглашения.',
  room_full: 'В комнате уже два игрока.',
  match_in_progress: 'Матч уже идёт. Присоединиться к нему нельзя.',
  server_at_capacity: 'PocketNet заполнен. Попробуй позже.',
  game_unavailable: 'ФЛАГПОСТ ещё не опубликован на сервере.',
  room_version_unavailable: 'Версия матча недоступна на сервере.',
  invalid_token: 'Гостевая сессия истекла — подключаемся заново.',
  rate_limited: 'Слишком много команд. Подожди немного.',
  not_in_room: 'Ты вышел из комнаты. Создай новую или войди по коду.'
};
const namespace = STORE + 'identity';
const memory = new Map();
const adapter = {
  getItem(key) { try { return sessionStorage.getItem(namespace + ':' + key); } catch { return memory.get(key) || null; } },
  setItem(key, value) { try { sessionStorage.setItem(namespace + ':' + key, value); } catch { memory.set(key, value); } },
  removeItem(key) { try { sessionStorage.removeItem(namespace + ':' + key); } catch { memory.delete(key); } }
};
let channel = null;
let activeToken = null;
try { channel = new BroadcastChannel(STORE + 'live-guests'); } catch {}
channel?.addEventListener('message', event => {
  const value = event.data;
  if (value?.type === 'claim' && activeToken && value.token === activeToken) {
    channel.postMessage({ type: 'owned', nonce: value.nonce });
  }
});
async function separateDuplicateTab() {
  const key = 'pocket-net:' + URL_SERVER;
  let saved;
  try { saved = JSON.parse(adapter.getItem(key) || 'null'); } catch {}
  if (!saved?.token || !channel) return;
  const nonce = crypto.randomUUID();
  const duplicate = await new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      channel.removeEventListener('message', receive);
      clearTimeout(timer);
      resolve(result);
    };
    const receive = event => {
      if (event.data?.type === 'owned' && event.data?.nonce === nonce) finish(true);
    };
    channel.addEventListener('message', receive);
    const timer = setTimeout(() => finish(false), 180);
    channel.postMessage({ type: 'claim', nonce, token: saved.token });
  });
  if (duplicate) adapter.removeItem(key);
}

let savedName = 'Полководец';
try { savedName = localStorage.getItem(STORE + 'name') || savedName; } catch {}
let typedCode = (params.get('room') || '').trim().toUpperCase();
let net = null, state = null, me = null, roomId = null, shortCode = null;
let screen = 'menu', connected = false, serverReady = null, busy = false;
let selected = null, confirmCallback = null, toastTimer = 0, requestId = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}
function toast(value) {
  clearTimeout(toastTimer);
  toastNode.textContent = value;
  toastNode.classList.add('show');
  toastTimer = setTimeout(() => toastNode.classList.remove('show'), 3400);
}
function status(text, kind = '') {
  indicator.textContent = text;
  indicator.className = 'connection ' + kind;
}
async function checkServer() {
  status('Проверка связи');
  try {
    const response = await fetch(URL_SERVER + '/health', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const health = await response.json();
    if (!health.ok || !health.modules?.includes('flagpost')) {
      serverReady = false;
      status('Модуль недоступен', 'bad');
      if (screen === 'menu') render();
      return;
    }
    serverReady = true;
    status('PocketNet готов', 'online');
  } catch {
    serverReady = false;
    status('Сервер недоступен', 'bad');
  }
  if (screen === 'menu') render();
}
function playerSide() { return state?.players.findIndex(player => player.id === me?.id) ?? -1; }
function ownedTurn() { return connected && state?.phase === 'battle' && playerSide() === state.turn; }
function tileAt(x,y) { return state?.units?.find(unit => unit.x === x && unit.y === y); }
function cellIsRock(x,y) { return y === 3 && (x === 0 || x === 4); }
function destination(x,y) {
  if (!selected || !ownedTurn() || busy || state.actions === 0) return false;
  if (Math.abs(x - selected.x) + Math.abs(y - selected.y) !== 1 || cellIsRock(x,y)) return false;
  return tileAt(x,y)?.side !== state.turn;
}
function piece(unit) {
  return `<span class="piece ${unit.side === 0 ? 'north' : 'south'}" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M16 27V21L32 11l16 10v6L43 35v10H21V35Z"/><path d="M12 52h40M18 44h28M27 19v13h10V19"/><path class="fill" d="M28 27h8v8h-8z"/></svg></span>`;
}
function board() {
  let html = '';
  for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
    const unit = tileAt(x,y);
    const rock = cellIsRock(x,y);
    const keep = x === 2 && (y === 0 || y === 6);
    const tower = x === 2 && y === 3;
    const picked = selected?.x === x && selected?.y === y;
    const valid = destination(x,y);
    const classes = ['square', (x + y) % 2 ? 'alt' : '', rock ? 'rock' : '',
      keep ? 'keep' : '', tower ? 'hill tower' : '', picked ? 'selected' : '',
      valid ? (unit ? 'valid capture' : 'valid') : ''].filter(Boolean).join(' ');
    const label = rock ? 'Скалы' : (unit ? (unit.side === 0 ? 'Синий отряд' : 'Красный отряд') : tower ? 'Сигнальная башня' : keep ? 'Крепость' : 'Пустая клетка');
    html += `<button class="${classes}" type="button" data-tile="${x},${y}" aria-label="${label}, колонка ${x + 1}, ряд ${y + 1}" aria-pressed="${picked}" ${rock ? 'disabled' : ''}>${unit ? piece(unit) : ''}</button>`;
  }
  return html;
}
function saveName() {
  const next = root.querySelector('#playerName')?.value.trim().slice(0,22) || savedName;
  savedName = next;
  try { localStorage.setItem(STORE + 'name', savedName); } catch {}
}
function renderMenu() {
  const healthHint = serverReady === false ? 'Сервер PocketNet не отвечает либо игровой модуль ещё не опубликован. Можно повторить проверку.' :
    'Оба игрока входят с разных устройств или вкладок. Никаких ботов: ходы обрабатывает PocketNet.';
  root.innerHTML = `<div class="hero">
    <section class="hero-art"><div class="hero-seal" aria-hidden="true">⚑</div>
      <div class="kicker">Сетевой тактический эксперимент • 1 на 1</div>
      <h1 class="hero-title">ФЛАГ<span>ПОСТ</span></h1>
      <p class="lead">Два полководца. Два приказа за ход. Одна сигнальная башня, которую надо удержать.</p>
      <div class="rule-strip"><span>5 × 7 КЛЕТОК</span><span>2 ПРИКАЗА</span><span>3 ЗНАМЕНИ ДО ПОБЕДЫ</span></div>
    </section>
    <section class="control-stand" aria-labelledby="enter-title">
      <div class="kicker">01 / Штаб</div><h2 class="form-heading" id="enter-title">Открыть партию</h2>
      <label class="label" for="playerName">Твоё имя</label>
      <input id="playerName" class="text-field" maxlength="22" value="${esc(savedName)}" autocomplete="nickname" spellcheck="false">
      <div class="actions-stack">
        <button id="primary-action" class="action accent" data-action="create" type="button">Создать комнату →</button>
      </div>
      <div class="divider-label">или войти к другу</div>
      <label class="label" for="roomCode">Восьмизначный код комнаты</label>
      <input id="roomCode" class="text-field code-field" maxlength="36" inputmode="text" placeholder="A17D0C9E" value="${esc(typedCode)}" autocomplete="off" autocapitalize="characters" spellcheck="false">
      <div class="actions-stack" style="margin-top:10px"><button class="action secondary" data-action="join" type="button">Войти по коду</button>
      ${(() => { try { return Boolean(JSON.parse(adapter.getItem('pocket-net:' + URL_SERVER) || 'null')?.roomId); } catch { return false; } })() ? '<button class="action quiet small" data-action="resume" type="button">Восстановить прошлую комнату</button>' : ''}
      ${serverReady === false ? '<button class="action quiet small" data-action="retry" type="button">Проверить PocketNet снова</button>' : ''}
      </div>
      <p class="form-description">${esc(healthHint)}</p>
    </section>
  </div>`;
}
function renderLobby() {
  const players = state.players;
  const host = state.host === me?.id;
  root.innerHTML = `<section class="room">
    <div class="kicker">Зал подготовки / ${players.length} из 2 полководцев</div>
    <h1 class="room-banner">Перед боем</h1>
    <p class="room-subtitle">Передай другу код или ссылку. Сражение начнётся после подключения второго игрока.</p>
    <div class="invite-ticket"><div class="ticket-label">ПРИГЛАСИТЕЛЬНЫЙ КОД</div>
      <div class="ticket-code" data-selectable>${esc(shortCode || '••••••••')}</div>
      <div class="ticket-actions">
        <button class="action" type="button" data-action="copy-code" ${shortCode ? '' : 'disabled'}>Скопировать код</button>
        <button class="action" type="button" data-action="copy-link" ${shortCode ? '' : 'disabled'}>Ссылка другу</button>
      </div>
    </div>
    <div class="guest-list">${[0,1].map((n) => `<div class="guest"><span class="dot ${n ? 'south' : 'north'}"></span><div><div class="name">${esc(players[n]?.name || 'Ожидаем игрока…')}</div><small>${n ? 'Юг / красные' : 'Север / синие'} · ${players[n] ? 'подключён' : 'свободно'}</small></div></div>`).join('')}</div>
    <div class="room-footer">
      <button class="action accent" type="button" data-action="start" ${host && players.length === 2 && connected && !busy ? '' : 'disabled'}>${host ? 'Начать сражение' : 'Начнёт создатель'} →</button>
      <button class="action quiet small" type="button" data-action="quit">Выйти</button>
    </div>
  </section>`;
}
function flags(amount) { return '⚑'.repeat(amount) + '◇'.repeat(Math.max(0,3-amount)); }
function renderBattle() {
  const mySide = playerSide(), own = ownedTurn(), current = state.turn;
  const turnTitle = connected ? (own ? 'Твой ход' : 'Ход противника') : 'Связь потеряна';
  const tip = !connected ? 'Восстанавливаем WebSocket и прежнюю комнату…' :
    !own ? 'Смотри на действия соперника. Поле обновляется сервером.' :
    selected ? 'Нажми соседнюю клетку. Красная метка — атака; зелёная — перемещение.' :
    'Выбери свой отряд на поле. Два приказа: шаг, бой или подкрепление.';
  root.innerHTML = `<div class="battle">
    <section class="board-side" aria-label="Поле сражения">
      <div class="battle-top"><span class="mini-label">ПАРТИЯ № ${state.round}</span><h2 class="battle-title">Борьба за башню</h2></div>
      <div class="board-rim"><div class="board" role="group" aria-label="Игровое поле 5 на 7 клеток">${board()}</div></div>
      <div class="board-caption"><span>↑ СЕВЕР · КРЕПОСТЬ</span><span>ЦЕНТР: +1 ЗНАМЯ</span><span>ЮГ ↓</span></div>
    </section>
    <section class="battle-panel">
      <div class="turn-plaque"><div class="turn-top"><span>${esc(turnTitle)}</span><span>${current === 0 ? 'СИНИЕ' : 'КРАСНЫЕ'}</span></div>
        <div class="turn-name">${esc(state.players[current]?.name || 'Полководец')}</div>
        <div class="action-pips">${[0,1].map(i=>`<i class="${i >= state.actions ? 'used' : ''}"></i>`).join('')}</div>
      </div>
      <div class="scores">
        <div class="score"><strong>${esc(state.players[0]?.name || 'Север')} · Север</strong><div class="score-flags">${flags(state.scores[0])}</div><small>Знамёна ${state.scores[0]} / 3</small></div>
        <div class="score south"><strong>${esc(state.players[1]?.name || 'Юг')} · Юг</strong><div class="score-flags">${flags(state.scores[1])}</div><small>Знамёна ${state.scores[1]} / 3</small></div>
      </div>
      <p class="battle-instruction">${tip}</p>
      <div class="command-set">
        <button class="action accent" type="button" data-action="end" ${!own || busy ? 'disabled' : ''}>Передать ход →</button>
        <button class="action secondary small" type="button" data-action="recruit" ${!own || !state.actions || busy ? 'disabled' : ''}>+ Отряд в крепости</button>
        <button class="action quiet small" type="button" data-action="quit">Выйти из партии</button>
      </div>
      <div class="battle-log" role="status">${esc(state.last)}</div>
    </section>
  </div>`;
}
function renderFinish() {
  const winnerId = state.players[state.winner]?.id;
  const won = winnerId && winnerId === me?.id;
  const title = state.winner === null ? 'Ничья' : won ? 'Победа!' : 'Поражение';
  root.innerHTML = `<section class="finish-splash">
    <div class="kicker">Завершение сражения</div>
    <div class="finish-seal" aria-hidden="true">⚑</div>
    <h1>${title}</h1><p>${esc(state.last)}</p>
    <p style="font-size:13px">${state.scores[0]} : ${state.scores[1]} · Знамёна центральной башни</p>
    <div class="finish-buttons">
      <button class="action accent" type="button" data-action="again" ${state.host === me?.id && connected && !busy ? '' : 'disabled'}>${state.host === me?.id ? 'Новая партия' : 'Ждём создателя'}</button>
      <button class="action secondary" type="button" data-action="quit">Покинуть комнату</button>
    </div>
  </section>`;
}
function render() {
  if (!state) { screen = 'menu'; renderMenu(); return; }
  if (state.phase === 'lobby') { screen = 'lobby'; renderLobby(); }
  else if (state.phase === 'battle') { screen = 'battle'; renderBattle(); }
  else { screen = 'finished'; renderFinish(); }
}
function syncRoom(message) {
  roomId = message.roomId;
  shortCode = message.code || message.roomId?.slice(0, 8).toUpperCase() || shortCode;
  state = message.state;
  selected = null;
  busy = false;
  render();
  try { net.sendGame({ type: 'sync' }); } catch {}
}
function setState(next) {
  if (!next || !Array.isArray(next.players)) return;
  const changedPhase = state?.phase !== next.phase;
  state = next;
  busy = false;
  if (changedPhase) selected = null;
  if (selected && !tileAt(selected.x, selected.y)) selected = null;
  render();
}
async function startConnection(mode, code = null) {
  if (screen === 'connecting') return;
  const name = (root.querySelector('#playerName')?.value || savedName).trim().slice(0,22);
  if (!name) { toast('Введи имя полководца.'); return; }
  saveName();
  const target = String(code ?? root.querySelector('#roomCode')?.value ?? '').trim().toUpperCase();
  if (mode === 'join' && !(/^[0-9A-F]{8}$/.test(target) || /^[a-f0-9-]{36}$/i.test(target))) {
    toast('Введи восьмизначный код приглашения.');
    return;
  }
  typedCode = target;
  requestId++;
  const currentRequest = requestId;
  if (net) { net.close(); net = null; }
  activeToken = null;
  state = null; roomId = null; shortCode = null; me = null; connected = false;
  busy = false; selected = null;
  screen = 'connecting';
  root.innerHTML = '<div class="loading"><span class="loading-circle"></span><p>Устанавливаем связь с PocketNet…</p></div>';
  status('Подключение');
  let timeout;
  try {
    await separateDuplicateTab();
    const client = new PocketNet({ serverUrl: URL_SERVER, name, storage: adapter });
    net = client;
    if (mode !== 'resume') { client.roomId = null; client.persist(); }
    client.on('connected', info => {
      if (client !== net) return;
      me = info.player;
      activeToken = client.token;
      connected = true;
      status('PocketNet на связи', 'online');
      if (state) render();
    });
    client.on('room_joined', message => {
      if (client !== net) return;
      syncRoom(message);
    });
    client.on('game_event', message => {
      if (client !== net) return;
      if (message.event?.type === 'state') setState(message.event.payload);
      if (message.event?.type === 'notice') { busy = false; toast(String(message.event.payload)); if (state) render(); }
    });
    client.on('presence', () => { if (client === net && state) try { client.sendGame({ type: 'sync' }); } catch {} });
    client.on('room_closed', () => {
      if (client !== net) return;
      closeSession(false);
      toast('Комната закрыта. Можно создать новую.');
    });
    client.on('disconnected', () => {
      if (client !== net) return;
      connected = false;
      status('Переподключение', 'bad');
      if (state) render();
    });
    client.on('error', error => {
      if (client !== net) return;
      busy = false;
      const code = error?.code || error?.message || 'Ошибка сервера';
      if (screen === 'connecting') { closeSession(false); }
      else if (state) render();
      toast(messages[code] || code);
    });
    const opened = client.connect();
    await Promise.race([opened, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Не удалось установить соединение за 10 секунд.')), 10000); })]);
    clearTimeout(timeout);
    if (currentRequest !== requestId) { client.close(); return; }
    if (mode === 'create') client.createRoom('flagpost');
    else if (mode === 'join') client.joinRoom(target);
    else if (mode === 'resume') {
      if (!client.roomId) { closeSession(false); toast('Прошлой комнаты больше нет.'); }
    }
  } catch (error) {
    clearTimeout(timeout);
    if (currentRequest !== requestId) return;
    closeSession(false);
    toast(error?.message || 'Не удалось подключиться к PocketNet');
  }
}
function closeSession(sendLeave = true) {
  requestId++;
  if (net) {
    if (sendLeave && state) { try { net.leaveRoom(); } catch {} }
    net.close();
  }
  net = null; activeToken = null; connected = false;
  state = null; roomId = null; shortCode = null; busy = false; selected = null;
  status(serverReady ? 'PocketNet готов' : 'Проверить сеть', serverReady ? 'online' : 'bad');
  history.replaceState(null, '', location.pathname);
  render();
}
function send(payload) {
  if (!connected || !net || busy) { toast('Соединение не готово.'); return; }
  busy = true;
  try { net.sendGame(payload); } catch {
    busy = false;
    toast('Команда не отправлена. Идёт переподключение.');
  }
  render();
}
function showConfirm(head, detail, callback) {
  confirmCallback = callback;
  dialog.classList.remove('hidden');
  dialog.innerHTML = `<div class="confirm-box"><h2>${esc(head)}</h2><p>${esc(detail)}</p><div class="confirm-actions">
    <button class="action secondary" type="button" data-confirm="cancel">Остаться</button>
    <button class="action accent" type="button" data-confirm="yes">Подтвердить</button></div></div>`;
  dialog.querySelector('[data-confirm=cancel]')?.focus();
}
function hideConfirm() { dialog.classList.add('hidden'); dialog.textContent = ''; confirmCallback = null; }
dialog.addEventListener('click', event => {
  const button = event.target.closest('[data-confirm]');
  if (!button) return;
  const callback = confirmCallback;
  hideConfirm();
  if (button.dataset.confirm === 'yes') callback?.();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !dialog.classList.contains('hidden')) hideConfirm(); });
async function copyText(value) {
  try { await navigator.clipboard.writeText(value); }
  catch {
    const field = document.createElement('textarea');
    field.value = value; field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.appendChild(field); field.select();
    const ok = document.execCommand('copy'); field.remove();
    if (!ok) { toast('Не удалось скопировать. Выдели код вручную.'); return; }
  }
  toast('Скопировано в буфер обмена.');
}
root.addEventListener('click', event => {
  const cell = event.target.closest('[data-tile]');
  if (cell && state?.phase === 'battle') {
    const [x,y] = cell.dataset.tile.split(',').map(Number);
    const unit = tileAt(x,y);
    if (!ownedTurn() || busy || !state.actions) return;
    if (selected && destination(x,y)) {
      const from = selected; selected = null;
      send({ type: 'move', x: from.x, y: from.y, tx: x, ty: y });
    } else if (unit?.side === state.turn) {
      selected = selected?.x === x && selected?.y === y ? null : { x,y };
      render();
    } else if (selected) { selected = null; render(); }
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  switch(button.dataset.action) {
    case 'create': startConnection('create'); break;
    case 'join': startConnection('join'); break;
    case 'resume': startConnection('resume'); break;
    case 'retry': checkServer(); break;
    case 'start': send({ type: 'start' }); break;
    case 'end': send({ type: 'end' }); break;
    case 'recruit': send({ type: 'recruit' }); break;
    case 'again': send({ type: 'again' }); break;
    case 'copy-code': copyText(shortCode); break;
    case 'copy-link': copyText(new URL(location.pathname + '?room=' + encodeURIComponent(shortCode), location.origin).href); break;
    case 'quit':
      showConfirm('Покинуть комнату?', state?.phase === 'battle'
        ? 'Ты уступишь победу сопернику. Это действие нельзя отменить.'
        : 'Вернёшься в меню, а другие игроки получат уведомление о выходе.',
        () => closeSession());
      break;
  }
});
root.addEventListener('input', event => {
  if (event.target.id === 'roomCode') {
    const cursor = event.target.selectionStart;
    event.target.value = event.target.value.toUpperCase().replace(/\s/g,'');
    typedCode = event.target.value;
  }
});
window.addEventListener('pagehide', () => { activeToken = null; });
render();
checkServer();
