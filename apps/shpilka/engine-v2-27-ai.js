// ШПИЛЬКА 2.7 — distance-based AI, disciplined pack driving and live post-finish classification.

var shp27DifficultyTune = {
  rookie: { max: 0.925, lateral: 310, brake: 500, lineRate: 42, reaction: 0.16, error: 0.020 },
  racer: { max: 0.985, lateral: 382, brake: 555, lineRate: 52, reaction: 0.08, error: 0.008 },
  maniac: { max: 1.000, lateral: 462, brake: 615, lineRate: 61, reaction: 0.018, error: 0 },
  pilot: { max: 1.000, lateral: 510, brake: 650, lineRate: 67, reaction: 0, error: 0 }
};

var shp27PostFinishActive = false;
var shp27PostFinishSimulated = 0;
var shp27PostFinishRenderClock = 0;
var shp27StoredFinishRace = finishRace;
var shp27StoredUpdateSimulation = updateSimulation;

function shp27TrackIndexAtDistance(startIndex, forwardDistance) {
  if (!track.length) return 0;
  const start = track[(startIndex + track.length) % track.length];
  let targetDistance = start.distance + Math.max(0, forwardDistance);
  targetDistance %= Math.max(1, track.totalLength);
  let low = 0;
  let high = track.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (track[middle].distance < targetDistance) low = middle + 1;
    else high = middle;
  }
  return low % track.length;
}

function shp27PointAhead(car, distance) {
  return track[shp27TrackIndexAtDistance(car.trackIndex, distance)];
}

function shp27CurvePreview(car, maximumDistance = 620) {
  let maximum = 0;
  let signed = 0;
  let firstCornerDistance = Infinity;
  let weightedSigned = 0;
  let weightedAmount = 0;
  for (let distance = 24; distance <= maximumDistance; distance += 24) {
    const point = shp27PointAhead(car, distance);
    const curvature = point?.curvature || 0;
    const amount = Math.abs(curvature);
    if (amount > maximum) {
      maximum = amount;
      signed = curvature;
    }
    if (amount > 0.00068 && firstCornerDistance === Infinity) firstCornerDistance = distance;
    const weight = Math.max(0, 1 - distance / (maximumDistance + 24));
    weightedSigned += curvature * weight;
    weightedAmount += weight;
  }
  return {
    maximum,
    signed: Math.abs(weightedSigned) > 0.00001 ? weightedSigned / Math.max(0.001, weightedAmount) : signed,
    firstCornerDistance
  };
}

function shp27MoveToward(value, target, maximumDelta) {
  if (value < target) return Math.min(target, value + maximumDelta);
  return Math.max(target, value - maximumDelta);
}

function shp27GapBetween(a, b) {
  let gap = (b.raceScore || 0) - (a.raceScore || 0);
  const length = Math.max(1, track.totalLength || 1);
  while (gap > length * 0.5) gap -= length;
  while (gap < -length * 0.5) gap += length;
  return gap;
}

function shp27LaneClear(car, targetOffset, longitudinalRange = 108) {
  for (const other of cars) {
    if (other === car || other.finishTime != null) continue;
    const gap = Math.abs(shp27GapBetween(car, other));
    if (gap > longitudinalRange) continue;
    if (Math.abs((other.signedRoadOffset || 0) - targetOffset) < CAR_HALF_WIDTH * 2.7) return false;
  }
  return true;
}

function shp27FindSidePressure(car) {
  let pressure = 0;
  let closest = Infinity;
  for (const other of cars) {
    if (other === car || other.finishTime != null) continue;
    const gap = Math.abs(shp27GapBetween(car, other));
    if (gap > 82) continue;
    const lateral = (other.signedRoadOffset || 0) - (car.signedRoadOffset || 0);
    const distance = Math.abs(lateral);
    if (distance < closest && distance < 48) {
      closest = distance;
      pressure = lateral >= 0 ? -1 : 1;
    }
  }
  return pressure;
}

function shp27SetTactic(car, kind, side, duration) {
  car.shp27Tactic = kind;
  car.shp27TacticSide = side;
  car.shp27TacticTimer = duration;
  car.shp27TacticTotal = duration;
}

