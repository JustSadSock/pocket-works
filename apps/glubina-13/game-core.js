export const CHUNK_SIZE = 24;
export const TREASURE_TYPES = Object.freeze({
  relic: { label: 'Реликт', value: 30, weight: 0.58 },
  archive: { label: 'Архив', value: 70, weight: 0.3 },
  idol: { label: 'Идол', value: 150, weight: 0.12 },
});

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2D(seed, x, z) {
  let value = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(z, 0x85ebca77);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function chunkCoordinate(value) {
  return Math.floor((value + CHUNK_SIZE / 2) / CHUNK_SIZE);
}

export function chunkKey(cx, cz) {
  return `${cx}:${cz}`;
}

function chooseTreasure(random) {
  const roll = random();
  if (roll < TREASURE_TYPES.idol.weight) return 'idol';
  if (roll < TREASURE_TYPES.idol.weight + TREASURE_TYPES.archive.weight) return 'archive';
  return 'relic';
}

function overlapsObstacle(x, z, radius, obstacles) {
  return obstacles.some((obstacle) => {
    if (obstacle.kind === 'circle') {
      return Math.hypot(x - obstacle.x, z - obstacle.z) < radius + obstacle.radius + 0.8;
    }
    const dx = Math.max(Math.abs(x - obstacle.x) - obstacle.halfW, 0);
    const dz = Math.max(Math.abs(z - obstacle.z) - obstacle.halfD, 0);
    return Math.hypot(dx, dz) < radius + 0.7;
  });
}

function safePoint(random, originX, originZ, obstacles, margin = 2.2) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const x = originX + (random() * 2 - 1) * (CHUNK_SIZE * 0.42);
    const z = originZ + (random() * 2 - 1) * (CHUNK_SIZE * 0.42);
    if (!overlapsObstacle(x, z, margin, obstacles) && Math.hypot(x, z) > 7) return { x, z };
  }
  return { x: originX, z: originZ };
}

export function generateChunk(seed, cx, cz) {
  const random = mulberry32(hash2D(seed, cx, cz));
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const isBase = cx === 0 && cz === 0;
  const obstacles = [];
  const decorations = [];
  const pickups = [];

  const pillarCount = isBase ? 2 : 3 + Math.floor(random() * 4);
  for (let index = 0; index < pillarCount; index += 1) {
    const radius = 1.1 + random() * 1.45;
    const point = safePoint(random, originX, originZ, obstacles, radius + 0.6);
    obstacles.push({
      id: `${cx}:${cz}:pillar:${index}`,
      kind: 'circle',
      visual: random() < 0.56 ? 'pillar' : 'rock',
      x: point.x,
      z: point.z,
      radius,
      height: 2.3 + random() * 4.6,
      rotation: random() * Math.PI,
    });
  }

  const wallCount = isBase ? 0 : 1 + Math.floor(random() * 3);
  for (let index = 0; index < wallCount; index += 1) {
    const horizontal = random() < 0.5;
    const halfW = horizontal ? 2.8 + random() * 3.1 : 0.55 + random() * 0.35;
    const halfD = horizontal ? 0.55 + random() * 0.35 : 2.8 + random() * 3.1;
    const point = safePoint(random, originX, originZ, obstacles, Math.max(halfW, halfD));
    obstacles.push({
      id: `${cx}:${cz}:wall:${index}`,
      kind: 'aabb',
      visual: 'wall',
      x: point.x,
      z: point.z,
      halfW,
      halfD,
      height: 2.1 + random() * 2.9,
      rotation: 0,
    });
  }

  const archCount = isBase ? 0 : Math.floor(random() * 3);
  for (let index = 0; index < archCount; index += 1) {
    const point = safePoint(random, originX, originZ, obstacles, 1.5);
    decorations.push({
      id: `${cx}:${cz}:arch:${index}`,
      type: 'arch',
      x: point.x,
      z: point.z,
      rotation: random() < 0.5 ? 0 : Math.PI / 2,
      scale: 0.8 + random() * 0.7,
    });
  }

  if (!isBase && random() < 0.82) {
    const amount = random() < 0.18 ? 2 : 1;
    for (let index = 0; index < amount; index += 1) {
      const point = safePoint(random, originX, originZ, obstacles, 1.15);
      const treasureType = chooseTreasure(random);
      pickups.push({
        id: `${cx}:${cz}:treasure:${index}`,
        type: 'treasure',
        treasureType,
        value: TREASURE_TYPES[treasureType].value,
        x: point.x,
        z: point.z,
        rotation: random() * Math.PI * 2,
      });
    }
  }

  if (!isBase && random() < 0.28) {
    const point = safePoint(random, originX, originZ, obstacles, 1.1);
    pickups.push({
      id: `${cx}:${cz}:oxygen`,
      type: 'oxygen',
      x: point.x,
      z: point.z,
      rotation: random() * Math.PI * 2,
    });
  }

  return {
    key: chunkKey(cx, cz),
    cx,
    cz,
    originX,
    originZ,
    isBase,
    floorVariant: Math.floor(random() * 3),
    obstacles,
    decorations,
    pickups,
  };
}

