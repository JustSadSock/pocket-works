// Stable track geometry and predictable arcade handling for ШПИЛЬКА 2.1.

function catmullRom(p0, p1, p2, p3, t, tension = 0.5) {
  const t2 = t * t;
  const t3 = t2 * t;
  const m1x = (p2.x - p0.x) * tension;
  const m1y = (p2.y - p0.y) * tension;
  const m2x = (p3.x - p1.x) * tension;
  const m2y = (p3.y - p1.y) * tension;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return {
    x: h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x,
    y: h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y
  };
}

const STABLE_TRACK_PROFILES = [
  [[2, 0.10], [3, 0.10], [5, 0.035]],
  [[2, -0.15], [4, 0.09], [5, 0.030]],
  [[3, 0.16], [2, 0.05], [6, 0.025]],
  [[1, 0.10], [2, -0.14], [3, 0.080]],
  [[4, 0.12], [2, 0.06], [5, -0.035]],
  [[3, -0.13], [5, 0.07], [2, 0.050]]
];

function stableOrientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function stableSegmentsIntersect(a, b, c, d) {
  const o1 = stableOrientation(a, b, c);
  const o2 = stableOrientation(a, b, d);
  const o3 = stableOrientation(c, d, a);
  const o4 = stableOrientation(c, d, b);
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function trackIsValid(points) {
  if (!points.length || points.totalLength < 4700 || points.totalLength > 8800) return false;

  let sharpSections = 0;
  let maximumLocalTurn = 0;
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[(i - 1 + points.length) % points.length];
    const point = points[i];
    const next = points[(i + 1) % points.length];
    const localTurn = Math.abs(wrapAngle(next.heading - previous.heading));
    maximumLocalTurn = Math.max(maximumLocalTurn, localTurn);
    if (Math.abs(point.curvature) > 0.0024) sharpSections += 1;
    if (Math.hypot(next.x - point.x, next.y - point.y) > 36) return false;
  }
  if (maximumLocalTurn > 0.34 || sharpSections < points.length * 0.018) return false;

  const spacingStride = 5;
  const minimumSpacing = roadWidth + 80;
  for (let i = 0; i < points.length; i += spacingStride) {
    for (let j = i + spacingStride * 7; j < points.length; j += spacingStride) {
      const cyclicDistance = Math.min(j - i, points.length - (j - i));
      if (cyclicDistance < spacingStride * 7) continue;
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (dx * dx + dy * dy < minimumSpacing * minimumSpacing) return false;
    }
  }

  const segmentStride = 3;
  for (let i = 0; i < points.length; i += segmentStride) {
    const a = points[i];
    const b = points[(i + segmentStride) % points.length];
    for (let j = i + segmentStride * 6; j < points.length; j += segmentStride) {
      const cyclicDistance = Math.min(j - i, points.length - (j - i));
      if (cyclicDistance < segmentStride * 6) continue;
      const c = points[j];
      const d = points[(j + segmentStride) % points.length];
      if (stableSegmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

function buildFallbackTrack() {
  const anchors = [
    [-980, -230], [-730, -670], [-210, -840], [380, -760], [870, -390], [1010, 120],
    [760, 610], [240, 820], [-310, 730], [-720, 390], [-1010, 120]
  ].map(([x, y]) => ({ x, y }));
  roadWidth = 164;
  roadHalf = roadWidth * 0.5;
  return finalizeTrack(sampleClosedSpline(anchors, 0.5));
}

function generateTrack(seed) {
  const seeded = mulberry32(seed);
  roadWidth = Math.round(lerp(158, 172, seeded()));
  roadHalf = roadWidth * 0.5;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const random = mulberry32(hashSeed(seed + attempt * 977));
    const profile = STABLE_TRACK_PROFILES[Math.floor(random() * STABLE_TRACK_PROFILES.length)];
    const anchorCount = 18 + Math.floor(random() * 6);
    const radiusX = lerp(900, 1240, random());
    const radiusY = lerp(680, 940, random());
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
      radius += (random() - 0.5) * 0.020;
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

  return buildFallbackTrack();
}

function updateCar(car, dt) {
  const commands = car.player ? playerControls() : aiControls(car, dt);
  const throttleResponse = car.player ? 8.5 : 9.2;
  const brakeResponse = car.player ? 14 : 12;
  const steerResponse = car.player ? (Math.abs(commands.steer) > Math.abs(car.steerInput) ? 17 : 14) : 13.5;
  car.throttleInput += (commands.throttle - car.throttleInput) * clamp(dt * throttleResponse, 0, 1);
  car.brakeInput += (commands.brake - car.brakeInput) * clamp(dt * brakeResponse, 0, 1);
  car.steerInput += (commands.steer - car.steerInput) * clamp(dt * steerResponse, 0, 1);
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
    const engineAcceleration = (585 - 245 * speedRatio) * car.throttleInput * (onRoad ? 1 : 0.54);
    const brakingAcceleration = car.brakeInput * (forwardSpeed >= 0 ? 720 : 410);
    const wantsReverse = car.player && car.brakeInput > 0.32 && car.throttleInput < 0.12;
    const reverseAcceleration = car.brakeInput * (onRoad ? 760 : 560);

    if (forwardSpeed > 7) {
      forwardSpeed = Math.max(0, forwardSpeed + (engineAcceleration - brakingAcceleration) * dt);
    } else if (forwardSpeed < -7) {
      if (wantsReverse) {
        forwardSpeed = Math.max(-285, forwardSpeed - reverseAcceleration * dt);
      } else {
        forwardSpeed = Math.min(0, forwardSpeed + (engineAcceleration + brakingAcceleration) * dt);
      }
    } else if (wantsReverse) {
      forwardSpeed = Math.max(-285, forwardSpeed - reverseAcceleration * dt);
    } else {
      forwardSpeed += engineAcceleration * dt;
    }

    const rollingDrag = 0.24 * forwardSpeed;
    const aerodynamicDrag = 0.00072 * forwardSpeed * Math.abs(forwardSpeed);
    forwardSpeed -= (rollingDrag + aerodynamicDrag) * dt;
    if (!onRoad) forwardSpeed *= Math.exp(-2.5 * dt);
    if (onShoulder) forwardSpeed *= Math.exp(-0.82 * dt);

    const steeringLimit = lerp(0.58, 0.245, smoothstep(0.10, 1, speedRatio));
    let desiredSteerAngle = car.steerInput * steeringLimit;
    if (car.player && Math.abs(car.steerInput) < 0.04 && Math.abs(lateralSpeed) > 28 && Math.abs(forwardSpeed) > 130) {
      desiredSteerAngle = clamp(-lateralSpeed / Math.max(110, Math.abs(forwardSpeed)) * 0.22, -0.11, 0.11);
    }
    const steeringActuation = car.player ? lerp(15, 11, speedRatio) : lerp(13, 9, speedRatio);
    car.steerAngle += (desiredSteerAngle - car.steerAngle) * (1 - Math.exp(-steeringActuation * dt));

    const requestedDrift = car.brakeInput > 0.18 && Math.abs(car.steerInput) > 0.18 && Math.abs(forwardSpeed) > 160;
    const driftIntent = car.player ? requestedDrift : requestedDrift && car.aggression > 0.78 && Math.abs(car.steerInput) > 0.68;
    const desiredYawRate = forwardSpeed / CAR_WHEELBASE * Math.tan(car.steerAngle) * (onRoad ? 1 : 0.60);
    const yawResponse = driftIntent ? 4.6 : onRoad ? lerp(9.2, 6.4, speedRatio) : 1.5;
    car.yawRate += (desiredYawRate - car.yawRate) * (1 - Math.exp(-yawResponse * dt));
    if (driftIntent) car.yawRate += car.steerInput * clamp(Math.abs(forwardSpeed) / 420, 0, 1.7) * 1.45 * dt;
    if (Math.abs(car.steerInput) < 0.04 && !driftIntent) car.yawRate *= Math.exp(-2.8 * dt);
    car.angle += car.yawRate * dt;

    const grip = driftIntent ? 2.15 : onRoad ? lerp(11.2, 7.0, speedRatio) : 1.35;
    lateralSpeed *= Math.exp(-grip * dt);
    if (driftIntent) lateralSpeed -= car.steerInput * forwardSpeed * 0.72 * dt;
    if (!onRoad) lateralSpeed *= Math.exp(-1.7 * dt);
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
  car.slip = Math.abs(lateralSpeed) + Math.abs(car.yawRate - desiredYawRateSafe(car)) * 7;

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
