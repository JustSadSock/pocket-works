import {PocketSocket as WebSocket} from './network.js';
import {
  AI_PROFILES,
  BASE_LAWS,
  CARD_BY_ID,
  LAW_CARDS,
  RULES_TEXT,
  SLOT_COLORS,
  SLOT_LABELS,
  SLOT_TYPES,
  THRONE
} from "../shared/game-data.js";
import {
  activeLawSummary,
  applyDebugAction,
  cardById,
  coordLabel,
  createInitialState,
  resolveTurn,
  serializeTextState
} from "../shared/game-engine.js";
import { chooseAiCard } from "../shared/ai.js";

const root = document.getElementById("app");

const app = {
  screen: "menu",
  modal: null,
  selectedCardId: null,
  focusCardId: null,
  dragCardId: null,
  lastConflictSlots: [],
  lastBoardPositions: {},
  effects: [],
  effectTimer: null,
  simulationReport: null,
  inspectedSlot: null,
  historyExpanded: false,
  replay: null,
  preResolutionState: null,
  replayActive: false,
  replayStage: "after",
  replayTimer: null,
  debug: { open: false, tab: "screens", scene: "game", animation: null },
  debugSelects: Object.fromEntries(SLOT_TYPES.map((slot) => [slot, "base"])),
  settings: {
    sound: true,
    music: false,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
  },
  local: {
    mode: null,
    aiProfile: "contender",
    state: null,
    pendingHotseat: {},
    hotseatChooser: "p1",
    passScreen: false,
    waitingAi: false,
    lastLogs: []
  },
  online: {
    socket: null,
    status: "idle",
    codeInput: "",
    roomCode: "",
    you: null,
    roomState: null,
    ready: { p1: false, p2: false },
    lastLogs: []
  },
  audioCtx: null
};

function currentState() {
  if (app.screen === "game" && app.local.state) {
    return app.local.state;
  }
  if (app.screen === "online" && app.online.roomState) {
    return app.online.roomState;
  }
  return null;
}

function openModal(modal) {
  app.modal = modal;
  render();
}

function closeModal() {
  app.modal = null;
  render();
}

function ensureAudio(force = false) {
  if (!app.settings.sound && !force) {
    return null;
  }
  if (!app.audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    app.audioCtx = new AudioCtor();
  }
  return app.audioCtx;
}

function playTone(kind = "tap", force = false) {
  const ctx = ensureAudio(force);
  if (!ctx) {
    return;
  }
  const time = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const palette = {
    tap: { freq: 280, dur: 0.08, type: "triangle", vol: 0.02 },
    ready: { freq: 420, dur: 0.12, type: "sine", vol: 0.03 },
    conflict: { freq: 120, dur: 0.22, type: "sawtooth", vol: 0.05 },
    crown: { freq: 560, dur: 0.18, type: "triangle", vol: 0.04 },
    move: { freq: 220, dur: 0.07, type: "triangle", vol: 0.015 }
  }[kind];

  osc.type = palette.type;
  osc.frequency.setValueAtTime(palette.freq, time);
  gain.gain.setValueAtTime(palette.vol, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + palette.dur);
  osc.start(time);
  osc.stop(time + palette.dur);
}

function profileOptions() {
  return `
    <button data-native-press id="start-btn" class="menu-card menu-card--hero" data-action="start-ai">
      <span class="menu-card__index">I</span>
      <span class="menu-card__copy"><span class="menu-card__title">Против ИИ</span><span class="menu-card__text">Начать немедленно, без ожидания</span></span>
      <span class="menu-card__arrow" aria-hidden="true">→</span>
    </button>
  `;
}

function effectLineStyle(from, to) {
  const cellWidth = 20;
  const cellHeight = 100 / 7;
  const startX = from.x * cellWidth + cellWidth / 2;
  const startY = from.y * cellHeight + cellHeight / 2;
  const endX = to.x * cellWidth + cellWidth / 2;
  const endY = to.y * cellHeight + cellHeight / 2;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return `--sx:${startX}%;--sy:${startY}%;--len:${length}%;--angle:${angle}deg;`;
}

function scheduleEffects(effects) {
  window.clearTimeout(app.effectTimer);
  app.effects = effects;
  if (effects.length > 0) {
    app.effectTimer = window.setTimeout(() => {
      app.effects = [];
      render();
    }, app.settings.reducedMotion ? 220 : 960);
  }
}

function buildEffects(state, resolution) {
  const effects = [];
  const shieldTargets = resolution.logs.filter((entry) => entry.kind === "shield" && entry.pieceId);
  shieldTargets.forEach((entry) => {
    const piece = state.pieces[entry.pieceId];
    if (piece) {
      effects.push({ id: `shield-${entry.pieceId}-${Math.random()}`, kind: "shield", x: piece.x, y: piece.y });
    }
  });

  if (resolution.tracker.crownEvents.length > 0) {
    effects.push({ id: `crown-${state.turn}`, kind: "crown", x: THRONE.x, y: THRONE.y });
  }

  const beastMove = resolution.tracker.movementTimeline.find((entry) => entry.pieceId === "beast");
  if (beastMove) {
    effects.push({ id: `beast-${state.turn}`, kind: "beast-dash", from: beastMove.from, to: beastMove.to });
  }

  const theftEvent = resolution.logs.find((entry) => entry.kind === "seal-steal");
  if (theftEvent) {
    const thief = state.pieces.thief;
    const ownerPiece = theftEvent.ownerId === "p1" ? state.pieces.champion_p1 : state.pieces.champion_p2;
    effects.push({ id: `seal-${state.turn}`, kind: "seal-trail", from: ownerPiece, to: thief });
  }

  return effects;
}

