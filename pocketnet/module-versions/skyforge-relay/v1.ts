function context(saved){
const TICK_RATE = 30;
const DT = 1 / TICK_RATE;

const WORLD_WIDTH = 2600;
const WORLD_HEIGHT = 1700;
const MAX_PLAYERS = 4;
const ROUND_TIME_SECONDS = 480;

const REACTOR_TARGET_ENERGY = 32;
const REACTOR_MAX_INTEGRITY = 100;
const INITIAL_ORB_COUNT = 24;

const TERMINAL_ACTIVATION_TIME = 2.3;

const ENEMY_TYPES = {
  scout: {
    radius: 32,
    maxHp: 2,
    speed: 190,
    touchDamage: 12,
    contactPush: 220,
  },
  brute: {
    radius: 44,
    maxHp: 6,
    speed: 120,
    touchDamage: 24,
    contactPush: 170,
  },
  sniper: {
    radius: 36,
    maxHp: 3,
    speed: 138,
    touchDamage: 16,
    contactPush: 180,
    shotCooldown: 1.95,
  },
  boss: {
    radius: 74,
    maxHp: 42,
    speed: 98,
    touchDamage: 30,
    contactPush: 240,
    shotCooldown: 1.25,
    summonCooldown: 6.2,
  },
};



const rooms = new Map();
const socketToRoom = new Map();
let entityCounter = 1;

function makeEntityId(prefix) {
  const id = `${prefix}_${entityCounter}`;
  entityCounter += 1;
  return id;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function normalize(vx, vy) {
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) {
    return { x: 0, y: 0 };
  }
  return { x: vx / len, y: vy / len };
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? createRoomCode() : code;
}

function sanitizeName(name) {
  if (typeof name !== "string") {
    return "Pilot";
  }
  const normalized = name.trim().slice(0, 18);
  return normalized || "Pilot";
}

function getTerminalLayouts() {
  return [
    { id: "T1", x: 420, y: 380, radius: 75, active: false, progress: 0, activatingBy: null },
    { id: "T2", x: WORLD_WIDTH - 420, y: 430, radius: 75, active: false, progress: 0, activatingBy: null },
    { id: "T3", x: WORLD_WIDTH / 2, y: WORLD_HEIGHT - 370, radius: 75, active: false, progress: 0, activatingBy: null },
  ];
}

function createProps() {
  const props = [];
  const propCount = 36;
  for (let i = 0; i < propCount; i += 1) {
    props.push({
      id: `prop_${i}`,
      type: Math.random() < 0.55 ? "crate" : "rock",
      x: randomRange(130, WORLD_WIDTH - 130),
      y: randomRange(130, WORLD_HEIGHT - 130),
      radius: randomRange(26, 56),
      rot: randomRange(0, Math.PI * 2),
      scale: randomRange(0.72, 1.25),
    });
  }
  return props;
}

function createRoomState(hostSocketId, hostName) {
  const code = createRoomCode();
  const room = {
    code,
    hostId: hostSocketId,
    mode: "lobby",
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    reactor: {
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT / 2,
      radius: 140,
      energy: 0,
      target: REACTOR_TARGET_ENERGY,
      integrity: REACTOR_MAX_INTEGRITY,
      maxIntegrity: REACTOR_MAX_INTEGRITY,
    },
    terminals: getTerminalLayouts(),
    timer: ROUND_TIME_SECONDS,
    players: new Map(),
    enemies: [],
    projectiles: [],
    orbs: [],
    pickups: [],
    beacons: [],
    props: createProps(),
    boss: {
      spawned: false,
      alive: false,
      enemyId: null,
    },
    difficultyScalar: 1,
    enemySpawnTimer: 2.7,
    pickupSpawnTimer: 8.5,
    reactorDamageSoundTimer: 0,
    events: [],
    nextEventId: 1,
    createdAt: Date.now(),
  };

  seedOrbs(room, INITIAL_ORB_COUNT);
  addPlayerToRoom(room, hostSocketId, hostName);
  rooms.set(code, room);
  return room;
}

function pickSpawnNearReactor(room) {
  return {
    x: clamp(room.reactor.x + randomRange(-260, 260), 80, room.world.width - 80),
    y: clamp(room.reactor.y + randomRange(-220, 220), 80, room.world.height - 80),
  };
}

function addPlayerToRoom(room, socketId, name) {
  const joinIndex = room.players.size;
  const spawn = pickSpawnNearReactor(room);
  const spriteKeys = ["player_blue", "player_orange", "player_green", "player_purple"];
  room.players.set(socketId, {
    id: socketId,
    name: sanitizeName(name),
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    faceX: 0,
    faceY: -1,
    radius: 34,
    baseSpeed: 285,
    health: 120,
    maxHealth: 120,
    shield: 40,
    maxShield: 80,
    invuln: 0,
    respawnTimer: 0,
    pulseCooldown: 0,
    dashCooldown: 0,
    shootCooldown: 0,
    beaconCooldown: 0,
    pulseQueued: false,
    dashQueued: false,
    interactQueued: false,
    carryingOrbId: null,
    speedBoostTimer: 0,
    score: 0,
    ready: false,
    spriteKey: spriteKeys[joinIndex % spriteKeys.length],
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      pulse: false,
      dash: false,
      shoot: false,
      interact: false,
    },
  });
}

