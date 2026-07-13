function findCarAhead(car) {
  let best = null;
  let bestGap = Infinity;
  for (const other of cars) {
    if (other === car || other.finishTime != null) continue;
    let gap = other.raceScore - car.raceScore;
    if (gap < 0) gap += track.totalLength;
    if (gap > 0 && gap < bestGap) {
      bestGap = gap;
      best = other;
    }
  }
  return best ? { car: best, gap: bestGap } : null;
}

function aiControls(car, dt) {
  const speed = Math.abs(car.forwardSpeed);
  const lookAhead = Math.round(22 + speed / 22);
  const targetIndex = (car.trackIndex + lookAhead) % track.length;
  const target = track[targetIndex];

  car.overtakeTimer = Math.max(0, car.overtakeTimer - dt);
  const ahead = findCarAhead(car);
  if (ahead && ahead.gap < 175 + speed * 0.10 && car.overtakeTimer <= 0) {
    const relativeX = ahead.car.x - car.x;
    const relativeY = ahead.car.y - car.y;
    const side = relativeX * track[car.trackIndex].nx + relativeY * track[car.trackIndex].ny;
    car.overtakeSide = side > 0 ? -1 : 1;
    if (Math.abs(side) < 9) car.overtakeSide = Math.sin(car.aiPhase + raceElapsed) > 0 ? 1 : -1;
    car.overtakeTimer = 1.45 + car.aggression * 1.25;
  }

  const baseOffset = target.raceOffset + car.lane * 0.30;
  const overtakeOffset = car.overtakeTimer > 0 ? car.overtakeSide * roadHalf * (0.34 + car.aggression * 0.08) : 0;
  car.aiOffset = lerp(car.aiOffset, clamp(baseOffset + overtakeOffset, -roadHalf * 0.55, roadHalf * 0.55), clamp(dt * 3.2, 0, 1));
  const targetX = target.x + target.nx * car.aiOffset;
  const targetY = target.y + target.ny * car.aiOffset;
  const desired = Math.atan2(targetY - car.y, targetX - car.x);
  const headingError = wrapAngle(desired - car.angle);
  const point = track[car.trackIndex];
  const crossTrack = (car.x - point.x) * point.nx + (car.y - point.y) * point.ny - car.aiOffset;
  let steer = headingError * 2.20 - crossTrack / Math.max(76, roadHalf * 1.16) - car.yawRate * 0.19;
  steer = clamp(steer, -1, 1);

  let targetSpeed = MAX_SPEED * 0.99;
  for (let j = 0; j < 120; j += 4) {
    const index = (car.trackIndex + j) % track.length;
    const brakingAllowance = j * 2.15;
    const cornerSpeed = track[index].speedLimit * 1.17 + 52 + brakingAllowance;
    targetSpeed = Math.min(targetSpeed, cornerSpeed);
  }

  const paceFactor = clamp(0.99 + (car.skill - 0.98) * 1.55, 0.99, 1.10);
  targetSpeed = Math.min(MAX_SPEED * 1.01, targetSpeed * paceFactor);
  if (car.distanceFromRoad > roadHalf * 0.72) targetSpeed *= 0.84;
  if (rampIndex >= 0) {
    let gapToRamp = rampIndex - car.trackIndex;
    if (gapToRamp < 0) gapToRamp += track.length;
    if (gapToRamp < 34) targetSpeed = Math.max(targetSpeed, 520);
  }

  car.mistakeTimer = Math.max(0, car.mistakeTimer - dt);
  const mistakeChance = Math.max(0.0004, 0.0035 - Math.max(0, car.skill - 0.98) * 0.035);
  if (car.mistakeTimer <= 0 && Math.random() < dt * mistakeChance) {
    car.mistakeTimer = 0.22 + Math.random() * 0.30;
  }
  if (car.mistakeTimer > 0) steer *= 0.88;

  const speedError = targetSpeed - speed;
  const brake = speedError < -28
    ? clamp(-speedError / 190, 0, 0.92)
    : (Math.abs(steer) > 0.88 && speed > targetSpeed - 4 ? 0.10 : 0);
  const throttle = speedError > -8 ? clamp((speedError + 45) / 100, 0.34, 1) : 0;
  return { steer, throttle, brake };
}

function playerControls() {
  return {
    steer: (input.right ? 1 : 0) - (input.left ? 1 : 0),
    throttle: input.throttle ? 1 : 0,
    brake: input.brake ? 1 : 0
  };
}

function updateAirborne(car, commands, dt) {
  car.z += car.vz * dt;
  car.vz -= 940 * dt;
  car.angle += commands.steer * 0.28 * dt;
  car.vx *= Math.exp(-0.05 * dt);
  car.vy *= Math.exp(-0.05 * dt);
  if (car.z <= 0) {
    car.z = 0;
    car.vz = 0;
    car.airborne = false;
    car.jumpCooldown = 1.15;
    car.vx *= 0.93;
    car.vy *= 0.93;
    car.yawRate *= 0.72;
    spawnBurst(car.x, car.y, theme.terrainDark, 16, 145);
    if (car.player) {
      cameraShake = prefersReducedMotion ? 2 : 15;
      audio.blip('impact', 0.76);
      navigator.vibrate?.(28);
    }
  }
}
