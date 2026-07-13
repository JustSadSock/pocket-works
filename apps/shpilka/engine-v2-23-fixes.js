// ШПИЛЬКА 2.3 — automatic steering ratio, touch calibration and stable collision response.

var shp23TouchNoise = 0.018;
var shp23SteerPointer = null;
var shp23LastRawSteer = 0;
var shp23ContactPairs = new Map();
var shp23CollisionCounter = 1;

shpPrefs.steeringFeel = 'precise';
shpSavePrefs();

function shp23AdaptiveSteer(raw) {
  const magnitude = Math.abs(raw);
  if (magnitude < 0.0001) return 0;
  const speedRatio = player ? clamp(Math.abs(player.forwardSpeed || 0) / MAX_SPEED, 0, 1) : 0;
  const slipRatio = player
    ? clamp((Math.abs(player.lateralSpeed || 0) + Math.abs(player.yawRate || 0) * 34) / 420, 0, 1)
    : 0;
  const ratio = clamp(
    1.08 - smoothstep(0.16, 0.96, speedRatio) * 0.42 - slipRatio * 0.10,
    0.54,
    1.08
  );
  const shaped = magnitude * ratio + Math.pow(magnitude, 3) * (1 - ratio);
  return Math.sign(raw) * clamp(shaped, 0, 1);
}

var shp23BasePlayerControls = playerControls;
playerControls = function shp23PlayerControls() {
  const commands = shp23BasePlayerControls();
  return { ...commands, steer: shp23AdaptiveSteer(commands.steer) };
};

