// ШПИЛЬКА 2.2 — precision controls, track archetypes, ghost sectors and harder clean AI.

var shpPrefsKey = 'pocket-works:shpilka:prefs:v1';
var shpPrefs = (() => {
  try {
    const value = JSON.parse(localStorage.getItem(shpPrefsKey) || '{}');
    return {
      controlMode: value.controlMode === 'buttons' ? 'buttons' : 'precision',
      steeringFeel: value.steeringFeel === 'direct' ? 'direct' : 'precise',
      difficulty: ['rookie', 'racer', 'maniac'].includes(value.difficulty) ? value.difficulty : 'racer',
      trackType: ['mix', 'speed', 'technical', 'mountain', 'cascade'].includes(value.trackType) ? value.trackType : 'mix'
    };
  } catch {
    return { controlMode: 'precision', steeringFeel: 'precise', difficulty: 'racer', trackType: 'mix' };
  }
})();

function shpSavePrefs() {
  try { localStorage.setItem(shpPrefsKey, JSON.stringify(shpPrefs)); } catch { /* storage is optional */ }
}

var shpAnalog = { steer: 0, throttle: 0, brake: 0 };
var shpActiveArchetype = null;
var shpRampIndices = [];
var shpGhostPlayback = null;
var shpGhostSamples = [];
var shpGhostSampleClock = 0;
var shpGhostCursor = 0;
var shpLapStartedAt = 0;
var shpLastCompletedLaps = 0;
var shpSectorIndex = 0;
var shpSectorStartedAt = 0;
var shpLastSectorText = 'СЕКТОР —';

var shpArchetypes = {
  speed: {
    id: 'speed', label: 'СКОРОСТНАЯ', code: 'V', anchorMin: 18, anchorMax: 22,
    rx: [1120, 1430], ry: [820, 1040], road: [170, 182], ramps: [0, 1],
    profiles: [
      [[2, 0.10], [3, 0.055], [5, 0.018]],
      [[1, 0.08], [2, -0.10], [4, 0.035]],
      [[3, 0.08], [2, 0.045], [6, 0.014]]
    ], themes: ['salt', 'port']
  },
  technical: {
    id: 'technical', label: 'ТЕХНИЧЕСКАЯ', code: 'T', anchorMin: 21, anchorMax: 26,
    rx: [900, 1160], ry: [690, 900], road: [150, 162], ramps: [0, 1],
    profiles: [
      [[2, -0.16], [4, 0.11], [7, 0.035]],
      [[3, 0.17], [5, 0.075], [8, 0.025]],
      [[1, 0.11], [3, -0.15], [6, 0.045]]
    ], themes: ['salt', 'pine', 'port', 'clay']
  },
  mountain: {
    id: 'mountain', label: 'ГОРНАЯ', code: 'M', anchorMin: 19, anchorMax: 24,
    rx: [1000, 1320], ry: [650, 930], road: [152, 166], ramps: [1, 2],
    profiles: [
      [[1, 0.13], [2, -0.14], [5, 0.04]],
      [[2, 0.15], [3, 0.10], [6, 0.025]],
      [[3, -0.13], [4, 0.085], [7, 0.025]]
    ], themes: ['pine', 'clay']
  },
  cascade: {
    id: 'cascade', label: 'КАСКАДНАЯ', code: 'K', anchorMin: 20, anchorMax: 25,
    rx: [1030, 1360], ry: [760, 1010], road: [160, 174], ramps: [2, 3],
    profiles: [
      [[2, 0.12], [4, 0.075], [6, 0.025]],
      [[3, -0.12], [5, 0.07], [7, 0.020]],
      [[1, 0.09], [3, 0.13], [5, -0.035]]
    ], themes: ['port', 'salt', 'clay']
  }
};

var shpDifficulty = {
  rookie: { label: 'НОВИЧОК', pace: 0.88, aggression: 0.76, mistakes: 0.012 },
  racer: { label: 'ГОНЩИК', pace: 1.00, aggression: 1.00, mistakes: 0.004 },
  maniac: { label: 'БЕЗУМЕЦ', pace: 1.075, aggression: 1.16, mistakes: 0.0012 }
};

