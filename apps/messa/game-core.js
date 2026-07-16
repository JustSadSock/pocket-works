export const TAU = Math.PI * 2;
export const CENTRAL_MU = 56;
export const SUN_RADIUS = 2.55;
export const OUTER_RADIUS = 13.6;
export const VOICE_COUNT = 8;
export const REWIND_COST = 0.42;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (from, to, amount) => from + (to - from) * amount;
export const length2 = (x, z) => Math.hypot(x, z);
export const distance2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function wrapAngle(value) {
  let angle = value % TAU;
  if (angle < 0) angle += TAU;
  return angle;
}

export function makeRandom(seed) {
  let value = seed >>> 0 || 0x17c0ffee;
  return () => {
    value = Math.imul(value ^ (value >>> 15), 1 | value);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function routeCode(seed) {
  return (seed >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(-7);
}

export function createWorld(seed) {
  const random = makeRandom(seed ^ 0x84a2f19d);
  const obstacles = [];
  for (let index = 0; index < 24; index += 1) {
    let radius = 3.8 + random() * 8.3;
    let angle = random() * TAU;
    if (distance2(Math.cos(angle) * radius, Math.sin(angle) * radius, 7, 0) < 1.75) {
      angle = wrapAngle(angle + .7);
      radius = Math.max(4.2, radius);
    }
    const direction = random() > .5 ? 1 : -1;
    const speed = direction * (.018 + random() * .068);
    obstacles.push({
      id: index,
      radius,
      angle,
      speed,
      phase: random() * TAU,
      size: .31 + random() * .35,
      height: 1.15 + random() * 2.65,
      lean: (random() - .5) * .38,
      family: index % 5 === 0 ? 'needle' : index % 3 === 0 ? 'choir' : 'slab'
    });
  }

  const targets = [];
  const targetRadii = [8.9, 5.1, 10.7, 6.8, 4.25, 9.7, 6.05, 11.5];
  let previousAngle = .3 + random() * .5;
  for (let index = 0; index < VOICE_COUNT; index += 1) {
    previousAngle = wrapAngle(previousAngle + 1.25 + random() * 1.4);
    targets.push({
      id: index,
      radius: clamp(targetRadii[index] + (random() - .5) * .7, 3.9, 12.1),
      angle: previousAngle,
      speed: (index % 2 ? -1 : 1) * (.006 + random() * .009),
      height: .42 + random() * .34
    });
  }

  return { seed: seed >>> 0, obstacles, targets };
}

export function obstaclePosition(obstacle, elapsed) {
  const angle = obstacle.angle + elapsed * obstacle.speed;
  const breathing = Math.sin(elapsed * .31 + obstacle.phase) * .16;
  const radius = obstacle.radius + breathing;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    angle
  };
}

export function targetPosition(target, elapsed) {
  const angle = target.angle + elapsed * target.speed;
  return { x: Math.cos(angle) * target.radius, z: Math.sin(angle) * target.radius, angle };
}

export function freshRun(seed) {
  const radius = 7;
  const softened = radius * radius + 1.35;
  const acceleration = CENTRAL_MU * radius / Math.pow(softened, 1.5);
  const speed = Math.sqrt(acceleration * radius);
  return {
    version: 1,
    seed: seed >>> 0,
    elapsed: 0,
    x: radius,
    z: 0,
    vx: 0,
    vz: speed,
    voice: 0,
    stability: 3,
    rewindEnergy: .48,
    score: 0,
    near: 0,
    rewinds: 0,
    bestCombo: 0,
    combo: 0,
    comboWindow: 0,
    invulnerable: .9
  };
}

export function sanitizeRun(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return null;
  const numeric = ['seed', 'elapsed', 'x', 'z', 'vx', 'vz', 'voice', 'stability', 'rewindEnergy', 'score', 'near', 'rewinds'];
  if (numeric.some((key) => !Number.isFinite(value[key]))) return null;
  if (value.voice < 0 || value.voice >= VOICE_COUNT || value.stability < 1 || value.stability > 3) return null;
  if (length2(value.x, value.z) < SUN_RADIUS - .2 || length2(value.x, value.z) > OUTER_RADIUS + .6) return null;
  return {
    version: 1,
    seed: value.seed >>> 0,
    elapsed: clamp(value.elapsed, 0, 60 * 60),
    x: clamp(value.x, -OUTER_RADIUS, OUTER_RADIUS),
    z: clamp(value.z, -OUTER_RADIUS, OUTER_RADIUS),
    vx: clamp(value.vx, -7, 7),
    vz: clamp(value.vz, -7, 7),
    voice: Math.floor(clamp(value.voice, 0, VOICE_COUNT - 1)),
    stability: Math.floor(clamp(value.stability, 1, 3)),
    rewindEnergy: clamp(value.rewindEnergy, 0, 1),
    score: Math.max(0, value.score),
    near: Math.max(0, Math.floor(value.near)),
    rewinds: Math.max(0, Math.floor(value.rewinds)),
    bestCombo: Math.max(0, Math.floor(value.bestCombo || 0)),
    combo: Math.max(0, Math.floor(value.combo || 0)),
    comboWindow: clamp(Number(value.comboWindow) || 0, 0, 8),
    invulnerable: .9
  };
}

export function serializeRun(run) {
  const rounded = (value, places = 4) => Number(value.toFixed(places));
  return {
    version: 1,
    seed: run.seed >>> 0,
    elapsed: rounded(run.elapsed, 2),
    x: rounded(run.x),
    z: rounded(run.z),
    vx: rounded(run.vx),
    vz: rounded(run.vz),
    voice: run.voice,
    stability: run.stability,
    rewindEnergy: rounded(run.rewindEnergy, 3),
    score: rounded(run.score, 1),
    near: run.near,
    rewinds: run.rewinds,
    bestCombo: run.bestCombo,
    combo: run.combo,
    comboWindow: rounded(run.comboWindow, 2)
  };
}

export function stepOrbit(run, well, deltaSeconds) {
  const dt = clamp(deltaSeconds, 0, .034);
  const radiusSquared = run.x * run.x + run.z * run.z;
  const softened = radiusSquared + 1.35;
  const centralFactor = -CENTRAL_MU / Math.pow(softened, 1.5);
  let ax = run.x * centralFactor;
  let az = run.z * centralFactor;

  if (well?.active) {
    const dx = well.x - run.x;
    const dz = well.z - run.z;
    const d2 = dx * dx + dz * dz + .72;
    const factor = (25 * clamp(well.power ?? 1, .15, 1.2)) / Math.pow(d2, 1.5);
    ax += dx * factor;
    az += dz * factor;
  }

  run.vx += ax * dt;
  run.vz += az * dt;
  const speed = length2(run.vx, run.vz);
  if (speed > 6.2) {
    const scale = 6.2 / speed;
    run.vx *= scale;
    run.vz *= scale;
  }
  // A near-lossless symplectic orbit. Noticeable drag would turn every run into
  // an unavoidable spiral toward the sun instead of a controllable instrument.
  const drag = Math.pow(.999998, dt * 60);
  run.vx *= drag;
  run.vz *= drag;
  run.x += run.vx * dt;
  run.z += run.vz * dt;
  run.elapsed += dt;
  run.invulnerable = Math.max(0, run.invulnerable - dt);
  run.comboWindow = Math.max(0, run.comboWindow - dt);
  if (run.comboWindow <= 0) run.combo = 0;
  run.score += dt * (12 + length2(run.vx, run.vz) * 7 + run.voice * 1.8) * (1 + run.combo * .08);
  return run;
}

export function collisionFor(run, world) {
  const radius = length2(run.x, run.z);
  if (radius < SUN_RADIUS) return { type: 'sun', id: 'sun', distance: SUN_RADIUS - radius };
  if (radius > OUTER_RADIUS) return { type: 'void', id: 'void', distance: radius - OUTER_RADIUS };
  if (run.invulnerable > 0) return null;

  let nearest = null;
  for (const obstacle of world.obstacles) {
    const position = obstaclePosition(obstacle, run.elapsed);
    const distance = distance2(run.x, run.z, position.x, position.z) - obstacle.size;
    if (!nearest || distance < nearest.distance) nearest = { type: 'monolith', id: obstacle.id, obstacle, position, distance };
  }
  return nearest && nearest.distance < .28 ? nearest : null;
}

export function proximityFor(run, world) {
  let nearest = null;
  for (const obstacle of world.obstacles) {
    const position = obstaclePosition(obstacle, run.elapsed);
    const distance = distance2(run.x, run.z, position.x, position.z) - obstacle.size;
    if (!nearest || distance < nearest.distance) nearest = { obstacle, position, distance };
  }
  return nearest;
}

export function canCollectVoice(run, world) {
  const target = world.targets[run.voice];
  if (!target) return false;
  const position = targetPosition(target, run.elapsed);
  return distance2(run.x, run.z, position.x, position.z) < .72;
}

export function awardVoice(run) {
  const speed = length2(run.vx, run.vz);
  run.voice += 1;
  run.combo += 1;
  run.comboWindow = 5.5;
  run.bestCombo = Math.max(run.bestCombo, run.combo);
  run.rewindEnergy = clamp(run.rewindEnergy + .28, 0, 1);
  run.score += 900 + speed * 240 + run.combo * 110;
  return run;
}

export function awardNearMiss(run, distance) {
  const precision = clamp(1 - Math.max(0, distance - .28) / .72, 0, 1);
  run.near += 1;
  run.combo += 1;
  run.comboWindow = 4.2;
  run.bestCombo = Math.max(run.bestCombo, run.combo);
  run.rewindEnergy = clamp(run.rewindEnergy + .075 + precision * .055, 0, 1);
  run.score += 130 + precision * 210 + run.combo * 30;
  return Math.round(precision * 100);
}

export function snapshot(run) {
  return {
    elapsed: run.elapsed,
    x: run.x,
    z: run.z,
    vx: run.vx,
    vz: run.vz
  };
}

export function restoreSnapshot(run, sample) {
  if (!sample) return run;
  run.elapsed = sample.elapsed;
  run.x = sample.x;
  run.z = sample.z;
  run.vx = sample.vx;
  run.vz = sample.vz;
  return run;
}
