
/* global io */

const socket = globalThis.skySocket;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const menuPanel = document.getElementById("menuPanel");
const menuMessage = document.getElementById("menuMessage");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const readyBtn = document.getElementById("readyBtn");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const backToLobbyBtn = document.getElementById("backToLobbyBtn");

const topHud = document.getElementById("topHud");
const sideHud = document.getElementById("sideHud");
const roomLabel = document.getElementById("roomLabel");
const energyLabel = document.getElementById("energyLabel");
const integrityLabel = document.getElementById("integrityLabel");
const timeLabel = document.getElementById("timeLabel");
const phaseLabel = document.getElementById("phaseLabel");
const objectiveLabel = document.getElementById("objectiveLabel");
const playersList = document.getElementById("playersList");
const hostControls = document.getElementById("hostControls");
const pulseCdLabel = document.getElementById("pulseCdLabel");
const dashCdLabel = document.getElementById("dashCdLabel");
const beaconCdLabel = document.getElementById("beaconCdLabel");
const boostLabel = document.getElementById("boostLabel");
const endPanel = document.getElementById("endPanel");
const endTitle = document.getElementById("endTitle");
const endMessage = document.getElementById("endMessage");

const IMAGE_PATHS = {
  player_blue: "./assets/sprites/player_blue.png",
  player_orange: "./assets/sprites/player_orange.png",
  player_green: "./assets/sprites/player_green.png",
  player_purple: "./assets/sprites/player_purple.png",
  enemy_scout: "./assets/sprites/enemy_scout.png",
  enemy_brute: "./assets/sprites/enemy_brute.png",
  enemy_sniper: "./assets/sprites/enemy_sniper.png",
  enemy_boss: "./assets/sprites/enemy_boss.png",
  energy_orb: "./assets/sprites/energy_orb.png",
  reactor_core: "./assets/sprites/reactor_core.png",
  pulse_blast: "./assets/sprites/pulse_blast.png",
  terminal_beacon: "./assets/sprites/terminal_beacon.png",
  heal_beacon: "./assets/sprites/heal_beacon.png",
  pickup_shield: "./assets/sprites/pickup_shield.png",
  pickup_medkit: "./assets/sprites/pickup_medkit.png",
  pickup_overclock: "./assets/sprites/pickup_overclock.png",
  proj_enemy: "./assets/sprites/proj_enemy.png",
  proj_player: "./assets/sprites/proj_player.png",
  prop_crate: "./assets/sprites/prop_crate.png",
  prop_rock: "./assets/sprites/prop_rock.png",
  tile_floor: "./assets/sprites/tile_floor.png",
  bg_nebula: "./assets/sprites/bg_nebula.png",
  fx_explosion: "./assets/sprites/fx_explosion.png",
};

const SOUND_PATHS = {
  pulse: "./assets/sounds/pulse.wav",
  collect: "./assets/sounds/collect.wav",
  deposit: "./assets/sounds/deposit.wav",
  hit: "./assets/sounds/hit.wav",
  win: "./assets/sounds/win.wav",
  lose: "./assets/sounds/lose.wav",
  dash: "./assets/sounds/dash.wav",
  heal: "./assets/sounds/heal.wav",
  enemy_shot: "./assets/sounds/enemy_shot.wav",
  pickup: "./assets/sounds/pickup.wav",
  terminal: "./assets/sounds/terminal.wav",
  shield: "./assets/sounds/shield.wav",
  explosion: "./assets/sounds/explosion.wav",
  boss_alert: "./assets/sounds/boss_alert.wav",
};

const inputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  pulse: false,
  dash: false,
  shoot: false,
  interact: false,
};

