import {PocketSocket as WebSocket} from './network.js';
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
installMobileRuntime();
const roomFromUrl = new URLSearchParams(window.location.search).get("room") || "";

const state = {
  socket: null,
  selfId: null,
  room: null,
  preparedGame: null,
  preparingKey: null,
  toasts: [],
  now: Date.now(),
  lastRenderAt: 0,
  nickname: localStorage.getItem("pocket-works:trace-mosaic:nickname") || `Игрок ${String(Math.floor(Math.random() * 900) + 100)}`,
  joinCode: roomFromUrl.toUpperCase(),
  createSettings: {
    durationSec: 120,
    maxPlayers: 3,
  },
  drag: null,
  connection: 'connecting',
  clockOffset: 0,
  soundEnabled: localStorage.getItem("pocket-works:trace-mosaic:sound") === "on",
  referenceOpen: false,
  lastTrailPaint: 0,
  lastCorrectTile: null,
};

const app = document.querySelector("#app");

function send(type, payload = {}) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return false;
  return state.socket.send(JSON.stringify({ type, payload }));
}

let audioContext = null;
function feedback(type) {
  if (type !== "grab" && type !== "move") {
    try { navigator.vibrate?.(type === "correct" ? [12, 30, 18] : type === "blocked" ? [26, 20, 26] : 8); } catch {}
  }
  if (!state.soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const note = audioContext.createOscillator();
    const volume = audioContext.createGain();
    note.type = type === "blocked" ? "triangle" : "sine";
    const freq = { grab: 330, move: 370, correct: 640, blocked: 155, release: 420 }[type] || 330;
    const now = audioContext.currentTime;
    note.frequency.setValueAtTime(freq, now);
    if (type === "correct") note.frequency.exponentialRampToValueAtTime(920, now + 0.12);
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.exponentialRampToValueAtTime(0.028, now + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
    note.connect(volume); volume.connect(audioContext.destination);
    note.start(now); note.stop(now + 0.18);
  } catch {}
}

function pushToast(message, tone = "info") {
  const id = `${Date.now()}-${Math.random()}`;
  state.toasts.push({ id, message, tone, expiresAt: Date.now() + 2600 });
  render();
}

function trimToasts() {
  const now = Date.now();
  state.toasts = state.toasts.filter((toast) => toast.expiresAt > now);
}

function connectSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}`);
  state.socket = socket;

  socket.addEventListener("open", () => {
    render();
  });

  socket.addEventListener("close", () => {
    pushToast("Связь оборвалась", "error");
    state.room = null;
    render();
    setTimeout(connectSocket, 1000);
  });

  socket.addEventListener("message", (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      return;
    }
    handleMessage(data.type, data.payload);
  });
}

function handleMessage(type, payload) {
  switch (type) {
    case "boot":
      // PocketNet automatically rejoins its saved room. The transport adapter
      // handles invite links: issuing join twice would trigger already_in_room.
      state.selfId = payload.playerId;
      break;
    case "connection_status":
      state.connection = payload.status;
      if (payload.status === 'reconnecting') state.drag = null;
      break;
    case "room_lost":
      state.connection = state.socket?.readyState === WebSocket.OPEN ? 'connected' : 'reconnecting';
      state.room = null;
      state.drag = null;
      state.preparedGame = null;
      state.preparingKey = null;
      window.history.replaceState({}, '', window.location.pathname);
      pushToast(payload.reason || 'Комната недоступна', 'error');
      break;
    case "room_state":
      // Ignore identical lobby/results heartbeats: replacing focused controls would
      // dismiss mobile keyboards and reset selections every 750 ms.
      if (state.room && payload.phase !== "playing" && payload.phase === state.room.phase &&
          JSON.stringify(state.room) === JSON.stringify(payload)) {
        return;
      }
      state.room = payload;
      if (Number.isFinite(payload.serverNow)) state.clockOffset = payload.serverNow - Date.now();
      state.joinCode = payload.roomId || state.joinCode;
      if(!payload.practice)window.history.replaceState({}, "", `?room=${payload.roomId}`);
      if (payload?.game) {
        ensurePreparedGame(payload.game);
      } else {
        state.preparedGame = null;
        state.preparingKey = null;
      }
      if (state.drag && (payload?.phase !== "playing" ||
          payload.game?.tileMeta?.[state.drag.tileId]?.ownerId !== state.selfId)) {
        state.drag = null;
      }
      break;
    case "toast":
      pushToast(payload.message, payload.tone || "info");
      break;
    case "drag_denied":
      if (state.drag && state.drag.tileId === payload.tileId) {
        const blockedIndex = state.drag.visited.indexOf(payload.blockedCell);
        if (blockedIndex >= 0) state.drag.visited.length = blockedIndex;
        state.drag.hoveredCell = state.drag.visited.at(-1) ?? null;
      }
      feedback("blocked");
      pushToast("Чужой след перекрывает путь", "error");
      break;
    default:
      break;
  }
  render();
}

function getPhase() {
  if (!state.room) {
    return "menu";
  }
  return state.room.phase || "lobby";
}

function persistNickname() {
  localStorage.setItem("pocket-works:trace-mosaic:nickname", state.nickname);
}

function gameKey() {
  const game = state.room?.game;
  return game ? `${game.startedAt}:${game.image.id}:${game.grid.cols}x${game.grid.rows}` : '';
}

function render() {
  trimToasts();
  const phase = getPhase();
  const existing = app.querySelector('.game-shell');
  const canPatch = phase === 'playing' && existing?.dataset.gameKey === gameKey();
  document.body.dataset.phase = phase;
  if (canPatch) {
    patchGame();
  } else {
    const inventoryScroll = app.querySelector('.inventory-shell')?.scrollTop || 0;
    const focusedControl = document.activeElement?.id;
    if (phase === 'menu') app.innerHTML = renderMenu();
    else if (phase === 'lobby') app.innerHTML = renderLobby();
    else if (phase === 'playing') app.innerHTML = renderGame();
    else app.innerHTML = renderResults();
    const tray = app.querySelector('.inventory-shell');
    if (tray) tray.scrollTop = inventoryScroll;
    if (focusedControl && phase !== 'playing') {
      const replacement = document.getElementById(focusedControl);
      if (replacement && replacement !== document.activeElement)
        replacement.focus({ preventScroll: true });
    }
  }
  const banner = app.querySelector('.net-banner');
  if (state.connection !== 'connected' && !state.room?.practice) {
    if (!banner) app.querySelector('main.screen')?.insertAdjacentHTML('beforeend', renderConnectionBanner());
  } else banner?.remove();
  state.lastRenderAt = Date.now();
}

function patchGame() {
  const root = app.querySelector('.game-shell');
  const game = state.room?.game;
  if (!root || !game) return;
  const prepared = state.preparedGame;
  const viewerColor = state.room.players.find(p => p.id === state.selfId)?.color || '#cb9460';
  const correctCount = Math.round(game.score.completion * game.totalTiles);
  const ring = root.querySelector('.progress-ring');
  if (ring) {
    ring.style.setProperty('--fill', String(game.score.completion));
    ring.dataset.value = game.score.completionPercent + '%';
  }
  const score = root.querySelector('[data-team-score]');
  if (score) score.textContent = String(game.score.teamScore);
  const count = root.querySelector('[data-correct-count]');
  if (count) count.textContent = String(correctCount).padStart(2, '0') + ' / ' + game.totalTiles;
  const remaining = root.querySelector('[data-piece-count]');
  if (remaining) remaining.textContent = game.assignments.filter(id => game.tileLocations[id]?.kind === 'inventory').length;
  const boardPieces = root.querySelectorAll('.placed-piece');
  boardPieces.forEach((el, cellIndex) => {
    const tileId = game.board[cellIndex];
    const absent = tileId == null || state.drag?.tileId === tileId;
    const previous = el.dataset.currentTile || '';
    const next = absent ? '' : String(tileId);
    if (previous !== next) {
      el.dataset.currentTile = next;
      el.style.backgroundImage = next ? `url("${prepared?.tiles[tileId]?.url || ''}")` : '';
      if (next && tileId === cellIndex && state.lastCorrectTile === tileId) {
        el.classList.remove('snap-in');
        void el.offsetWidth;
        el.classList.add('snap-in');
        feedback('correct');
        state.lastCorrectTile = null;
      }
    } else if (next && prepared?.tiles[tileId] && !el.style.backgroundImage) {
      el.style.backgroundImage = `url("${prepared.tiles[tileId].url}")`;
    }
    const owner = next ? game.tileMeta[tileId]?.ownerId === state.selfId : false;
    el.classList.toggle('empty', absent);
    el.classList.toggle('correct', !absent && tileId === cellIndex);
    el.classList.toggle('foreign', !absent && !owner);
    if (owner) {
      el.dataset.pieceId = next;
      el.dataset.sourceKind = 'board';
    } else { delete el.dataset.pieceId; delete el.dataset.sourceKind; }
  });
  const inventory = root.querySelector('.inventory-grid');
  if (inventory && inventory.children.length !== game.assignments.length) {
    inventory.innerHTML = game.assignments.map((_,i) =>
      `<button type="button" class="inventory-piece" data-slot="${i}" aria-label="Фрагмент"></button>`).join('');
  }
  inventory?.querySelectorAll('[data-slot]').forEach((el, slot) => {
    const tileId = game.assignments[slot];
    const active = game.tileLocations[tileId]?.kind === 'inventory' && state.drag?.tileId !== tileId;
    const desired = active ? String(tileId) : '';
    if (el.dataset.currentTile !== desired) {
      el.dataset.currentTile = desired;
      el.style.backgroundImage = active ? `url("${prepared?.tiles[tileId]?.url || ''}")` : '';
    } else if (active && prepared?.tiles[tileId] && !el.style.backgroundImage) {
      el.style.backgroundImage = `url("${prepared.tiles[tileId].url}")`;
    }
    el.classList.toggle('empty', !active);
    el.style.setProperty('--piece-owner', viewerColor);
    if (active) {
      el.dataset.pieceId = String(tileId);
      el.dataset.sourceKind = 'inventory';
      el.setAttribute('aria-label', 'Переместить фрагмент ' + (tileId + 1));
      el.disabled = false;
    } else {
      delete el.dataset.pieceId; delete el.dataset.sourceKind;
      el.disabled = true;
    }
  });
  const trailKey = JSON.stringify([
    game.trails.map(t => [t.id, t.cells, t.expiresAt]),
    Object.values(game.activeDrags || {}).map(d => [d.playerId, d.tileId, d.cells])
  ]);
  const svg = root.querySelector('.trail-svg');
  if (svg && svg.dataset.signature !== trailKey) {
    svg.innerHTML = renderTrailPaths(game);
    svg.dataset.signature = trailKey;
  }
  const trailCells = root.querySelectorAll('.trail-cell');
  const trailMap = buildTrailMap(game);
  trailCells.forEach((el, cellIndex) => {
    const trail = trailMap.get(cellIndex);
    el.style.backgroundColor = trail ? trail.color : '';
    el.style.opacity = trail ? String(trail.opacity * .43) : '0';
  });
  const ghost = app.querySelector('.drag-ghost');
  if (state.drag && !ghost) {
    app.querySelector('main.screen')?.insertAdjacentHTML('beforeend', renderDragGhost());
  } else if (!state.drag) ghost?.remove();
  const overlay = app.querySelector('.reference-overlay');
  if (state.referenceOpen && !overlay)
    app.querySelector('main.screen')?.insertAdjacentHTML('beforeend', renderReferenceOverlay());
  else if (!state.referenceOpen) overlay?.remove();
  const oldToasts = app.querySelector('.toast-stack');
  const newToasts = renderToasts();
  if (oldToasts) oldToasts.outerHTML = newToasts;
  else if (newToasts) app.querySelector('main.screen')?.insertAdjacentHTML('beforeend', newToasts);
  updateTransientUI();
}


function renderConnectionBanner() {
  const connecting = state.connection === 'connecting' || state.connection === 'syncing';
  const label = connecting ? 'Подключаемся к комнате…' : 'Связь потеряна. Ваше место сохранено, идёт переподключение.';
  return `<div class="net-banner" role="status" aria-live="polite">
    <span class="net-indicator"></span><span>${label}</span>
    <button type="button" data-action="retry-connection">Повторить</button>
  </div>`;
}

function renderMenu() {
  const socketReady = state.socket?.readyState === WebSocket.OPEN;
  const disabled = socketReady ? "" : "disabled";
  return `
    <main class="screen">
      <section class="menu-shell stack fade-in">
        <div class="menu-header">
          <div class="eyebrow">ATELIER / 01 — TRACE MOSAIC</div>
          <h1 class="menu-title">Искусство<br><em>оставлять след.</em></h1>
          <p class="menu-subtitle">Собирайте общую картину, прокладывая маршруты между чужими следами. Каждый след закрывает проход на 30 секунд.</p>
          <div class="menu-artwork" role="img" aria-label="Фрагменты цветной мозаики">
            <img src="./assets/puzzles/puzzle-03.svg" alt="">
            <span class="artwork-seam artwork-seam-a"></span>
            <span class="artwork-seam artwork-seam-b"></span>
            <div class="artwork-stamp">COLLECTIVE WORK / 3—5</div>
          </div>
        </div>

        <div class="glass-card panel stack">
          <div class="field">
            <label for="nickname">Ник</label>
            <input class="text-input" id="nickname" maxlength="18" value="${escapeHtml(state.nickname)}" placeholder="Ваш ник" />
          </div>
          <div class="two-up">
            <div class="field">
              <label for="duration">Раунд</label>
              <select class="select-input" id="duration">
                ${[90, 120, 150, 180]
                  .map((seconds) => `<option value="${seconds}" ${seconds === state.createSettings.durationSec ? "selected" : ""}>${Math.round(seconds / 60 * 10) / 10} мин</option>`)
                  .join("")}
              </select>
            </div>
            <div class="field">
              <label for="maxPlayers">Игроки</label>
              <select class="select-input" id="maxPlayers">
                ${[3, 4, 5].map((count) => `<option value="${count}" ${count === state.createSettings.maxPlayers ? "selected" : ""}>до ${count}</option>`).join("")}
              </select>
            </div>
          </div>
          <button data-native-press class="accent-button" data-action="create-room" ${disabled}>Создать комнату</button>
        </div>

        <div class="glass-card panel stack">
          <div class="field">
            <label for="joinCode">Код комнаты</label>
            <input class="code-input" id="joinCode" maxlength="8" value="${escapeHtml(state.joinCode)}" placeholder="Код из 8 символов" />
          </div>
          <button data-native-press class="ghost-button" data-action="join-room" ${disabled}>Войти по коду</button>
        </div>

        <div class="practice-actions">
          <button id="practiceBtn" data-native-press data-action="practice" class="ghost-button">Продолжить соло-практику</button>
          <button id="resetPracticeBtn" data-native-press data-action="reset-practice" class="pill-button">Новая тренировка</button>
        </div>
        <div class="menu-footer">Для команды нужна сеть. Соло-тренировка доступна без подключения.</div>
      </section>
      ${renderToasts()}
    </main>
  `;
}

function renderLobby() {
  const room = state.room;
  const isHost = room.hostId === state.selfId;
  const preview = room.imagePreview;
  const viewer = room.players.find((player) => player.id === state.selfId);
  return `
    <main class="screen">
      <section class="lobby-shell stack fade-in">
        <div class="top-strip">
          <button data-native-press class="ghost-button subtle" data-action="leave-room">Выйти</button>
          <div class="status-chip">Комната <strong>${room.roomId}</strong></div>
          ${room.practice?'':`<button data-native-press class="ghost-button subtle" data-action="copy-link">Копировать</button>`}
        </div>

        <div class="glass-card panel stack">
          <div class="room-hero">
            <div>
              <div class="eyebrow">Набор</div>
              <h2 style="margin:8px 0 6px;">${escapeHtml(preview?.title || "Выбор изображения")}</h2>
              <p class="menu-subtitle" style="margin:0;">${room.players.length}/${room.settings.maxPlayers} игроков • ${Math.round(room.settings.durationSec / 60 * 10) / 10} мин</p>
            </div>
            ${isHost ? `<div class="stack"><button data-native-press class="pill-button" data-action="prev-image">←</button><button data-native-press class="pill-button" data-action="next-image">→</button></div>` : ""}
          </div>
          <div class="hero-preview" style="background-image:url('${preview?.path || ""}')">
            <div class="hero-preview-caption">
              <h3>${escapeHtml(preview?.title || "Сцена")}</h3>
              <p>${escapeHtml(preview?.difficulty || "mix")}</p>
            </div>
          </div>
        </div>

        <div class="glass-card panel stack">
          <div class="two-up">
            <div class="field">
              <label for="durationLobby">Раунд</label>
              <select class="select-input" id="durationLobby" ${isHost ? "" : "disabled"}>
                ${[90, 120, 150, 180]
                  .map((seconds) => `<option value="${seconds}" ${seconds === room.settings.durationSec ? "selected" : ""}>${Math.round(seconds / 60 * 10) / 10} мин</option>`)
                  .join("")}
              </select>
            </div>
            <div class="field">
              <label for="maxPlayersLobby">Игроки</label>
              <select class="select-input" id="maxPlayersLobby" ${isHost ? "" : "disabled"}>
                ${[3, 4, 5].map((count) => `<option value="${count}" ${count === room.settings.maxPlayers ? "selected" : ""}>до ${count}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="player-list">
            ${room.players
              .map(
                (player) => `
                <div class="player-pill">
                  <div class="player-dot" style="background:${player.color}"></div>
                  <div class="player-meta">
                    <strong>${escapeHtml(player.nickname)}</strong>
                    <span>${player.isHost ? "ведет комнату" : "в команде"}</span>
                  </div>
                  <div class="player-state">${player.connected ? (player.ready ? "готов" : player.id === state.selfId ? "вы" : "ждет") : "оффлайн"}</div>
                </div>
              `,
              )
              .join("")}
          </div>
          <div class="two-up">
            <button data-native-press class="${viewer?.ready ? "accent-button" : "ghost-button"}" data-action="toggle-ready">${viewer?.ready ? "Готов" : "Я готов"}</button>
            ${isHost ? `<button data-native-press class="accent-button" data-action="start-game">Старт</button>` : `<button data-native-press class="pill-button" disabled>Ждем старт</button>`}
          </div>
        </div>
      </section>
      ${renderToasts()}
    </main>
  `;
}

function trailPath(cells, cols) {
  if (!Array.isArray(cells) || !cells.length) return '';
  const points = cells.filter(Number.isInteger).map(i =>
    [i % cols + .5, Math.floor(i / cols) + .5]);
  if (!points.length) return '';
  return 'M ' + points.map(([x,y]) => x + ' ' + y).join(' L ') +
    (points.length === 1 ? ' l .001 0' : '');
}

function renderTrailPaths(game) {
  const entries = [
    ...game.trails.map(t => ({ ...t, live: false })),
    ...Object.values(game.activeDrags || {}).map(t =>
      ({ ...t, expiresAt: null, live: true, cells: t.cells || [] }))
  ];
  return entries.map(trail => {
    const d = trailPath(trail.cells, game.grid.cols);
    if (!d) return '';
    const color = /^#[0-9a-f]{3,8}$/i.test(trail.color) ? trail.color : '#d6a46b';
    const attrs = trail.live ? 'data-live="true"' : `data-expires="${trail.expiresAt}"`;
    return `<g class="trail-stroke" ${attrs} style="--trail-color:${color}">
       <path class="trail-ribbon" d="${d}"/>
       <path class="trail-centerline" d="${d}"/>
      </g>`;
  }).join('');
}

function renderReferenceOverlay() {
  const image = state.room?.game?.image;
  if (!image) return '';
  return `<div class="reference-overlay" role="dialog" aria-modal="true" aria-label="Образец картины">
    <div class="reference-frame">
      <div class="reference-heading"><span>ОРИГИНАЛ / РЕФЕРЕНС</span>
        <button data-action="close-reference" class="reference-close" aria-label="Закрыть образец">✕</button></div>
      <img src="${escapeHtml(state.preparedGame?.previewUrl || image.path)}" alt="${escapeHtml(image.title)}">
      <div class="reference-foot">Изучите композицию и вернитесь к сборке.</div>
    </div>
  </div>`;
}

function renderGame() {
  const room = state.room;
  const game = room.game;
  const prepared = state.preparedGame;
  const score = game.score;
  const timeLeft = Math.max(0, Math.ceil((game.endAt - state.now) / 1000));
  const trailMap = buildTrailMap(game);
  const viewerColor = room.players.find(p => p.id === state.selfId)?.color || "#cb9460";
  document.documentElement.style.setProperty("--cell-count-x", game.grid.cols);
  document.documentElement.style.setProperty("--cell-count-y", game.grid.rows);
  const cells = Array.from({length:game.totalTiles},(_,i)=>
    `<div class="board-cell" data-cell="${i}"></div>`).join('');
  const trailCells = Array.from({length:game.totalTiles},(_,i)=>{
    const trail = trailMap.get(i);
    return `<div class="trail-cell" data-cell="${i}" style="background-color:${trail?.color || 'transparent'};opacity:${trail ? trail.opacity*.43 : 0}"></div>`;
  }).join('');
  const placed = Array.from({length:game.totalTiles},(_,i)=>{
    const id = game.board[i], empty = id == null || state.drag?.tileId === id;
    const own = !empty && game.tileMeta[id]?.ownerId === state.selfId;
    return `<div class="placed-piece ${empty?'empty':id===i?'correct':''} ${!empty&&!own?'foreign':''}"
      data-cell="${i}" data-current-tile="${empty?'':id}"
      ${own?`data-piece-id="${id}" data-source-kind="board"`:''}
      style="background-image:${empty?'none':`url('${prepared?.tiles[id]?.url||''}')`};"></div>`;
  }).join('');
  const inventory = game.assignments.map((id,slot)=>{
    const active = game.tileLocations[id]?.kind==='inventory' && state.drag?.tileId!==id;
    return `<button type="button" data-native-press class="inventory-piece ${active?'':'empty'}"
       data-slot="${slot}" data-current-tile="${active?id:''}" ${active?`data-piece-id="${id}" data-source-kind="inventory"`:''}
       ${active?'':'disabled'} aria-label="${active?'Переместить фрагмент '+(id+1):'Пустое место'}"
       style="--piece-owner:${viewerColor};background-image:${active?`url('${prepared?.tiles[id]?.url||''}')`:'none'}"></button>`;
  }).join('');
  const available = game.assignments.filter(id => game.tileLocations[id]?.kind === 'inventory').length;
  return `
    <main class="screen mosaic-screen">
      <section class="game-shell" data-game-key="${gameKey()}">
        <header class="hud-row">
          <div class="hud-identity">
            <span class="microtype">TRACE / STUDIO</span>
            <strong>${escapeHtml(game.image.title)}</strong>
          </div>
          <div class="hud-center">
            <span class="microtype">ОСТАЛОСЬ</span>
            <span class="timer-chip" aria-live="off">${formatTimer(timeLeft)}</span>
          </div>
          <div class="score-stack">
            <span class="progress-ring" style="--fill:${score.completion}" data-value="${score.completionPercent}%"></span>
            <span class="hud-points"><span class="microtype">ОЧКИ</span><strong data-team-score>${score.teamScore}</strong></span>
          </div>
        </header>
        <div class="board-wrap">
          <div class="board-surface">
            <div class="board-annotation"><span>РАБОЧАЯ ПОВЕРХНОСТЬ</span>
              <span data-correct-count>${Math.round(score.completion*game.totalTiles).toString().padStart(2,'0')} / ${game.totalTiles}</span></div>
            <div class="board-shell" role="group" aria-label="Мозаика ${escapeHtml(game.image.title)}">
              <div class="board-grid">${cells}</div>
              <div class="trail-layer">${trailCells}</div>
              <div class="piece-layer">${placed}</div>
              <svg class="trail-svg" viewBox="0 0 ${game.grid.cols} ${game.grid.rows}"
                   preserveAspectRatio="none" aria-hidden="true">${renderTrailPaths(game)}</svg>
              <span class="board-rivet rivet-tl"></span><span class="board-rivet rivet-tr"></span>
              <span class="board-rivet rivet-bl"></span><span class="board-rivet rivet-br"></span>
            </div>
            <div class="board-controls">
              <span class="board-hint">ПРОВЕДИТЕ ФРАГМЕНТ ПО ПОЛЮ</span>
              <div class="board-actions">
                <button data-action="show-reference" aria-label="Посмотреть оригинал картины">Образец</button>
                <button data-action="toggle-sound" aria-pressed="${state.soundEnabled}" aria-label="Звуковые эффекты">
                  ${state.soundEnabled?'Звук · вкл':'Звук · выкл'}</button>
              </div>
            </div>
          </div>
        </div>
        <aside class="inventory-shell" aria-label="Лоток своих фрагментов">
          <header class="tray-heading">
            <div><span class="microtype">МАТЕРИАЛЫ / ${room.practice?'SOLO':escapeHtml(room.roomId)}</span>
              <h2>Ваши фрагменты</h2></div>
            <div class="tray-counter"><strong data-piece-count>${available}</strong><small>в лотке</small></div>
          </header>
          <div class="inventory-grid">${inventory}</div>
          <p class="tray-tip">Положите фрагмент на нужное место. Цветные дорожки других участников временно закрыты.</p>
        </aside>
      </section>
      ${state.drag?renderDragGhost():''}
      ${state.referenceOpen?renderReferenceOverlay():''}
      ${renderToasts()}
    </main>`;
}

function renderResults() {
  const room = state.room;
  const score = room.game.score;
  const players = [...room.players].sort((a, b) => (b.stats?.netFlow || 0) - (a.stats?.netFlow || 0));
  const isHost = room.hostId === state.selfId;
  return `
    <main class="screen">
      <section class="result-shell stack fade-in">
        <div class="top-strip">
          <div class="status-chip">Комната <strong>${room.roomId}</strong></div>
          <div class="timer-chip">${score.completionPercent}%</div>
          <div class="status-chip"><strong>${score.teamScore}</strong></div>
        </div>

        <div class="glass-card panel stack">
          <div class="eyebrow">Итог</div>
          <h2 style="margin:4px 0 0;">${score.completionPercent === 100 ? "Картина собрана" : "Время вышло"}</h2>
          <p class="menu-subtitle" style="margin:0;">Остаток времени: ${score.timeLeftSec}с • Чем выше сборка и чем быстрее финиш, тем выше счет.</p>
        </div>

        <div class="glass-card panel result-grid">
          ${players
            .map((player) => {
              const mood = describeFlow(player.stats?.netFlow || 0);
              return `
                <div class="score-card">
                  <h3>${escapeHtml(player.nickname)}</h3>
                  <p>${mood} • точных: ${player.stats?.correctDrops || 0} • лишних: ${player.stats?.wrongDrops || 0} • перекрыл: ${player.stats?.trailBlocksCaused || 0}</p>
                </div>
              `;
            })
            .join("")}
        </div>

        <div class="two-up">
          ${isHost ? `<button data-native-press class="accent-button" data-action="play-again">Новый раунд</button>` : `<button data-native-press class="pill-button" disabled>Хост решает</button>`}
          <button data-native-press class="ghost-button" data-action="leave-room">В меню</button>
        </div>
      </section>
      ${renderToasts()}
    </main>
  `;
}

function renderToasts() {
  if (!state.toasts.length) {
    return "";
  }
  return `
    <div class="toast-stack">
      ${state.toasts.map((toast) => `<div class="toast ${toast.tone} fade-in">${escapeHtml(toast.message)}</div>`).join("")}
    </div>
  `;
}

function renderDragGhost() {
  const lift = state.drag.pointerType === 'touch' ? 66 : 14;
  return `<div class="drag-ghost" style="left:${state.drag.x}px; top:${state.drag.y-lift}px; --piece-owner:${state.drag.color}; background-image:url('${state.drag.url}');"></div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatTimer(value) {
  const minutes = Math.floor(value / 60);
  const seconds = String(value % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function buildTrailMap(game) {
  const map = new Map();
  const now = state.now;
  game.trails.forEach((trail) => {
    const opacity = Math.max(0, Math.min(0.58, (trail.expiresAt - now) / 30000 * 0.58));
    trail.cells.forEach((cellIndex) => {
      const current = map.get(cellIndex);
      if (!current || current.priority < trail.expiresAt) {
        map.set(cellIndex, {
          color: trail.color,
          opacity,
          priority: trail.expiresAt,
        });
      }
    });
  });
  Object.values(game.activeDrags || {}).forEach((drag) => {
    drag.cells.forEach((cellIndex) => {
      map.set(cellIndex, {
        color: drag.color,
        opacity: 0.72,
        priority: Number.MAX_SAFE_INTEGER,
      });
    });
  });
  return map;
}

function describeFlow(score) {
  if (score >= 10) {
    return "Тащил команду";
  }
  if (score >= 3) {
    return "Помогал";
  }
  if (score > -3) {
    return "Нейтрально";
  }
  if (score > -10) {
    return "Мешал линиями";
  }
  return "Создал пробку";
}

function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

app.addEventListener("input", (event) => {
  const target = event.target;
  if (target.id === "nickname") {
    state.nickname = target.value.slice(0, 18);
    persistNickname();
  } else if (target.id === "joinCode") {
    state.joinCode = normalizeCode(target.value);
    target.value = state.joinCode;
  } else if (target.id === "duration") {
    state.createSettings.durationSec = Number(target.value);
  } else if (target.id === "maxPlayers") {
    state.createSettings.maxPlayers = Number(target.value);
  } else if (target.id === "durationLobby" || target.id === "maxPlayersLobby") {
    const duration = Number(document.querySelector("#durationLobby")?.value || state.room.settings.durationSec);
    const maxPlayers = Number(document.querySelector("#maxPlayersLobby")?.value || state.room.settings.maxPlayers);
    send("update_settings", { durationSec: duration, maxPlayers });
  }
});

app.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) {
    return;
  }
  switch (action) {
    case "retry-connection":
      window.location.reload();
      break;
    case "show-reference":
      state.referenceOpen = true; render(); break;
    case "close-reference":
      state.referenceOpen = false; render(); break;
    case "toggle-sound":
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem("pocket-works:trace-mosaic:sound", state.soundEnabled ? "on" : "off");
      if (state.soundEnabled) feedback("grab");
      render(); break;
    case "practice":
      state.socket?.practice(state.nickname);
      break;
    case "reset-practice":
      if (window.confirm('Начать новую соло-тренировку? Текущий прогресс будет удалён.')) {
        state.socket?.resetPractice(state.nickname);
      }
      break;
    case "create-room":
      send("create_room", {
        nickname: state.nickname,
        durationSec: state.createSettings.durationSec,
        maxPlayers: state.createSettings.maxPlayers,
      });
      break;
    case "join-room":
      if (!state.joinCode) {
        pushToast("Нужен код комнаты", "error");
        return;
      }
      send("join_room", { roomId: state.joinCode, nickname: state.nickname });
      break;
    case "leave-room":
      send("leave_room");
      state.room = null;
      state.drag = null;
      window.history.replaceState({}, "", window.location.pathname);
      render();
      break;
    case "toggle-ready":
      send("toggle_ready");
      break;
    case "start-game":
      send("start_game");
      break;
    case "prev-image":
      send("cycle_image", { delta: -1 });
      break;
    case "next-image":
      send("cycle_image", { delta: 1 });
      break;
    case "copy-link":
      try {
          await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${state.room.roomId}`);
        pushToast("Ссылка скопирована");
      } catch (error) {
        pushToast("Не удалось скопировать", "error");
      }
      break;
    case "play-again":
      send("play_again");
      break;
    default:
      break;
  }
});