function shpRandomArchetype(random) {
  const values = Object.values(shpArchetypes);
  return values[Math.floor(random() * values.length)];
}

function shpThemeForArchetype(archetype, random) {
  const allowed = archetype.themes;
  const id = allowed[Math.floor(random() * allowed.length)];
  return THEMES.find((item) => item.id === id) || THEMES[0];
}

function shpGenerateTrack(seed) {
  const seedRandom = mulberry32(seed);
  const archetype = shpActiveArchetype || shpArchetypes.speed;
  roadWidth = Math.round(lerp(archetype.road[0], archetype.road[1], seedRandom()));
  roadHalf = roadWidth * 0.5;

  for (let attempt = 0; attempt < 72; attempt += 1) {
    const random = mulberry32(hashSeed(seed + attempt * 977));
    const profile = archetype.profiles[Math.floor(random() * archetype.profiles.length)];
    const anchorCount = archetype.anchorMin + Math.floor(random() * (archetype.anchorMax - archetype.anchorMin + 1));
    const radiusX = lerp(archetype.rx[0], archetype.rx[1], random());
    const radiusY = lerp(archetype.ry[0], archetype.ry[1], random());
    const rotation = random() * TAU;
    const phases = [random() * TAU, random() * TAU, random() * TAU];
    const anchors = [];

    for (let i = 0; i < anchorCount; i += 1) {
      const angle = i / anchorCount * TAU;
      let radius = 1;
      for (let harmonicIndex = 0; harmonicIndex < profile.length; harmonicIndex += 1) {
        const [frequency, amplitude] = profile[harmonicIndex];
        radius += amplitude * lerp(0.90, 1.10, random()) * Math.sin(frequency * angle + phases[harmonicIndex]);
      }
      radius += (random() - 0.5) * (archetype.id === 'technical' ? 0.030 : 0.018);
      const localX = Math.cos(angle) * radiusX * radius;
      const localY = Math.sin(angle) * radiusY * radius;
      anchors.push({
        x: localX * Math.cos(rotation) - localY * Math.sin(rotation),
        y: localX * Math.sin(rotation) + localY * Math.cos(rotation)
      });
    }

    const points = finalizeTrack(sampleClosedSpline(anchors, lerp(0.46, 0.54, random())));
    if (trackIsValid(points)) return points;
  }

  const scaleX = archetype.id === 'technical' ? 1.05 : archetype.id === 'speed' ? 1.32 : 1.20;
  const scaleY = archetype.id === 'mountain' ? 1.24 : 1.16;
  const anchors = [
    [-780, -180], [-590, -560], [-180, -700], [330, -640], [760, -330], [860, 110],
    [650, 520], [210, 700], [-280, 620], [-640, 320], [-850, 90]
  ].map(([x, y]) => ({ x: x * scaleX, y: y * scaleY }));
  return finalizeTrack(sampleClosedSpline(anchors, 0.5));
}

generateTrack = shpGenerateTrack;

function shpChooseRampIndices(random, count) {
  const candidates = [];
  for (let i = 50; i < track.length - 50; i += 5) {
    let maxCurve = 0;
    for (let j = -12; j <= 24; j += 3) {
      maxCurve = Math.max(maxCurve, Math.abs(track[(i + j + track.length) % track.length].curvature));
    }
    if (maxCurve < 0.0024) candidates.push(i);
  }
  const chosen = [];
  while (candidates.length && chosen.length < count) {
    const pick = candidates.splice(Math.floor(random() * candidates.length), 1)[0];
    if (chosen.every((value) => Math.min(Math.abs(value - pick), track.length - Math.abs(value - pick)) > 80)) chosen.push(pick);
  }
  return chosen.sort((a, b) => a - b);
}