function shp27UpdateTactic(car, dt, preview) {
  car.shp27TacticTimer = Math.max(0, (car.shp27TacticTimer || 0) - dt);
  car.shp27TacticCooldown = Math.max(0, (car.shp27TacticCooldown || 0) - dt);
  if (car.shp27TacticTimer <= 0) {
    car.shp27Tactic = 'line';
    car.shp27TacticSide = 0;
  }

  const ahead = findCarAhead(car);
  const behind = typeof shp26FindCarBehind === 'function' ? shp26FindCarBehind(car) : null;
  const speed = Math.abs(car.forwardSpeed || 0);
  const cornerSoon = preview.firstCornerDistance < 280;
  const straightEnough = preview.maximum < 0.0010 || preview.firstCornerDistance > 190;
  const rivalPressure = car.id === (typeof shp26RivalId === 'function' ? shp26RivalId() : null)
    && behind?.car?.player;

  if (car.shp27Tactic === 'line' && car.shp27TacticCooldown <= 0) {
    if (behind && behind.gap < (rivalPressure ? 176 : 132) && speed > 210 && cornerSoon) {
      const inside = Math.sign(preview.signed) || ((behind.car.signedRoadOffset || 0) > 0 ? 1 : -1);
      const targetOffset = inside * roadHalf * 0.32;
      if (shp27LaneClear(car, targetOffset, 76)) {
        shp27SetTactic(car, 'defend', inside, rivalPressure ? 1.35 : 1.05);
        car.shp27TacticCooldown = rivalPressure ? 2.1 : 2.8;
      }
    } else if (ahead && ahead.gap < 176 && speed > 190 && straightEnough) {
      let side = (ahead.car.signedRoadOffset || 0) > 0 ? -1 : 1;
      if (cornerSoon && preview.firstCornerDistance < 210) side = Math.sign(preview.signed) || side;
      let targetOffset = side * roadHalf * 0.38;
      if (!shp27LaneClear(car, targetOffset, 98)) {
        side *= -1;
        targetOffset *= -1;
      }
      if (shp27LaneClear(car, targetOffset, 98)) {
        shp27SetTactic(car, 'attack', side, cornerSoon ? 1.25 : 1.85);
        car.shp27TacticCooldown = 0.55;
      } else {
        shp27SetTactic(car, 'follow', 0, 0.42);
        car.shp27TacticCooldown = 0.32;
      }
    }
  }

  if (car.shp27Tactic === 'attack' && ahead) {
    const targetOffset = car.shp27TacticSide * roadHalf * 0.38;
    const lateralGap = Math.abs((ahead.car.signedRoadOffset || 0) - targetOffset);
    if (ahead.gap < 62 && lateralGap < 34 && !shp27LaneClear(car, targetOffset, 68)) {
      shp27SetTactic(car, 'follow', 0, 0.38);
      car.shp27TacticCooldown = 0.55;
    }
  }

  return { ahead, behind };
}

function shp27UpdateMildError(car, dt, tune, preview) {
  car.shp27ErrorTimer = Math.max(0, (car.shp27ErrorTimer || 0) - dt);
  car.shp27ErrorCooldown = Math.max(0, (car.shp27ErrorCooldown || 0) - dt);
  if (tune.error <= 0) {
    car.shp27ErrorTimer = 0;
    car.shp27ErrorCooldown = 9999;
    return;
  }
  if (car.shp27ErrorTimer <= 0 && car.shp27ErrorCooldown <= 0 && preview.maximum > 0.00072) {
    if (shp25Random(car) < dt * tune.error) {
      car.shp27ErrorTimer = lerp(0.32, 0.62, shp25Random(car));
      car.shp27ErrorCooldown = lerp(7, 13, shp25Random(car));
      car.shp27ErrorSide = shp25Random(car) > 0.5 ? 1 : -1;
    }
  }
}

