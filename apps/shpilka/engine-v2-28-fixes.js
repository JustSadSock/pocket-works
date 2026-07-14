// ШПИЛЬКА 2.8 — final mistake motion and high-speed stability clamp.
var shp28FixBaseUpdateCar = updateCar;
updateCar = function shp28StableHighSpeedUpdateCar(car, dt) {
  shp28FixBaseUpdateCar(car, dt);
  if (!car || car.airborne) return;

  if (!car.player && car.shp27ErrorTimer > 0 && car.shp28MistakeKind) {
    const point = track[car.trackIndex];
    if (point) {
      const phase = 1 - car.shp27ErrorTimer / Math.max(0.001, car.shp28MistakeTotal || car.shp27ErrorTimer);
      const pulse = Math.sin(clamp(phase, 0, 1) * Math.PI);
      const side = car.shp27ErrorSide || 1;
      const strength = car.shp28MistakeKind === 'wide' ? 115 : car.shp28MistakeKind === 'snap' ? 82 : 38;
      car.vx += point.nx * side * strength * pulse * dt;
      car.vy += point.ny * side * strength * pulse * dt;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const rx = -fy;
      const ry = fx;
      car.forwardSpeed = car.vx * fx + car.vy * fy;
      car.lateralSpeed = car.vx * rx + car.vy * ry;
    }
  }

  const speed = Math.abs(car.forwardSpeed || 0);
  const ratio = clamp(speed / MAX_SPEED, 0, 1);
  const highSpeedLoad = smoothstep(0.58, 1, ratio);
  if (highSpeedLoad <= 0) return;

  const steering = Math.abs(car.steerAngle || 0);
  const response = lerp(0.82, 0.54, highSpeedLoad);
  const yawLimit = Math.max(0.20, speed / CAR_WHEELBASE * Math.abs(Math.tan(steering)) * response + 0.12);
  car.yawRate = clamp(car.yawRate, -yawLimit, yawLimit);

  const microShake = Math.abs(car.lateralSpeed || 0) < 10 && steering < 0.035;
  if (microShake) car.yawRate *= Math.exp(-highSpeedLoad * 3.4 * dt);
};