var shpBasePrepareRoute = prepareRoute;
prepareRoute = function shpPrepareRoute(forceSeed = null) {
  saved.routeCounter += 1;
  const entropy = forceSeed ?? hashSeed(Date.now() ^ Math.floor(performance.now() * 1000) ^ saved.routeCounter * 0x9e3779b9);
  trackSeed = entropy >>> 0;
  const random = mulberry32(trackSeed);
  shpActiveArchetype = shpPrefs.trackType === 'mix' ? shpRandomArchetype(random) : shpArchetypes[shpPrefs.trackType];
  theme = shpThemeForArchetype(shpActiveArchetype, random);
  track = generateTrack(trackSeed);

  if (shpActiveArchetype.id === 'technical') lapsToWin = track.totalLength < 5900 && random() < 0.35 ? 3 : 2;
  else if (shpActiveArchetype.id === 'speed') lapsToWin = track.totalLength > 7200 ? 1 : 2;
  else if (shpActiveArchetype.id === 'cascade') lapsToWin = track.totalLength > 6800 ? 1 : 2;
  else lapsToWin = random() < 0.48 ? 1 : 2;

  const rampCount = shpActiveArchetype.ramps[0] + Math.floor(random() * (shpActiveArchetype.ramps[1] - shpActiveArchetype.ramps[0] + 1));
  shpRampIndices = shpChooseRampIndices(random, rampCount);
  rampIndex = shpRampIndices[0] ?? -1;
  props = buildProps(random);
  if (typeof rebuildTrackPaths === 'function') rebuildTrackPaths();
  trackName = `${shpActiveArchetype.label} · ${theme.label} ${String.fromCharCode(65 + Math.floor(random() * 18))}-${10 + Math.floor(random() * 89)}`;
  document.documentElement.style.setProperty('--terrain', theme.terrain);
  document.documentElement.style.setProperty('--terrain-dark', theme.terrainDark);
  updateRouteUi();
  saveState();
};

updateRouteUi = function shpUpdateRouteUi() {
  const km = (track.totalLength / 1100).toFixed(1);
  routeNameNode.textContent = trackName;
  routeMeta.textContent = `${km} КМ · ${lapsToWin} ${lapsToWin === 1 ? 'КРУГ' : 'КРУГА'} · ${shpRampIndices.length ? `${shpRampIndices.length} ТРАМП.` : 'БЕЗ ТРАМП.'} · КОД ${String(trackSeed >>> 0).slice(-5)}`;
  startButton.textContent = `НА СТАРТ · ${shpDifficulty[shpPrefs.difficulty].label}`;
};

var shpBaseSetupRace = setupRace;
setupRace = function shpSetupRace() {
  shpBaseSetupRace();
  const difficulty = shpDifficulty[shpPrefs.difficulty];
  cars.slice(1).forEach((car, index) => {
    const spread = [-0.045, 0.012, -0.012, 0.042][index] || 0;
    car.skill = difficulty.pace + spread;
    car.aggression = clamp(car.aggression * difficulty.aggression, 0.25, 1.2);
    car.bodyRattle = 0;
  });
  player.bodyRattle = 0;
  shpGhostPlayback = shpDecodeGhost(currentRouteRecord()?.ghost);
  shpGhostSamples = [];
  shpGhostSampleClock = 0;
  shpGhostCursor = 0;
  shpLapStartedAt = 0;
  shpLastCompletedLaps = 0;
  shpSectorIndex = 0;
  shpSectorStartedAt = 0;
  shpLastSectorText = shpGhostPlayback ? 'ПРИЗРАК ГОТОВ' : 'ПРИЗРАК —';
  shpUpdateSectorHud();
};

function shpDecodeGhost(raw) {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  return raw.map((item) => ({ t: item[0] / 100, x: item[1], y: item[2], a: item[3] / 1000 }));
}

function shpEncodeGhost(samples) {
  const stride = Math.max(1, Math.ceil(samples.length / 720));
  return samples.filter((_, index) => index % stride === 0 || index === samples.length - 1)
    .map((sample) => [Math.round(sample.t * 100), Math.round(sample.x), Math.round(sample.y), Math.round(sample.a * 1000)]);
}