app.addEventListener("pointerdown", (event) => {
  const pieceButton = event.target.closest("[data-piece-id]");
  if (!pieceButton || !state.room?.game || getPhase() !== "playing" ||
      (!state.room.practice && state.connection !== 'connected')) {
    return;
  }
  const tileId = Number(pieceButton.dataset.pieceId);
  const sourceKind = pieceButton.dataset.sourceKind;
  const piece = state.preparedGame?.tiles[tileId];
  if (!piece) {
    return;
  }
  const location = state.room.game.tileLocations[tileId];
  const viewerColor = state.room.players.find(p=>p.id===state.selfId)?.color || '#cb9460';
  state.drag = {
    tileId,
    sourceKind,
    sourceCell: sourceKind === "board" ? location?.cell ?? null : null,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    color: viewerColor,
    url: piece.url,
    x: event.clientX,
    y: event.clientY,
    hoveredCell: sourceKind === "board" ? location?.cell ?? null : null,
    visited: sourceKind === "board" && Number.isInteger(location?.cell) ? [location.cell] : [],
  };
  event.preventDefault();
  // Capture on a stable parent: the selected tile DOM is replaced by snapshots.
  try { app.setPointerCapture(event.pointerId); } catch {}
  feedback("grab");
  render();
});

window.addEventListener("pointermove", (event) => {
  if (!state.drag || event.pointerId !== state.drag.pointerId) {
    return;
  }
  state.drag.x = event.clientX;
  state.drag.y = event.clientY;
  const hoveredCell = getBoardCellFromPoint(event.clientX, event.clientY);
  if (hoveredCell !== null && hoveredCell !== state.drag.hoveredCell) {
    const nextCells = state.drag.visited.length
      ? connectCells(state.drag.visited.at(-1), hoveredCell, state.room.game.grid.cols)
      : [hoveredCell];
    nextCells.forEach((cell) => {
      if (!state.drag.visited.includes(cell)) {
        state.drag.visited.push(cell);
      }
    });
    state.drag.hoveredCell = hoveredCell;
    send("drag_update", {
      tileId: state.drag.tileId,
      targetCell: hoveredCell,
      cells: state.drag.visited,
    });
  }
  updateTransientUI();
});