function randomOrbPosition(room) {
  for (let i = 0; i < 50; i += 1) {
    const pos = {
      x: randomRange(120, room.world.width - 120),
      y: randomRange(120, room.world.height - 120),
    };
    if (distance(pos, room.reactor) < 260) {
      continue;
    }
    const tooCloseTerminal = room.terminals.some((terminal) => distance(pos, terminal) < 150);
    if (tooCloseTerminal) {
      continue;
    }
    return pos;
  }
  return {
    x: randomRange(120, room.world.width - 120),
    y: randomRange(120, room.world.height - 120),
  };
}

function spawnOrb(room, count = 1) {
  for (let i = 0; i < count; i += 1) {
    const pos = randomOrbPosition(room);
    room.orbs.push({
      id: makeEntityId("orb"),
      x: pos.x,
      y: pos.y,
      radius: 28,
    });
  }
}

function seedOrbs(room, count) {
  room.orbs = [];
  spawnOrb(room, count);
}

function randomPickupType() {
  const roll = Math.random();
  if (roll < 0.38) {
    return "shield";
  }
  if (roll < 0.72) {
    return "medkit";
  }
  return "overclock";
}

function spawnPickup(room, forcedType = null) {
  const type = forcedType || randomPickupType();
  const pos = randomOrbPosition(room);
  room.pickups.push({
    id: makeEntityId("pickup"),
    type,
    x: pos.x,
    y: pos.y,
    radius: 24,
    ttl: randomRange(24, 34),
  });
}

function getEnemySpawnPosition() {
  const side = Math.floor(Math.random() * 4);
  if (side === 0) {
    return { x: randomRange(80, WORLD_WIDTH - 80), y: 82 };
  }
  if (side === 1) {
    return { x: WORLD_WIDTH - 82, y: randomRange(80, WORLD_HEIGHT - 80) };
  }
  if (side === 2) {
    return { x: randomRange(80, WORLD_WIDTH - 80), y: WORLD_HEIGHT - 82 };
  }
  return { x: 82, y: randomRange(80, WORLD_HEIGHT - 80) };
}

function spawnEnemy(room, type, x = null, y = null) {
  const config = ENEMY_TYPES[type];
  if (!config) {
    return null;
  }
  const pos = x !== null && y !== null ? { x, y } : getEnemySpawnPosition();
  const enemy = {
    id: makeEntityId("enemy"),
    type,
    x: pos.x,
    y: pos.y,
    vx: 0,
    vy: 0,
    radius: config.radius,
    hp: config.maxHp,
    maxHp: config.maxHp,
    touchDamage: config.touchDamage,
    shotCooldown: config.shotCooldown || 0,
    summonCooldown: config.summonCooldown || 0,
    aiState: "idle",
  };
  room.enemies.push(enemy);
  return enemy;
}

function pushEvent(room, type, payload = {}) {
  room.events.push({
    id: room.nextEventId,
    type,
    at: Date.now(),
    ...payload,
  });
  room.nextEventId += 1;
  if (room.events.length > 180) {
    room.events.splice(0, room.events.length - 180);
  }
}

function resetPlayerForMatch(room, player) {
  const spawn = pickSpawnNearReactor(room);
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.faceX = 0;
  player.faceY = -1;
  player.health = player.maxHealth;
  player.shield = 45;
  player.invuln = 0.8;
  player.respawnTimer = 0;
  player.pulseCooldown = 0;
  player.dashCooldown = 0;
  player.shootCooldown = 0;
  player.beaconCooldown = 0;
  player.speedBoostTimer = 0;
  player.pulseQueued = false;
  player.dashQueued = false;
  player.interactQueued = false;
  player.carryingOrbId = null;
  player.score = 0;
  player.ready = false;
  player.input = {
    up: false,
    down: false,
    left: false,
    right: false,
    pulse: false,
    dash: false,
    shoot: false,
    interact: false,
  };
}

function startMatch(room) {
  room.mode = "playing";
  room.timer = ROUND_TIME_SECONDS;
  room.reactor.energy = 0;
  room.reactor.integrity = room.reactor.maxIntegrity;
  room.terminals = getTerminalLayouts();
  room.enemies = [];
  room.projectiles = [];
  room.pickups = [];
  room.beacons = [];
  room.boss = { spawned: false, alive: false, enemyId: null };
  room.enemySpawnTimer = 2.7;
  room.pickupSpawnTimer = 8.5;
  room.reactorDamageSoundTimer = 0;
  room.difficultyScalar = 1;
  room.events = [];
  room.nextEventId = 1;
  seedOrbs(room, INITIAL_ORB_COUNT);
  for (const player of room.players.values()) {
    resetPlayerForMatch(room, player);
  }
}

function endMatch(room, mode) {
  room.mode = mode;
  if (mode === "won") {
    pushEvent(room, "win", { x: room.reactor.x, y: room.reactor.y });
  } else if (mode === "lost") {
    pushEvent(room, "lose", { x: room.reactor.x, y: room.reactor.y });
  }
}

function allTerminalsActive(room) {
  return room.terminals.every((terminal) => terminal.active);
}

function dropCarriedOrb(room, player) {
  if (!player.carryingOrbId) {
    return;
  }
  room.orbs.push({
    id: player.carryingOrbId,
    x: clamp(player.x + randomRange(-28, 28), 80, room.world.width - 80),
    y: clamp(player.y + randomRange(-28, 28), 80, room.world.height - 80),
    radius: 28,
  });
  player.carryingOrbId = null;
}