function shp23BindAutomaticCalibration() {
  const arc = document.querySelector('#steeringArc');
  if (!arc) return;

  const calibrate = (event) => {
    if (event.pointerId !== shp23SteerPointer) return;
    const rect = arc.getBoundingClientRect();
    const raw = clamp((event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1, -1, 1);
    const delta = Math.abs(raw - shp23LastRawSteer);
    if (Math.abs(raw) < 0.17) {
      shp23TouchNoise = lerp(shp23TouchNoise, clamp(delta, 0.006, 0.055), 0.08);
    } else {
      shp23TouchNoise = lerp(shp23TouchNoise, 0.018, 0.018);
    }
    shp23LastRawSteer = raw;
    const deadZone = clamp(shp23TouchNoise * 1.8, 0.026, 0.065);
    const calibrated = Math.sign(raw) * clamp((Math.abs(raw) - deadZone) / (1 - deadZone), 0, 1);
    shpAnalog.steer = Math.sign(calibrated) * Math.pow(Math.abs(calibrated), 1.48);
    shpRenderPrecisionControls();
  };

  arc.addEventListener('pointerdown', (event) => {
    shp23SteerPointer = event.pointerId;
    shp23LastRawSteer = 0;
    calibrate(event);
  });
  arc.addEventListener('pointermove', calibrate);

  const release = (event) => {
    if (event.pointerId != null && event.pointerId !== shp23SteerPointer) return;
    shp23SteerPointer = null;
    shp23LastRawSteer = 0;
  };

  arc.addEventListener('pointerup', release);
  arc.addEventListener('pointercancel', release);
  arc.addEventListener('lostpointercapture', () => {
    shp23SteerPointer = null;
    shp23LastRawSteer = 0;
  });
}

function shp23SupportPoint(car, dirX, dirY) {
  const basis = carBasis(car);
  const forwardSign = basis.fx * dirX + basis.fy * dirY >= 0 ? 1 : -1;
  const rightSign = basis.rx * dirX + basis.ry * dirY >= 0 ? 1 : -1;
  return {
    x: car.x + basis.fx * CAR_HALF_LENGTH * forwardSign + basis.rx * CAR_HALF_WIDTH * rightSign,
    y: car.y + basis.fy * CAR_HALF_LENGTH * forwardSign + basis.ry * CAR_HALF_WIDTH * rightSign
  };
}

function shp23VelocityAtPoint(car, rx, ry) {
  return {
    x: car.vx - (car.yawRate || 0) * ry,
    y: car.vy + (car.yawRate || 0) * rx
  };
}

function shp23ApplyImpulse(car, impulseX, impulseY, rx, ry, direction) {
  car.vx += impulseX * direction;
  car.vy += impulseY * direction;
  car.yawRate += (rx * impulseY - ry * impulseX) * (1 / 300) * direction;
}

function shp23PairKey(a, b) {
  const left = Math.min(a.shpCollisionId || 0, b.shpCollisionId || 0);
  const right = Math.max(a.shpCollisionId || 0, b.shpCollisionId || 0);
  return `${left}:${right}`;
}

function shp23ImpactFeedback(a, b, impact, x, y, nx, ny) {
  const key = shp23PairKey(a, b);
  const previous = shp23ContactPairs.get(key) ?? -Infinity;
  if (raceElapsed - previous < 0.20 || impact < 24) return;
  shp23ContactPairs.set(key, raceElapsed);
  a.collisionCooldown = Math.max(a.collisionCooldown || 0, 0.14);
  b.collisionCooldown = Math.max(b.collisionCooldown || 0, 0.14);
  spawnSparks(x, y, nx, ny, clamp(impact / 220, 0.22, 1));
  if (a.player || b.player) {
    cameraShake = prefersReducedMotion ? 1 : clamp(impact * 0.042, 2, 11);
    audio.blip('impact', clamp(impact / 230, 0.22, 0.92));
    navigator.vibrate?.(Math.round(clamp(impact * 0.055, 7, 28)));
  }
}

var shp23BaseSetupRace = setupRace;
setupRace = function shp23SetupRace() {
  shp23BaseSetupRace();
  shp23ContactPairs.clear();
  cars.forEach((car) => {
    car.shpCollisionId = shp23CollisionCounter++;
    car.bodyRattle = 0;
  });
  shp23UpdateRouteExtras?.();
};

resolvePairCollision = function shp23ResolvePairCollision(a, b) {
  if (a.airborne !== b.airborne || Math.abs((a.z || 0) - (b.z || 0)) > 18) return;

  const basisA = carBasis(a);
  const basisB = carBasis(b);
  const axes = [
    [basisA.fx, basisA.fy],
    [basisA.rx, basisA.ry],
    [basisB.fx, basisB.fy],
    [basisB.rx, basisB.ry]
  ];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const relativeCenterX = b.vx - a.vx;
  const relativeCenterY = b.vy - a.vy;
  const candidates = [];

  for (const [rawX, rawY] of axes) {
    const magnitude = Math.hypot(rawX, rawY) || 1;
    const axisX = rawX / magnitude;
    const axisY = rawY / magnitude;
    const signedDistance = dx * axisX + dy * axisY;
    const overlap = projectionRadius(a, axisX, axisY)
      + projectionRadius(b, axisX, axisY)
      - Math.abs(signedDistance);
    if (overlap <= 0) return;

    const rawRelative = relativeCenterX * axisX + relativeCenterY * axisY;
    const sign = Math.abs(signedDistance) > 0.0001
      ? (signedDistance < 0 ? -1 : 1)
      : (rawRelative <= 0 ? 1 : -1);
    const nx = axisX * sign;
    const ny = axisY * sign;
    candidates.push({
      overlap,
      nx,
      ny,
      approach: relativeCenterX * nx + relativeCenterY * ny
    });
  }

  candidates.sort((left, right) => left.overlap - right.overlap);
  const minimum = candidates[0];
  const impactAxis = candidates
    .filter((candidate) => candidate.approach < -18 && candidate.overlap <= minimum.overlap * 1.58)
    .sort((left, right) => left.approach - right.approach)[0];
  const chosen = impactAxis || minimum;
  const normalX = chosen.nx;
  const normalY = chosen.ny;

  const correction = Math.max(0, chosen.overlap - 0.35) * 0.5;
  a.x -= normalX * correction;
  a.y -= normalY * correction;
  b.x += normalX * correction;
  b.y += normalY * correction;

  const supportA = shp23SupportPoint(a, normalX, normalY);
  const supportB = shp23SupportPoint(b, -normalX, -normalY);
  const contactX = (supportA.x + supportB.x) * 0.5;
  const contactY = (supportA.y + supportB.y) * 0.5;
  const rAx = contactX - a.x;
  const rAy = contactY - a.y;
  const rBx = contactX - b.x;
  const rBy = contactY - b.y;
  const velocityA = shp23VelocityAtPoint(a, rAx, rAy);
  const velocityB = shp23VelocityAtPoint(b, rBx, rBy);
  const relativeX = velocityB.x - velocityA.x;
  const relativeY = velocityB.y - velocityA.y;
  const normalVelocity = relativeX * normalX + relativeY * normalY;
  const crossA = rAx * normalY - rAy * normalX;
  const crossB = rBx * normalY - rBy * normalX;
  const denominator = 2 + crossA * crossA / 300 + crossB * crossB / 300;
  const impact = Math.max(0, -normalVelocity);
  const restitution = lerp(0.16, 0.36, smoothstep(30, 260, impact));
  const separationBias = clamp(Math.max(0, chosen.overlap - 0.5) * 13, 0, 95);
  const impulseMagnitude = Math.max(
    0,
    (-(1 + restitution) * Math.min(normalVelocity, 0) + separationBias) / Math.max(0.1, denominator)
  );

  if (impulseMagnitude > 0) {
    const impulseX = normalX * impulseMagnitude;
    const impulseY = normalY * impulseMagnitude;
    shp23ApplyImpulse(a, impulseX, impulseY, rAx, rAy, -1);
    shp23ApplyImpulse(b, impulseX, impulseY, rBx, rBy, 1);

    const tangentX = -normalY;
    const tangentY = normalX;
    const tangentVelocity = relativeX * tangentX + relativeY * tangentY;
    const tangentCrossA = rAx * tangentY - rAy * tangentX;
    const tangentCrossB = rBx * tangentY - rBy * tangentX;
    const tangentDenominator = 2
      + tangentCrossA * tangentCrossA / 300
      + tangentCrossB * tangentCrossB / 300;
    const frictionMagnitude = clamp(
      -tangentVelocity / Math.max(0.1, tangentDenominator),
      -impulseMagnitude * 0.30,
      impulseMagnitude * 0.30
    );
    shp23ApplyImpulse(a, tangentX * frictionMagnitude, tangentY * frictionMagnitude, rAx, rAy, -1);
    shp23ApplyImpulse(b, tangentX * frictionMagnitude, tangentY * frictionMagnitude, rBx, rBy, 1);
  }

  a.bodyRattle = 0;
  b.bodyRattle = 0;
  shp23ImpactFeedback(
    a,
    b,
    impact + separationBias * 0.35,
    contactX,
    contactY,
    normalX,
    normalY
  );
};

resolveRoadCollision = function shp23ResolveRoadCollision(car) {
  const point = track[car.trackIndex];
  if (!point) return;
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
  car.x -= nx * (penetration + 0.3);
  car.y -= ny * (penetration + 0.3);
  car.signedRoadOffset -= side * (penetration + 0.3);

  const outward = car.vx * nx + car.vy * ny;
  if (outward <= 0) return;
  const restitution = lerp(0.16, 0.32, smoothstep(45, 280, outward));
  car.vx -= nx * outward * (1 + restitution);
  car.vy -= ny * outward * (1 + restitution);

  const tangentX = -ny;
  const tangentY = nx;
  const tangentSpeed = car.vx * tangentX + car.vy * tangentY;
  car.vx -= tangentX * tangentSpeed * 0.035;
  car.vy -= tangentY * tangentSpeed * 0.035;
  car.yawRate += clamp(-side * tangentSpeed * outward * 0.0000028, -0.75, 0.75);
  car.bodyRattle = 0;

  if ((car.collisionCooldown || 0) <= 0) {
    car.collisionCooldown = 0.18;
    spawnSparks(
      car.x + nx * projectedHalfExtent,
      car.y + ny * projectedHalfExtent,
      nx,
      ny,
      clamp(outward / 230, 0.24, 1)
    );
    if (car.player) {
      cameraShake = prefersReducedMotion ? 1 : clamp(outward * 0.045, 2, 12);
      audio.blip('impact', clamp(outward / 260, 0.24, 1));
      navigator.vibrate?.(Math.round(clamp(outward * 0.05, 7, 30)));
    }
  }
};

var shp23BaseDrawCar = drawCar;
drawCar = function shp23DrawCar(car) {
  car.bodyRattle = 0;
  shp23BaseDrawCar(car);
  car.bodyRattle = 0;
};

shp23BindAutomaticCalibration();
