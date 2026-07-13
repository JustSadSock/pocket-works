// Runtime guards and final collision-stability corrections for ШПИЛЬКА 2.3.
var shp23BaseUpdateRouteExtras = shp23UpdateRouteExtras;
shp23UpdateRouteExtras = function shp23UpdateRouteExtrasStable() {
  const routeName = document.querySelector('#routeName');
  if (routeName && !document.querySelector('#routeModeBadge')) {
    const badge = document.createElement('span');
    badge.className = 'route-mode-badge';
    badge.id = 'routeModeBadge';
    badge.hidden = true;
    routeName.append(' ', badge);
  }
  shp23BaseUpdateRouteExtras();
};

resolvePairCollision = function shp23ResolvePairCollisionStable(a, b) {
  if (a.airborne !== b.airborne || Math.abs((a.z || 0) - (b.z || 0)) > 18) return;

  const basisA = carBasis(a);
  const basisB = carBasis(b);
  const axes = [[basisA.fx, basisA.fy], [basisA.rx, basisA.ry], [basisB.fx, basisB.fy], [basisB.rx, basisB.ry]];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const centerRelativeX = b.vx - a.vx;
  const centerRelativeY = b.vy - a.vy;
  const candidates = [];

  for (const [rawX, rawY] of axes) {
    const magnitude = Math.hypot(rawX, rawY) || 1;
    const axisX = rawX / magnitude;
    const axisY = rawY / magnitude;
    const signedDistance = dx * axisX + dy * axisY;
    const penetration = projectionRadius(a, axisX, axisY) + projectionRadius(b, axisX, axisY) - Math.abs(signedDistance);
    if (penetration <= 0) return;

    const rawRelative = centerRelativeX * axisX + centerRelativeY * axisY;
    const sign = Math.abs(signedDistance) > 0.0001
      ? (signedDistance < 0 ? -1 : 1)
      : (rawRelative <= 0 ? 1 : -1);
    const nx = axisX * sign;
    const ny = axisY * sign;
    candidates.push({
      overlap: penetration,
      nx,
      ny,
      approach: centerRelativeX * nx + centerRelativeY * ny
    });
  }

  candidates.sort((left, right) => left.overlap - right.overlap);
  const minimum = candidates[0];
  const impactAxis = candidates
    .filter((candidate) => candidate.approach < -18 && candidate.overlap <= minimum.overlap * 1.58)
    .sort((left, right) => left.approach - right.approach)[0];
  const chosen = impactAxis || minimum;
  const overlap = chosen.overlap;
  const normalX = chosen.nx;
  const normalY = chosen.ny;

  const correction = Math.max(0, overlap - 0.35) * 0.5;
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
  const separationBias = clamp(Math.max(0, overlap - 0.5) * 13, 0, 95);
  const impulseMagnitude = Math.max(0, (-(1 + restitution) * Math.min(normalVelocity, 0) + separationBias) / Math.max(0.1, denominator));

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
    const tangentDenominator = 2 + tangentCrossA * tangentCrossA / 300 + tangentCrossB * tangentCrossB / 300;
    const frictionMagnitude = clamp(-tangentVelocity / Math.max(0.1, tangentDenominator), -impulseMagnitude * 0.30, impulseMagnitude * 0.30);
    shp23ApplyImpulse(a, tangentX * frictionMagnitude, tangentY * frictionMagnitude, rAx, rAy, -1);
    shp23ApplyImpulse(b, tangentX * frictionMagnitude, tangentY * frictionMagnitude, rBx, rBy, 1);
  }

  a.bodyRattle = 0;
  b.bodyRattle = 0;
  shp23ImpactFeedback(a, b, impact + separationBias * 0.35, contactX, contactY, normalX, normalY);
};

shp23UpdateRouteExtras();