function shpStoreBestLap(duration) {
  const key = String(trackSeed);
  const old = saved.routeRecords[key] || {};
  const isBest = old.bestLap == null || duration <= old.bestLap + 0.025;
  if (isBest && shpGhostSamples.length > 8) {
    saved.routeRecords[key] = { ...old, bestLap: duration, ghost: shpEncodeGhost(shpGhostSamples), updatedAt: Date.now() };
    shpGhostPlayback = shpDecodeGhost(saved.routeRecords[key].ghost);
    saveState();
  }
}

storeRouteRecord = function shpStoreRouteRecord() {
  const key = String(trackSeed);
  const old = saved.routeRecords[key] || {};
  const bestLapValue = player.bestLap == null ? old.bestLap : old.bestLap == null ? player.bestLap : Math.min(old.bestLap, player.bestLap);
  const bestRaceValue = player.finishTime == null ? old.bestRace : old.bestRace == null ? player.finishTime : Math.min(old.bestRace, player.finishTime);
  saved.routeRecords[key] = { ...old, bestLap: bestLapValue ?? null, bestRace: bestRaceValue ?? null, updatedAt: Date.now() };
  saveState();
};

function shpRecordGhost(dt) {
  if (!player || mode !== 'race') return;
  shpGhostSampleClock += dt;
  if (shpGhostSampleClock < 0.08) return;
  shpGhostSampleClock = 0;
  shpGhostSamples.push({ t: raceElapsed - shpLapStartedAt, x: player.x, y: player.y, a: player.angle });
}

function shpGhostPose() {
  if (!shpGhostPlayback || !shpGhostPlayback.length || mode !== 'race') return null;
  const time = raceElapsed - shpLapStartedAt;
  while (shpGhostCursor < shpGhostPlayback.length - 2 && shpGhostPlayback[shpGhostCursor + 1].t < time) shpGhostCursor += 1;
  const a = shpGhostPlayback[shpGhostCursor];
  const b = shpGhostPlayback[Math.min(shpGhostCursor + 1, shpGhostPlayback.length - 1)];
  if (!a || time > shpGhostPlayback.at(-1).t + 0.3) return null;
  const mix = clamp((time - a.t) / Math.max(0.001, b.t - a.t), 0, 1);
  return { x: lerp(a.x, b.x, mix), y: lerp(a.y, b.y, mix), a: angleLerp(a.a, b.a, mix) };
}

function shpDrawGhost() {
  const pose = shpGhostPose();
  if (!pose) return;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.a);
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#f4efe0';
  ctx.strokeStyle = '#e65e2f';
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(27, 0);
  ctx.lineTo(16, 12);
  ctx.lineTo(-18, 12);
  ctx.lineTo(-27, 6);
  ctx.lineTo(-27, -6);
  ctx.lineTo(-18, -12);
  ctx.lineTo(16, -12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

var shpBaseDrawCars = drawCars;
drawCars = function shpDrawCars() {
  shpDrawGhost();
  shpBaseDrawCars();
};

var shpBaseDrawCar = drawCar;
drawCar = function shpDrawCar(car) {
  const amount = car.bodyRattle || 0;
  if (amount <= 0.01) return shpBaseDrawCar(car);
  ctx.save();
  ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount * 0.7);
  ctx.rotate((Math.random() - 0.5) * amount * 0.0025);
  shpBaseDrawCar(car);
  ctx.restore();
};

function shpSectorBest(index) {
  return currentRouteRecord()?.bestSectors?.[index] ?? null;
}

function shpCompleteSector(index, duration) {
  const key = String(trackSeed);
  const old = saved.routeRecords[key] || {};
  const bestSectors = Array.isArray(old.bestSectors) ? [...old.bestSectors] : [null, null, null];
  const previous = bestSectors[index];
  if (previous == null || duration < previous) bestSectors[index] = duration;
  saved.routeRecords[key] = { ...old, bestSectors, updatedAt: Date.now() };
  saveState();
  const delta = previous == null ? null : duration - previous;
  shpLastSectorText = delta == null ? `S${index + 1} ${formatTime(duration)}` : `S${index + 1} ${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(3)}`;
  showRaceMessage(shpLastSectorText, 0.72);
  shpUpdateSectorHud(delta);
}