function shp27TargetSpeed(car, profile, tune, preview, ahead) {
  const skill = clamp(car.skill || 1, 0.78, 1.23);
  const cornerAbility = tune.lateral * clamp(profile.corner || 1, 0.92, 1.12) * lerp(0.92, 1.08, (skill - 0.78) / 0.45);
  const straightFactor = clamp(profile.straight || 1, 0.96, 1.10);
  let targetSpeed = MAX_SPEED * tune.max * straightFactor;

  for (let distance = 18; distance <= 690; distance += 30) {
    let curvature = 0;
    for (let sample = -24; sample <= 48; sample += 24) {
      const point = shp27PointAhead(car, Math.max(0, distance + sample));
      curvature = Math.max(curvature, Math.abs(point?.curvature || 0));
    }
    if (curvature < 0.00010) continue;
    const safeSpeed = clamp(Math.sqrt(cornerAbility / curvature), 300, MAX_SPEED * tune.max);
    const reachable = Math.sqrt(safeSpeed * safeSpeed + 2 * tune.brake * distance);
    targetSpeed = Math.min(targetSpeed, reachable);
  }

  if (preview.maximum > 0.00115) targetSpeed *= clamp(profile.corner || 1, 0.94, 1.08);
  if (car.shp27ErrorTimer > 0) targetSpeed *= 0.91;

  const offset = Math.abs(car.signedRoadOffset || 0);
  if (offset > roadHalf * 0.62) targetSpeed = Math.min(targetSpeed, 410);
  if (offset > roadHalf * 0.78) targetSpeed = Math.min(targetSpeed, 300);
  if ((car.slip || 0) > 105) targetSpeed *= 0.82;

  if (ahead && ahead.gap < 150) {
    const sameLane = Math.abs((ahead.car.signedRoadOffset || 0) - (car.signedRoadOffset || 0)) < 42;
    if (sameLane || car.shp27Tactic === 'follow') {
      const leaderSpeed = Math.max(0, Math.abs(ahead.car.forwardSpeed || 0));
      const spacingSpeed = leaderSpeed + Math.max(0, ahead.gap - 44) * 1.45;
      targetSpeed = Math.min(targetSpeed, spacingSpeed);
    }
  }

  return clamp(targetSpeed, 160, MAX_SPEED * 1.01);
}

function shp27AiControls(car, dt) {
  const profile = car.shp25Profile || shp25Profiles[car.id] || shp25Profiles.rook;
  const difficultyId = shpPrefs.difficulty in shp27DifficultyTune ? shpPrefs.difficulty : 'racer';
  const tune = shp27DifficultyTune[difficultyId];
  const speed = Math.abs(car.forwardSpeed || 0);
  const preview = shp27CurvePreview(car);
  const traffic = shp27UpdateTactic(car, dt, preview);
  shp27UpdateMildError(car, dt, tune, preview);

  const speedRatio = clamp(speed / MAX_SPEED, 0, 1);
  const lookAheadDistance = lerp(96, 236, speedRatio) * lerp(0.96, 1.05, clamp((profile.precision || 1) - 0.9, 0, 0.3) / 0.3);
  const target = shp27PointAhead(car, lookAheadDistance);
  const currentPoint = track[car.trackIndex];
  const cornerLoad = clamp(preview.maximum / 0.0022, 0, 1);
  const safeOffsetLimit = roadHalf * lerp(0.48, 0.36, cornerLoad);

  let desiredOffset = (target?.raceOffset || 0) * 0.82 + (car.lane || 0) * 0.08;
  if (car.shp27Tactic === 'attack') desiredOffset += car.shp27TacticSide * roadHalf * 0.38;
  else if (car.shp27Tactic === 'defend') desiredOffset += car.shp27TacticSide * roadHalf * 0.31;

  const sidePressure = shp27FindSidePressure(car);
  if (sidePressure) desiredOffset += sidePressure * roadHalf * 0.10;
  if (car.shp27ErrorTimer > 0) desiredOffset += car.shp27ErrorSide * roadHalf * 0.075;

  const currentOffset = car.signedRoadOffset || 0;
  if (Math.abs(currentOffset) > roadHalf * 0.60) desiredOffset *= 0.34;
  if (Math.abs(currentOffset) > roadHalf * 0.78) desiredOffset = 0;
  desiredOffset = clamp(desiredOffset, -safeOffsetLimit, safeOffsetLimit);

  const lineRate = tune.lineRate * clamp(profile.precision || 1, 0.88, 1.25);
  car.aiOffset = shp27MoveToward(car.aiOffset || 0, desiredOffset, lineRate * dt);
  const targetX = target.x + target.nx * car.aiOffset;
  const targetY = target.y + target.ny * car.aiOffset;
  const desiredHeading = Math.atan2(targetY - car.y, targetX - car.x);
  const headingError = wrapAngle(desiredHeading - car.angle);
  const crossTrack = currentOffset - car.aiOffset;

  let steer = headingError * lerp(2.54, 2.24, speedRatio)
    - crossTrack / Math.max(70, roadHalf * 0.86)
    - car.yawRate * lerp(0.24, 0.30, speedRatio)
    - (car.lateralSpeed || 0) / 620;

  if (Math.abs(currentOffset) > roadHalf * 0.64) {
    steer += -Math.sign(currentOffset) * lerp(0.16, 0.48, smoothstep(roadHalf * 0.64, roadHalf, Math.abs(currentOffset)));
  }
  steer = clamp(steer, -1, 1);

  const targetSpeed = shp27TargetSpeed(car, profile, tune, preview, traffic.ahead);
  const speedError = targetSpeed - speed;
  let brake = speedError < -12 ? clamp(-speedError / 138, 0, 0.98) : 0;
  let throttle = speedError > -4 ? clamp((speedError + 35) / 76, 0.20, 1) : 0;

  if (Math.abs(steer) > 0.92 && speed > targetSpeed - 5) brake = Math.max(brake, 0.06);
  if ((car.slip || 0) > 120) {
    throttle = Math.min(throttle, 0.44);
    brake = Math.max(brake, 0.04);
  }
  if (car.distanceFromRoad > roadHalf) {
    throttle = Math.min(throttle, 0.58);
    brake = Math.min(brake, 0.10);
  }
  if (raceElapsed < (car.shp27ReactionDelay || 0)) {
    throttle = 0;
    brake = 0;
  }

  return { steer, throttle, brake };
}