window.addEventListener("pointerup", (event) => {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  // Resolve the release coordinate as well as the last pointermove coordinate.
  const targetCell = getBoardCellFromPoint(event.clientX, event.clientY);
  if (targetCell === null ||
      (targetCell === state.drag.sourceCell && state.drag.visited.length <= 1)) {
    cancelDrag();
    return;
  }
  if (targetCell !== state.drag.hoveredCell) {
    const cols = state.room.game.grid.cols;
    const hop = state.drag.visited.length
      ? connectCells(state.drag.visited.at(-1), targetCell, cols)
      : [targetCell];
    for (const cell of hop) {
      if (!state.drag.visited.includes(cell)) state.drag.visited.push(cell);
    }
    send("drag_update", {
      tileId: state.drag.tileId,
      targetCell,
      cells: state.drag.visited,
    });
  }
  const possibleSuccess = targetCell === state.drag.tileId &&
      (state.room.game.board[targetCell] == null || state.room.game.board[targetCell] === state.drag.tileId);
  state.lastCorrectTile = possibleSuccess ? state.drag.tileId : null;
  send("drag_end", {
    tileId: state.drag.tileId,
    targetCell,
    cells: state.drag.visited,
  });
  if (!possibleSuccess) feedback("release");
  state.drag = null;
  render();
});

