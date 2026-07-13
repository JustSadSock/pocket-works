// ШПИЛЬКА 2.3 — automatic steering ratio, compact calibration, daily routes, route codes, medals and stable impacts.

var shp23TypeLetters = { speed: 'V', technical: 'T', mountain: 'M', cascade: 'K' };
var shp23LetterTypes = { V: 'speed', T: 'technical', M: 'mountain', K: 'cascade' };
var shp23RouteContext = { mode: 'random', code: '', date: '' };
var shp23LoadingRoute = null;
var shp23MedalTargets = null;
var shp23CollisionIds = new WeakMap();
var shp23NextCollisionId = 1;
var shp23PairEffects = new Map();

shpPrefs.steeringFeel = 'direct';
shpPrefs.hand = shpPrefs.hand === 'left' ? 'left' : 'right';
if (!shpPrefs.layout || !Number.isFinite(shpPrefs.layout.steerX) || !Number.isFinite(shpPrefs.layout.powerX)) {
  shpPrefs.layout = shpPrefs.hand === 'left'
    ? { steerX: 0.72, powerX: 0.14, lift: 0 }
    : { steerX: 0.28, powerX: 0.86, lift: 0 };
}
shpSavePrefs();

function shp23PadBase36(value, length) {
  return (value >>> 0).toString(36).toUpperCase().padStart(length, '0').slice(-length);
}

function shp23RouteChecksum(typeLetter, seed) {
  return ((hashSeed((seed >>> 0) ^ typeLetter.charCodeAt(0) * 0x45d9f3b) >>> 0) % 36).toString(36).toUpperCase();
}

function shp23EncodeRoute(type, seed) {
  const letter = shp23TypeLetters[type] || 'V';
  const body = shp23PadBase36(seed, 7);
  return `${letter}-${body}-${shp23RouteChecksum(letter, seed)}`;
}

function shp23ParseRouteCode(raw) {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 9) return { error: 'НУЖЕН КОД ИЗ 9 ЗНАКОВ' };
  const letter = clean[0];
  const type = shp23LetterTypes[letter];
  if (!type) return { error: 'НЕИЗВЕСТНЫЙ ТИП ТРАССЫ' };
  const seed = Number.parseInt(clean.slice(1, 8), 36);
  if (!Number.isFinite(seed) || seed < 0 || seed > 0xffffffff) return { error: 'КОД ПОВРЕЖДЁН' };
  const expected = shp23RouteChecksum(letter, seed);
  if (clean[8] !== expected) return { error: 'НЕ СОШЛАСЬ КОНТРОЛЬНАЯ БУКВА' };
  return { type, seed: seed >>> 0, code: shp23EncodeRoute(type, seed) };
}

function shp23UtcDateKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function shp23DailyRoute() {
  const date = shp23UtcDateKey();
  const seed = hashSeed(Number(date) ^ 0x73a9c41d);
  const types = ['speed', 'technical', 'mountain', 'cascade'];
  const type = types[(seed >>> 7) % types.length];
  return { mode: 'daily', type, seed, code: shp23EncodeRoute(type, seed), date };
}

function shp23SegmentLength(index) {
  const a = track[index];
  const b = track[(index + 1) % track.length];
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function shp23ComputeMedalTargets() {
  if (!track?.length) return null;
  const count = track.length;
  const limits = new Array(count);
  const speeds = new Array(count);

  for (let i = 0; i < count; i += 1) {
    let curvature = 0;
    for (let j = 0; j <= 18; j += 3) curvature = Math.max(curvature, Math.abs(track[(i + j) % count].curvature || 0));
    const corner = clamp(1135 / (1 + curvature * 585), 345, MAX_SPEED * 0.985);
    limits[i] = corner;
    speeds[i] = corner;
  }

  const acceleration = 510;
  const braking = 735;
  for (let pass = 0; pass < 5; pass += 1) {
    for (let i = 0; i < count; i += 1) {
      const next = (i + 1) % count;
      const ds = Math.max(1, shp23SegmentLength(i));
      speeds[next] = Math.min(speeds[next], limits[next], Math.sqrt(speeds[i] * speeds[i] + 2 * acceleration * ds));
    }
    for (let i = count - 1; i >= 0; i -= 1) {
      const next = (i + 1) % count;
      const ds = Math.max(1, shp23SegmentLength(i));
      speeds[i] = Math.min(speeds[i], limits[i], Math.sqrt(speeds[next] * speeds[next] + 2 * braking * ds));
    }
  }

  let reference = 0;
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count;
    const ds = Math.max(1, shp23SegmentLength(i));
    reference += 2 * ds / Math.max(80, speeds[i] + speeds[next]);
  }

  const complexity = shpActiveArchetype?.id === 'technical' ? 1.035 : shpActiveArchetype?.id === 'mountain' ? 1.02 : 1;
  reference *= complexity;
  return {
    reference,
    gold: reference * 1.105 + 0.65,
    silver: reference * 1.235 + 1.1,
    bronze: reference * 1.405 + 1.8
  };
}

