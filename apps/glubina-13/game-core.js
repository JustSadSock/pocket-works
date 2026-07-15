export const CHUNK_SIZE = 28;
export const BASE_RADIUS = 7;
export const PLAYER_RADIUS = 0.82;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

export function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
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

export function hash32(seed, x, z, salt = 0) {
  let value = (seed ^ Math.imul(x, 0x45d9f3b) ^ Math.imul(z, 0x119de1f3) ^ salt) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

export function chunkCoordinate(value) {
  return Math.floor((value + CHUNK_SIZE / 2) / CHUNK_SIZE);
}

export function chunkKey(cx, cz) {
  return `${cx}:${cz}`;
}

function circleIntersectsBox(x, z, radius, wall) {
  const nearestX = clamp(x, wall.x - wall.w / 2, wall.x + wall.w / 2);
  const nearestZ = clamp(z, wall.z - wall.d / 2, wall.z + wall.d / 2);
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

function positionClear(x, z, walls, radius = 2) {
  return !walls.some((wall) => circleIntersectsBox(x, z, radius, wall));
}

function nearBase(x, z, padding = 0) {
  return Math.hypot(x, z) < 11 + padding;
}

export function generateChunk(seed, cx, cz, wreck = null) {
  const random = mulberry32(hash32(seed, cx, cz, 0x13));
  const centerX = cx * CHUNK_SIZE;
  const centerZ = cz * CHUNK_SIZE;
  const walls = [];
  const decor = [];
  const count = 3 + Math.floor(random() * 4);

  for (let index = 0; index < count; index += 1) {
    const w = 3.4 + random() * 5.8;
    const d = 2.6 + random() * 5.2;
    const x = centerX + (random() - 0.5) * (CHUNK_SIZE - w - 3);
    const z = centerZ + (random() - 0.5) * (CHUNK_SIZE - d - 3);
    if (nearBase(x, z, Math.max(w, d) * 0.55)) continue;
    if (Math.abs(x) < w / 2 + 5.4 && z + d / 2 > -34 && z - d / 2 < -6) continue;
    if (walls.some((wall) => Math.abs(wall.x - x) < (wall.w + w) * 0.58 && Math.abs(wall.z - z) < (wall.d + d) * 0.58)) continue;
    walls.push({
      id: `wall:${cx}:${cz}:${index}`,
      x,
      z,
      w,
      d,
      h: 2.5 + random() * 7.5,
      yaw: (random() - 0.5) * 0.18,
      kind: random() < 0.42 ? 'stone' : 'ruin',
    });
  }

  const pillarCount = 1 + Math.floor(random() * 3);
  for (let index = 0; index < pillarCount; index += 1) {
    const x = centerX + (random() - 0.5) * 22;
    const z = centerZ + (random() - 0.5) * 22;
    if (nearBase(x, z, 4) || (Math.abs(x) < 7.4 && z < -6 && z > -34) || !positionClear(x, z, walls, 1.5)) continue;
    decor.push({ id: `pillar:${cx}:${cz}:${index}`, x, z, h: 3 + random() * 8, spin: random() * Math.PI });
  }

  const pickups = [];
  if (cx === 0 && cz === -1) {
    pickups.push({ id: 'starter-relic', type: 'relic', x: 0, z: -20, value: 30, guaranteed: true });
  }

  const distanceFromBase = Math.hypot(centerX, centerZ);
  const lootChance = distanceFromBase < 18 ? 0 : 0.52;
  if (random() < lootChance) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const x = centerX + (random() - 0.5) * 21;
      const z = centerZ + (random() - 0.5) * 21;
      if (nearBase(x, z, 8) || !positionClear(x, z, walls, 2.1)) continue;
      const roll = random();
      const type = roll < 0.61 ? 'relic' : roll < 0.9 ? 'archive' : 'idol';
      pickups.push({ id: `loot:${cx}:${cz}`, type, x, z, value: lootValue(type) });
      break;
    }
  }

  if (random() < 0.3 && distanceFromBase > 24) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const x = centerX + (random() - 0.5) * 20;
      const z = centerZ + (random() - 0.5) * 20;
      if (!positionClear(x, z, walls, 1.8)) continue;
      pickups.push({ id: `oxygen:${cx}:${cz}`, type: 'oxygen', x, z, value: 0 });
      break;
    }
  }

  if (wreck && chunkCoordinate(wreck.x) === cx && chunkCoordinate(wreck.z) === cz) {
    pickups.push({ id: 'black-box', type: 'wreck', x: wreck.x, z: wreck.z, value: wreck.item?.value || 30, item: wreck.item });
  }

  return { cx, cz, walls, decor, pickups };
}