const state = {
  roomCode: null,
  playerId: null,
  snapshot: null,
  ready: false,
  images: {},
  sounds: {},
  particles: [],
  pulses: [],
  dashTrails: [],
  floatingTexts: [],
  camera: { x: 0, y: 0 },
  seenEventId: 0,
  muted: false,
  shake: 0,
  loaded: false,
  lastTickAt: performance.now(),
  lastHealSoundAt: 0,
  nebulaClouds: [],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function showMenuMessage(message, isError = true) {
  menuMessage.textContent = message || "";
  menuMessage.style.color = isError ? "#ff5a74" : "#3ad5d0";
}

function setUiVisibility(joined) {
  topHud.classList.toggle("hidden", !joined);
  sideHud.classList.toggle("hidden", !joined);
  menuPanel.classList.toggle("hidden", joined);
}

function loadImageSafe(path) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

async function loadAssets() {
  const imageEntries = await Promise.all(
    Object.entries(IMAGE_PATHS).map(async ([key, path]) => [key, await loadImageSafe(path)]),
  );
  state.images = Object.fromEntries(imageEntries);

  const sounds = {};
  for (const [key, path] of Object.entries(SOUND_PATHS)) {
    const audio = new Audio(path);
    audio.preload = "auto";
    sounds[key] = audio;
  }
  state.sounds = sounds;
  state.loaded = true;
}

function playSound(name, volume = 0.6) {
  if (state.muted) {
    return;
  }
  const source = state.sounds[name];
  if (!source) {
    return;
  }
  const instance = source.cloneNode();
  instance.volume = clamp(volume, 0, 1);
  instance.play().catch(() => {});
}

function formatTime(secondsLeft) {
  const whole = Math.max(0, Math.ceil(secondsLeft));
  const minutes = Math.floor(whole / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (whole % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function cdLabel(seconds) {
  if (seconds <= 0.05) {
    return "ready";
  }
  return `${seconds.toFixed(1)}s`;
}

function getLocalPlayer(snapshot = state.snapshot) {
  if (!snapshot || !state.playerId) {
    return null;
  }
  return snapshot.players.find((player) => player.id === state.playerId) || null;
}

function generateNebulaClouds() {
  state.nebulaClouds = [];
  const count = 14;
  for (let i = 0; i < count; i += 1) {
    state.nebulaClouds.push({
      x: Math.random(),
      y: Math.random(),
      scale: 0.7 + Math.random() * 1.3,
      alpha: 0.08 + Math.random() * 0.2,
      rot: Math.random() * Math.PI * 2,
    });
  }
}
function syncHud() {
  if (!state.snapshot) {
    return;
  }

  const snapshot = state.snapshot;
  const local = getLocalPlayer(snapshot);
  if (local) {
    state.ready = Boolean(local.ready);
  }

  roomLabel.textContent = snapshot.code || "-";
  energyLabel.textContent = `${Math.floor(snapshot.reactor.energy)} / ${snapshot.reactor.target}`;
  integrityLabel.textContent = `${Math.max(0, Math.ceil(snapshot.reactor.integrity))}%`;
  timeLabel.textContent = formatTime(snapshot.timer);
  objectiveLabel.textContent = snapshot.objective?.text || "-";

  const phaseMap = {
    lobby: "Лобби",
    playing: "Миссия",
    won: "Победа",
    lost: "Поражение",
  };
  phaseLabel.textContent = phaseMap[snapshot.mode] || snapshot.mode;
  document.body.dataset.phase=snapshot.mode;

  const isHost = snapshot.hostId === state.playerId;
  hostControls.classList.toggle("hidden", !isHost);
  readyBtn.disabled = snapshot.mode !== "lobby";

  const lobbyPlayers = snapshot.players || [];
  const allReady = lobbyPlayers.every((p) => p.ready || p.id === snapshot.hostId);
  startBtn.disabled = snapshot.mode !== "lobby" || !allReady;
  readyBtn.textContent = state.ready ? "Не готов" : "Готов";

  if (local) {
    pulseCdLabel.textContent = cdLabel(local.pulseCooldown);
    dashCdLabel.textContent = cdLabel(local.dashCooldown);
    beaconCdLabel.textContent = cdLabel(local.beaconCooldown);
    boostLabel.textContent = local.speedBoostTimer > 0 ? `${local.speedBoostTimer.toFixed(1)}s` : "0.0s";
  } else {
    pulseCdLabel.textContent = "-";
    dashCdLabel.textContent = "-";
    beaconCdLabel.textContent = "-";
    boostLabel.textContent = "-";
  }

  playersList.innerHTML = "";
  snapshot.players
    .slice()
    .sort((a, b) => b.score - a.score)
    .forEach((player) => {
      const li = document.createElement("li");
      const marker = player.id === state.playerId ? " (ты)" : "";
      const carrying = player.carryingOrbId ? " | несет сферу" : "";
      const status =
        player.respawnTimer > 0
          ? `Респавн: ${player.respawnTimer.toFixed(1)}s`
          : `HP ${Math.max(0, Math.ceil(player.health))}/${player.maxHealth} | SH ${Math.ceil(player.shield)}/${player.maxShield}`;
      const readyTag = snapshot.mode === "lobby" ? ` | ${player.ready ? "готов" : "ожидает"}` : "";
      li.innerHTML = `<strong>${player.name}${marker}</strong><small>${status}${carrying}${readyTag} | Очки: ${player.score}</small>`;
      if (player.id === snapshot.hostId) {
        li.style.borderColor = "rgba(255, 176, 70, 0.52)";
      }
      if (player.id === state.playerId) {
        li.style.boxShadow = "inset 0 0 0 1px rgba(58,213,208,0.35)";
      }
      playersList.appendChild(li);
    });

  const ended = snapshot.mode === "won" || snapshot.mode === "lost";
  endPanel.classList.toggle("hidden", !ended);
  if (ended) {
    if (snapshot.mode === "won") {
      endTitle.textContent = "Победа экипажа";
      endMessage.textContent = "Терминалы синхронизированы, босс уничтожен, реактор стабилен.";
    } else {
      endTitle.textContent = "Миссия сорвана";
      if (snapshot.reactor.integrity <= 0) {
        endMessage.textContent = "Реактор разрушен под атакой противника.";
      } else {
        endMessage.textContent = "Время миссии истекло раньше выполнения всех задач.";
      }
    }
  }
}

function addParticles(x, y, color, count = 14, speed = 180, lifeMin = 0.35, lifeMax = 0.8) {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.8;
    const velocity = speed * (0.35 + Math.random() * 0.9);
    const maxLife = lifeMin + Math.random() * (lifeMax - lifeMin);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: maxLife,
      maxLife,
      size: 2 + Math.random() * 4,
      color,
      drag: 0.93 + Math.random() * 0.04,
    });
  }
}

function addFloatingText(text, x, y, color = "#dff4ff") {
  state.floatingTexts.push({
    text,
    x,
    y,
    vy: -28,
    life: 0.8,
    maxLife: 0.8,
    color,
  });
}

function handleSnapshotEvents(snapshot) {
  for (const event of snapshot.events) {
    if (event.id <= state.seenEventId) {
      continue;
    }
    state.seenEventId = event.id;

    if (event.type === "pulse") {
      state.pulses.push({ x: event.x, y: event.y, age: 0, ttl: 0.4 });
      playSound("pulse", 0.48);
      addParticles(event.x, event.y, "rgba(106,232,255,0.95)", 18, 170);
    } else if (event.type === "dash") {
      state.dashTrails.push({ x: event.x, y: event.y, age: 0, ttl: 0.35 });
      playSound("dash", 0.45);
      addParticles(event.x, event.y, "rgba(145,220,255,0.82)", 10, 120);
    } else if (event.type === "collect") {
      playSound("collect", 0.54);
      addParticles(event.x, event.y, "rgba(86,238,242,0.88)", 12, 130);
    } else if (event.type === "deposit") {
      playSound("deposit", 0.58);
      addParticles(event.x, event.y, "rgba(255,200,110,0.92)", 18, 180);
    } else if (event.type === "hit") {
      playSound("hit", 0.55);
      addParticles(event.x, event.y, "rgba(255,110,130,0.9)", 16, 180);
      state.shake = Math.min(20, state.shake + 7);
    } else if (event.type === "shield_hit") {
      playSound("shield", 0.36);
      addParticles(event.x, event.y, "rgba(116,220,255,0.8)", 8, 100);
    } else if (event.type === "pickup") {
      playSound("pickup", 0.48);
      const colors = {
        shield: "rgba(112,212,255,0.9)",
        medkit: "rgba(130,245,156,0.9)",
        overclock: "rgba(255,218,104,0.95)",
      };
      addParticles(event.x, event.y, colors[event.pickupType] || "rgba(255,255,255,0.9)", 14, 135);
      if (event.pickupType === "shield") {
        addFloatingText("+shield", event.x, event.y, "#9ce6ff");
      } else if (event.pickupType === "medkit") {
        addFloatingText("+hp", event.x, event.y, "#98ffbe");
      } else {
        addFloatingText("overclock", event.x, event.y, "#ffe083");
      }
    } else if (event.type === "terminal_on") {
      playSound("terminal", 0.55);
      addParticles(event.x, event.y, "rgba(80,245,221,0.92)", 24, 190);
      addFloatingText("terminal online", event.x, event.y, "#80f5dd");
    } else if (event.type === "all_terminals") {
      playSound("terminal", 0.66);
      addFloatingText("all terminals synced", event.x, event.y - 20, "#80f5dd");
    } else if (event.type === "beacon_place") {
      playSound("heal", 0.46);
      addParticles(event.x, event.y, "rgba(112,255,207,0.86)", 18, 140);
    } else if (event.type === "heal_pulse") {
      const now = performance.now();
      if (now - state.lastHealSoundAt > 450) {
        playSound("heal", 0.22);
        state.lastHealSoundAt = now;
      }
      addParticles(event.x, event.y, "rgba(124,255,214,0.6)", 8, 80, 0.2, 0.45);
    } else if (event.type === "player_shot") {
      playSound("pulse", 0.24);
      addParticles(event.x, event.y, "rgba(110,240,255,0.6)", 5, 70, 0.15, 0.28);
    } else if (event.type === "enemy_shot") {
      playSound("enemy_shot", event.enemyType === "boss" ? 0.56 : 0.42);
    } else if (event.type === "enemy_down" || event.type === "explosion") {
      playSound("explosion", 0.46);
      addParticles(event.x, event.y, "rgba(255,154,118,0.92)", 26, 210);
      state.shake = Math.min(18, state.shake + 4);
    } else if (event.type === "boss_spawn") {
      playSound("boss_alert", 0.72);
      addParticles(event.x, event.y, "rgba(255,145,98,0.96)", 36, 210);
      addFloatingText("BOSS INBOUND", event.x, event.y, "#ffb499");
      state.shake = Math.min(24, state.shake + 10);
    } else if (event.type === "reactor_hit") {
      playSound("hit", 0.35);
      state.shake = Math.min(16, state.shake + 3);
    } else if (event.type === "win") {
      playSound("win", 0.64);
      addParticles(event.x, event.y, "rgba(255,220,120,0.98)", 50, 260, 0.5, 1.2);
    } else if (event.type === "lose") {
      playSound("lose", 0.6);
      addParticles(event.x, event.y, "rgba(255,120,150,0.92)", 34, 190, 0.45, 1.0);
    }
  }
}

function toScreen(worldX, worldY, cameraX, cameraY, viewWidth, viewHeight) {
  return {
    x: worldX - cameraX + viewWidth / 2,
    y: worldY - cameraY + viewHeight / 2,
  };
}
function drawSprite(img, x, y, size, alpha = 1) {
  if (!img) {
    return;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  ctx.restore();
}

function drawSpriteRotated(img, x, y, size, rotation = 0, alpha = 1) {
  if (!img) {
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawBackground(snapshot, cameraX, cameraY, viewWidth, viewHeight, t) {
  const gradient = ctx.createLinearGradient(0, 0, viewWidth, viewHeight);
  gradient.addColorStop(0, "#102238");
  gradient.addColorStop(0.5, "#0a1626");
  gradient.addColorStop(1, "#261d31");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  ctx.fillStyle = "rgba(170, 215, 255, 0.25)";
  for (let i = 0; i < 180; i += 1) {
    const x = ((i * 193 + t * 18) % (viewWidth + 120)) - 60;
    const y = ((i * 127 + t * 9) % (viewHeight + 120)) - 60;
    ctx.fillRect(x, y, 1.8, 1.8);
  }

  const nebulaImg = state.images.bg_nebula;
  if (nebulaImg) {
    for (const cloud of state.nebulaClouds) {
      const worldX = cloud.x * snapshot.world.width;
      const worldY = cloud.y * snapshot.world.height;
      const p = toScreen(worldX, worldY, cameraX * 0.4, cameraY * 0.4, viewWidth, viewHeight);
      const size = 460 * cloud.scale;
      drawSpriteRotated(nebulaImg, p.x, p.y, size, cloud.rot + t * 0.02, cloud.alpha);
    }
  }

  const tile = state.images.tile_floor;
  if (tile) {
    const tileSize = 220;
    const ox = ((-cameraX % tileSize) + tileSize) % tileSize;
    const oy = ((-cameraY % tileSize) + tileSize) % tileSize;
    ctx.save();
    ctx.globalAlpha = 0.32;
    for (let x = ox - tileSize; x < viewWidth + tileSize; x += tileSize) {
      for (let y = oy - tileSize; y < viewHeight + tileSize; y += tileSize) {
        ctx.drawImage(tile, x, y, tileSize, tileSize);
      }
    }
    ctx.restore();
  }

  const gridSpacing = 96;
  const offsetX = (-cameraX * 0.65) % gridSpacing;
  const offsetY = (-cameraY * 0.65) % gridSpacing;
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = "#2f5679";
  ctx.lineWidth = 1;
  for (let x = offsetX - gridSpacing; x < viewWidth + gridSpacing; x += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, viewHeight);
    ctx.stroke();
  }
  for (let y = offsetY - gridSpacing; y < viewHeight + gridSpacing; y += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(viewWidth, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProps(snapshot, cameraX, cameraY, viewWidth, viewHeight) {
  for (const prop of snapshot.props || []) {
    const p = toScreen(prop.x, prop.y, cameraX, cameraY, viewWidth, viewHeight);
    const sprite = prop.type === "crate" ? state.images.prop_crate : state.images.prop_rock;
    const size = prop.radius * 2.1 * (prop.scale || 1);
    drawSpriteRotated(sprite, p.x, p.y, size, prop.rot || 0, 0.92);
  }
}

function drawReactor(snapshot, cameraX, cameraY, viewWidth, viewHeight, t) {
  const p = toScreen(snapshot.reactor.x, snapshot.reactor.y, cameraX, cameraY, viewWidth, viewHeight);
  const sprite = state.images.reactor_core;
  const size = snapshot.reactor.radius * 2.65;
  drawSprite(sprite, p.x, p.y, size, 0.99);

  const energyRatio = clamp(snapshot.reactor.energy / snapshot.reactor.target, 0, 1);
  const integrityRatio = clamp(snapshot.reactor.integrity / snapshot.reactor.maxIntegrity, 0, 1);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = `rgba(85,255,216,${0.15 + 0.4 * energyRatio})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, snapshot.reactor.radius * (1 + energyRatio * 0.25 + Math.sin(t * 3) * 0.04), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(255,188,102,0.8)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(p.x, p.y, snapshot.reactor.radius * 0.98, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * energyRatio);
  ctx.stroke();

  ctx.strokeStyle = integrityRatio > 0.35 ? "rgba(112,235,174,0.85)" : "rgba(255,110,130,0.9)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, snapshot.reactor.radius * 1.16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * integrityRatio);
  ctx.stroke();

  if (integrityRatio < 0.45) {
    const crackAlpha = 0.25 + (0.45 - integrityRatio) * 0.7;
    ctx.strokeStyle = `rgba(255,90,122,${crackAlpha})`;
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i += 1) {
      const angle = (Math.PI * 2 * i) / 5 + t * 0.15;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(angle) * snapshot.reactor.radius * 0.9, p.y + Math.sin(angle) * snapshot.reactor.radius * 0.9);
      ctx.stroke();
    }
  }
}

function drawTerminals(snapshot, cameraX, cameraY, viewWidth, viewHeight, t) {
  const terminalSprite = state.images.terminal_beacon;
  for (const terminal of snapshot.terminals || []) {
    const p = toScreen(terminal.x, terminal.y, cameraX, cameraY, viewWidth, viewHeight);
    const size = terminal.radius * 2.2;
    drawSpriteRotated(terminalSprite, p.x, p.y, size, t * 0.12, 0.96);

    ctx.save();
    ctx.strokeStyle = terminal.active ? "rgba(102,240,214,0.92)" : "rgba(138,176,214,0.65)";
    ctx.lineWidth = terminal.active ? 6 : 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, terminal.radius * (1.03 + Math.sin(t * 2 + terminal.x * 0.01) * 0.03), 0, Math.PI * 2);
    ctx.stroke();

    if (!terminal.active) {
      const progress = clamp(terminal.progress, 0, 1);
      ctx.strokeStyle = "rgba(255,196,112,0.92)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, terminal.radius * 1.17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawOrbs(snapshot, cameraX, cameraY, viewWidth, viewHeight, t) {
  const orbImg = state.images.energy_orb;
  for (const orb of snapshot.orbs || []) {
    const p = toScreen(orb.x, orb.y, cameraX, cameraY, viewWidth, viewHeight);
    const pulse = 0.92 + Math.sin(t * 5 + orb.x * 0.01) * 0.11;
    drawSprite(orbImg, p.x, p.y, orb.radius * 2.7 * pulse, 0.96);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(100,250,255,0.24)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, orb.radius * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function pickupSpriteByType(type) {
  if (type === "shield") {
    return state.images.pickup_shield;
  }
  if (type === "medkit") {
    return state.images.pickup_medkit;
  }
  return state.images.pickup_overclock;
}

function drawPickups(snapshot, cameraX, cameraY, viewWidth, viewHeight, t) {
  for (const pickup of snapshot.pickups || []) {
    const p = toScreen(pickup.x, pickup.y, cameraX, cameraY, viewWidth, viewHeight);
    const sprite = pickupSpriteByType(pickup.type);
    const bob = Math.sin(t * 6 + pickup.x * 0.02) * 4;
    const size = pickup.radius * 2.5;
    drawSpriteRotated(sprite, p.x, p.y + bob, size, t * 0.9, 0.97);

    const glowColor = pickup.type === "shield" ? "rgba(120,216,255,0.18)" : pickup.type === "medkit" ? "rgba(110,255,148,0.2)" : "rgba(255,221,120,0.2)";
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, pickup.radius * 1.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBeacons(snapshot, cameraX, cameraY, viewWidth, viewHeight, t) {
  const beaconSprite = state.images.heal_beacon;
  for (const beacon of snapshot.beacons || []) {
    const p = toScreen(beacon.x, beacon.y, cameraX, cameraY, viewWidth, viewHeight);
    drawSpriteRotated(beaconSprite, p.x, p.y, beacon.radius * 0.95, t * 0.45, 0.95);

    const pulse = 1 + Math.sin(t * 5) * 0.06;
    ctx.strokeStyle = "rgba(112,255,208,0.6)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, beacon.radius * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(124,255,214,0.12)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, beacon.radius * 0.95, 0, Math.PI * 2);
    ctx.fill();
  }
}

function enemySpriteByType(type) {
  if (type === "brute") {
    return state.images.enemy_brute;
  }
  if (type === "sniper") {
    return state.images.enemy_sniper;
  }
  if (type === "boss") {
    return state.images.enemy_boss;
  }
  return state.images.enemy_scout;
}

function drawProjectiles(snapshot, cameraX, cameraY, viewWidth, viewHeight, t) {
  for (const projectile of snapshot.projectiles || []) {
    const p = toScreen(projectile.x, projectile.y, cameraX, cameraY, viewWidth, viewHeight);
    const sprite = projectile.ownerType === "enemy" ? state.images.proj_enemy : state.images.proj_player;
    const size = projectile.radius * 3;
    const angle = Math.atan2(projectile.vy, projectile.vx) + t * 0.2;
    drawSpriteRotated(sprite, p.x, p.y, size, angle, 0.95);

    ctx.strokeStyle = projectile.ownerType === "enemy" ? "rgba(255,122,122,0.35)" : "rgba(108,242,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - projectile.vx * 0.03, p.y - projectile.vy * 0.03);
    ctx.stroke();
  }
}

function drawEnemies(snapshot, cameraX, cameraY, viewWidth, viewHeight, t) {
  for (const enemy of snapshot.enemies || []) {
    const p = toScreen(enemy.x, enemy.y, cameraX, cameraY, viewWidth, viewHeight);
    const sprite = enemySpriteByType(enemy.type);
    const wobble = Math.sin(t * (enemy.type === "boss" ? 2.3 : 6) + enemy.x * 0.01) * (enemy.type === "boss" ? 5 : 3);
    const sizeMultiplier = enemy.type === "boss" ? 3.25 : enemy.type === "brute" ? 2.85 : 2.6;
    const size = enemy.radius * sizeMultiplier;
    drawSpriteRotated(sprite, p.x, p.y + wobble, size, t * 0.3 + enemy.x * 0.0004, 0.98);

    const hpRatio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    const barW = enemy.type === "boss" ? 180 : enemy.radius * 2.0;
    const barY = p.y - enemy.radius - (enemy.type === "boss" ? 28 : 20);
    ctx.fillStyle = "rgba(8, 20, 32, 0.78)";
    ctx.fillRect(p.x - barW / 2, barY, barW, 6);
    ctx.fillStyle = enemy.type === "boss" ? "rgba(255, 158, 110, 0.95)" : "rgba(255, 104, 122, 0.9)";
    ctx.fillRect(p.x - barW / 2, barY, barW * hpRatio, 6);

    if (enemy.type === "boss") {
      ctx.strokeStyle = "rgba(255,152,110,0.45)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, enemy.radius + 18 + Math.sin(t * 3) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawPlayers(snapshot, cameraX, cameraY, viewWidth, viewHeight, t) {
  for (const player of snapshot.players || []) {
    const p = toScreen(player.x, player.y, cameraX, cameraY, viewWidth, viewHeight);
    const moving = Math.hypot(player.vx, player.vy) > 8;
    const bob = moving ? Math.sin(t * 12 + player.x * 0.015) * 4 : Math.sin(t * 3 + player.x) * 1.8;
    const sprite = state.images[player.spriteKey] || state.images.player_blue;
    const size = player.radius * 2.72;

    if (player.id === state.playerId) {
      ctx.strokeStyle = "rgba(86, 240, 240, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, player.radius + 8 + Math.sin(t * 8) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    const facingRot = Math.atan2(player.faceY || -1, player.faceX || 0) + Math.PI / 2;
    const alpha = player.invuln > 0 ? 0.56 + Math.sin(t * 16) * 0.26 : 1;
    drawSpriteRotated(sprite, p.x, p.y + bob, size, facingRot, alpha);

    if (player.carryingOrbId) {
      drawSprite(state.images.energy_orb, p.x, p.y - player.radius - 16 + Math.sin(t * 8) * 4, 42, 0.94);
    }

    const hpRatio = clamp(player.health / player.maxHealth, 0, 1);
    const shieldRatio = clamp(player.shield / player.maxShield, 0, 1);

    ctx.fillStyle = "rgba(8,20,32,0.74)";
    ctx.fillRect(p.x - 28, p.y - player.radius - 26, 56, 5);
    ctx.fillStyle = "rgba(74, 240, 178, 0.92)";
    ctx.fillRect(p.x - 28, p.y - player.radius - 26, 56 * hpRatio, 5);

    ctx.fillStyle = "rgba(8,20,32,0.74)";
    ctx.fillRect(p.x - 28, p.y - player.radius - 19, 56, 4);
    ctx.fillStyle = "rgba(108, 226, 255, 0.88)";
    ctx.fillRect(p.x - 28, p.y - player.radius - 19, 56 * shieldRatio, 4);

    ctx.font = "13px Bahnschrift, 'Segoe UI Variable', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(240, 249, 255, 0.95)";
    ctx.fillText(player.name, p.x, p.y - player.radius - 32);

    if (player.respawnTimer > 0) {
      ctx.fillStyle = "rgba(255, 110, 130, 0.9)";
      ctx.fillText(`respawn ${player.respawnTimer.toFixed(1)}s`, p.x, p.y + player.radius + 18);
    }
  }
}
function drawPulses(cameraX, cameraY, viewWidth, viewHeight) {
  for (const pulse of state.pulses) {
    const p = toScreen(pulse.x, pulse.y, cameraX, cameraY, viewWidth, viewHeight);
    const ratio = 1 - pulse.age / pulse.ttl;
    const radius = 230 * (1 - ratio * ratio);

    ctx.strokeStyle = `rgba(88, 228, 255, ${0.56 * ratio})`;
    ctx.lineWidth = 8 * ratio + 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(168, 238, 255, ${0.42 * ratio})`;
    ctx.lineWidth = 3 * ratio + 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 0.7, 0, Math.PI * 2);
    ctx.stroke();

    drawSprite(state.images.pulse_blast, p.x, p.y, 130 + radius * 0.15, 0.36 * ratio);
  }
}

function drawDashTrails(cameraX, cameraY, viewWidth, viewHeight) {
  for (const trail of state.dashTrails) {
    const p = toScreen(trail.x, trail.y, cameraX, cameraY, viewWidth, viewHeight);
    const ratio = 1 - trail.age / trail.ttl;
    ctx.strokeStyle = `rgba(140, 220, 255, ${0.35 * ratio})`;
    ctx.lineWidth = 16 * ratio;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 30 * (1 - ratio * 0.2), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawParticles(cameraX, cameraY, viewWidth, viewHeight) {
  for (const particle of state.particles) {
    const p = toScreen(particle.x, particle.y, cameraX, cameraY, viewWidth, viewHeight);
    const ratio = clamp(particle.life / particle.maxLife, 0, 1);
    const safeColor = particle.color || "rgba(255,255,255,0.9)";
    const dynamicColor = safeColor.replace(/0\.[0-9]+\)/, `${ratio.toFixed(2)})`);
    ctx.fillStyle = dynamicColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, particle.size * ratio, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFloatingTexts(cameraX, cameraY, viewWidth, viewHeight) {
  ctx.textAlign = "center";
  for (const txt of state.floatingTexts) {
    const p = toScreen(txt.x, txt.y, cameraX, cameraY, viewWidth, viewHeight);
    const ratio = clamp(txt.life / txt.maxLife, 0, 1);
    ctx.font = "bold 15px Bahnschrift, 'Segoe UI Variable', sans-serif";
    ctx.fillStyle = txt.color;
    ctx.globalAlpha = ratio;
    ctx.fillText(txt.text, p.x, p.y);
    ctx.globalAlpha = 1;
  }
}

function drawMissionOverlay(snapshot, viewWidth, viewHeight) {
  if (!snapshot || snapshot.mode !== "playing") {
    return;
  }
  const terminalsActive = snapshot.objective?.terminalsActive || 0;
  const terminalsTotal = snapshot.objective?.terminalsTotal || 3;

  ctx.save();
  ctx.fillStyle = "rgba(8, 24, 38, 0.7)";
  ctx.fillRect(viewWidth / 2 - 360, 14, 720, 38);
  ctx.strokeStyle = "rgba(102, 156, 206, 0.4)";
  ctx.strokeRect(viewWidth / 2 - 360, 14, 720, 38);
  ctx.fillStyle = "rgba(230, 243, 255, 0.94)";
  ctx.font = "16px Bahnschrift, 'Segoe UI Variable', sans-serif";
  ctx.textAlign = "center";
  const txt = `Terminals: ${terminalsActive}/${terminalsTotal} | Energy: ${Math.floor(snapshot.reactor.energy)}/${snapshot.reactor.target} | Integrity: ${Math.ceil(snapshot.reactor.integrity)}%`;
  ctx.fillText(txt, viewWidth / 2, 39);
  ctx.restore();
}

function updateLocal(dt) {
  state.shake = Math.max(0, state.shake - dt * 34);

  for (const pulse of state.pulses) {
    pulse.age += dt;
  }
  state.pulses = state.pulses.filter((pulse) => pulse.age < pulse.ttl);

  for (const trail of state.dashTrails) {
    trail.age += dt;
  }
  state.dashTrails = state.dashTrails.filter((trail) => trail.age < trail.ttl);

  for (const particle of state.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= particle.drag;
    particle.vy *= particle.drag;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);

  for (const text of state.floatingTexts) {
    text.life -= dt;
    text.y += text.vy * dt;
  }
  state.floatingTexts = state.floatingTexts.filter((text) => text.life > 0);
}

function renderFrame() {
  const dpr = window.devicePixelRatio || 1;
  const viewWidth = canvas.width / dpr;
  const viewHeight = canvas.height / dpr;
  const now = performance.now();
  const t = now / 1000;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewWidth, viewHeight);

  if (!state.loaded) {
    ctx.fillStyle = "#dff2ff";
    ctx.font = "24px Bahnschrift, 'Segoe UI Variable', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Загрузка ассетов...", viewWidth / 2, viewHeight / 2);
    return;
  }

  if (!state.snapshot) {
    const gradient = ctx.createLinearGradient(0, 0, viewWidth, viewHeight);
    gradient.addColorStop(0, "#12273c");
    gradient.addColorStop(1, "#0a1320");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewWidth, viewHeight);
    ctx.fillStyle = "#dff2ff";
    ctx.font = "24px Bahnschrift, 'Segoe UI Variable', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Создай комнату или подключись по коду", viewWidth / 2, viewHeight / 2);
    return;
  }

  const snapshot = state.snapshot;
  const local = getLocalPlayer(snapshot) || snapshot.players[0] || null;
  if (local) {
    state.camera.x = lerp(state.camera.x, local.x, 0.16);
    state.camera.y = lerp(state.camera.y, local.y, 0.16);
  }

  const halfW = viewWidth / 2;
  const halfH = viewHeight / 2;
  state.camera.x = clamp(state.camera.x, halfW, snapshot.world.width - halfW);
  state.camera.y = clamp(state.camera.y, halfH, snapshot.world.height - halfH);

  let shakeX = 0;
  let shakeY = 0;
  if (state.shake > 0) {
    shakeX = (Math.random() - 0.5) * state.shake;
    shakeY = (Math.random() - 0.5) * state.shake;
  }

  const cameraX = state.camera.x + shakeX;
  const cameraY = state.camera.y + shakeY;

  drawBackground(snapshot, cameraX, cameraY, viewWidth, viewHeight, t);
  drawProps(snapshot, cameraX, cameraY, viewWidth, viewHeight);
  drawTerminals(snapshot, cameraX, cameraY, viewWidth, viewHeight, t);
  drawReactor(snapshot, cameraX, cameraY, viewWidth, viewHeight, t);
  drawOrbs(snapshot, cameraX, cameraY, viewWidth, viewHeight, t);
  drawPickups(snapshot, cameraX, cameraY, viewWidth, viewHeight, t);
  drawBeacons(snapshot, cameraX, cameraY, viewWidth, viewHeight, t);
  drawProjectiles(snapshot, cameraX, cameraY, viewWidth, viewHeight, t);
  drawEnemies(snapshot, cameraX, cameraY, viewWidth, viewHeight, t);
  drawPlayers(snapshot, cameraX, cameraY, viewWidth, viewHeight, t);
  drawDashTrails(cameraX, cameraY, viewWidth, viewHeight);
  drawPulses(cameraX, cameraY, viewWidth, viewHeight);
  drawParticles(cameraX, cameraY, viewWidth, viewHeight);
  drawFloatingTexts(cameraX, cameraY, viewWidth, viewHeight);
  drawMissionOverlay(snapshot, viewWidth, viewHeight);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

function sendInput(force=false) {
  if(document.hidden&&!force)return;
  if (!state.roomCode) {
    return;
  }
  socket.emit("input", {
    up: inputState.up,
    down: inputState.down,
    left: inputState.left,
    right: inputState.right,
    pulse: inputState.pulse,
    dash: inputState.dash,
    shoot: inputState.shoot,
    interact: inputState.interact,
  });
  inputState.pulse = false;
  inputState.dash = false;
}

function keyToInputFlag(event) {
  if (event.code === "KeyW" || event.key === "ArrowUp") {
    return "up";
  }
  if (event.code === "KeyS" || event.key === "ArrowDown") {
    return "down";
  }
  if (event.code === "KeyA" || event.key === "ArrowLeft") {
    return "left";
  }
  if (event.code === "KeyD" || event.key === "ArrowRight") {
    return "right";
  }
  return null;
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    // ignored
  }
}
function bindInputEvents() {
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat) {
      inputState.pulse = true;
      event.preventDefault();
      return;
    }
    if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) {
      inputState.dash = true;
      event.preventDefault();
      return;
    }
    if ((event.code === "KeyE" || event.key === "e" || event.key === "E") && !event.repeat) {
      inputState.interact = true;
      event.preventDefault();
      return;
    }
    if ((event.code === "KeyJ" || event.code === "KeyK") && !event.repeat) {
      inputState.shoot = true;
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && !event.repeat) {
      if (state.snapshot?.mode === "lobby" && state.snapshot?.hostId === state.playerId) {
        socket.emit("start_game");
        event.preventDefault();
        return;
      }
    }
    if ((event.key === "f" || event.key === "F") && !event.repeat) {
      toggleFullscreen();
      event.preventDefault();
      return;
    }
    if ((event.key === "m" || event.key === "M") && !event.repeat) {
      state.muted = !state.muted;
      showMenuMessage(state.muted ? "Звук: mute" : "Звук: on", false);
      return;
    }
    const mapped = keyToInputFlag(event);
    if (mapped) {
      inputState[mapped] = true;
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "KeyE" || event.key === "e" || event.key === "E") {
      inputState.interact = false;
      event.preventDefault();
      return;
    }
    if (event.code === "KeyJ" || event.code === "KeyK") {
      inputState.shoot = false;
      event.preventDefault();
      return;
    }
    const mapped = keyToInputFlag(event);
    if (mapped) {
      inputState[mapped] = false;
      event.preventDefault();
    }
  });

  canvas.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
      inputState.shoot = true;
      event.preventDefault();
    }
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) {
      inputState.shoot = false;
    }
  });

  window.addEventListener("blur", () => {
    inputState.up = false;
    inputState.down = false;
    inputState.left = false;
    inputState.right = false;
    inputState.interact = false;
    inputState.shoot = false;
  });

  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("fullscreenchange", resizeCanvas);
}

