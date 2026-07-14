// ШПИЛЬКА 2.5 — rival personalities and natural driving mistakes.

var shp25Profiles = {
  rook: { label: 'РОВНО', pace: 0.997, straight: 0.992, corner: 1.012, precision: 1.10, aggression: 0.72, overtake: 0.78, errorRate: 0.016, wander: 0.018, reaction: [0.13, 0.25] },
  volt: { label: 'РАЗГОН', pace: 1.004, straight: 1.045, corner: 0.970, precision: 0.94, aggression: 0.94, overtake: 1.02, errorRate: 0.022, wander: 0.030, reaction: [0.07, 0.17] },
  mara: { label: 'АПЕКС', pace: 1.005, straight: 0.982, corner: 1.048, precision: 1.13, aggression: 0.80, overtake: 0.92, errorRate: 0.017, wander: 0.015, reaction: [0.10, 0.21] },
  shunt: { label: 'АТАКА', pace: 1.008, straight: 1.020, corner: 1.012, precision: 0.91, aggression: 1.22, overtake: 1.28, errorRate: 0.030, wander: 0.036, reaction: [0.04, 0.13] }
};

var shp25DifficultyErrorFactor = { rookie: 1.55, racer: 1.00, maniac: 0.66 };

function shp25SeedForCar(car) {
  let value = trackSeed ^ 0x25a17d3;
  for (let i = 0; i < car.id.length; i += 1) value = hashSeed(value ^ car.id.charCodeAt(i) * (i + 17));
  return value >>> 0;
}

function shp25Random(car) {
  let state = car.shp25RandomState || shp25SeedForCar(car) || 1;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  car.shp25RandomState = state >>> 0;
  return car.shp25RandomState / 4294967296;
}

function shp25UpcomingBend(car) {
  let maximum = 0;
  let signed = 0;
  for (let offset = 14; offset <= 150; offset += 4) {
    const curvature = track[(car.trackIndex + offset) % track.length].curvature;
    if (Math.abs(curvature) > maximum) {
      maximum = Math.abs(curvature);
      signed = curvature;
    }
  }
  return { maximum, signed };
}

function shp25BeginMistake(car, forcedKind = null, forcedSeverity = null) {
  const bend = shp25UpcomingBend(car);
  const ahead = findCarAhead(car);
  let kind = forcedKind;
  if (!kind) {
    const roll = shp25Random(car);
    if (ahead && ahead.gap < 230 && roll < 0.28 + car.aggression * 0.12) kind = 'pass';
    else if (bend.maximum > 0.00115 && roll < 0.48) kind = 'late';
    else if (bend.maximum > 0.00075 && roll < 0.76) kind = 'wide';
    else kind = 'slide';
  }
  const severity = forcedSeverity ?? lerp(0.72, 1.12, shp25Random(car));
  const duration = kind === 'pass' ? lerp(0.85, 1.25, shp25Random(car)) : lerp(0.58, 1.02, shp25Random(car));
  car.shp25MistakeKind = kind;
  car.shp25MistakeTimer = duration;
  car.shp25MistakeTotal = duration;
  car.shp25MistakeSeverity = severity;
  return kind;
}

function shp25MistakePhase(car) {
  return 1 - clamp(car.shp25MistakeTimer / Math.max(0.001, car.shp25MistakeTotal), 0, 1);
}