function downPlayer(room, player) {
  dropCarriedOrb(room, player);
  player.health = 0;
  player.shield = Math.max(0, player.shield);
  player.respawnTimer = 4;
  player.vx = 0;
  player.vy = 0;
  pushEvent(room, "player_down", { x: player.x, y: player.y, sourceId: player.id });
}
function applyDamageToPlayer(room, player, amount) {
  if (player.respawnTimer > 0 || player.invuln > 0 || amount <= 0) {
    return;
  }
  let remaining = amount;
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, remaining);
    player.shield -= absorbed;
    remaining -= absorbed;
    if (absorbed > 0) {
      pushEvent(room, "shield_hit", { x: player.x, y: player.y, sourceId: player.id });
    }
  }
  if (remaining > 0) {
    player.health = Math.max(0, player.health - remaining);
    pushEvent(room, "hit", { x: player.x, y: player.y, sourceId: player.id });
  }
  player.invuln = 0.7;
  if (player.health <= 0) {
    downPlayer(room, player);
  }
}

function getPlayersArray(room) {
  return Array.from(room.players.values());
}

function getAlivePlayers(room) {
  return getPlayersArray(room).filter((player) => player.respawnTimer <= 0);
}

function nearestPlayer(room, enemy) {
  const activePlayers = getAlivePlayers(room);
  if (activePlayers.length === 0) {
    return null;
  }
  let nearest = activePlayers[0];
  let nearestDistance = distance(nearest, enemy);
  for (let i = 1; i < activePlayers.length; i += 1) {
    const candidate = activePlayers[i];
    const d = distance(candidate, enemy);
    if (d < nearestDistance) {
      nearest = candidate;
      nearestDistance = d;
    }
  }
  return nearest;
}

function spawnProjectile(room, payload) {
  room.projectiles.push({
    id: makeEntityId("proj"),
    ownerType: payload.ownerType,
    ownerId: payload.ownerId || null,
    type: payload.type,
    x: payload.x,
    y: payload.y,
    vx: payload.vx,
    vy: payload.vy,
    radius: payload.radius,
    damage: payload.damage,
    ttl: payload.ttl,
    color: payload.color || null,
  });
}

function applyDamageToEnemy(room, enemy, amount, sourcePlayerId = null) {
  if (enemy.hp <= 0 || amount <= 0) {
    return false;
  }
  enemy.hp -= amount;
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    pushEvent(room, "enemy_down", { x: enemy.x, y: enemy.y, enemyType: enemy.type, sourceId: sourcePlayerId });
    pushEvent(room, "explosion", { x: enemy.x, y: enemy.y, enemyType: enemy.type });
    if (sourcePlayerId) {
      const sourcePlayer = room.players.get(sourcePlayerId);
      if (sourcePlayer) {
        sourcePlayer.score += enemy.type === "boss" ? 20 : enemy.type === "brute" ? 4 : enemy.type === "sniper" ? 3 : 2;
      }
    }
    if (enemy.type === "boss") {
      room.boss.alive = false;
      pushEvent(room, "boss_down", { x: enemy.x, y: enemy.y });
    } else if (Math.random() < 0.18) {
      spawnPickup(room);
    }
    return true;
  }
  return false;
}

function castPulse(room, player) {
  const pulseRadius = 185;
  const pulseDamage = player.speedBoostTimer > 0 ? 2 : 1;
  const cooldown = player.speedBoostTimer > 0 ? 0.85 : 1.35;
  player.pulseCooldown = cooldown;
  pushEvent(room, "pulse", { x: player.x, y: player.y, sourceId: player.id });

  let defeated = 0;
  for (const enemy of room.enemies) {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > pulseRadius + enemy.radius) {
      continue;
    }
    const dir = normalize(dx, dy);
    enemy.vx += dir.x * 260;
    enemy.vy += dir.y * 260;
    if (applyDamageToEnemy(room, enemy, pulseDamage, player.id)) {
      defeated += 1;
    }
  }

  const shardCount = 10;
  for (let i = 0; i < shardCount; i += 1) {
    const angle = (Math.PI * 2 * i) / shardCount;
    spawnProjectile(room, {
      ownerType: "player",
      ownerId: player.id,
      type: "pulse_shard",
      x: player.x,
      y: player.y,
      vx: Math.cos(angle) * 430,
      vy: Math.sin(angle) * 430,
      radius: 12,
      damage: 1,
      ttl: 0.9,
      color: "cyan",
    });
  }

  if (defeated > 0) {
    player.score += defeated;
  }
}

function performDash(room, player) {
  let x = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
  let y = (player.input.down ? 1 : 0) - (player.input.up ? 1 : 0);
  if (Math.abs(x) < 0.001 && Math.abs(y) < 0.001) {
    x = player.faceX;
    y = player.faceY;
  }
  const dir = normalize(x, y);
  if (Math.abs(dir.x) < 0.001 && Math.abs(dir.y) < 0.001) {
    return;
  }
  const dashDistance = player.speedBoostTimer > 0 ? 270 : 220;
  player.x = clamp(player.x + dir.x * dashDistance, player.radius, WORLD_WIDTH - player.radius);
  player.y = clamp(player.y + dir.y * dashDistance, player.radius, WORLD_HEIGHT - player.radius);
  player.vx = dir.x * 380;
  player.vy = dir.y * 380;
  player.faceX = dir.x;
  player.faceY = dir.y;
  player.invuln = Math.max(player.invuln, 0.35);
  player.dashCooldown = player.speedBoostTimer > 0 ? 2.0 : 2.6;
  pushEvent(room, "dash", { x: player.x, y: player.y, sourceId: player.id });
}

function deployHealBeacon(room, player) {
  player.beaconCooldown = 11.5;
  room.beacons.push({
    id: makeEntityId("beacon"),
    ownerId: player.id,
    x: player.x,
    y: player.y,
    radius: 148,
    ttl: 10.5,
    pulseTimer: 0.6,
  });
  pushEvent(room, "beacon_place", { x: player.x, y: player.y, sourceId: player.id });
}

