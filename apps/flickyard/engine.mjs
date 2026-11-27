export const MODES = Object.freeze({
  flick: { title: 'Щелчок', subtitle: 'Flick / точность первого выстрела', hint: 'Переноси прицел одним движением и нажимай ЛКМ.' },
  track: { title: 'Ведение', subtitle: 'Tracking / контроль движения', hint: 'Зажми ЛКМ и удерживай прицел внутри движущейся мишени.' },
  switch: { title: 'Переключение', subtitle: 'Switch / перенос между целями', hint: 'Поражай активные мишени по очереди — не цепляйся за одну.' },
  reflex: { title: 'Реакция', subtitle: 'Reflex / короткое окно', hint: 'Мишень исчезает быстро. Успей заметить, перенести прицел и попасть.' },
  circuit: { title: 'Триатлон', subtitle: 'Circuit / короткая разминка', hint: 'Три этапа по 30 секунд: щелчок → ведение → переключение.' }
});

const DIFFICULTIES = Object.freeze({
  relaxed: { radius: 1.22, speed: 0.78, lifetime: 1.25, score: 0.82 },
  standard: { radius: 1, speed: 1, lifetime: 1, score: 1 },
  hard: { radius: 0.78, speed: 1.24, lifetime: 0.78, score: 1.28 }
});