function cancelDrag() {
  if (!state.drag) return;
  // The legacy protocol supports an empty, invalid drop without creating a trail.
  send("drag_end", { tileId: state.drag.tileId, targetCell: -1, cells: [] });
  state.drag = null;
  state.lastCorrectTile = null;
  render();
}

window.addEventListener("pointercancel", (event) => {
  if (state.drag && event.pointerId === state.drag.pointerId) cancelDrag();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelDrag();
});

function getBoardCellFromPoint(clientX, clientY) {
  const board = document.querySelector(".board-grid");
  if (!board || !state.room?.game) {
    return null;
  }
  const rect = board.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null;
  }
  const x = Math.min(state.room.game.grid.cols - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * state.room.game.grid.cols)));
  const y = Math.min(state.room.game.grid.rows - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * state.room.game.grid.rows)));
  return y * state.room.game.grid.cols + x;
}

function connectCells(fromCell, toCell, cols) {
  const start = { x: fromCell % cols, y: Math.floor(fromCell / cols) };
  const end = { x: toCell % cols, y: Math.floor(toCell / cols) };
  const cells = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const sx = start.x < end.x ? 1 : -1;
  const sy = start.y < end.y ? 1 : -1;
  let err = dx - dy;

  while (true) {
    cells.push(y * cols + x);
    if (x === end.x && y === end.y) {
      break;
    }
    const twice = err * 2;
    if (twice > -dy) {
      err -= dy;
      x += sx;
    }
    if (twice < dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

async function ensurePreparedGame(game) {
  const key = `${game.image.id}:${game.grid.cols}x${game.grid.rows}`;
  if (state.preparedGame?.key === key || state.preparingKey === key) {
    return;
  }
  state.preparingKey = key;
  let prepared;
  try {
    prepared = await preparePuzzleImage(game.image.path, game.grid);
  } catch (error) {
    if (state.preparingKey === key) {
      state.preparingKey = null;
      pushToast("Не удалось загрузить изображение. Перезапустите раунд.", "error");
    }
    return;
  }
  if (state.preparingKey !== key) {
    return;
  }
  state.preparedGame = {
    key,
    ...prepared,
  };
  render();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function preparePuzzleImage(src, grid) {
  const image = await loadImage(src);
  const cellSize = Math.floor(Math.min(image.width / grid.cols, image.height / grid.rows));
  const cropWidth = cellSize * grid.cols;
  const cropHeight = cellSize * grid.rows;
  const offsetX = Math.floor((image.width - cropWidth) / 2);
  const offsetY = Math.floor((image.height - cropHeight) / 2);

  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = cropWidth;
  previewCanvas.height = cropHeight;
  const previewContext = previewCanvas.getContext("2d");
  previewContext.drawImage(image, offsetX, offsetY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  const tiles = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      context.drawImage(
        image,
        offsetX + col * cellSize,
        offsetY + row * cellSize,
        cellSize,
        cellSize,
        0,
        0,
        256,
        256,
      );
      tiles.push({
        id: row * grid.cols + col,
        url: canvas.toDataURL("image/png"),
      });
    }
  }

  return {
    previewUrl: previewCanvas.toDataURL("image/png"),
    tiles,
  };
}

function renderGameToText() {
  const room = state.room;
  if (!room?.game) {
    return JSON.stringify({ phase: getPhase() });
  }
  const payload = {
    phase: room.phase,
    roomId: room.roomId,
    coordinate_system: {
      origin: "top-left",
      x_axis: "right",
      y_axis: "down",
      units: "grid cells",
    },
    grid: room.game.grid,
    board: room.game.board,
    trails: room.game.trails.map((trail) => ({
      playerId: trail.playerId,
      cells: trail.cells,
      expiresInMs: Math.max(0, trail.expiresAt - state.now),
    })),
    activeDrags: room.game.activeDrags,
    score: room.game.score,
    viewerId: state.selfId,
    assignments: room.game.assignments,
  };
  return JSON.stringify(payload);
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms) => {
  state.now += ms;
  render();
};

function updateTransientUI() {
  if (getPhase() !== 'playing') return;
  const game = state.room?.game;
  const root = app.querySelector('.game-shell');
  if (!root || !game) return;
  const timer = root.querySelector('.timer-chip');
  if (timer) {
    const t = formatTimer(Math.max(0, Math.ceil((game.endAt - state.now) / 1000)));
    if (timer.textContent !== t) timer.textContent = t;
  }
  const ghost = app.querySelector('.drag-ghost');
  if (ghost && state.drag) {
    ghost.style.left = state.drag.x + 'px';
    ghost.style.top = (state.drag.y - (state.drag.pointerType === 'touch' ? 66 : 14)) + 'px';
  }
  const target = state.drag?.hoveredCell ?? null;
  const board = game.board;
  const blocked = target !== null && (
    (board[target] != null && board[target] !== state.drag.tileId) ||
    game.trails.some(t => t.playerId !== state.selfId &&
      t.expiresAt > state.now && t.cells.includes(target)) ||
    Object.values(game.activeDrags || {}).some(d => d.playerId !== state.selfId &&
      d.cells.includes(target))
  );
  root.querySelectorAll('.board-cell.hot, .board-cell.blocked').forEach(node => {
    if (Number(node.dataset.cell) !== target || (!blocked && node.classList.contains('blocked'))) {
      node.classList.remove('hot','blocked');
    }
  });
  if (target !== null) {
    const el = root.querySelector(`.board-cell[data-cell="${target}"]`);
    el?.classList.add(blocked ? 'blocked' : 'hot');
  }
  if (state.now - state.lastTrailPaint > 140) {
    state.lastTrailPaint = state.now;
    root.querySelectorAll('.trail-stroke[data-expires]').forEach(el => {
      const expiry = Number(el.getAttribute('data-expires'));
      el.style.opacity = String(Math.min(1,Math.max(0,(expiry-state.now)/30000)));
    });
    const trailMap = buildTrailMap(game);
    root.querySelectorAll('.trail-cell').forEach((node,idx)=>{
      const trail = trailMap.get(idx);
      node.style.opacity = trail ? String(trail.opacity*.43) : '0';
    });
  }
}

function animate() {
  state.now = Date.now() + state.clockOffset;
  const phase = getPhase();
  if (phase === "playing") updateTransientUI();
  // Do not reconstruct the entire board each animation frame.
  if (state.toasts.length && Date.now() - state.lastRenderAt > 2700) render();
  requestAnimationFrame(animate);
}

connectSocket();
render();
requestAnimationFrame(animate);


