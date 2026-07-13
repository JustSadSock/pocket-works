function desiredYawRateSafe(car) {
  return car.forwardSpeed / CAR_WHEELBASE * Math.tan(car.steerAngle || 0);
}

function resolveRoadCollision(car) {
  const point = track[car.trackIndex];
  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const rightX = -forwardY;
  const rightY = forwardX;
  const projectedHalfExtent = Math.abs(forwardX * point.nx + forwardY * point.ny) * CAR_HALF_LENGTH
    + Math.abs(rightX * point.nx + rightY * point.ny) * CAR_HALF_WIDTH;
  const barrierLimit = roadHalf + 24 - projectedHalfExtent;
  const signed = car.signedRoadOffset;
  const absolute = Math.abs(signed);
  if (absolute <= barrierLimit) return;

  const side = Math.sign(signed) || 1;
  const penetration = absolute - barrierLimit;
  const nx = point.nx * side;
  const ny = point.ny * side;
  car.x -= nx * penetration;
  car.y -= ny * penetration;
  const outward = car.vx * nx + car.vy * ny;
  if (outward > 0) {
    car.vx -= nx * outward * 1.42;
    car.vy -= ny * outward * 1.42;
    const tangentX = -ny;
    const tangentY = nx;
    const tangential = car.vx * tangentX + car.vy * tangentY;
    car.vx -= tangentX * tangential * 0.10;
    car.vy -= tangentY * tangential * 0.10;
    car.yawRate -= side * clamp(outward / 210, 0, 1.7);
    if (car.collisionCooldown <= 0) {
      spawnSparks(car.x, car.y, nx, ny, clamp(outward / 210, 0.28, 1));
      car.collisionCooldown = 0.16;
      if (car.player) {
        cameraShake = prefersReducedMotion ? 1 : clamp(outward * 0.065, 3, 13);
        audio.blip('impact', clamp(outward / 270, 0.28, 1));
        navigator.vibrate?.(Math.round(clamp(outward * 0.055, 8, 32)));
      }
    }
  }
}

function carBasis(car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  return { fx, fy, rx: -fy, ry: fx };
}

function projectionRadius(car, axisX, axisY) {
  const basis = carBasis(car);
  return CAR_HALF_LENGTH * Math.abs(basis.fx * axisX + basis.fy * axisY)
    + CAR_HALF_WIDTH * Math.abs(basis.rx * axisX + basis.ry * axisY);
}

function resolvePairCollision(a, b) {
  if (a.airborne !== b.airborne || Math.abs(a.z - b.z) > 18) return;
  const basisA = carBasis(a);
  const basisB = carBasis(b);
  const axes = [
    [basisA.fx, basisA.fy], [basisA.rx, basisA.ry],
    [basisB.fx, basisB.fy], [basisB.rx, basisB.ry]
  ];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let smallestOverlap = Infinity;
  let normalX = 0;
  let normalY = 0;

  for (const [axisXRaw, axisYRaw] of axes) {
    const magnitude = Math.hypot(axisXRaw, axisYRaw) || 1;
    const axisX = axisXRaw / magnitude;
    const axisY = axisYRaw / magnitude;
    const distance = dx * axisX + dy * axisY;
    const overlap = projectionRadius(a, axisX, axisY) + projectionRadius(b, axisX, axisY) - Math.abs(distance);
    if (overlap <= 0) return;
    if (overlap < smallestOverlap) {
      smallestOverlap = overlap;
      const sign = distance < 0 ? -1 : 1;
      normalX = axisX * sign;
      normalY = axisY * sign;
    }
  }

  const invMassA = 1;
  const invMassB = 1;
  const totalInv = invMassA + invMassB;
  const correction = Math.max(0, smallestOverlap - 0.2) / totalInv;
  a.x -= normalX * correction * invMassA;
  a.y -= normalY * correction * invMassA;
  b.x += normalX * correction * invMassB;
  b.y += normalY * correction * invMassB;

  const relativeX = b.vx - a.vx;
  const relativeY = b.vy - a.vy;
  const normalVelocity = relativeX * normalX + relativeY * normalY;
  if (normalVelocity >= 0) return;
  const restitution = 0.18;
  const impulse = -(1 + restitution) * normalVelocity / totalInv;
  const impulseX = normalX * impulse;
  const impulseY = normalY * impulse;
  a.vx -= impulseX * invMassA;
  a.vy -= impulseY * invMassA;
  b.vx += impulseX * invMassB;
  b.vy += impulseY * invMassB;

  const tangentX = -normalY;
  const tangentY = normalX;
  const tangentVelocity = relativeX * tangentX + relativeY * tangentY;
  const frictionImpulse = clamp(-tangentVelocity / totalInv, -impulse * 0.42, impulse * 0.42);
  a.vx -= tangentX * frictionImpulse * invMassA;
  a.vy -= tangentY * frictionImpulse * invMassA;
  b.vx += tangentX * frictionImpulse * invMassB;
  b.vy += tangentY * frictionImpulse * invMassB;
  a.yawRate -= frictionImpulse * 0.0026;
  b.yawRate += frictionImpulse * 0.0026;

  if ((a.player || b.player) && Math.abs(normalVelocity) > 48) {
    cameraShake = prefersReducedMotion ? 1 : clamp(Math.abs(normalVelocity) * 0.045, 2, 10);
    audio.blip('impact', clamp(Math.abs(normalVelocity) / 210, 0.22, 0.8));
    navigator.vibrate?.(Math.round(clamp(Math.abs(normalVelocity) * 0.05, 8, 24)));
  }
}

function resolveCarCollisions() {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) resolvePairCollision(cars[i], cars[j]);
  }
}

function recoverCar(car, advance = false) {
  const baseIndex = advance && !car.player ? car.trackIndex + 14 : car.safeIndex - 10;
  const index = (baseIndex + track.length * 2) % track.length;
  const point = track[index];
  car.x = point.x + point.nx * clamp(car.lane * 0.4, -18, 18);
  car.y = point.y + point.ny * clamp(car.lane * 0.4, -18, 18);
  car.angle = point.heading;
  car.vx = point.tx * 52;
  car.vy = point.ty * 52;
  car.forwardSpeed = 52;
  car.lateralSpeed = 0;
  car.yawRate = 0;
  car.steerAngle = 0;
  car.z = 0;
  car.vz = 0;
  car.airborne = false;
  car.trackIndex = index;
  car.previousTrackIndex = index;
  car.progressDistance = Math.max(car.progressDistance, car.completedLaps * track.totalLength + track[index].distance);
  car.nextLapDistance = Math.max(car.nextLapDistance, (car.completedLaps + 1) * track.totalLength);
  car.distanceFromRoad = 0;
  car.signedRoadOffset = 0;
  car.stuckTime = 0;
  car.jumpCooldown = 0.8;
  car.progressTimer = 0;
  car.lastProgressScore = car.raceScore;
  spawnBurst(car.x, car.y, '#f4efe0', 10, 90);
  if (car.player) {
    cameraShake = prefersReducedMotion ? 1 : 5;
    showRaceMessage('ОБРАТНО В ДЕЛО', 0.65);
  }
}
