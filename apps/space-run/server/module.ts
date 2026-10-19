function context(saved){const events=[];let connection;
const io={on(type,fn){if(type==='connection')connection=fn;},to(){return {emit(){}};}};
const MAX_PLAYERS = 8;
const TICK_HZ = 45;
const SNAP_HZ = 30;
const CELL = 32;
const ROOM_IDLE_MS = 5 * 60 * 1000;

const COLORS = ["#49e7ff", "#ffd24a", "#ff6f9f", "#7bff7a", "#ff9e45", "#8ea2ff", "#ff5f5f", "#7dffe4"];

const MODULES = {
  engine_mk1: { id: "engine_mk1", name: "Ion Engine Mk I", type: "engine", w: 4, h: 2, maxHp: 190, thrust: 170, torque: 0.13, energyUse: 18, cost: 120, sprite: "assets/modules/engine_mk1_1.png" },
  engine_mk2: { id: "engine_mk2", name: "Afterburn Engine Mk II", type: "engine", w: 4, h: 2, maxHp: 240, thrust: 245, torque: 0.18, energyUse: 26, cost: 210, sprite: "assets/modules/engine_mk2_1.png" },
  turret_mk1: { id: "turret_mk1", name: "Rail Turret Mk I", type: "turret", w: 2, h: 2, maxHp: 150, damage: 30, fireInterval: 0.4, shotSpeed: 560, energyUse: 10, cost: 140, sprite: "assets/modules/turret_mk1_1.png" },
  turret_mk2: { id: "turret_mk2", name: "Burst Turret Mk II", type: "turret", w: 3, h: 2, maxHp: 170, damage: 21, fireInterval: 0.18, shotSpeed: 520, energyUse: 11, cost: 240, sprite: "assets/modules/turret_mk2_1.png" },
  shield_mk1: { id: "shield_mk1", name: "Arc Shield Mk I", type: "shield", w: 3, h: 2, maxHp: 220, strength: 1, drain: 24, radius: 188, width: 1.75, cost: 160, sprite: "assets/modules/shield_mk1_1.png" },
  shield_mk2: { id: "shield_mk2", name: "Prism Shield Mk II", type: "shield", w: 4, h: 2, maxHp: 280, strength: 1.4, drain: 32, radius: 212, width: 2.2, cost: 260, sprite: "assets/modules/shield_mk2_1.png" },
  reactor_mk1: { id: "reactor_mk1", name: "Micro Reactor", type: "reactor", w: 2, h: 2, maxHp: 210, regen: 30, cost: 130, sprite: "assets/modules/reactor_mk1_1.png" },
  reactor_mk2: { id: "reactor_mk2", name: "Core Reactor", type: "reactor", w: 3, h: 3, maxHp: 320, regen: 50, cost: 300, sprite: "assets/modules/reactor_mk2_1.png" },
  repair_bay_mk1: { id: "repair_bay_mk1", name: "Repair Bay", type: "repair", w: 2, h: 2, maxHp: 170, cost: 115, sprite: "assets/modules/repair_bay_mk1_1.png" },
  sensor_mk1: { id: "sensor_mk1", name: "Target Sensor", type: "sensor", w: 2, h: 1, maxHp: 130, critBoost: 0.08, cost: 110, sprite: "assets/modules/sensor_mk1_1.png" },
};

const SHAPES = {
  block2: { id: "block2", name: "Patch 2x2", cost: 70, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  line4: { id: "line4", name: "Beam 1x4", cost: 80, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  tower4: { id: "tower4", name: "Tower 4x1", cost: 80, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  block4: { id: "block4", name: "Plate 4x4", cost: 220, cells: [[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2],[3,2],[0,3],[1,3],[2,3],[3,3]] },
  hook4: { id: "hook4", name: "Hook Wing", cost: 130, cells: [[0,0],[1,0],[2,0],[0,1],[0,2],[0,3]] },
  wedge: { id: "wedge", name: "Wedge Nose", cost: 95, cells: [[0,0],[1,0],[2,0],[1,-1],[1,1]] },
};

const ENEMIES = {
  drone: { id: "drone", hp: 50, speed: 66, fireInterval: 1.2, shotSpeed: 230, damage: 14, radius: 18, reward: 18, cost: 1, sprite: "assets/enemies/enemy_drone_1.png" },
  skirmisher: { id: "skirmisher", hp: 90, speed: 52, fireInterval: 0.85, shotSpeed: 300, damage: 18, radius: 22, reward: 26, cost: 2, sprite: "assets/enemies/enemy_skirmisher_1.png" },
  bruiser: { id: "bruiser", hp: 220, speed: 30, fireInterval: 1.7, shotSpeed: 220, damage: 30, radius: 30, reward: 55, cost: 4, sprite: "assets/enemies/enemy_bruiser_1.png" },
};

const MODULE_SKINS = {
  engine_mk1: ["assets/modules/engine_mk1_1.png", "assets/modules/engine_mk1_2.png", "assets/modules/engine_mk1_3.png"],
  engine_mk2: ["assets/modules/engine_mk2_1.png", "assets/modules/engine_mk2_2.png", "assets/modules/engine_mk2_3.png"],
  turret_mk1: ["assets/modules/turret_mk1_1.png", "assets/modules/turret_mk1_2.png", "assets/modules/turret_mk1_3.png"],
  turret_mk2: ["assets/modules/turret_mk2_1.png", "assets/modules/turret_mk2_2.png", "assets/modules/turret_mk2_3.png"],
  shield_mk1: ["assets/modules/shield_mk1_1.png", "assets/modules/shield_mk1_2.png", "assets/modules/shield_mk1_3.png"],
  shield_mk2: ["assets/modules/shield_mk2_1.png", "assets/modules/shield_mk2_2.png", "assets/modules/shield_mk2_3.png"],
  reactor_mk1: ["assets/modules/reactor_mk1_1.png", "assets/modules/reactor_mk1_2.png", "assets/modules/reactor_mk1_3.png"],
  reactor_mk2: ["assets/modules/reactor_mk2_1.png", "assets/modules/reactor_mk2_2.png", "assets/modules/reactor_mk2_3.png"],
  repair_bay_mk1: [
    "assets/modules/repair_bay_mk1_1.png",
    "assets/modules/repair_bay_mk1_2.png",
    "assets/modules/repair_bay_mk1_3.png",
  ],
  sensor_mk1: ["assets/modules/sensor_mk1_1.png", "assets/modules/sensor_mk1_2.png", "assets/modules/sensor_mk1_3.png"],
};

const ENEMY_SKINS = {
  drone: [
    "assets/enemies/enemy_drone_1.png",
    "assets/enemies/enemy_drone_2.png",
    "assets/enemies/enemy_drone_3.png",
    "assets/enemies/enemy_drone_4.png",
  ],
  skirmisher: [
    "assets/enemies/enemy_skirmisher_1.png",
    "assets/enemies/enemy_skirmisher_2.png",
    "assets/enemies/enemy_skirmisher_3.png",
    "assets/enemies/enemy_skirmisher_4.png",
  ],
  bruiser: [
    "assets/enemies/enemy_bruiser_1.png",
    "assets/enemies/enemy_bruiser_2.png",
    "assets/enemies/enemy_bruiser_3.png",
    "assets/enemies/enemy_bruiser_4.png",
  ],
};

const TASK_TYPES = ["sequence", "timing", "circuit"];
const MISSION_OPTIONS = [
  {
    id: "scout",
    name: "Разведка",
    description: "Спокойный рейд",
    enemyScale: 0.85,
    hpScale: 0.9,
    rewardScale: 0.9,
  },
  {
    id: "assault",
    name: "Штурм",
    description: "Больше врагов и награда выше",
    enemyScale: 1.3,
    hpScale: 1.2,
    rewardScale: 1.3,
  },
];



const rooms = new Map();
const clamp = (v, mn, mx) => Math.min(mx, Math.max(mn, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickSkin = (list, fallback) => (Array.isArray(list) && list.length ? pick(list) : fallback);
const missionById = (id) => MISSION_OPTIONS.find((m) => m.id === id) || MISSION_OPTIONS[0];
const ckey = (x, y) => `${x},${y}`;
const parseKey = (k) => { const [x, y] = k.split(",").map(Number); return { x, y }; };
const normalize = (a) => { let n = a; while (n > Math.PI) n -= Math.PI * 2; while (n < -Math.PI) n += Math.PI * 2; return n; };

function sanitizeCode(input) {
  const raw = String(input || "ALPHA").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (raw || "ALPHA").slice(0, 8);
}

function sanitizeName(input) {
  const raw = String(input || "Pilot").trim().replace(/\s+/g, " ");
  return (raw || "Pilot").slice(0, 24);
}

function dims(template, rot) {
  const n = ((rot % 360) + 360) % 360;
  return (n === 90 || n === 270) ? [template.h, template.w] : [template.w, template.h];
}

function footprint(mod) {
  const t = MODULES[mod.templateId];
  const [w, h] = dims(t, mod.rotation);
  const out = [];
  for (let dx = 0; dx < w; dx += 1) for (let dy = 0; dy < h; dy += 1) out.push({ x: mod.x + dx, y: mod.y + dy });
  return out;
}

function shipBounds(cells) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const k of cells) {
    const { x, y } = parseKey(k);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function initialHull() {
  const cells = new Set();
  for (let x = -4; x <= 3; x += 1) {
    for (let y = -2; y <= 1; y += 1) {
      cells.add(ckey(x, y));
    }
  }
  return cells;
}

function shopOffers(wave) {
  const out = [
    { id: "s_engine1", kind: "module", ref: "engine_mk1", cost: 120 },
    { id: "s_turret1", kind: "module", ref: "turret_mk1", cost: 140 },
    { id: "s_block2", kind: "shape", ref: "block2", cost: 70 },
    { id: "s_line4", kind: "shape", ref: "line4", cost: 80 },
  ];
  const mods = Object.values(MODULES).filter((m) => !/mk2/.test(m.id) || wave >= 2).map((m) => m.id);
  const shapes = Object.keys(SHAPES);
  while (out.length < 8) {
    if (Math.random() < 0.68) {
      const ref = pick(mods);
      out.push({ id: `m_${ref}_${Math.random().toString(36).slice(2,6)}`, kind: "module", ref, cost: MODULES[ref].cost + Math.round(rand(-15, 25)) });
    } else {
      const ref = pick(shapes);
      out.push({ id: `h_${ref}_${Math.random().toString(36).slice(2,6)}`, kind: "shape", ref, cost: SHAPES[ref].cost + Math.round(rand(-10, 30)) });
    }
  }
  return out;
}

function newRoom(code) {
  const room = {
    code,
    players: new Map(),
    ship: {
      cells: initialHull(), modules: [], nextId: 1,
      inventoryModules: [],
      inventoryShapes: [],
      credits: 180, hullMax: 560, hull: 560, energyMax: 130, energy: 130,
    },
    physics: { x: 0, y: 0, vx: 0, vy: 0, a: 0, av: 0 },
    phase: "build", phaseTime: 0, wave: 0,
    enemies: [], projectiles: [], drops: [], shields: [], events: [],
    offers: shopOffers(0), malfunctionClock: 9,
    currentMission: "scout",
    simTime: 0,
    lastTick: Date.now(), snapAcc: 0, idleSince: Date.now(),
  };
  [
    ["engine_mk1", -4, -1, 0],
    ["turret_mk1", 1, -1, 0],
  ].forEach((s) => installModule(room, s[0], s[1], s[2], s[3], false));
  return room;
}

function moduleById(room, id) { return room.ship.modules.find((m) => m.id === id) || null; }
function playerById(room, id) { return room.players.get(id) || null; }

function validatePlacement(ship, mod, ignoreId = null) {
  const fp = footprint(mod);
  for (const c of fp) if (!ship.cells.has(ckey(c.x, c.y))) return { ok: false, message: "Module must fit inside hull" };
  for (const e of ship.modules) {
    if (ignoreId && e.id === ignoreId) continue;
    const ep = footprint(e);
    for (const c of fp) if (ep.some((p) => p.x === c.x && p.y === c.y)) return { ok: false, message: "Module overlap" };
  }
  return { ok: true };
}

function installModule(room, templateId, x, y, rotation = 0, consumeInventory = true) {
  const t = MODULES[templateId];
  if (!t) return { ok: false, message: "Unknown template" };
  if (consumeInventory) {
    const idx = room.ship.inventoryModules.indexOf(templateId);
    if (idx === -1) return { ok: false, message: "Template not in inventory" };
    room.ship.inventoryModules.splice(idx, 1);
  }
  const mod = {
    id: `m${room.ship.nextId}`,
    templateId,
    x: Math.round(x),
    y: Math.round(y),
    rotation: ((Math.round(rotation / 90) * 90) % 360 + 360) % 360,
    hp: t.maxHp,
    maxHp: t.maxHp,
    status: "online",
    malfunction: null,
    cooldown: 0,
    occupiedBy: null,
    aim: 0,
    thrustLevel: 0,
    shotFlash: 0,
    recoil: 0,
    sprite: pickSkin(MODULE_SKINS[templateId], t.sprite),
  };
  const check = validatePlacement(room.ship, mod);
  if (!check.ok) {
    if (consumeInventory) room.ship.inventoryModules.push(templateId);
    return check;
  }
  room.ship.nextId += 1;
  room.ship.modules.push(mod);
  room.events.push({ type: "module-installed", moduleId: mod.id, templateId });
  return { ok: true, module: mod };
}

function slotModule(room, playerId, moduleId) {
  const p = playerById(room, playerId);
  const m = moduleById(room, moduleId);
  if (!p || !m) return { ok: false, message: "Player/module missing" };
  if (m.occupiedBy && m.occupiedBy !== p.id) return { ok: false, message: "Module already occupied" };
  if (p.moduleId && p.moduleId !== m.id) {
    const old = moduleById(room, p.moduleId);
    if (old && old.occupiedBy === p.id) old.occupiedBy = null;
  }
  p.moduleId = m.id;
  m.occupiedBy = p.id;
  room.events.push({ type: "seat", moduleId: m.id, playerId: p.id });
  return { ok: true };
}

function leaveSeat(room, playerId) {
  const p = playerById(room, playerId);
  if (!p || !p.moduleId) return;
  const m = moduleById(room, p.moduleId);
  if (m && m.occupiedBy === p.id) m.occupiedBy = null;
  p.moduleId = null;
}

function shapeCells(shapeId, atX, atY, rotation = 0) {
  const shape = SHAPES[shapeId];
  if (!shape) return null;
  const n = ((rotation % 360) + 360) % 360;
  const out = [];
  for (const [sx, sy] of shape.cells) {
    let x = sx; let y = sy;
    if (n === 90) { x = -sy; y = sx; }
    else if (n === 180) { x = -sx; y = -sy; }
    else if (n === 270) { x = sy; y = -sx; }
    out.push({ x: atX + x, y: atY + y });
  }
  return out;
}

function addHullShape(room, shapeId, x, y, rotation = 0, consume = true) {
  const shape = SHAPES[shapeId];
  if (!shape) return { ok: false, message: "Unknown shape" };
  const cells = shapeCells(shapeId, Math.round(x), Math.round(y), rotation);
  if (!cells || !cells.length) return { ok: false, message: "Shape placement failed" };
  if (consume) {
    const idx = room.ship.inventoryShapes.indexOf(shapeId);
    if (idx === -1) return { ok: false, message: "Shape not in inventory" };
    room.ship.inventoryShapes.splice(idx, 1);
  }
  let touch = false;
  for (const c of cells) {
    if (room.ship.cells.has(ckey(c.x, c.y))) {
      if (consume) room.ship.inventoryShapes.push(shapeId);
      return { ok: false, message: "Shape overlaps hull" };
    }
    [[1,0],[-1,0],[0,1],[0,-1]].forEach((d) => {
      if (room.ship.cells.has(ckey(c.x + d[0], c.y + d[1]))) touch = true;
    });
  }
  if (!touch) {
    if (consume) room.ship.inventoryShapes.push(shapeId);
    return { ok: false, message: "New shape must touch ship" };
  }
  cells.forEach((c) => room.ship.cells.add(ckey(c.x, c.y)));
  room.ship.hullMax += cells.length * 18;
  room.ship.hull += cells.length * 18;
  room.events.push({ type: "hull-added", shapeId, count: cells.length });
  return { ok: true };
}

function moduleStats(room, mod) {
  const bounds = shipBounds(room.ship.cells);
  const fp = footprint(mod);
  let exposed = 0, rear = false, front = false, edge = false;
  for (const c of fp) {
    if (c.x === bounds.minX) { rear = true; edge = true; }
    if (c.x === bounds.maxX) { front = true; edge = true; }
    if (c.y === bounds.minY || c.y === bounds.maxY) edge = true;
    [[1,0],[-1,0],[0,1],[0,-1]].forEach((d) => { if (!room.ship.cells.has(ckey(c.x + d[0], c.y + d[1]))) exposed += 1; });
  }
  const cx = fp.reduce((a, c) => a + c.x, 0) / fp.length;
  const cy = fp.reduce((a, c) => a + c.y, 0) / fp.length;
  return { bounds, exposure: clamp(exposed / (fp.length * 4), 0, 1), rear, front, edge, cx, cy };
}

function placementEffect(room, mod) {
  const t = MODULES[mod.templateId];
  const s = moduleStats(room, mod);
  const w = Math.max(1, s.bounds.maxX - s.bounds.minX + 1);
  const h = Math.max(1, s.bounds.maxY - s.bounds.minY + 1);
  const frontness = clamp((s.cx - s.bounds.minX) / w, 0, 1);
  const rearness = clamp((s.bounds.maxX - s.cx) / w, 0, 1);
  const center = 1 - clamp(Math.abs(s.cy) / (h / 2 + 1), 0, 1);
  if (t.type === "engine") return clamp((0.35 + rearness * 0.95 + (s.rear ? 0.35 : 0)) * (s.edge ? 1 : 0.5), 0.2, 1.75);
  if (t.type === "turret") return clamp(0.45 + s.exposure * 1.35 + (s.edge ? 0.2 : 0), 0.25, 1.9);
  if (t.type === "shield") return clamp((0.5 + frontness * 0.95) * (s.edge ? 1 : 0.82), 0.3, 1.6);
  if (t.type === "reactor") return clamp(0.55 + center * 0.9, 0.3, 1.55);
  if (t.type === "repair") return clamp(0.65 + center * 0.7 + s.exposure * 0.4, 0.35, 1.6);
  if (t.type === "sensor") return clamp(0.6 + frontness * 0.8 + s.exposure * 0.6, 0.4, 1.8);
  return 1;
}

function shipMassProperties(room) {
  const pts=[];
  for(const cell of room.ship.cells){const {x,y}=parseKey(cell);pts.push({x:x+.5,y:y+.5,mass:1});}
  for(const m of room.ship.modules){
    const t=MODULES[m.templateId];if(!t)continue;
    const [w,h]=dims(t,m.rotation);pts.push({x:m.x+w/2,y:m.y+h/2,mass:w*h*1.8});
  }
  let mass=0,cx=0,cy=0;
  for(const p of pts){mass+=p.mass;cx+=p.x*p.mass;cy+=p.y*p.mass;}
  mass=Math.max(1,mass);cx/=mass;cy/=mass;
  let inertia=0;
  for(const p of pts)inertia+=p.mass*((p.x-cx)**2+(p.y-cy)**2+.17)*CELL*CELL;
  return {mass,centerX:cx*CELL,centerY:cy*CELL,inertia:Math.max(8000,inertia)};
}
function moduleWorldPoint(room,mod,forward=0,angle=room.physics.a){
  const t=MODULES[mod.templateId],[w,h]=dims(t,mod.rotation);
  const lx=(mod.x+w*.5)*CELL,ly=(mod.y+h*.5)*CELL;
  const a=room.physics.a,c=Math.cos(a),s=Math.sin(a);
  const dx=lx*c-ly*s,dy=lx*s+ly*c;
  return {x:room.physics.x+dx+Math.cos(angle)*forward,
          y:room.physics.y+dy+Math.sin(angle)*forward,dx,dy};
}

function worldToShip(room, wx, wy) {
  const dx = wx - room.physics.x, dy = wy - room.physics.y;
  const c = Math.cos(-room.physics.a), s = Math.sin(-room.physics.a);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function moduleAtCell(room, gx, gy) {
  for (const m of room.ship.modules) if (footprint(m).some((c) => c.x === gx && c.y === gy)) return m;
  return null;
}

function makeTask() {
  const kind = pick(TASK_TYPES);
  if (kind === "sequence") {
    const seq = []; for (let i = 0; i < 5; i += 1) seq.push(pick(["left", "right", "up", "down"]));
    return { kind, progress: 0, target: 5, sequence: seq, index: 0 };
  }
  if (kind === "timing") return { kind, progress: 0, target: 4, phase: Math.random(), speed: rand(0.7, 1.15) };
  return {
    kind,
    progress: 0,
    target: 3,
    bits: [Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1],
    targetBits: [Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1],
  };
}

function breakModule(room, mod, heavy = false) {
  if (!mod.malfunction) {
    mod.malfunction = makeTask();
    if (heavy) mod.malfunction.target += 2;
  }
  mod.status = "malfunction";
}

function randomMalfunction(room) {
  const list = room.ship.modules.filter((m) => m.status === "online" && m.hp > m.maxHp * 0.35);
  if (!list.length) return;
  const mod = pick(list);
  breakModule(room, mod, false);
  room.events.push({ type: "malfunction", moduleId: mod.id, kind: mod.malfunction.kind });
}

function spawnEnemyUnit(room, enemyType, wave, mission, opts = {}) {
  const base = ENEMIES[enemyType];
  if (!base) return null;
  const angle = Number.isFinite(opts.angle) ? opts.angle : rand(0, Math.PI * 2);
  const dist = Number.isFinite(opts.dist) ? opts.dist : rand(720, 1100);
  const x = Number.isFinite(opts.x) ? opts.x : room.physics.x + Math.cos(angle) * dist;
  const y = Number.isFinite(opts.y) ? opts.y : room.physics.y + Math.sin(angle) * dist;
  const speedIn = Number.isFinite(opts.speedIn) ? opts.speedIn : rand(20, 40);
  const hp = Number.isFinite(opts.hp) ? opts.hp : Math.round((base.hp + wave * base.cost * 4) * mission.hpScale);
  const fireInterval = Number.isFinite(opts.fireInterval) ? opts.fireInterval : base.fireInterval;
  const enemy = {
    id: `e_${Math.random().toString(36).slice(2,9)}`,
    type: base.id,
    x,
    y,
    vx: Number.isFinite(opts.vx) ? opts.vx : Math.cos(angle + Math.PI) * speedIn,
    vy: Number.isFinite(opts.vy) ? opts.vy : Math.sin(angle + Math.PI) * speedIn,
    hp,
    maxHp: hp,
    fireCooldown: Number.isFinite(opts.fireCooldown) ? opts.fireCooldown : rand(0.2, fireInterval + 0.3),
    a: Number.isFinite(opts.a) ? opts.a : angle + Math.PI,
    radius: Number.isFinite(opts.radius) ? opts.radius : base.radius,
    speed: Number.isFinite(opts.speed) ? opts.speed : base.speed,
    fireInterval,
    shotSpeed: Number.isFinite(opts.shotSpeed) ? opts.shotSpeed : base.shotSpeed,
    damage: Number.isFinite(opts.damage) ? opts.damage : base.damage,
    reward: Number.isFinite(opts.reward) ? opts.reward : base.reward,
    elite: Boolean(opts.elite),
    aiPhase: Number.isFinite(opts.aiPhase) ? opts.aiPhase : rand(0, Math.PI * 2),
    aiMode: opts.aiMode || (base.id === "drone" ? "dart" : base.id === "skirmisher" ? "orbit" : "press"),
    dashCooldown: rand(1.2, 2.7),
    sprite: opts.sprite || pickSkin(ENEMY_SKINS[base.id], base.sprite),
  };
  room.enemies.push(enemy);
  return enemy;
}

function spawnWave(room, wave, mission) {
  let budget = Math.max(4, Math.round((7 + wave * 3) * mission.enemyScale));
  let created = 0;
  while (budget > 0 && created < 64) {
    const pool = Object.values(ENEMIES).filter((e) => e.cost <= budget);
    if (!pool.length) break;
    const t = pick(pool);
    spawnEnemyUnit(room, t.id, wave, mission);
    budget -= t.cost; created += 1;
  }

  if (wave > 0 && wave % 4 === 0) {
    const bossBase = ENEMIES.bruiser;
    const elite = spawnEnemyUnit(room, "bruiser", wave, mission, {
      hp: Math.round((bossBase.hp + wave * 18) * mission.hpScale * 4.2),
      radius: 46,
      speed: 28,
      damage: 42,
      fireInterval: 1.05,
      shotSpeed: 260,
      reward: 260 + wave * 35,
      elite: true,
      aiMode: "boss",
      dist: rand(820, 980),
      speedIn: rand(14, 26),
      sprite: pickSkin(ENEMY_SKINS.bruiser, bossBase.sprite),
    });
    if (elite) room.events.push({ type: "boss-spawn", wave, enemyType: "bruiser", x: elite.x, y: elite.y });
  }
}

function startWave(room, missionId = "scout") {
  if (room.phase === "combat") return;
  const mission = missionById(missionId);
  room.currentMission = mission.id;
  room.phase = "combat"; room.wave += 1; room.phaseTime = 160;
  room.malfunctionClock = rand(7, 13);
  spawnWave(room, room.wave, mission);
  room.events.push({ type: "phase", phase: "combat", wave: room.wave, mission: mission.id });
}

function finishWave(room) {
  room.phase = "shop"; room.phaseTime = 36;
  room.physics.a = 0;
  room.physics.av = 0;
  room.physics.vx *= 0.3;
  room.physics.vy *= 0.3;
  const mission = missionById(room.currentMission);
  const reward = Math.round((130 + room.wave * 30) * mission.rewardScale);
  room.ship.credits += reward;
  room.offers = shopOffers(room.wave);
  room.ship.hull = clamp(room.ship.hull + 110, 0, room.ship.hullMax);
  room.ship.energy = clamp(room.ship.energy + 70, 0, room.ship.energyMax);
  room.events.push({ type: "phase", phase: "shop", reward, wave: room.wave });
  if (Math.random() < 0.65) {
    const mod = pick(Object.keys(MODULES));
    room.ship.inventoryModules.push(mod);
    room.events.push({ type: "loot", kind: "module", moduleId: mod });
  }
  if (Math.random() < 0.35) {
    const shape = pick(Object.keys(SHAPES));
    room.ship.inventoryShapes.push(shape);
    room.events.push({ type: "loot", kind: "shape", shapeId: shape });
  }
}

function shipDefeat(room, reason = "hull") {
  room.phase = "build"; room.phaseTime = 0;
  room.enemies.length = 0; room.projectiles.length = 0; room.shields.length = 0;
  room.physics.a = 0;
  room.physics.av = 0;
  room.physics.vx = 0;
  room.physics.vy = 0;
  room.ship.hull = room.ship.hullMax * 0.72;
  room.ship.energy = room.ship.energyMax * 0.75;
  room.ship.credits = Math.max(0, room.ship.credits - 150);
  room.ship.modules.forEach((m) => { m.hp = Math.max(m.maxHp * 0.6, m.hp); m.status = "online"; m.malfunction = null; });
  room.events.push({ type: "defeat", reason });
}

function spawnProjectile(room, data) {
  room.projectiles.push({ id: `p_${Math.random().toString(36).slice(2,10)}`, ...data });
}

function updateDrops(room, dt) {
  for (let i = room.drops.length - 1; i >= 0; i -= 1) {
    const d = room.drops[i];
    d.ttl -= dt;
    const dx = room.physics.x - d.x, dy = room.physics.y - d.y;
    if (Math.hypot(dx, dy) < 160) {
      if (d.kind === "credits") room.ship.credits += d.value;
      else if (d.kind === "module") room.ship.inventoryModules.push(d.value);
      else if (d.kind === "shape") room.ship.inventoryShapes.push(d.value);
      room.events.push({ type: "loot", kind: d.kind, value: d.value });
      room.drops.splice(i, 1); continue;
    }
    if (d.ttl <= 0) room.drops.splice(i, 1);
  }
}

function updateShip(room, dt) {
  const ship = room.ship;
  const ph = room.physics;
  room.shields.length = 0;
  let regen = 10;
  let sensor = 0;
  const massProperties = shipMassProperties(room);

  for (const m of ship.modules) {
    const t = MODULES[m.templateId];
    const hp = clamp(m.hp / m.maxHp, 0, 1);
    const eff = placementEffect(room, m);
    m.cooldown = Math.max(0, m.cooldown - dt);
    m.thrustLevel = Math.max(0, (m.thrustLevel || 0) - dt * 2.8);
    m.shotFlash = Math.max(0, (m.shotFlash || 0) - dt * 8.5);
    m.recoil = Math.max(0, (m.recoil || 0) - dt * 7.2);
    if (m.malfunction && m.malfunction.kind === "timing") m.malfunction.phase = (m.malfunction.phase + dt * m.malfunction.speed) % 1;
    if (t.type === "reactor" && m.status === "online") regen += t.regen * eff * hp * (m.occupiedBy ? 1 : 0.72);
    if (t.type === "sensor" && m.status === "online") sensor += t.critBoost * eff * hp * (m.occupiedBy ? 1 : 0.45);
  }

  ship.energy = clamp(ship.energy + regen * dt, 0, ship.energyMax);

  for (const m of ship.modules) {
    const p = m.occupiedBy ? room.players.get(m.occupiedBy) : null;
    if (!p || !p.input) continue;

    const t = MODULES[m.templateId];
    const hp = clamp(m.hp / m.maxHp, 0, 1);
    const eff = placementEffect(room, m);
    const power = hp * (m.status === "online" ? 1 : 0.4);

    if (t.type === "engine") {
      const throttle = (p.input.up ? 1 : 0) - (p.input.down ? 0.55 : 0);
      const vec = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      if (Math.abs(throttle) > 0.01 || Math.abs(vec) > 0.01) {
        const need = t.energyUse * (Math.abs(throttle) * 0.95 + Math.abs(vec) * 0.3) * dt;
        if (ship.energy >= need) {
          ship.energy -= need;
          const a = ph.a + vec * 0.62;
          const thrust = t.thrust * 1.35 * eff * power * throttle;
          const acceleration = thrust * clamp(54/massProperties.mass,0.22,1.75);
          const fx=Math.cos(a)*acceleration,fy=Math.sin(a)*acceleration;
          ph.vx+=fx*dt;ph.vy+=fy*dt;
          const mount=moduleWorldPoint(room,m);
          const massX=massProperties.centerX*Math.cos(ph.a)-massProperties.centerY*Math.sin(ph.a);
          const massY=massProperties.centerX*Math.sin(ph.a)+massProperties.centerY*Math.cos(ph.a);
          const leverX=mount.dx-massX,leverY=mount.dy-massY;
          ph.av+=vec*t.torque*eff*dt*2.1;
          ph.av+=(leverX*fy-leverY*fx)*(32/massProperties.inertia)*dt;
          m.thrustLevel = clamp(Math.max(m.thrustLevel || 0, Math.abs(throttle) + Math.abs(vec) * 0.35), 0, 2.2);
          room.events.push({ type: "engine", moduleId: m.id, thrust: Math.abs(throttle) });
        }
      }
    }

    if (t.type === "turret") {
      const shoot = p.input.fire || p.input.space;
      m.aim = Number.isFinite(p.input.aim) ? p.input.aim : ph.a;
      if (shoot && m.cooldown <= 0) {
        const need = t.energyUse * (m.templateId === "turret_mk2" ? 0.9 : 1);
        if (ship.energy >= need) {
          ship.energy -= need;
          m.cooldown = t.fireInterval / clamp(eff, 0.55, 2.2);
          m.shotFlash = 1;
          m.recoil = 1;
          const dir = m.aim;
          const speed = t.shotSpeed * clamp(eff, 0.7, 2.3);
          const barrelLen=Math.max(...dims(t,m.rotation))*CELL*.42+12;
          const muzzle=moduleWorldPoint(room,m,barrelLen,dir);
          const crit=Math.random()<sensor;
          spawnProjectile(room, {
            friendly: true,
            x:muzzle.x,
            y:muzzle.y,
            vx:ph.vx-ph.av*muzzle.dy+Math.cos(dir)*speed,
            vy:ph.vy+ph.av*muzzle.dx+Math.sin(dir)*speed,
            damage: crit ? t.damage * 1.9 : t.damage,
            ttl: 2.2,
            radius: 4,
            color: crit ? "#f8f16f" : "#82f8ff",
          });
          const kick=4.5*clamp(54/massProperties.mass,.22,1.75);
          ph.vx-=Math.cos(dir)*kick;ph.vy-=Math.sin(dir)*kick;
          room.events.push({ type: "shot", moduleId:m.id,x:muzzle.x,y:muzzle.y,angle:dir,crit });
        }
      }
    }

    if (t.type === "shield") {
      const on = Boolean(p.input.space || p.input.rightMouse);
      if (on) {
        const drain = t.drain * dt;
        if (ship.energy >= drain) {
          ship.energy -= drain;
          room.shields.push({
            moduleId: m.id,
            x: ph.x,
            y: ph.y,
            radius: t.radius,
            width: t.width * clamp(eff, 0.5, 1.5),
            angle: Number.isFinite(p.input.aim) ? p.input.aim : ph.a,
            strength: t.strength * clamp(eff, 0.6, 1.8) * power,
          });
        }
      }
    }

    if (t.type === "repair" && p.input.repairHold) {
      const target = moduleById(room, p.repairTarget) || room.ship.modules.find((x) => x.status !== "online");
      if (target) {
        target.hp = clamp(target.hp + dt * 14 * placementEffect(room, m), 0, target.maxHp);
        if (target.hp > target.maxHp * 0.42 && !target.malfunction) target.status = "online";
      }
    }
  }

  const combat = room.phase === "combat";
  const drag = Math.pow(combat ? 0.9968 : 0.9, dt * 60);
  const adrag = Math.pow(combat ? 0.972 : 0.84, dt * 60);
  ph.vx *= drag;
  ph.vy *= drag;
  ph.av *= adrag;

  if (!combat) {
    const align = normalize(-ph.a);
    ph.av += align * dt * 4.2;
    if (Math.abs(align) < 0.01 && Math.abs(ph.av) < 0.03) {
      ph.a = 0;
      ph.av = 0;
    }
    if (Math.hypot(ph.vx, ph.vy) < 1.8) {
      ph.vx = 0;
      ph.vy = 0;
    }
  }

  ph.av = clamp(ph.av, -2.8, 2.8);
  const speed = Math.hypot(ph.vx, ph.vy);
  const maxSpeed = combat ? 430 : 180;
  if (speed > maxSpeed) {
    const k = maxSpeed / speed;
    ph.vx *= k;
    ph.vy *= k;
  }

  ph.x += ph.vx * dt;
  ph.y += ph.vy * dt;
  ph.a = normalize(ph.a + ph.av * dt);
}

function updateEnemies(room, dt) {
  for (let i = room.enemies.length - 1; i >= 0; i -= 1) {
    const e = room.enemies[i], t = ENEMIES[e.type];
    const dx = room.physics.x - e.x, dy = room.physics.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const tx = dx / dist, ty = dy / dist;
    const speedBase = Number.isFinite(e.speed) ? e.speed : t.speed;
    const fireInterval = Number.isFinite(e.fireInterval) ? e.fireInterval : t.fireInterval;
    const shotSpeed = Number.isFinite(e.shotSpeed) ? e.shotSpeed : t.shotSpeed;
    const damage = Number.isFinite(e.damage) ? e.damage : t.damage;
    const reward = Number.isFinite(e.reward) ? e.reward : t.reward;

    let ax = tx;
    let ay = ty;
    const mode = e.aiMode || "press";
    const phase = room.simTime + (e.aiPhase || 0);
    if (mode === "orbit") {
      const orbit = Math.sin(phase * 1.9) * 0.85;
      ax += -ty * orbit;
      ay += tx * orbit;
    } else if (mode === "dart") {
      e.dashCooldown = (e.dashCooldown || 0) - dt;
      if (e.dashCooldown <= 0 && dist < 520) {
        e.dashCooldown = rand(1.4, 3.1);
        const burst = rand(120, 230);
        e.vx += tx * burst;
        e.vy += ty * burst;
        room.events.push({ type: "enemy-dash", x: e.x, y: e.y });
      }
    } else if (mode === "boss") {
      const wave = Math.sin(phase * 0.85) * 0.45;
      ax += -ty * wave;
      ay += tx * wave;
      if (dist < 235) {
        ax -= tx * 0.95;
        ay -= ty * 0.95;
      }
    }
    const an = Math.hypot(ax, ay) || 1;
    ax /= an;
    ay /= an;

    const speed = speedBase * (1 + Math.min(room.wave, 10) * 0.05) * (e.elite ? 1.08 : 1);
    e.vx += ax * speed * dt * 0.65;
    e.vy += ay * speed * dt * 0.65;
    const drag = Math.pow(e.elite ? 0.995 : 0.993, dt * 60);
    e.vx *= drag;
    e.vy *= drag;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.a = Math.atan2(dy, dx);

    e.fireCooldown -= dt;
    const shootRange = e.elite ? 900 : 760;
    if (e.fireCooldown <= 0 && dist < shootRange) {
      e.fireCooldown = fireInterval * rand(0.8, 1.2);
      const base = Math.atan2(dy, dx);
      const spreads = e.elite ? [-0.16, 0, 0.16] : [rand(-0.2, 0.2)];
      spreads.forEach((off, idx) => {
        const a = base + off;
        spawnProjectile(room, {
          friendly: false,
          x: e.x + Math.cos(a) * (e.radius + 8),
          y: e.y + Math.sin(a) * (e.radius + 8),
          vx: e.vx + Math.cos(a) * shotSpeed,
          vy: e.vy + Math.sin(a) * shotSpeed,
          damage: e.elite && idx !== 1 ? damage * 0.72 : damage,
          ttl: 3.2,
          radius: e.radius >= 30 ? 7 : 5,
          color: e.elite ? "#ffb471" : "#ff8f72",
        });
      });
    }

    if (dist < 90) {
      room.ship.hull -= damage * dt * (e.elite ? 3.8 : 3.2);
      if (Math.random() < 0.06) room.events.push({ type: "ram", enemyId: e.id });
    }

    if (e.hp <= 0) {
      room.ship.credits += reward;
      if (Math.random() < (e.elite ? 0.85 : 0.28)) {
        room.drops.push({ id: `d_${Math.random().toString(36).slice(2,9)}`, kind: "credits", value: Math.round(reward * rand(0.9, e.elite ? 2.4 : 1.8)), x: e.x, y: e.y, ttl: 22 });
      }
      if (Math.random() < (e.elite ? 0.4 : 0.12)) {
        room.drops.push({ id: `d_${Math.random().toString(36).slice(2,9)}`, kind: "module", value: pick(Object.keys(MODULES)), x: e.x, y: e.y, ttl: 22 });
      }
      room.events.push({ type: "enemy-destroyed", enemyType: e.type, elite: Boolean(e.elite), x: e.x, y: e.y });
      room.enemies.splice(i, 1);
    }
  }
}

function hitEnemy(room, p) {
  for (let i = room.enemies.length - 1; i >= 0; i -= 1) {
    const e = room.enemies[i];
    if (Math.hypot(p.x - e.x, p.y - e.y) < e.radius + p.radius) {
      e.hp -= p.damage;
      room.events.push({ type: "enemy-hit", x: p.x, y: p.y });
      return true;
    }
  }
  return false;
}

function blockedByShield(room, p) {
  for (const s of room.shields) {
    const dx = p.x - s.x, dy = p.y - s.y;
    const dist = Math.hypot(dx, dy);
    if (Math.abs(dist - s.radius) > 16) continue;
    const da = Math.abs(normalize(Math.atan2(dy, dx) - s.angle));
    if (da <= s.width * 0.5 && Math.random() < clamp(s.strength, 0.3, 2.1)) {
      room.events.push({ type: "shield-hit", x: p.x, y: p.y });
      return true;
    }
  }
  return false;
}

function hitShip(room, p) {
  const l = worldToShip(room, p.x, p.y);
  const gx = Math.floor(l.x / CELL), gy = Math.floor(l.y / CELL);
  if (!room.ship.cells.has(ckey(gx, gy))) return false;
  const m = moduleAtCell(room, gx, gy);
  if (m) {
    m.hp = Math.max(0, m.hp - p.damage);
    room.events.push({ type: "module-hit", moduleId: m.id, x: p.x, y: p.y });
    if (m.hp <= 0) {
      m.status = "offline";
      breakModule(room, m, true);
      room.events.push({ type: "module-offline", moduleId: m.id });
    } else if (m.status === "online" && Math.random() < 0.16) {
      breakModule(room, m, false);
      room.events.push({ type: "malfunction", moduleId: m.id, kind: m.malfunction.kind });
    }
  } else {
    room.ship.hull -= p.damage * 0.72;
    room.events.push({ type: "hull-hit", x: p.x, y: p.y });
  }
  return true;
}

function updateProjectiles(room, dt) {
  for (let i = room.projectiles.length - 1; i >= 0; i -= 1) {
    const p = room.projectiles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.ttl -= dt;
    let rm = p.ttl <= 0;
    if (!rm && p.friendly) rm = hitEnemy(room, p);
    if (!rm && !p.friendly) rm = blockedByShield(room, p) || hitShip(room, p);
    if (rm) room.projectiles.splice(i, 1);
  }
}

function updateMalfunctions(room, dt) {
  if (room.phase === "combat") {
    room.malfunctionClock -= dt;
    if (room.malfunctionClock <= 0) {
      randomMalfunction(room);
      room.malfunctionClock = rand(7, 14);
    }
  }
  room.ship.modules.forEach((m) => {
    if (m.hp <= 0) m.status = "offline";
    if (m.status !== "online" && m.hp > m.maxHp * 0.55 && !m.malfunction) m.status = "online";
  });
}

function repairAction(room, playerId, action) {
  const p = playerById(room, playerId);
  if (!p || !p.moduleId) return { ok: false, message: "Take repair station first" };
  const station = moduleById(room, p.moduleId);
  if (!station || MODULES[station.templateId].type !== "repair") return { ok: false, message: "Need repair bay" };
  let target = moduleById(room, p.repairTarget);
  if (!target || target.status === "online") target = room.ship.modules.find((x) => x.status !== "online") || null;
  if (!target) return { ok: false, message: "No damaged module selected" };
  if (!target.malfunction) { target.malfunction = makeTask(); target.status = "malfunction"; }
  const task = target.malfunction;
  const bonus = clamp(placementEffect(room, station), 0.45, 1.8);
  let success = false;

  if (task.kind === "sequence") {
    const expected = task.sequence[task.index];
    if (action === expected) { task.index += 1; task.progress += 1; success = true; }
    else task.progress = Math.max(0, task.progress - 1);
  } else if (task.kind === "timing") {
    if (action === "hit") {
      const marker = Math.sin(task.phase * Math.PI * 2);
      if (Math.abs(marker) > 0.88) { task.progress += 1; success = true; }
      else task.progress = Math.max(0, task.progress - 1);
    }
  } else if (task.kind === "circuit") {
    if (/^toggle_[0-2]$/.test(action)) {
      const idx = Number(action.split("_")[1]);
      task.bits[idx] = task.bits[idx] ? 0 : 1;
      if (task.bits.every((v, i) => v === task.targetBits[i])) {
        task.progress += 1; success = true;
        task.bits = [Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1];
        task.targetBits = [Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1, Math.random() < 0.5 ? 0 : 1];
      }
    }
  }

  if (success) {
    target.hp = clamp(target.hp + target.maxHp * 0.11 * bonus, 0, target.maxHp);
    room.events.push({ type: "repair-step", moduleId: target.id, kind: task.kind });
  }
  if (task.progress >= task.target) {
    target.malfunction = null;
    target.status = "online";
    target.hp = clamp(Math.max(target.hp, target.maxHp * 0.62), 0, target.maxHp);
    room.events.push({ type: "repaired", moduleId: target.id });
  }
  return { ok: true };
}

function updateRoom(room, dt) {
  if (room.players.size === 0) {
    if (Date.now() - room.idleSince > ROOM_IDLE_MS) rooms.delete(room.code);
    return;
  }
  room.idleSince = Date.now();
  room.simTime += dt;

  room.phaseTime -= dt;
  if (room.phase === "shop" && room.phaseTime <= 0) {
    room.phase = "build";
    room.phaseTime = 0;
    room.events.push({ type: "phase", phase: "build" });
  }

  updateShip(room, dt);
  if (room.phase === "combat") {
    updateEnemies(room, dt);
    updateProjectiles(room, dt);
    updateDrops(room, dt);
    updateMalfunctions(room, dt);
    if(room.enemies.length===0)finishWave(room);
    else if(room.phaseTime<=0)shipDefeat(room,"timeout");
  } else {
    updateDrops(room, dt);
    updateMalfunctions(room, dt);
  }

  if(room.ship.hull<=0)shipDefeat(room,"hull");
  room.ship.hull = clamp(room.ship.hull, 0, room.ship.hullMax);
  room.ship.energy = clamp(room.ship.energy, 0, room.ship.energyMax);

  room.snapAcc += dt;
  room.snapAcc=0;
}

function serializeModule(room, m) {
  const t = MODULES[m.templateId];
  const [w, h] = dims(t, m.rotation);
  return {
    id: m.id, templateId: m.templateId, name: t.name, type: t.type,
    x: m.x, y: m.y, w, h, rotation: m.rotation,
    hp: m.hp, maxHp: m.maxHp, status: m.status, occupiedBy: m.occupiedBy, cooldown: m.cooldown,
    aim: m.aim,
    thrustLevel: m.thrustLevel || 0,
    shotFlash: m.shotFlash || 0,
    recoil: m.recoil || 0,
    placement: placementEffect(room, m),
    malfunction: m.malfunction ? {
      kind: m.malfunction.kind, progress: m.malfunction.progress, target: m.malfunction.target,
      index: m.malfunction.index, sequence: m.malfunction.sequence,
      bits: m.malfunction.bits, targetBits: m.malfunction.targetBits, phase: m.malfunction.phase,
    } : null,
    sprite: m.sprite || t.sprite,
  };
}

function serializeRoom(room) {
  const b = shipBounds(room.ship.cells);
  return {
    roomCode: room.code,
    phase: room.phase,
    phaseTime: room.phaseTime,
    wave: room.wave,
    currentMission: room.currentMission,
    ship: {
      credits: room.ship.credits,
      hull: room.ship.hull,
      hullMax: room.ship.hullMax,
      energy: room.ship.energy,
      energyMax: room.ship.energyMax,
      cells: [...room.ship.cells].map(parseKey),
      bounds: b,
      modules: room.ship.modules.map((m) => serializeModule(room, m)),
      inventoryModules: [...room.ship.inventoryModules],
      inventoryShapes: [...room.ship.inventoryShapes],
      massProperties:shipMassProperties(room),
    },
    physics: { ...room.physics },
    enemies: room.enemies.map((e) => ({ id: e.id, type: e.type, hp: e.hp, maxHp: e.maxHp, x: e.x, y: e.y, a: e.a, radius: e.radius, elite: Boolean(e.elite), sprite: e.sprite || ENEMIES[e.type].sprite })),
    projectiles: room.projectiles.map((p) => ({ id:p.id,x:p.x,y:p.y,vx:p.vx,vy:p.vy,radius:p.radius,friendly:p.friendly,color:p.color })),
    drops: room.drops.map((d) => ({ id: d.id, kind: d.kind, value: d.value, x: d.x, y: d.y, ttl: d.ttl })),
    shields: room.shields,
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, moduleId: p.moduleId, connected: p.connected, repairTarget: p.repairTarget })),
    offers: room.offers.map((o) => ({ ...o, label: o.kind === "module" ? (MODULES[o.ref]?.name || o.ref) : (SHAPES[o.ref]?.name || o.ref), description: o.kind === "module" ? `Module ${MODULES[o.ref]?.type || "unknown"}` : `Hull shape (${SHAPES[o.ref]?.cells?.length || 0} cells)` })),
    missionOptions: MISSION_OPTIONS.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
    })),
    moduleLibrary: MODULES,
    hullShapes: SHAPES,
    enemyTypes: ENEMIES,
    events: [...room.events],
    serverNow: Date.now(),
    cellSize: CELL,
  };
}

function emitState(room) {
  io.to(room.code).emit("state", serializeRoom(room));
}

io.on("connection", (socket) => {
  socket.on("joinRoom", (payload = {}) => {
    const code = sanitizeCode(payload.roomCode);
    const name = sanitizeName(payload.name);
    if (!rooms.has(code)) rooms.set(code, newRoom(code));
    const room = rooms.get(code);
    if (room.players.size >= MAX_PLAYERS) {
      socket.emit("joinError", { message: "Room is full (max 8 players)" });
      return;
    }

    if (socket.data.roomCode && rooms.has(socket.data.roomCode)) {
      const old = rooms.get(socket.data.roomCode);
      leaveSeat(old, socket.id);
      old.players.delete(socket.id);
      socket.leave(socket.data.roomCode);
    }

    room.players.set(socket.id, {
      id: socket.id,
      name,
      color: COLORS[room.players.size % COLORS.length],
      connected: true,
      moduleId: null,
      repairTarget: null,
      input: { up: false, down: false, left: false, right: false, space: false, fire: false, rightMouse: false, repairHold: false, aim: 0 },
    });

    socket.data.roomCode = code;
    socket.join(code);
    room.events.push({ type: "join", playerId: socket.id, name });
    socket.emit("joined", { playerId: socket.id, roomCode: code, maxPlayers: MAX_PLAYERS });
    emitState(room);
  });

  socket.on("playerInput", (src = {}) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    const p = playerById(room, socket.id);
    if (!p) return;
    p.input = {
      up: Boolean(src.up), down: Boolean(src.down), left: Boolean(src.left), right: Boolean(src.right),
      space: Boolean(src.space), fire: Boolean(src.fire), rightMouse: Boolean(src.rightMouse), repairHold: Boolean(src.repairHold),
      aim: Number.isFinite(src.aim) ? src.aim : p.input.aim,
    };
  });

  socket.on("occupyModule", (payload = {}) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    const r = slotModule(room, socket.id, payload.moduleId);
    if (!r.ok) socket.emit("actionError", { message: r.message });
    emitState(room);
  });

  socket.on("leaveModule", () => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    leaveSeat(room, socket.id);
    emitState(room);
  });

  socket.on("placeModule", (payload = {}) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    if (room.phase === "combat") return socket.emit("actionError", { message: "Cannot place modules in combat" });
    const r = installModule(room, payload.templateId, payload.x, payload.y, payload.rotation, true);
    if (!r.ok) socket.emit("actionError", { message: r.message });
    emitState(room);
  });

  socket.on("moveModule", (payload = {}) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    if (room.phase === "combat") return socket.emit("actionError", { message: "Cannot move modules in combat" });
    const m = moduleById(room, payload.moduleId);
    if (!m) return socket.emit("actionError", { message: "Module not found" });
    const b = { x: m.x, y: m.y, rotation: m.rotation };
    m.x = Math.round(payload.x); m.y = Math.round(payload.y);
    m.rotation = ((Math.round((payload.rotation || 0) / 90) * 90) % 360 + 360) % 360;
    const check = validatePlacement(room.ship, m, m.id);
    if (!check.ok) {
      m.x = b.x; m.y = b.y; m.rotation = b.rotation;
      socket.emit("actionError", { message: check.message });
    }
    emitState(room);
  });

  socket.on("removeModule", (payload = {}) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    if (room.phase === "combat") return socket.emit("actionError", { message: "Cannot remove modules in combat" });
    const idx = room.ship.modules.findIndex((m) => m.id === payload.moduleId);
    if (idx === -1) return socket.emit("actionError", { message: "Module not found" });
    const m = room.ship.modules[idx];
    room.players.forEach((p) => { if (p.moduleId === m.id) p.moduleId = null; });
    room.ship.modules.splice(idx, 1);
    room.ship.inventoryModules.push(m.templateId);
    room.events.push({ type: "module-removed", moduleId: m.id });
    emitState(room);
  });

  socket.on("addHullShape", (payload = {}) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    if (room.phase === "combat") return socket.emit("actionError", { message: "Cannot expand hull in combat" });
    const r = addHullShape(room, payload.shapeId, payload.x, payload.y, payload.rotation || 0, true);
    if (!r.ok) socket.emit("actionError", { message: r.message });
    emitState(room);
  });

  socket.on("buyItem", (payload = {}) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    if (room.phase !== "shop" && room.phase !== "build") return socket.emit("actionError", { message: "Shop locked in combat" });
    const idx = room.offers.findIndex((o) => o.id === payload.itemId);
    if (idx === -1) return socket.emit("actionError", { message: "Offer not found" });
    const o = room.offers[idx];
    if (room.ship.credits < o.cost) return socket.emit("actionError", { message: "Not enough credits" });
    room.ship.credits -= o.cost;
    if (o.kind === "module") room.ship.inventoryModules.push(o.ref);
    else if (o.kind === "shape") room.ship.inventoryShapes.push(o.ref);
    room.offers.splice(idx, 1);
    room.events.push({ type: "buy", itemId: o.id, kind: o.kind, ref: o.ref });
    emitState(room);
  });

  socket.on("startWave", (payload = {}) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    startWave(room, String(payload.missionId || "scout"));
    emitState(room);
  });

  socket.on("setRepairTarget", (payload = {}) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    const p = playerById(room, socket.id);
    if (!p) return;
    p.repairTarget = payload.moduleId || null;
    emitState(room);
  });

  socket.on("repairAction", (payload = {}) => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    const r = repairAction(room, socket.id, String(payload.action || ""));
    if (!r.ok && r.message) socket.emit("actionError", { message: r.message });
    emitState(room);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    leaveSeat(room, socket.id);
    room.players.delete(socket.id);
    room.events.push({ type: "leave", playerId: socket.id });
    if (room.players.size === 0) room.idleSince = Date.now();
    emitState(room);
  });
});


 let room=null;
 if(saved){room={...structuredClone(saved.room),players:new Map(saved.room.players),ship:{...structuredClone(saved.room.ship),cells:new Set(saved.room.ship.cells)}};rooms.set(room.code,room);}
 function socket(member){const handlers=new Map();const s={id:member.id,data:{roomCode:room?.code||null},on(e,f){handlers.set(e,f);},emit(event,payload){events.push({type:'legacy',to:member.id,payload:{event,payload}});},join(){},leave(){}};connection(s);return {s,send(e,p){const fn=handlers.get(e);if(!fn)throw Error('Неизвестная команда');fn(p);}};}
 function pack(r){const snapshot=serializeRoom(r);const data={...r,players:[...r.players],ship:{...r.ship,cells:[...r.ship.cells]},events:[]};return {room:structuredClone(data),snapshot,lastTick:Date.now()};}
 return {room,events,pack,socket,get(code){return rooms.get(code);},step(dt){for(let t=0;t<dt;t+=1/45)updateRoom(room,Math.min(1/45,dt-t));}};
}
const out=(c,r)=>({state:c.pack(r),events:[...c.events.filter(e=>e.payload.event!=='joined'),{type:'state',payload:{}}]});
export default {protocolVersion:1,
createRoom({player,payload}){const c=context(null),s=c.socket(player),code=crypto.randomUUID().slice(0,8).toUpperCase();s.send('joinRoom',{roomCode:code,name:payload?.name||player.name});return out(c,c.get(code));},
onJoin({state,player}){const c=context(state),r=c.room;if(!r.players.has(player.id)){if(r.players.size>=8)throw Error('Комната заполнена');c.socket(player).send('joinRoom',{roomCode:r.code,name:player.name});}return out(c,r);},
onLeave({state,player}){const c=context(state),r=c.room;c.socket(player).send('disconnect');return out(c,r);},
onMessage({state,player,payload:m}){const c=context(state),r=c.room;if(!r.players.has(player.id))throw Error('Игрок не в комнате');for(const p of r.players.values())if(Date.now()-(p.lastInputAt||0)>500)p.input={up:false,down:false,left:false,right:false,space:false,fire:false,rightMouse:false,repairHold:false,aim:p.input.aim||0};c.step(Math.min(.25,Math.max(0,(Date.now()-state.lastTick)/1000)));if(m?.event==='joinRoom'||m?.event==='disconnect')throw Error('Используйте комнату PocketNet');c.socket(player).send(m?.event,m?.payload);if(m?.event==='playerInput')r.players.get(player.id).lastInputAt=Date.now();return out(c,r);},
viewForPlayer({state}){return state.snapshot;}};