function shootPrimary(room, player) {
  const dir = normalize(player.faceX || 0, player.faceY || -1);
  if (Math.abs(dir.x) < 0.001 && Math.abs(dir.y) < 0.001) {
    return;
  }
  const speed = 560;
  const damage = player.speedBoostTimer > 0 ? 2 : 1.2;
  player.shootCooldown = player.speedBoostTimer > 0 ? 0.12 : 0.24;
  spawnProjectile(room, {
    ownerType: "player",
    ownerId: player.id,
    type: "player_shot",
    x: player.x + dir.x * (player.radius + 8),
    y: player.y + dir.y * (player.radius + 8),
    vx: dir.x * speed,
    vy: dir.y * speed,
    radius: 9,
    damage,
    ttl: 1.1,
    color: "cyan",
  });
  pushEvent(room, "player_shot", { x: player.x, y: player.y, sourceId: player.id });
}

function isNearInactiveTerminal(room, player) {
  return room.terminals.some(
    (terminal) =>
      !terminal.active && distance(player, terminal) <= player.radius + terminal.radius + 18,
  );
}

function updatePlayers(room, dt) {
  for (const player of room.players.values()) {
    player.pulseCooldown = Math.max(0, player.pulseCooldown - dt);
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    player.beaconCooldown = Math.max(0, player.beaconCooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.speedBoostTimer = Math.max(0, player.speedBoostTimer - dt);

    if (player.respawnTimer > 0) {
      player.respawnTimer = Math.max(0, player.respawnTimer - dt);
      if (player.respawnTimer === 0) {
        const spawn = pickSpawnNearReactor(room);
        player.x = spawn.x;
        player.y = spawn.y;
        player.health = player.maxHealth;
        player.shield = Math.max(player.shield, 30);
        player.invuln = 1.3;
        player.vx = 0;
        player.vy = 0;
        player.faceX = 0;
        player.faceY = -1;
      }
      player.pulseQueued = false;
      player.dashQueued = false;
      player.interactQueued = false;
      continue;
    }

    const inputX = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
    const inputY = (player.input.down ? 1 : 0) - (player.input.up ? 1 : 0);
    const moveDir = normalize(inputX, inputY);
    if (Math.abs(moveDir.x) > 0.001 || Math.abs(moveDir.y) > 0.001) {
      player.faceX = moveDir.x;
      player.faceY = moveDir.y;
    }

    const carryPenalty = player.carryingOrbId ? 0.82 : 1;
    const boost = player.speedBoostTimer > 0 ? 1.28 : 1;
    const speed = player.baseSpeed * carryPenalty * boost;
    player.vx = moveDir.x * speed;
    player.vy = moveDir.y * speed;
    player.x = clamp(player.x + player.vx * dt, player.radius, room.world.width - player.radius);
    player.y = clamp(player.y + player.vy * dt, player.radius, room.world.height - player.radius);

    if (player.dashQueued && player.dashCooldown <= 0) {
      performDash(room, player);
    }
    if (player.pulseQueued && player.pulseCooldown <= 0) {
      castPulse(room, player);
    }
    if (player.input.shoot && player.shootCooldown <= 0) {
      shootPrimary(room, player);
    }

    if (player.interactQueued && player.beaconCooldown <= 0 && !isNearInactiveTerminal(room, player)) {
      deployHealBeacon(room, player);
    }

    player.pulseQueued = false;
    player.dashQueued = false;
    player.interactQueued = false;
  }
}

function updateTerminals(room, dt) {
  for (const terminal of room.terminals) {
    if (terminal.active) {
      terminal.progress = 1;
      continue;
    }
    const nearby = getAlivePlayers(room).filter(
      (player) => distance(player, terminal) <= player.radius + terminal.radius + 18,
    );

    if (nearby.length === 0) {
      terminal.activatingBy = null;
      terminal.progress = Math.max(0, terminal.progress - dt * 0.45);
      continue;
    }

    nearby.sort((a, b) => distance(a, terminal) - distance(b, terminal));
    const activator = nearby[0];
    terminal.activatingBy = activator.id;
    const interactCount = nearby.filter((player) => player.input.interact).length;
    const baseRate = (dt / TERMINAL_ACTIVATION_TIME) * (0.55 + Math.min(nearby.length - 1, 2) * 0.25);
    const interactBonus = 1 + interactCount * 0.7;
    terminal.progress += baseRate * interactBonus;

    if (terminal.progress >= 1) {
      terminal.progress = 1;
      terminal.active = true;
      terminal.activatingBy = activator.id;
      pushEvent(room, "terminal_on", { x: terminal.x, y: terminal.y, terminalId: terminal.id, sourceId: activator.id });
      if (allTerminalsActive(room)) {
        pushEvent(room, "all_terminals", { x: room.reactor.x, y: room.reactor.y });
      }
    }
  }
}

function updateOrbInteractions(room) {
  for (const player of room.players.values()) {
    if (player.respawnTimer > 0 || player.carryingOrbId) {
      continue;
    }
    for (let i = 0; i < room.orbs.length; i += 1) {
      const orb = room.orbs[i];
      if (distance(player, orb) <= player.radius + orb.radius - 12) {
        player.carryingOrbId = orb.id;
        room.orbs.splice(i, 1);
        pushEvent(room, "collect", { x: player.x, y: player.y, sourceId: player.id });
        break;
      }
    }
  }

  for (const player of room.players.values()) {
    if (!player.carryingOrbId || player.respawnTimer > 0) {
      continue;
    }
    if (distance(player, room.reactor) <= room.reactor.radius + player.radius - 10) {
      player.carryingOrbId = null;
      player.score += 2;
      room.reactor.energy += 1;
      room.reactor.integrity = clamp(room.reactor.integrity + 2.8, 0, room.reactor.maxIntegrity);
      pushEvent(room, "deposit", { x: room.reactor.x, y: room.reactor.y, sourceId: player.id });
      if (room.reactor.energy < room.reactor.target + 8) {
        spawnOrb(room, 1);
      }
    }
  }
}

function updatePickups(room, dt) {
  room.pickupSpawnTimer -= dt;
  if (room.pickupSpawnTimer <= 0 && room.pickups.length < 6) {
    spawnPickup(room);
    room.pickupSpawnTimer = randomRange(7.5, 12);
  }

  const next = [];
  for (const pickup of room.pickups) {
    pickup.ttl -= dt;
    let consumed = false;
    for (const player of room.players.values()) {
      if (player.respawnTimer > 0) {
        continue;
      }
      if (distance(player, pickup) > player.radius + pickup.radius) {
        continue;
      }
      consumed = true;
      if (pickup.type === "shield") {
        player.shield = clamp(player.shield + 42, 0, player.maxShield);
      } else if (pickup.type === "medkit") {
        player.health = clamp(player.health + 38, 0, player.maxHealth);
      } else if (pickup.type === "overclock") {
        player.speedBoostTimer = Math.max(player.speedBoostTimer, 10.5);
        player.pulseCooldown = Math.max(0, player.pulseCooldown - 0.45);
      }
      player.score += 1;
      pushEvent(room, "pickup", { x: pickup.x, y: pickup.y, pickupType: pickup.type, sourceId: player.id });
      break;
    }
    if (!consumed && pickup.ttl > 0) {
      next.push(pickup);
    }
  }
  room.pickups = next;
}

function updateBeacons(room, dt) {
  const next = [];
  for (const beacon of room.beacons) {
    beacon.ttl -= dt;
    beacon.pulseTimer -= dt;
    if (beacon.pulseTimer <= 0) {
      beacon.pulseTimer = 0.65;
      pushEvent(room, "heal_pulse", { x: beacon.x, y: beacon.y, sourceId: beacon.ownerId });
    }

    for (const player of room.players.values()) {
      if (player.respawnTimer > 0) {
        continue;
      }
      if (distance(player, beacon) <= beacon.radius + player.radius) {
        player.health = clamp(player.health + dt * 12, 0, player.maxHealth);
        player.shield = clamp(player.shield + dt * 6, 0, player.maxShield);
      }
    }

    for (const enemy of room.enemies) {
      if (distance(enemy, beacon) <= beacon.radius + enemy.radius) {
        enemy.hp -= dt * 0.8;
      }
    }

    if (beacon.ttl > 0) {
      next.push(beacon);
    }
  }
  room.beacons = next;
}
function difficultyForRoom(room) {
  const elapsed = ROUND_TIME_SECONDS - room.timer;
  const terminalsActive = room.terminals.filter((terminal) => terminal.active).length;
  let scalar = 1 + elapsed / 90 + room.reactor.energy / 10 + terminalsActive * 0.8;
  if (room.boss.spawned) {
    scalar += 1.6;
  }
  return clamp(scalar, 1, 8.5);
}

function pickEnemySpawnType(room) {
  const d = room.difficultyScalar;
  const roll = Math.random();
  if (d > 5.4 && roll > 0.77) {
    return "sniper";
  }
  if (d > 4.2 && roll > 0.56) {
    return "brute";
  }
  if (roll < 0.53) {
    return "scout";
  }
  if (roll < 0.84) {
    return "brute";
  }
  return "sniper";
}

function enemyCapForRoom(room) {
  return 8 + Math.floor(room.difficultyScalar * 2) + room.players.size;
}

function spawnBossIfNeeded(room) {
  if (room.boss.spawned || !allTerminalsActive(room)) {
    return;
  }
  if (room.reactor.energy < room.reactor.target) {
    return;
  }
  const boss = spawnEnemy(room, "boss", room.reactor.x, 120);
  if (!boss) {
    return;
  }
  room.boss.spawned = true;
  room.boss.alive = true;
  room.boss.enemyId = boss.id;
  pushEvent(room, "boss_spawn", { x: boss.x, y: boss.y, enemyId: boss.id });
}

function updateEnemySpawning(room, dt) {
  room.enemySpawnTimer -= dt;
  if (room.enemySpawnTimer > 0) {
    return;
  }
  if (room.enemies.length >= enemyCapForRoom(room)) {
    room.enemySpawnTimer = 0.8;
    return;
  }

  const type = pickEnemySpawnType(room);
  spawnEnemy(room, type);
  if (room.difficultyScalar > 4.8 && Math.random() < 0.18) {
    spawnEnemy(room, "scout");
  }
  room.enemySpawnTimer = clamp(2.9 - room.difficultyScalar * 0.22, 0.42, 2.4);
}

function shootEnemyProjectile(room, enemy, targetX, targetY, speed, damage, ttl) {
  const dir = normalize(targetX - enemy.x, targetY - enemy.y);
  spawnProjectile(room, {
    ownerType: "enemy",
    ownerId: enemy.id,
    type: "enemy_plasma",
    x: enemy.x + dir.x * (enemy.radius + 8),
    y: enemy.y + dir.y * (enemy.radius + 8),
    vx: dir.x * speed,
    vy: dir.y * speed,
    radius: 12,
    damage,
    ttl,
    color: "red",
  });
  pushEvent(room, "enemy_shot", { x: enemy.x, y: enemy.y, enemyType: enemy.type });
}

function updateEnemies(room, dt) {
  const alivePlayers = getAlivePlayers(room);
  room.reactorDamageSoundTimer = Math.max(0, room.reactorDamageSoundTimer - dt);

  for (const enemy of room.enemies) {
    const config = ENEMY_TYPES[enemy.type];
    if (!config || enemy.hp <= 0) {
      continue;
    }

    let desiredX = room.reactor.x;
    let desiredY = room.reactor.y;
    const targetPlayer = nearestPlayer(room, enemy);
    if (targetPlayer) {
      desiredX = targetPlayer.x;
      desiredY = targetPlayer.y;
    }

    if (enemy.type === "sniper" && targetPlayer) {
      const dist = distance(enemy, targetPlayer);
      const toPlayer = normalize(targetPlayer.x - enemy.x, targetPlayer.y - enemy.y);
      if (dist < 360) {
        enemy.vx += -toPlayer.x * config.speed * 0.18;
        enemy.vy += -toPlayer.y * config.speed * 0.18;
      } else if (dist > 520) {
        enemy.vx += toPlayer.x * config.speed * 0.16;
        enemy.vy += toPlayer.y * config.speed * 0.16;
      } else {
        enemy.vx += -toPlayer.y * config.speed * 0.08;
        enemy.vy += toPlayer.x * config.speed * 0.08;
      }

      enemy.shotCooldown = Math.max(0, enemy.shotCooldown - dt);
      if (enemy.shotCooldown <= 0) {
        shootEnemyProjectile(room, enemy, targetPlayer.x, targetPlayer.y, 360, 18, 3.2);
        enemy.shotCooldown = ENEMY_TYPES.sniper.shotCooldown;
      }
    } else if (enemy.type === "boss") {
      const dir = normalize(desiredX - enemy.x, desiredY - enemy.y);
      enemy.vx += dir.x * config.speed * 0.1;
      enemy.vy += dir.y * config.speed * 0.1;

      enemy.shotCooldown = Math.max(0, enemy.shotCooldown - dt);
      if (enemy.shotCooldown <= 0) {
        const burst = 10;
        for (let i = 0; i < burst; i += 1) {
          const angle = (Math.PI * 2 * i) / burst;
          spawnProjectile(room, {
            ownerType: "enemy",
            ownerId: enemy.id,
            type: "boss_orb",
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle) * 330,
            vy: Math.sin(angle) * 330,
            radius: 13,
            damage: 14,
            ttl: 2.4,
            color: "orange",
          });
        }
        pushEvent(room, "enemy_shot", { x: enemy.x, y: enemy.y, enemyType: enemy.type });
        enemy.shotCooldown = ENEMY_TYPES.boss.shotCooldown;
      }

      enemy.summonCooldown = Math.max(0, enemy.summonCooldown - dt);
      if (enemy.summonCooldown <= 0) {
        spawnEnemy(room, "scout", clamp(enemy.x + randomRange(-90, 90), 80, WORLD_WIDTH - 80), clamp(enemy.y + randomRange(-90, 90), 80, WORLD_HEIGHT - 80));
        spawnEnemy(room, "scout", clamp(enemy.x + randomRange(-90, 90), 80, WORLD_WIDTH - 80), clamp(enemy.y + randomRange(-90, 90), 80, WORLD_HEIGHT - 80));
        enemy.summonCooldown = ENEMY_TYPES.boss.summonCooldown;
      }
    } else {
      const dir = normalize(desiredX - enemy.x, desiredY - enemy.y);
      const accel = enemy.type === "scout" ? 0.19 : 0.14;
      enemy.vx += dir.x * config.speed * accel;
      enemy.vy += dir.y * config.speed * accel;
    }

    enemy.vx *= 0.87;
    enemy.vy *= 0.87;
    const speed = Math.hypot(enemy.vx, enemy.vy);
    const maxSpeed = config.speed;
    if (speed > maxSpeed) {
      const n = normalize(enemy.vx, enemy.vy);
      enemy.vx = n.x * maxSpeed;
      enemy.vy = n.y * maxSpeed;
    }

    enemy.x = clamp(enemy.x + enemy.vx * dt, enemy.radius, WORLD_WIDTH - enemy.radius);
    enemy.y = clamp(enemy.y + enemy.vy * dt, enemy.radius, WORLD_HEIGHT - enemy.radius);

    for (const player of alivePlayers) {
      if (distance(enemy, player) <= enemy.radius + player.radius - 6) {
        applyDamageToPlayer(room, player, config.touchDamage);
        const push = normalize(player.x - enemy.x, player.y - enemy.y);
        player.vx += push.x * config.contactPush;
        player.vy += push.y * config.contactPush;
      }
    }

    if (distance(enemy, room.reactor) <= enemy.radius + room.reactor.radius - 10) {
      const reactorDamage = enemy.type === "boss" ? 9 : enemy.type === "brute" ? 4.2 : enemy.type === "sniper" ? 2.5 : 3.1;
      room.reactor.integrity = Math.max(0, room.reactor.integrity - reactorDamage * dt);
      if (room.reactorDamageSoundTimer <= 0) {
        pushEvent(room, "reactor_hit", { x: room.reactor.x, y: room.reactor.y });
        room.reactorDamageSoundTimer = 0.35;
      }
    }
  }
}