function shpUpdateSectors() {
  if (!player || mode !== 'race') return;
  if (player.completedLaps > shpLastCompletedLaps) {
    const sectorDuration = raceElapsed - shpSectorStartedAt;
    shpCompleteSector(2, sectorDuration);
    const lapDuration = raceElapsed - shpLapStartedAt;
    shpStoreBestLap(lapDuration);
    shpLapStartedAt = raceElapsed;
    shpSectorStartedAt = raceElapsed;
    shpSectorIndex = 0;
    shpLastCompletedLaps = player.completedLaps;
    shpGhostSamples = [];
    shpGhostSampleClock = 0;
    shpGhostCursor = 0;
    return;
  }

  const lapDistance = player.progressDistance - player.completedLaps * track.totalLength;
  const boundary = (shpSectorIndex + 1) * track.totalLength / 3;
  if (shpSectorIndex < 2 && lapDistance >= boundary) {
    const duration = raceElapsed - shpSectorStartedAt;
    shpCompleteSector(shpSectorIndex, duration);
    shpSectorStartedAt = raceElapsed;
    shpSectorIndex += 1;
  }
}

function shpUpdateSectorHud(delta = null) {
  const node = document.querySelector('#sectorDelta');
  if (!node) return;
  node.textContent = shpLastSectorText;
  node.dataset.tone = delta == null ? 'neutral' : delta <= 0 ? 'gain' : 'loss';
}

function shpCrossedIndex(car, index) {
  if (car.previousTrackIndex <= car.trackIndex) return car.previousTrackIndex < index && car.trackIndex >= index;
  return index > car.previousTrackIndex || index <= car.trackIndex;
}

function shpProcessExtraRamps() {
  if (shpRampIndices.length < 2) return;
  for (const car of cars) {
    if (car.airborne || car.jumpCooldown > 0 || Math.abs(car.forwardSpeed) < 330) continue;
    for (const index of shpRampIndices.slice(1)) {
      if (!shpCrossedIndex(car, index)) continue;
      car.airborne = true;
      car.z = 2;
      car.vz = clamp(Math.abs(car.forwardSpeed) * 0.47, 205, 330);
      car.jumpCooldown = 1.4;
      if (car.player) {
        showRaceMessage('ОТРЫВ', 0.55);
        audio.blip('jump', 0.84);
        navigator.vibrate?.(10);
      }
      break;
    }
  }
}

