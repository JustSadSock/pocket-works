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

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

export function generateGate(seed, zone = 1, z = -60) {
  const random = mulberry32(seed);
  const openingWidth = clamp(3.3 - zone * 0.12 + random() * 0.7, 1.8, 3.7);
  const openingHeight = clamp(2.7 - zone * 0.1 + random() * 0.65, 1.55, 3.05);
  const maxX = Math.max(0.2, 3.7 - openingWidth / 2);
  const maxY = Math.max(0.2, 2.7 - openingHeight / 2);
  return {
    type: 'gate',
    seed,
    z,
    x: (random() * 2 - 1) * maxX,
    y: (random() * 2 - 1) * maxY,
    openingWidth,
    openingHeight,
    twist: (random() * 2 - 1) * 0.25,
    scored: false,
    resolved: false,
  };
}

export function generateBloom(seed, z = -60) {
  const random = mulberry32(seed ^ 0xa71b3c9d);
  return {
    type: 'bloom',
    seed,
    z,
    x: (random() * 2 - 1) * 3.1,
    y: (random() * 2 - 1) * 2.25,
    spin: random() * Math.PI * 2,
    collected: false,
  };
}

export function gateCollision(gate, player, margin = 0.42) {
  const halfW = gate.openingWidth / 2 - margin;
  const halfH = gate.openingHeight / 2 - margin;
  return Math.abs(player.x - gate.x) > halfW || Math.abs(player.y - gate.y) > halfH;
}

export function collectibleCollision(item, player, radius = 0.75) {
  const dx = player.x - item.x;
  const dy = player.y - item.y;
  return dx * dx + dy * dy <= radius * radius;
}

export function silenceMultiplier(secondsSincePulse) {
  if (secondsSincePulse < 3) return 1;
  return clamp(1 + (secondsSincePulse - 3) * 0.12, 1, 2.5);
}

export function zoneForDistance(distance) {
  return Math.max(1, Math.floor(Math.max(0, distance) / 250) + 1);
}

export function speedForZone(zone) {
  return clamp(10.5 + (zone - 1) * 1.05, 10.5, 21);
}

export function sanitizeSavedRun(value) {
  if (!value || typeof value !== 'object') return null;
  if (!Number.isFinite(value.distance) || !Number.isFinite(value.oxygen) || !Number.isFinite(value.hull)) return null;
  if (!Array.isArray(value.world)) return null;
  return {
    seed: Number.isInteger(value.seed) ? value.seed >>> 0 : 1,
    distance: clamp(value.distance, 0, 1000000),
    oxygen: clamp(value.oxygen, 1, 100),
    hull: clamp(Math.round(value.hull), 1, 3),
    sonar: clamp(Number(value.sonar) || 0, 0, 100),
    player: {
      x: clamp(Number(value.player?.x) || 0, -4.4, 4.4),
      y: clamp(Number(value.player?.y) || 0, -3.15, 3.15),
    },
    world: value.world.slice(0, 40).filter((entity) => entity && typeof entity.type === 'string' && Number.isFinite(entity.z)),
    nextSpawnZ: Number.isFinite(value.nextSpawnZ) ? value.nextSpawnZ : -90,
    pulses: Number.isFinite(value.pulses) ? Math.max(0, Math.floor(value.pulses)) : 0,
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : Date.now(),
  };
}