export function lootValue(type) {
  if (type === 'idol') return 150;
  if (type === 'archive') return 70;
  if (type === 'relic') return 30;
  return 0;
}

export function lootLabel(type) {
  if (type === 'idol') return 'ИДОЛ';
  if (type === 'archive') return 'АРХИВ';
  if (type === 'relic') return 'РЕЛИКТ';
  if (type === 'wreck') return 'ЧЁРНЫЙ ЯЩИК';
  return 'МОДУЛЬ';
}

function pushOutCircleFromWall(position, radius, wall) {
  const minX = wall.x - wall.w / 2;
  const maxX = wall.x + wall.w / 2;
  const minZ = wall.z - wall.d / 2;
  const maxZ = wall.z + wall.d / 2;
  const nearestX = clamp(position.x, minX, maxX);
  const nearestZ = clamp(position.z, minZ, maxZ);
  let dx = position.x - nearestX;
  let dz = position.z - nearestZ;
  let distance = Math.hypot(dx, dz);

  if (distance >= radius) return false;
  if (distance < 0.0001) {
    const options = [
      { amount: Math.abs(position.x - minX), x: minX - radius, z: position.z },
      { amount: Math.abs(maxX - position.x), x: maxX + radius, z: position.z },
      { amount: Math.abs(position.z - minZ), x: position.x, z: minZ - radius },
      { amount: Math.abs(maxZ - position.z), x: position.x, z: maxZ + radius },
    ].sort((a, b) => a.amount - b.amount);
    position.x = options[0].x;
    position.z = options[0].z;
    return true;
  }

  const overlap = radius - distance;
  dx /= distance;
  dz /= distance;
  position.x += dx * overlap;
  position.z += dz * overlap;
  return true;
}

export function moveWithCollisions(position, delta, walls, radius = PLAYER_RADIUS) {
  const distance = Math.hypot(delta.x, delta.z);
  const steps = Math.max(1, Math.ceil(distance / 0.45));
  const next = { x: position.x, z: position.z };
  let collided = false;
  for (let step = 0; step < steps; step += 1) {
    next.x += delta.x / steps;
    next.z += delta.z / steps;
    for (const wall of walls) collided = pushOutCircleFromWall(next, radius, wall) || collided;
  }
  return { ...next, collided };
}

export function cargoCapacity(upgrades = {}) {
  return 3 + clamp(Math.floor(upgrades.cargo || 0), 0, 2);
}

export function maxHull(upgrades = {}) {
  return 4 + clamp(Math.floor(upgrades.hull || 0), 0, 2);
}

export function engineNoiseFactor(upgrades = {}) {
  return Math.pow(0.78, clamp(Math.floor(upgrades.propeller || 0), 0, 2));
}

export function upgradeCost(type, level) {
  const costs = {
    propeller: [100, 240],
    hull: [140, 320],
    cargo: [180, 380],
  };
  return costs[type]?.[level] ?? null;
}

export function attentionSpawnReady({ elapsed, distanceFromBase, cargoCount, attention, successes = 0 }) {
  const grace = successes === 0 ? 82 : 52;
  return elapsed >= grace && cargoCount > 0 && distanceFromBase > 28 && attention >= 62;
}

export function updateAttention(current, { dt, throttle, sonar = false, impact = false, pickup = false, noiseFactor = 1 }) {
  let next = current;
  next += Math.max(0, throttle - 0.58) * 6.4 * noiseFactor * dt;
  next -= (throttle < 0.22 ? 5.4 : 2.4) * dt;
  if (sonar) next += 23;
  if (impact) next += 12;
  if (pickup) next += 7;
  return clamp(next, 0, 100);
}

export function createListener(x, z, now = 0) {
  return {
    x,
    z,
    state: 'investigate',
    targetX: x,
    targetZ: z,
    lastHeardAt: now,
    stateTime: 0,
    phase: 0,
    hitCooldown: 0,
  };
}

