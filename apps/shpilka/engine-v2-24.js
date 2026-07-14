// ШПИЛЬКА 2.4 — longer two-lap races, recoverable mistakes and stable sustained contacts.

var shp24PairContacts = new Map();
var shp24CollisionCounter = 1;
var shp24GeometryMarker = 'pocket-works:shpilka:geometry:v24';

try {
  if (localStorage.getItem(shp24GeometryMarker) !== '2.4.0') {
    saved.routeRecords = {};
    saveState();
    localStorage.setItem(shp24GeometryMarker, '2.4.0');
  }
} catch {
  // Persistent storage is optional.
}

Object.assign(shpArchetypes.speed, {
  anchorMin: 28,
  anchorMax: 34,
  rx: [2350, 3050],
  ry: [1750, 2300],
  road: [184, 198]
});
Object.assign(shpArchetypes.technical, {
  anchorMin: 32,
  anchorMax: 40,
  rx: [2100, 2700],
  ry: [1600, 2150],
  road: [174, 188]
});
Object.assign(shpArchetypes.mountain, {
  anchorMin: 30,
  anchorMax: 37,
  rx: [2200, 2900],
  ry: [1600, 2200],
  road: [176, 190]
});
Object.assign(shpArchetypes.cascade, {
  anchorMin: 32,
  anchorMax: 40,
  rx: [2300, 3000],
  ry: [1700, 2300],
  road: [180, 194]
});

function shp24Orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function shp24SegmentsIntersect(a, b, c, d) {
  const o1 = shp24Orientation(a, b, c);
  const o2 = shp24Orientation(a, b, d);
  const o3 = shp24Orientation(c, d, a);
  const o4 = shp24Orientation(c, d, b);
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function shp24TrackMetrics(points) {
  const straightThreshold = 0.00062;
  const tightThreshold = 0.00175;
  const straightRuns = [];
  const count = points.length;
  let straightRun = 0;
  let tightRun = 0;
  let longestTightRun = 0;
  let start = 0;

  while (start < count && Math.abs(points[start].curvature) < straightThreshold) start += 1;
  start %= count;

  for (let step = 1; step <= count; step += 1) {
    const index = (start + step) % count;
    const nextIndex = (index + 1) % count;
    const segmentLength = Math.hypot(
      points[nextIndex].x - points[index].x,
      points[nextIndex].y - points[index].y
    );

    if (Math.abs(points[index].curvature) < straightThreshold) {
      straightRun += segmentLength;
    } else if (straightRun > 0) {
      straightRuns.push(straightRun);
      straightRun = 0;
    }

    if (Math.abs(points[index].curvature) > tightThreshold) {
      tightRun += segmentLength;
      longestTightRun = Math.max(longestTightRun, tightRun);
    } else {
      tightRun = 0;
    }
  }

  if (straightRun > 0) straightRuns.push(straightRun);
  straightRuns.sort((a, b) => b - a);
  return {
    straightRuns,
    overtakeZones: straightRuns.filter((length) => length >= 500).length,
    longestTightRun
  };
}

trackIsValid = function shp24TrackIsValid(points) {
  if (!points.length || points.totalLength < 12000 || points.totalLength > 20500) return false;

  let sharpSections = 0;
  let maximumLocalTurn = 0;
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[(i - 1 + points.length) % points.length];
    const point = points[i];
    const next = points[(i + 1) % points.length];
    const localTurn = Math.abs(wrapAngle(next.heading - previous.heading));
    maximumLocalTurn = Math.max(maximumLocalTurn, localTurn);
    if (Math.abs(point.curvature) > 0.0015) sharpSections += 1;
    if (Math.hypot(next.x - point.x, next.y - point.y) > 44) return false;
  }
  if (maximumLocalTurn > 0.34 || sharpSections < points.length * 0.012) return false;

  const metrics = shp24TrackMetrics(points);
  if (metrics.overtakeZones < 2 || metrics.longestTightRun > 1050) return false;

  const spacingStride = 6;
  const minimumSpacing = roadWidth + 100;
  for (let i = 0; i < points.length; i += spacingStride) {
    for (let j = i + spacingStride * 8; j < points.length; j += spacingStride) {
      const cyclicDistance = Math.min(j - i, points.length - (j - i));
      if (cyclicDistance < spacingStride * 8) continue;
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (dx * dx + dy * dy < minimumSpacing * minimumSpacing) return false;
    }
  }

  const segmentStride = 4;
  for (let i = 0; i < points.length; i += segmentStride) {
    const a = points[i];
    const b = points[(i + segmentStride) % points.length];
    for (let j = i + segmentStride * 8; j < points.length; j += segmentStride) {
      const cyclicDistance = Math.min(j - i, points.length - (j - i));
      if (cyclicDistance < segmentStride * 8) continue;
      const c = points[j];
      const d = points[(j + segmentStride) % points.length];
      if (shp24SegmentsIntersect(a, b, c, d)) return false;
    }
  }

  points.shp24Metrics = metrics;
  return true;
};

