(function uiFactory() {
  const Rules = window.ThroneRules;
  const AI = window.ThroneAI;

  const app = {
    screen: "menu",
    mode: null,
    state: null,
    role: "p1",
    aiPersona: "general",
    hiddenPersona: "general",
    aiEnabled: true,
    pending: { p1: false, p2: false },
    connected: { p1: false, p2: false },
    network: null,
    roomCode: null,
    debugEnabled:
      new URLSearchParams(location.search).get("debug") === "1" ||
      localStorage.getItem("pocket-works:throne-three:debug") === "1",
    motion: localStorage.getItem("pocket-works:throne-three:motion") !== "0",
    testClock: 0
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const els = {
    actionPanel: $(".action-panel"),
    actionGrid: $("#action-grid"),
    specialRow: $("#special-row"),
    statementPanel: $("#statement-panel"),
    statementGrid: $("#statement-grid"),
    factions: $("#factions"),
    p1Score: $("#p1-score"),
    p2Score: $("#p2-score"),
    turnPill: $("#turn-pill"),
    courtMood: $("#court-mood"),
    lastReveal: $("#last-reveal"),
    historyRow: $("#history-row"),
    marksRow: $("#marks-row"),
    logPanel: $("#log-panel"),
    pendingLine: $("#pending-line"),
    onlineStatus: $("#online-status"),
    onlineName: $("#online-name"),
    roomInput: $("#room-code-input"),
    roomCard: $("#room-card"),
    roomCode: $("#room-code"),
    shareLink: $("#share-link"),
    debugPanel: $("#debug-panel"),
    debugOpen: $("#debug-open-btn"),
    debugState: $("#debug-state"),
    debugFactions: $("#debug-factions"),
    debugAi: $("#debug-ai-btn"),
    debugToggle: $("#debug-toggle"),
    motionToggle: $("#motion-toggle"),
    victoryTitle: $("#victory-title"),
    victoryMethod: $("#victory-method"),
    victoryStory: $("#victory-story")
  };

  const FACTION_UI = {
    army: { label: "Армия", tone: "army" },
    treasury: { label: "Казна", tone: "treasury" },
    people: { label: "Народ", tone: "people" }
  };

  const ACTION_LABELS = {
    pressure: "Давить",
    bribe: "Подкупить",
    calm: "Успокоить",
    accuse: "Обвинить",
    wait: "Ждать",
    coup: "Переворот",
    coronation: "Коронация"
  };

  const ACTION_UI = {
    pressure: { tag: "Армия", effect: "+1 к Армии", key: "ARM" },
    bribe: { tag: "Казна", effect: "+1 к Казне", key: "KAZ" },
    calm: { tag: "Народ", effect: "+1 к Народу", key: "NAR" },
    accuse: { tag: "Риск", effect: "Поймать чужой ход", key: "ACC" },
    wait: { tag: "Контра", effect: "Снять метку и усилить следующий ход", key: "..." }
  };

  const STATEMENT_LABELS = {
    order: { label: "Я за порядок", short: "Порядок" },
    wealth: { label: "Я за богатство", short: "Богатство" },
    people: { label: "Я за народ", short: "Народ" },
    anticorruption: { label: "Я против коррупции", short: "Антикоррупция" },
    neutral: { label: "Я сохраняю нейтралитет", short: "Нейтралитет" }
  };

  const STATEMENT_UI = {
    order: "Эффект: Давить получает +1 силы. Повторное давление сильнее злит Народ.",
    wealth: "Эффект: Подкуп получает +1 силы. Коррупция накапливается быстрее.",
    people: "Эффект: Успокоить получает +1 силы. Подкуп сильнее бьет по репутации.",
    anticorruption: "Эффект: Обвинить сильнее против Подкупа. Свой Подкуп накажет тебя.",
    neutral: "Эффект: Ждать лучше чистит метки, но не усиливает прямую линию."
  };

  const MARK_UI = {
    corruption: "Корр.",
    tension: "Напр.",
    weakness: "Слаб.",
    paranoia: "Паран."
  };

  function init() {
    document.body.classList.toggle("motion", app.motion);
    els.debugToggle.checked = app.debugEnabled;
    els.motionToggle.checked = app.motion;

    bindNavigation();
    bindOnline();
    bindSettings();
    bindDebug();
    const saved=readSolo();
    $("#continue-btn").hidden=!saved;
    $("#continue-btn").onclick=()=>{const s=readSolo();if(!s)return;Object.assign(app,{mode:'solo',role:'p1',state:s.state,hiddenPersona:s.persona,aiPersona:s.persona,pending:{p1:false,p2:false},connected:{p1:true,p2:true}});showScreen('game');};
    renderActionGrid();
    renderStatementGrid();

    const roomFromUrl = new URLSearchParams(location.search).get("room");
    if (roomFromUrl) {
      els.roomInput.value = roomFromUrl.toUpperCase();
      showScreen("online");
    }

    window.render_game_to_text = renderGameToText;
    window.advanceTime = advanceTime;
    window.__throneApp = app;
    try{const s=JSON.parse(sessionStorage.getItem('pocket-works:throne-three:pocket-net:'+location.origin+'/pocketnet')||'null');if(s?.roomId)getNetwork().connect().catch(()=>{});}catch{}
  }

  function readSolo(){
    try{const saved=JSON.parse(localStorage.getItem('pocket-works:throne-three:solo')||'null');const s=saved?.state;
      if(s?.version!==1||!Number.isInteger(s.turn)||s.turn<1||!s.players?.p1||!s.players?.p2||!s.factions)return null;
      if(!['army','treasury','people'].every(k=>Number.isInteger(s.factions[k])&&Math.abs(s.factions[k])<=3))return null;
      for(const p of Object.values(s.players))if(!Array.isArray(p.history)||!p.marks||!Number.isFinite(p.crowns))return null;
      if(typeof saved.persona!=='string')return null;return saved;
    }catch{return null;}
  }

  function bindNavigation() {
    $$("[data-screen-target]").forEach((button) => {
      button.addEventListener("click", () => showScreen(button.dataset.screenTarget));
    });
    $("#start-btn").addEventListener("click", () => startSolo());
    $("#rematch-btn").addEventListener("click", rematch);
  }

  function bindOnline() {
    $("#create-room-btn").addEventListener("click", () => {
      getNetwork().createRoom(els.onlineName.value.trim() || "Претендент 1").catch(() => {});
    });

    $("#join-room-btn").addEventListener("click", () => {
      const code = els.roomInput.value.trim().toUpperCase();
      if (!code) {
        toast("Нужен код комнаты.");
        return;
      }
      getNetwork().joinRoom(code, els.onlineName.value.trim() || "Претендент 2").catch(() => {});
    });

    $("#copy-link-btn").addEventListener("click", () => {
      els.shareLink.select();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(els.shareLink.value).then(() => toast("Ссылка скопирована."));
      } else {
        document.execCommand("copy");
        toast("Ссылка скопирована.");
      }
    });
  }

  function bindSettings() {
    els.debugToggle.addEventListener("change", () => {
      app.debugEnabled = els.debugToggle.checked;
      localStorage.setItem("pocket-works:throne-three:debug", app.debugEnabled ? "1" : "0");
      renderDebug();
      toast(app.debugEnabled ? "Debug включен." : "Debug выключен.");
    });

    els.motionToggle.addEventListener("change", () => {
      app.motion = els.motionToggle.checked;
      localStorage.setItem("pocket-works:throne-three:motion", app.motion ? "1" : "0");
      document.body.classList.toggle("motion", app.motion);
    });
  }

  function bindDebug() {
    els.debugOpen.addEventListener("click", () => {
      if (!app.debugEnabled) {
        toast("Debug включается в настройках.");
        return;
      }
      els.debugPanel.hidden = false;
      renderDebug();
    });

    $("#debug-close-btn").addEventListener("click", () => {
      els.debugPanel.hidden = true;
    });
    $("#debug-reset-btn").addEventListener("click", debugReset);
    $("#debug-sim-btn").addEventListener("click", debugSimulate);
    $("#debug-clear-btn").addEventListener("click", debugClearRoom);
    els.debugAi.addEventListener("click", () => {
      app.aiEnabled = !app.aiEnabled;
      renderDebug();
      toast(app.aiEnabled ? "ИИ включен." : "ИИ выключен.");
    });
  }

  function getNetwork() {
    if (app.network) return app.network;
    app.network = new window.ThroneNetwork({
      room_created: (message) => showRoomInfo(message.code),
      room_joined: (message) => showRoomInfo(message.code),
      state: handleOnlineState,
      room_cleared: () => {
        app.state = null;
        app.roomCode = null;
        showScreen("online");
        toast("Комната очищена.");
      },
      status: (message) => {
        const text = typeof message === "string" ? message : message.message;
        els.onlineStatus.textContent = text || "";
      },
      error: (message) => {
        const text = typeof message === "string" ? message : message.message;
        toast(text || "Ошибка сети.");
        els.onlineStatus.textContent = text || "Ошибка сети.";
      }
    });
    return app.network;
  }

  function handleOnlineState(message) {
    app.mode = "online";
    app.state = message.state;
    app.role = message.role;
    app.roomCode = message.code;
    app.pending = message.pending || { p1: false, p2: false };
    app.connected = message.connected || { p1: true, p2: false };
    showRoomInfo(message.code);
    showScreen("game");
    renderGame();
    if (app.state.winner) {
      setTimeout(showVictory, 420);
    }
  }

  function showRoomInfo(code) {
    app.roomCode = code;
    els.roomCard.hidden = false;
    els.roomCode.textContent = code;
    els.shareLink.value = `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`;
  }

  function showScreen(name) {
    app.screen = name;
    $$("[data-screen]").forEach((screen) => {
      screen.classList.toggle("active", screen.dataset.screen === name);
    });
    if (name === "game") renderGame();
  }

  function startSolo(personaId) {
    const persona = chooseHiddenPersona(personaId);
    app.mode = "solo";
    app.role = "p1";
    app.aiPersona = persona.id;
    app.hiddenPersona = persona.id;
    app.pending = { p1: false, p2: false };
    app.connected = { p1: true, p2: true };
    app.state = Rules.createInitialState({
      mode: "solo",
      p1Name: "Ты",
      p2Name: "Соперник"
    });
    app.state.players.p2.aiPersona = persona.id;
    showScreen("game");
    renderGame();
  }

  function renderActionGrid() {
    els.actionGrid.innerHTML = "";
    Object.keys(Rules.ACTIONS).forEach((key) => {
      const meta = ACTION_UI[key];
      const button = document.createElement("button");
      button.className = `action-btn action-${key}`;
      button.dataset.action = key;
      button.innerHTML = `
        <span class="action-key">${escapeHtml(meta.key)}</span>
        <span class="action-copy">
          <strong>${escapeHtml(ACTION_LABELS[key])}</strong>
          <small>${escapeHtml(meta.tag)} · ${escapeHtml(meta.effect)}</small>
        </span>
      `;
      button.addEventListener("click", () => submitAction(key));
      els.actionGrid.appendChild(button);
    });
  }

  function renderStatementGrid() {
    els.statementGrid.innerHTML = "";
    Object.keys(STATEMENT_LABELS).forEach((key) => {
      const button = document.createElement("button");
      button.className = `statement-btn statement-${key}`;
      button.innerHTML = `
        <strong>${escapeHtml(STATEMENT_LABELS[key].label)}</strong>
        <span>${escapeHtml(STATEMENT_UI[key])}</span>
      `;
      button.addEventListener("click", () => selectStatement(key));
      els.statementGrid.appendChild(button);
    });
  }

  function selectStatement(statement) {
    if (!app.state || app.state.ended) return;
    if (app.mode === "online") {
      getNetwork().submitStatement(statement);
      return;
    }
    Rules.setStatement(app.state, app.role, statement);
    ensureAiStatement();
    renderGame();
  }

  function submitAction(action) {
    if (!app.state || app.state.ended) return;
    if (Rules.needsStatement(app.state, app.role)) {
      toast("Сначала выбери позицию.");
      return;
    }
    if (!Rules.isActionAvailable(app.state, app.role, action)) {
      toast("Этот ход сейчас недоступен.");
      return;
    }

    if (app.mode === "online") {
      getNetwork().submitAction(action);
      return;
    }

    ensureAiStatement();
    const aiAction = app.aiEnabled ? AI.chooseAction(app.state, "p2", app.hiddenPersona) : "wait";
    app.state = Rules.resolveTurn(app.state, { p1: action, p2: aiAction });
    renderGame();
    if (app.state.winner) {
      setTimeout(showVictory, 420);
    }
  }

  function ensureAiStatement() {
    if (!app.state || app.mode !== "solo") return;
    if (Rules.needsStatement(app.state, "p2")) {
      Rules.setStatement(app.state, "p2", AI.chooseStatement(app.state, "p2", app.hiddenPersona));
    }
  }

  function renderGame() {
    if (!app.state) return;

    if(app.mode==='solo'){try{localStorage.setItem('pocket-works:throne-three:solo',JSON.stringify({state:app.state,persona:app.hiddenPersona}));$("#continue-btn").hidden=false;}catch{}}

    const state = app.state;
    els.turnPill.textContent =
      app.mode === "online" && app.roomCode ? `Ход ${state.turn} · ${app.roomCode}` : `Ход ${state.turn}`;

    renderScore(els.p1Score, app.role, "you");
    renderScore(els.p2Score, Rules.opponentOf(app.role), "rival");
    renderFactions();
    renderStatementPanel();
    renderSpecials();
    renderPending();
    renderReveal();
    renderHistory();
    renderMarks();
    renderLog();
    renderDebug();

    els.courtMood.textContent =
      (state.lastCrownAward || []).length > 0 ? "Баланс сброшен после короны." : "Двор ждет следующий ход.";
    els.debugOpen.hidden = !app.debugEnabled;
  }

  function renderScore(container, playerId, side) {
    const player = app.state.players[playerId];
    const noteParts = [];
    if (player.statement) noteParts.push(STATEMENT_LABELS[player.statement].short);
    if (player.nextBoost) noteParts.push(`усиление +${player.nextBoost}`);

    const crowned = (app.state.lastCrownAward || []).includes(playerId);
    const label = side === "you" ? "Ты" : "Соперник";
    const name = player.name === label ? "" : player.name;
    const crowns = [0, 1, 2]
      .map((index) => `<span class="crown-dot ${player.crowns > index ? "filled" : ""}"></span>`)
      .join("");

    container.classList.toggle("is-you", side === "you");
    container.classList.toggle("is-rival", side !== "you");
    container.innerHTML = `
      <div class="player-label">${escapeHtml(label)}</div>
      <div class="player-name ${name ? "" : "is-empty"}">${escapeHtml(name || " ")}</div>
      <div class="crowns">${crowns}</div>
      <div class="player-note ${noteParts.length ? "" : "is-empty"}">${escapeHtml(noteParts.join(" · ") || " ")}</div>
      ${crowned ? '<div class="player-burst">+1 корона</div>' : ""}
    `;
  }

  function renderFactions() {
    els.factions.innerHTML = "";
    const crownReset = (app.state.lastCrownAward || []).length > 0;

    Object.entries(FACTION_UI).forEach(([key, meta]) => {
      const value = perspectiveValue(key);
      const delta = crownReset ? 0 : factionDelta(key);
      const ownerClass = value < 0 ? "you" : value > 0 ? "rival" : "neutral";
      const deltaClass = delta < 0 ? "you" : delta > 0 ? "rival" : "neutral";

      const row = document.createElement("div");
      row.className = `faction-card tone-${key}`;
      row.innerHTML = `
        <div class="faction-head">
          <div class="faction-name">${escapeHtml(meta.label)}</div>
          <div class="faction-state ${ownerClass}">${escapeHtml(factionStatus(value))}</div>
        </div>
        <div class="track-wrap">
          <div class="influence-track" aria-label="${escapeHtml(meta.label)} ${signed(value)}">
            ${[-3, -2, -1, 0, 1, 2, 3].map((pos) => trackCell(pos, value)).join("")}
          </div>
        </div>
        <div class="faction-delta ${deltaClass}">${escapeHtml(crownReset ? "сброс" : deltaLabel(delta))}</div>
      `;
      els.factions.appendChild(row);
    });
  }

  function trackCell(pos, value) {
    let cls = "track-cell";
    if (pos < 0) cls += " you";
    if (pos > 0) cls += " rival";
    if (pos === 0) cls += " center";
    if (pos === value) cls += ` active ${value < 0 ? "you" : value > 0 ? "rival" : "neutral"}`;
    return `<span class="${cls}"><span class="track-core"></span></span>`;
  }

  function renderStatementPanel() {
    if (!app.state) {
      els.statementPanel.hidden = true;
      return;
    }

    const need = Rules.needsStatement(app.state, app.role);
    els.statementPanel.hidden = !need;
    els.actionPanel.classList.toggle("statement-mode", need);
    els.pendingLine.hidden = need;
    els.actionGrid.hidden = need;
    els.specialRow.hidden = need;

    els.actionGrid.querySelectorAll("button").forEach((button) => {
      button.disabled = need || isWaitingForOnline();
    });
    els.statementGrid.querySelectorAll("button").forEach((button) => {
      button.disabled = isWaitingForOnlineStatement();
    });
  }

  function renderSpecials() {
    els.specialRow.innerHTML = "";
    if (!app.state) return;

    const specials = Rules.getAvailableSpecials(app.state, app.role);
    specials.forEach((key) => {
      const button = document.createElement("button");
      button.className = "action-btn special-btn";
      button.innerHTML = `
        <span class="action-key">WIN</span>
        <span class="action-copy">
          <strong>${escapeHtml(ACTION_LABELS[key])}</strong>
          <small>${escapeHtml(key === "coup" ? "Победа через Армию" : "Победа через Народ")}</small>
        </span>
      `;
      button.disabled = Rules.needsStatement(app.state, app.role) || isWaitingForOnline();
      button.addEventListener("click", () => submitAction(key));
      els.specialRow.appendChild(button);
    });
  }

  function renderPending() {
    if (!app.state) {
      els.pendingLine.textContent = "";
      return;
    }

    if (app.mode !== "online") {
      els.pendingLine.textContent = Rules.needsStatement(app.state, app.role) ? "Выбери позицию" : "Выбери приказ";
      return;
    }

    const rival = Rules.opponentOf(app.role);
    if (!app.connected.p2) {
      els.pendingLine.textContent = `Код ${app.roomCode}. Ждем соперника.`;
      return;
    }

    const mine = app.pending[app.role] ? "твой ход скрыт" : "выбери приказ";
    const theirs = app.pending[rival] ? "соперник готов" : "соперник думает";
    els.pendingLine.textContent = `${mine} · ${theirs}`;
  }

  function renderReveal() {
    const reveal = app.state.lastReveal;
    if (!reveal) {
      els.lastReveal.textContent = "Ходы скрыты";
      return;
    }

    const myAction = reveal[app.role];
    const rivalAction = reveal[Rules.opponentOf(app.role)];
    els.lastReveal.innerHTML = `
      <span class="reveal-you">Ты: ${escapeHtml(ACTION_LABELS[myAction] || myAction)}</span>
      <span class="reveal-rival">Соперник: ${escapeHtml(ACTION_LABELS[rivalAction] || rivalAction)}</span>
    `;
  }

  function renderHistory() {
    const order = [app.role, Rules.opponentOf(app.role)];
    els.historyRow.innerHTML = order
      .map((playerId) => {
        const history = app.state.players[playerId].history || [];
        const chips = history.length
          ? history.map((action) => `<span class="chip">${escapeHtml(ACTION_LABELS[action] || action)}</span>`).join("")
          : `<span class="chip muted">—</span>`;
        return `<div class="history-line"><strong>${playerId === app.role ? "Ты" : "Соперник"}</strong>${chips}</div>`;
      })
      .join("");
  }

  function renderMarks() {
    const order = [app.role, Rules.opponentOf(app.role)];
    els.marksRow.innerHTML = order
      .map((playerId) => {
        const marks = app.state.players[playerId].marks;
        const chips =
          Object.keys(marks)
            .filter((key) => marks[key] > 0)
            .map((key) => `<span class="chip bad">${escapeHtml(MARK_UI[key] || key)} ${marks[key]}</span>`)
            .join("") || `<span class="chip muted">чисто</span>`;
        return `<div class="marks-line"><strong>${playerId === app.role ? "Ты" : "Соперник"}</strong>${chips}</div>`;
      })
      .join("");
  }

  function renderLog() {
    els.logPanel.innerHTML = "";
  }

  function renderDebug() {
    if (!app.debugEnabled) {
      els.debugPanel.hidden = true;
      return;
    }

    els.debugAi.textContent = app.aiEnabled ? "ИИ: вкл" : "ИИ: выкл";
    if (!app.state) return;

    els.debugFactions.innerHTML = Object.keys(FACTION_UI)
      .map((key) => {
        const value = app.state.factions[key];
        return `
          <div class="debug-faction-row">
            <span>${escapeHtml(FACTION_UI[key].label)}: ${signed(value)}</span>
            <button class="menu-btn compact" data-debug-faction="${key}" data-debug-delta="-1">-</button>
            <button class="menu-btn compact" data-debug-faction="${key}" data-debug-zero="1">0</button>
            <button class="menu-btn compact" data-debug-faction="${key}" data-debug-delta="1">+</button>
          </div>
        `;
      })
      .join("");

    els.debugFactions.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const faction = button.dataset.debugFaction;
        const current = app.state.factions[faction];
        const next = button.dataset.debugZero ? 0 : Rules.clamp(current + Number(button.dataset.debugDelta), -3, 3);
        debugSetFaction(faction, next);
      });
    });

    els.debugState.textContent = renderGameToText();
  }

  function debugSetFaction(faction, value) {
    if (app.mode === "online") {
      getNetwork().debugSetFaction(faction, value);
      return;
    }
    app.state.factions[faction] = value;
    app.state.feed.unshift(`Debug: ${FACTION_UI[faction].label} = ${signed(value)}.`);
    renderGame();
  }

  function debugReset() {
    if (app.mode === "online") {
      getNetwork().resetRoom();
      return;
    }
    startSolo(app.hiddenPersona);
  }

  function debugSimulate() {
    if (!app.state || app.state.ended) return;
    if (app.mode === "online") {
      getNetwork().debugSimulate();
      return;
    }

    if (Rules.needsStatement(app.state, "p1")) Rules.setStatement(app.state, "p1", "neutral");
    ensureAiStatement();
    const p2 = app.aiEnabled ? AI.chooseAction(app.state, "p2", app.hiddenPersona) : "wait";
    app.state = Rules.resolveTurn(app.state, { p1: "wait", p2 });
    renderGame();
    if (app.state.winner) setTimeout(showVictory, 420);
  }

  function debugClearRoom() {
    if (app.mode === "online") {
      getNetwork().clearRoom();
    } else {
      app.state = null;
      showScreen("menu");
    }
  }

  function showVictory() {
    if (!app.state || !app.state.winner) return;
    const winner = app.state.winner;
    els.victoryTitle.textContent = `${displayName(winner.player)} забирает трон`;
    els.victoryMethod.textContent = `Способ победы: ${winner.label}. Ход ${winner.turn}.`;
    els.victoryStory.innerHTML = (app.state.story || [])
      .slice(-6)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("");
    showScreen("victory");
  }

  function rematch() {
    if (app.mode === "online" && app.network && app.roomCode) {
      app.network.resetRoom();
      showScreen("game");
      return;
    }
    startSolo(app.hiddenPersona || "general");
  }

  function isWaitingForOnline() {
    if (app.mode !== "online") return false;
    if (!app.connected.p2) return true;
    return Boolean(app.pending[app.role]);
  }

  function isWaitingForOnlineStatement() {
    if (app.mode !== "online") return false;
    return false;
  }

  function displayName(playerId) {
    if (!app.state) return playerId;
    return app.state.players[playerId].name;
  }

  function signed(value) {
    return value > 0 ? `+${value}` : String(value);
  }

  function perspectiveValue(faction) {
    return -Rules.signedValue(app.state, app.role, faction);
  }

  function factionDelta(faction) {
    const events = app.state.lastEvents || [];
    return events
      .filter((event) => event.type === "faction" && event.faction === faction)
      .reduce((sum, event) => sum - (event.after - event.before) * Rules.directionOf(app.role), 0);
  }

  function factionStatus(value) {
    if (value <= -3) return "полный контроль";
    if (value <= -2) return "твоя опора";
    if (value === -1) return "к тебе";
    if (value >= 3) return "полный контроль врага";
    if (value >= 2) return "опора врага";
    if (value === 1) return "к сопернику";
    return "центр";
  }

  function deltaLabel(delta) {
    if (delta < 0) return `к тебе ${Math.abs(delta)}`;
    if (delta > 0) return `к сопернику ${delta}`;
    return "без сдвига";
  }

  function chooseHiddenPersona(personaId) {
    if (personaId && AI.PERSONAS[personaId]) return AI.PERSONAS[personaId];
    const ids = Object.keys(AI.PERSONAS);
    const pick = ids[Math.floor(Math.random() * ids.length)];
    return AI.PERSONAS[pick];
  }

  function toast(text) {
    const old = $(".toast");
    if (old) old.remove();
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = text;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2200);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderGameToText() {
    const state = app.state;
    const payload = {
      screen: app.screen,
      mode: app.mode,
      role: app.role,
      roomCode: app.roomCode,
      coordinateSystem: "DOM portrait UI, top-left origin, faction tracks run from your side on the left to opponent on the right.",
      waiting: app.pending,
      connected: app.connected,
      needsStatement: state ? Rules.needsStatement(state, app.role) : false,
      availableActions: state
        ? Object.keys(Rules.ACTIONS).concat(Rules.getAvailableSpecials(state, app.role))
        : [],
      state: state
        ? {
            turn: state.turn,
            factions: state.factions,
            crowns: {
              p1: state.players.p1.crowns,
              p2: state.players.p2.crowns
            },
            marks: {
              p1: state.players.p1.marks,
              p2: state.players.p2.marks
            },
            history: {
              p1: state.players.p1.history,
              p2: state.players.p2.history
            },
            lastReveal: state.lastReveal,
            courtMood: state.courtMood,
            winner: state.winner,
            feed: (state.feed || []).slice(0, 5)
          }
        : null
    };
    return JSON.stringify(payload, null, 2);
  }

  function advanceTime(ms) {
    app.testClock += ms;
    document.documentElement.style.setProperty("--test-clock", String(app.testClock));
    renderGame();
    return renderGameToText();
  }

  init();
})();