function shp23MedalForTime(time) {
  if (!shp23MedalTargets || !Number.isFinite(time)) return null;
  if (time <= shp23MedalTargets.gold) return 'gold';
  if (time <= shp23MedalTargets.silver) return 'silver';
  if (time <= shp23MedalTargets.bronze) return 'bronze';
  return null;
}

function shp23MedalLabel(medal) {
  return medal === 'gold' ? 'ЗОЛОТО' : medal === 'silver' ? 'СЕРЕБРО' : medal === 'bronze' ? 'БРОНЗА' : 'БЕЗ МЕДАЛИ';
}

function shp23CurrentCode() {
  return shp23EncodeRoute(shpActiveArchetype?.id || 'speed', trackSeed >>> 0);
}

function shp23UpdateRouteExtras() {
  const code = shp23RouteContext.code || shp23CurrentCode();
  const codeNode = document.querySelector('#routeCodeValue');
  if (codeNode) codeNode.textContent = code;

  const todayButton = document.querySelector('#todayRouteButton');
  if (todayButton) todayButton.classList.toggle('is-selected', shp23RouteContext.mode === 'daily');

  const medalStrip = document.querySelector('#medalStrip');
  if (medalStrip && shp23MedalTargets) {
    medalStrip.hidden = false;
    medalStrip.querySelector('[data-medal="gold"] b').textContent = formatTime(shp23MedalTargets.gold);
    medalStrip.querySelector('[data-medal="silver"] b').textContent = formatTime(shp23MedalTargets.silver);
    medalStrip.querySelector('[data-medal="bronze"] b').textContent = formatTime(shp23MedalTargets.bronze);
    const recordMedal = currentRouteRecord()?.medal || shp23MedalForTime(currentRouteRecord()?.bestLap);
    medalStrip.dataset.record = recordMedal || 'none';
  }
}

var shp23BaseUpdateRouteUi = updateRouteUi;
updateRouteUi = function shp23UpdateRouteUi() {
  shp23BaseUpdateRouteUi();
  const code = shp23RouteContext.code || shp23CurrentCode();
  const daily = shp23RouteContext.mode === 'daily' ? ' · СЕГОДНЯ' : '';
  routeMeta.textContent = routeMeta.textContent.replace(/ · КОД [^·]+$/, '') + `${daily} · ${code}`;
  shp23UpdateRouteExtras();
};

var shp23BasePrepareRoute = prepareRoute;
prepareRoute = function shp23PrepareRoute(forceSeed = null) {
  const request = shp23LoadingRoute;
  const previousTrackType = shpPrefs.trackType;
  if (request?.type) shpPrefs.trackType = request.type;
  shp23RouteContext = request
    ? { mode: request.mode, code: request.code, date: request.date || '' }
    : { mode: 'random', code: '', date: '' };
  shp23BasePrepareRoute(forceSeed);
  shpPrefs.trackType = previousTrackType;
  shp23LoadingRoute = null;
  shp23MedalTargets = shp23ComputeMedalTargets();
  shp23UpdateRouteExtras();
};

function shp23LoadRoute(request) {
  shp23LoadingRoute = request;
  prepareRoute(request.seed >>> 0);
  setupRace();
  showRaceMessage(request.mode === 'daily' ? 'ТРАССА ДНЯ' : 'КОД ЗАГРУЖЕН', 0.65);
}