function simulateDebugTurns(turns = 20) {
  if (!app.local.state) {
    return;
  }

  let simState = structuredClone(app.local.state);
  let turnsPlayed = 0;
  const distanceTotals = { p1: 0, p2: 0 };
  const report = {
    turnsRequested: turns,
    turnsPlayed: 0,
    crowns: { p1: 0, p2: 0 },
    conflicts: 0,
    throneStands: { p1: 0, p2: 0 },
    crownBlocked: 0,
    averageDistance: { p1: 0, p2: 0 }
  };

  while (turnsPlayed < turns && !simState.winner) {
    const p1Card = chooseAiCard(simState, "p1", "contender");
    const p2Card = chooseAiCard(simState, "p2", app.local.aiProfile || "contender");
    const resolution = resolveTurn(simState, {
      p1: { cardId: p1Card },
      p2: { cardId: p2Card }
    });
    simState = resolution.state;
    turnsPlayed += 1;
    report.conflicts += resolution.conflicts.length;
    report.crowns.p1 += resolution.tracker.crownEvents.filter((entry) => entry.playerId === "p1").length;
    report.crowns.p2 += resolution.tracker.crownEvents.filter((entry) => entry.playerId === "p2").length;
    report.crownBlocked += resolution.logs.filter((entry) => entry.kind === "crown-denied").length;

    if (simState.pieces.champion_p1.x === THRONE.x && simState.pieces.champion_p1.y === THRONE.y) {
      report.throneStands.p1 += 1;
    }
    if (simState.pieces.champion_p2.x === THRONE.x && simState.pieces.champion_p2.y === THRONE.y) {
      report.throneStands.p2 += 1;
    }

    distanceTotals.p1 += Math.abs(simState.pieces.champion_p1.x - THRONE.x) + Math.abs(simState.pieces.champion_p1.y - THRONE.y);
    distanceTotals.p2 += Math.abs(simState.pieces.champion_p2.x - THRONE.x) + Math.abs(simState.pieces.champion_p2.y - THRONE.y);
  }

  report.turnsPlayed = turnsPlayed;
  report.averageDistance.p1 = turnsPlayed ? Number((distanceTotals.p1 / turnsPlayed).toFixed(2)) : 0;
  report.averageDistance.p2 = turnsPlayed ? Number((distanceTotals.p2 / turnsPlayed).toFixed(2)) : 0;
  app.simulationReport = report;
  openModal("simulation");
}

function startLocalGame(mode, aiProfile = "contender") {
  app.screen = "game";
  app.local.mode = mode;
  app.local.aiProfile = aiProfile;
  app.local.state = createInitialState({ mode });
  app.local.pendingHotseat = {};
  app.local.hotseatChooser = "p1";
  app.local.passScreen = false;
  app.local.waitingAi = false;
  app.local.lastLogs = [];
  app.simulationReport = null;
  app.effects = [];
  app.replay = null;
  app.replayActive = false;
  app.inspectedSlot = null;
  app.historyExpanded = false;
  app.selectedCardId = null;
  app.focusCardId = null;
  app.lastConflictSlots = [];
  render();
}

function getViewerPlayer() {
  if (app.screen === "online") {
    return app.online.you || "p1";
  }
  if (app.local.mode === "hotseat") {
    return app.local.hotseatChooser;
  }
  return "p1";
}

function currentHand() {
  const state = currentState();
  if (!state) {
    return [];
  }
  return state.players[getViewerPlayer()].hand;
}

function recordResolution(resolution, isOnline = false) {
  app.lastConflictSlots = resolution.conflicts || [];
  if (!isOnline && app.preResolutionState) {
    app.replay = { before: app.preResolutionState, after: structuredClone(app.local.state) };
    app.preResolutionState = null;
  }
  scheduleEffects(buildEffects(isOnline ? app.online.roomState : app.local.state, resolution));
  if (resolution.tracker.crownEvents.length > 0) {
    playTone("crown");
  } else if (resolution.conflicts.length > 0) {
    playTone("conflict");
  } else {
    playTone("ready");
  }
  if (isOnline) {
    app.online.lastLogs = resolution.logs;
  } else {
    app.local.lastLogs = resolution.logs;
  }
}