function shp25AiControls(car, dt) {
  const profile = car.shp25Profile || shp25Profiles.rook;
  const speed = Math.abs(car.forwardSpeed);
  const bend = shp25UpcomingBend(car);
  const turnSign = Math.sign(bend.signed) || 1;
  const ahead = findCarAhead(car);

  car.shp25MistakeTimer = Math.max(0, (car.shp25MistakeTimer || 0) - dt);
  car.shp25MistakeCooldown = Math.max(0, (car.shp25MistakeCooldown || 0) - dt);
  if (car.shp25MistakeKind && car.shp25MistakeTimer <= 0) {
    car.shp25MistakeKind = null;
    car.shp25MistakeCooldown = lerp(7, 14, shp25Random(car));
  }

  if (!car.shp25MistakeKind && car.shp25MistakeCooldown <= 0 && raceElapsed > 2.4) {
    const usefulMoment = bend.maximum > 0.00072 || (ahead && ahead.gap < 240);
    const rate = profile.errorRate * (shp25DifficultyErrorFactor[shpPrefs.difficulty] || 1);
    if (usefulMoment && shp25Random(car) < dt * rate * 1.9) shp25BeginMistake(car);
  }

  const lookAhead = Math.round(24 + speed / 20 + profile.precision * 3);
  const target = track[(car.trackIndex + lookAhead) % track.length];
  car.overtakeTimer = Math.max(0, car.overtakeTimer - dt);
  if (ahead && ahead.gap < 190 + speed * 0.12 && car.overtakeTimer <= 0) {
    const relativeX = ahead.car.x - car.x;
    const relativeY = ahead.car.y - car.y;
    const side = relativeX * track[car.trackIndex].nx + relativeY * track[car.trackIndex].ny;
    car.overtakeSide = side > 0 ? -1 : 1;
    if (Math.abs(side) < 10) car.overtakeSide = shp25Random(car) > 0.5 ? 1 : -1;
    car.overtakeTimer = (1.15 + car.aggression * 0.95) * profile.overtake;
  }

  const naturalWander = Math.sin(raceElapsed * 0.34 + car.aiPhase * 2.1) * roadHalf * profile.wander;
  const baseOffset = target.raceOffset + car.lane * 0.26 + naturalWander;
  let overtakeOffset = car.overtakeTimer > 0 ? car.overtakeSide * roadHalf * (0.27 + car.aggression * 0.10) * profile.overtake : 0;
  let mistakeOffset = 0;
  const phase = shp25MistakePhase(car);
  if (car.shp25MistakeKind === 'wide') mistakeOffset = turnSign * roadHalf * 0.34 * car.shp25MistakeSeverity * Math.sin(phase * Math.PI);
  if (car.shp25MistakeKind === 'pass') overtakeOffset *= 1.28 + car.shp25MistakeSeverity * 0.16;

  const desiredOffset = clamp(baseOffset + overtakeOffset + mistakeOffset, -roadHalf * 0.68, roadHalf * 0.68);
  const offsetResponse = lerp(2.65, 3.75, profile.precision - 0.85);
  car.aiOffset = lerp(car.aiOffset, desiredOffset, clamp(dt * offsetResponse, 0, 1));
  const targetX = target.x + target.nx * car.aiOffset;
  const targetY = target.y + target.ny * car.aiOffset;
  const desired = Math.atan2(targetY - car.y, targetX - car.x);
  const headingError = wrapAngle(desired - car.angle);
  const point = track[car.trackIndex];
  const crossTrack = (car.x - point.x) * point.nx + (car.y - point.y) * point.ny - car.aiOffset;
  let steer = headingError * (2.02 + profile.precision * 0.20)
    - crossTrack / Math.max(76, roadHalf * lerp(1.25, 1.08, profile.precision - 0.85))
    - car.yawRate * lerp(0.16, 0.22, profile.precision - 0.85);
  if (car.shp25MistakeKind === 'slide') steer += turnSign * 0.24 * car.shp25MistakeSeverity * Math.sin(phase * Math.PI);
  if (car.shp25MistakeKind === 'late' && phase > 0.52) steer *= 0.90;
  steer = clamp(steer, -1, 1);

  let targetSpeed = MAX_SPEED * 0.995;
  for (let distance = 0; distance < 136; distance += 4) {
    let upcomingCurvature = 0;
    for (let window = 0; window < 22; window += 4) {
      const index = (car.trackIndex + distance + window) % track.length;
      upcomingCurvature = Math.max(upcomingCurvature, Math.abs(track[index].curvature));
    }
    const cornerSpeed = clamp(1120 / (1 + upcomingCurvature * 585), 350, MAX_SPEED * 0.995);
    targetSpeed = Math.min(targetSpeed, cornerSpeed + distance * 2.72);
  }

  targetSpeed *= car.skill * (bend.maximum > 0.00072 ? profile.corner : profile.straight);
  if (car.distanceFromRoad > roadHalf * 0.76) targetSpeed *= 0.83;
  if (shpRampIndices.some((index) => {
    let gap = index - car.trackIndex;
    if (gap < 0) gap += track.length;
    return gap < 36;
  })) targetSpeed = Math.max(targetSpeed, 515);

  let forcedBrake = 0;
  let throttleLimit = 1;
  if (car.shp25MistakeKind === 'late') {
    if (phase < 0.48) targetSpeed *= 1.10;
    else {
      targetSpeed *= 0.70;
      forcedBrake = 0.62 + car.shp25MistakeSeverity * 0.20;
    }
  } else if (car.shp25MistakeKind === 'slide') {
    targetSpeed *= 0.88;
    forcedBrake = 0.16 + car.shp25MistakeSeverity * 0.12;
  } else if (car.shp25MistakeKind === 'wide') targetSpeed *= 0.93;
  else if (car.shp25MistakeKind === 'pass' && phase > 0.55) {
    throttleLimit = 0.52;
    targetSpeed *= 0.91;
  }

  const speedError = targetSpeed - speed;
  let brake = speedError < -28 ? clamp(-speedError / 190, 0, 0.95) : (Math.abs(steer) > 0.91 && speed > targetSpeed - 2 ? 0.10 : 0);
  brake = Math.max(brake, forcedBrake);
  let throttle = speedError > -8 ? clamp((speedError + 46) / 100, 0.32, 1) : 0;
  throttle = Math.min(throttle, throttleLimit);
  if (raceElapsed < car.shp25ReactionDelay) {
    throttle = 0;
    brake = 0;
  }
  return { steer, throttle, brake };
}

aiControls = shp25AiControls;