function shpDrawOneRamp(index) {
  const point = track[index];
  if (!point) return;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.heading);
  ctx.fillStyle = '#d45731';
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 4;
  ctx.fillRect(-32, -roadHalf + 12, 64, roadWidth - 24);
  ctx.strokeRect(-32, -roadHalf + 12, 64, roadWidth - 24);
  ctx.fillStyle = '#f2eee0';
  for (let y = -roadHalf + 18; y < roadHalf - 18; y += 24) {
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.lineTo(6, y + 10);
    ctx.lineTo(-20, y + 20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

drawRamp = function shpDrawRamps() {
  shpRampIndices.forEach(shpDrawOneRamp);
};

var shpBaseResolvePairCollision = resolvePairCollision;
resolvePairCollision = function shpResolvePairCollision(a, b) {
  const avx = a.vx; const avy = a.vy; const bvx = b.vx; const bvy = b.vy;
  shpBaseResolvePairCollision(a, b);
  const impulseA = Math.hypot(a.vx - avx, a.vy - avy);
  const impulseB = Math.hypot(b.vx - bvx, b.vy - bvy);
  const strength = Math.max(impulseA, impulseB);
  if (strength < 8) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy) || 1;
  const tx = -dy / distance;
  const ty = dx / distance;
  const relativeTangent = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
  a.yawRate -= relativeTangent * 0.0018;
  b.yawRate += relativeTangent * 0.0018;
  a.bodyRattle = Math.max(a.bodyRattle || 0, clamp(strength * 0.08, 1.2, 8));
  b.bodyRattle = Math.max(b.bodyRattle || 0, clamp(strength * 0.08, 1.2, 8));
  if (strength > 34) spawnSparks((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, dx / distance, dy / distance, clamp(strength / 150, 0.25, 0.9));
}

var shpBaseResolveRoadCollision = resolveRoadCollision;
resolveRoadCollision = function shpResolveRoadCollision(car) {
  const vx = car.vx; const vy = car.vy;
  shpBaseResolveRoadCollision(car);
  const strength = Math.hypot(car.vx - vx, car.vy - vy);
  if (strength > 7) car.bodyRattle = Math.max(car.bodyRattle || 0, clamp(strength * 0.06, 1, 7));
};

function shpAiControls(car, dt) {
  const difficulty = shpDifficulty[shpPrefs.difficulty];
  const speed = Math.abs(car.forwardSpeed);
  const lookAhead = Math.round(22 + speed / 21);
  const targetIndex = (car.trackIndex + lookAhead) % track.length;
  const target = track[targetIndex];

  car.overtakeTimer = Math.max(0, car.overtakeTimer - dt);
  const ahead = findCarAhead(car);
  if (ahead && ahead.gap < 175 + speed * 0.11 && car.overtakeTimer <= 0) {
    const relativeX = ahead.car.x - car.x;
    const relativeY = ahead.car.y - car.y;
    const side = relativeX * track[car.trackIndex].nx + relativeY * track[car.trackIndex].ny;
    car.overtakeSide = side > 0 ? -1 : 1;
    if (Math.abs(side) < 9) car.overtakeSide = Math.sin(car.aiPhase + raceElapsed) > 0 ? 1 : -1;
    car.overtakeTimer = (1.35 + car.aggression) * difficulty.aggression;
  }

  const baseOffset = target.raceOffset + car.lane * 0.28;
  const overtakeOffset = car.overtakeTimer > 0 ? car.overtakeSide * roadHalf * (0.32 + car.aggression * 0.09) : 0;
  car.aiOffset = lerp(car.aiOffset, clamp(baseOffset + overtakeOffset, -roadHalf * 0.55, roadHalf * 0.55), clamp(dt * 3.3, 0, 1));
  const targetX = target.x + target.nx * car.aiOffset;
  const targetY = target.y + target.ny * car.aiOffset;
  const desired = Math.atan2(targetY - car.y, targetX - car.x);
  const headingError = wrapAngle(desired - car.angle);
  const point = track[car.trackIndex];
  const crossTrack = (car.x - point.x) * point.nx + (car.y - point.y) * point.ny - car.aiOffset;
  let steer = headingError * 2.22 - crossTrack / Math.max(75, roadHalf * 1.15) - car.yawRate * 0.19;
  steer = clamp(steer, -1, 1);

  let targetSpeed = MAX_SPEED * 0.99;
  for (let j = 0; j < 124; j += 4) {
    let upcomingCurvature = 0;
    for (let k = 0; k < 20; k += 4) {
      const index = (car.trackIndex + j + k) % track.length;
      upcomingCurvature = Math.max(upcomingCurvature, Math.abs(track[index].curvature));
    }
    const cornerSpeed = clamp(1110 / (1 + upcomingCurvature * 590), 350, MAX_SPEED * 0.99);
    targetSpeed = Math.min(targetSpeed, cornerSpeed + j * 2.65);
  }
  targetSpeed *= car.skill;
  if (car.distanceFromRoad > roadHalf * 0.72) targetSpeed *= 0.84;
  if (shpRampIndices.some((index) => {
    let gap = index - car.trackIndex;
    if (gap < 0) gap += track.length;
    return gap < 34;
  })) targetSpeed = Math.max(targetSpeed, 515);

  car.mistakeTimer = Math.max(0, car.mistakeTimer - dt);
  if (car.mistakeTimer <= 0 && Math.random() < dt * difficulty.mistakes) car.mistakeTimer = 0.22 + Math.random() * 0.32;
  if (car.mistakeTimer > 0) steer *= shpPrefs.difficulty === 'rookie' ? 0.74 : 0.88;

  const speedError = targetSpeed - speed;
  const brake = speedError < -30 ? clamp(-speedError / 190, 0, 0.94) : (Math.abs(steer) > 0.90 && speed > targetSpeed - 2 ? 0.10 : 0);
  const throttle = speedError > -8 ? clamp((speedError + 45) / 100, 0.32, 1) : 0;
  return { steer, throttle, brake };
}

aiControls = shpAiControls;

playerControls = function shpPlayerControls() {
  const digitalSteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const keyboardActive = digitalSteer !== 0 || input.throttle || input.brake;
  if (shpPrefs.controlMode === 'buttons' || keyboardActive) {
    return { steer: digitalSteer, throttle: input.throttle ? 1 : 0, brake: input.brake ? 1 : 0 };
  }
  return { steer: shpAnalog.steer, throttle: shpAnalog.throttle, brake: shpAnalog.brake };
};

var shpBaseResetInputs = resetInputs;
resetInputs = function shpResetInputs() {
  shpBaseResetInputs();
  shpAnalog.steer = 0;
  shpAnalog.throttle = 0;
  shpAnalog.brake = 0;
  shpRenderPrecisionControls();
};

var shpBaseUpdateSimulation = updateSimulation;
updateSimulation = function shpUpdateSimulation(dt) {
  shpBaseUpdateSimulation(dt);
  if (mode === 'race') {
    shpProcessExtraRamps();
    shpRecordGhost(dt);
    shpUpdateSectors();
    cars.forEach((car) => { car.bodyRattle = Math.max(0, (car.bodyRattle || 0) - dt * 17); });
  }
};

var shpBaseFinishRace = finishRace;
finishRace = function shpFinishRace() {
  shpBaseFinishRace();
  const difficulty = shpDifficulty[shpPrefs.difficulty].label;
  finishSummary.textContent += ` ${shpActiveArchetype?.label || ''}. Соперники: ${difficulty}.`;
};

function shpRenderPrecisionControls() {
  const arc = document.querySelector('#steeringArc');
  const gate = document.querySelector('#powerGate');
  if (arc) arc.style.setProperty('--steer-value', String(shpAnalog.steer));
  if (gate) {
    const value = shpAnalog.throttle > 0 ? 0.60 - shpAnalog.throttle * 0.54 : shpAnalog.brake > 0 ? 0.66 + shpAnalog.brake * 0.31 : 0.62;
    gate.style.setProperty('--power-value', String(value));
    gate.dataset.state = shpAnalog.throttle > 0.04 ? 'throttle' : shpAnalog.brake > 0.78 ? 'reverse' : shpAnalog.brake > 0.04 ? 'brake' : 'neutral';
  }
}

function shpApplyControlMode() {
  controls.dataset.mode = shpPrefs.controlMode;
  const controlButton = document.querySelector('#controlModeButton');
  const pauseControlButton = document.querySelector('#controlModeButtonPause');
  const label = `УПРАВЛЕНИЕ: ${shpPrefs.controlMode === 'precision' ? 'РУЛЬ' : 'КНОПКИ'}`;
  if (controlButton) controlButton.textContent = label;
  if (pauseControlButton) pauseControlButton.textContent = label;
  shpRenderPrecisionControls();
}

function shpUpdateOptionButtons() {
  document.querySelectorAll('[data-track-type]').forEach((button) => button.classList.toggle('is-selected', button.dataset.trackType === shpPrefs.trackType));
  document.querySelectorAll('[data-difficulty]').forEach((button) => button.classList.toggle('is-selected', button.dataset.difficulty === shpPrefs.difficulty));
  const steeringButton = document.querySelector('#steeringFeelButtonPause');
  if (steeringButton) steeringButton.textContent = `КРИВАЯ РУЛЯ: ${shpPrefs.steeringFeel === 'precise' ? 'ТОЧНАЯ' : 'ПРЯМАЯ'}`;
}

function shpBindPrecisionControls() {
  const arc = document.querySelector('#steeringArc');
  const gate = document.querySelector('#powerGate');
  if (!arc || !gate) return;
  let steerPointer = null;
  let powerPointer = null;
  let lastPowerZone = 'neutral';

  const updateSteer = (event) => {
    const rect = arc.getBoundingClientRect();
    const raw = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
    const dead = Math.abs(raw) < 0.035 ? 0 : raw;
    const exponent = shpPrefs.steeringFeel === 'precise' ? 1.55 : 1.08;
    shpAnalog.steer = Math.sign(dead) * Math.pow(Math.abs(dead), exponent);
    shpRenderPrecisionControls();
  };
  arc.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    steerPointer = event.pointerId;
    arc.setPointerCapture?.(event.pointerId);
    updateSteer(event);
    audio.unlock();
  });
  arc.addEventListener('pointermove', (event) => { if (event.pointerId === steerPointer) updateSteer(event); });
  const releaseSteer = (event) => {
    if (steerPointer == null || (event.pointerId != null && event.pointerId !== steerPointer)) return;
    steerPointer = null;
    shpAnalog.steer = 0;
    shpRenderPrecisionControls();
  };
  arc.addEventListener('pointerup', releaseSteer);
  arc.addEventListener('pointercancel', releaseSteer);
  arc.addEventListener('lostpointercapture', () => { steerPointer = null; shpAnalog.steer = 0; shpRenderPrecisionControls(); });

  const updatePower = (event) => {
    const rect = gate.getBoundingClientRect();
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    if (y < 0.58) {
      shpAnalog.throttle = clamp((0.58 - y) / 0.54, 0, 1);
      shpAnalog.brake = 0;
    } else if (y <= 0.66) {
      shpAnalog.throttle = 0;
      shpAnalog.brake = 0;
    } else {
      shpAnalog.throttle = 0;
      shpAnalog.brake = clamp((y - 0.66) / 0.31, 0, 1);
    }
    const zone = y < 0.58 ? 'throttle' : y > 0.90 ? 'reverse' : y > 0.66 ? 'brake' : 'neutral';
    if (zone !== lastPowerZone && (zone === 'neutral' || zone === 'reverse')) navigator.vibrate?.(6);
    lastPowerZone = zone;
    shpRenderPrecisionControls();
  };
  gate.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    powerPointer = event.pointerId;
    gate.setPointerCapture?.(event.pointerId);
    updatePower(event);
    audio.unlock();
  });
  gate.addEventListener('pointermove', (event) => { if (event.pointerId === powerPointer) updatePower(event); });
  const releasePower = (event) => {
    if (powerPointer == null || (event.pointerId != null && event.pointerId !== powerPointer)) return;
    powerPointer = null;
    shpAnalog.throttle = 0;
    shpAnalog.brake = 0;
    lastPowerZone = 'neutral';
    shpRenderPrecisionControls();
  };
  gate.addEventListener('pointerup', releasePower);
  gate.addEventListener('pointercancel', releasePower);
  gate.addEventListener('lostpointercapture', () => { powerPointer = null; shpAnalog.throttle = 0; shpAnalog.brake = 0; shpRenderPrecisionControls(); });
}