function shp24ShapeOvertakeZones(anchors, random) {
  const count = anchors.length;
  const starts = [
    Math.floor(random() * count),
    Math.floor(count * 0.42 + random() * count * 0.18) % count
  ];

  for (const start of starts) {
    const before = anchors[(start - 1 + count) % count];
    const after = anchors[(start + 4) % count];
    for (let step = 0; step < 4; step += 1) {
      const t = (step + 1) / 5;
      anchors[(start + step) % count] = {
        x: lerp(before.x, after.x, t),
        y: lerp(before.y, after.y, t)
      };
    }
  }
  return anchors;
}

function shp24FallbackTrack(archetype) {
  const scaleX = archetype.id === 'technical' ? 2.35 : archetype.id === 'speed' ? 2.65 : 2.5;
  const scaleY = archetype.id === 'mountain' ? 2.55 : 2.42;
  const anchors = [
    [-780, -180], [-590, -560], [-180, -700], [330, -640], [760, -330], [860, 110],
    [650, 520], [210, 700], [-280, 620], [-640, 320], [-850, 90]
  ].map(([x, y]) => ({ x: x * scaleX, y: y * scaleY }));
  return finalizeTrack(sampleClosedSpline(anchors, 0.5));
}

generateTrack = function shp24GenerateTrack(seed) {
  const seedRandom = mulberry32(seed);
  const archetype = shpActiveArchetype || shpArchetypes.speed;
  roadWidth = Math.round(lerp(archetype.road[0], archetype.road[1], seedRandom()));
  roadHalf = roadWidth * 0.5;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const random = mulberry32(hashSeed(seed + attempt * 977));
    const profile = archetype.profiles[Math.floor(random() * archetype.profiles.length)];
    const anchorCount = archetype.anchorMin
      + Math.floor(random() * (archetype.anchorMax - archetype.anchorMin + 1));
    const radiusX = lerp(archetype.rx[0], archetype.rx[1], random());
    const radiusY = lerp(archetype.ry[0], archetype.ry[1], random());
    const rotation = random() * TAU;
    const phases = [random() * TAU, random() * TAU, random() * TAU];
    const anchors = [];

    for (let i = 0; i < anchorCount; i += 1) {
      const angle = i / anchorCount * TAU;
      let radius = 1;
      for (let harmonicIndex = 0; harmonicIndex < profile.length; harmonicIndex += 1) {
        const [frequency, amplitude] = profile[harmonicIndex];
        radius += amplitude
          * lerp(0.90, 1.10, random())
          * Math.sin(frequency * angle + phases[harmonicIndex]);
      }
      radius += (random() - 0.5) * (archetype.id === 'technical' ? 0.026 : 0.015);
      const localX = Math.cos(angle) * radiusX * radius;
      const localY = Math.sin(angle) * radiusY * radius;
      anchors.push({
        x: localX * Math.cos(rotation) - localY * Math.sin(rotation),
        y: localX * Math.sin(rotation) + localY * Math.cos(rotation)
      });
    }

    shp24ShapeOvertakeZones(anchors, random);
    const points = finalizeTrack(sampleClosedSpline(anchors, lerp(0.46, 0.54, random())));
    if (trackIsValid(points)) return points;
  }

  return shp24FallbackTrack(archetype);
};

var shp24BasePrepareRoute = prepareRoute;
prepareRoute = function shp24PrepareRoute(forceSeed = null) {
  shp24BasePrepareRoute(forceSeed);
  lapsToWin = 2;
  if (typeof shp23ComputeMedalTargets === 'function') {
    shp23MedalTargets = shp23ComputeMedalTargets();
  }
  updateRouteUi();
};

function shp24PlaceGridCar(car, backward, lateral) {
  const start = track[0];
  car.x = start.x - start.tx * backward + start.nx * lateral;
  car.y = start.y - start.ty * backward + start.ny * lateral;
  car.angle = start.heading;
  const nearest = nearestTrackIndex(car.x, car.y);
  car.trackIndex = nearest.index;
  car.previousTrackIndex = nearest.index;
  car.safeIndex = nearest.index;
  car.progressDistance = track[nearest.index].distance;
  if (nearest.index > track.length * 0.78) car.progressDistance -= track.totalLength;
  car.nextLapDistance = track.totalLength;
  car.lastProgressScore = car.progressDistance;
  car.raceScore = car.progressDistance;
  car.lapStartTime = 0;
}