function initUiButtons() {
  createBtn.addEventListener("click", () => {
    const name = nameInput.value.trim() || "Pilot";
    socket.emit("create_room", { name });
    showMenuMessage("Создаем комнату...", false);
  });

  joinBtn.addEventListener("click", () => {
    const code = roomInput.value.trim().toUpperCase();
    const name = nameInput.value.trim() || "Pilot";
    if (!code) {
      showMenuMessage("Укажи код комнаты");
      return;
    }
    socket.emit("join_room", { code, name });
    showMenuMessage("Подключаемся...", false);
  });

  readyBtn.addEventListener("click", () => {
    state.ready = !state.ready;
    socket.emit("set_ready", { ready: state.ready });
    syncHud();
  });

  startBtn.addEventListener("click", () => {
    socket.emit("start_game");
  });

  restartBtn.addEventListener("click", () => {
    socket.emit("restart_game");
  });

  backToLobbyBtn.addEventListener("click", () => {
    socket.emit("restart_game");
  });
}

function bindSocketEvents() {
  socket.on("hello", (payload) => {
    if (payload?.id) {
      state.playerId = payload.id;
    }
  });

  socket.on("room_created", (payload) => {
    state.roomCode = payload.code;
    state.playerId = payload.playerId;
    state.ready = false;
    roomInput.value = payload.code;
    setUiVisibility(true);
    showMenuMessage("");
  });

  socket.on("joined_room", (payload) => {
    state.roomCode = payload.code;
    state.playerId = payload.playerId;
    state.ready = false;
    roomInput.value = payload.code;
    setUiVisibility(true);
    showMenuMessage("");
  });

  socket.on("join_error", (payload) => {
    showMenuMessage(payload?.message || "Ошибка подключения");
  });

  socket.on("state", (snapshot) => {
    state.snapshot = snapshot;
    if (snapshot?.code) {
      state.roomCode = snapshot.code;
    }
    handleSnapshotEvents(snapshot);
    syncHud();
  });
}

