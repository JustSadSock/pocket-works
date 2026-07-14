// ШПИЛЬКА 2.7 — stability corrections after simulation audit.

Object.assign(shp27DifficultyTune.rookie, { lateral: 292, lineRate: 44 });
Object.assign(shp27DifficultyTune.racer, { lateral: 344, lineRate: 54 });
Object.assign(shp27DifficultyTune.maniac, { lateral: 398, lineRate: 60 });
Object.assign(shp27DifficultyTune.pilot, { lateral: 424, lineRate: 64 });

function shp27RemoveOutwardVelocity(car, strength) {
  const point = track[car.trackIndex];
  if (!point) return;
  const side = Math.sign(car.signedRoadOffset || 0);
  if (!side) return;
  const nx = point.nx * side;
  const ny = point.ny * side;
  const outward = car.vx * nx + car.vy * ny;
  if (outward <= 0) return;
  car.vx -= nx * outward * strength;
  car.vy -= ny * outward * strength;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  car.forwardSpeed = car.vx * fx + car.vy * fy;
  car.lateralSpeed = car.vx * rx + car.vy * ry;
}

var shp27StabilityBaseUpdateCar = updateCar;
updateCar = function shp27StableUpdateCar(car, dt) {
  shp27StabilityBaseUpdateCar(car, dt);
  if (!car || car.player || car.finishTime != null || car.airborne) return;
  const depth = Math.abs(car.signedRoadOffset || 0) / Math.max(1, roadHalf);
  if (depth < 0.54) return;
  const edgeLoad = smoothstep(0.54, 0.98, depth);
  shp27RemoveOutwardVelocity(car, lerp(0.24, 0.92, edgeLoad));
  car.yawRate *= Math.exp(-lerp(0.45, 2.8, edgeLoad) * dt);
  if (depth > 0.82) {
    const speed = Math.hypot(car.vx, car.vy);
    const limit = lerp(440, 285, smoothstep(0.82, 1.14, depth));
    if (speed > limit) {
      car.vx *= limit / speed;
      car.vy *= limit / speed;
      car.forwardSpeed *= limit / speed;
      car.lateralSpeed *= limit / speed;
    }
  }
};

var shp27StabilityBasePairCollision = resolvePairCollision;
resolvePairCollision = function shp27StablePairCollision(a, b) {
  const collided = shp27StabilityBasePairCollision(a, b);
  if (!collided || a.player || b.player) return collided;
  a.yawRate *= 0.84;
  b.yawRate *= 0.84;
  if (Math.abs(a.signedRoadOffset || 0) > roadHalf * 0.48) shp27RemoveOutwardVelocity(a, 0.62);
  if (Math.abs(b.signedRoadOffset || 0) > roadHalf * 0.48) shp27RemoveOutwardVelocity(b, 0.62);
  return collided;
};
