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
};

const app = document.querySelector("#app");

function send(type, payload = {}) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  state.socket.send(JSON.stringify({ type, payload }));
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
      state.selfId = payload.playerId;
      {
        const urlRoom = normalizeCode(new URLSearchParams(window.location.search).get("room") || "");
        if (urlRoom) {
          send("join_room", { roomId: urlRoom, nickname: state.nickname });
        }
      }
      break;
    case "room_state":
      // Ignore identical lobby/results heartbeats: replacing focused controls would
      // dismiss mobile keyboards and reset selections every 750 ms.
      if (state.room && payload.phase !== "playing" && payload.phase === state.room.phase &&
          JSON.stringify(state.room) === JSON.stringify(payload)) {
        return;
      }
      state.room = payload;
      state.joinCode = payload.roomId || state.joinCode;
      if(!payload.practice)window.history.replaceState({}, "", `?room=${payload.roomId}`);
      if (payload?.game) {
        ensurePreparedGame(payload.game);
      } else {
        state.preparedGame = null;
        state.preparingKey = null;
      }
      if (state.drag && payload?.phase !== "playing") {
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

function render() {
  trimToasts();
  // PocketNet snapshots replace the game DOM; retain the user's tray position.
  const inventoryScroll = app.querySelector(".inventory-shell")?.scrollTop || 0;
  const focusedControl = document.activeElement?.id;
  const phase = getPhase();
  document.body.dataset.phase=phase;
  if (phase === "menu") {
    app.innerHTML = renderMenu();
  } else if (phase === "lobby") {
    app.innerHTML = renderLobby();
  } else if (phase === "playing") {
    app.innerHTML = renderGame();
  } else {
    app.innerHTML = renderResults();
  }
  const tray = app.querySelector(".inventory-shell");
  if (tray) tray.scrollTop = inventoryScroll;
  // Restore focus only when a rerender was unavoidable (e.g. a room update).
  if (focusedControl && phase !== "playing") {
    const replacement = document.getElementById(focusedControl);
    if (replacement && replacement !== document.activeElement) replacement.focus({ preventScroll: true });
  }
  state.lastRenderAt = Date.now();
}

function renderMenu() {
  const socketReady = state.socket?.readyState === WebSocket.OPEN;
  const disabled = socketReady ? "" : "disabled";
  return `
    <main class="screen">
      <section class="menu-shell stack fade-in">
        <div class="menu-header">
          <div class="eyebrow">Trace Mosaic</div>
          <h1 class="menu-title">Соберите картину, не перерезая следы</h1>
          <p class="menu-subtitle">3-5 игроков одновременно тащат свои фрагменты на общее поле. Каждый маршрут оставляет тускнеющий цветной запрет на 30 секунд.</p>
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

function renderGame() {
  const room = state.room;
  const game = room.game;
  const prepared = state.preparedGame;
  const score = game.score;
  const timeLeft = Math.max(0, Math.ceil((game.endAt - state.now) / 1000));
  const trailMap = buildTrailMap(game);
  const viewerColor = room.players.find((player) => player.id === state.selfId)?.color || "#8bf2c7";
  document.documentElement.style.setProperty("--cell-count-x", game.grid.cols);
  document.documentElement.style.setProperty("--cell-count-y", game.grid.rows);

  const boardCells = Array.from({ length: game.totalTiles }, (_, cellIndex) => {
    const hot = state.drag?.hoveredCell === cellIndex ? "hot" : "";
    return `<div class="board-cell ${hot}" data-cell="${cellIndex}"></div>`;
  }).join("");

  const trailCells = Array.from({ length: game.totalTiles }, (_, cellIndex) => {
    const trail = trailMap.get(cellIndex);
    if (!trail) {
      return `<div class="trail-cell" data-cell="${cellIndex}" style="opacity:0;"></div>`;
    }
    return `<div class="trail-cell" data-cell="${cellIndex}" style="background:${trail.color}; opacity:${trail.opacity.toFixed(3)};"></div>`;
  }).join("");

  const placedPieces = Array.from({ length: game.totalTiles }, (_, cellIndex) => {
    const tileId = game.board[cellIndex];
    if (tileId === null || tileId === undefined || (state.drag && state.drag.tileId === tileId)) {
      return `<div class="placed-piece" data-cell="${cellIndex}" style="opacity:0;"></div>`;
    }
    const tile = game.tileMeta[tileId];
    const piece = prepared?.tiles[tileId];
    const correct = tile.correctCell === cellIndex ? "correct" : "";
    const draggable = tile.ownerId === state.selfId ? "data-piece-id" : "data-piece-lock";
    return `
      <div class="placed-piece ${correct}" data-cell="${cellIndex}" ${tile.ownerId === state.selfId ? `data-piece-id="${tileId}" data-source-kind="board"` : `data-piece-lock="${tileId}"`} style="background-image:url('${piece?.url || ""}');"></div>
    `;
  }).join("");

  const inventory = game.assignments.map((tileId) => {
    const location = game.tileLocations[tileId];
    if (!location || location.kind !== "inventory" || (state.drag && state.drag.tileId === tileId)) {
      return `<div class="inventory-piece empty"></div>`;
    }
    const piece = prepared?.tiles[tileId];
    return `<button data-native-press class="inventory-piece" data-piece-id="${tileId}" data-source-kind="inventory" style="background-image:url('${piece?.url || ""}'); border-color:${viewerColor};"></button>`;
  }).join("");

  return `
    <main class="screen">
      <section class="game-shell fade-in">
        <div class="hud-row">
          <div class="code-chip">#${room.roomId}</div>
          <div class="timer-chip">${formatTimer(timeLeft)}</div>
          <div class="score-stack">
            <div class="progress-ring" style="--fill:${Math.max(0, Math.min(1, score.completion))};" data-value="${score.completionPercent}%"></div>
            <div class="status-chip"><strong>${score.teamScore}</strong></div>
          </div>
        </div>

        <div class="board-wrap">
          <div class="board-shell glass-card">
            <div class="board-grid">${boardCells}</div>
            <div class="trail-layer">${trailCells}</div>
            <div class="piece-layer">${placedPieces}</div>
          </div>
        </div>

        <aside class="inventory-shell">
          <div class="mini-label">Ваши фрагменты</div>
          <div class="inventory-grid">${inventory}</div>
        </aside>
      </section>
      ${state.drag ? renderDragGhost() : ""}
      ${renderToasts()}
    </main>
  `;
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
  return `<div class="drag-ghost" style="left:${state.drag.x}px; top:${state.drag.y}px; background-image:url('${state.drag.url}');"></div>`;
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
  if (!pieceButton || !state.room?.game || getPhase() !== "playing") {
    return;
  }
  const tileId = Number(pieceButton.dataset.pieceId);
  const sourceKind = pieceButton.dataset.sourceKind;
  const piece = state.preparedGame?.tiles[tileId];
  if (!piece) {
    return;
  }
  const location = state.room.game.tileLocations[tileId];
  state.drag = {
    tileId,
    sourceKind,
    sourceCell: sourceKind === "board" ? location?.cell ?? null : null,
    pointerId: event.pointerId,
    url: piece.url,
    x: event.clientX,
    y: event.clientY,
    hoveredCell: sourceKind === "board" ? location?.cell ?? null : null,
    visited: sourceKind === "board" && Number.isInteger(location?.cell) ? [location.cell] : [],
  };
  event.preventDefault();
  // Capture on a stable parent: the selected tile DOM is replaced by snapshots.
  try { app.setPointerCapture(event.pointerId); } catch {}
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
  // Dropping outside the board cancels instead of scoring the original cell.
  const targetCell = getBoardCellFromPoint(event.clientX, event.clientY);
  send("drag_end", {
    tileId: state.drag.tileId,
    targetCell: targetCell ?? -1,
    cells: targetCell === null ? [] : state.drag.visited,
  });
  state.drag = null;
  render();
});

function cancelDrag() {
  if (!state.drag) return;
  // The legacy protocol supports an empty, invalid drop without creating a trail.
  send("drag_end", { tileId: state.drag.tileId, targetCell: -1, cells: [] });
  state.drag = null;
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
  if (getPhase() !== "playing") return;
  const game = state.room?.game;
  const timer = app.querySelector(".timer-chip");
  if (timer && game) {
    const time = formatTimer(Math.max(0, Math.ceil((game.endAt - state.now) / 1000)));
    if (timer.textContent !== time) timer.textContent = time;
  }
  const ghost = app.querySelector(".drag-ghost");
  if (ghost && state.drag) {
    ghost.style.left = state.drag.x + "px";
    ghost.style.top = state.drag.y + "px";
  }
  const currentlyHot = app.querySelector(".board-cell.hot");
  const expected = state.drag?.hoveredCell;
  if (currentlyHot && Number(currentlyHot.dataset.cell) !== expected) currentlyHot.classList.remove("hot");
  if (expected != null && Number(currentlyHot?.dataset.cell) !== expected) {
    app.querySelector(`.board-cell[data-cell="${expected}"]`)?.classList.add("hot");
  }
}

function animate() {
  state.now = Date.now();
  const phase = getPhase();
  if (phase === "playing") updateTransientUI();
  // Do not reconstruct the entire board each animation frame.
  if (state.toasts.length && Date.now() - state.lastRenderAt > 2700) render();
  requestAnimationFrame(animate);
}

connectSocket();
render();
requestAnimationFrame(animate);

document.querySelector("#practiceBtn").onclick=()=>state.socket.practice(state.nickname);