var shp24BaseSetupRace = setupRace;
setupRace = function shp24SetupRace() {
  shp24BaseSetupRace();
  shp24PairContacts.clear();
  const grid = [
    [72, -15],
    [150, 34],
    [150, -34],
    [238, 34],
    [238, -34]
  ];

  cars.forEach((car, index) => {
    const [backward, lateral] = grid[index] || [238 + index * 72, index % 2 ? 32 : -32];
    shp24PlaceGridCar(car, backward, lateral);
    car.shp24CollisionId = shp24CollisionCounter++;
    car.shp24RecoveryImmunity = 0;
    car.shp24OffroadTimer = 0;
    car.shp24RecoveryWarned = false;
    car.shp24WallLock = 0;
  });
  updateRaceOrder();
  updateHud();
};

var shp24BaseRecoverCar = recoverCar;
recoverCar = function shp24RecoverCar(car, advance = false) {
  shp24BaseRecoverCar(car, advance);
  car.shp24RecoveryImmunity = car.player ? 1.15 : 0.68;
  car.shp24OffroadTimer = 0;
  car.shp24RecoveryWarned = false;
  car.shp24WallLock = 0.18;
  car.collisionCooldown = Math.max(car.collisionCooldown || 0, 0.35);
};

var shp24BaseUpdateCar = updateCar;
updateCar = function shp24UpdateCar(car, dt) {
  car.shp24RecoveryImmunity = Math.max(0, (car.shp24RecoveryImmunity || 0) - dt);
  car.shp24WallLock = Math.max(0, (car.shp24WallLock || 0) - dt);

  const startingDistance = car.distanceFromRoad;
  const softenShoulder = !car.airborne
    && startingDistance > roadHalf
    && startingDistance < roadHalf + 52;
  if (softenShoulder) car.distanceFromRoad = roadHalf + 1;

  shp24BaseUpdateCar(car, dt);

  if (!car.airborne && car.distanceFromRoad > roadHalf && car.distanceFromRoad < roadHalf + 52) {
    const depth = clamp((car.distanceFromRoad - roadHalf) / 52, 0, 1);
    const drag = Math.exp(-lerp(0.22, 0.92, depth) * dt);
    car.vx *= drag;
    car.vy *= drag;
    const forwardX = Math.cos(car.angle);
    const forwardY = Math.sin(car.angle);
    const rightX = -forwardY;
    const rightY = forwardX;
    car.forwardSpeed = car.vx * forwardX + car.vy * forwardY;
    car.lateralSpeed = car.vx * rightX + car.vy * rightY;
  }

  if (!car.player || car.shp24RecoveryImmunity > 0 || mode !== 'race') return;

  const nearestPoint = track[car.trackIndex];
  const speed = Math.hypot(car.vx, car.vy);
  const headingError = Math.abs(wrapAngle(car.angle - nearestPoint.heading));
  const deepRunoff = car.distanceFromRoad > roadHalf + 36;
  const stranded = speed < 34
    && (car.distanceFromRoad > roadHalf + 16 || headingError > 2.45);

  if (deepRunoff || stranded) {
    car.shp24OffroadTimer += dt * (deepRunoff ? 1.25 : 1);
  } else {
    car.shp24OffroadTimer = Math.max(0, car.shp24OffroadTimer - dt * 2.2);
    car.shp24RecoveryWarned = false;
  }

  if (car.shp24OffroadTimer > 0.62 && !car.shp24RecoveryWarned) {
    car.shp24RecoveryWarned = true;
    showRaceMessage('ВОЗВРАТ НА ТРАССУ', 0.55);
  }
  if (car.shp24OffroadTimer > 1.18) recoverCar(car);
};

function shp24PairKey(a, b) {
  const left = Math.min(a.shp24CollisionId || 0, b.shp24CollisionId || 0);
  const right = Math.max(a.shp24CollisionId || 0, b.shp24CollisionId || 0);
  return `${left}:${right}`;
}