function shp23SaveMedal(time) {
  const medal = shp23MedalForTime(time);
  if (!medal) return null;
  const key = String(trackSeed);
  const old = saved.routeRecords[key] || {};
  const rank = { bronze: 1, silver: 2, gold: 3 };
  const best = rank[medal] > (rank[old.medal] || 0) ? medal : old.medal;
  saved.routeRecords[key] = { ...old, medal: best, updatedAt: Date.now() };
  saveState();
  shp23UpdateRouteExtras();
  return medal;
}

var shp23BaseStoreBestLap = shpStoreBestLap;
shpStoreBestLap = function shp23StoreBestLap(duration) {
  shp23BaseStoreBestLap(duration);
  shp23SaveMedal(duration);
};

var shp23BaseStoreRouteRecord = storeRouteRecord;
storeRouteRecord = function shp23StoreRouteRecord() {
  shp23BaseStoreRouteRecord();
  if (player?.bestLap != null) shp23SaveMedal(player.bestLap);
};

var shp23BasePlayerControls = playerControls;
playerControls = function shp23PlayerControls() {
  const commands = shp23BasePlayerControls();
  if (shpPrefs.controlMode === 'buttons' || input.left || input.right) return commands;
  const raw = clamp(commands.steer, -1, 1);
  const speedRatio = clamp(Math.abs(player?.forwardSpeed || 0) / MAX_SPEED, 0, 1);
  const exponent = lerp(0.96, 1.78, smoothstep(0.10, 0.92, speedRatio));
  const shaped = Math.sign(raw) * Math.pow(Math.abs(raw), exponent);
  const slipDamping = 1 - clamp(Math.abs(player?.lateralSpeed || 0) / 620, 0, 0.16);
  return { ...commands, steer: clamp(shaped * slipDamping, -1, 1) };
};

function shp23CollisionId(car) {
  if (!shp23CollisionIds.has(car)) shp23CollisionIds.set(car, shp23NextCollisionId++);
  return shp23CollisionIds.get(car);
}

function shp23ContactVelocity(car, rx, ry) {
  return { x: car.vx - car.yawRate * ry, y: car.vy + car.yawRate * rx };
}

function shp23Cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function shp23ImpactEffects(a, b, x, y, nx, ny, strength) {
  const first = Math.min(shp23CollisionId(a), shp23CollisionId(b));
  const second = Math.max(shp23CollisionId(a), shp23CollisionId(b));
  const key = `${first}:${second}`;
  const now = raceElapsed;
  if ((shp23PairEffects.get(key) || -Infinity) > now - 0.18) return;
  shp23PairEffects.set(key, now);
  spawnSparks(x, y, nx, ny, clamp(strength / 240, 0.22, 1));
  if (a.player || b.player) {
    cameraShake = prefersReducedMotion ? 1 : clamp(strength * 0.035, 2, 10);
    audio.blip('impact', clamp(strength / 260, 0.22, 0.92));
    navigator.vibrate?.(Math.round(clamp(strength * 0.045, 7, 25)));
  }
}

