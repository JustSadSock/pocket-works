// ШПИЛЬКА 2.3 — automatic steering ratio, daily routes, shareable codes, medals and stable impacts.

var shp23RouteOverride = null;
var shp23RouteMode = 'random';
var shp23MedalTargets = null;
var shp23TouchNoise = 0.018;
var shp23SteerPointer = null;
var shp23LastRawSteer = 0;
var shp23ContactPairs = new Map();
var shp23CollisionCounter = 1;
var shp23MedalRanks = { none: 0, bronze: 1, silver: 2, gold: 3 };
var shp23MedalLabels = { bronze: 'БРОНЗА', silver: 'СЕРЕБРО', gold: 'ЗОЛОТО' };
var shp23TypeByCode = { V: 'speed', T: 'technical', M: 'mountain', K: 'cascade' };

shpPrefs.steeringFeel = 'precise';
shpSavePrefs();

function shp23RouteCode(seed = trackSeed, archetype = shpActiveArchetype) {
  const prefix = archetype?.code || 'V';
  return `${prefix}-${(seed >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
}

function shp23ParseRouteCode(raw) {
  const normalized = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  const match = normalized.match(/^([VTMK])[-:]?([0-9A-Z]{1,7})$/);
  if (!match) return null;
  const seed = Number.parseInt(match[2], 36);
  if (!Number.isFinite(seed)) return null;
  return { seed: seed >>> 0, type: shp23TypeByCode[match[1]], code: `${match[1]}-${match[2].padStart(7, '0')}` };
}

function shp23DailySeed(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
  return hashSeed((day ^ 0x53a17d2b) >>> 0);
}

function shp23DailyLabel(date = new Date()) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date);
}

function shp23ComputeMedalTargets() {
  if (!track?.length) return null;
  let ideal = 0;
  for (let i = 0; i < track.length; i += 1) {
    const point = track[i];
    const next = track[(i + 1) % track.length];
    const distance = Math.hypot(next.x - point.x, next.y - point.y);
    const cornerSpeed = clamp((point.speedLimit || 520) * 0.90 + 28, 220, 690);
    ideal += distance / cornerSpeed;
  }
  const archetypePenalty = shpActiveArchetype?.id === 'technical' ? 1.2 : shpActiveArchetype?.id === 'mountain' ? 0.8 : 0.35;
  const jumpPenalty = shpRampIndices.length * 0.32;
  const gold = Math.max(7.5, ideal + 1.7 + archetypePenalty + jumpPenalty);
  return { gold, silver: gold * 1.14, bronze: gold * 1.31 };
}

function shp23MedalForTime(duration) {
  if (!shp23MedalTargets || !Number.isFinite(duration)) return 'none';
  if (duration <= shp23MedalTargets.gold) return 'gold';
  if (duration <= shp23MedalTargets.silver) return 'silver';
  if (duration <= shp23MedalTargets.bronze) return 'bronze';
  return 'none';
}

function shp23CurrentMedal() {
  return currentRouteRecord()?.medal || 'none';
}

function shp23UpdateRouteExtras() {
  const code = shp23RouteCode();
  const codeValue = document.querySelector('#routeCodeValue');
  const codeInput = document.querySelector('#routeCodeInput');
  const dailyButton = document.querySelector('#dailyRouteButton');
  const badge = document.querySelector('#routeModeBadge');
  if (codeValue) codeValue.textContent = code;
  if (codeInput && document.activeElement !== codeInput) codeInput.value = code;
  if (dailyButton) dailyButton.classList.toggle('is-active', shp23RouteMode === 'daily');
  if (badge) {
    badge.hidden = shp23RouteMode === 'random';
    badge.textContent = shp23RouteMode === 'daily' ? `ДЕНЬ ${shp23DailyLabel()}` : 'ПО КОДУ';
  }

  const earned = shp23CurrentMedal();
  for (const medal of ['bronze', 'silver', 'gold']) {
    const node = document.querySelector(`[data-medal="${medal}"]`);
    if (!node || !shp23MedalTargets) continue;
    const value = node.querySelector('b');
    if (value) value.textContent = formatTime(shp23MedalTargets[medal]);
    node.classList.toggle('is-earned', shp23MedalRanks[earned] >= shp23MedalRanks[medal]);
  }
}

var shp23BasePrepareRoute = prepareRoute;
prepareRoute = function shp23PrepareRoute(forceSeed = null) {
  const override = shp23RouteOverride;
  const previousType = shpPrefs.trackType;
  if (override?.type) shpPrefs.trackType = override.type;
  shp23BasePrepareRoute(override?.seed ?? forceSeed);
  shpPrefs.trackType = previousType;
  shp23RouteMode = override?.mode || 'random';
  shp23RouteOverride = null;
  shp23MedalTargets = shp23ComputeMedalTargets();
  shp23UpdateRouteExtras();
};

var shp23BaseUpdateRouteUi = updateRouteUi;
updateRouteUi = function shp23UpdateRouteUi() {
  shp23BaseUpdateRouteUi();
  const code = shp23RouteCode();
  routeMeta.textContent = routeMeta.textContent.replace(/КОД\s+[^·]+$/u, `КОД ${code}`);
  shp23UpdateRouteExtras();
};

function shp23StoreMedal(duration) {
  const medal = shp23MedalForTime(duration);
  if (medal === 'none') return;
  const key = String(trackSeed);
  const old = saved.routeRecords[key] || {};
  const previous = old.medal || 'none';
  if (shp23MedalRanks[medal] <= shp23MedalRanks[previous]) return;
  saved.routeRecords[key] = { ...old, medal, updatedAt: Date.now() };
  saveState();
  showRaceMessage(shp23MedalLabels[medal], 0.9);
  audio.blip('lap', medal === 'gold' ? 1 : 0.78);
  navigator.vibrate?.(medal === 'gold' ? [10, 26, 10] : 8);
  shp23UpdateRouteExtras();
}

var shp23BaseStoreBestLap = shpStoreBestLap;
shpStoreBestLap = function shp23StoreBestLap(duration) {
  shp23BaseStoreBestLap(duration);
  shp23StoreMedal(duration);
};

var shp23BaseSetupRace = setupRace;
setupRace = function shp23SetupRace() {
  shp23BaseSetupRace();
  shp23ContactPairs.clear();
  cars.forEach((car) => {
    car.shpCollisionId = shp23CollisionCounter++;
    car.bodyRattle = 0;
  });
  shp23UpdateRouteExtras();
};

function shp23AdaptiveSteer(raw) {
  const magnitude = Math.abs(raw);
  if (magnitude < 0.0001) return 0;
  const speedRatio = player ? clamp(Math.abs(player.forwardSpeed || 0) / MAX_SPEED, 0, 1) : 0;
  const slipRatio = player ? clamp((Math.abs(player.lateralSpeed || 0) + Math.abs(player.yawRate || 0) * 34) / 420, 0, 1) : 0;
  const ratio = clamp(1.08 - smoothstep(0.16, 0.96, speedRatio) * 0.42 - slipRatio * 0.10, 0.54, 1.08);
  const shaped = magnitude * ratio + Math.pow(magnitude, 3) * (1 - ratio);
  return Math.sign(raw) * clamp(shaped, 0, 1);
}

var shp23BasePlayerControls = playerControls;
playerControls = function shp23PlayerControls() {
  const commands = shp23BasePlayerControls();
  return { ...commands, steer: shp23AdaptiveSteer(commands.steer) };
};

function shp23BindAutomaticCalibration() {
  const arc = document.querySelector('#steeringArc');
  if (!arc) return;

  const calibrate = (event) => {
    if (event.pointerId !== shp23SteerPointer) return;
    const rect = arc.getBoundingClientRect();
    const raw = clamp((event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1, -1, 1);
    const delta = Math.abs(raw - shp23LastRawSteer);
    if (Math.abs(raw) < 0.17) shp23TouchNoise = lerp(shp23TouchNoise, clamp(delta, 0.006, 0.055), 0.08);
    else shp23TouchNoise = lerp(shp23TouchNoise, 0.018, 0.018);
    shp23LastRawSteer = raw;
    const deadZone = clamp(shp23TouchNoise * 1.8, 0.026, 0.065);
    const calibrated = Math.sign(raw) * clamp((Math.abs(raw) - deadZone) / (1 - deadZone), 0, 1);
    shpAnalog.steer = Math.sign(calibrated) * Math.pow(Math.abs(calibrated), 1.48);
    shpRenderPrecisionControls();
  };

  arc.addEventListener('pointerdown', (event) => {
    shp23SteerPointer = event.pointerId;
    shp23LastRawSteer = 0;
    calibrate(event);
  });
  arc.addEventListener('pointermove', calibrate);
  const release = (event) => {
    if (event.pointerId != null && event.pointerId !== shp23SteerPointer) return;
    shp23SteerPointer = null;
    shp23LastRawSteer = 0;
  };
  arc.addEventListener('pointerup', release);
  arc.addEventListener('pointercancel', release);
  arc.addEventListener('lostpointercapture', () => { shp23SteerPointer = null; shp23LastRawSteer = 0; });
}

function shp23SupportPoint(car, dirX, dirY) {
  const basis = carBasis(car);
  const forwardSign = basis.fx * dirX + basis.fy * dirY >= 0 ? 1 : -1;
  const rightSign = basis.rx * dirX + basis.ry * dirY >= 0 ? 1 : -1;
  return {
    x: car.x + basis.fx * CAR_HALF_LENGTH * forwardSign + basis.rx * CAR_HALF_WIDTH * rightSign,
    y: car.y + basis.fy * CAR_HALF_LENGTH * forwardSign + basis.ry * CAR_HALF_WIDTH * rightSign
  };
}

function shp23VelocityAtPoint(car, rx, ry) {
  return { x: car.vx - (car.yawRate || 0) * ry, y: car.vy + (car.yawRate || 0) * rx };
}

function shp23ApplyImpulse(car, impulseX, impulseY, rx, ry, direction) {
  car.vx += impulseX * direction;
  car.vy += impulseY * direction;
  const inertia = 1 / 300;
  car.yawRate += (rx * impulseY - ry * impulseX) * inertia * direction;
}

function shp23PairKey(a, b) {
  const left = Math.min(a.shpCollisionId || 0, b.shpCollisionId || 0);
  const right = Math.max(a.shpCollisionId || 0, b.shpCollisionId || 0);
  return `${left}:${right}`;
}

function shp23ImpactFeedback(a, b, impact, x, y, nx, ny) {
  const key = shp23PairKey(a, b);
  const previous = shp23ContactPairs.get(key) ?? -Infinity;
  if (raceElapsed - previous < 0.20 || impact < 24) return;
  shp23ContactPairs.set(key, raceElapsed);
  a.collisionCooldown = Math.max(a.collisionCooldown || 0, 0.14);
  b.collisionCooldown = Math.max(b.collisionCooldown || 0, 0.14);
  spawnSparks(x, y, nx, ny, clamp(impact / 220, 0.22, 1));
  if (a.player || b.player) {
    cameraShake = prefersReducedMotion ? 1 : clamp(impact * 0.042, 2, 11);
    audio.blip('impact', clamp(impact / 230, 0.22, 0.92));
    navigator.vibrate?.(Math.round(clamp(impact * 0.055, 7, 28)));
  }
}

resolvePairCollision = function shp23ResolvePairCollision(a, b) {
  if (a.airborne !== b.airborne || Math.abs((a.z || 0) - (b.z || 0)) > 18) return;
  const basisA = carBasis(a);
  const basisB = carBasis(b);
  const axes = [[basisA.fx, basisA.fy], [basisA.rx, basisA.ry], [basisB.fx, basisB.fy], [basisB.rx, basisB.ry]];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let overlap = Infinity;
  let normalX = 0;
  let normalY = 0;

  for (const [axisXRaw, axisYRaw] of axes) {
    const magnitude = Math.hypot(axisXRaw, axisYRaw) || 1;
    const axisX = axisXRaw / magnitude;
    const axisY = axisYRaw / magnitude;
    const signedDistance = dx * axisX + dy * axisY;
    const candidate = projectionRadius(a, axisX, axisY) + projectionRadius(b, axisX, axisY) - Math.abs(signedDistance);
    if (candidate <= 0) return;
    if (candidate < overlap) {
      overlap = candidate;
      const sign = signedDistance < 0 ? -1 : 1;
      normalX = axisX * sign;
      normalY = axisY * sign;
    }
  }

  const correction = Math.max(0, overlap - 0.35) * 0.48;
  a.x -= normalX * correction;
  a.y -= normalY * correction;
  b.x += normalX * correction;
  b.y += normalY * correction;

  const supportA = shp23SupportPoint(a, normalX, normalY);
  const supportB = shp23SupportPoint(b, -normalX, -normalY);
  const contactX = (supportA.x + supportB.x) * 0.5;
  const contactY = (supportA.y + supportB.y) * 0.5;
  const rAx = contactX - a.x;
  const rAy = contactY - a.y;
  const rBx = contactX - b.x;
  const rBy = contactY - b.y;
  const velocityA = shp23VelocityAtPoint(a, rAx, rAy);
  const velocityB = shp23VelocityAtPoint(b, rBx, rBy);
  const relativeX = velocityB.x - velocityA.x;
  const relativeY = velocityB.y - velocityA.y;
  const normalVelocity = relativeX * normalX + relativeY * normalY;
  const crossA = rAx * normalY - rAy * normalX;
  const crossB = rBx * normalY - rBy * normalX;
  const denominator = 2 + crossA * crossA / 300 + crossB * crossB / 300;
  const impact = Math.max(0, -normalVelocity);
  const restitution = lerp(0.14, 0.34, smoothstep(35, 260, impact));
  const separationBias = clamp(Math.max(0, overlap - 0.5) * 13, 0, 95);
  const impulseMagnitude = Math.max(0, (-(1 + restitution) * Math.min(normalVelocity, 0) + separationBias) / Math.max(0.1, denominator));

  if (impulseMagnitude > 0) {
    const impulseX = normalX * impulseMagnitude;
    const impulseY = normalY * impulseMagnitude;
    shp23ApplyImpulse(a, impulseX, impulseY, rAx, rAy, -1);
    shp23ApplyImpulse(b, impulseX, impulseY, rBx, rBy, 1);

    const tangentX = -normalY;
    const tangentY = normalX;
    const tangentVelocity = relativeX * tangentX + relativeY * tangentY;
    const tangentCrossA = rAx * tangentY - rAy * tangentX;
    const tangentCrossB = rBx * tangentY - rBy * tangentX;
    const tangentDenominator = 2 + tangentCrossA * tangentCrossA / 300 + tangentCrossB * tangentCrossB / 300;
    const frictionMagnitude = clamp(-tangentVelocity / Math.max(0.1, tangentDenominator), -impulseMagnitude * 0.34, impulseMagnitude * 0.34);
    const frictionX = tangentX * frictionMagnitude;
    const frictionY = tangentY * frictionMagnitude;
    shp23ApplyImpulse(a, frictionX, frictionY, rAx, rAy, -1);
    shp23ApplyImpulse(b, frictionX, frictionY, rBx, rBy, 1);
  }

  a.bodyRattle = 0;
  b.bodyRattle = 0;
  shp23ImpactFeedback(a, b, impact + separationBias * 0.35, contactX, contactY, normalX, normalY);
};

resolveRoadCollision = function shp23ResolveRoadCollision(car) {
  const point = track[car.trackIndex];
  if (!point) return;
  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const rightX = -forwardY;
  const rightY = forwardX;
  const projectedHalfExtent = Math.abs(forwardX * point.nx + forwardY * point.ny) * CAR_HALF_LENGTH
    + Math.abs(rightX * point.nx + rightY * point.ny) * CAR_HALF_WIDTH;
  const barrierLimit = roadHalf + 24 - projectedHalfExtent;
  const signed = car.signedRoadOffset;
  const absolute = Math.abs(signed);
  if (absolute <= barrierLimit) return;

  const side = Math.sign(signed) || 1;
  const penetration = absolute - barrierLimit;
  const nx = point.nx * side;
  const ny = point.ny * side;
  car.x -= nx * (penetration + 0.3);
  car.y -= ny * (penetration + 0.3);
  car.signedRoadOffset -= side * (penetration + 0.3);
  const outward = car.vx * nx + car.vy * ny;
  if (outward <= 0) return;

  const restitution = lerp(0.16, 0.32, smoothstep(45, 280, outward));
  car.vx -= nx * outward * (1 + restitution);
  car.vy -= ny * outward * (1 + restitution);
  const tangentX = -ny;
  const tangentY = nx;
  const tangentSpeed = car.vx * tangentX + car.vy * tangentY;
  car.vx -= tangentX * tangentSpeed * 0.035;
  car.vy -= tangentY * tangentSpeed * 0.035;
  car.yawRate += clamp(-side * tangentSpeed * outward * 0.0000028, -0.75, 0.75);
  car.bodyRattle = 0;

  if ((car.collisionCooldown || 0) <= 0) {
    car.collisionCooldown = 0.18;
    spawnSparks(car.x + nx * projectedHalfExtent, car.y + ny * projectedHalfExtent, nx, ny, clamp(outward / 230, 0.24, 1));
    if (car.player) {
      cameraShake = prefersReducedMotion ? 1 : clamp(outward * 0.045, 2, 12);
      audio.blip('impact', clamp(outward / 260, 0.24, 1));
      navigator.vibrate?.(Math.round(clamp(outward * 0.05, 7, 30)));
    }
  }
};

var shp23BaseDrawCar = drawCar;
drawCar = function shp23DrawCar(car) {
  car.bodyRattle = 0;
  shp23BaseDrawCar(car);
  car.bodyRattle = 0;
};

var shp23BaseFinishRace = finishRace;
finishRace = function shp23FinishRace() {
  shp23BaseFinishRace();
  const medal = shp23MedalForTime(player?.bestLap);
  if (medal !== 'none') finishSummary.textContent += ` Медаль: ${shp23MedalLabels[medal]}.`;
  else if (shp23MedalTargets && Number.isFinite(player?.bestLap)) finishSummary.textContent += ` До бронзы ${(player.bestLap - shp23MedalTargets.bronze).toFixed(2)} с.`;
};

function shp23SetCodeStatus(text, error = false) {
  const node = document.querySelector('#routeCodeStatus');
  if (!node) return;
  node.textContent = text;
  node.dataset.error = String(error);
}

async function shp23CopyCode() {
  const code = shp23RouteCode();
  try {
    await navigator.clipboard.writeText(code);
    shp23SetCodeStatus(`СКОПИРОВАНО: ${code}`);
  } catch {
    const input = document.querySelector('#routeCodeInput');
    if (input) {
      input.value = code;
      input.select();
      document.execCommand?.('copy');
    }
    shp23SetCodeStatus(`КОД: ${code}`);
  }
}

function shp23LoadCode() {
  const input = document.querySelector('#routeCodeInput');
  const parsed = shp23ParseRouteCode(input?.value);
  if (!parsed) {
    shp23SetCodeStatus('НЕВЕРНЫЙ КОД. ПРИМЕР: T-01K9CZ4', true);
    return;
  }
  shp23RouteOverride = { seed: parsed.seed, type: parsed.type, mode: 'code' };
  prepareRoute();
  setupRace();
  shp23SetCodeStatus(`ЗАГРУЖЕНО: ${shp23RouteCode()}`);
  audio.blip('menu', 0.7);
}

function shp23BindRouteTools() {
  const dailyButton = document.querySelector('#dailyRouteButton');
  const codeButton = document.querySelector('#routeCodeButton');
  const panel = document.querySelector('#routeCodePanel');
  const input = document.querySelector('#routeCodeInput');
  dailyButton?.addEventListener('click', () => {
    shp23RouteOverride = { seed: shp23DailySeed(), type: 'mix', mode: 'daily' };
    prepareRoute();
    setupRace();
    shp23SetCodeStatus(`МАРШРУТ ДНЯ · ${shp23DailyLabel()}`);
    audio.blip('menu', 0.72);
  });
  codeButton?.addEventListener('click', () => {
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      if (input) input.value = shp23RouteCode();
      input?.focus();
      input?.select();
    }
  });
  document.querySelector('#loadRouteCodeButton')?.addEventListener('click', shp23LoadCode);
  document.querySelector('#copyRouteCodeButton')?.addEventListener('click', shp23CopyCode);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') shp23LoadCode();
  });
}

shp23BindAutomaticCalibration();
shp23BindRouteTools();
