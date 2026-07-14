// ШПИЛЬКА 2.5 — distinct rival personalities, believable mistakes and clean-rhythm handling.

var shp25Profiles = {
  rook: {
    label: 'СТАБИЛЬНЫЙ', straightPace: 0.985, cornerPace: 1.018, linePrecision: 1.06,
    aggression: 0.72, mistakeBias: 0.66, passWidth: 0.86, brakingNerve: 0.94
  },
  volt: {
    label: 'СПРИНТЕР', straightPace: 1.065, cornerPace: 0.955, linePrecision: 0.98,
    aggression: 0.94, mistakeBias: 0.98, passWidth: 1.02, brakingNerve: 1.05
  },
  mara: {
    label: 'ТЕХНИК', straightPace: 0.985, cornerPace: 1.058, linePrecision: 1.10,
    aggression: 0.78, mistakeBias: 0.78, passWidth: 0.92, brakingNerve: 1.00
  },
  shunt: {
    label: 'АТАКУЮЩИЙ', straightPace: 1.018, cornerPace: 1.015, linePrecision: 0.95,
    aggression: 1.22, mistakeBias: 1.38, passWidth: 1.18, brakingNerve: 1.10
  }
};

var shp25MistakeRates = { rookie: 0.040, racer: 0.018, maniac: 0.008 };
var shp25RaceLaps = [];
var shp25CleanMeter = 0;
var shp25CleanTier = 0;
var shp25ImpactKinds = { rear: 0, side: 0, frontal: 0 };

function shp25StringHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shp25Random(car) {
  let state = car.shp25RandomState >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  car.shp25RandomState = state >>> 0;
  return (car.shp25RandomState >>> 0) / 4294967296;
}

function shp25ChooseMistake(car, hasCarAhead) {
  const roll = shp25Random(car);
  if (hasCarAhead && roll > 0.76) return 'failed-pass';
  if (roll < 0.34) return 'late-brake';
  if (roll < 0.68) return 'wide-exit';
  return 'oversteer';
}

function shp25StartMistake(car, hasCarAhead) {
  const type = shp25ChooseMistake(car, hasCarAhead);
  const duration = type === 'failed-pass'
    ? 0.62 + shp25Random(car) * 0.32
    : 0.34 + shp25Random(car) * 0.38;
  car.shp25Mistake = {
    type,
    remaining: duration,
    total: duration,
    direction: shp25Random(car) > 0.5 ? 1 : -1
  };
  car.shp25MistakeCooldown = 4.5 + shp25Random(car) * 5.5;
}

function shp25UpcomingCurvature(car, distance = 132) {
  let maximum = 0;
  for (let step = 0; step < distance; step += 4) {
    const index = (car.trackIndex + step) % track.length;
    maximum = Math.max(maximum, Math.abs(track[index].curvature));
  }
  return maximum;
}