resolvePairCollision = function shp23ResolvePairCollision(a, b) {
  if (a.airborne !== b.airborne || Math.abs(a.z - b.z) > 18) return;
  const basisA = carBasis(a);
  const basisB = carBasis(b);
  const axes = [[basisA.fx, basisA.fy], [basisA.rx, basisA.ry], [basisB.fx, basisB.fy], [basisB.rx, basisB.ry]];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let overlap = Infinity;
  let nx = 0;
  let ny = 0;

  for (const [rawX, rawY] of axes) {
    const magnitude = Math.hypot(rawX, rawY) || 1;
    const axisX = rawX / magnitude;
    const axisY = rawY / magnitude;
    const distance = dx * axisX + dy * axisY;
    const current = projectionRadius(a, axisX, axisY) + projectionRadius(b, axisX, axisY) - Math.abs(distance);
    if (current <= 0) return;
    if (current < overlap) {
      overlap = current;
      const sign = distance < 0 ? -1 : 1;
      nx = axisX * sign;
      ny = axisY * sign;
    }
  }

  const correction = Math.max(0, overlap - 0.35) * 0.53;
  a.x -= nx * correction;
  a.y -= ny * correction;
  b.x += nx * correction;
  b.y += ny * correction;

  const contactX = (a.x + b.x) * 0.5;
  const contactY = (a.y + b.y) * 0.5;
  const rax = contactX - a.x;
  const ray = contactY - a.y;
  const rbx = contactX - b.x;
  const rby = contactY - b.y;
  const velocityA = shp23ContactVelocity(a, rax, ray);
  const velocityB = shp23ContactVelocity(b, rbx, rby);
  const relativeX = velocityB.x - velocityA.x;
  const relativeY = velocityB.y - velocityA.y;
  const normalVelocity = relativeX * nx + relativeY * ny;
  if (normalVelocity >= -1.2) return;

  const invMass = 1;
  const invInertia = 1 / 340;
  const raCrossN = shp23Cross(rax, ray, nx, ny);
  const rbCrossN = shp23Cross(rbx, rby, nx, ny);
  const normalMass = invMass * 2 + raCrossN * raCrossN * invInertia + rbCrossN * rbCrossN * invInertia;
  const restitution = lerp(0.10, 0.34, clamp((-normalVelocity - 20) / 330, 0, 1));
  const impulse = clamp(-(1 + restitution) * normalVelocity / Math.max(0.001, normalMass), 0, 470);
  const impulseX = nx * impulse;
  const impulseY = ny * impulse;

  a.vx -= impulseX;
  a.vy -= impulseY;
  b.vx += impulseX;
  b.vy += impulseY;
  a.yawRate -= raCrossN * impulse * invInertia;
  b.yawRate += rbCrossN * impulse * invInertia;

  const tx = -ny;
  const ty = nx;
  const postA = shp23ContactVelocity(a, rax, ray);
  const postB = shp23ContactVelocity(b, rbx, rby);
  const tangentVelocity = (postB.x - postA.x) * tx + (postB.y - postA.y) * ty;
  const raCrossT = shp23Cross(rax, ray, tx, ty);
  const rbCrossT = shp23Cross(rbx, rby, tx, ty);
  const tangentMass = invMass * 2 + raCrossT * raCrossT * invInertia + rbCrossT * rbCrossT * invInertia;
  const friction = clamp(-tangentVelocity / Math.max(0.001, tangentMass), -impulse * 0.34, impulse * 0.34);
  a.vx -= tx * friction;
  a.vy -= ty * friction;
  b.vx += tx * friction;
  b.vy += ty * friction;
  a.yawRate -= raCrossT * friction * invInertia;
  b.yawRate += rbCrossT * friction * invInertia;

  const strength = Math.abs(normalVelocity) + Math.abs(tangentVelocity) * 0.22;
  if (strength > 28) shp23ImpactEffects(a, b, contactX, contactY, nx, ny, strength);
};

resolveRoadCollision = function shp23ResolveRoadCollision(car) {
  const point = track[car.trackIndex];
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
  const nx = point.nx * side;
  const ny = point.ny * side;
  const penetration = absolute - barrierLimit;
  car.x -= nx * (penetration + 0.45);
  car.y -= ny * (penetration + 0.45);

  const outward = car.vx * nx + car.vy * ny;
  if (outward <= 0.8) return;
  const restitution = lerp(0.13, 0.36, clamp((outward - 35) / 360, 0, 1));
  car.vx -= nx * outward * (1 + restitution);
  car.vy -= ny * outward * (1 + restitution);

  const tx = -ny;
  const ty = nx;
  const tangential = car.vx * tx + car.vy * ty;
  const scrape = clamp(0.08 + outward / 1800, 0.08, 0.22);
  car.vx -= tx * tangential * scrape;
  car.vy -= ty * tangential * scrape;

  const noseSide = forwardX * nx + forwardY * ny;
  car.yawRate -= side * clamp(outward / 175, 0.12, 2.25) * (0.58 + Math.abs(noseSide) * 0.72);
  car.collisionCooldown = Math.max(car.collisionCooldown, 0.13);

  if (car._shp23BarrierEffectAt == null || raceElapsed - car._shp23BarrierEffectAt > 0.15) {
    car._shp23BarrierEffectAt = raceElapsed;
    spawnSparks(car.x - nx * CAR_HALF_WIDTH, car.y - ny * CAR_HALF_WIDTH, nx, ny, clamp(outward / 250, 0.24, 1));
    if (car.player) {
      cameraShake = prefersReducedMotion ? 1 : clamp(outward * 0.045, 2, 12);
      audio.blip('impact', clamp(outward / 285, 0.24, 1));
      navigator.vibrate?.(Math.round(clamp(outward * 0.05, 7, 28)));
    }
  }
};