export function circleVsCircle(ax, az, ar, bx, bz, br) {
  const dx = ax - bx;
  const dz = az - bz;
  const radius = ar + br;
  return dx * dx + dz * dz < radius * radius;
}

export function resolveCircleObstacle(player, radius, obstacle) {
  if (obstacle.kind === 'circle') {
    const dx = player.x - obstacle.x;
    const dz = player.z - obstacle.z;
    const target = radius + obstacle.radius;
    const distance = Math.hypot(dx, dz);
    if (distance >= target) return { x: player.x, z: player.z, hit: false };
    const safeDistance = distance || 0.0001;
    return {
      x: obstacle.x + (dx / safeDistance) * target,
      z: obstacle.z + (dz / safeDistance) * target,
      hit: true,
    };
  }

  const nearestX = clamp(player.x, obstacle.x - obstacle.halfW, obstacle.x + obstacle.halfW);
  const nearestZ = clamp(player.z, obstacle.z - obstacle.halfD, obstacle.z + obstacle.halfD);
  const dx = player.x - nearestX;
  const dz = player.z - nearestZ;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius) return { x: player.x, z: player.z, hit: false };

  if (distance > 0.0001) {
    return {
      x: nearestX + (dx / distance) * radius,
      z: nearestZ + (dz / distance) * radius,
      hit: true,
    };
  }

  const left = Math.abs(player.x - (obstacle.x - obstacle.halfW));
  const right = Math.abs((obstacle.x + obstacle.halfW) - player.x);
  const top = Math.abs(player.z - (obstacle.z - obstacle.halfD));
  const bottom = Math.abs((obstacle.z + obstacle.halfD) - player.z);
  const minimum = Math.min(left, right, top, bottom);
  if (minimum === left) return { x: obstacle.x - obstacle.halfW - radius, z: player.z, hit: true };
  if (minimum === right) return { x: obstacle.x + obstacle.halfW + radius, z: player.z, hit: true };
  if (minimum === top) return { x: player.x, z: obstacle.z - obstacle.halfD - radius, hit: true };
  return { x: player.x, z: obstacle.z + obstacle.halfD + radius, hit: true };
}

export function movementNoise(inputMagnitude, quietDriveLevel = 0) {
  const reduction = clamp(1 - quietDriveLevel * 0.16, 0.55, 1);
  const thresholded = Math.max(0, inputMagnitude - 0.28);
  return thresholded * thresholded * reduction;
}

export function cargoValue(cargo) {
  return (Array.isArray(cargo) ? cargo : []).reduce((total, item) => total + (Number(item?.value) || 0), 0);
}

export function distanceToBase(player) {
  return Math.hypot(Number(player?.x) || 0, Number(player?.z) || 0);
}

export function canExtract(player, cargo, speed) {
  return distanceToBase(player) <= 3.6 && Array.isArray(cargo) && cargo.length > 0 && speed <= 1.35;
}