function shp25AiControls(car, dt) {
  const difficulty = shpDifficulty[shpPrefs.difficulty];
  const profile = car.shp25Profile || shp25Profiles.rook;
  const speed = Math.abs(car.forwardSpeed);
  const currentCurve = Math.abs(track[car.trackIndex]?.curvature || 0);
  const futureCurve = shp25UpcomingCurvature(car);
  const cornerLoad = smoothstep(0.00038, 0.00215, Math.max(currentCurve, futureCurve));
  const lookAhead = Math.round(24 + speed / 20 + (profile.linePrecision - 1) * 18);
  const targetIndex = (car.trackIndex + lookAhead) % track.length;
  const target = track[targetIndex];

  car.overtakeTimer = Math.max(0, car.overtakeTimer - dt);
  const ahead = findCarAhead(car);
  const passRange = 160 + speed * 0.12 + profile.aggression * 28;
  if (ahead && ahead.gap < passRange && car.overtakeTimer <= 0 && car.shp25Mistake?.type !== 'failed-pass') {
    const relativeX = ahead.car.x - car.x;
    const relativeY = ahead.car.y - car.y;
    const side = relativeX * track[car.trackIndex].nx + relativeY * track[car.trackIndex].ny;
    car.overtakeSide = side > 0 ? -1 : 1;
    if (Math.abs(side) < 10) car.overtakeSide = Math.sin(car.aiPhase + raceElapsed) > 0 ? 1 : -1;
    car.overtakeTimer = (1.15 + profile.aggression * 0.72 + car.aggression * 0.28) * difficulty.aggression;
  }

  car.shp25MistakeCooldown = Math.max(0, (car.shp25MistakeCooldown || 0) - dt);
  if (car.shp25Mistake) {
    car.shp25Mistake.remaining -= dt;
    if (car.shp25Mistake.remaining <= 0) car.shp25Mistake = null;
  } else if (
    car.shp25MistakeCooldown <= 0
    && speed > 170
    && !car.airborne
    && shp25Random(car) < dt * shp25MistakeRates[shpPrefs.difficulty] * profile.mistakeBias
  ) {
    shp25StartMistake(car, Boolean(ahead));
  }

  const mistake = car.shp25Mistake;
  const mistakeProgress = mistake ? 1 - mistake.remaining / mistake.total : 0;
  let mistakeOffset = 0;
  if (mistake?.type === 'wide-exit') mistakeOffset = mistake.direction * roadHalf * 0.30 * Math.sin(mistakeProgress * Math.PI);
  if (mistake?.type === 'failed-pass') {
    const abort = mistakeProgress > 0.52 ? -0.55 : 1;
    mistakeOffset = mistake.direction * roadHalf * 0.40 * abort;
  }

  const baseOffset = target.raceOffset + car.lane * 0.28;
  const passOffset = car.overtakeTimer > 0
    ? car.overtakeSide * roadHalf * (0.29 + profile.aggression * 0.105) * profile.passWidth
    : 0;
  const desiredOffset = clamp(baseOffset + passOffset + mistakeOffset, -roadHalf * 0.60, roadHalf * 0.60);
  const offsetResponse = mistake?.type === 'failed-pass' ? 4.4 : 3.1 + profile.linePrecision * 0.32;
  car.aiOffset = lerp(car.aiOffset, desiredOffset, clamp(dt * offsetResponse, 0, 1));

  const targetX = target.x + target.nx * car.aiOffset;
  const targetY = target.y + target.ny * car.aiOffset;
  const desiredHeading = Math.atan2(targetY - car.y, targetX - car.x);
  const headingError = wrapAngle(desiredHeading - car.angle);
  const point = track[car.trackIndex];
  const crossTrack = (car.x - point.x) * point.nx + (car.y - point.y) * point.ny - car.aiOffset;
  let steer = headingError * (2.10 + profile.linePrecision * 0.15)
    - crossTrack / Math.max(72, roadHalf * (1.18 - (profile.linePrecision - 1) * 0.25))
    - car.yawRate * lerp(0.16, 0.22, profile.linePrecision - 0.9);

  if (mistake?.type === 'oversteer') {
    steer += mistake.direction * 0.24 * Math.sin(mistakeProgress * Math.PI);
  }
  if (mistake?.type === 'late-brake' && mistakeProgress > 0.72) steer *= 0.88;
  steer = clamp(steer, -1, 1);

  let targetSpeed = MAX_SPEED * 0.995;
  for (let distance = 0; distance < 140; distance += 4) {
    let windowCurve = 0;
    for (let window = 0; window < 20; window += 4) {
      const index = (car.trackIndex + distance + window) % track.length;
      windowCurve = Math.max(windowCurve, Math.abs(track[index].curvature));
    }
    const cornerSpeed = clamp(1115 / (1 + windowCurve * 590), 350, MAX_SPEED * 0.995);
    targetSpeed = Math.min(targetSpeed, cornerSpeed + distance * 2.66);
  }

  const personalityPace = lerp(profile.straightPace, profile.cornerPace, cornerLoad);
  targetSpeed *= car.skill * personalityPace;
  if (car.distanceFromRoad > roadHalf * 0.74) targetSpeed *= 0.84;
  if (shpRampIndices.some((index) => {
    let gap = index - car.trackIndex;
    if (gap < 0) gap += track.length;
    return gap < 36;
  })) targetSpeed = Math.max(targetSpeed, 520);

  if (mistake?.type === 'late-brake') {
    targetSpeed += mistakeProgress < 0.62 ? 92 * profile.brakingNerve : -28;
  } else if (mistake?.type === 'wide-exit') {
    targetSpeed *= 0.96;
  } else if (mistake?.type === 'oversteer') {
    targetSpeed *= 0.91;
  } else if (mistake?.type === 'failed-pass' && mistakeProgress > 0.52) {
    targetSpeed *= 0.88;
  }

  const speedError = targetSpeed - speed;
  let brake = speedError < -30 ? clamp(-speedError / 188, 0, 0.94) : 0;
  let throttle = speedError > -8 ? clamp((speedError + 46) / 102, 0.32, 1) : 0;
  if (Math.abs(steer) > 0.91 && speed > targetSpeed - 3) brake = Math.max(brake, 0.09);
  if (mistake?.type === 'late-brake' && mistakeProgress < 0.62) brake *= 0.24;
  if (mistake?.type === 'oversteer') {
    throttle *= 0.72;
    brake = Math.max(brake, 0.05);
  }
  if (mistake?.type === 'failed-pass' && mistakeProgress > 0.52) throttle *= 0.55;

  return { steer, throttle, brake };
}

