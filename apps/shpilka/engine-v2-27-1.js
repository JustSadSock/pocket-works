// ШПИЛЬКА 2.7.1 — stable racing line, lane hysteresis and steering-rate limits.

var shp271SteeringTune = {
  rookie: { lineRate: 22, steerRate: 3.15 },
  racer: { lineRate: 25, steerRate: 3.55 },
  maniac: { lineRate: 28, steerRate: 3.90 },
  pilot: { lineRate: 30, steerRate: 4.10 }
};

function shp271AverageRaceOffset(car, preview) {
  const cornerSoon = preview.firstCornerDistance < 260;
  const samples = cornerSoon
    ? [[64, 0.50], [132, 0.33], [218, 0.17]]
    : [[96, 0.44], [194, 0.34], [308, 0.22]];
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
    if (Math.abs(longitudinal) > 46) continue;
    const lateral = (other.signedRoadOffset || 0) - (car.signedRoadOffset || 0);
    if (Math.abs(lateral) > 29) continue;
    const score = Math.abs(longitudinal) * 0.72 + Math.abs(lateral);
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
    return (car.shp271AvoidSide || 0) * roadHalf * 0.085;
  }
  if (car.shp271AvoidCooldown > 0) return 0;

  const neighbour = shp271ImmediateNeighbour(car);
  if (!neighbour) return 0;

  let side = neighbour.lateral >= 0 ? -1 : 1;
  const currentOffset = car.signedRoadOffset || 0;
  if (Math.abs(currentOffset) > roadHalf * 0.34 && Math.sign(currentOffset) === side) {
    side = -Math.sign(currentOffset);
  }

  car.shp271AvoidSide = side;
  car.shp271AvoidTimer = 0.52;
  car.shp271AvoidCooldown = 0.92;
  return side * roadHalf * 0.085;
}

function shp271CommittedOffset(car, baseLine, dt) {
  car.shp271LaneHoldTimer = Math.max(0, (car.shp271LaneHoldTimer || 0) - dt);
  const active = car.shp27Tactic === 'attack' || car.shp27Tactic === 'defend';

  if (active && car.shp27TacticSide) {
    if (!car.shp271LaneHoldSide || car.shp271LaneHoldTimer <= 0) {
      car.shp271LaneHoldSide = car.shp27TacticSide;
      car.shp271LaneHoldKind = car.shp27Tactic;
      car.shp271LaneHoldTimer = Math.max(0.86, (car.shp27TacticTimer || 0) + 0.42);
      car.shp27TacticCooldown = Math.max(car.shp27TacticCooldown || 0, 0.82);
    }

    const scale = car.shp271LaneHoldKind === 'defend' ? 0.22 : 0.28;
    const lane = car.shp271LaneHoldSide * roadHalf * scale;
    return lerp(baseLine, lane, 0.74);
  }

  if (car.shp271LaneHoldTimer > 0 && car.shp271LaneHoldSide) {
    const fade = smoothstep(0, 0.46, car.shp271LaneHoldTimer);
    const scale = car.shp271LaneHoldKind === 'defend' ? 0.18 : 0.22;
    return lerp(baseLine, car.shp271LaneHoldSide * roadHalf * scale, fade * 0.42);
  }

  car.shp271LaneHoldSide = 0;
  car.shp271LaneHoldKind = 'line';
  return baseLine;
}

function shp271SmoothSteer(car, rawSteer, dt, cornerLoad, edgeLoad, tune) {
  let target = clamp(rawSteer, -1, 1);
  if (Math.abs(target) < 0.024) target = 0;

  const previous = car.shp271Steer || 0;
  // An opposite request first unwinds the current steering. This prevents a
  // left-right command pair from becoming visible weaving in consecutive frames.
  if (previous * target < 0 && Math.abs(previous) > 0.075 && Math.abs(target) < 0.68) target = 0;

  const rate = tune.steerRate + cornerLoad * 1.30 + edgeLoad * 2.25;
  let next = shp27MoveToward(previous, target, rate * dt);
  if (Math.abs(next) < 0.012 && target === 0) next = 0;
  car.shp271Steer = next;
  return next;
}

