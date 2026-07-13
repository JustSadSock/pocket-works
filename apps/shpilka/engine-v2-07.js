function updateCar(car, dt) {
  const commands = car.player ? playerControls() : aiControls(car, dt);
  const throttleTarget = commands.throttle;
  const brakeTarget = commands.brake;
  const steerTarget = commands.steer;
  car.throttleInput += (throttleTarget - car.throttleInput) * clamp(dt * 5.8, 0, 1);
  car.brakeInput += (brakeTarget - car.brakeInput) * clamp(dt * 9.5, 0, 1);
  car.steerInput += (steerTarget - car.steerInput) * clamp(dt * 8.5, 0, 1);
  car.jumpCooldown = Math.max(0, car.jumpCooldown - dt);
  car.collisionCooldown = Math.max(0, car.collisionCooldown - dt);

  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const rightX = -forwardY;
  const rightY = forwardX;
  let forwardSpeed = car.vx * forwardX + car.vy * forwardY;
  let lateralSpeed = car.vx * rightX + car.vy * rightY;
  const previousForward = forwardSpeed;
  const previousLateral = lateralSpeed;
  const speed = Math.hypot(car.vx, car.vy);
  const speedRatio = clamp(Math.abs(forwardSpeed) / MAX_SPEED, 0, 1);
  const onRoad = car.distanceFromRoad <= roadHalf + 2 || car.airborne;
  const onShoulder = car.distanceFromRoad > roadHalf && car.distanceFromRoad <= roadHalf + 26;

  if (!car.airborne) {
    const engineAccel = (560 - 230 * speedRatio) * car.throttleInput * (onRoad ? 1 : 0.56);
    const braking = car.brakeInput * (forwardSpeed >= 0 ? 650 : 380);
    if (forwardSpeed > 5) forwardSpeed = Math.max(0, forwardSpeed + (engineAccel - braking) * dt);
    else if (forwardSpeed < -5) forwardSpeed = Math.min(0, forwardSpeed + (engineAccel + braking) * dt);
    else if (car.brakeInput > 0.35 && car.throttleInput < 0.1) forwardSpeed -= 185 * car.brakeInput * dt;
    else forwardSpeed += engineAccel * dt;

    const drag = 0.30 * forwardSpeed + 0.00068 * forwardSpeed * Math.abs(forwardSpeed);
    forwardSpeed -= drag * dt;
    if (!onRoad) forwardSpeed *= Math.exp(-2.35 * dt);
    if (onShoulder) forwardSpeed *= Math.exp(-0.72 * dt);

    const steeringLimit = lerp(0.61, 0.21, smoothstep(0.08, 1, speedRatio));
    const desiredSteerAngle = car.steerInput * steeringLimit;
    car.steerAngle += (desiredSteerAngle - car.steerAngle) * clamp(dt * (5.6 - speedRatio * 1.5), 0, 1);

    const requestedDrift = car.brakeInput > 0.15 && Math.abs(car.steerInput) > 0.16 && Math.abs(forwardSpeed) > 150;
    const driftIntent = car.player ? requestedDrift : requestedDrift && car.aggression > 0.76 && Math.abs(car.steerInput) > 0.68;
    const desiredYawRate = forwardSpeed / CAR_WHEELBASE * Math.tan(car.steerAngle) * (onRoad ? 1 : 0.62);
    const yawResponse = driftIntent ? 2.35 : onRoad ? lerp(6.8, 4.2, speedRatio) : 1.25;
    car.yawRate += (desiredYawRate - car.yawRate) * clamp(dt * yawResponse, 0, 1);
    if (driftIntent) car.yawRate += car.steerInput * clamp(Math.abs(forwardSpeed) / 430, 0, 1.5) * 1.65 * dt;
    car.yawRate *= Math.exp(-(driftIntent ? 0.46 : 1.18) * dt);
    car.angle += car.yawRate * dt;

    const desiredLateral = car.yawRate * CAR_WHEELBASE * (driftIntent ? 0.15 : 0.39);
    const grip = driftIntent ? 1.18 : onRoad ? lerp(8.4, 4.9, speedRatio) : 1.05;
    lateralSpeed += (desiredLateral - lateralSpeed) * (1 - Math.exp(-grip * dt));
    if (driftIntent) lateralSpeed -= car.steerInput * forwardSpeed * 0.96 * dt;
    if (!onRoad) lateralSpeed *= Math.exp(-1.65 * dt);
  } else {
    updateAirborne(car, commands, dt);
  }

  const newForwardX = Math.cos(car.angle);
  const newForwardY = Math.sin(car.angle);
  const newRightX = -newForwardY;
  const newRightY = newForwardX;
  if (!car.airborne) {
    car.vx = newForwardX * forwardSpeed + newRightX * lateralSpeed;
    car.vy = newForwardY * forwardSpeed + newRightY * lateralSpeed;
  }
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.forwardSpeed = forwardSpeed;
  car.lateralSpeed = lateralSpeed;
  car.longitudinalAccel = (forwardSpeed - previousForward) / Math.max(dt, 0.0001);
  car.lateralAccel = (lateralSpeed - previousLateral) / Math.max(dt, 0.0001);

  const nearest = nearestTrackIndex(car.x, car.y, car.trackIndex, car.airborne ? 124 : 94);
  car.previousTrackIndex = car.trackIndex;
  car.trackIndex = nearest.index;
  car.distanceFromRoad = nearest.distance;
  const nearestPoint = track[car.trackIndex];
  car.signedRoadOffset = (car.x - nearestPoint.x) * nearestPoint.nx + (car.y - nearestPoint.y) * nearestPoint.ny;

  let indexDelta = car.trackIndex - car.previousTrackIndex;
  if (indexDelta < -track.length / 2) indexDelta += track.length;
  if (indexDelta > track.length / 2) indexDelta -= track.length;

  let distanceDelta = track[car.trackIndex].distance - track[car.previousTrackIndex].distance;
  if (distanceDelta < -track.totalLength * 0.5) distanceDelta += track.totalLength;
  if (distanceDelta > track.totalLength * 0.5) distanceDelta -= track.totalLength;
  if (Math.abs(indexDelta) < track.length * 0.28) car.progressDistance += distanceDelta;

  while (car.progressDistance >= car.nextLapDistance && car.finishTime == null) {
    car.completedLaps += 1;
    car.nextLapDistance += track.totalLength;
    const currentLap = raceElapsed - car.lapStartTime;
    car.lapStartTime = raceElapsed;
    if (car.player && car.completedLaps <= lapsToWin) {
      car.bestLap = car.bestLap == null ? currentLap : Math.min(car.bestLap, currentLap);
      const record = currentRouteRecord();
      if (record?.bestLap == null || currentLap < record.bestLap) {
        saved.routeRecords[String(trackSeed)] = { ...(record || {}), bestLap: currentLap, updatedAt: Date.now() };
        saveState();
        showRaceMessage('НОВЫЙ РЕКОРД', 1.0);
      } else if (car.completedLaps < lapsToWin) {
        showRaceMessage(`КРУГ ${car.completedLaps + 1}`, 0.72);
      }
      audio.blip('lap', 0.9);
      navigator.vibrate?.(12);
    }
    if (car.completedLaps >= lapsToWin) {
      car.finishTime = raceElapsed;
      if (car.player) finishDelay = 0.72;
    }
  }

  if (rampIndex >= 0) {
    let crossedRamp = car.previousTrackIndex < rampIndex && car.trackIndex >= rampIndex;
    if (rampIndex < 22 && car.previousTrackIndex > track.length - 22) crossedRamp = true;
    if (crossedRamp && !car.airborne && car.jumpCooldown <= 0 && Math.abs(forwardSpeed) > 330) {
      car.airborne = true;
      car.z = 2;
      car.vz = clamp(Math.abs(forwardSpeed) * 0.47, 205, 330);
      car.jumpCooldown = 1.4;
      if (car.player) {
        showRaceMessage('ОТРЫВ', 0.55);
        audio.blip('jump', 0.84);
        navigator.vibrate?.(10);
      }
    }
  }

  if (!car.airborne) resolveRoadCollision(car);

  car.raceScore = car.progressDistance;
  if (!car.player) {
    if (car.raceScore > car.lastProgressScore + 70) {
      car.lastProgressScore = car.raceScore;
      car.progressTimer = 0;
    } else {
      car.progressTimer += dt;
    }
    if (car.progressTimer > 3.0) {
      recoverCar(car, true);
      car.progressTimer = 0;
      car.lastProgressScore = car.raceScore;
    }
  }
  car.slip = Math.abs(lateralSpeed - car.yawRate * CAR_WHEELBASE * 0.38) + Math.abs(car.yawRate - desiredYawRateSafe(car)) * 8;

  if (!car.airborne && car.distanceFromRoad < roadHalf * 0.78 && Math.abs(car.signedRoadOffset) < roadHalf * 0.74) car.safeIndex = car.trackIndex;

  const headingError = Math.abs(wrapAngle(car.angle - nearestPoint.heading));
  if (speed < 24 && (car.distanceFromRoad > roadHalf * 0.78 || headingError > 2.45)) car.stuckTime += dt;
  else car.stuckTime = Math.max(0, car.stuckTime - dt * 1.8);
  if (!car.player && car.stuckTime > 2.3) recoverCar(car);

  if (!car.airborne && car.slip > 48 && speed > 145) {
    car.markTimer -= dt;
    if (car.markTimer <= 0) {
      addSkidMark(car);
      car.markTimer = 0.033;
    }
  } else {
    car.markTimer = 0;
  }

  if (!car.airborne && car.distanceFromRoad > roadHalf - 6 && speed > 120) {
    car.dustTimer -= dt;
    if (car.dustTimer <= 0) {
      spawnDust(car);
      car.dustTimer = 0.05;
    }
  } else {
    car.dustTimer = 0;
  }
}
