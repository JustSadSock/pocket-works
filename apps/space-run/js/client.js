const socket = globalThis.spaceSocket;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const toastEl = document.getElementById("toast");
const mainStage = document.querySelector(".main-stage");

const lobby = document.getElementById("lobby");
const lobbyMsg = document.getElementById("lobby-msg");
const joinBtn = document.getElementById("join-btn");
const roomInput = document.getElementById("room-input");
const nameInput = document.getElementById("name-input");

const hud = {
  room: document.getElementById("hud-room"),
  phase: document.getElementById("hud-phase"),
  wave: document.getElementById("hud-wave"),
  credits: document.getElementById("hud-credits"),
  hull: document.getElementById("hud-hull"),
  energy: document.getElementById("hud-energy"),
};

const playerList = document.getElementById("player-list");
const roleList = document.getElementById("role-list");
const inventoryModules = document.getElementById("inventory-modules");
const inventoryShapes = document.getElementById("inventory-shapes");
const repairTargets = document.getElementById("repair-targets");
const shopList = document.getElementById("shop-list");
const startWaveBtn = document.getElementById("start-wave");
const missionSelect = document.getElementById("mission-select");
const moduleActionsEl = document.getElementById("module-actions");
const moduleMoveBtn = document.getElementById("module-move");
const moduleRemoveBtn = document.getElementById("module-remove");

let me = null;
let joined = false;
let state = null;
let camera = { x: 0, y: 0, z: 1 };
let mouse = { x: 0, y: 0, worldX: 0, worldY: 0, downLeft: false, downRight: false };
let keyState = new Set();
let buildMode = null;
let moveModuleId = null;
let moduleAction = null;
let buildRotation = 0;
let lastUiStamp = 0;
let lastEmitInput = 0;
let lastFrame = performance.now();
let renderPhysics = { x: 0, y: 0, a: 0, ready: false };
let shake = { power: 0 };
let particles = [];
const spriteCache = new Map();
const DROP_ICON_PATHS = {
  credits: "assets/ui/pickup_credits.png",
  module: "assets/ui/pickup_module.png",
  shape: "assets/ui/pickup_shape.png",
};

const random = (a, b) => a + Math.random() * (b - a);
const clamp = (v, mn, mx) => Math.min(mx, Math.max(mn, v));
const wrap = (v, s) => ((v % s) + s) % s;

function normalizeAngle(a) {
  let n = a;
  while (n > Math.PI) n -= Math.PI * 2;
  while (n < -Math.PI) n += Math.PI * 2;
  return n;
}

const sounds = {
  ctx: null,
  master: null,
};

function addShake(amount = 0.1) {
  shake.power = clamp((shake.power || 0) + amount, 0, 1.6);
}

function showToast(msg, ms = 1600) {
  toastEl.textContent = msg;
  toastEl.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("visible"), ms);
}

function ensureAudio() {
  if (sounds.ctx) return;
  try{sounds.ctx = new (window.AudioContext || window.webkitAudioContext)();}catch{return;}
  sounds.master = sounds.ctx.createGain();
  sounds.master.gain.value = 0.08;
  sounds.master.connect(sounds.ctx.destination);
}

function beep(freq, dur = 0.09, type = "sine", gain = 0.2) {
  if (!sounds.ctx) return;
  const o = sounds.ctx.createOscillator();
  const g = sounds.ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g).connect(sounds.master);
  const t = sounds.ctx.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t);
  o.stop(t + dur);
}

function handleEventAudio(ev) {
  if (!ev) return;
  if (ev.type === "shot") {
    beep(ev.crit ? 860 : 640, 0.07, "triangle", ev.crit ? 0.35 : 0.2);
    addShake(ev.crit ? 0.05 : 0.025);
  }
  if (ev.type === "enemy-destroyed") {
    beep(180, 0.18, "sawtooth", 0.26);
    addShake(ev.elite ? 0.24 : 0.08);
  }
  if (ev.type === "hull-hit" || ev.type === "module-hit") {
    beep(110, 0.12, "square", 0.24);
    addShake(ev.type === "hull-hit" ? 0.24 : 0.18);
  }
  if (ev.type === "shield-hit") {
    beep(420, 0.05, "triangle", 0.18);
    addShake(0.05);
  }
  if (ev.type === "ram") addShake(0.2);
  if (ev.type === "repair-step") beep(520, 0.06, "sine", 0.2);
  if (ev.type === "repaired") beep(740, 0.16, "sine", 0.24);
  if (ev.type === "phase") beep(300, 0.12, "triangle", 0.2);
  if (ev.type === "boss-spawn") {
    beep(96, 0.3, "sawtooth", 0.33);
    addShake(0.3);
  }
}

function sprite(path) {
  if (!path) return null;
  if (!spriteCache.has(path)) {
    const img = new Image();
    img.src = `./${path.replace(/^\//, "")}`;
    spriteCache.set(path, img);
  }
  const img = spriteCache.get(path);
  return img.complete ? img : null;
}

function sendJoin() {
  const roomCode = roomInput.value.trim().toUpperCase();
  const name = nameInput.value.trim() || "Pilot";
  socket.emit("joinRoom", { roomCode, name });
}

joinBtn.addEventListener("click", () => {
  ensureAudio();
  sendJoin();
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendJoin();
});
roomInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendJoin();
});

socket.on("joined", (payload) => {
  me = payload.playerId;
  joined = true;
  lobby.classList.remove("visible");
  lobbyMsg.textContent = "";
  showToast(`Joined room ${payload.roomCode}`);
});

socket.on("joinError", (payload) => {
  lobbyMsg.textContent = payload.message || "Failed to join";
});

socket.on("actionError", (payload) => {
  showToast(payload.message || "Action failed", 1700);
});

