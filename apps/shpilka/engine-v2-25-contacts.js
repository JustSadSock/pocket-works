// ШПИЛЬКА 2.5 — distinct car contact responses.

var shp25PairEffects = new Map();

function shp25PairKey(a, b) {
  const left = Math.min(a.shp24CollisionId || 0, b.shp24CollisionId || 0);
  const right = Math.max(a.shp24CollisionId || 0, b.shp24CollisionId || 0);
  return `${left}:${right}`;
}

function shp25ClassifyContact(a, b) {
  const basisA = carBasis(a);
  const basisB = carBasis(b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const longitudinal = dx * basisA.fx + dy * basisA.fy;
  const lateral = dx * basisA.rx + dy * basisA.ry;
  const alignment = basisA.fx * basisB.fx + basisA.fy * basisB.fy;
  if (alignment < -0.42) return 'head-on';
  if (alignment > 0.62 && Math.abs(lateral) < CAR_HALF_WIDTH * 1.65) return longitudinal >= 0 ? 'rear-a' : 'rear-b';
  if (alignment > 0.48 && Math.abs(lateral) >= CAR_HALF_WIDTH * 1.20) return 'side';
  return 'cross';
}

function shp25ClampContactState(car) {
  const speed = Math.hypot(car.vx, car.vy);
  const limit = MAX_SPEED * 1.12;
  if (speed > limit) {
    car.vx *= limit / speed;
    car.vy *= limit / speed;
  }
  car.yawRate = clamp(car.yawRate, -2.25, 2.25);
}

var shp25BaseResolvePairCollision = resolvePairCollision;
resolvePairCollision = function shp25ResolvePairCollision(a, b) {
  const avx = a.vx;
  const avy = a.vy;
  const bvx = b.vx;
  const bvy = b.vy;
  const relativeBefore = Math.hypot(b.vx - a.vx, b.vy - a.vy);
  const kind = shp25ClassifyContact(a, b);
  const collided = shp25BaseResolvePairCollision(a, b);
  if (!collided) return false;

  const key = shp25PairKey(a, b);
  const previous = shp25PairEffects.get(key) ?? -Infinity;
  const fresh = raceElapsed - previous > 0.22;
  const impulse = Math.max(
    Math.hypot(a.vx - avx, a.vy - avy),
    Math.hypot(b.vx - bvx, b.vy - bvy)
  );

  if (fresh && impulse > 8) {
    shp25PairEffects.set(key, raceElapsed);
    if (kind === 'rear-a' || kind === 'rear-b') {
      const attacker = kind === 'rear-a' ? a : b;
      const leader = kind === 'rear-a' ? b : a;
      const fx = Math.cos(leader.angle);
      const fy = Math.sin(leader.angle);
      const closing = Math.max(0, (attacker.vx - leader.vx) * fx + (attacker.vy - leader.vy) * fy);
      leader.vx += fx * closing * 0.075;
      leader.vy += fy * closing * 0.075;
      attacker.vx -= fx * closing * 0.055;
      attacker.vy -= fy * closing * 0.055;
      const side = Math.sign((attacker.x - leader.x) * -fy + (attacker.y - leader.y) * fx) || 1;
      leader.yawRate += side * clamp(closing * 0.0010, 0, 0.24);
    } else if (kind === 'side') {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 1;
      const nx = dx / distance;
      const ny = dy / distance;
      const nudge = clamp(relativeBefore * 0.018, 1.5, 8.5);
      a.vx -= nx * nudge;
      a.vy -= ny * nudge;
      b.vx += nx * nudge;
      b.vy += ny * nudge;
      const spin = clamp(relativeBefore * 0.0012, 0.04, 0.32);
      a.yawRate -= spin;
      b.yawRate += spin;
    } else if (kind === 'head-on') {
      a.vx *= 0.86;
      a.vy *= 0.86;
      b.vx *= 0.86;
      b.vy *= 0.86;
    } else {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const sideA = Math.sign(dx * -Math.sin(a.angle) + dy * Math.cos(a.angle)) || 1;
      const sideB = Math.sign(-dx * -Math.sin(b.angle) + -dy * Math.cos(b.angle)) || -1;
      const spin = clamp(relativeBefore * 0.0015, 0.05, 0.38);
      a.yawRate -= sideA * spin;
      b.yawRate -= sideB * spin;
    }

    shp25MarkImpact(a, Math.max(impulse, relativeBefore * 0.30), kind);
    shp25MarkImpact(b, Math.max(impulse, relativeBefore * 0.30), kind);
  }

  shp25ClampContactState(a);
  shp25ClampContactState(b);
  return true;
};

var shp25BaseResolveCarCollisions = resolveCarCollisions;
resolveCarCollisions = function shp25ResolveCarCollisions() {
  shp25BaseResolveCarCollisions();
  for (const [key, time] of shp25PairEffects) {
    if (raceElapsed - time > 0.65) shp25PairEffects.delete(key);
  }
};