function shp271PathHeading(car, speedRatio, cornerLoad) {
  const near = shp27PointAhead(car, lerp(42, 78, speedRatio));
  const far = shp27PointAhead(car, lerp(112, 208, speedRatio));
  if (!near) return car.angle;
  if (!far) return near.heading;
  return angleLerp(near.heading, far.heading, lerp(0.18, 0.43, cornerLoad));
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

  const rawBaseLine = shp271AverageRaceOffset(car, preview) * 0.34 + (car.lane || 0) * 0.018;
  if (Math.abs(rawBaseLine - (car.shp271BaseLine || 0)) > 3.5) {
    const baseRate = lerp(8.5, 13.5, cornerLoad);
    car.shp271BaseLine = shp27MoveToward(car.shp271BaseLine || 0, rawBaseLine, baseRate * dt);
  }

  let desiredOffset = shp271CommittedOffset(car, car.shp271BaseLine || 0, dt);
  desiredOffset += shp271AvoidanceOffset(car, dt);
  if (car.shp27ErrorTimer > 0) desiredOffset += car.shp27ErrorSide * roadHalf * 0.035;

  const safeOffsetLimit = roadHalf * lerp(0.42, 0.31, cornerLoad);
  if (Math.abs(currentOffset) > roadHalf * 0.58) desiredOffset *= 0.24;
  if (Math.abs(currentOffset) > roadHalf * 0.74) desiredOffset = 0;
  desiredOffset = clamp(desiredOffset, -safeOffsetLimit, safeOffsetLimit);

  const maneuvering = car.shp271LaneHoldTimer > 0 && car.shp271LaneHoldSide;
  const lineRate = steeringTune.lineRate * (maneuvering ? 1.20 : 1) * lerp(0.92, 1.08, cornerLoad);
  car.aiOffset = shp27MoveToward(car.aiOffset || 0, desiredOffset, lineRate * dt);

  const desiredHeading = shp271PathHeading(car, speedRatio, cornerLoad);
  const headingError = wrapAngle(desiredHeading - car.angle);
  const crossTrack = currentOffset - car.aiOffset;
  const crossCorrection = Math.atan2(-crossTrack * lerp(2.25, 3.10, cornerLoad), speed + 145);

  let rawSteer = headingError * lerp(2.18, 1.84, speedRatio)
    + crossCorrection * lerp(1.78, 2.08, cornerLoad)
    - car.yawRate * lerp(0.22, 0.30, speedRatio)
    - (car.lateralSpeed || 0) / 1040;

  if (edgeLoad > 0) rawSteer += -Math.sign(currentOffset) * lerp(0.06, 0.56, edgeLoad);
  const steer = shp271SmoothSteer(car, rawSteer, dt, cornerLoad, edgeLoad, steeringTune);

  let targetSpeed = shp27TargetSpeed(car, profile, speedTune, preview, traffic.ahead);
  // A stable tangent controller carries slightly more speed without receiving
  // any position-dependent or catch-up bonus.
  if (difficultyId === 'maniac') targetSpeed *= 1.018;
  if (difficultyId === 'pilot') targetSpeed *= 1.028;
  targetSpeed = Math.min(targetSpeed, MAX_SPEED * 1.01);

  const speedError = targetSpeed - speed;
  let brake = speedError < -12 ? clamp(-speedError / 142, 0, 0.98) : 0;
  let throttle = speedError > -4 ? clamp((speedError + 38) / 78, 0.22, 1) : 0;

  if (Math.abs(steer) > 0.90 && speed > targetSpeed - 5) brake = Math.max(brake, 0.05);
  if ((car.slip || 0) > 120) {
    throttle = Math.min(throttle, 0.46);
    brake = Math.max(brake, 0.035);
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
    car.shp271BaseLine = 0;
    car.shp271Steer = 0;
    car.shp271AvoidSide = 0;
    car.shp271AvoidTimer = 0;
    car.shp271AvoidCooldown = car.player ? 0 : 0.28 + cars.indexOf(car) * 0.08;
    car.shp271LaneHoldSide = 0;
    car.shp271LaneHoldKind = 'line';
    car.shp271LaneHoldTimer = 0;
  }
};

const shp271Subtitle = document.querySelector('.start-copy .subtitle');
if (shp271Subtitle) {
  shp271Subtitle.textContent = 'Два длинных круга, устойчивые гоночные линии, честная борьба и полная классификация после финиша.';
}