const CIRCUIT_STAGES = ['flick', 'track', 'switch'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function random(session) {
  let value = session.rngState >>> 0;
  value = (value * 1664525 + 1013904223) >>> 0;
  session.rngState = value;
  return value / 4294967296;
}

function makeTarget(session, width, height, mode, index = 0) {
  const difficulty = DIFFICULTIES[session.difficulty] || DIFFICULTIES.standard;
  const minDimension = Math.min(width, height);
  const baseRadius = clamp(minDimension * 0.027, 13, 27);
  const radius = baseRadius * difficulty.radius * session.radiusScale * (mode === 'track' ? 1.12 : 1);
  const margin = Math.max(44, radius + 14);
  const usableWidth = Math.max(40, width - margin * 2);
  const usableHeight = Math.max(40, height - margin * 2);
  let x = margin + random(session) * usableWidth;
  let y = margin + random(session) * usableHeight;

  if (mode === 'switch') {
    x = margin + usableWidth * ((index + 0.5) / 3);
    y = height * (0.28 + random(session) * 0.42);
  }

  const moving = mode === 'track' || mode === 'switch' || mode === 'reflex';
  const angle = random(session) * Math.PI * 2;
  const speed = clamp(minDimension * 0.3, 76, 230) * difficulty.speed * (mode === 'track' ? 0.88 : 0.66);
  const lifetime = mode === 'reflex' ? 1500 * difficulty.lifetime : 0;

  return {
    id: session.targetSerial++,
    x,
    y,
    radius,
    vx: moving ? Math.cos(angle) * speed : 0,
    vy: moving ? Math.sin(angle) * speed * 0.72 : 0,
    moving,
    rotation: (random(session) - 0.5) * 0.18,
    turnIn: 650 + random(session) * 950,
    ttlMs: lifetime,
    maxTtlMs: lifetime,
    bornAt: session.elapsedMs,
    index
  };
}

function spawnTargets(session, width, height) {
  const mode = activeMode(session);
  session.activeTargetIndex = 0;
  if (mode === 'switch') {
    session.targets = [0, 1, 2].map((index) => makeTarget(session, width, height, mode, index));
  } else {
    session.targets = [makeTarget(session, width, height, mode)];
  }
}

export function activeMode(session) {
  if (session?.mode !== 'circuit') return session?.mode || 'flick';
  return CIRCUIT_STAGES[clamp(Math.floor(session.elapsedMs / 30000), 0, 2)];
}

export function createSession({ mode = 'flick', duration = 45, difficulty = 'standard', width = 1280, height = 720, seed = Date.now(), adaptive = true } = {}) {
  if (!MODES[mode]) throw new TypeError('Unknown training mode');
  if (!DIFFICULTIES[difficulty]) throw new TypeError('Unknown difficulty');
  const totalDuration = mode === 'circuit' ? 90 : clamp(Number(duration) || 45, 15, 180);
  const session = {
    mode,
    difficulty,
    durationMs: totalDuration * 1000,
    elapsedMs: 0,
    remainingMs: totalDuration * 1000,
    width,
    height,
    rngState: (Number(seed) >>> 0) || 1,
    targetSerial: 1,
    targets: [],
    activeTargetIndex: 0,
    status: 'running',
    shots: 0,
    hits: 0,
    misses: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    reactionTimes: [],
    heldMs: 0,
    onTargetMs: 0,
    trackStreakMs: 0,
    bestTrackMs: 0,
    radiusScale: 1,
    adaptive: Boolean(adaptive),
    stage: 0
  };
  spawnTargets(session, width, height);
  return session;
}

export function getActiveTarget(session) {
  if (!session?.targets?.length) return null;
  if (activeMode(session) === 'switch') return session.targets[session.activeTargetIndex] || null;
  return session.targets[0] || null;
}

function maybeAdapt(session) {
  if (!session.adaptive || session.shots < 8 || session.shots % 8 !== 0) return;
  const accuracy = session.hits / Math.max(1, session.shots);
  if (accuracy >= 0.86) session.radiusScale = clamp(session.radiusScale - 0.055, 0.72, 1.22);
  else if (accuracy <= 0.52) session.radiusScale = clamp(session.radiusScale + 0.065, 0.72, 1.22);
}

export function registerShot(session, x, y, width = session.width, height = session.height) {
  if (!session || session.status !== 'running' || activeMode(session) === 'track') return { kind: 'ignored' };
  const target = getActiveTarget(session);
  session.shots += 1;

  if (target && distance(target, { x, y }) <= target.radius) {
    const reactionMs = Math.max(0, session.elapsedMs - target.bornAt);
    const accuracyWithinTarget = 1 - distance(target, { x, y }) / target.radius;
    const streakBonus = Math.min(20, session.streak) * 3;
    const reactionBonus = clamp(Math.round((950 - reactionMs) / 18), 0, 38);
    const difficulty = DIFFICULTIES[session.difficulty] || DIFFICULTIES.standard;
    const points = Math.round((92 + accuracyWithinTarget * 58 + streakBonus + reactionBonus) * difficulty.score);
    session.hits += 1;
    session.streak += 1;
    session.bestStreak = Math.max(session.bestStreak, session.streak);
    session.reactionTimes.push(reactionMs);
    if (session.reactionTimes.length > 80) session.reactionTimes.shift();

    let completedSet = false;
    if (activeMode(session) === 'switch') {
      session.activeTargetIndex += 1;
      completedSet = session.activeTargetIndex >= session.targets.length;
      if (completedSet) spawnTargets(session, width, height);
    } else {
      spawnTargets(session, width, height);
    }
    session.score += points;
    maybeAdapt(session);
    return { kind: 'hit', target: { ...target }, points, reactionMs, completedSet, streak: session.streak };
  }

  session.misses += 1;
  session.streak = 0;
  session.score = Math.max(0, session.score - 14);
  maybeAdapt(session);
  return { kind: 'miss', target: target ? { ...target } : null, points: -14, streak: 0 };
}

export function updateSession(session, dt, width, height, holding = false, aim = { x: 0, y: 0 }) {
  if (!session || session.status !== 'running') return [];
  const delta = clamp(Number(dt) || 0, 0, 30000);
  const events = [];
  const previousStage = session.stage;
  session.elapsedMs = Math.min(session.durationMs, session.elapsedMs + delta);
  session.remainingMs = Math.max(0, session.durationMs - session.elapsedMs);

  if (session.mode === 'circuit') {
    session.stage = clamp(Math.floor(session.elapsedMs / 30000), 0, 2);
    if (session.stage !== previousStage) {
      spawnTargets(session, width, height);
      session.trackStreakMs = 0;
      events.push({ kind: 'stage', stage: session.stage, mode: activeMode(session) });
    }
  }

  const mode = activeMode(session);
  for (const target of session.targets) {
    if (!target.moving) continue;
    const seconds = delta / 1000;
    target.x += target.vx * seconds;
    target.y += target.vy * seconds;
    target.rotation += target.vx * seconds * 0.00042;
    target.turnIn -= delta;

    const edge = target.radius + 10;
    if (target.x < edge || target.x > width - edge) {
      target.x = clamp(target.x, edge, width - edge);
      target.vx *= -1;
    }
    if (target.y < edge || target.y > height - edge) {
      target.y = clamp(target.y, edge, height - edge);
      target.vy *= -1;
    }
    if (target.turnIn <= 0) {
      const turn = (random(session) - 0.5) * 0.9;
      const speed = Math.max(65, Math.hypot(target.vx, target.vy));
      const angle = Math.atan2(target.vy, target.vx) + turn;
      target.vx = Math.cos(angle) * speed;
      target.vy = Math.sin(angle) * speed * 0.72;
      target.turnIn = 650 + random(session) * 950;
    }
    if (mode === 'reflex') target.ttlMs -= delta;
  }

  if (mode === 'reflex' && session.targets[0]?.ttlMs <= 0) {
    const expired = session.targets[0];
    session.misses += 1;
    session.streak = 0;
    spawnTargets(session, width, height);
    events.push({ kind: 'expired', target: { ...expired } });
  }

  if (mode === 'track') {
    const target = session.targets[0];
    if (holding) {
      session.heldMs += delta;
      if (target && distance(target, aim) <= target.radius * 0.9) {
        session.onTargetMs += delta;
        session.trackStreakMs += delta;
        session.bestTrackMs = Math.max(session.bestTrackMs, session.trackStreakMs);
        session.score += delta * 0.19;
      } else {
        session.trackStreakMs = 0;
      }
    } else {
      session.trackStreakMs = 0;
    }
  }

  if (session.remainingMs <= 0) {
    session.status = 'finished';
    events.push({ kind: 'finished' });
  }
  return events;
}

export function resizeSession(session, width, height) {
  if (!session || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  const scaleX = width / Math.max(1, session.width);
  const scaleY = height / Math.max(1, session.height);
  for (const target of session.targets) {
    target.x *= scaleX;
    target.y *= scaleY;
    target.radius *= Math.min(scaleX, scaleY);
  }
  session.width = width;
  session.height = height;
}

export function getSessionSummary(session) {
  if (!session) return null;
  const clickAccuracy = session.shots ? session.hits / session.shots * 100 : 0;
  const onTargetPercent = session.heldMs ? session.onTargetMs / session.heldMs * 100 : 0;
  const averageReactionMs = session.reactionTimes.length
    ? session.reactionTimes.reduce((sum, value) => sum + value, 0) / session.reactionTimes.length
    : null;
  return {
    mode: session.mode,
    activeMode: activeMode(session),
    score: Math.round(session.score),
    hits: session.hits,
    misses: session.misses,
    shots: session.shots,
    accuracy: session.mode === 'track' ? onTargetPercent : clickAccuracy,
    clickAccuracy,
    onTargetPercent,
    averageReactionMs: averageReactionMs === null ? null : Math.round(averageReactionMs),
    bestStreak: session.bestStreak,
    heldMs: Math.round(session.heldMs),
    onTargetMs: Math.round(session.onTargetMs),
    durationSeconds: Math.round(session.durationMs / 1000),
    adaptiveRadius: Number(session.radiusScale.toFixed(2))
  };
}

export function getDifficultyLabel(value) {
  return ({ relaxed: 'Спокойно', standard: 'Стандарт', hard: 'Жёстко' })[value] || 'Стандарт';
}