function updateProjectiles(room, dt) {
  const next = [];
  for (const projectile of room.projectiles) {
    projectile.ttl -= dt;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    const outside =
      projectile.x < -80 ||
      projectile.y < -80 ||
      projectile.x > WORLD_WIDTH + 80 ||
      projectile.y > WORLD_HEIGHT + 80;
    if (projectile.ttl <= 0 || outside) {
      continue;
    }

    let consumed = false;
    if (projectile.ownerType === "enemy") {
      for (const player of room.players.values()) {
        if (player.respawnTimer > 0) {
          continue;
        }
        if (distance(projectile, player) <= projectile.radius + player.radius - 4) {
          applyDamageToPlayer(room, player, projectile.damage);
          consumed = true;
          break;
        }
      }
    } else if (projectile.ownerType === "player") {
      for (const enemy of room.enemies) {
        if (enemy.hp <= 0) {
          continue;
        }
        if (distance(projectile, enemy) <= projectile.radius + enemy.radius - 4) {
          applyDamageToEnemy(room, enemy, projectile.damage, projectile.ownerId);
          consumed = true;
          break;
        }
      }
    }

    if (!consumed) {
      next.push(projectile);
    }
  }
  room.projectiles = next;
}

function cleanupDeadEntities(room) {
  room.enemies = room.enemies.filter((enemy) => enemy.hp > 0);
  if (room.boss.spawned) {
    room.boss.alive = room.enemies.some((enemy) => enemy.id === room.boss.enemyId);
  }
}