export function stepListener(listener, context, dt) {
  if (!listener) return { listener: null, hit: false };
  const next = { ...listener, stateTime: listener.stateTime + dt, hitCooldown: Math.max(0, listener.hitCooldown - dt), phase: listener.phase + dt };
  const player = context.player;
  const baseDistance = Math.hypot(next.x, next.z);
  const noise = context.noise;

  if (baseDistance < BASE_RADIUS + 5) {
    next.state = 'retreat';
    next.stateTime = 0;
  }

  if (noise && noise.age < 7) {
    const noiseDistance = Math.hypot(next.x - noise.x, next.z - noise.z);
    const hearingRadius = 12 + noise.strength * 0.48;
    if (noiseDistance <= hearingRadius) {
      next.targetX = noise.x;
      next.targetZ = noise.z;
      next.lastHeardAt = context.elapsed;
      if (next.state !== 'flee') next.state = 'investigate';
      next.stateTime = 0;
    }
  }

  if (next.state !== 'flee' && context.elapsed - next.lastHeardAt > 12) {
    next.state = 'retreat';
    next.stateTime = 0;
  }

  let speed = 2.15;
  let targetX = next.targetX;
  let targetZ = next.targetZ;

  if (next.state === 'search') {
    speed = 1.35;
    const radius = 4.2;
    targetX = next.targetX + Math.cos(next.phase * 0.72) * radius;
    targetZ = next.targetZ + Math.sin(next.phase * 0.72) * radius;
    if (next.stateTime > 8) {
      next.state = 'retreat';
      next.stateTime = 0;
    }
  } else if (next.state === 'retreat') {
    speed = 3.1;
    const dx = next.x - player.x;
    const dz = next.z - player.z;
    const length = Math.hypot(dx, dz) || 1;
    targetX = next.x + (dx / length) * 30;
    targetZ = next.z + (dz / length) * 30;
  } else if (next.state === 'flee') {
    speed = 4.1;
    targetX = next.targetX;
    targetZ = next.targetZ;
    if (next.stateTime > 6) {
      next.state = 'retreat';
      next.stateTime = 0;
    }
  }

  const dx = targetX - next.x;
  const dz = targetZ - next.z;
  const length = Math.hypot(dx, dz);
  if (length > 0.05) {
    next.x += (dx / length) * speed * dt;
    next.z += (dz / length) * speed * dt;
  }

  if (next.state === 'investigate' && length < 1.3) {
    next.state = 'search';
    next.stateTime = 0;
  }

  const distanceToPlayer = Math.hypot(next.x - player.x, next.z - player.z);
  let hit = false;
  if ((next.state === 'investigate' || next.state === 'search') && distanceToPlayer < 1.55 && next.hitCooldown <= 0 && context.playerInvulnerability <= 0) {
    hit = true;
    const awayX = next.x - player.x;
    const awayZ = next.z - player.z;
    const awayLength = Math.hypot(awayX, awayZ) || 1;
    next.state = 'flee';
    next.stateTime = 0;
    next.hitCooldown = 10;
    next.targetX = next.x + (awayX / awayLength) * 24;
    next.targetZ = next.z + (awayZ / awayLength) * 24;
  }

  const despawn = next.state === 'retreat' && distanceToPlayer > 58 && next.stateTime > 5;
  return { listener: despawn ? null : next, hit };
}

export function canExtract({ cargoCount, distanceFromBase, speed, hold }) {
  if (cargoCount <= 0 || distanceFromBase > BASE_RADIUS - 1.5 || speed > 0.48) return 0;
  return hold;
}

export function sanitizeSavedRun(value) {
  if (!value || typeof value !== 'object' || value.schema !== 3) return null;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.z) || !Number.isFinite(value.oxygen)) return null;
  return {
    schema: 3,
    seed: Number.isInteger(value.seed) ? value.seed >>> 0 : 1,
    x: clamp(value.x, -100000, 100000),
    z: clamp(value.z, -100000, 100000),
    vx: clamp(Number(value.vx) || 0, -8, 8),
    vz: clamp(Number(value.vz) || 0, -8, 8),
    heading: Number(value.heading) || 0,
    oxygen: clamp(value.oxygen, 1, 100),
    hull: clamp(Math.floor(value.hull || 1), 1, 8),
    sonar: clamp(Number(value.sonar) || 0, 0, 100),
    elapsed: clamp(Number(value.elapsed) || 0, 0, 86400),
    attention: clamp(Number(value.attention) || 0, 0, 100),
    cargo: Array.isArray(value.cargo) ? value.cargo.slice(0, 5).filter((item) => item && typeof item.type === 'string') : [],
    collected: Array.isArray(value.collected) ? value.collected.slice(0, 1000).filter((id) => typeof id === 'string') : [],
    listener: value.listener && Number.isFinite(value.listener.x) && Number.isFinite(value.listener.z) ? value.listener : null,
    savedAt: Number(value.savedAt) || Date.now(),
  };
}
