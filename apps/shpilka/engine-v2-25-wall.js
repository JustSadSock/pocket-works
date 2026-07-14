// ШПИЛЬКА 2.5 — wall contact classification for clean-line rhythm.

var shp25BaseResolveRoadCollision = resolveRoadCollision;
resolveRoadCollision = function shp25ResolveRoadCollision(car) {
  const vx = car.vx;
  const vy = car.vy;
  const yaw = car.yawRate;
  shp25BaseResolveRoadCollision(car);
  const impulse = Math.hypot(car.vx - vx, car.vy - vy);
  if (impulse > 18) {
    const kind = impulse < 76 && Math.abs(car.yawRate - yaw) < 0.10 ? 'wall-glance' : 'wall-hit';
    shp25MarkImpact(car, impulse, kind);
  }
};