function confirmSelection() {
  const state = currentState();
  if (!state || !app.selectedCardId) {
    return;
  }

  if (app.screen === "online") {
    if (!app.online.socket || app.online.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    app.online.socket.send(JSON.stringify({ type: "match:choose", cardId: app.selectedCardId }));
    app.online.ready[app.online.you] = true;
    playTone("ready");
    app.selectedCardId = null;
    render();
    return;
  }

  if (app.local.mode === "ai") {
    app.local.waitingAi = true;
    const humanCard = app.selectedCardId;
    app.selectedCardId = null;
    render();
    window.setTimeout(() => {
      const aiCard = chooseAiCard(app.local.state, "p2", app.local.aiProfile);
      app.preResolutionState = structuredClone(app.local.state);
      const resolution = resolveTurn(app.local.state, {
        p1: { cardId: humanCard },
        p2: { cardId: aiCard }
      });
      app.local.state = resolution.state;
      app.local.waitingAi = false;
      recordResolution(resolution);
      render();
    }, 520);
    return;
  }

  if (app.local.mode === "hotseat") {
    const chooser = app.local.hotseatChooser;
    app.local.pendingHotseat[chooser] = { cardId: app.selectedCardId };
    app.selectedCardId = null;
    playTone("ready");
    if (chooser === "p1") {
      app.local.hotseatChooser = "p2";
      app.local.passScreen = true;
      render();
      return;
    }
    app.preResolutionState = structuredClone(app.local.state);
    const resolution = resolveTurn(app.local.state, app.local.pendingHotseat);
    app.local.state = resolution.state;
    app.local.pendingHotseat = {};
    app.local.hotseatChooser = "p1";
    app.local.passScreen = false;
    recordResolution(resolution);
    render();
  }
}

function setupSocket() {
  if (app.online.socket) {
    app.online.socket.close();
  }
  const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  app.online.socket = socket;
  app.online.status = "connecting";
  socket.addEventListener("open", () => {
    app.online.status = "connected";
    render();
  });
  socket.addEventListener("close", () => {
    app.online.status = "closed";
    render();
  });
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "room:created" || payload.type === "room:joined") {
      app.screen = "online";
      app.online.roomCode = payload.code;
      app.online.you = payload.you;
      playTone("ready");
    }
    if (payload.type === "room:update") {
      const previousRoomState = app.online.roomState;
      const prevTurn = previousRoomState?.turn;
      app.online.roomCode = payload.room.code;
      app.online.you = payload.room.you;
      app.online.ready = payload.room.ready;
      app.online.roomState = payload.room.state;
      if (app.online.roomState && prevTurn && app.online.roomState.turn !== prevTurn) {
        app.replay = { before: structuredClone(previousRoomState), after: structuredClone(app.online.roomState) };
        app.online.lastLogs = app.online.roomState.battleLog.slice(0, 8);
        app.lastConflictSlots = app.online.roomState.turnSummaries[0]?.conflicts || [];
        playTone("move");
      }
      render();
    }
    if (payload.type === "room:error") {
      const error=document.querySelector('#network-error');error.hidden=false;error.textContent=payload.message;setTimeout(()=>error.hidden=true,5000);
    }
  });
}

function createRoom() {
  if (!app.online.socket || app.online.socket.readyState !== WebSocket.OPEN) {
    setupSocket();
    app.online.socket?.addEventListener(
      "open",
      () => {
        app.online.socket.send(JSON.stringify({ type: "room:create" }));
      },
      { once: true }
    );
    return;
  }
  app.online.socket.send(JSON.stringify({ type: "room:create" }));
}

function joinRoom() {
  if (!app.online.codeInput.trim()) {
    return;
  }
  if (!app.online.socket || app.online.socket.readyState !== WebSocket.OPEN) {
    setupSocket();
    app.online.socket?.addEventListener(
      "open",
      () => {
        app.online.socket.send(JSON.stringify({ type: "room:join", code: app.online.codeInput }));
      },
      { once: true }
    );
    return;
  }
  app.online.socket.send(JSON.stringify({ type: "room:join", code: app.online.codeInput }));
}

function activeLaws(state) {
  return activeLawSummary(state);
}

function crownRow(player, title, side = "north") {
  return `
    <div class="crown-bar crown-bar--${side}">
      <span class="crown-bar__label">${title}</span>
      <div class="crown-bar__icons">
        <span class="crown crown--active" title="Активные короны" aria-label="Активные короны: ${player.activeCrowns}"><i></i>${player.activeCrowns}</span>
        <span class="crown crown--sealed" title="Запечатанные короны" aria-label="Запечатанные короны: ${player.sealedCrowns}"><i></i>${player.sealedCrowns}</span>
        <span class="crown crown--lost" title="Потерянные короны" aria-label="Потерянные короны: ${player.lostCrowns}"><i></i>${player.lostCrowns}</span>
      </div>
    </div>
  `;
}

function pieceGlyph(piece) {
  // Carved typographic counters: no raster sprites or SVG.
  const marks = { champion: "К", guard: "С", beast: "З", priest: "Ж", thief: "В" };
  return '<span class="piece__sigil" aria-hidden="true">' + (marks[piece.kind] || "·") + '</span>';
}

function effectsHTML() {
  return app.effects
    .map((effect) => {
      if (effect.kind === "crown" || effect.kind === "shield") {
        return `<div class="board-effect board-effect--${effect.kind}" style="--x:${effect.x};--y:${effect.y}"></div>`;
      }
      if (effect.kind === "beast-dash" || effect.kind === "seal-trail") {
        return `<div class="board-effect board-effect--${effect.kind}" style="${effectLineStyle(effect.from, effect.to)}"></div>`;
      }
      return "";
    })
    .join("");
}