function checkWinLose(room) {
  if (room.timer <= 0 || room.reactor.integrity <= 0) {
    endMatch(room, "lost");
    return;
  }

  const terminalsOnline = allTerminalsActive(room);
  if (!room.boss.spawned) {
    if (terminalsOnline && room.reactor.energy >= room.reactor.target) {
      spawnBossIfNeeded(room);
    }
    return;
  }

  if (!room.boss.alive && terminalsOnline && room.reactor.energy >= room.reactor.target) {
    endMatch(room, "won");
  }
}

function updateRoom(room, dt) {
  if (room.mode !== "playing") {
    return;
  }

  room.timer = Math.max(0, room.timer - dt);
  room.difficultyScalar = difficultyForRoom(room);

  updatePlayers(room, dt);
  updateTerminals(room, dt);
  updateOrbInteractions(room);
  updatePickups(room, dt);
  updateBeacons(room, dt);
  spawnBossIfNeeded(room);
  updateEnemySpawning(room, dt);
  updateEnemies(room, dt);
  updateProjectiles(room, dt);
  cleanupDeadEntities(room);
  checkWinLose(room);
}

function getPlayerPublicState(player) {
  return {
    id: player.id,
    name: player.name,
    x: Number(player.x.toFixed(2)),
    y: Number(player.y.toFixed(2)),
    vx: Number(player.vx.toFixed(2)),
    vy: Number(player.vy.toFixed(2)),
    faceX: Number(player.faceX.toFixed(2)),
    faceY: Number(player.faceY.toFixed(2)),
    radius: player.radius,
    health: Number(player.health.toFixed(1)),
    maxHealth: player.maxHealth,
    shield: Number(player.shield.toFixed(1)),
    maxShield: player.maxShield,
    invuln: Number(player.invuln.toFixed(2)),
    respawnTimer: Number(player.respawnTimer.toFixed(2)),
    pulseCooldown: Number(player.pulseCooldown.toFixed(2)),
    dashCooldown: Number(player.dashCooldown.toFixed(2)),
    shootCooldown: Number(player.shootCooldown.toFixed(2)),
    beaconCooldown: Number(player.beaconCooldown.toFixed(2)),
    speedBoostTimer: Number(player.speedBoostTimer.toFixed(2)),
    carryingOrbId: player.carryingOrbId,
    score: player.score,
    ready: player.ready,
    spriteKey: player.spriteKey,
  };
}

