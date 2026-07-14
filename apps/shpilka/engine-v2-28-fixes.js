// ШПИЛЬКА 2.8 — final high-speed stability clamp.
var shp28FixBaseUpdateCar = updateCar;
updateCar = function shp28StableHighSpeedUpdateCar(car, dt) {
  shp28FixBaseUpdateCar(car, dt);
  if (!car || car.airborne) return;
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