aiControls = shp25AiControls;

var shp25BaseSetupRace = setupRace;
setupRace = function shp25SetupRace() {
  shp25BaseSetupRace();
  shp25RaceLaps = [];
  shp25CleanMeter = 0;
  shp25CleanTier = 0;
  shp25ImpactKinds = { rear: 0, side: 0, frontal: 0 };

  cars.forEach((car) => {
    car.shp25RandomState = hashSeed(trackSeed ^ shp25StringHash(car.id));
    car.shp25Mistake = null;
    car.shp25MistakeCooldown = car.player ? Infinity : 2.8 + shp25Random(car) * 4.2;
    car.shp25Profile = car.player ? null : (shp25Profiles[car.id] || shp25Profiles.rook);
    car.shp25Role = car.shp25Profile?.label || '';
    if (car.shp25Profile) car.aggression = clamp(car.aggression * car.shp25Profile.aggression, 0.22, 1.35);
    car.shp25CleanGrip = 0;
    car.shp25LastImpactKind = null;
  });
};

function shp25ResetCleanRhythm(reason = '') {
  if (shp25CleanMeter > 0.72 && reason && player) showRaceMessage(reason, 0.48);
  shp25CleanMeter = 0;
  shp25CleanTier = 0;
  if (player) player.shp25CleanGrip = 0;
}