aiControls = shp27AiControls;

var shp27BaseSetupRace = setupRace;
setupRace = function shp27SetupRace() {
  shp27BaseSetupRace();
  const tune = shp27DifficultyTune[shpPrefs.difficulty] || shp27DifficultyTune.racer;
  cars.forEach((car, index) => {
    car.shp27StartProgress = car.progressDistance;
    car.shp27ProgressSpeed = 0;
    car.shp27ProgressSample = car.progressDistance;
    car.shp27Tactic = 'line';
    car.shp27TacticSide = 0;
    car.shp27TacticTimer = 0;
    car.shp27TacticTotal = 0;
    car.shp27TacticCooldown = 0.35 + index * 0.12;
    car.shp27ErrorTimer = 0;
    car.shp27ErrorCooldown = index * 0.8 + 4;
    car.shp27ErrorSide = 0;
    if (!car.player) {
      car.shp27ReactionDelay = tune.reaction * lerp(0.65, 1.05, shp25Random(car));
      car.shp25MistakeKind = null;
      car.shp25MistakeTimer = 0;
      if (shpPrefs.difficulty === 'maniac' || shpPrefs.difficulty === 'pilot') car.shp25MistakeCooldown = 9999;
    }
  });
  shp27PostFinishActive = false;
  shp27PostFinishSimulated = 0;
  shp27PostFinishRenderClock = 0;
  restartButtonFinish.disabled = false;
};

function shp27PredictionFor(car) {
  if (Number.isFinite(car.finishTime)) return car.finishTime;
  const finishDistance = lapsToWin * track.totalLength;
  const remaining = Math.max(0, finishDistance - (car.progressDistance || 0));
  const covered = Math.max(0, (car.progressDistance || 0) - (car.shp27StartProgress || 0));
  const average = covered / Math.max(1.5, raceElapsed);
  const current = Math.max(0, car.shp27ProgressSpeed || 0);
  const pace = clamp(current * 0.62 + average * 0.38, 180, 650);
  return raceElapsed + remaining / pace;
}

function shp27ClassificationOrder() {
  return [...cars].sort((a, b) => {
    const timeA = Number.isFinite(a.finishTime) ? a.finishTime : shp27PredictionFor(a);
    const timeB = Number.isFinite(b.finishTime) ? b.finishTime : shp27PredictionFor(b);
    return timeA - timeB;
  });
}

function shp27RenderLiveClassification() {
  const ranking = shp27ClassificationOrder();
  resultsNode.innerHTML = '';
  ranking.forEach((car, index) => {
    const item = document.createElement('li');
    if (car.player) item.classList.add('is-player');
    if (car.id === (typeof shp26RivalId === 'function' ? shp26RivalId() : null)) item.classList.add('is-rival');
    const status = Number.isFinite(car.finishTime)
      ? formatTime(car.finishTime)
      : `ПРОГНОЗ ${formatTime(shp27PredictionFor(car))}`;
    item.innerHTML = `<span>${index + 1}</span><b>${car.name}</b><time>${status}</time>`;
    resultsNode.append(item);
  });
}

