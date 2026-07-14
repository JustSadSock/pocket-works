// ШПИЛЬКА 2.5 — clean-line rhythm, sector telemetry and race setup.

var shp25LapSectorTimes = [];
var shp25SectorReference = [null, null, null];
var shp25CumulativeDelta = null;

function shp25EnsureCleanHud() {
  const cluster = document.querySelector('#speedCluster');
  if (!cluster || document.querySelector('#cleanLineMeter')) return;
  const node = document.createElement('div');
  node.id = 'cleanLineMeter';
  node.className = 'clean-line-meter';
  node.dataset.level = '0';
  node.textContent = 'ЧИСТАЯ ЛИНИЯ —';
  cluster.append(node);
}

function shp25UpdateCleanHud() {
  shp25EnsureCleanHud();
  const node = document.querySelector('#cleanLineMeter');
  if (!node) return;
  const level = Math.round(player?.shp25CleanLevel || 0);
  node.dataset.level = String(level);
  node.textContent = level > 0 ? `ЧИСТАЯ ЛИНИЯ ×${level}` : 'ЧИСТАЯ ЛИНИЯ —';
}

function shp25ApplyRivalProfiles() {
  cars.slice(1).forEach((car) => {
    const profile = shp25Profiles[car.id] || shp25Profiles.rook;
    car.shp25Profile = profile;
    car.shp25BaseName = car.name;
    car.name = `${car.name}·${profile.label}`;
    car.skill = clamp(car.skill * profile.pace, 0.78, 1.16);
    car.aggression = clamp(car.aggression * profile.aggression, 0.22, 1.36);
    car.shp25RandomState = shp25SeedForCar(car);
    car.shp25MistakeKind = null;
    car.shp25MistakeTimer = 0;
    car.shp25MistakeTotal = 0;
    car.shp25MistakeSeverity = 0;
    car.shp25MistakeCooldown = 4 + shp25Random(car) * 5;
    car.shp25ReactionDelay = lerp(profile.reaction[0], profile.reaction[1], shp25Random(car));
    car.shp25LastContact = -Infinity;
    car.shp25LastContactKind = 'none';
  });
}

var shp25BaseSetupRace = setupRace;
setupRace = function shp25SetupRace() {
  shp25BaseSetupRace();
  shp25ApplyRivalProfiles();
  shp25LapSectorTimes = [];
  const sectors = currentRouteRecord()?.bestSectors;
  shp25SectorReference = Array.isArray(sectors) ? [...sectors] : [null, null, null];
  shp25CumulativeDelta = null;
  player.shp25CleanLevel = 0;
  player.shp25BestCleanLevel = 0;
  player.shp25CornerActive = false;
  player.shp25CornerDuration = 0;
  player.shp25CornerDirty = false;
  player.shp25LastContact = -Infinity;
  player.shp25LastContactKind = 'none';
  shp25UpdateCleanHud();
};

function shp25MarkImpact(car, strength, kind) {
  if (!car) return;
  car.shp25LastContact = raceElapsed;
  car.shp25LastContactKind = kind;
  if (!car.player || strength < 18) return;
  if (strength > 72) car.shp25CleanLevel = 0;
  else car.shp25CleanLevel = Math.max(0, (car.shp25CleanLevel || 0) - 1);
  car.shp25CornerDirty = true;
  shp25UpdateCleanHud();
}

function shp25CompleteCleanCorner(car) {
  if (!car.shp25CornerDirty && car.shp25CornerDuration > 0.62) {
    const previous = car.shp25CleanLevel || 0;
    car.shp25CleanLevel = Math.min(3, previous + 1);
    car.shp25BestCleanLevel = Math.max(car.shp25BestCleanLevel || 0, car.shp25CleanLevel);
    if (car.shp25CleanLevel === 3 && previous < 3) {
      showRaceMessage('ЧИСТАЯ ЛИНИЯ ×3', 0.64);
      navigator.vibrate?.(5);
    }
  } else if (car.shp25CornerDirty) {
    car.shp25CleanLevel = Math.max(0, (car.shp25CleanLevel || 0) - 1);
  }
  car.shp25CornerActive = false;
  car.shp25CornerDuration = 0;
  car.shp25CornerDirty = false;
  shp25UpdateCleanHud();
}