export function listenerStep(listener, target, dt, intensity = 1) {
  const dx = target.x - listener.x;
  const dz = target.z - listener.z;
  const distance = Math.hypot(dx, dz) || 1;
  const speed = clamp(1.1 + intensity * 1.75, 1.1, 4.8);
  return {
    ...listener,
    x: listener.x + (dx / distance) * speed * dt,
    z: listener.z + (dz / distance) * speed * dt,
    heading: Math.atan2(dx, -dz),
  };
}

export function upgradeCost(kind, currentLevel) {
  const costs = {
    quiet: [90, 220],
    hull: [120, 280],
    cargo: [140, 320],
  };
  const table = costs[kind];
  if (!table || currentLevel >= table.length) return null;
  return table[currentLevel];
}

export function sanitizeProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  const upgrades = source.upgrades && typeof source.upgrades === 'object' ? source.upgrades : {};
  const wreck = source.wreck && typeof source.wreck === 'object' && Number.isFinite(source.wreck.x) && Number.isFinite(source.wreck.z)
    ? {
        seed: Number.isInteger(source.wreck.seed) ? source.wreck.seed >>> 0 : 1,
        x: clamp(source.wreck.x, -100000, 100000),
        z: clamp(source.wreck.z, -100000, 100000),
        item: source.wreck.item && typeof source.wreck.item === 'object' ? source.wreck.item : null,
      }
    : null;
  return {
    credits: clamp(Math.floor(Number(source.credits) || 0), 0, 9999999),
    expeditions: clamp(Math.floor(Number(source.expeditions) || 0), 0, 999999),
    successful: clamp(Math.floor(Number(source.successful) || 0), 0, 999999),
    bestValue: clamp(Math.floor(Number(source.bestValue) || 0), 0, 9999999),
    totalArtifacts: clamp(Math.floor(Number(source.totalArtifacts) || 0), 0, 999999),
    upgrades: {
      quiet: clamp(Math.floor(Number(upgrades.quiet) || 0), 0, 2),
      hull: clamp(Math.floor(Number(upgrades.hull) || 0), 0, 2),
      cargo: clamp(Math.floor(Number(upgrades.cargo) || 0), 0, 2),
    },
    wreck,
  };
}

export function sanitizeSavedRun(value) {
  if (!value || typeof value !== 'object') return null;
  if (!Number.isFinite(value.seed) || !Number.isFinite(value.oxygen) || !Number.isFinite(value.hull)) return null;
  const cargo = Array.isArray(value.cargo)
    ? value.cargo.slice(0, 8).filter((item) => item && typeof item.treasureType === 'string' && Number.isFinite(item.value))
    : [];
  const collected = Array.isArray(value.collected)
    ? value.collected.slice(0, 1200).filter((id) => typeof id === 'string')
    : [];
  return {
    seed: value.seed >>> 0,
    player: {
      x: clamp(Number(value.player?.x) || 0, -100000, 100000),
      z: clamp(Number(value.player?.z) || 0, -100000, 100000),
      heading: Number(value.player?.heading) || 0,
    },
    oxygen: clamp(Number(value.oxygen) || 1, 1, 100),
    hull: clamp(Math.round(Number(value.hull) || 1), 1, 8),
    sonar: clamp(Number(value.sonar) || 0, 0, 100),
    cargo,
    collected,
    elapsed: clamp(Number(value.elapsed) || 0, 0, 60 * 60 * 12),
    distanceTravelled: clamp(Number(value.distanceTravelled) || 0, 0, 1000000),
    maxRange: clamp(Number(value.maxRange) || 0, 0, 1000000),
    attention: clamp(Number(value.attention) || 0, 0, 3),
    listener: value.listener && typeof value.listener === 'object'
      ? {
          active: Boolean(value.listener.active),
          x: clamp(Number(value.listener.x) || 0, -100000, 100000),
          z: clamp(Number(value.listener.z) || 0, -100000, 100000),
          heading: Number(value.listener.heading) || 0,
        }
      : null,
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : Date.now(),
  };
}