socket.on("state", (next) => {
  const prevPhase = state?.phase;
  state = next;
  if (!renderPhysics.ready || (prevPhase === "combat" && next.phase !== "combat")) {
    renderPhysics = { x: next.physics.x, y: next.physics.y, a: next.physics.a, ready: true };
  }
  if (!joined) return;

  if (Array.isArray(next.events)) {
    next.events.forEach((ev) => {
      handleEventAudio(ev);
      if (ev.type === "enemy-destroyed") {
        const count = ev.elite ? 34 : 16;
        for (let i = 0; i < count; i += 1) {
          particles.push({ x: ev.x, y: ev.y, vx: random(-140, 140), vy: random(-140, 140), life: random(0.4, 0.9), t: 0, color: i % 2 ? "#ff965f" : "#ffd160", r: random(1.2, 2.8) });
        }
      }
      if (ev.type === "enemy-hit") {
        for (let i = 0; i < 6; i += 1) {
          particles.push({ x: ev.x, y: ev.y, vx: random(-70, 70), vy: random(-70, 70), life: random(0.14, 0.34), t: 0, color: "#9fe7ff", r: random(0.9, 1.8) });
        }
      }
      if (ev.type === "hull-hit" || ev.type === "module-hit") {
        for (let i = 0; i < 8; i += 1) {
          particles.push({ x: ev.x, y: ev.y, vx: random(-90, 90), vy: random(-90, 90), life: random(0.2, 0.5), t: 0, color: "#ff8191", r: random(1, 2) });
        }
      }
      if (ev.type === "enemy-dash") {
        for (let i = 0; i < 8; i += 1) {
          particles.push({ x: ev.x, y: ev.y, vx: random(-120, 120), vy: random(-120, 120), life: random(0.18, 0.34), t: 0, color: "#ffbf7e", r: random(1, 2.2) });
        }
      }
      if (ev.type === "phase") showToast(`Phase: ${ev.phase}${ev.wave ? ` | Wave ${ev.wave}` : ""}`);
      if (ev.type === "boss-spawn") showToast(`Boss arrived on wave ${ev.wave}!`, 2200);
      if (ev.type === "loot" && ev.kind === "module") showToast(`Loot module: ${ev.moduleId || ev.value}`);
      if (ev.type === "loot" && ev.kind === "shape") showToast(`Loot shape: ${ev.shapeId || ev.value}`);
    });
  }

  const now = performance.now();
  if (now - lastUiStamp > 120) {
    renderUI();
    lastUiStamp = now;
  }
});

function phaseLabel(phase, t) {
  if (!phase) return "-";
  if (phase === "build") return "GARAGE";
  const s = Math.max(0, Math.ceil(t || 0));
  if (phase === "combat") return `COMBAT (${s}s)`;
  if (phase === "shop") return `SHOP (${s}s)`;
  return `${phase.toUpperCase()} (${s}s)`;
}

function playerMe() {
  return state?.players?.find((p) => p.id === me) || null;
}

function moduleByIdLocal(id) {
  return state?.ship?.modules?.find((m) => m.id === id) || null;
}

function isGarage() {
  return state && state.phase !== "combat";
}

function displayPhysics() {
  if (renderPhysics.ready) return renderPhysics;
  return state?.physics || { x: 0, y: 0, a: 0 };
}

function moduleAtGrid(gx, gy) {
  return state?.ship?.modules?.find((m) => gx >= m.x && gx < m.x + m.w && gy >= m.y && gy < m.y + m.h) || null;
}

function closeModuleActions() {
  moduleAction = null;
  moduleActionsEl.classList.add("hidden");
}

function openModuleActions(moduleId, clientX, clientY) {
  moduleAction = { moduleId };
  const rect = mainStage.getBoundingClientRect();
  moduleActionsEl.style.left = `${clientX - rect.left}px`;
  moduleActionsEl.style.top = `${clientY - rect.top}px`;
  moduleActionsEl.classList.remove("hidden");
}