function getSnapshot(room) {
  return {
    code: room.code,
    mode: room.mode,
    hostId: room.hostId,
    world: room.world,
    timer: Number(room.timer.toFixed(2)),
    difficulty: Number(room.difficultyScalar.toFixed(2)),
    reactor: {
      ...room.reactor,
      energy: Number(room.reactor.energy.toFixed(2)),
      integrity: Number(room.reactor.integrity.toFixed(2)),
    },
    objective: {
      terminalsActive: room.terminals.filter((terminal) => terminal.active).length,
      terminalsTotal: room.terminals.length,
      bossSpawned: room.boss.spawned,
      bossAlive: room.boss.alive,
      text: room.boss.spawned
        ? room.boss.alive
          ? "Destroy the command drone"
          : "Boss destroyed"
        : allTerminalsActive(room)
          ? "Charge the reactor to target"
          : "Activate all terminals",
    },
    terminals: room.terminals.map((terminal) => ({
      id: terminal.id,
      x: Number(terminal.x.toFixed(2)),
      y: Number(terminal.y.toFixed(2)),
      radius: terminal.radius,
      active: terminal.active,
      progress: Number(terminal.progress.toFixed(3)),
      activatingBy: terminal.activatingBy,
    })),
    players: Array.from(room.players.values()).map(getPlayerPublicState),
    enemies: room.enemies.map((enemy) => ({
      id: enemy.id,
      type: enemy.type,
      x: Number(enemy.x.toFixed(2)),
      y: Number(enemy.y.toFixed(2)),
      vx: Number(enemy.vx.toFixed(2)),
      vy: Number(enemy.vy.toFixed(2)),
      radius: enemy.radius,
      hp: Number(enemy.hp.toFixed(2)),
      maxHp: enemy.maxHp,
    })),
    projectiles: room.projectiles.map((projectile) => ({
      id: projectile.id,
      ownerType: projectile.ownerType,
      type: projectile.type,
      x: Number(projectile.x.toFixed(2)),
      y: Number(projectile.y.toFixed(2)),
      vx: Number(projectile.vx.toFixed(2)),
      vy: Number(projectile.vy.toFixed(2)),
      radius: projectile.radius,
      ttl: Number(projectile.ttl.toFixed(2)),
      color: projectile.color,
    })),
    orbs: room.orbs.map((orb) => ({
      id: orb.id,
      x: Number(orb.x.toFixed(2)),
      y: Number(orb.y.toFixed(2)),
      radius: orb.radius,
    })),
    pickups: room.pickups.map((pickup) => ({
      id: pickup.id,
      type: pickup.type,
      x: Number(pickup.x.toFixed(2)),
      y: Number(pickup.y.toFixed(2)),
      radius: pickup.radius,
      ttl: Number(pickup.ttl.toFixed(2)),
    })),
    beacons: room.beacons.map((beacon) => ({
      id: beacon.id,
      ownerId: beacon.ownerId,
      x: Number(beacon.x.toFixed(2)),
      y: Number(beacon.y.toFixed(2)),
      radius: beacon.radius,
      ttl: Number(beacon.ttl.toFixed(2)),
    })),
    props: room.props,
    events: room.events.slice(-60),
    now: Date.now(),
  };
}

