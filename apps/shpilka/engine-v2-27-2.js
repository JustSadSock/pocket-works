// ШПИЛЬКА 2.7.2 — route-specific driver form and natural field spread.

var shp272Affinity = {
  rook: { speed: -0.005, technical: 0.004, mountain: 0.008, cascade: -0.002 },
  volt: { speed: 0.028, technical: -0.024, mountain: -0.015, cascade: 0.012 },
  mara: { speed: -0.024, technical: 0.029, mountain: 0.023, cascade: -0.009 },
  shunt: { speed: 0.014, technical: -0.010, mountain: -0.021, cascade: 0.027 }
};

var shp272SectorShape = {
  rook: [0.002, -0.001, 0.001],
  volt: [0.008, -0.005, -0.003],
  mara: [-0.006, 0.008, 0.004],
  shunt: [0.005, -0.008, 0.009]
};

var shp272LapShape = {
  rook: [0, 0.002],
  volt: [0.002, -0.002],
  mara: [-0.001, 0.003],
  shunt: [0.003, -0.004]
};

var shp272SpreadByDifficulty = {
  rookie: 0.48,
  racer: 0.72,
  maniac: 1.00,
  pilot: 1.10
};

function shp272RouteType() {
  return shpActiveArchetype?.id || (shpPrefs.trackType === 'mix' ? 'speed' : shpPrefs.trackType) || 'speed';
}

function shp272NoiseFor(car) {
  let seed = hashSeed((trackSeed ^ 0x272f13a9) >>> 0);
  for (let index = 0; index < car.id.length; index += 1) {
    seed = hashSeed(seed ^ (car.id.charCodeAt(index) * (index + 29)));
  }
  return ((seed >>> 0) / 4294967296 - 0.5) * 0.014;
}

function shp272SectorIndex(car) {
  const length = Math.max(1, track.totalLength || 1);
  const distance = ((car.progressDistance || 0) % length + length) % length;
  return Math.min(2, Math.floor(distance / length * 3));
}

function shp272PaceMultiplier(car) {
  if (!car || car.player) return 1;
  const difficulty = shpPrefs.difficulty in shp272SpreadByDifficulty ? shpPrefs.difficulty : 'racer';
  const spread = shp272SpreadByDifficulty[difficulty];
  const type = shp272RouteType();
  const affinity = shp272Affinity[car.id]?.[type] || 0;
  const sector = shp272SectorShape[car.id]?.[shp272SectorIndex(car)] || 0;
  const lapIndex = Math.min(1, Math.max(0, car.completedLaps || 0));
  const lap = shp272LapShape[car.id]?.[lapIndex] || 0;
  const routeForm = Number.isFinite(car.shp272RouteForm) ? car.shp272RouteForm : shp272NoiseFor(car);
  return clamp(1 + (affinity + sector + lap + routeForm) * spread, 0.952, 1.035);
}

function shp272HasPassingLane(car, ahead) {
  if (!ahead?.car) return false;
  const lateralGap = Math.abs((ahead.car.signedRoadOffset || 0) - (car.signedRoadOffset || 0));
  return lateralGap > CAR_HALF_WIDTH * 2.05 || car.shp27Tactic === 'attack';
}

var shp272BaseUpdateTactic = shp27UpdateTactic;
shp27UpdateTactic = function shp272UpdateTactic(car, dt, preview) {
  const traffic = shp272BaseUpdateTactic(car, dt, preview);
  const ahead = traffic.ahead;
  if (!ahead || car.player || car.shp27Tactic !== 'line' || car.shp27TacticCooldown > 0) return traffic;

  const ownPace = shp272PaceMultiplier(car);
  const leaderPace = shp272PaceMultiplier(ahead.car);
  const stronger = ownPace > leaderPace + 0.007;
  const straightEnough = preview.maximum < 0.00105 || preview.firstCornerDistance > 225;
  if (!stronger || !straightEnough || ahead.gap < 70 || ahead.gap > 232 || Math.abs(car.forwardSpeed || 0) < 210) return traffic;

  let side = (ahead.car.signedRoadOffset || 0) >= (car.signedRoadOffset || 0) ? -1 : 1;
  let targetOffset = side * roadHalf * 0.34;
  if (!shp27LaneClear(car, targetOffset, 112)) {
    side *= -1;
    targetOffset *= -1;
  }
  if (shp27LaneClear(car, targetOffset, 112)) {
    shp27SetTactic(car, 'attack', side, preview.firstCornerDistance < 250 ? 1.35 : 2.05);
    car.shp27TacticCooldown = 0.48;
  }
  return traffic;
};

var shp272BaseTargetSpeed = shp27TargetSpeed;
shp27TargetSpeed = function shp272TargetSpeed(car, profile, tune, preview, ahead) {
  const pace = shp272PaceMultiplier(car);
  const packed = shp272BaseTargetSpeed(car, profile, tune, preview, ahead) * pace;
  if (!ahead?.car) return clamp(packed, 160, MAX_SPEED * 1.01);

  const free = shp272BaseTargetSpeed(car, profile, tune, preview, null) * pace;
  const leaderPace = shp272PaceMultiplier(ahead.car);
  const paceAdvantage = pace - leaderPace;
  const passing = car.shp27Tactic === 'attack' && shp272HasPassingLane(car, ahead);
  if (passing && paceAdvantage > 0.005 && ahead.gap > 38) {
    const leaderSpeed = Math.abs(ahead.car.forwardSpeed || 0);
    const release = clamp((paceAdvantage - 0.005) / 0.035, 0, 1);
    const passingSpeed = leaderSpeed + lerp(28, 76, release);
    return clamp(Math.max(packed, Math.min(free, passingSpeed)), 160, MAX_SPEED * 1.01);
  }
  return clamp(packed, 160, MAX_SPEED * 1.01);
};

var shp272BaseSetupRace = setupRace;
setupRace = function shp272SetupRace() {
  shp272BaseSetupRace();
  for (const car of cars) {
    if (car.player) continue;
    car.shp272RouteForm = shp272NoiseFor(car);
  }
};

const shp272Subtitle = document.querySelector('.start-copy .subtitle');
if (shp272Subtitle) {
  shp272Subtitle.textContent = 'Два длинных круга, разные сильные стороны соперников, разрывы по темпу и честная борьба.';
}