function shp25UpdateCleanRhythm(car, dt) {
  if (!car.player || mode !== 'race') return;
  const speed = Math.abs(car.forwardSpeed || 0);
  const safe = !car.airborne
    && (car.shp24RecoveryImmunity || 0) <= 0
    && car.distanceFromRoad < roadHalf * 0.78
    && Math.abs(car.signedRoadOffset) < roadHalf * 0.74
    && car.slip < 78
    && speed > 145;
  const curve = Math.abs(track[car.trackIndex]?.curvature || 0);

  if (safe) {
    shp25CleanMeter = clamp(shp25CleanMeter + dt * (curve > 0.00072 ? 0.105 : 0.060), 0, 1);
  } else {
    shp25CleanMeter = clamp(shp25CleanMeter - dt * 0.34, 0, 1);
  }

  const thresholds = [0.36, 0.72, 0.96];
  let tier = 0;
  thresholds.forEach((threshold) => { if (shp25CleanMeter >= threshold) tier += 1; });
  if (tier > shp25CleanTier) {
    const labels = ['ЧИСТЫЙ РИТМ', 'СЦЕПЛЕНИЕ +2%', 'ИДЕАЛЬНЫЙ ТЕМП'];
    showRaceMessage(labels[tier - 1], 0.52);
    if (tier >= 2) navigator.vibrate?.(6);
  }
  shp25CleanTier = tier;

  const bonus = 0.025 * smoothstep(0.25, 1, shp25CleanMeter);
  car.shp25CleanGrip = bonus;
  if (bonus <= 0) return;

  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const rightX = -forwardY;
  const rightY = forwardX;
  const forwardSpeed = car.vx * forwardX + car.vy * forwardY;
  let lateralSpeed = car.vx * rightX + car.vy * rightY;
  lateralSpeed *= Math.exp(-bonus * 8.0 * dt);
  car.vx = forwardX * forwardSpeed + rightX * lateralSpeed;
  car.vy = forwardY * forwardSpeed + rightY * lateralSpeed;
  car.lateralSpeed = lateralSpeed;
  const desiredYaw = desiredYawRateSafe(car);
  car.yawRate += (desiredYaw - car.yawRate) * clamp(bonus * 7.2 * dt, 0, 0.018);
};

var shp25BaseUpdateCar = updateCar;
updateCar = function shp25UpdateCar(car, dt) {
  shp25BaseUpdateCar(car, dt);
  shp25UpdateCleanRhythm(car, dt);
};

var shp25BaseRecoverCar = recoverCar;
recoverCar = function shp25RecoverCar(car, advance = false) {
  shp25BaseRecoverCar(car, advance);
  if (car.player) shp25ResetCleanRhythm();
};

function shp25ClassifyImpact(a, b, beforeA, beforeB) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;
  const aFx = Math.cos(a.angle);
  const aFy = Math.sin(a.angle);
  const bFx = Math.cos(b.angle);
  const bFy = Math.sin(b.angle);
  const headingDot = aFx * bFx + aFy * bFy;
  const relativeX = beforeB.vx - beforeA.vx;
  const relativeY = beforeB.vy - beforeA.vy;
  const closing = -(relativeX * nx + relativeY * ny);

  if (headingDot < -0.42 && closing > 45) return { kind: 'frontal', nx, ny, closing };

  if (headingDot > 0.62) {
    const bAheadOfA = dx * aFx + dy * aFy > 0;
    const longitudinalClosing = bAheadOfA
      ? (beforeA.vx - beforeB.vx) * aFx + (beforeA.vy - beforeB.vy) * aFy
      : (beforeB.vx - beforeA.vx) * bFx + (beforeB.vy - beforeA.vy) * bFy;
    if (longitudinalClosing > 28) return { kind: 'rear', nx, ny, closing: longitudinalClosing, hitter: bAheadOfA ? a : b, target: bAheadOfA ? b : a };
  }

  return { kind: 'side', nx, ny, closing: Math.max(0, closing) };
}

function shp25ApplyImpactCharacter(impact) {
  const strength = clamp(impact.closing, 0, 260);
  if (impact.kind === 'frontal') {
    const damping = lerp(0.91, 0.76, smoothstep(45, 240, strength));
    impact.a.vx *= damping;
    impact.a.vy *= damping;
    impact.b.vx *= damping;
    impact.b.vy *= damping;
    const push = lerp(8, 34, smoothstep(45, 240, strength));
    impact.a.vx -= impact.nx * push;
    impact.a.vy -= impact.ny * push;
    impact.b.vx += impact.nx * push;
    impact.b.vy += impact.ny * push;
  } else if (impact.kind === 'rear') {
    const hitter = impact.hitter;
    const target = impact.target;
    const hFx = Math.cos(hitter.angle);
    const hFy = Math.sin(hitter.angle);
    const transfer = lerp(10, 38, smoothstep(28, 220, strength));
    hitter.vx -= hFx * transfer * 0.72;
    hitter.vy -= hFy * transfer * 0.72;
    target.vx += hFx * transfer * 0.48;
    target.vy += hFy * transfer * 0.48;
    hitter.yawRate *= 0.92;
    target.yawRate *= 0.95;
  } else {
    const crossA = Math.cos(impact.a.angle) * impact.ny - Math.sin(impact.a.angle) * impact.nx;
    const crossB = Math.cos(impact.b.angle) * impact.ny - Math.sin(impact.b.angle) * impact.nx;
    const spin = lerp(0.04, 0.42, smoothstep(22, 210, strength));
    impact.a.yawRate = clamp(impact.a.yawRate - crossA * spin, -2.2, 2.2);
    impact.b.yawRate = clamp(impact.b.yawRate + crossB * spin, -2.2, 2.2);
  }
}

