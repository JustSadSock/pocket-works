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
  forecastTurn,
  serializeTextState
} from "../shared/game-engine.js";
import { chooseAiCard } from "../shared/ai.js";
import { planTurnFilm, soundForFrame, PHASE_ORDER, PHASE_LABELS } from "./choreography.js";
import { playCourtSound, COURT_SOUNDS } from "./soundscape.js";
import { VISION_PHASES, createCounselVision, selectedVisionResult, selectedVisionFrame, alternateVisionFrame, visionPaths, visionGhosts, visionDifference } from "./counsel-vision.js";

const root = document.getElementById("app");

const app = {
  screen: "menu",
  modal: null,
  rulesChapter: "goal",
  victoryRecap: false,
  selectedCardId: null,
  focusCardId: null,
  dragCardId: null,
  lastConflictSlots: [],
  lastBoardPositions: {},
  effects: [],
  effectTimer: null,
  film: null,
  filmTimer: null,
  filmSequence: 0,
  simulationReport: null,
  inspectedSlot: null,
  historyExpanded: false,
  forecast: null,
  forecastReview: false,
  replay: null,
  preResolutionState: null,
  replayActive: false,
  replayStage: "after",
  replayTimer: null,
  debug: { open: false, tab: "screens", scene: "game", animation: null, selectedCardId: null, focusCardId: null, inspectedSlot: null, forecast: null, forecastReview: false, round: null, roundTimer: null, roundToken: 0 },
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
    copyStatus: "",
    error: "",
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

function playTone(kind = "tap", force = false) { return playCourtSound(ensureAudio(force),kind); }

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
  // Square board cells are 20% wide and 100/7% tall: correct the visual y scale.
  const length = Math.hypot(dx, dy * 7 / 5);
  const angle = (Math.atan2(dy * 7 / 5, dx) * 180) / Math.PI;
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
  app.victoryRecap=false;
  stopFilm({renderNow:false});
  app.effects = [];
  app.replay = null;
  app.replayActive = false;
  app.inspectedSlot = null;
  app.historyExpanded = false;
  app.forecast = null;
  app.forecastReview = false;
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


function stopFilm({renderNow = true} = {}) {
 window.clearTimeout(app.filmTimer);app.filmTimer=null;app.filmSequence++;app.film=null;
 app.effects=[];app.lastConflictSlots=[];app.lastBoardPositions={};
 if(renderNow)render();
}
function effectsForFrame(frame) {
 if(!frame)return [];
 const effects=[];
 for(const move of frame.moves||[]){
  if(!move.from||!move.to)continue;
  effects.push({kind:"footfall",x:move.to.x,y:move.to.y,actor:move.pieceId});
  effects.push({kind:move.pieceId==="beast"?"beast-dash":move.pieceId==="thief"?"seal-trail":"stride-trail",from:move.from,to:move.to});
  if(move.style==="push")effects.push({kind:"impact",x:move.to.x,y:move.to.y});
 }
 const kinds=(frame.logs||[]).map(x=>x.kind);
 if(kinds.some(k=>["push-block","shield-break","shield-block","stun","clash","blessing-break"].includes(k))){
  const id=frame.phase==="beast"?"beast":frame.phase==="guard"?"guard":"champion_p1";
  const p=frame.state?.pieces?.[id];
  if(p)effects.push({kind:"impact",x:p.x,y:p.y});
 }
 for(const entry of frame.logs||[]){
  if(entry.kind==="shield"&&frame.state?.pieces?.[entry.pieceId]){
   const p=frame.state.pieces[entry.pieceId];effects.push({kind:"shield",x:p.x,y:p.y});
  }
  if(entry.kind==="seal-steal"&&frame.state?.pieces){
   const owner=frame.state.pieces[entry.ownerId==="p1"?"champion_p1":"champion_p2"];
   const thief=frame.state.pieces.thief;
   if(owner&&thief)effects.push({kind:"seal-trail",from:owner,to:thief});
  }
 }
 if(frame.phase==="throne"&&(frame.crowns||[]).some(c=>c.kind==="gain"))effects.push({kind:"crown",x:THRONE.x,y:THRONE.y});
 if(frame.conflicts?.length)effects.push({kind:"conflict",slot:frame.conflicts[0]});
 return effects;
}
function showFilmFrame(index){
 if(!app.film?.active)return;
 app.film.index=index;
 const frame=app.film.frames[index];
 if(!frame){stopFilm();return;}
 app.effects=app.settings.reducedMotion?[]:effectsForFrame(frame);
 const sound=soundForFrame(frame);if(sound)playTone(sound);
 render();
 const token=app.filmSequence;
 app.filmTimer=window.setTimeout(()=>{
  if(token!==app.filmSequence||!app.film?.active)return;
  if(index+1<app.film.frames.length)showFilmFrame(index+1);else stopFilm();
 },frame.duration);
}
function beginFilm(input){
 window.clearTimeout(app.filmTimer);app.filmTimer=null;app.filmSequence++;
 const frames=planTurnFilm(input,{compact:app.settings.reducedMotion});
 if(!frames.length)return;
 app.film={active:true,index:0,frames};
 app.forecast=null;app.forecastReview=false;app.effects=[];app.lastBoardPositions={};
 showFilmFrame(0);
}

function recordResolution(resolution,isOnline=false){
 app.lastConflictSlots=resolution.conflicts||[];
 const after=isOnline?app.online.roomState:app.local.state;
 if(!isOnline&&app.preResolutionState){
  const before=app.preResolutionState;
  app.replay={before,after:structuredClone(after),frames:resolution.frames,logs:resolution.logs,conflicts:resolution.conflicts};
  app.preResolutionState=null;
  beginFilm({before,after,frames:resolution.frames,logs:resolution.logs,conflicts:resolution.conflicts});
 }else{scheduleEffects(buildEffects(after,resolution));}
 if(isOnline)app.online.lastLogs=resolution.logs;else app.local.lastLogs=resolution.logs;
}

function openForecast() {
 const state=currentState();
 if(!state||app.replayActive||app.film?.active||state.winner)return;
 if(app.screen==="online" && app.online.ready[getViewerPlayer()])return;
 if(app.local.waitingAi || app.local.passScreen)return;
 const player=getViewerPlayer(),cardId=app.selectedCardId||null;
 app.forecast=createCounselVision(state,player,cardId,forecastTurn);
 app.forecastReview=false;
 app.lastBoardPositions={};
 render();
}

function visionStepTo(step){
 if(!app.forecast)return;
 const next=Math.min(VISION_PHASES.length-1,Math.max(0,Number(step)||0));
 app.forecast.step=next;app.forecastReview=next===VISION_PHASES.length-1;
 render();
}
function visionChooseSide(side){
 if(!app.forecast)return;
 if(side==="proposed"&&!app.forecast.proposed)return;
 if(!["current","proposed"].includes(side))return;
 app.forecast.side=side;
 render();
}
function closeVision(){
 app.forecast=null;app.forecastReview=false;app.lastBoardPositions={};render();
}

function confirmSelection() {
  const state = currentState();
  if (!state || !app.selectedCardId || app.film?.active) {
    return;
  }
  app.forecast=null;app.forecastReview=false;

  if (app.screen === "online") {
    if (!app.online.socket || app.online.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    app.online.socket.send(JSON.stringify({ type: "match:choose", cardId: app.selectedCardId }));
    app.online.ready[app.online.you] = true;
    app.forecast=null;app.forecastReview=false;
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
    app.online.status = "connected";app.online.error="";
    render();
  });
  socket.addEventListener("close", () => {
    if(app.online.socket!==socket)return;
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
      if(app.forecast&&payload.room.state?.turn!==app.forecast.turn){app.forecast=null;app.forecastReview=false;}
      if(app.online.roomCode!==payload.room.code)app.online.copyStatus="";
      app.online.roomCode = payload.room.code;
      app.online.error="";
      app.online.you = payload.room.you;
      app.online.ready = payload.room.ready;
      app.online.roomState = payload.room.state;
      if (app.online.roomState && prevTurn && app.online.roomState.turn !== prevTurn) {
        const turnLogs=app.online.roomState.battleLog.slice(0,16);
        const conflicts=app.online.roomState.turnSummaries[0]?.conflicts||[];
        app.replay={before:structuredClone(previousRoomState),after:structuredClone(app.online.roomState),logs:turnLogs,conflicts};
        app.online.lastLogs=turnLogs;app.lastConflictSlots=conflicts;
        beginFilm({before:previousRoomState,after:app.online.roomState,logs:turnLogs,conflicts});
      }
      render();
    }
    if (payload.type === "room:error") {
      app.online.error=String(payload.message||"Ошибка соединения").slice(0,240);
      render();
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

function crownRow(player,title,side="north") {
  const lit=Math.max(0,Math.min(3,player.activeCrowns));
  return `<div class="crown-bar crown-bar--${side}" aria-label="${title}: ${lit} из 3 корон">
    <div class="crown-bar__identity"><span class="crown-bar__portrait sprite-figure sprite-figure--${side}" aria-hidden="true"></span><span class="crown-bar__label">${title}</span></div>
    <div class="crown-bar__icons crown-row" role="img" aria-label="Получено корон: ${lit} из 3">
      ${Array.from({length:3},(_,i)=>`<span class="crown-mark ${i<lit?"is-earned":"is-empty"}" aria-hidden="true"><svg viewBox="0 0 48 40"><path d="M5 33L2 11l12 10L24 4l10 17 12-10-3 22-5 4H10Z"/><path d="M9 29h30" fill="none" stroke-width="3"/></svg></span>`).join("")}
    </div></div>`;
}

function pieceGlyph(piece) {
  const key=piece.kind==="champion"?(piece.owner==="p1"?"north":"south"):piece.kind;
  return `<span class="piece__portrait sprite-figure sprite-figure--${key}" aria-hidden="true"></span>`;
}

function effectsHTML() {
  return app.effects
    .map((effect) => {
      if (["crown","shield","footfall","impact"].includes(effect.kind)) {
        return `<div class="board-effect board-effect--${effect.kind}" style="--x:${effect.x};--y:${effect.y};left:${(effect.x+.5)*20}%;top:${(effect.y+.5)*(100/7)}%"></div>`;
      }
      if (["beast-dash","seal-trail","stride-trail"].includes(effect.kind)) {
        return `<div class="board-effect board-effect--${effect.kind}" style="${effectLineStyle(effect.from, effect.to)}"></div>`;
      }
      return "";
    })
    .join("");
}

function boardHTML(state) {
 const cells=[];
 for(let y=0;y<7;y++)for(let x=0;x<5;x++)cells.push(`<div class="board-cell ${x===THRONE.x&&y===THRONE.y?"board-cell--throne":""}"><span>${String.fromCharCode(65+x)}${y+1}</span></div>`);
 const pieces=Object.values(state.pieces).map(piece=>{
  const cls=["piece",`piece--${piece.kind}`,piece.owner==="p1"?"piece--p1":piece.owner==="p2"?"piece--p2":"",piece.shield?"piece--shielded":"",piece.stun?"piece--stunned":"",piece.carryingSeal?"piece--sealed":"",app.inspectedSlot===piece.kind?"piece--focused":"",(app.film?.active?app.film.frames[app.film.index].moves:(app.debug.open?app.debug.round?.frames[app.debug.round.index]?.moves:null))?.some(m=>m.pieceId===piece.id)?"piece--performing":""].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" data-piece-kind="${piece.kind}" data-piece-id="${piece.id}" title="${piece.kind==="champion"?(piece.owner==="p1"?"Северный претендент":"Южный претендент"):SLOT_LABELS[piece.kind]}" aria-label="${piece.kind==="champion"?(piece.owner==="p1"?"Северный претендент":"Южный претендент"):SLOT_LABELS[piece.kind]}" style="--x:${piece.x};--y:${piece.y};left:${(piece.x+.5)*20}%;top:${(piece.y+.5)*(100/7)}%"><span class="piece__token">${pieceGlyph(piece)}${piece.shield?'<span class="piece__status piece__status--shield" title="Щит">✦</span>':""}${piece.stun?'<span class="piece__status piece__status--stun" title="Оглушение">✕</span>':""}${piece.carryingSeal?'<span class="piece__status piece__status--seal" title="Похищенная печать">◇</span>':""}</span></button>`;
 }).join("");
 return `<section class="board-panel"><div class="board-caption"><span class="board-caption__title">Королевский двор</span><span class="board-pill board-pill--throne">Трон ${coordLabel(THRONE)} · ход ${state.turn}</span></div><div class="board-surround"><div class="board"><div class="board-grid">${cells.join("")}</div>${visionBoardOverlayHTML()}<div class="board-glow"></div><div class="board-effects">${effectsHTML()}</div>${pieces}</div></div></section>`;
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
        <span class="law-slot__sigil sprite-seal sprite-seal--${slot}" aria-hidden="true"></span><span class="law-slot__short">${short[slot]}</span><span class="law-slot__copy"><span class="law-slot__name">${law.name}</span><span class="law-slot__mode">${base?"Каменный закон":"Новый указ"}</span></span>
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

function forecastControlsHTML() {
 const v=app.forecast;if(!v)return "";
 const f=selectedVisionFrame(v),dif=visionDifference(v);
 const events=f?.logs||[];
 const prominent=events.filter(entry=>!["crown-check","hold"].includes(entry.kind)).slice(0,2);
 const label=v.proposed? "Два условных сценария": "Текущие законы без новых указов";
 const currentSelected=v.side==="current",chosenSelected=v.side==="proposed";
 const status=v.proposed?`Фигуры: ${dif.moved} · Короны: ${dif.crowns} · Щиты: ${dif.shields}`:"Обе стороны сохраняют действующие законы";
 return `<section class="vision" aria-label="Видение советника">
 <div class="vision__heading">
  <span class="vision__icon" aria-hidden="true">◇</span>
  <div class="vision__intro"><strong>Видение советника</strong><small>${label} · ${status}</small></div>
  <button type="button" class="vision__close" data-action="forecast-close" aria-label="Закрыть видение">×</button>
 </div>
 <div class="vision__controls">
  <div class="vision__scenarios" role="group" aria-label="Сценарий">
   <button type="button" data-action="vision-mode" data-mode="current" class="${currentSelected?"is-active":""}" aria-pressed="${currentSelected}">Как сейчас</button>
   <button type="button" data-action="vision-mode" data-mode="proposed" class="${chosenSelected?"is-active":""}" aria-pressed="${chosenSelected}" ${v.proposed?"":"disabled"}>С моим указом</button>
  </div>
  <div class="vision__nav">
   <button type="button" data-action="vision-previous" aria-label="Предыдущая фаза" ${v.step===0?"disabled":""}>‹</button>
   <strong>${VISION_PHASES[v.step][1]}</strong>
   <button type="button" data-action="vision-next" aria-label="Следующая фаза" ${v.step===VISION_PHASES.length-1?"disabled":""}>›</button>
  </div>
 </div>
 <div class="vision__timeline" role="group" aria-label="Этапы условного хода">
  ${VISION_PHASES.map(([phase,name],i)=>`<button type="button" class="${v.step===i?"is-active":""} ${v.step>i?"is-past":""}" data-action="vision-step" data-step="${i}" aria-current="${v.step===i?"step":"false"}" title="${name}"><span>${i===0?"◉":i===8?"♛":i}</span><small>${name}</small></button>`).join("")}
 </div>
 <div class="vision__events" aria-live="polite">
  <span class="vision__events-label">${f?.moves?.length?"Маршруты фигур показаны на поле":v.step===0?"Исходное положение":"Действие закона"}</span>
  <span class="vision__events-text">${prominent.map(entry=>entry.text).join(" · ")||"На этой фазе изменений нет."}</span>
 </div>
 <div class="vision__disclaimer"><span aria-hidden="true">!</span> Не предсказание: соперник не меняет закон. Его скрытый указ неизвестен. Призрачные фигуры — разница между двумя сценариями.</div>
 </section>`;
}

function visionBoardOverlayHTML() {
 const v=app.forecast;if(!v)return "";
 const current=selectedVisionFrame(v),alternate=alternateVisionFrame(v);
 const routes=visionPaths(current),ghosts=visionGhosts(current,alternate);
 const svg=`<svg viewBox="0 0 500 700" preserveAspectRatio="none" aria-hidden="true">
 <defs><marker id="vision-arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="#f4d49a"/></marker></defs>
 ${routes.map(path=>`<path class="vision-route ${path.style==="push"?"vision-route--push":""}" d="${path.path}" marker-end="url(#vision-arrowhead)"/><circle class="vision-route__origin" cx="${path.from.x*100+50}" cy="${path.from.y*100+50}" r="6"/>`).join("")}
 </svg>`;
 return `<div class="vision-overlay" aria-hidden="true">${svg}
 ${ghosts.map(p=>{
  const key=p.kind==="champion"?(p.owner==="p1"?"north":"south"):p.kind;
  return `<span class="vision-ghost sprite-figure--${key}" style="--gx:${p.x};--gy:${p.y};left:${(p.x+.5)*20}%;top:${(p.y+.5)*(100/7)}%"></span>`;
 }).join("")}</div>`;
}

function handHTML(state) {
  const viewer=getViewerPlayer();
  const locked=Boolean(app.film?.active)||(app.screen==="online"&&app.online.ready[viewer])||app.local.waitingAi||(app.local.mode==="hotseat"&&app.local.passScreen);
  return `<section class="hand-panel ${locked?"hand-panel--locked":""}">
    <div class="panel-head"><h3>Ваши указы</h3><span>${viewer==="p1"?"Север":"Юг"} · ${currentHand().length} карт</span></div>
    ${locked&&!app.film?.active?`<div class="sealed-notice sealed-notice--ceremony" role="status">
      <div class="sealed-notice__wax" aria-hidden="true"><span>✦</span></div>
      <div class="sealed-notice__copy"><strong>Указ запечатан</strong><span>${app.screen==="online"?"Ждём второй печати":"Указ принят"}</span></div>
      ${app.screen==="online"?`<div class="sealed-notice__readiness" aria-label="Готовность игроков"><span class="${app.online.ready.p1?"is-ready":""}" title="Север">I</span><span class="${app.online.ready.p2?"is-ready":""}" title="Юг">II</span></div>`:`<span class="sealed-notice__pulse" aria-hidden="true"><i></i><i></i><i></i></span>`}
    </div>`:""}
    <div class="hand" role="group" aria-label="Выбор одного указа">${currentHand().map(cardId=>{
      const card=cardById(cardId);
      return `<button type="button" class="law-card ${app.selectedCardId===cardId?"law-card--selected":""}" style="--card-color:${SLOT_COLORS[card.slot]}" aria-pressed="${app.selectedCardId===cardId}" ${locked?"disabled":""} draggable="${!locked}" data-card-id="${cardId}" data-focus-card="${cardId}">
        <span class="law-card__sigil sprite-seal sprite-seal--${card.slot}" aria-hidden="true"></span><span class="law-card__copy"><span class="law-card__slot">${SLOT_LABELS[card.slot].replace("Закон ","")}</span><strong class="law-card__title">${card.name}</strong></span></button>`;
    }).join("")}</div>
    ${app.selectedCardId && !app.forecast && !app.film?.active ? detailCard(state) : ""}
    <div class="hand-actions"><button data-native-press class="ghost-btn forecast-btn" data-action="forecast-open" ${locked?"disabled":""} aria-label="Условный предпросмотр следующего хода">◈ Предпросмотр</button><button data-native-press class="primary-btn" data-action="confirm-choice" ${!app.selectedCardId||locked?"disabled":""}>${locked?"◆ Указ отправлен":"◆ Утвердить"}</button></div>
  </section>`;
}

function phaseBanner() {
  if (app.film?.active) return app.film.frames[app.film.index].label;
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
 if(!state?.winner)return "";
 const winnerId=state.winner,otherId=winnerId==="p1"?"p2":"p1";
 const winner=winnerId==="p1"?"Север":"Юг",other=otherId==="p1"?"Север":"Юг";
 const side=winnerId==="p1"?"north":"south";
 const localHotseat=app.screen==="game"&&app.local.mode==="hotseat";
 const viewer=getViewerPlayer();
 const isSelf=!localHotseat&&winnerId===viewer;
 const isDefeat=!localHotseat&&winnerId!==viewer;
 const rounds=Math.max(0,state.turn-1),p=state.players[winnerId],op=state.players[otherId];
 const entries=(state.battleLog||[]).filter(e=>e&&e.kind!=="crown-check"&&e.kind!=="hold"&&e.kind!=="setup").slice(0,12);
 return `<div class="victory victory--ceremony" role="dialog" aria-modal="true" aria-label="${isDefeat?"Поражение":"Результат партии"}">
  <section class="victory__panel victory__panel--ceremony">
   <div class="ceremony__halo" aria-hidden="true"></div>
   <div class="ceremony__ornament" aria-hidden="true"></div>
   <div class="ceremony__figures" aria-hidden="true">
    <span class="ceremony__claimant sprite-figure sprite-figure--${side}"></span>
    <div class="ceremony__royal-crown"></div>
   </div>
   <div class="ceremony__heading">
    <span class="ceremony__overline">${localHotseat?"ВЕНЕЦ ПРЕСТОЛА":isDefeat?"ТРОН ЗАНЯТ": "КОРОНАЦИЯ"}</span>
    <h2>${localHotseat?"Правитель определён":isDefeat?"Трон достался сопернику":"Корона ваша"}</h2>
    <p>${winner} · ${isDefeat?"победитель партии":localHotseat?"победитель дуэли":"новый правитель"}</p>
   </div>
   <div class="ceremony__score" aria-label="Итог корон">
    <div class="ceremony__score-side"><span>ПОБЕДИТЕЛЬ</span><strong>${winner}</strong><div class="ceremony__crowns">${Array.from({length:3},(_,i)=>`<span class="${i<p.activeCrowns?"is-lit":""}" aria-hidden="true">♛</span>`).join("")}</div></div>
    <div class="ceremony__score-mark">:</div>
    <div class="ceremony__score-side"><span>СОПЕРНИК</span><strong>${other}</strong><div class="ceremony__crowns">${Array.from({length:3},(_,i)=>`<span class="${i<op.activeCrowns?"is-lit":""}" aria-hidden="true">♛</span>`).join("")}</div></div>
   </div>
   <div class="ceremony__stats"><span><strong>${rounds}</strong> ${rounds===1?"ход":"ходов"}</span><span><strong>${p.activeCrowns}</strong> активных корон</span>${op.sealedCrowns||p.sealedCrowns?`<span><strong>${p.sealedCrowns+op.sealedCrowns}</strong> запечатано</span>`:""}</div>
   ${app.victoryRecap?`<section class="ceremony__chronicle" aria-label="Хроника последних событий"><h3>Последние события</h3><ol>${entries.map(e=>`<li>${escapeText(e.text)}</li>`).join("")||"<li>Событий пока нет.</li>"}</ol></section>`:""}
   <div class="victory__actions ceremony__actions">
     <button data-native-press class="primary-btn" data-action="rematch">↻ Реванш</button>
     <button data-native-press class="ghost-btn" data-action="victory-chronicle" aria-pressed="${app.victoryRecap}">${app.victoryRecap?"Закрыть хронику":"Хроника хода"}</button>
     <button data-native-press class="text-btn" data-action="back-menu">В зал совета</button>
   </div>
  </section>
 </div>`;
}

function roomHTML() {
 const state=app.online.roomState;
 if(state)return gameHTML(state,`Комната ${app.online.roomCode}`);
 const hasCode=Boolean(app.online.roomCode);
 const side=app.online.you==="p2"?"south":"north";
 const other=side==="north"?"south":"north";
 return `<section class="menu-shell council-lobby">
  <div class="council-lobby__grain" aria-hidden="true"></div>
  <article class="council-lobby__layout">
    <div class="council-lobby__visual" aria-hidden="true">
      <div class="council-lobby__architecture"></div>
      <div class="council-lobby__seats"></div>
      <div class="council-lobby__occupant sprite-figure sprite-figure--${side} ${hasCode?"is-visible":""}"></div>
      <div class="council-lobby__vacant" aria-hidden="true"></div>
    </div>
    <div class="council-lobby__controls">
     <div class="council-lobby__eyebrow">ТАЙНЫЙ СОВЕТ · ДВА ИГРОКА</div>
     <h1>${hasCode?"Второе кресло пустует":"Зал ожидает указов"}</h1>
     <p>${hasCode?"Ваше место занято. Пригласите второго претендента — партия начнётся после подключения.":"Создайте комнату или войдите по коду. Оба претендента выбирают указы одновременно и скрытно."}</p>
     ${hasCode?`<div class="council-lobby__invite">
         <span class="council-lobby__stamp">ПРИГЛАШЕНИЕ</span>
         <span class="council-lobby__code" role="text" aria-label="Код комнаты ${escapeText(app.online.roomCode)}">${escapeText(app.online.roomCode)}</span>
         <button data-native-press class="primary-btn" data-action="copy-room-code">Скопировать код</button>
         <p class="council-lobby__feedback" role="status">${app.online.copyStatus==="copied"?"✓ Код скопирован":app.online.copyStatus==="failed"?"Не удалось скопировать. Выделите код вручную.":"Передайте код второму игроку."}</p>
       </div>`:`<div class="council-lobby__entry">
         <button data-native-press class="primary-btn" data-action="create-room">Создать комнату</button>
         <div class="council-lobby__separator">или</div>
         <div class="join-box"><label for="crown-room-code">Код приглашения</label><input id="crown-room-code" data-input="room-code" value="${escapeText(app.online.codeInput)}" maxlength="8" placeholder="Введите код" autocomplete="off" autocapitalize="characters" spellcheck="false" /><button data-native-press class="ghost-btn" data-action="join-room">Войти</button></div>
       </div>`}
     <div class="council-lobby__footer"><span class="council-lobby__status"><i aria-hidden="true"></i>${app.online.status==="connected"?"Связь установлена":app.online.status==="connecting"?"Подключение к PocketNet":app.online.status==="closed"?"Соединение закрыто":app.online.status==="error"?"Проверьте соединение":"Подключение ожидается"}</span><button data-native-press class="text-btn" data-action="back-menu">← Главное меню</button></div>
     <p id="network-error" class="council-lobby__error" ${app.online.error?"":"hidden"} role="alert">${escapeText(app.online.error)}</p>
    </div>
  </article>
 </section>`;
}

function filmHTML() {
 const pb=app.film;if(!pb?.active)return "";
 const frame=pb.frames[pb.index],messages=frame.logs||[];
 const featured=messages.find(l=>!["turn-start","crown-check","hold"].includes(l.kind))||messages[0];
 const phases=frame.source==="network"?pb.frames.map(f=>f.phase):PHASE_ORDER.filter(phase=>pb.frames.some(f=>f.phase===phase)),idx=phases.indexOf(frame.phase);
 return `<section class="turn-film" aria-label="Разыгрывание закона" aria-live="polite">
 <div class="turn-film__crest" aria-hidden="true">${frame.phase==="laws"?"⚜":frame.phase==="throne"?"♛":"◆"}</div>
 <div class="turn-film__body"><div class="turn-film__title"><strong>${frame.label}</strong><span>${frame.source==="network"?"Результат общего хода":"Фаза "+Math.min(pb.index+1,pb.frames.length)+"/"+pb.frames.length}</span></div>
 <div class="turn-film__caption">${featured?.text || (frame.phase==="start"?"Указы вскрываются.":"Двор исполняет действующие законы.")}</div>
 <div class="turn-film__rail" aria-hidden="true">${phases.map((phase,i)=>`<span class="${idx>=i?"is-complete":""} ${phase===frame.phase?"is-current":""}" title="${PHASE_LABELS[phase]}"></span>`).join("")}</div></div>
 <button type="button" data-action="skip-film" class="turn-film__skip" aria-label="Пропустить показ хода и открыть результат">Пропустить <span aria-hidden="true">↠</span></button>
 </section>`;
}

function gameHTML(state, eyebrow) {
  const viewer = getViewerPlayer();
  const chooserLabel = app.local.mode === "hotseat" ? (viewer === "p1" ? "Север выбирает указ" : "Юг выбирает указ") : eyebrow;
  const displayState=app.film?.active?app.film.frames[app.film.index].state:(app.forecast?(selectedVisionFrame(app.forecast)?.state||state):(app.replayActive&&app.replayStage==="before"&&app.replay?app.replay.before:state));
  return `
    <div class="game-shell">
      <div class="game-shell__frame">
        <header class="topbar">
          <div class="topbar__left">
            <span class="eyebrow">${chooserLabel || "Зал пяти законов"} · ход ${state.turn}</span>
            <h1>Законы короны</h1>
          </div>
          <div class="topbar__right">
            ${crownRow(displayState.players.p1, viewer === "p1" ? "Север · вы" : "Север · соперник", "north")}
            ${crownRow(displayState.players.p2, viewer === "p2" ? "Юг · вы" : "Юг · соперник", "south")}
            <div class="hud-actions">
              <button data-native-press class="text-btn court-mobile-history" data-action="toggle-history" aria-expanded="${app.historyExpanded}" aria-label="Показать журнал событий">${app.historyExpanded?"Закрыть":"Журнал"}</button><button data-native-press class="text-btn" data-action="toggle-rules">Правила</button>
              <button data-native-press class="text-btn" data-action="toggle-settings">Звук</button>
              <button data-native-press class="text-btn" data-action="back-menu">Меню</button>
            </div>
          </div>
        </header>
        ${app.screen==="online"&&app.online.error?`<p class="game-network-error" role="alert">${escapeText(app.online.error)}</p>`:""}${app.film?.active ? filmHTML() : forecastControlsHTML()}<main class="game-layout">
          <div class="game-layout__main">${boardHTML(displayState)}${app.replayActive ? `<p class="replay-ribbon">Повтор предыдущего хода · ${app.replayStage === "before" ? "до" : "после"} выполнения законов</p>` : ""}</div>
          <aside class="game-layout__side">
            ${lawSlotsHTML(displayState)}
            ${!app.forecast && !app.film?.active && !app.selectedCardId && app.focusCardId ? detailCard(displayState) : ""}
          </aside>
          <div class="game-layout__hand">${handHTML(state)}</div>
          <div class="game-layout__foot">${logHTML(state)}</div>
        </main>
      </div>
      ${app.local.mode === "hotseat" && app.local.passScreen ? `
        <div class="pass-overlay pass-overlay--ceremony" role="dialog" aria-modal="true" aria-label="Передача устройства">
          <div class="pass-card pass-card--ceremony">
            <div class="pass-card__decoration" aria-hidden="true"><span class="pass-card__letter">I</span><span class="pass-card__wax">✦</span><span class="pass-card__letter">II</span></div>
            <span class="pass-card__eyebrow">УКАЗ СЕВЕРА ЗАПЕЧАТАН</span>
            <h2>Очередь Южного<br>претендента</h2>
            <p>Передайте устройство второму игроку. Его рука откроется только после подтверждения.</p>
            <div class="pass-card__divider"><span></span><span>◆</span><span></span></div>
            <button data-native-press class="primary-btn" data-action="continue-hotseat">Я — Юг. Открыть руку →</button>
          </div>
        </div>
      ` : ""}
      ${app.film?.active ? "" : victoryHTML(state)}
    </div>
  `;
}

function menuHTML() {
 return `<section class="menu-shell menu-shell--illustrated">
   <div class="hall-stage" aria-hidden="true"><div class="hall-stage__art"></div><div class="hall-stage__light"></div><div class="hall-stage__north sprite-figure sprite-figure--north"></div><div class="hall-stage__south sprite-figure sprite-figure--south"></div></div>
   <div class="menu-interface"><div class="menu-title"><span class="menu-title__prelude">Дуэль указов за королевский престол</span><h1>Законы <em>короны</em></h1><div class="menu-title__emblem sprite-seal sprite-seal--champion" aria-hidden="true"></div><p>Не двигай фигурами. Измени законы, которым подчиняется весь двор.</p></div>
    <nav class="menu-choices" aria-label="Режим игры"><button data-native-press class="menu-choice menu-choice--primary" data-action="start-ai"><span class="menu-choice__roman">I</span><span><strong>Против ИИ</strong><small>Начать партию</small></span><span class="menu-choice__arrow">↗</span></button>
    <button data-native-press class="menu-choice" data-action="open-online"><span class="menu-choice__roman">II</span><span><strong>Онлайн-дуэль</strong><small>Комната на двоих</small></span><span class="menu-choice__arrow">↗</span></button>
    <button data-native-press class="menu-choice" data-action="start-hotseat"><span class="menu-choice__roman">III</span><span><strong>На одном устройстве</strong><small>Тайные указы по очереди</small></span><span class="menu-choice__arrow">↗</span></button>
    <div class="menu-choices__aux"><button data-action="toggle-rules" class="text-btn">Правила ↗</button><button data-action="toggle-settings" class="text-btn">Настройки ⚙</button></div></nav>
   </div>
 </section>`;
}

const RULE_CHAPTERS=[
 {id:"goal",name:"Трон",title:"Три короны — одна победа",body:"Чемпион получает активную корону, когда стоит на троне и не оглушён. Нейтральная фигура на троне мешает коронации. Побеждает первый претендент с тремя активными коронами.",seal:"champion",tip:"Трон находится в центре поля — C4.",scene:"throne"},
 {id:"secret",name:"Указы",title:"Правила для всего двора",body:"Каждый игрок тайно выбирает одну карту. Указ меняет действующий закон одной категории. Изменённый закон работает для обеих сторон, пока его не заменят.",seal:"priest",tip:"Соперник не видит вашу карту до раскрытия.",scene:"law"},
 {id:"conflict",name:"Конфликт",title:"Один раздел — две печати",body:"Если оба игрока выбрали одну категорию, оба новых указа и предыдущий активный закон этой категории сбрасываются. Снова действует её базовый каменный закон.",seal:"guard",tip:"Это способ отменить сильный закон противника.",scene:"conflict"},
 {id:"actors",name:"Фигуры",title:"Двор исполняет указ",body:"Фигуры ходят сами. Порядок: Жрец, оба Чемпиона, Стражник, Зверь, Вор и затем проверка трона. Вы управляете не фигурой, а законом, определяющим её действия.",seal:"beast",tip:"Нажмите на любого персонажа в игре, чтобы посмотреть его действующий закон.",scene:"actors"},
 {id:"crown",name:"Печати",title:"Корону можно отнять",body:"Вор способен унести печать активной короны. Щит защищает, оглушение мешает действовать, а похищенные и потерянные короны учитываются отдельно от активных.",seal:"thief",tip:"Победа зависит только от числа активных корон.",scene:"seals"}
];
function escapeText(value){
 return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}
function rulesHTML(){
 const chapter=RULE_CHAPTERS.find(c=>c.id===app.rulesChapter)||RULE_CHAPTERS[0],idx=RULE_CHAPTERS.indexOf(chapter);
 const coords=Array.from({length:15},(_,i)=>`<span class="${i===7?"is-throne":i===2?"is-north":i===12?"is-south":""}"></span>`).join("");
 return `<div class="modal-shell" data-action="close-modal"><section class="modal-card codex-dialog" data-stop-click="1" role="dialog" aria-modal="true" aria-label="Правила игры">
 <header class="codex-dialog__top"><span>КОРОЛЕВСКИЙ КОДЕКС</span><button data-native-press data-action="close-modal" aria-label="Закрыть правила">×</button></header>
 <div class="codex-dialog__header"><h2>Пять законов.<br>Один трон.</h2><span class="codex-dialog__emblem sprite-seal sprite-seal--${chapter.seal}" aria-hidden="true"></span></div>
 <nav class="codex-dialog__chapters" aria-label="Разделы правил">${RULE_CHAPTERS.map((c,i)=>`<button type="button" data-action="rules-chapter" data-chapter="${c.id}" class="${c.id===chapter.id?"is-active":""}" aria-current="${c.id===chapter.id?"page":"false"}"><span>${i+1}</span>${c.name}</button>`).join("")}</nav>
 <div class="codex-dialog__chapter" aria-live="polite">
  <div class="codex-dialog__illustration codex-dialog__illustration--${chapter.scene}" aria-hidden="true">
   <div class="codex-dialog__mini-board">${coords}</div>
   <div class="codex-dialog__mini-sigil sprite-seal sprite-seal--${chapter.seal}"></div>
   <span class="codex-dialog__mini-crown">♛</span>
   ${chapter.scene==="conflict"?'<span class="codex-dialog__crack">╳</span>':""}
  </div>
  <div class="codex-dialog__reading"><span>ГЛАВА ${idx+1} / 5</span><h3>${chapter.title}</h3><p>${chapter.body}</p><div class="codex-dialog__note"><span aria-hidden="true">✦</span>${chapter.tip}</div></div>
 </div>
 <footer class="codex-dialog__bottom"><button type="button" data-action="rules-chapter" data-chapter="${RULE_CHAPTERS[(idx+4)%5].id}" aria-label="Предыдущая глава">← Назад</button><span>${idx+1} / 5</span><button type="button" data-action="rules-chapter" data-chapter="${RULE_CHAPTERS[(idx+1)%5].id}" aria-label="Следующая глава">Далее →</button></footer>
 </section></div>`;
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
  if (app.modal === "rules") return rulesHTML();
  return `<div class="modal-shell" data-action="close-modal">
    <section class="modal-card council-settings" data-stop-click="1" role="dialog" aria-modal="true" aria-label="Настройки">
      <header><span>ЗАЛ СОВЕТА · НАСТРОЙКИ</span><button type="button" data-action="close-modal" aria-label="Закрыть настройки">×</button></header>
      <h2>Тишина и движение</h2>
      <p>Настройте звучание и темп церемоний. Изменения действуют сразу.</p>
      <label class="council-settings__option"><span class="council-settings__symbol" aria-hidden="true">♫</span><span class="council-settings__copy"><strong>Звуки двора</strong><small>Шаги, печати, столкновения и коронации</small></span><input type="checkbox" data-setting="sound" ${app.settings.sound?"checked":""} aria-label="Включить звуковые эффекты" /></label>
      <label class="council-settings__option"><span class="council-settings__symbol" aria-hidden="true">◇</span><span class="council-settings__copy"><strong>Меньше анимаций</strong><small>Сокращает показ хода и движение эффектов</small></span><input type="checkbox" data-setting="reducedMotion" ${app.settings.reducedMotion?"checked":""} aria-label="Снизить анимации" /></label>
      <footer><button data-native-press class="primary-btn" data-action="close-modal">Вернуться к партии →</button></footer>
    </section>
  </div>`;
}

function artGalleryHTML() {
  const figures=[["north","Север"],["south","Юг"],["guard","Страж"],["beast","Зверь"],["priest","Жрец"],["thief","Вор"]];
  const seals=[["champion","Претенденты"],["guard","Страж"],["beast","Зверь"],["priest","Жрец"],["thief","Вор"]];
  return `<section class="debug-art-gallery" aria-label="Галерея оригинальных изображений">
    <h2>Герои двора</h2><p>Редактируемая серия Universal Art Forge: каждый персонаж обладает отдельным силуэтом. В игре используются те же рисунки.</p>
    <div class="debug-art-gallery__figures">${figures.map(([kind,title])=>`<div class="debug-art-gallery__figure"><i class="sprite-figure sprite-figure--${kind}" aria-hidden="true"></i><span>${title}</span></div>`).join("")}</div>
    <h2>Печати закона</h2><div class="debug-art-gallery__seals">${seals.map(([kind,title])=>`<div><i class="sprite-seal sprite-seal--${kind}" aria-hidden="true"></i><span>${title}</span></div>`).join("")}</div>
    <h2>Резной трон</h2><div class="debug-art-gallery__throne" role="img" aria-label="Декоративный рельеф королевского трона"></div>
  </section>`;
}


function stopDebugRound(renderNow=false){
  window.clearTimeout(app.debug.roundTimer);
  app.debug.roundTimer=null;app.debug.roundToken++;app.debug.round=null;
  if(renderNow&&app.debug.open)render();
}
function showDebugRoundFrame(index){
  const round=app.debug.round;
  if(!round||!app.debug.open)return;
  round.index=index;
  const frame=round.frames[index];
  if(!frame){stopDebugRound(true);return;}
  const sound=soundForFrame(frame);
  if(sound&&app.settings.sound)playTone(sound);
  render();
  const token=app.debug.roundToken;
  app.debug.roundTimer=window.setTimeout(()=>{
    if(token!==app.debug.roundToken||!app.debug.open||!app.debug.round)return;
    if(index+1<round.frames.length)showDebugRoundFrame(index+1);
    else stopDebugRound(true);
  },frame.duration);
}
function beginDebugRound(){
  stopDebugRound(false);
  const start=createInitialState({mode:"ai",seed:"crown-laws-debug-scene"});
  const resolved=resolveTurn(start,{p1:{cardId:start.players.p1.hand[0]},p2:{cardId:start.players.p2.hand[0]}});
  const frames=planTurnFilm({before:start,after:resolved.state,frames:resolved.frames,logs:resolved.logs,conflicts:resolved.conflicts},
    {compact:app.settings.reducedMotion});
  app.debug.round={frames,index:0};
  app.debug.scene="game";app.debug.tab="animations";app.debug.animation=null;
  showDebugRoundFrame(0);
}

function debugSceneHTML(scene) {
  const saved={screen:app.screen,local:app.local,online:app.online,modal:app.modal,simulationReport:app.simulationReport,effects:app.effects,lastConflictSlots:app.lastConflictSlots,selectedCardId:app.selectedCardId,focusCardId:app.focusCardId,inspectedSlot:app.inspectedSlot,replay:app.replay,replayActive:app.replayActive,forecast:app.forecast,forecastReview:app.forecastReview,film:app.film};
  let markup="";
  try {
    const state=app.debug.round?.frames[app.debug.round.index]?.state || createInitialState({mode:"ai",seed:"crown-laws-debug-scene"});
    app.screen="game";
    app.local={...app.local,mode:"ai",state,waitingAi:false,passScreen:false,hotseatChooser:"p1"};
    app.online={...app.online,roomState:null,roomCode:"",ready:{p1:false,p2:false},you:"p1"};
    app.modal=null;
    app.effects=app.debug.round?effectsForFrame(app.debug.round.frames[app.debug.round.index]):[];app.lastConflictSlots=app.debug.round?.frames[app.debug.round.index]?.conflicts||[];
    app.selectedCardId=app.debug.selectedCardId;app.focusCardId=app.debug.focusCardId;app.inspectedSlot=app.debug.inspectedSlot;
    app.replay=null;app.replayActive=false;app.film=null;
    if(scene==="vision"&&!app.debug.forecast){
      const demoCard=app.debug.selectedCardId||state.players.p1.hand[0];
      app.debug.selectedCardId=demoCard;
      app.debug.forecast=createCounselVision(state,"p1",demoCard,forecastTurn);
      app.debug.forecast.step=5;
    }
    app.selectedCardId=app.debug.selectedCardId;
    app.forecast=app.debug.forecast;app.forecastReview=app.debug.forecastReview;
    if(scene==="art")markup=artGalleryHTML();
    else if(scene==="menu")markup=menuHTML();
    else if(scene==="join"||scene==="waiting"){
      app.screen="online";
      if(scene==="waiting")app.online.roomCode="DEMO1";
      markup=roomHTML();
    }else{
      if(scene==="ready"){app.screen="online";app.online.roomState=state;app.online.ready.p1=true;}
      if(scene==="hotseat"){app.local.mode="hotseat";app.local.passScreen=true;app.local.hotseatChooser="p2";}
      if(scene==="victory"){state.winner="p1";state.players.p1.activeCrowns=3;}
      if(scene==="rules"||scene==="settings"||scene==="simulation"){
        app.modal=scene;
        if(scene==="simulation")app.simulationReport={turnsPlayed:20,turnsRequested:20,crowns:{p1:2,p2:1},conflicts:3,throneStands:{p1:3,p2:2},crownBlocked:2,averageDistance:{p1:1.8,p2:2.1}};
      }
      const anim=app.debug.animation;
      if(anim==="crown"||anim==="shield")app.effects=[{kind:anim,x:2,y:3}];
      if(anim==="beast-dash"||anim==="seal-trail")app.effects=[{kind:anim,from:{x:2,y:4},to:{x:3,y:2}}];
      if(anim==="conflict")app.lastConflictSlots=["guard"];
      markup=app.debug.round ? `<div class="demo-ribbon"><span>Живая демонстрация · ${app.debug.round.frames[app.debug.round.index].label}</span><span>${app.debug.round.index+1}/${app.debug.round.frames.length}</span></div>`+gameHTML(state,"Демонстрационная партия") : gameHTML(state,scene==="ready"?"Ожидание соперника":"Демонстрационная партия");
      if(app.modal)markup+=modalHTML();
    }
  }finally{Object.assign(app,saved);}
  return `<div class="debug-scene ${app.debug.animation?`debug-scene--anim-${app.debug.animation}`:""}"><div class="debug-scene__content">${markup}</div><span class="debug-scene__label">ПРЕДПРОСМОТР · ${scene}</span></div>`;
}

function debugWorkshopHTML() {
  const scenes=[["menu","Главное меню"],["game","Игровая партия"],["join","Создание / вход"],["waiting","Ожидание гостя"],["ready","Выбор запечатан"],["hotseat","Передача устройства"],["victory","Экран победы"],["rules","Правила"],["settings","Настройки"],["simulation","Отчёт симуляции"],["art","Арт-галерея"],["vision","Видение советника"]];
  const animations=[["move","Перемещение фишки"],["crown","Получение короны"],["shield","Защитный щит"],["beast-dash","Рывок зверя"],["seal-trail","Похищение печати"],["conflict","Конфликт законов"],["card","Выбор карты"]];
  const sounds=[["tap","Выбор карты"],["ready","Утверждение"],["move","Шаг"],["champion","Претендент"],["priest","Жрец"],["guard","Страж"],["beast","Зверь"],["thief","Вор"],["shield","Щит"],["seal","Печать"],["conflict","Конфликт"],["crown","Корона"]];
  return `<aside class="debug-workshop" role="dialog" aria-label="Мастерская разработчика">
    <header class="debug-workshop__top"><div><small>Тильда · Backquote</small><h2>Мастерская</h2></div><button type="button" data-debug-close class="ghost-btn" aria-label="Закрыть">×</button></header>
    <nav class="debug-workshop__tabs" aria-label="Разделы отладки">${[["screens","Экраны"],["animations","Анимации"],["sounds","Звуки"],["balance","Баланс"]].map(([id,label])=>`<button type="button" class="${app.debug.tab===id?"is-active":""}" data-debug-tab="${id}">${label}</button>`).join("")}</nav>
    ${app.debug.tab==="screens"?`<p>Настоящие игровые шаблоны с демонстрационными данными. Партия не изменяется.</p><div class="debug-workshop__items">${scenes.map(([id,label])=>`<button type="button" class="${app.debug.scene===id?"is-active":""}" data-debug-scene="${id}">${label}</button>`).join("")}</div>`:""}
    ${app.debug.tab==="animations"?`<p>Запусти полноценный раунд из реального движка или проверь эффекты по одному. Партия не изменится.</p><div class="debug-workshop__items"><button type="button" data-demo-round>▶ Полный ход</button>${app.debug.round?`<button type="button" data-demo-stop>■ Остановить</button>`:""}${animations.map(([id,label])=>`<button type="button" data-demo-animation="${id}">${label} ↗</button>`).join("")}</div>`:""}
    ${app.debug.tab==="sounds"?`<p>Звуки можно прослушать даже при выключенных игровых эффектах.</p><div class="debug-workshop__items">${sounds.map(([id,label])=>`<button type="button" data-demo-sound="${id}">${label} ▶</button>`).join("")}</div>`:""}
    ${app.debug.tab==="balance"?(app.local.state&&app.screen==="game"?`<p>Изменения применяются к текущей локальной партии.</p>${debugHTML(app.local.state)}`:"<p>Изменение баланса доступно в локальной партии с ИИ или на одном устройстве.</p>"):""}
    <footer class="debug-workshop__foot">Закрыть: <kbd>~</kbd> или <kbd>Esc</kbd></footer>
  </aside>`;
}

function render() {
  const previousHandScroll = app.debug.open ? 0 : (root.querySelector(".hand")?.scrollLeft || 0);
  const state = currentState();
  if (app.screen === "menu") {
    root.innerHTML = `${menuHTML()}${modalHTML()}`;
  } else if (app.screen === "online") {
    root.innerHTML = `${roomHTML()}${modalHTML()}`;
  } else if (app.screen === "game" && state) {
    root.innerHTML = `${gameHTML(state, app.local.mode === "ai" ? AI_PROFILES[app.local.aiProfile].name : "Локальная партия")}${modalHTML()}`;
  }
  if(app.debug.open)root.innerHTML=debugSceneHTML(app.debug.scene)+debugWorkshopHTML();
  if(!app.debug.open){
    const hand=root.querySelector(".hand");
    if(hand)hand.scrollLeft=previousHandScroll;
    animateBoard();
  }
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
  const state = app.film?.active ? app.film.frames[app.film.index].state : (app.forecast ? selectedVisionFrame(app.forecast)?.state : (app.replayActive && app.replayStage === "before" && app.replay ? app.replay.before : currentState()));
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
      ], {duration:app.film?.active?Math.min(420,app.film.frames[app.film.index].duration):360,easing:'cubic-bezier(.2,.75,.2,1)'});
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
  window.inspect_crown_board = () => {
    const board = root.querySelector(".board"), cells = root.querySelectorAll(".board-cell");
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    return {
      width: rect.width, height: rect.height,
      cellCount: cells.length,
      cells: Array.from(cells).map(cell => {
        const r=cell.getBoundingClientRect();
        return {x:r.x,y:r.y,width:r.width,height:r.height};
      }),
      pieces: Array.from(root.querySelectorAll(".piece")).map(piece => {
        const r=piece.getBoundingClientRect();
        return {id:piece.dataset.pieceId,x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height};
      })
    };
  };
}

root.addEventListener("click", (event) => {
  const dev=event.target.closest("[data-debug-close],[data-debug-tab],[data-debug-scene],[data-demo-animation],[data-demo-sound],[data-demo-round],[data-demo-stop]");
  if(dev){
    if(dev.hasAttribute("data-debug-close")){stopDebugRound();app.debug.open=false;}
    if(dev.dataset.debugTab){stopDebugRound();app.debug.tab=dev.dataset.debugTab;if(app.debug.tab==="animations")app.debug.scene="game";}
    if(dev.dataset.debugScene){stopDebugRound();app.debug.scene=dev.dataset.debugScene;app.debug.animation=null;if(app.debug.scene==="vision")app.debug.forecast=null;}
    if(dev.dataset.demoSound){playTone(dev.dataset.demoSound,true);return;}
    if(dev.hasAttribute("data-demo-round")){beginDebugRound();return;}
    if(dev.hasAttribute("data-demo-stop")){stopDebugRound(true);return;}
    if(dev.dataset.demoAnimation){
      const name=dev.dataset.demoAnimation;
      stopDebugRound();
      app.debug.scene="game";app.debug.animation=name;
      window.setTimeout(()=>{if(app.debug.animation===name){app.debug.animation=null;if(app.debug.open)render();}},1300);
    }
    render();return;
  }
  if(event.target.closest('[data-action="skip-film"]')){stopFilm();return;}
  if(app.film?.active&&!app.debug.open)return;
  if (app.debug.open && event.target.closest(".debug-scene")) {
    const pressed=event.target.closest("[data-action]");
    const card=event.target.closest("[data-card-id]");
    const law=event.target.closest("[data-focus-card]");
    const piece=event.target.closest("[data-piece-kind]");
    if(card&&!card.disabled){
      app.debug.selectedCardId=app.debug.selectedCardId===card.dataset.cardId?null:card.dataset.cardId;
      app.debug.inspectedSlot=cardById(card.dataset.cardId).slot;
      app.debug.focusCardId=card.dataset.cardId;
      if(app.debug.forecast||app.debug.scene==="vision"){
        const demo=createInitialState({mode:"ai",seed:"crown-laws-debug-scene"});
        app.debug.forecast=createCounselVision(demo,"p1",app.debug.selectedCardId,forecastTurn);
        app.debug.scene="vision";
      }
    }else if(law){
      app.debug.selectedCardId=null;
      app.debug.focusCardId=law.dataset.focusCard;
      app.debug.inspectedSlot=law.dataset.slot||null;
    }else if(piece){
      app.debug.selectedCardId=null;
      app.debug.inspectedSlot=piece.dataset.pieceKind;
      const demo=createInitialState({mode:"ai",seed:"crown-laws-debug-scene"});
      app.debug.focusCardId=activeLaws(demo)[app.debug.inspectedSlot]?.id||null;
    }else if(pressed){
      const a=pressed.dataset.action;
      if(a==="toggle-rules")app.debug.scene="rules";
      else if(a==="toggle-settings")app.debug.scene="settings";
      else if(a==="rules-chapter"&&RULE_CHAPTERS.some(c=>c.id===pressed.dataset.chapter))app.rulesChapter=pressed.dataset.chapter;
      else if(a==="victory-chronicle")app.victoryRecap=!app.victoryRecap;
      else if(a==="start-ai"||a==="start-hotseat")app.debug.scene=a==="start-hotseat"?"hotseat":"game";
      else if(a==="open-online")app.debug.scene="join";
      else if(a==="create-room")app.debug.scene="waiting";
      else if(a==="rematch")app.debug.scene="game";
      else if(a==="back-menu")app.debug.scene="menu";
      else if(a==="close-modal")app.debug.scene="game";
      else if(a==="clear-inspection"){app.debug.focusCardId=null;app.debug.selectedCardId=null;app.debug.inspectedSlot=null;}
      else if(a==="confirm-choice")app.debug.scene="ready";
      else if(a==="forecast-open"){
        const demo=createInitialState({mode:"ai",seed:"crown-laws-debug-scene"});
        const cardId=app.debug.selectedCardId;
        app.debug.forecast=createCounselVision(demo,"p1",cardId,forecastTurn);
        app.debug.forecast.step=8;
        app.debug.scene="vision";
      }else if(a==="vision-mode" && app.debug.forecast){
        const mode=pressed.dataset.mode;
        if(mode==="current"||(mode==="proposed"&&app.debug.forecast.proposed))app.debug.forecast.side=mode;
      }else if(a==="vision-step"&&app.debug.forecast){
        app.debug.forecast.step=Math.min(8,Math.max(0,Number(pressed.dataset.step)||0));
      }else if(a==="vision-previous"&&app.debug.forecast)app.debug.forecast.step=Math.max(0,app.debug.forecast.step-1);
      else if(a==="vision-next"&&app.debug.forecast)app.debug.forecast.step=Math.min(8,app.debug.forecast.step+1);
      else if(a==="forecast-toggle"&&app.debug.forecast)app.debug.forecast.step=app.debug.forecast.step===0?8:0;
      else if(a==="forecast-close"){app.debug.forecast=null;app.debug.scene="game";}
    }
    render();return;
  }
  // Modal card stops backdrop dismissal, but interactive descendants still work.
  const stop = event.target.closest("[data-stop-click]");
  const actionNode = event.target.closest("[data-action]");
  if (stop && (!actionNode || !stop.contains(actionNode))) return;
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
        app.online.error="";app.online.copyStatus="";
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
        if(app.online.roomCode&&navigator.clipboard?.writeText){
          Promise.resolve(navigator.clipboard.writeText(app.online.roomCode)).then(()=>{
            app.online.copyStatus="copied";playTone("ready");render();
          }).catch(()=>{app.online.copyStatus="failed";render();});
        }else{app.online.copyStatus="failed";render();}
        break;
      case "confirm-choice":
        if(!app.replayActive)confirmSelection();
        break;
      case "toggle-rules":
        app.rulesChapter="goal";openModal("rules");
        break;
      case "toggle-settings":
        openModal("settings");
        break;
      case "forecast-open":
        openForecast();break;
      case "forecast-toggle":
        visionStepTo(app.forecast?.step===0?VISION_PHASES.length-1:0);break;
      case "forecast-close":
        closeVision();break;
      case "vision-mode":
        visionChooseSide(actionNode.dataset.mode);break;
      case "vision-previous":
        visionStepTo((app.forecast?.step||0)-1);break;
      case "vision-next":
        visionStepTo((app.forecast?.step||0)+1);break;
      case "vision-step":
        visionStepTo(actionNode.dataset.step);break;
      case "clear-inspection":
        app.focusCardId=null; app.selectedCardId=null; app.inspectedSlot=null; render();
        break;
      case "toggle-history":
        app.historyExpanded=!app.historyExpanded; render();
        break;
      case "replay-turn":
        if(app.replay&&!app.film?.active){
          beginFilm({before:app.replay.before,after:app.replay.after,
            frames:app.replay.frames||null,logs:app.replay.logs||[],conflicts:app.replay.conflicts||[]});
        }
        break;
      case "rules-chapter":
        if(RULE_CHAPTERS.some(c=>c.id===actionNode.dataset.chapter)){app.rulesChapter=actionNode.dataset.chapter;render();}
        break;
      case "victory-chronicle":
        app.victoryRecap=!app.victoryRecap;render();break;
      case "close-modal":
        closeModal();
        break;
      case "back-menu":
        stopFilm({renderNow:false});app.victoryRecap=false;app.online.copyStatus="";app.online.error="";
        window.clearTimeout(app.replayTimer);app.replayActive=false;app.forecast=null;
        app.screen = "menu";
        app.local.state = null;
        render();
        break;
      case "continue-hotseat":
        app.local.passScreen = false;
        render();
        break;
      case "rematch":
        stopFilm({renderNow:false});app.victoryRecap=false;
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
    if(app.inspectedSlot)app.selectedCardId=null;
  }

  const piece=event.target.closest("[data-piece-kind]");
  if(piece){
    app.inspectedSlot=piece.dataset.pieceKind;
    app.focusCardId=activeLaws(currentState())[app.inspectedSlot]?.id||null;
    app.selectedCardId=null;
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
    app.forecast=null;
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
  if(app.debug.open&&event.target.closest(".debug-scene"))return;
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
  if((event.code==="Backquote"||event.key==="~"||event.key==="`")&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"")){
    event.preventDefault();app.debug.open=!app.debug.open;if(!app.debug.open)stopDebugRound();app.debug.animation=null;render();return;
  }
  if(event.key==="Escape"&&app.debug.open){stopDebugRound();app.debug.open=false;render();return;}
  if(event.key==="Escape"&&app.film?.active){stopFilm();return;}
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