function frame(now) {
  const dt = clamp((now - state.lastTickAt) / 1000, 0, 0.06);
  state.lastTickAt = now;
  updateLocal(dt);
  renderFrame();
  requestAnimationFrame(frame);
}

function buildTextState() {
  const snapshot = state.snapshot;
  if (!snapshot) {
    return JSON.stringify({ mode: "menu", note: "No room state yet" });
  }
  const local = getLocalPlayer(snapshot);
  const payload = {
    mode: snapshot.mode,
    room: snapshot.code,
    coordinate_system: "origin top-left; +x right; +y down",
    world: snapshot.world,
    timer_seconds: snapshot.timer,
    objective: snapshot.objective,
    reactor: {
      x: snapshot.reactor.x,
      y: snapshot.reactor.y,
      energy: snapshot.reactor.energy,
      target: snapshot.reactor.target,
      integrity: snapshot.reactor.integrity,
      max_integrity: snapshot.reactor.maxIntegrity,
    },
    local_player: local
      ? {
          id: local.id,
          x: local.x,
          y: local.y,
          vx: local.vx,
          vy: local.vy,
          hp: local.health,
          shield: local.shield,
          respawn: local.respawnTimer,
          carrying: Boolean(local.carryingOrbId),
          pulse_cooldown: local.pulseCooldown,
          dash_cooldown: local.dashCooldown,
          shoot_cooldown: local.shootCooldown,
          beacon_cooldown: local.beaconCooldown,
          boost_seconds: local.speedBoostTimer,
        }
      : null,
    teammates: snapshot.players
      .filter((player) => player.id !== state.playerId)
      .map((player) => ({
        id: player.id,
        x: player.x,
        y: player.y,
        hp: player.health,
        shield: player.shield,
        respawn: player.respawnTimer,
        carrying: Boolean(player.carryingOrbId),
      })),
    terminals: snapshot.terminals.map((terminal) => ({
      id: terminal.id,
      x: terminal.x,
      y: terminal.y,
      active: terminal.active,
      progress: terminal.progress,
    })),
    enemies: snapshot.enemies.map((enemy) => ({
      id: enemy.id,
      type: enemy.type,
      x: enemy.x,
      y: enemy.y,
      hp: enemy.hp,
      r: enemy.radius,
    })),
    projectiles: snapshot.projectiles.map((projectile) => ({
      type: projectile.type,
      owner: projectile.ownerType,
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
    })),
    pickups: snapshot.pickups.map((pickup) => ({
      id: pickup.id,
      type: pickup.type,
      x: pickup.x,
      y: pickup.y,
    })),
    orbs: snapshot.orbs.map((orb) => ({ id: orb.id, x: orb.x, y: orb.y, r: orb.radius })),
  };
  return JSON.stringify(payload);
}

window.render_game_to_text = () => buildTextState();

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  const stepDt = 1 / 60;
  for (let i = 0; i < steps; i += 1) {
    updateLocal(stepDt);
  }
  renderFrame();
};

async function init() {
  bindInputEvents();
  initUiButtons();
  bindSocketEvents();
  resizeCanvas();
  generateNebulaClouds();
  requestAnimationFrame(frame);
  setInterval(sendInput, 1000 / 30);

  try {
    await loadAssets();
    showMenuMessage("Ассеты загружены. Можно играть.", false);
  } catch {
    showMenuMessage("Не удалось загрузить ассеты");
  }
}

init();


document.querySelector('#practiceBtn').onclick=()=>socket.practice(nameInput.value);
for(const button of document.querySelectorAll('[data-flag]')){
 const flag=button.dataset.flag;
 button.onpointerdown=e=>{button.setPointerCapture(e.pointerId);inputState[flag]=true;sendInput(true);e.preventDefault();};
 const release=()=>{inputState[flag]=false;sendInput(true);};button.onpointerup=release;button.onpointercancel=release;button.onlostpointercapture=release;
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){for(const flag of Object.keys(inputState))inputState[flag]=false;sendInput(true);}});


new ResizeObserver(resizeCanvas).observe(canvas);