function button(label, cls, onClick) {
  const b = document.createElement("button");
  b.textContent = label; b.dataset.nativePress="";
  if (cls) b.className = cls;
  b.addEventListener("click", onClick);
  return b;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

let lastPanelSignature=null;
function renderUI() {
  if (!state) return;
  document.body.classList.toggle("combat-ui", state.phase === "combat");
  if (state.phase === "combat") {
    moveModuleId = null;
    closeModuleActions();
  }
  hud.room.textContent = state.roomCode;
  hud.phase.textContent = phaseLabel(state.phase, state.phaseTime);
  hud.wave.textContent = String(state.wave || 0);
  hud.credits.textContent = String(Math.round(state.ship.credits || 0));
  hud.hull.textContent = `${Math.round(state.ship.hull || 0)}/${Math.round(state.ship.hullMax || 0)}`;
  hud.energy.textContent = `${Math.round(state.ship.energy || 0)}/${Math.round(state.ship.energyMax || 0)}`;

  const panelSignature=JSON.stringify({phase:state.phase,players:state.players.map(p=>[p.id,p.name,p.moduleId]),modules:state.ship.modules.map(m=>[m.id,m.occupiedBy,m.status,Math.round(m.hp),m.x,m.y,m.rotation]),inventory:state.ship.inventoryModules,shapes:state.ship.inventoryShapes,offers:state.offers,affordable:state.offers.map(o=>state.ship.credits>=o.cost),missions:state.missionOptions,buildMode});
  if(panelSignature===lastPanelSignature)return;
  lastPanelSignature=panelSignature;
  clearNode(playerList);
  state.players.forEach((p) => {
    const row = document.createElement("div");
    row.className = "list-item";
    const top = document.createElement("div");
    top.className = "row";
    const n = document.createElement("span");
    n.textContent = `${p.name}${p.id === me ? " (You)" : ""}`;
    n.style.color = p.color;
    const role = moduleByIdLocal(p.moduleId);
    const stat = document.createElement("span");
    stat.className = `tag ${role ? "online" : "warn"}`;
    stat.textContent = role ? role.type : "free";
    top.appendChild(n);
    top.appendChild(stat);
    row.appendChild(top);
    playerList.appendChild(row);
  });

  clearNode(roleList);
  const mePlayer = playerMe();
  state.ship.modules.forEach((m) => {
    const row = document.createElement("div");
    row.className = "list-item role-item";

    const head = document.createElement("div");
    head.className = "icon-line";
    const icon = document.createElement("img");
    icon.className = "inv-icon";
    icon.src = `./${(m.sprite || "").replace(/^\//, "")}`;
    icon.alt = m.type;
    head.appendChild(icon);
    head.appendChild(Object.assign(document.createElement("span"), { textContent: `${m.type} (${m.id})` }));
    row.appendChild(head);

    const occupant = m.occupiedBy ? state.players.find((p) => p.id === m.occupiedBy) : null;
    const occText = occupant ? `busy: ${occupant.name}` : "free";
    row.appendChild(Object.assign(document.createElement("div"), { textContent: occText }));

    const actions = document.createElement("div");
    actions.className = "row";
    const seatedHere = mePlayer && mePlayer.moduleId === m.id;
    const seatAction = () => socket.emit("occupyModule", { moduleId: m.id });
    actions.appendChild(button(seatedHere ? "Leave" : "Seat", seatedHere ? "danger" : "primary", () => {
      if (seatedHere) socket.emit("leaveModule");
      else seatAction();
    }));
    row.appendChild(actions);
    row.addEventListener("click", (ev) => {
      if (ev.target instanceof HTMLElement && ev.target.closest("button")) return;
      seatAction();
    });

    roleList.appendChild(row);
  });

  clearNode(inventoryModules);
  state.ship.inventoryModules.forEach((templateId, idx) => {
    const lib = state.moduleLibrary[templateId];
    const row = document.createElement("div");
    row.className = "list-item";
    const top = document.createElement("div");
    top.className = "icon-line";
    const icon = document.createElement("img");
    icon.className = "inv-icon";
    icon.src = `./${(lib?.sprite || "").replace(/^\//, "")}`;
    icon.alt = templateId;
    top.appendChild(icon);
    top.appendChild(Object.assign(document.createElement("span"), { textContent: `${lib?.name || templateId}` }));
    row.appendChild(top);
    row.appendChild(Object.assign(document.createElement("div"), { textContent: `${lib?.type || "?"} | ${lib?.w || 1}x${lib?.h || 1}` }));
    const actions = document.createElement("div");
    actions.className = "row";
    actions.appendChild(button("Place", buildMode?.kind === "module" && buildMode?.index === idx ? "warn" : "primary", () => {
      buildMode = { kind: "module", templateId, index: idx };
      moveModuleId = null;
      closeModuleActions();
      showToast(`Placement: ${templateId} (click ship grid)`);
    }));
    row.appendChild(actions);
    inventoryModules.appendChild(row);
  });

  clearNode(inventoryShapes);
  state.ship.inventoryShapes.forEach((shapeId, idx) => {
    const sh = state.hullShapes[shapeId];
    const row = document.createElement("div");
    row.className = "list-item";
    row.appendChild(Object.assign(document.createElement("div"), { textContent: `${sh?.name || shapeId} [${shapeId}]` }));
    row.appendChild(Object.assign(document.createElement("div"), { textContent: `${sh?.cells?.length || 0} cells` }));
    const actions = document.createElement("div");
    actions.className = "row";
    actions.appendChild(button("Place", buildMode?.kind === "shape" && buildMode?.index === idx ? "warn" : "primary", () => {
      buildMode = { kind: "shape", shapeId, index: idx };
      moveModuleId = null;
      closeModuleActions();
      showToast(`Hull placement: ${shapeId}`);
    }));
    row.appendChild(actions);
    inventoryShapes.appendChild(row);
  });

  clearNode(repairTargets);
  state.ship.modules
    .filter((m) => m.status !== "online")
    .forEach((m) => {
      const row = document.createElement("div");
      row.className = "list-item";
      row.appendChild(Object.assign(document.createElement("div"), { textContent: `${m.name} ${Math.round(m.hp)}/${m.maxHp}` }));
      const actions = document.createElement("div");
      actions.className = "row";
      actions.appendChild(button("Set Target", "primary", () => socket.emit("setRepairTarget", { moduleId: m.id })));
      row.appendChild(actions);
      repairTargets.appendChild(row);
    });

  clearNode(shopList);
  state.offers.forEach((o) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.appendChild(Object.assign(document.createElement("div"), { textContent: `${o.label}` }));
    row.appendChild(Object.assign(document.createElement("div"), { textContent: `${o.description} | ${o.cost} cr` }));
    const actions = document.createElement("div");
    actions.className = "row";
    actions.appendChild(button("Buy", state.ship.credits >= o.cost ? "primary" : "", () => socket.emit("buyItem", { itemId: o.id })));
    row.appendChild(actions);
    shopList.appendChild(row);
  });

  if (Array.isArray(state.missionOptions) && missionSelect) {
    const keep = missionSelect.value;
    clearNode(missionSelect);
    state.missionOptions.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} - ${m.description}`;
      missionSelect.appendChild(opt);
    });
    missionSelect.value = keep || state.currentMission || "scout";
  }

  startWaveBtn.disabled = state.phase === "combat";
}

startWaveBtn.addEventListener("click", () => {
  socket.emit("startWave", { missionId: missionSelect?.value || "scout" });
});

moduleMoveBtn.addEventListener("click", () => {
  if (!moduleAction) return;
  moveModuleId = moduleAction.moduleId;
  const moving = moduleByIdLocal(moveModuleId);
  if (moving) buildRotation = moving.rotation || 0;
  buildMode = null;
  closeModuleActions();
  showToast("Move mode: click new cell on ship");
});

moduleRemoveBtn.addEventListener("click", () => {
  if (!moduleAction) return;
  socket.emit("removeModule", { moduleId: moduleAction.moduleId });
  moveModuleId = null;
  closeModuleActions();
});

window.addEventListener("mousedown", (e) => {
  if (moduleActionsEl.classList.contains("hidden")) return;
  if (moduleActionsEl.contains(e.target) || e.target === canvas) return;
  closeModuleActions();
});

function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resize);
resize();

function screenToWorld(sx, sy) {
  const rect = canvas.getBoundingClientRect();
  const x = sx - rect.left;
  const y = sy - rect.top;
  return {
    x: (x - rect.width / 2) / camera.z + camera.x,
    y: (y - rect.height / 2) / camera.z + camera.y,
  };
}

function worldToScreen(wx, wy) {
  const rect = canvas.getBoundingClientRect();
  const sx = camera.shakeX || 0;
  const sy = camera.shakeY || 0;
  return {
    x: (wx - camera.x) * camera.z + rect.width / 2 + sx,
    y: (wy - camera.y) * camera.z + rect.height / 2 + sy,
  };
}

function worldToShipGrid(wx, wy) {
  if (!state) return { gx: 0, gy: 0 };
  const ph = displayPhysics();
  const dx = wx - ph.x;
  const dy = wy - ph.y;
  const c = Math.cos(-ph.a);
  const s = Math.sin(-ph.a);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return {
    gx: Math.floor(lx / state.cellSize),
    gy: Math.floor(ly / state.cellSize),
  };
}

function worldToShipLocal(wx, wy) {
  if (!state) return { lx: 0, ly: 0 };
  const ph = displayPhysics();
  const dx = wx - ph.x;
  const dy = wy - ph.y;
  const c = Math.cos(-ph.a);
  const s = Math.sin(-ph.a);
  return {
    lx: dx * c - dy * s,
    ly: dx * s + dy * c,
  };
}

function pointNearShipLocal(local, marginCells = 0.4) {
  if (!state?.ship?.bounds) return false;
  const b = state.ship.bounds;
  const csz = state.cellSize;
  const minX = (b.minX - marginCells) * csz;
  const maxX = (b.maxX + 1 + marginCells) * csz;
  const minY = (b.minY - marginCells) * csz;
  const maxY = (b.maxY + 1 + marginCells) * csz;
  return local.lx >= minX && local.lx <= maxX && local.ly >= minY && local.ly <= maxY;
}

function pickModuleByPoint(wx, wy) {
  if (!state) return null;
  const local = worldToShipLocal(wx, wy);
  const gx = Math.floor(local.lx / state.cellSize);
  const gy = Math.floor(local.ly / state.cellSize);
  const direct = moduleAtGrid(gx, gy);
  if (direct) return direct;

  let best = null;
  let bestDist = Infinity;
  state.ship.modules.forEach((m) => {
    const cx = (m.x + m.w * 0.5) * state.cellSize;
    const cy = (m.y + m.h * 0.5) * state.cellSize;
    const d = Math.hypot(cx - local.lx, cy - local.ly);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  });

  if (state.phase === "combat") {
    if (!pointNearShipLocal(local, 0.55)) return null;
    return bestDist <= state.cellSize * 8 ? best : null;
  }

  return bestDist <= state.cellSize * 1.3 ? best : null;
}

function cycleRole(step = 1) {
  if (!state?.ship?.modules?.length) return;
  const modules = state.ship.modules.slice();
  if (!modules.length) return;
  const mePlayer = playerMe();
  const currentId = mePlayer?.moduleId || null;
  let idx = modules.findIndex((m) => m.id === currentId);
  if (idx === -1) idx = step > 0 ? -1 : 0;
  const next = modules[(idx + step + modules.length) % modules.length];
  if (!next) return;
  socket.emit("occupyModule", { moduleId: next.id });
  showToast(`Role: ${next.type}`);
}

canvas.addEventListener("pointermove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  const w = screenToWorld(mouse.x, mouse.y);
  mouse.worldX = w.x;
  mouse.worldY = w.y;
});

canvas.addEventListener("pointerdown", (e) => {
  ensureAudio();
  if (e.button === 0) mouse.downLeft = true;
  if (e.button === 2) mouse.downRight = true;

  if (!state) return;

  const w = screenToWorld(e.clientX, e.clientY);
  const g = worldToShipGrid(w.x, w.y);
  const clickedModule = pickModuleByPoint(w.x, w.y);

  if (e.button === 0) {
    if (!isGarage()) {
      if (clickedModule) {
        socket.emit("occupyModule", { moduleId: clickedModule.id });
        showToast(`You sit in: ${clickedModule.type}`);
      } else {
        closeModuleActions();
      }
      return;
    }

    if (moveModuleId) {
      socket.emit("moveModule", { moduleId: moveModuleId, x: g.gx, y: g.gy, rotation: buildRotation });
      moveModuleId = null;
      closeModuleActions();
      return;
    }

    if (buildMode?.kind === "module") {
      socket.emit("placeModule", { templateId: buildMode.templateId, x: g.gx, y: g.gy, rotation: buildRotation });
      buildMode = null;
      closeModuleActions();
      return;
    }
    if (buildMode?.kind === "shape") {
      socket.emit("addHullShape", { shapeId: buildMode.shapeId, x: g.gx, y: g.gy, rotation: buildRotation });
      buildMode = null;
      closeModuleActions();
      return;
    }

    if (clickedModule) {
      openModuleActions(clickedModule.id, e.clientX, e.clientY);
      return;
    }

    closeModuleActions();
  }

  if (e.button === 2 && isGarage() && moveModuleId) {
    socket.emit("moveModule", { moduleId: moveModuleId, x: g.gx, y: g.gy, rotation: buildRotation });
    moveModuleId = null;
    closeModuleActions();
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (e.button === 0) mouse.downLeft = false;
  if (e.button === 2) mouse.downRight = false;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyR", "BracketLeft", "BracketRight", "Tab"].includes(e.code)) e.preventDefault();
  keyState.add(e.code);

  if (e.code === "BracketLeft") {
    buildRotation = (buildRotation + 270) % 360;
    showToast(`Rotation ${buildRotation}°`);
  }
  if (e.code === "BracketRight") {
    buildRotation = (buildRotation + 90) % 360;
    showToast(`Rotation ${buildRotation}°`);
  }
  if (e.code === "Escape") {
    buildMode = null;
    moveModuleId = null;
    closeModuleActions();
    showToast("Build selection cleared");
  }
  if (e.code === "Tab") {
    cycleRole(e.shiftKey ? -1 : 1);
  }

  if (!joined) return;
  if (e.code === "Enter") socket.emit("startWave", { missionId: missionSelect?.value || "scout" });
  if (e.code === "ArrowLeft") socket.emit("repairAction", { action: "left" });
  if (e.code === "ArrowRight") socket.emit("repairAction", { action: "right" });
  if (e.code === "ArrowUp") socket.emit("repairAction", { action: "up" });
  if (e.code === "ArrowDown") socket.emit("repairAction", { action: "down" });
  if (e.code === "Digit1") socket.emit("repairAction", { action: "toggle_0" });
  if (e.code === "Digit2") socket.emit("repairAction", { action: "toggle_1" });
  if (e.code === "Digit3") socket.emit("repairAction", { action: "toggle_2" });
  if (e.code === "Space") socket.emit("repairAction", { action: "hit" });
});

window.addEventListener("keyup", (e) => {
  keyState.delete(e.code);
});

function inputPayload() {
  if (!state) return null;
  const ph = displayPhysics();
  const aim = Math.atan2(mouse.worldY - ph.y, mouse.worldX - ph.x);
  return {
    up: keyState.has("KeyW"),
    down: keyState.has("KeyS"),
    left: keyState.has("KeyA"),
    right: keyState.has("KeyD"),
    space: keyState.has("Space"),
    fire: mouse.downLeft,
    rightMouse: mouse.downRight,
    repairHold: keyState.has("KeyR"),
    aim,
  };
}

function drawBackground(t) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#04111d");
  base.addColorStop(0.55, "#071a2a");
  base.addColorStop(1, "#030913");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const ph = displayPhysics();
  const time = t * 0.001;
  const nebulae = [
    { x: 0.22, y: 0.34, r: 0.68, dx: 0.02, dy: 0.014, c1: "rgba(45,132,214,0.24)", c2: "rgba(7,23,38,0)" },
    { x: 0.72, y: 0.62, r: 0.74, dx: 0.03, dy: 0.02, c1: "rgba(255,122,72,0.16)", c2: "rgba(30,10,8,0)" },
    { x: 0.5, y: 0.2, r: 0.58, dx: 0.016, dy: 0.012, c1: "rgba(76,187,220,0.14)", c2: "rgba(5,14,23,0)" },
  ];
  nebulae.forEach((n, idx) => {
    const cx = w * n.x - ph.x * n.dx + Math.sin(time * (0.4 + idx * 0.18)) * 34;
    const cy = h * n.y - ph.y * n.dy + Math.cos(time * (0.33 + idx * 0.16)) * 26;
    const radius = Math.max(w, h) * n.r;
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.06, cx, cy, radius);
    grad.addColorStop(0, n.c1);
    grad.addColorStop(1, n.c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });

  for (let i = 0; i < 220; i += 1) {
    const layer = 0.08 + (i % 5) * 0.03;
    const px = wrap(i * 173 + ph.x * layer + time * (22 + (i % 7) * 4), w + 240) - 120;
    const py = wrap(i * 97 + ph.y * layer * 0.8 + time * (8 + (i % 5) * 2), h + 240) - 120;
    const tw = 0.45 + ((Math.sin(time * 2.2 + i * 0.7) + 1) * 0.5);
    const r = (i % 9 === 0 ? 1.6 : 0.75) + tw * 0.35;
    ctx.fillStyle = `rgba(182,224,255,${0.15 + tw * 0.38})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHullEdgeLines(csz) {
  const occupied = new Set(state.ship.cells.map((c) => `${c.x},${c.y}`));
  ctx.beginPath();
  state.ship.cells.forEach((c) => {
    const x = c.x * csz;
    const y = c.y * csz;
    if (!occupied.has(`${c.x - 1},${c.y}`)) { ctx.moveTo(x, y); ctx.lineTo(x, y + csz); }
    if (!occupied.has(`${c.x + 1},${c.y}`)) { ctx.moveTo(x + csz, y); ctx.lineTo(x + csz, y + csz); }
    if (!occupied.has(`${c.x},${c.y - 1}`)) { ctx.moveTo(x, y); ctx.lineTo(x + csz, y); }
    if (!occupied.has(`${c.x},${c.y + 1}`)) { ctx.moveTo(x, y + csz); ctx.lineTo(x + csz, y + csz); }
  });
  ctx.strokeStyle = isGarage() ? "rgba(138,237,255,0.75)" : "rgba(110,232,255,0.92)";
  ctx.lineWidth = isGarage() ? 1.35 : 2.2;
  ctx.stroke();
}

function drawEngineExhaust(csz, t) {
  const ts = t * 0.001;
  state.ship.modules.forEach((m) => {
    if (m.type !== "engine") return;
    const level = clamp(m.thrustLevel || 0, 0, 2.2);
    if (level < 0.06) return;

    const rot = ((m.rotation || 0) % 360 + 360) % 360;
    const dir = rot === 90 ? { x: 0, y: -1 } : rot === 180 ? { x: 1, y: 0 } : rot === 270 ? { x: 0, y: 1 } : { x: -1, y: 0 };
    const perp = { x: -dir.y, y: dir.x };

    const cx = (m.x + m.w * 0.5) * csz;
    const cy = (m.y + m.h * 0.5) * csz;
    const halfW = (m.w * csz) * 0.5;
    const halfH = (m.h * csz) * 0.5;
    const nozzleX = cx + dir.x * (halfW - 3);
    const nozzleY = cy + dir.y * (halfH - 3);
    const width = (Math.max(10, m.h * csz * 0.34)) * (0.65 + level * 0.35);
    const flick = 0.86 + Math.sin(ts * 28 + m.id.length) * 0.14;
    const len = (24 + level * 36) * flick;
    const tailX = nozzleX + dir.x * len;
    const tailY = nozzleY + dir.y * len;

    const grad = ctx.createLinearGradient(nozzleX, nozzleY, tailX, tailY);
    grad.addColorStop(0, "rgba(255,244,176,0.95)");
    grad.addColorStop(0.4, "rgba(95,233,255,0.9)");
    grad.addColorStop(1, "rgba(80,170,255,0)");
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(nozzleX + perp.x * width * 0.36, nozzleY + perp.y * width * 0.36);
    ctx.lineTo(nozzleX - perp.x * width * 0.36, nozzleY - perp.y * width * 0.36);
    ctx.lineTo(tailX - perp.x * width, tailY - perp.y * width);
    ctx.lineTo(tailX + perp.x * width, tailY + perp.y * width);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,220,0.9)";
    ctx.beginPath();
    ctx.arc(nozzleX, nozzleY, 2.3 + level * 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawTurretEffects(csz, shipAngle) {
  state.ship.modules.forEach((m) => {
    if (m.type !== "turret") return;
    const cx = (m.x + m.w * 0.5) * csz;
    const cy = (m.y + m.h * 0.5) * csz;
    const localAim = normalizeAngle((m.aim || shipAngle) - shipAngle);
    const recoil = (m.recoil || 0) * 6;
    const barrelLen = Math.max(m.w, m.h) * csz * 0.42 + 12;
    const sx = cx + Math.cos(localAim) * (8 - recoil);
    const sy = cy + Math.sin(localAim) * (8 - recoil);
    const ex = cx + Math.cos(localAim) * (barrelLen - recoil);
    const ey = cy + Math.sin(localAim) * (barrelLen - recoil);

    ctx.strokeStyle = "rgba(18,35,48,0.9)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.strokeStyle = "rgba(142,244,255,0.95)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.strokeStyle = "rgba(120,220,255,0.7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(9, Math.min(m.w, m.h) * csz * 0.28), 0, Math.PI * 2);
    ctx.stroke();

    if ((m.shotFlash || 0) > 0.01) {
      const flash = clamp(m.shotFlash, 0, 1);
      const radius = 7 + flash * 9;
      const mx = ex + Math.cos(localAim) * 2;
      const my = ey + Math.sin(localAim) * 2;
      const grad = ctx.createRadialGradient(mx, my, 0, mx, my, radius);
      grad.addColorStop(0, `rgba(255,250,196,${0.95 * flash})`);
      grad.addColorStop(0.45, `rgba(255,187,96,${0.8 * flash})`);
      grad.addColorStop(1, "rgba(255,120,62,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mx, my, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawShip(t) {
  if (!state) return;
  const csz = state.cellSize;
  const ph = displayPhysics();
  const shipPos = worldToScreen(ph.x, ph.y);
  ctx.save();
  ctx.translate(shipPos.x, shipPos.y);
  ctx.rotate(ph.a);

  if (state.ship.bounds) {
    const b = state.ship.bounds;
    const minX = b.minX * csz;
    const maxX = (b.maxX + 1) * csz;
    const minY = b.minY * csz;
    const maxY = (b.maxY + 1) * csz;
    const midY = (minY + maxY) * 0.5;
    const noseX = maxX + csz * 0.8;
    const hullGrad = ctx.createLinearGradient(minX, minY, maxX, maxY);
    hullGrad.addColorStop(0, "rgba(25,70,94,0.22)");
    hullGrad.addColorStop(1, "rgba(12,30,44,0.05)");
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.moveTo(minX + csz * 0.35, minY);
    ctx.lineTo(maxX - csz * 0.2, minY + csz * 0.08);
    ctx.quadraticCurveTo(noseX, midY - csz * 0.28, noseX, midY);
    ctx.quadraticCurveTo(noseX, midY + csz * 0.28, maxX - csz * 0.2, maxY - csz * 0.08);
    ctx.lineTo(minX + csz * 0.35, maxY);
    ctx.quadraticCurveTo(minX - csz * 0.55, midY, minX + csz * 0.35, minY);
    ctx.closePath();
    ctx.fill();
  }

  state.ship.cells.forEach((c) => {
    const x = c.x * csz;
    const y = c.y * csz;
    const garage = isGarage();
    const glow = 0.1 + Math.sin((c.x + c.y) * 0.9 + performance.now() * 0.002) * 0.03;
    ctx.fillStyle = garage ? `rgba(60,140,170,${0.4 + glow})` : "rgba(34,80,104,0.82)";
    ctx.fillRect(x, y, csz, csz);
    if (garage) {
      ctx.strokeStyle = "rgba(138,237,255,0.24)";
      ctx.strokeRect(x + 0.5, y + 0.5, csz - 1, csz - 1);
    }
  });
  drawHullEdgeLines(csz);
  drawEngineExhaust(csz, t);

  state.ship.modules.forEach((m) => {
    const x = m.x * csz;
    const y = m.y * csz;
    const w = m.w * csz;
    const h = m.h * csz;
    const img = sprite(m.sprite);
    const hpN = clamp(m.hp / Math.max(1, m.maxHp), 0, 1);
    const broken = m.status !== "online";

    if (img) {
      ctx.save();
      ctx.globalAlpha = broken ? 0.62 : 0.92;
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = broken ? "rgba(255,120,130,0.55)" : "rgba(80,210,240,0.5)";
      ctx.fillRect(x, y, w, h);
    }

    ctx.strokeStyle = broken ? "rgba(255,130,145,0.9)" : "rgba(120,245,255,0.85)";
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    ctx.fillStyle = "rgba(5,14,22,0.8)";
    ctx.fillRect(x + 3, y + h - 7, w - 6, 4);
    ctx.fillStyle = hpN > 0.45 ? "#6cf2a4" : hpN > 0.2 ? "#ffd56b" : "#ff7f8f";
    ctx.fillRect(x + 3, y + h - 7, (w - 6) * hpN, 4);

    if (m.occupiedBy) {
      ctx.fillStyle = "rgba(230,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + 7, 2.8 + Math.sin(performance.now() * 0.01) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (m.status === "malfunction" && m.malfunction) {
      ctx.fillStyle = "rgba(255,188,94,0.95)";
      ctx.fillRect(x + 2, y + 2, (w - 4) * (m.malfunction.progress / Math.max(1, m.malfunction.target)), 3);
    }
  });
  drawTurretEffects(csz, ph.a);

  ctx.restore();
}

function drawEnemies() {
  if (!state) return;
  state.enemies.forEach((e) => {
    const p = worldToScreen(e.x, e.y);
    const img = sprite(e.sprite);
    const r = e.radius * camera.z;

    if (img) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(e.a || 0);
      ctx.drawImage(img, -r, -r, r * 2, r * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255,124,114,0.85)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const n = clamp(e.hp / Math.max(1, e.maxHp), 0, 1);
    ctx.fillStyle = "rgba(8,16,20,0.75)";
    ctx.fillRect(p.x - r, p.y - r - 10, r * 2, 4);
    ctx.fillStyle = "#ff8b74";
    ctx.fillRect(p.x - r, p.y - r - 10, r * 2 * n, 4);

    if (e.elite) {
      const pulse = 0.75 + Math.sin(performance.now() * 0.01 + e.x * 0.01) * 0.25;
      ctx.strokeStyle = `rgba(255,212,138,${0.7 + pulse * 0.25})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 9 + pulse * 2, -0.4, Math.PI * 1.35);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,216,136,0.92)";
      ctx.font = "11px Sora";
      ctx.fillText("BOSS", p.x - 15, p.y - r - 14);
    }
  });
}

function drawProjectiles() {
  if (!state) return;
  state.projectiles.forEach((p) => {
    const pos = worldToScreen(p.x, p.y);
    ctx.fillStyle = p.color || (p.friendly ? "#8ef7ff" : "#ff8d7b");
    ctx.shadowBlur = 8;
    ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Math.max(2, p.radius * camera.z), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function drawShields() {
  if (!state) return;
  state.shields.forEach((s) => {
    const c = worldToScreen(s.x, s.y);
    const r = s.radius * camera.z;
    ctx.strokeStyle = "rgba(111,238,255,0.72)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, s.angle - s.width * 0.5, s.angle + s.width * 0.5);
    ctx.stroke();
  });
}

function drawDrops() {
  if (!state) return;
  state.drops.forEach((d) => {
    const p = worldToScreen(d.x, d.y);
    const r = 10 + Math.sin(performance.now() * 0.008 + d.x * 0.01) * 2;
    const icon = sprite(DROP_ICON_PATHS[d.kind]);
    if (icon) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(performance.now() * 0.0004);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(icon, -r, -r, r * 2, r * 2);
      ctx.restore();
    } else {
      const col = d.kind === "credits" ? "#ffd368" : d.kind === "shape" ? "#7cf5c4" : "#87c5ff";
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.t += dt;
    if (p.t >= p.life) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    const a = 1 - p.t / p.life;
    const s = worldToScreen(p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.r * camera.z, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawCombatCrosshair() {
  if (!state || state.phase !== "combat") return;
  const mePlayer = playerMe();
  if (!mePlayer?.moduleId) return;
  const mod = moduleByIdLocal(mePlayer.moduleId);
  if (!mod || mod.type !== "turret") return;

  const rect = canvas.getBoundingClientRect();
  const x = mouse.x - rect.left;
  const y = mouse.y - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

  const pulse = 0.7 + Math.sin(performance.now() * 0.02) * 0.3;
  ctx.strokeStyle = `rgba(160,246,255,${0.82 + pulse * 0.14})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 10 + pulse * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 16, y);
  ctx.lineTo(x - 7, y);
  ctx.moveTo(x + 7, y);
  ctx.lineTo(x + 16, y);
  ctx.moveTo(x, y - 16);
  ctx.lineTo(x, y - 7);
  ctx.moveTo(x, y + 7);
  ctx.lineTo(x, y + 16);
  ctx.stroke();
}

function drawBuildGhost() {
  if (!state || state.phase === "combat" || (!buildMode && !moveModuleId)) return;
  const g = worldToShipGrid(mouse.worldX, mouse.worldY);
  const csz = state.cellSize;
  const ph = displayPhysics();
  const pos = worldToScreen(ph.x, ph.y);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(ph.a);
  ctx.globalAlpha = 0.45;
  if (moveModuleId) {
    const current = moduleByIdLocal(moveModuleId);
    if (current) {
      ctx.fillStyle = "rgba(255,191,102,0.42)";
      ctx.fillRect(g.gx * csz, g.gy * csz, current.w * csz, current.h * csz);
      ctx.strokeStyle = "rgba(255,224,141,0.95)";
      ctx.strokeRect(g.gx * csz, g.gy * csz, current.w * csz, current.h * csz);
    }
  } else if (buildMode.kind === "module") {
    const t = state.moduleLibrary[buildMode.templateId];
    if (t) {
      const rot = ((buildRotation % 360) + 360) % 360;
      const w = rot === 90 || rot === 270 ? t.h : t.w;
      const h = rot === 90 || rot === 270 ? t.w : t.h;
      ctx.fillStyle = "rgba(112,255,244,0.45)";
      ctx.fillRect(g.gx * csz, g.gy * csz, w * csz, h * csz);
      ctx.strokeStyle = "rgba(163,255,246,0.95)";
      ctx.strokeRect(g.gx * csz, g.gy * csz, w * csz, h * csz);
    }
  } else if (buildMode.kind === "shape") {
    const sh = state.hullShapes[buildMode.shapeId];
    if (sh) {
      const rot = ((buildRotation % 360) + 360) % 360;
      sh.cells.forEach(([sx, sy]) => {
        let x = sx; let y = sy;
        if (rot === 90) { x = -sy; y = sx; }
        else if (rot === 180) { x = -sx; y = -sy; }
        else if (rot === 270) { x = sy; y = -sx; }
        ctx.fillStyle = "rgba(120,215,255,0.4)";
        ctx.fillRect((g.gx + x) * csz, (g.gy + y) * csz, csz, csz);
        ctx.strokeStyle = "rgba(176,233,255,0.9)";
        ctx.strokeRect((g.gx + x) * csz, (g.gy + y) * csz, csz, csz);
      });
    }
  }
  ctx.restore();
}

function render(dt, t) {
  drawBackground(t);
  if (!state) return;

  if (!renderPhysics.ready) {
    renderPhysics = { x: state.physics.x, y: state.physics.y, a: state.physics.a, ready: true };
  } else {
    const smooth = state.phase === "combat" ? clamp(dt * 12.5, 0, 1) : clamp(dt * 8.2, 0, 1);
    renderPhysics.x += (state.physics.x - renderPhysics.x) * smooth;
    renderPhysics.y += (state.physics.y - renderPhysics.y) * smooth;
    renderPhysics.a = normalizeAngle(renderPhysics.a + normalizeAngle(state.physics.a - renderPhysics.a) * smooth);
  }

  const ph = displayPhysics();
  camera.x += (ph.x - camera.x) * clamp(dt * 6, 0, 1);
  camera.y += (ph.y - camera.y) * clamp(dt * 6, 0, 1);
  shake.power = Math.max(0, (shake.power || 0) - dt * 2.6);
  const shakeAmount = (state.phase === "combat" ? 8 : 4) * shake.power;
  camera.shakeX = (Math.random() * 2 - 1) * shakeAmount;
  camera.shakeY = (Math.random() * 2 - 1) * shakeAmount;
  if (shake.power <= 0.001) {
    camera.shakeX = 0;
    camera.shakeY = 0;
  }
  const targetZoom = state.phase === "combat"
    ? (canvas.clientWidth < 850 ? 0.58 : 0.72)
    : (canvas.clientWidth < 850 ? 0.72 : 1.04);
  camera.z += (targetZoom - camera.z) * clamp(dt * 2.3, 0, 1);

  drawDrops();
  drawShields();
  drawShip(t);
  drawEnemies();
  drawProjectiles();
  drawBuildGhost();
  drawParticles(dt);
  drawCombatCrosshair();

  const mode = playerMe()?.moduleId ? moduleByIdLocal(playerMe().moduleId)?.type || "module" : "free";
  const speed = Math.hypot(state.physics.vx || 0, state.physics.vy || 0);
  const hasBoss = state.enemies.some((e) => e.elite);
  ctx.fillStyle = "rgba(8,24,34,0.72)";
  ctx.fillRect(12, 12, 340, 64);
  ctx.strokeStyle = "rgba(118,220,255,0.45)";
  ctx.strokeRect(12.5, 12.5, 339, 63);
  ctx.fillStyle = "#d9f8ff";
  ctx.font = "12px Sora";
  const line1 = state.phase === "combat"
    ? `Role: ${mode}`
    : `Garage | Rotation ${buildRotation}°${moveModuleId ? " | moving module" : ""}`;
  ctx.fillText(line1, 22, 33);
  ctx.fillStyle = "#9fd5e8";
  const line2 = state.phase === "combat"
    ? `Click module or press Tab to switch role`
    : `LMB place/open menu, RMB confirm move`;
  ctx.fillText(line2, 22, 50);
  if (state.phase === "combat") {
    ctx.fillStyle = hasBoss ? "#ffd199" : "#86cce7";
    ctx.fillText(`Speed ${Math.round(speed)} | Enemies ${state.enemies.length}${hasBoss ? " | BOSS" : ""}`, 22, 66);
  }
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (!document.hidden && joined && state && now - lastEmitInput > 40) {
    socket.emit("playerInput", inputPayload());
    lastEmitInput = now;
  }

  render(dt, now);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.render_game_to_text = () => {
  if (!state) return JSON.stringify({ mode: "lobby" });
  const mePlayer = playerMe();
  const role = mePlayer?.moduleId ? moduleByIdLocal(mePlayer.moduleId)?.type || "module" : "free";
  const damaged = state.ship.modules.filter((m) => m.status !== "online").map((m) => ({ id: m.id, type: m.type, status: m.status, hp: Math.round(m.hp), task: m.malfunction?.kind || null }));
  return JSON.stringify({
    coordinates: "world origin center of view; +x right, +y down",
    room: state.roomCode,
    phase: state.phase,
    wave: state.wave,
    timer: Math.ceil(state.phaseTime),
    me: { id: me, role, moduleId: mePlayer?.moduleId || null },
    ship: {
      x: Math.round(state.physics.x),
      y: Math.round(state.physics.y),
      angle: Number(state.physics.a.toFixed(3)),
      hull: `${Math.round(state.ship.hull)}/${Math.round(state.ship.hullMax)}`,
      energy: `${Math.round(state.ship.energy)}/${Math.round(state.ship.energyMax)}`,
      credits: state.ship.credits,
    },
    enemies: state.enemies.slice(0, 8).map((e) => ({ id: e.id, type: e.type, x: Math.round(e.x), y: Math.round(e.y), hp: Math.round(e.hp), elite: Boolean(e.elite) })),
    drops: state.drops.slice(0, 6).map((d) => ({ kind: d.kind, x: Math.round(d.x), y: Math.round(d.y) })),
    damaged,
    inventory: {
      modules: state.ship.inventoryModules.slice(0, 8),
      shapes: state.ship.inventoryShapes.slice(0, 8),
    },
  });
};

window.advanceTime = async (ms) => {
  const frames = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < frames; i += 1) {
    const now = performance.now();
    const dt = 1 / 60;
    render(dt, now + i * (1000 / 60));
  }
};

document.querySelector('#practice-btn').onclick=()=>socket.practice(nameInput.value);
document.querySelector('#create-btn').onclick=()=>socket.create(nameInput.value);
for(const b of document.querySelectorAll('[data-key]')){const key=b.dataset.key;b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);keyState.add(key);e.preventDefault();};const release=()=>keyState.delete(key);b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;}
const fire=document.querySelector('#touch-fire');fire.onpointerdown=e=>{fire.setPointerCapture(e.pointerId);mouse.downLeft=true;e.preventDefault();};fire.onpointerup=fire.onpointercancel=fire.onlostpointercapture=()=>mouse.downLeft=false;
document.querySelector('#touch-rotate').onclick=()=>{buildRotation=(buildRotation+90)%360;showToast('Поворот '+buildRotation+'°');};
canvas.addEventListener('pointercancel',()=>{mouse.downLeft=false;mouse.downRight=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keyState.clear();mouse.downLeft=false;mouse.downRight=false;if(joined)socket.emit('playerInput',inputPayload());}});


for(const button of document.querySelectorAll('[data-panel]'))button.onclick=()=>{document.body.dataset.panel=document.body.dataset.panel===button.dataset.panel?'':button.dataset.panel;};