function shp27BeginPostFinish() {
  if (shp27PostFinishActive) return;
  shp27PostFinishActive = true;
  shp27PostFinishSimulated = 0;
  shp27PostFinishRenderClock = 0;
  mode = 'postfinish';
  resetInputs();
  showRaceUi(false);
  countdownNode.hidden = true;
  recoverButton.hidden = true;
  audio.update(player, false);
  player.vx = 0;
  player.vy = 0;
  player.forwardSpeed = 0;
  player.lateralSpeed = 0;
  player.yawRate = 0;
  player.shp24RecoveryImmunity = 9999;

  const ranking = [...cars].sort(compareRaceOrder);
  const place = ranking.indexOf(player) + 1;
  finishKicker.textContent = place === 1 ? 'ЧИСТАЯ РАБОТА' : place <= 3 ? 'ПОДИУМ' : 'ФИНИШ';
  finishTitle.textContent = `${place} МЕСТО`;
  finishSummary.textContent = `${trackName}. Время ${formatTime(player.finishTime || raceElapsed)}. Остальные машины ещё на трассе — классификация просчитывается.`;
  restartButtonFinish.textContent = 'РАСЧЁТ ФИНИША';
  restartButtonFinish.disabled = true;
  finishScreen.hidden = false;
  shp27RenderLiveClassification();
}

finishRace = function shp27FinishRace() {
  if (mode === 'postfinish' || shp27PostFinishActive) return;
  shp27BeginPostFinish();
};

function shp27FinalizePostFinish() {
  if (!shp27PostFinishActive) return;
  shp27PostFinishActive = false;
  mode = 'race';
  restartButtonFinish.disabled = false;
  shp27StoredFinishRace();
}

updateSimulation = function shp27UpdateSimulation(dt) {
  if (mode !== 'postfinish') {
    shp27StoredUpdateSimulation(dt);
    return;
  }

  const acceleration = 4;
  for (let step = 0; step < acceleration; step += 1) {
    raceElapsed += dt;
    shp27PostFinishSimulated += dt;
    for (const car of cars) {
      if (car.player || car.finishTime != null) continue;
      const before = car.progressDistance;
      updateCar(car, dt);
      const rawSpeed = Math.max(0, (car.progressDistance - before) / Math.max(0.0001, dt));
      car.shp27ProgressSpeed = lerp(car.shp27ProgressSpeed || rawSpeed, rawSpeed, 0.08);
      if (car.finishTime != null) {
        car.vx = 0;
        car.vy = 0;
        car.forwardSpeed = 0;
        car.lateralSpeed = 0;
        car.shp24RecoveryImmunity = 9999;
      }
    }
    resolveCarCollisions();
    updateParticles(dt);
    updateRaceOrder();
  }

  shp27PostFinishRenderClock += dt * acceleration;
  if (shp27PostFinishRenderClock >= 0.12) {
    shp27PostFinishRenderClock = 0;
    shp27RenderLiveClassification();
  }

  const unfinished = cars.some((car) => !car.player && car.finishTime == null);
  if (!unfinished || shp27PostFinishSimulated > 95) {
    if (unfinished) {
      const remaining = cars.filter((car) => !car.player && car.finishTime == null)
        .sort((a, b) => shp27PredictionFor(a) - shp27PredictionFor(b));
      let previous = Math.max(player.finishTime || raceElapsed, ...cars.filter((car) => Number.isFinite(car.finishTime)).map((car) => car.finishTime));
      for (const car of remaining) {
        previous = Math.max(previous + 0.18, shp27PredictionFor(car));
        car.finishTime = previous;
        car.shp27ProjectedClassification = true;
      }
    }
    shp27FinalizePostFinish();
  }
};

const shp27Subtitle = document.querySelector('.start-copy .subtitle');
if (shp27Subtitle) {
  shp27Subtitle.textContent = 'Два длинных круга, дисциплинированный пелотон, честная борьба и полная классификация после финиша.';
}