function emitRoomState(room) {
  io.to(room.code).emit("state", getSnapshot(room));
}

function resetRoomToLobby(room) {
  room.mode = "lobby";
  room.timer = ROUND_TIME_SECONDS;
  room.reactor.energy = 0;
  room.reactor.integrity = room.reactor.maxIntegrity;
  room.terminals = getTerminalLayouts();
  room.enemies = [];
  room.projectiles = [];
  room.pickups = [];
  room.beacons = [];
  room.boss = { spawned: false, alive: false, enemyId: null };
  room.enemySpawnTimer = 2.7;
  room.pickupSpawnTimer = 8.5;
  room.reactorDamageSoundTimer = 0;
  room.difficultyScalar = 1;
  room.events = [];
  room.nextEventId = 1;
  seedOrbs(room, INITIAL_ORB_COUNT);
  for (const player of room.players.values()) {
    resetPlayerForMatch(room, player);
    player.ready = false;
  }
}

function parseInput(input) {
  return {
    up: Boolean(input?.up),
    down: Boolean(input?.down),
    left: Boolean(input?.left),
    right: Boolean(input?.right),
    pulse: Boolean(input?.pulse),
    dash: Boolean(input?.dash),
    shoot: Boolean(input?.shoot),
    interact: Boolean(input?.interact),
  };
}

 if(saved)entityCounter=saved.counter;
 const room=saved?{...saved.room,players:new Map(saved.room.players)}:null;
 const pack=r=>({room:{...r,players:[...r.players]},counter:entityCounter,lastTick:Date.now()});
 return {room,pack,create:createRoomState,add:addPlayerToRoom,start:startMatch,reset:resetRoomToLobby,drop:dropCarriedOrb,snapshot:getSnapshot,
  step(dt){for(let t=0;t<dt;t+=DT)updateRoom(room,Math.min(DT,dt-t));},
  input(player,payload){const next=parseInput(payload);if(next.pulse&&!player.input.pulse)player.pulseQueued=true;if(next.dash&&!player.input.dash)player.dashQueued=true;if(next.interact&&!player.input.interact)player.interactQueued=true;player.input=next;player.lastInputAt=Date.now();}
 };
}
const out=state=>({state,events:[{type:'state',payload:{}}]});
export default {protocolVersion:1,
createRoom({player,payload}){const c=context(null);return out(c.pack(c.create(player.id,payload?.name||player.name)));},
onJoin({state,player}){const c=context(structuredClone(state)),r=c.room;if(!r.players.has(player.id)){if(r.players.size>=4||r.mode==='playing')throw Error('Комната заполнена или матч уже начат');c.add(r,player.id,player.name);}return out(c.pack(r));},
onLeave({state,player}){const c=context(structuredClone(state)),r=c.room,p=r.players.get(player.id);if(p)c.drop(r,p);r.players.delete(player.id);if(r.hostId===player.id)r.hostId=r.players.keys().next().value||null;return out(c.pack(r));},
onMessage({state,player,payload:m}){const c=context(structuredClone(state)),r=c.room,p=r.players.get(player.id);if(!p)throw Error('Игрок не в комнате');
 for(const v of r.players.values())if(Date.now()-(v.lastInputAt||0)>500)v.input={up:false,down:false,left:false,right:false,shoot:false};
 c.step(Math.min(.25,Math.max(0,(Date.now()-state.lastTick)/1000)));
 const event=m?.event,payload=m?.payload||{};
 if(event==='input')c.input(p,payload);
 else if(event==='set_ready'){if(r.mode==='lobby')p.ready=!!payload.ready;}
 else if(event==='start_game'){if(r.hostId!==player.id||r.mode!=='lobby'||![...r.players.values()].every(v=>v.ready||v.id===r.hostId))throw Error('Не все игроки готовы');c.start(r);}
 else if(event==='restart_game'){if(r.hostId!==player.id)throw Error('Только создатель может перезапустить матч');c.reset(r);}
 else if(event!=='sync')throw Error('Неизвестная команда');
 return out(c.pack(r));
},viewForPlayer({state}){const c=context(state);return {...c.snapshot(c.room),phase:c.room.mode};}};