if (typeof shpBaseDrawCar === 'function') {
  drawCar = function shp23DrawCarStable(car) {
    shpBaseDrawCar(car);
  };
}

function shp23DefaultLayout(hand = shpPrefs.hand) {
  return hand === 'left'
    ? { steerX: 0.72, powerX: 0.14, lift: 0 }
    : { steerX: 0.28, powerX: 0.86, lift: 0 };
}

function shp23ApplyControlLayout() {
  const layout = shpPrefs.layout || shp23DefaultLayout();
  const steerX = clamp(layout.steerX, 0.18, 0.82);
  const powerX = clamp(layout.powerX, 0.10, 0.90);
  const lift = clamp(layout.lift || 0, 0, 62);
  controls.style.setProperty('--steer-center', `${steerX * 100}%`);
  controls.style.setProperty('--power-center', `${powerX * 100}%`);
  controls.style.setProperty('--control-lift', `${lift}px`);
  controls.dataset.hand = shpPrefs.hand;
  const handButton = document.querySelector('#handednessButtonPause');
  if (handButton) handButton.textContent = `ХВАТ: ${shpPrefs.hand === 'left' ? 'ЛЕВША' : 'ОБЫЧНЫЙ'}`;
}

function shp23ToggleHand() {
  shpPrefs.hand = shpPrefs.hand === 'left' ? 'right' : 'left';
  const current = shpPrefs.layout || shp23DefaultLayout(shpPrefs.hand === 'left' ? 'right' : 'left');
  shpPrefs.layout = { steerX: 1 - current.steerX, powerX: 1 - current.powerX, lift: current.lift || 0 };
  shpSavePrefs();
  shp23ApplyControlLayout();
  navigator.vibrate?.(7);
}

function shp23OpenCalibration() {
  const overlay = document.querySelector('#controlCalibration');
  if (!overlay) return;
  overlay.hidden = false;
  overlay.dataset.step = 'steer';
  overlay.querySelector('#calibrationTitle').textContent = 'ПОЛОЖИ ПАЛЕЦ ДЛЯ РУЛЯ';
  overlay.querySelector('#calibrationHint').textContent = 'Коснись экрана там, где большой палец естественно лежит во время игры.';
  overlay._draft = {};
}

function shp23CloseCalibration() {
  const overlay = document.querySelector('#controlCalibration');
  if (overlay) overlay.hidden = true;
}

function shp23CalibrationPoint(event) {
  const overlay = document.querySelector('#controlCalibration');
  if (!overlay || overlay.hidden) return;
  const x = clamp(event.clientX / Math.max(1, window.innerWidth), 0.12, 0.88);
  const bottomDistance = window.innerHeight - event.clientY;
  const lift = clamp(bottomDistance - 118, 0, 62);
  if (overlay.dataset.step === 'steer') {
    overlay._draft.steerX = x;
    overlay._draft.lift = lift;
    overlay.dataset.step = 'power';
    overlay.querySelector('#calibrationTitle').textContent = 'ТЕПЕРЬ ПАЛЕЦ ДЛЯ РЫЧАГА';
    overlay.querySelector('#calibrationHint').textContent = 'Коснись удобного места для газа и тормоза. На этом всё.';
    navigator.vibrate?.(6);
    return;
  }
  overlay._draft.powerX = x;
  overlay._draft.lift = Math.round(((overlay._draft.lift || 0) + lift) * 0.5);
  shpPrefs.layout = {
    steerX: overlay._draft.steerX ?? shp23DefaultLayout().steerX,
    powerX: overlay._draft.powerX ?? shp23DefaultLayout().powerX,
    lift: overlay._draft.lift
  };
  shpPrefs.hand = shpPrefs.layout.steerX > shpPrefs.layout.powerX ? 'left' : 'right';
  shpSavePrefs();
  shp23ApplyControlLayout();
  shp23CloseCalibration();
  navigator.vibrate?.([7, 28, 7]);
}