function shp25UpdateCleanLine(car, dt) {
  if (!car.player || mode !== 'race' || car.shp24RecoveryImmunity > 0) return;
  const point = track[car.trackIndex];
  if (!point) return;
  const curvature = Math.abs(point.curvature);
  const inCorner = curvature > 0.00072;
  const leftCorner = curvature < 0.00048;
  const speed = Math.abs(car.forwardSpeed || 0);
  const cleanNow = car.distanceFromRoad < roadHalf * 0.84
    && Math.abs(car.signedRoadOffset) < roadHalf * 0.74
    && (car.slip || 0) < 78
    && speed > 150
    && raceElapsed - (car.shp25LastContact || -Infinity) > 0.72;

  if (inCorner) {
    if (!car.shp25CornerActive) {
      car.shp25CornerActive = true;
      car.shp25CornerDuration = 0;
      car.shp25CornerDirty = false;
    }
    car.shp25CornerDuration += dt;
    if (!cleanNow) car.shp25CornerDirty = true;
  } else if (car.shp25CornerActive && leftCorner) {
    shp25CompleteCleanCorner(car);
  }

  if (car.distanceFromRoad > roadHalf + 8) {
    car.shp25CleanLevel = 0;
    car.shp25CornerDirty = true;
    shp25UpdateCleanHud();
  }

  const stability = clamp((car.shp25CleanLevel || 0) / 3, 0, 1);
  if (stability <= 0 || car.airborne) return;
  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const rightX = -forwardY;
  const rightY = forwardX;
  const forwardSpeed = car.vx * forwardX + car.vy * forwardY;
  let lateralSpeed = car.vx * rightX + car.vy * rightY;
  lateralSpeed *= Math.exp(-0.26 * stability * dt);
  car.yawRate *= Math.exp(-0.055 * stability * dt);
  car.vx = forwardX * forwardSpeed + rightX * lateralSpeed;
  car.vy = forwardY * forwardSpeed + rightY * lateralSpeed;
  car.forwardSpeed = forwardSpeed;
  car.lateralSpeed = lateralSpeed;
}

var shp25BaseUpdateCar = updateCar;
updateCar = function shp25UpdateCar(car, dt) {
  shp25BaseUpdateCar(car, dt);
  shp25UpdateCleanLine(car, dt);
};

shpCompleteSector = function shp25CompleteSector(index, duration) {
  const key = String(trackSeed);
  const old = saved.routeRecords[key] || {};
  const previousBest = Array.isArray(shp25SectorReference) ? shp25SectorReference[index] : null;
  const bestSectors = Array.isArray(old.bestSectors) ? [...old.bestSectors] : [null, null, null];
  if (bestSectors[index] == null || duration < bestSectors[index]) bestSectors[index] = duration;
  saved.routeRecords[key] = { ...old, bestSectors, updatedAt: Date.now() };
  saveState();

  shp25LapSectorTimes[index] = duration;
  const delta = previousBest == null ? null : duration - previousBest;
  const completed = shp25LapSectorTimes.slice(0, index + 1);
  const reference = shp25SectorReference.slice(0, index + 1);
  const hasCumulative = completed.length === index + 1
    && completed.every(Number.isFinite)
    && reference.length === index + 1
    && reference.every(Number.isFinite);
  shp25CumulativeDelta = hasCumulative
    ? completed.reduce((sum, value) => sum + value, 0) - reference.reduce((sum, value) => sum + value, 0)
    : null;

  const sectorText = delta == null
    ? `S${index + 1} ${formatTime(duration)}`
    : `S${index + 1} ${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(3)}`;
  const cumulativeText = shp25CumulativeDelta == null
    ? ''
    : ` · Σ ${shp25CumulativeDelta <= 0 ? '−' : '+'}${Math.abs(shp25CumulativeDelta).toFixed(3)}`;
  shpLastSectorText = sectorText + cumulativeText;
  showRaceMessage(shpLastSectorText, 0.78);
  shpUpdateSectorHud(delta);

  if (index === 2) {
    shp25SectorReference = [...bestSectors];
    shp25LapSectorTimes = [];
    shp25CumulativeDelta = null;
  }
};

var shp25BaseFinishRace = finishRace;
finishRace = function shp25FinishRace() {
  shp25BaseFinishRace();
  const clean = player?.shp25BestCleanLevel || 0;
  finishSummary.textContent += ` Чистая серия ×${clean}.`;
};

shp25EnsureCleanHud();
const shp25Subtitle = document.querySelector('.start-copy .subtitle');
if (shp25Subtitle) {
  shp25Subtitle.textContent = 'Два длинных круга, разные характеры соперников, живые ошибки и награда за чистую линию.';
}