var shp25BaseResolvePairCollision = resolvePairCollision;
resolvePairCollision = function shp25ResolvePairCollision(a, b) {
  const key = shp24PairKey(a, b);
  const previous = shp24PairContacts.get(key);
  const beforeA = { vx: a.vx, vy: a.vy };
  const beforeB = { vx: b.vx, vy: b.vy };
  const fresh = !previous || raceElapsed - previous.lastSeen > 0.08;
  const collided = shp25BaseResolvePairCollision(a, b);
  if (!collided || !fresh) return collided;

  const impact = shp25ClassifyImpact(a, b, beforeA, beforeB);
  impact.a = a;
  impact.b = b;
  if (impact.closing > 18) {
    shp25ApplyImpactCharacter(impact);
    shp25ImpactKinds[impact.kind] += 1;
    a.shp25LastImpactKind = impact.kind;
    b.shp25LastImpactKind = impact.kind;
    if (a.player || b.player) shp25ResetCleanRhythm(impact.closing > 95 ? 'РИТМ СБИТ' : '');
  }
  return collided;
};

var shp25BaseResolveRoadCollision = resolveRoadCollision;
resolveRoadCollision = function shp25ResolveRoadCollision(car) {
  const point = track[car.trackIndex];
  const beforeOutward = point ? car.vx * point.nx * Math.sign(car.signedRoadOffset || 1) + car.vy * point.ny * Math.sign(car.signedRoadOffset || 1) : 0;
  shp25BaseResolveRoadCollision(car);
  if (car.player && beforeOutward > 42) shp25ResetCleanRhythm(beforeOutward > 105 ? 'РИТМ СБИТ' : '');
};

var shp25BaseCompleteSector = shpCompleteSector;
shpCompleteSector = function shp25CompleteSector(index, duration) {
  const previous = shpSectorBest(index);
  shp25BaseCompleteSector(index, duration);
  const delta = previous == null ? null : duration - previous;
  shpLastSectorText = previous == null
    ? `S${index + 1} ${formatTime(duration)} · ПЕРВЫЙ`
    : `S${index + 1} ${formatTime(duration)} · ${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(3)}`;
  shpUpdateSectorHud(delta);
  showRaceMessage(shpLastSectorText, 0.78);
};

var shp25BaseStoreBestLap = shpStoreBestLap;
shpStoreBestLap = function shp25StoreBestLap(duration) {
  shp25RaceLaps.push(duration);
  shp25BaseStoreBestLap(duration);
};

var shp25BaseFinishRace = finishRace;
finishRace = function shp25FinishRace() {
  shp25BaseFinishRace();
  if (shp25RaceLaps.length >= 2) {
    const first = shp25RaceLaps[0];
    const second = shp25RaceLaps[1];
    const delta = second - first;
    finishSummary.textContent += ` Круги ${formatTime(first)} / ${formatTime(second)}; второй ${delta <= 0 ? 'быстрее' : 'медленнее'} на ${Math.abs(delta).toFixed(3)} с.`;
  }
};

const shp25Subtitle = document.querySelector('.start-copy .subtitle');
if (shp25Subtitle) {
  shp25Subtitle.textContent = 'Два длинных круга, четыре характера соперников, живые ошибки и награда за чистый ритм.';
}