function shp23OpenCodeDialog() {
  const dialog = document.querySelector('#routeCodeDialog');
  const inputNode = document.querySelector('#routeCodeInput');
  const currentNode = document.querySelector('#currentRouteCode');
  if (!dialog || !inputNode || !currentNode) return;
  currentNode.textContent = shp23CurrentCode();
  inputNode.value = '';
  document.querySelector('#routeCodeStatus').textContent = '';
  dialog.hidden = false;
  setTimeout(() => inputNode.focus(), 60);
}

function shp23CloseCodeDialog() {
  const dialog = document.querySelector('#routeCodeDialog');
  if (dialog) dialog.hidden = true;
}

async function shp23CopyCurrentCode() {
  const code = shp23CurrentCode();
  const status = document.querySelector('#routeCodeStatus');
  try {
    await navigator.clipboard.writeText(code);
    if (status) status.textContent = 'КОД СКОПИРОВАН';
  } catch {
    const inputNode = document.querySelector('#routeCodeInput');
    if (inputNode) {
      inputNode.value = code;
      inputNode.select();
      document.execCommand?.('copy');
    }
    if (status) status.textContent = 'КОД В ПОЛЕ ВВОДА';
  }
}

function shp23LoadTypedCode() {
  const inputNode = document.querySelector('#routeCodeInput');
  const status = document.querySelector('#routeCodeStatus');
  const parsed = shp23ParseRouteCode(inputNode?.value);
  if (parsed.error) {
    if (status) status.textContent = parsed.error;
    navigator.vibrate?.(18);
    return;
  }
  shp23CloseCodeDialog();
  shp23LoadRoute({ ...parsed, mode: 'code' });
}

var shp23BaseSetupRace = setupRace;
setupRace = function shp23SetupRace() {
  shp23BaseSetupRace();
  shp23PairEffects.clear();
  cars.forEach((car) => {
    shp23CollisionId(car);
    car.bodyRattle = 0;
    car._shp23BarrierEffectAt = -Infinity;
  });
};

var shp23BaseFinishRace = finishRace;
finishRace = function shp23FinishRace() {
  shp23BaseFinishRace();
  const medalNode = document.querySelector('#finishMedal');
  const medal = shp23MedalForTime(player?.bestLap);
  if (medalNode) {
    medalNode.hidden = !medal;
    medalNode.dataset.medal = medal || 'none';
    medalNode.textContent = medal ? `${shp23MedalLabel(medal)} · ${formatTime(player.bestLap)}` : '';
  }
  if (medal) {
    shp23SaveMedal(player.bestLap);
    finishSummary.textContent += ` Медаль маршрута: ${shp23MedalLabel(medal).toLowerCase()}.`;
  }
};

document.querySelector('#todayRouteButton')?.addEventListener('click', () => shp23LoadRoute(shp23DailyRoute()));
document.querySelector('#routeCodeButton')?.addEventListener('click', shp23OpenCodeDialog);
document.querySelector('#routeCodeClose')?.addEventListener('click', shp23CloseCodeDialog);
document.querySelector('#routeCodeCancel')?.addEventListener('click', shp23CloseCodeDialog);
document.querySelector('#routeCodeCopy')?.addEventListener('click', shp23CopyCurrentCode);
document.querySelector('#routeCodeLoad')?.addEventListener('click', shp23LoadTypedCode);
document.querySelector('#routeCodeInput')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') shp23LoadTypedCode(); });
document.querySelector('#handednessButtonPause')?.addEventListener('click', shp23ToggleHand);
document.querySelector('#calibrateControlsButtonPause')?.addEventListener('click', shp23OpenCalibration);
document.querySelector('#calibrationCancel')?.addEventListener('click', shp23CloseCalibration);
document.querySelector('#calibrationReset')?.addEventListener('click', () => {
  shpPrefs.layout = shp23DefaultLayout();
  shpSavePrefs();
  shp23ApplyControlLayout();
  shp23CloseCalibration();
});
document.querySelector('#calibrationHit')?.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  shp23CalibrationPoint(event);
});

const shp23SteeringButton = document.querySelector('#steeringFeelButtonPause');
if (shp23SteeringButton) shp23SteeringButton.hidden = true;
shp23ApplyControlLayout();
shp23MedalTargets = shp23ComputeMedalTargets();
shp23UpdateRouteExtras();