resolvePairCollision = function shp24ResolvePairCollision(a, b) {
  if (a.shp24RecoveryImmunity > 0 || b.shp24RecoveryImmunity > 0) return false;
  if (a.airborne !== b.airborne || Math.abs((a.z || 0) - (b.z || 0)) > 18) return false;

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
    if (overlap <= 0) return false;

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

  const correction = Math.max(0, chosen.overlap - 0.08) * 0.54;
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
  const key = shp24PairKey(a, b);
  const previous = shp24PairContacts.get(key);
  const freshContact = !previous || raceElapsed - previous.lastSeen > 0.08;
  const impact = Math.max(0, -normalVelocity);
  const allowBounce = impact > 18
    && (freshContact || raceElapsed - (previous?.lastImpulse ?? -Infinity) > 0.18);

  let impulseMagnitude = 0;
  if (allowBounce) {
    const restitution = lerp(0.10, 0.29, smoothstep(35, 260, impact));
    impulseMagnitude = (1 + restitution) * impact / Math.max(0.1, denominator);
  } else if (normalVelocity < 0) {
    impulseMagnitude = clamp(-normalVelocity / Math.max(0.1, denominator) * 0.72, 0, 62);
  }

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
      -impulseMagnitude * 0.24,
      impulseMagnitude * 0.24
    );
    shp23ApplyImpulse(a, tangentX * frictionMagnitude, tangentY * frictionMagnitude, rAx, rAy, -1);
    shp23ApplyImpulse(b, tangentX * frictionMagnitude, tangentY * frictionMagnitude, rBx, rBy, 1);
    a.yawRate = clamp(a.yawRate, -2.2, 2.2);
    b.yawRate = clamp(b.yawRate, -2.2, 2.2);
  }

  shp24PairContacts.set(key, {
    lastSeen: raceElapsed,
    lastImpulse: allowBounce ? raceElapsed : previous?.lastImpulse ?? -Infinity
  });

  if (allowBounce) {
    shp23ImpactFeedback(a, b, impact, contactX, contactY, normalX, normalY);
  }
  return true;
};

resolveCarCollisions = function shp24ResolveCarCollisions() {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) resolvePairCollision(cars[i], cars[j]);
  }
  for (const [key, state] of shp24PairContacts) {
    if (raceElapsed - state.lastSeen > 0.16) shp24PairContacts.delete(key);
  }
};

resolveRoadCollision = function shp24ResolveRoadCollision(car) {
  const point = track[car.trackIndex];
  if (!point) return;

  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const rightX = -forwardY;
  const rightY = forwardX;
  const projectedHalfExtent = Math.abs(forwardX * point.nx + forwardY * point.ny) * CAR_HALF_LENGTH
    + Math.abs(rightX * point.nx + rightY * point.ny) * CAR_HALF_WIDTH;
  const barrierLimit = roadHalf + 60 - projectedHalfExtent;
  const signed = car.signedRoadOffset;
  const absolute = Math.abs(signed);
  if (absolute <= barrierLimit) return;

  const side = Math.sign(signed) || 1;
  const penetration = absolute - barrierLimit;
  const nx = point.nx * side;
  const ny = point.ny * side;
  car.x -= nx * (penetration + 0.2);
  car.y -= ny * (penetration + 0.2);
  car.signedRoadOffset -= side * (penetration + 0.2);

  const outward = car.vx * nx + car.vy * ny;
  if (outward <= 0) return;

  if (car.shp24RecoveryImmunity > 0 || car.shp24WallLock > 0) {
    car.vx -= nx * outward * 0.92;
    car.vy -= ny * outward * 0.92;
    return;
  }

  const lightTouch = outward < 82;
  const restitution = lightTouch
    ? 0.02
    : lerp(0.10, 0.31, smoothstep(82, 300, outward));
  car.vx -= nx * outward * (1 + restitution);
  car.vy -= ny * outward * (1 + restitution);

  const tangentX = -ny;
  const tangentY = nx;
  const tangentSpeed = car.vx * tangentX + car.vy * tangentY;
  const tangentLoss = lightTouch ? 0.008 : lerp(0.018, 0.055, smoothstep(82, 260, outward));
  car.vx -= tangentX * tangentSpeed * tangentLoss;
  car.vy -= tangentY * tangentSpeed * tangentLoss;
  if (!lightTouch) {
    car.yawRate += clamp(-side * tangentSpeed * outward * 0.0000017, -0.58, 0.58);
  }
  car.shp24WallLock = lightTouch ? 0.09 : 0.15;
  car.bodyRattle = 0;

  if (outward > 42) {
    spawnSparks(
      car.x + nx * projectedHalfExtent,
      car.y + ny * projectedHalfExtent,
      nx,
      ny,
      clamp(outward / 250, 0.18, 1)
    );
    if (car.player) {
      cameraShake = prefersReducedMotion ? 1 : clamp(outward * 0.035, 1.5, 10);
      audio.blip('impact', clamp(outward / 280, 0.18, 0.9));
      navigator.vibrate?.(Math.round(clamp(outward * 0.04, 5, 24)));
    }
  }
};

var shp24BaseDrawCar = drawCar;
drawCar = function shp24DrawCar(car) {
  if ((car.shp24RecoveryImmunity || 0) <= 0) {
    shp24BaseDrawCar(car);
    return;
  }
  ctx.save();
  ctx.globalAlpha *= 0.48 + Math.sin(raceElapsed * 15) * 0.08;
  shp24BaseDrawCar(car);
  ctx.restore();
};

const shp24Subtitle = document.querySelector('.start-copy .subtitle');
if (shp24Subtitle) {
  shp24Subtitle.textContent = 'Два длинных круга, зоны обгона, мягкие ошибки и автоматический возврат в борьбу.';
}