function shpToggleControlMode() {
  shpPrefs.controlMode = shpPrefs.controlMode === 'precision' ? 'buttons' : 'precision';
  shpSavePrefs();
  resetInputs();
  shpApplyControlMode();
}

document.querySelectorAll('[data-track-type]').forEach((button) => button.addEventListener('click', () => {
  shpPrefs.trackType = button.dataset.trackType;
  shpSavePrefs();
  shpUpdateOptionButtons();
  prepareRoute();
  setupRace();
}));

document.querySelectorAll('[data-difficulty]').forEach((button) => button.addEventListener('click', () => {
  shpPrefs.difficulty = button.dataset.difficulty;
  shpSavePrefs();
  shpUpdateOptionButtons();
  updateRouteUi();
  setupRace();
}));

document.querySelector('#controlModeButton')?.addEventListener('click', shpToggleControlMode);
document.querySelector('#controlModeButtonPause')?.addEventListener('click', shpToggleControlMode);
document.querySelector('#steeringFeelButtonPause')?.addEventListener('click', () => {
  shpPrefs.steeringFeel = shpPrefs.steeringFeel === 'precise' ? 'direct' : 'precise';
  shpSavePrefs();
  shpUpdateOptionButtons();
});

shpBindPrecisionControls();
shpApplyControlMode();
shpUpdateOptionButtons();