function boardHTML(state) {
  const cells = [];
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      cells.push(`
        <div class="board-cell ${x === THRONE.x && y === THRONE.y ? "board-cell--throne" : ""}">
          <span>${String.fromCharCode(65 + x)}${y + 1}</span>
        </div>
      `);
    }
  }

  const pieces = Object.values(state.pieces)
    .map((piece) => {
      const classes = [
        "piece",
        `piece--${piece.kind}`,
        piece.id === "champion_p1" ? "piece--p1" : piece.id === "champion_p2" ? "piece--p2" : "",
        piece.shield ? "piece--shielded" : "",
        piece.stun ? "piece--stunned" : "",
        piece.carryingSeal ? "piece--sealed" : ""
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <button type="button" class="${classes} ${app.inspectedSlot === piece.kind ? "piece--focused" : ""}" data-piece-kind="${piece.kind}" data-piece-id="${piece.id}" aria-label="${piece.kind === "champion" ? (piece.owner === "p1" ? "Чемпион Севера" : "Чемпион Юга") : SLOT_LABELS[piece.kind]}" style="--x:${piece.x};--y:${piece.y}">
          <div class="piece__token">
            ${pieceGlyph(piece)}
            ${piece.shield ? `<span class="status-chip status-chip--shield">Щит</span>` : ""}
            ${piece.stun ? `<span class="status-chip status-chip--stun">Оглушен</span>` : ""}
            ${piece.carryingSeal ? `<span class="status-chip status-chip--seal">Печать</span>` : ""}
          </div>
        </button>
      `;
    })
    .join("");

  return `
    <section class="board-panel">
      <div class="board-caption">
        <span class="board-caption__title">Королевский двор</span>
        <span class="board-pill board-pill--throne">Трон ${coordLabel(THRONE)} · ход ${state.turn}</span>
      </div>
      <div class="board-surround"><div class="board">
        <div class="board-grid">${cells.join("")}</div>
        <div class="board-glow"></div>
        <div class="board-effects">${effectsHTML()}</div>
        ${pieces}
      </div></div>
    </section>
  `;
}

function lawSlotsHTML(state) {
  const laws=activeLaws(state);
  const short={champion:"Чемпионы",guard:"Страж",beast:"Зверь",priest:"Жрец",thief:"Вор"};
  return `<section class="law-panel" aria-label="Пять действующих законов">
    <div class="panel-head"><h3>Законы мира</h3><span>Действуют на обе стороны</span></div>
    <div class="law-slots">${SLOT_TYPES.map(slot=>{
      const law=laws[slot],base=!state.slots[slot].activeCardId;
      const id=base?BASE_LAWS[slot].id:law.id;
      return `<button type="button" data-native-press class="law-slot ${app.inspectedSlot===slot?"law-slot--focused":""} ${app.lastConflictSlots.includes(slot)?"law-slot--conflict":""}" style="--slot-color:${SLOT_COLORS[slot]}" data-slot="${slot}" data-focus-card="${id}" title="${law.name}" aria-pressed="${app.inspectedSlot===slot}">
        <span class="law-slot__short">${short[slot]}</span><span class="law-slot__copy"><span class="law-slot__name">${law.name}</span><span class="law-slot__mode">${base?"Каменный закон":"Новый указ"}</span></span>
      </button>`;
    }).join("")}</div></section>`;
}

function detailCard(state) {
  const id=app.selectedCardId||app.focusCardId;
  if(!id)return "";
  const card=CARD_BY_ID[id]||Object.values(BASE_LAWS).find(law=>law.id===id);
  if(!card)return "";
  const replacing=Boolean(app.selectedCardId&&id===app.selectedCardId);
  const active=activeLaws(state)[card.slot];
  return `<section class="detail-card" style="--detail-color:${SLOT_COLORS[card.slot]}">
    <div class="detail-card__heading"><span>${SLOT_LABELS[card.slot]}</span><button type="button" class="text-btn" data-action="clear-inspection" aria-label="Закрыть описание">×</button></div>
    ${replacing?`<div class="law-comparison"><div class="law-comparison__old"><small>Сейчас действует</small><strong>${active.name}</strong><p>${active.description}</p></div><div class="law-comparison__new"><small>После утверждения</small><strong>${card.name}</strong><p>${card.description}</p></div></div><p class="detail-note">Закон действует на обе стороны. Соперник может вызвать конфликт, выбрав ту же категорию.</p>`:`<strong class="detail-card__title">${card.name}</strong><p>${card.description}</p>`}
  </section>`;
}

function handHTML(state) {
  const viewer=getViewerPlayer();
  const locked=(app.screen==="online"&&app.online.ready[viewer])||app.local.waitingAi||(app.local.mode==="hotseat"&&app.local.passScreen);
  return `<section class="hand-panel ${locked?"hand-panel--locked":""}">
    <div class="panel-head"><h3>Ваши указы</h3><span>${viewer==="p1"?"Север":"Юг"} · ${currentHand().length} карт</span></div>
    ${locked?`<p class="sealed-notice">Ваш указ принят и запечатан. ${app.screen==="online"?"Ожидаем соперника.":"Идёт разрешение хода."}</p>`:""}
    <div class="hand" role="group" aria-label="Выбор одного указа">${currentHand().map(cardId=>{
      const card=cardById(cardId);
      return `<button type="button" class="law-card ${app.selectedCardId===cardId?"law-card--selected":""}" style="--card-color:${SLOT_COLORS[card.slot]}" aria-pressed="${app.selectedCardId===cardId}" ${locked?"disabled":""} draggable="${!locked}" data-card-id="${cardId}" data-focus-card="${cardId}">
        <span class="law-card__slot">${SLOT_LABELS[card.slot].replace("Закон ","")}</span><strong class="law-card__title">${card.name}</strong></button>`;
    }).join("")}</div>
    ${detailCard(state)}
    <div class="hand-actions"><button data-native-press class="primary-btn" data-action="confirm-choice" ${!app.selectedCardId||locked?"disabled":""}>${locked?"Указ запечатан":"Утвердить закон"}</button></div>
  </section>`;
}

function phaseBanner() {
  if (app.screen === "online") {
    if (!app.online.roomState) {
      return "Ожидание второго игрока";
    }
    const readyText = app.online.ready.p1 || app.online.ready.p2 ? `Готовность: Север ${app.online.ready.p1 ? "готов" : "думает"} / Юг ${app.online.ready.p2 ? "готов" : "думает"}` : "Оба игрока выбирают закон скрытно";
    return readyText;
  }
  if (app.local.mode === "ai" && app.local.waitingAi) {
    return "ИИ читает стол и выбирает ответный закон";
  }
  if (app.local.mode === "hotseat" && app.local.passScreen) {
    return "Передайте устройство второму игроку";
  }
  return "Фаза выбора закона";
}

function logHTML(state) {
  const logs=app.screen==="online"?app.online.lastLogs:(app.local.lastLogs.length?app.local.lastLogs:state.battleLog.slice(0,8));
  const recent=logs[0];
  return `<section class="log-panel"><div class="log-panel__summary">
    <span class="log-panel__phase">${phaseBanner()}</span>
    <span class="log-panel__recent">${recent?.text||"Законы определяют судьбу фигур — выберите свой указ."}</span>
    <button data-action="toggle-history" class="text-btn" aria-expanded="${app.historyExpanded}">${app.historyExpanded?"Скрыть":"История"}</button>
    ${app.replay?`<button data-action="replay-turn" class="ghost-btn" ${app.replayActive?"disabled":""}>Повторить ход</button>`:""}
    </div>${app.historyExpanded?`<div class="log-list">${logs.slice(0,12).map(entry=>`<div class="log-entry"><span class="log-entry__phase">${entry.phase}</span><span class="log-entry__text">${entry.text}</span></div>`).join("")||"<p>Событий пока нет.</p>"}</div>`:""}</section>`;
}

function debugHTML(state) {
  if (app.screen === "online") {
    return "";
  }
  return `
    <section class="debug-panel">
      <h3>Баланс и диагностика</h3>
      <div class="debug-grid">
        <button data-native-press class="ghost-btn" data-debug="restart">Перезапуск матча</button>
        <button data-native-press class="ghost-btn" data-debug-action="simulate-20">Симулировать 20 ходов</button>
        <button data-native-press class="ghost-btn" data-debug="give-crown" data-player="p1">+ корона Северу</button>
        <button data-native-press class="ghost-btn" data-debug="give-crown" data-player="p2">+ корона Югу</button>
        <button data-native-press class="ghost-btn" data-debug="toggle-stun" data-player="p1">Оглушение Севера</button>
        <button data-native-press class="ghost-btn" data-debug="toggle-stun" data-player="p2">Оглушение Юга</button>
        <button data-native-press class="ghost-btn" data-debug="toggle-shield" data-player="p1">Щит Севера</button>
        <button data-native-press class="ghost-btn" data-debug="toggle-shield" data-player="p2">Щит Юга</button>
        <button data-native-press class="ghost-btn" data-debug="force-steal" data-player="p1">Украсть у Севера</button>
        <button data-native-press class="ghost-btn" data-debug="force-steal" data-player="p2">Украсть у Юга</button>
        <button data-native-press class="ghost-btn" data-debug="return-seal" data-player="p1">Вернуть Северу</button>
        <button data-native-press class="ghost-btn" data-debug="return-seal" data-player="p2">Вернуть Югу</button>
      </div>
      <div class="debug-laws">
        ${SLOT_TYPES.map((slot) => `
          <label class="debug-law-control">
            <span>${SLOT_LABELS[slot]}</span>
            <select data-slot-select="${slot}">
              <option value="base">Базовый закон</option>
              ${LAW_CARDS.filter((card) => card.slot === slot)
                .map((card) => `<option value="${card.id}" ${app.debugSelects[slot] === card.id ? "selected" : ""}>${card.name}</option>`)
                .join("")}
            </select>
            <button data-native-press class="ghost-btn" data-debug="set-law" data-slot="${slot}">Применить</button>
          </label>
        `).join("")}
      </div>
      <div class="debug-state">
        <div>
          <strong>Рука Севера:</strong> ${state.players.p1.hand.map((cardId) => CARD_BY_ID[cardId].name).join(", ")}
        </div>
        <div>
          <strong>Рука Юга:</strong> ${state.players.p2.hand.map((cardId) => CARD_BY_ID[cardId].name).join(", ")}
        </div>
        <div>
          <strong>Колода Севера:</strong> ${state.players.p1.deck.map((cardId) => CARD_BY_ID[cardId].name).join(" | ")}
        </div>
        <div>
          <strong>Колода Юга:</strong> ${state.players.p2.deck.map((cardId) => CARD_BY_ID[cardId].name).join(" | ")}
        </div>
        ${app.simulationReport ? `
          <div class="debug-report">
            <strong>Автосимуляция:</strong> ${app.simulationReport.turnsPlayed} ходов, короны ${app.simulationReport.crowns.p1}:${app.simulationReport.crowns.p2}, конфликты ${app.simulationReport.conflicts}
          </div>
        ` : ""}
      </div>
    </section>
  `;
}

function victoryHTML(state) {
  if (!state.winner) {
    return "";
  }
  const winnerName = state.winner === "p1" ? "Северный Чемпион" : "Южный Чемпион";
  return `
    <div class="victory">
      <div class="victory__panel">
        <span class="victory__eyebrow">Партия завершена</span>
        <h2>${winnerName} берет корону</h2>
        <p>Активные короны: ${state.players[state.winner].activeCrowns}. Последние законы и позиционное давление переломили дуэль.</p>
        <div class="victory__actions">
          <button data-native-press class="primary-btn" data-action="rematch">Реванш</button>
          <button data-native-press class="ghost-btn" data-action="back-menu">Вернуться в меню</button>
        </div>
      </div>
    </div>
  `;
}

function roomHTML() {
  const roomState = app.online.roomState;
  if (!roomState) {
    if (app.online.roomCode) {
      return `
        <section class="menu-shell">
          <div class="hero-card">
            <span class="eyebrow">Онлайн 1v1</span>
            <h1>Ждём соперника</h1>
            <p>Север уже в зале. Поделитесь кодом с соперником и дождитесь, пока он войдет в комнату с другого устройства.</p>
            <div class="room-wait-card">
              <div class="room-wait-card__code">${app.online.roomCode}</div>
              <div class="room-wait-card__meta">
                <span>Статус соединения: ${app.online.status}</span>
                <span>Ваше место: ${app.online.you === "p1" ? "Север" : "Юг"}</span>
              </div>
            </div>
            <div class="room-actions">
              <button data-native-press class="ghost-btn" data-action="copy-room-code">Скопировать код</button>
              <button data-native-press class="text-btn" data-action="back-menu">Назад в меню</button>
            </div>
          </div>
        </section>
      `;
    }
    return `
      <section class="menu-shell">
        <div class="hero-card">
          <span class="eyebrow">Онлайн 1v1</span>
          <h1>Зал совета</h1>
          <p>Создайте зал совета и пригласите второго игрока по коду. Указы выбираются скрытно.</p>
          <div class="room-actions">
            <button data-native-press class="primary-btn" data-action="create-room">Создать комнату</button>
            <div class="join-box">
              <input data-input="room-code" value="${app.online.codeInput}" maxlength="8" placeholder="Код комнаты" />
              <button data-native-press class="ghost-btn" data-action="join-room">Подключиться</button>
            </div>
          </div>
          <button data-native-press class="text-btn" data-action="back-menu">Назад в меню</button>
        </div>
      </section>
    `;
  }

  return gameHTML(roomState, `Комната ${app.online.roomCode}`);
}

function gameHTML(state, eyebrow) {
  const viewer = getViewerPlayer();
  const chooserLabel = app.local.mode === "hotseat" ? (viewer === "p1" ? "Север выбирает указ" : "Юг выбирает указ") : eyebrow;
  return `
    <div class="game-shell">
      <div class="game-shell__frame">
        <header class="topbar">
          <div class="topbar__left">
            <span class="eyebrow">${chooserLabel || "Зал пяти законов"} · ход ${state.turn}</span>
            <h1>Законы короны</h1>
          </div>
          <div class="topbar__right">
            ${crownRow(state.players.p1, viewer === "p1" ? "Север · вы" : "Север · соперник", "north")}
            ${crownRow(state.players.p2, viewer === "p2" ? "Юг · вы" : "Юг · соперник", "south")}
            <div class="hud-actions">
              <button data-native-press class="text-btn" data-action="toggle-rules">Правила</button>
              <button data-native-press class="text-btn" data-action="toggle-settings">Звук</button>
              <button data-native-press class="text-btn" data-action="back-menu">Меню</button>
            </div>
          </div>
        </header>
        <main class="game-layout">
          <div class="game-layout__main">${boardHTML(app.replayActive && app.replayStage === "before" && app.replay ? app.replay.before : state)}${app.replayActive ? `<p class="replay-ribbon">Повтор предыдущего хода · ${app.replayStage === "before" ? "до" : "после"} выполнения законов</p>` : ""}</div>
          <aside class="game-layout__side">
            ${lawSlotsHTML(state)}
          </aside>
          <div class="game-layout__hand">${handHTML(state)}</div>
          <div class="game-layout__foot">${logHTML(state)}</div>
        </main>
      </div>
      ${app.local.mode === "hotseat" && app.local.passScreen ? `
        <div class="pass-overlay">
          <div class="pass-card">
            <span class="eyebrow">Тайное голосование</span>
            <h2>Передайте устройство</h2>
            <p>Первый указ запечатан. Пусть второй игрок выберет свой закон.</p>
            <button data-native-press class="primary-btn" data-action="continue-hotseat">Продолжить</button>
          </div>
        </div>
      ` : ""}
      ${victoryHTML(state)}
    </div>
  `;
}

function menuHTML() {
  return `
    <section class="menu-shell">
      <div class="hero-card hero-card--menu">
        <div class="hero-card__content">
          <span class="eyebrow">Состязание за престол</span>
          <h1><span class="title-line">Законы</span><span class="title-line">короны</span></h1>
          <p class="hero-card__lede">Два претендента, один трон. Вы не двигаете фигуры — вы переписываете законы, которым они подчиняются.</p>
          <div class="hero-card__crest" aria-hidden="true">ЗК</div>
        </div>
        <nav class="menu-navigation" aria-label="Режим игры">
          <span class="menu-navigation__label">Начать заседание</span>
          <div class="menu-grid">
            ${profileOptions()}
            <button data-native-press class="menu-card" data-action="open-online">
              <span class="menu-card__index">II</span>
              <span class="menu-card__copy"><span class="menu-card__title">Играть онлайн</span><span class="menu-card__text">Приватная комната на двоих</span></span>
              <span class="menu-card__arrow" aria-hidden="true">→</span>
            </button>
            <button data-native-press class="menu-card" data-action="start-hotseat">
              <span class="menu-card__index">III</span>
              <span class="menu-card__copy"><span class="menu-card__title">На одном устройстве</span><span class="menu-card__text">Передавайте устройство после тайного выбора</span></span>
              <span class="menu-card__arrow" aria-hidden="true">→</span>
            </button>
          </div>
          <div class="menu-secondary">
            <button data-native-press class="ghost-btn" data-action="toggle-rules">Как играть</button>
            <button data-native-press class="ghost-btn" data-action="toggle-settings">Настройки</button>
          </div>
        </nav>
      </div>
    </section>
  `;
}

function modalHTML() {
  if (!app.modal) {
    return "";
  }
  if (app.modal === "simulation" && app.simulationReport) {
    return `
      <div class="modal-shell" data-action="close-modal">
        <div class="modal-card" data-stop-click="1">
          <div class="panel-head">
            <h3>Автосимуляция</h3>
            <button data-native-press class="text-btn" data-action="close-modal">Закрыть</button>
          </div>
          <div class="sim-grid">
            <div class="sim-card">
              <span>Сыграно ходов</span>
              <strong>${app.simulationReport.turnsPlayed} / ${app.simulationReport.turnsRequested}</strong>
            </div>
            <div class="sim-card">
              <span>Получено корон</span>
              <strong>Север ${app.simulationReport.crowns.p1} · Юг ${app.simulationReport.crowns.p2}</strong>
            </div>
            <div class="sim-card">
              <span>Конфликты законов</span>
              <strong>${app.simulationReport.conflicts}</strong>
            </div>
            <div class="sim-card">
              <span>Стояли на троне</span>
              <strong>Север ${app.simulationReport.throneStands.p1} · Юг ${app.simulationReport.throneStands.p2}</strong>
            </div>
            <div class="sim-card">
              <span>Корона была заблокирована</span>
              <strong>${app.simulationReport.crownBlocked}</strong>
            </div>
            <div class="sim-card">
              <span>Средняя дистанция до трона</span>
              <strong>Север ${app.simulationReport.averageDistance.p1} · Юг ${app.simulationReport.averageDistance.p2}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  if (app.modal === "rules") {
    return `
      <div class="modal-shell" data-action="close-modal">
        <div class="modal-card" data-stop-click="1">
          <div class="panel-head">
            <h3>Правила и опоры</h3>
            <button data-native-press class="text-btn" data-action="close-modal">Закрыть</button>
          </div>
          <div class="rules-list">
            ${RULES_TEXT.map((line) => `<p>${line}</p>`).join("")}
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="modal-shell" data-action="close-modal">
      <div class="modal-card" data-stop-click="1">
        <div class="panel-head">
          <h3>Настройки</h3>
          <button data-native-press class="text-btn" data-action="close-modal">Закрыть</button>
        </div>
        <label class="setting-row">
          <span>Звук эффектов</span>
          <input type="checkbox" data-setting="sound" ${app.settings.sound ? "checked" : ""} />
        </label>
        <label class="setting-row">
          <span>Снизить анимации</span>
          <input type="checkbox" data-setting="reducedMotion" ${app.settings.reducedMotion ? "checked" : ""} />
        </label>
      </div>
    </div>
  `;
}

function render() {
  const state = currentState();
  if (app.screen === "menu") {
    root.innerHTML = `${menuHTML()}${modalHTML()}`;
  } else if (app.screen === "online") {
    root.innerHTML = `${roomHTML()}${modalHTML()}`;
  } else if (app.screen === "game" && state) {
    root.innerHTML = `${gameHTML(state, app.local.mode === "ai" ? AI_PROFILES[app.local.aiProfile].name : "Локальная партия")}${modalHTML()}`;
  }
  animateBoard();
  syncExports();
  persistLocal();
}

function persistLocal() {
  try { localStorage.setItem('pocket-works:crown-laws:local', JSON.stringify({version:1,local:app.local,settings:app.settings,screen:app.screen==='game'?'game':'menu'})); } catch {}
}
function restoreLocal() {
  try {
    const saved=JSON.parse(localStorage.getItem('pocket-works:crown-laws:local')||'null');
    if(saved?.version!==1 || !saved.local || !['ai','hotseat',null].includes(saved.local.mode))return;
    const s=saved.local.state;
    if(s && (!Number.isInteger(s.turn)||s.turn<1||s.turn>10000||!s.players||!s.pieces||!['p1','p2'].every(r=>Array.isArray(s.players[r]?.hand)&&s.players[r].hand.every(id=>CARD_BY_ID[id]))))return;
    app.local={...app.local,...saved.local,waitingAi:false};
    if(!AI_PROFILES[app.local.aiProfile])app.local.aiProfile='contender';
    if(saved.settings)app.settings={sound:saved.settings.sound!==false,music:saved.settings.music===true,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches||saved.settings.reducedMotion===true};
    if(s && saved.screen==='game')app.screen='game';
  }catch{}
}

function animateBoard() {
  const state = app.replayActive && app.replayStage === "before" && app.replay ? app.replay.before : currentState();
  if (!state) return;
  const nextPositions = Object.fromEntries(Object.values(state.pieces).map(piece => [piece.id, {x:piece.x,y:piece.y}]));
  const board = root.querySelector('.board');
  const rect = board?.getBoundingClientRect();
  if (rect && !app.settings.reducedMotion) {
    root.querySelectorAll('.piece').forEach(node => {
      const prev = app.lastBoardPositions[node.dataset.pieceId];
      const next = nextPositions[node.dataset.pieceId];
      if (!prev || !next || (prev.x === next.x && prev.y === next.y)) return;
      const dx = (prev.x - next.x) * rect.width / 5;
      const dy = (prev.y - next.y) * rect.height / 7;
      node.animate([
        {transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.93)`},
        {transform: 'translate(-50%, -50%) scale(1)'}
      ], {duration: 360,easing:'cubic-bezier(.2,.75,.2,1)'});
    });
  }
  app.lastBoardPositions = nextPositions;
}

function syncExports() {
  window.render_game_to_text = () => {
    const state = currentState();
    return state ? serializeTextState(state) : JSON.stringify({ screen: app.screen });
  };
  window.advanceTime = () => {};
}

root.addEventListener("click", (event) => {
  const stop = event.target.closest("[data-stop-click]");
  if (stop) {
    return;
  }
  const actionNode = event.target.closest("[data-action]");
  if (actionNode) {
    const action = actionNode.dataset.action;
    switch (action) {
      case "start-ai":
        startLocalGame("ai", actionNode.dataset.profile);
        break;
      case "start-hotseat":
        startLocalGame("hotseat");
        break;
      case "open-online":
        app.screen = "online";
        app.online.roomState = null;
        render();
        break;
      case "create-room":
        createRoom();
        break;
      case "join-room":
        joinRoom();
        break;
      case "copy-room-code":
        navigator.clipboard?.writeText(app.online.roomCode);
        playTone("tap");
        break;
      case "confirm-choice":
        confirmSelection();
        break;
      case "toggle-rules":
        openModal("rules");
        break;
      case "toggle-settings":
        openModal("settings");
        break;
      case "clear-inspection":
        app.focusCardId=null; app.selectedCardId=null; app.inspectedSlot=null; render();
        break;
      case "toggle-history":
        app.historyExpanded=!app.historyExpanded; render();
        break;
      case "replay-turn":
        if(app.replay&&!app.replayActive){
          app.replayActive=true; app.replayStage="before"; render();
          window.clearTimeout(app.replayTimer);
          app.replayTimer=window.setTimeout(()=>{app.replayStage="after";render();app.replayTimer=window.setTimeout(()=>{app.replayActive=false;render();},1100);},700);
        }
        break;
      case "close-modal":
        closeModal();
        break;
      case "back-menu":
        window.clearTimeout(app.replayTimer);app.replayActive=false;
        app.screen = "menu";
        app.local.state = null;
        render();
        break;
      case "continue-hotseat":
        app.local.passScreen = false;
        render();
        break;
      case "rematch":
        if (app.screen === "online" && app.online.socket) {
          app.online.socket.send(JSON.stringify({ type: "match:restart" }));
        } else {
          startLocalGame(app.local.mode, app.local.aiProfile);
        }
        break;
      default:
        break;
    }
  }

  const focus = event.target.closest("[data-focus-card]");
  if (focus && !event.target.closest("[data-card-id]")) {
    app.focusCardId=focus.dataset.focusCard;
    app.inspectedSlot=focus.dataset.slot||null;
  }

  const piece=event.target.closest("[data-piece-kind]");
  if(piece){
    app.inspectedSlot=piece.dataset.pieceKind;
    app.focusCardId=activeLaws(currentState())[app.inspectedSlot]?.id||null;
    render();return;
  }
  const card = event.target.closest("[data-card-id]");
  if (focus && !card) {
    render();
    return;
  }
  if (card) {
    const cardId = card.dataset.cardId;
    if(card.disabled)return;
    app.selectedCardId = app.selectedCardId === cardId ? null : cardId;
    app.inspectedSlot=cardById(cardId).slot;
    playTone("tap");
    render();
    return;
  }

  const debugAction = event.target.closest("[data-debug-action]");
  if (debugAction && app.local.state) {
    if (debugAction.dataset.debugAction === "simulate-20") {
      simulateDebugTurns(20);
    }
    return;
  }

  const debug = event.target.closest("[data-debug]");
  if (debug && app.local.state) {
    const type = debug.dataset.debug;
    if (type === "set-law") {
      const slot = debug.dataset.slot;
      const cardId = app.debugSelects[slot];
      app.local.state = applyDebugAction(app.local.state, {
        type,
        slot,
        cardId: cardId === "base" ? null : cardId,
        owner: cardId === "base" ? null : "p1"
      });
    } else {
      app.local.state = applyDebugAction(app.local.state, {
        type,
        playerId: debug.dataset.player
      });
    }
    render();
  }
});

root.addEventListener("input", (event) => { if (event.target.matches("[data-input=room-code]")) app.online.codeInput = event.target.value.toUpperCase(); });

root.addEventListener("change", (event) => {
  if (event.target.matches("[data-input='room-code']")) {
    app.online.codeInput = event.target.value.toUpperCase();
    return;
  }
  if (event.target.matches("[data-setting]")) {
    app.settings[event.target.dataset.setting] = event.target.checked;
    render();
    return;
  }
  const slot = event.target.dataset.slotSelect;
  if (slot) {
    app.debugSelects[slot] = event.target.value;
  }
});

root.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-card-id]");
  if (!card) {
    return;
  }
  app.dragCardId = card.dataset.cardId;
  event.dataTransfer.setData("text/plain", app.dragCardId);
});

root.addEventListener("dragover", (event) => {
  const slot = event.target.closest(".law-slot");
  if (slot) {
    event.preventDefault();
  }
});

root.addEventListener("drop", (event) => {
  const slotNode = event.target.closest(".law-slot");
  if (!slotNode || !app.dragCardId) {
    return;
  }
  event.preventDefault();
  const dragged = cardById(app.dragCardId);
  if (dragged.slot === slotNode.dataset.slot) {
    app.selectedCardId = app.dragCardId;
    render();
  }
  app.dragCardId = null;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && app.modal) {
    closeModal();
  }
  if (event.key.toLowerCase() === "r" && event.altKey && app.screen === "game" && app.local.state) {
    app.local.state = applyDebugAction(app.local.state, { type: "restart" });
    render();
  }
});

restoreLocal();
try {
  const saved=JSON.parse(sessionStorage.getItem('pocket-works:crown-laws:pocket-net:'+location.origin+'/pocketnet')||'null');
  if(saved?.roomId){app.screen='online';setupSocket();}
} catch {}
render();
