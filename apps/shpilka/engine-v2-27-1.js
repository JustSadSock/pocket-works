// ШПИЛЬКА 2.7.1 — stable racing line, lane hysteresis and steering-rate limits.

var shp271SteeringTune = {
  rookie: { lineRate: 24, steerRate: 2.35 },
  racer: { lineRate: 28, steerRate: 2.75 },
  maniac: { lineRate: 32, steerRate: 3.10 },
  pilot: { lineRate: 35, steerRate: 3.35 }
};

function shp271AverageRaceOffset(car, preview) {
  const cornerSoon = preview.firstCornerDistance < 260;
  const samples = cornerSoon
    ? [[62, 0.48], [126, 0.34], [210, 0.18]]
    : [[92, 0.42], [188, 0.34], [306, 0.24]];
  let total = 0;
  let weight = 0;
  for (const [distance, amount] of samples) {
    const point = shp27PointAhead(car, distance);
    total += (point?.raceOffset || 0) * amount;
    weight += amount;
  }
  return total / Math.max(0.001, weight);
}

function shp271ImmediateNeighbour(car) {
  let nearest = null;
  let nearestScore = Infinity;
  for (const other of cars) {
    if (other === car || other.finishTime != null) continue;
    const longitudinal = shp27GapBetween(car, other);
    if (Math.abs(longitudinal) > 50) continue;
    const lateral = (other.signedRoadOffset || 0) - (car.signedRoadOffset || 0);
    if (Math.abs(lateral) > 34) continue;
    const score = Math.abs(longitudinal) * 0.7 + Math.abs(lateral);
    if (score < nearestScore) {
      nearestScore = score;
      nearest = { other, longitudinal, lateral };
    }
  }
  return nearest;
}

function shp271AvoidanceOffset(car, dt) {
  car.shp271AvoidTimer = Math.max(0, (car.shp271AvoidTimer || 0) - dt);
  car.shp271AvoidCooldown = Math.max(0, (car.shp271AvoidCooldown || 0) - dt);

  if (car.shp271AvoidTimer > 0) {
    return (car.shp271AvoidSide || 0) * roadHalf * 0.105;
  }

  if (car.shp271AvoidCooldown > 0) return 0;
  const neighbour = shp271ImmediateNeighbour(car);
  if (!neighbour) return 0;

  let side = neighbour.lateral >= 0 ? -1 : 1;
  const currentOffset = car.signedRoadOffset || 0;
  if (Math.abs(currentOffset) > roadHalf * 0.38 && Math.sign(currentOffset) === side) {
    side = -Math.sign(currentOffset);
  }

  const targetOffset = clamp(currentOffset + side * roadHalf * 0.15, -roadHalf * 0.42, roadHalf * 0.42);
  if (!shp27LaneClear(car, targetOffset, 62)) return 0;

  car.shp271AvoidSide = side;
  car.shp271AvoidTimer = 0.44;
  car.shp271AvoidCooldown = 0.72;
  return side * roadHalf * 0.105;
}

function shp271CommittedOffset(car, baseLine) {
  if (car.shp27Tactic === 'attack') {
    const lane = car.shp27TacticSide * roadHalf * 0.30;
    return lerp(baseLine, lane, 0.72);
  }
  if (car.shp27Tactic === 'defend') {
    const lane = car.shp27TacticSide * roadHalf * 0.24;
    return lerp(baseLine, lane, 0.68);
  }
  return baseLine;
}

function shp271SmoothSteer(car, rawSteer, dt, cornerLoad, edgeLoad, tune) {
  let target = clamp(rawSteer, -1, 1);
  if (Math.abs(target) < 0.028) target = 0;

  const previous = car.shp271Steer || 0;
  // A modest opposite request first unwinds the current steering instead of
  // snapping directly through the centre into the other direction.
  if (previous * target < 0 && Math.abs(previous) > 0.09 && Math.abs(target) < 0.62) target = 0;

  const rate = tune.steerRate + cornerLoad * 1.35 + edgeLoad * 2.4;
  let next = shp27MoveToward(previous, target, rate * dt);
  if (Math.abs(next) < 0.014 && target === 0) next = 0;
  car.shp271Steer = next;
  return next;
}

function shp271AiControls(car, dt) {
  const profile = car.shp25Profile || shp25Profiles[car.id] || shp25Profiles.rook;
  const difficultyId = shpPrefs.difficulty in shp27DifficultyTune ? shpPrefs.difficulty : 'racer';
  const speedTune = shp27DifficultyTune[difficultyId];
  const steeringTune = shp271SteeringTune[difficultyId] || shp271SteeringTune.racer;
  const speed = Math.abs(car.forwardSpeed || 0);
  const preview = shp27CurvePreview(car);
  const traffic = shp27UpdateTactic(car, dt, preview);
  shp27UpdateMildError(car, dt, speedTune, preview);

  const speedRatio = clamp(speed / MAX_SPEED, 0, 1);
  const cornerLoad = clamp(preview.maximum / 0.0022, 0, 1);
  const currentOffset = car.signedRoadOffset || 0;
  const edgeLoad = smoothstep(roadHalf * 0.58, roadHalf * 0.92, Math.abs(currentOffset));

  const rawBaseLine = shp271AverageRaceOffset(car, preview) * 0.82 + (car.lane || 0) * 0.035;
  const baseRate = lerp(14, 22, cornerLoad);
  car.shp271BaseLine = shp27MoveToward(car.shp271BaseLine || 0, rawBaseLine, baseRate * dt);

  let desiredOffset = shp271CommittedOffset(car, car.shp271BaseLine);
  desiredOffset += shp271AvoidanceOffset(car, dt);
  if (car.shp27ErrorTimer > 0) desiredOffset += car.shp27ErrorSide * roadHalf * 0.045;

  const safeOffsetLimit = roadHalf * lerp(0.44, 0.33, cornerLoad);
  if (Math.abs(currentOffset) > roadHalf * 0.60) desiredOffset *= 0.28;
  if (Math.abs(currentOffset) > roadHalf * 0.76) desiredOffset = 0;
  desiredOffset = clamp(desiredOffset, -safeOffsetLimit, safeOffsetLimit);

  const maneuvering = car.shp27Tactic === 'attack' || car.shp27Tactic === 'defend';
  const lineRate = steeringTune.lineRate * (maneuvering ? 1.18 : 1) * lerp(0.92, 1.10, cornerLoad);
  car.aiOffset = shp27MoveToward(car.aiOffset || 0, desiredOffset, lineRate * dt);

  const lookAheadDistance = lerp(104, 230, speedRatio) * lerp(0.98, 1.04, clamp((profile.precision || 1) - 0.9, 0, 0.3) / 0.3);
  const target = shp27PointAhead(car, lookAheadDistance);
  const currentPoint = track[car.trackIndex];
  const targetX = target.x + target.nx * car.aiOffset;
  const targetY = target.y + target.ny * car.aiOffset;
  const desiredHeading = Math.atan2(targetY - car.y, targetX - car.x);
  const headingError = wrapAngle(desiredHeading - car.angle);
  const crossTrack = currentOffset - car.aiOffset;

  let rawSteer = headingError * lerp(2.32, 2.02, speedRatio)
    - crossTrack / Math.max(76, roadHalf * 1.02)
    - car.yawRate * lerp(0.28, 0.36, speedRatio)
    - (car.lateralSpeed || 0) / 760;

  if (edgeLoad > 0) rawSteer += -Math.sign(currentOffset) * lerp(0.08, 0.54, edgeLoad);
  const steer = shp271SmoothSteer(car, rawSteer, dt, cornerLoad, edgeLoad, steeringTune);

  const targetSpeed = shp27TargetSpeed(car, profile, speedTune, preview, traffic.ahead);
  const speedError = targetSpeed - speed;
  let brake = speedError < -12 ? clamp(-speedError / 138, 0, 0.98) : 0;
  let throttle = speedError > -4 ? clamp((speedError + 35) / 76, 0.20, 1) : 0;

  if (Math.abs(steer) > 0.88 && speed > targetSpeed - 5) brake = Math.max(brake, 0.055);
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

aiControls = shp271AiControls;

var shp271BaseSetupRace = setupRace;
setupRace = function shp271SetupRace() {
  shp271BaseSetupRace();
  for (const car of cars) {
    car.shp271BaseLine = car.aiOffset || 0;
    car.shp271Steer = 0;
    car.shp271AvoidSide = 0;
    car.shp271AvoidTimer = 0;
    car.shp271AvoidCooldown = car.player ? 0 : 0.28 + cars.indexOf(car) * 0.08;
  }
};

const shp271Subtitle = document.querySelector('.start-copy .subtitle');
if (shp271Subtitle) {
  shp271Subtitle.textContent = 'Два длинных круга, устойчивые гоночные линии, честная борьба и полная классификация после финиша.';
}
