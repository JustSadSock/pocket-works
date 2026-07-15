// ШПИЛЬКА 2.8 — final weight, racing envelope, mistake motion and route variety.
Object.assign(shp27DifficultyTune.rookie, { brake: 292 });
Object.assign(shp27DifficultyTune.racer, { brake: 315 });
Object.assign(shp27DifficultyTune.maniac, { brake: 338 });
Object.assign(shp27DifficultyTune.pilot, { brake: 352 });

var shp28FixBaseModulePlan = shp28ModulePlan;
shp28ModulePlan = function shp28VariedModulePlan() {
  const type = shpActiveArchetype?.id || 'speed';
  const additions = {
    technical: [
      ['narrow', 'medium', 'ТЕСНИНА', 700, 0.74, 0.93, 0],
      ['compression', 'straight', 'ПЕРЕЛОМ', 620, 0.90, 0.86, 0],
      ['switchback', 'tight', 'ДВОЙНАЯ ШПИЛЬКА', 780, 0.86, 0.94, 0],
      ['service', 'straight', 'КОРОТКИЙ РАЗГОН', 720, 1.08, 0.98, 0]
    ],
    mountain: [
      ['gravel', 'medium', 'ОСЫПЬ', 620, 0.92, 0.76, 0.24],
      ['hairpin', 'tight', 'КАРМАН', 600, 0.82, 0.95, 0],
      ['sweeper', 'medium', 'СКЛОН', 900, 1.10, 0.96, 0],
      ['compression', 'straight', 'ЛОЖБИНА', 650, 0.94, 0.86, 0]
    ],
    cascade: [
      ['gravel', 'medium', 'СУХОЙ СЛИВ', 600, 0.90, 0.74, 0.28],
      ['narrow', 'straight', 'ШЛЮЗ', 720, 0.74, 0.90, 0],
      ['sweeper', 'medium', 'ВОДОСБРОС', 900, 1.12, 0.95, 0],
      ['braking', 'tight', 'НИЖНИЙ ПОВОРОТ', 620, 0.88, 0.96, 0]
    ],
    speed: [
      ['plaza', 'medium', 'АЭРОДРОМ', 820, 1.34, 1, 0],
      ['chicane', 'straight', 'БЫСТРАЯ ШИКАНА', 640, 0.84, 0.95, 0],
      ['gravel', 'medium', 'ПЫЛЬНЫЙ СРЕЗ', 560, 0.96, 0.80, 0.18],
      ['narrow', 'straight', 'КОРИДОР', 720, 0.80, 0.96, 0]
    ]
  };
  const pool = [...shp28FixBaseModulePlan(), ...(additions[type] || additions.speed)];
  const random = mulberry32(hashSeed(trackSeed ^ 0x28f13e7));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [pool[index], pool[other]] = [pool[other], pool[index]];
  }
  const selected = [];
  const usedKinds = new Set();
  for (const module of pool) {
    if (usedKinds.has(module[0])) continue;
    selected.push(module);
    usedKinds.add(module[0]);
    if (selected.length === 4) break;
  }
  return selected;
};

var shp28FixBaseAiControls = aiControls;
aiControls = function shp28WiderRacingEnvelope(car, dt) {
  const physicalHalf = roadHalf;
  roadHalf = physicalHalf * 1.28;
  try {
    return shp28FixBaseAiControls(car, dt);
  } finally {
    roadHalf = physicalHalf;
  }
};

var shp28FixBaseUpdateCar = updateCar;
updateCar = function shp28StableHighSpeedUpdateCar(car, dt) {
  const beforeAngle = car?.angle || 0;
  const beforeForward = (car?.vx || 0) * Math.cos(beforeAngle) + (car?.vy || 0) * Math.sin(beforeAngle);
  shp28FixBaseUpdateCar(car, dt);
  if (!car || car.airborne) return;

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  let forward = car.vx * fx + car.vy * fy;
  let lateral = car.vx * rx + car.vy * ry;
  const speedRatio = clamp(Math.abs(forward) / MAX_SPEED, 0, 1);
  const freeOfImpact = (car.collisionCooldown || 0) <= 0.02;

  if (freeOfImpact && forward > beforeForward) {
    const skillFactor = car.player ? 1 : clamp(1 + ((car.skill || 1) - 1) * 0.25, 0.97, 1.05);
    const maximumAcceleration = lerp(145, 62, smoothstep(0.06, 1, speedRatio)) * skillFactor;
    forward = Math.min(forward, beforeForward + maximumAcceleration * dt);
  }
  if (freeOfImpact && beforeForward > 0 && forward < beforeForward && (car.brakeInput || 0) > 0.05) {
    const maximumBraking = lerp(450, 330, smoothstep(0.18, 1, speedRatio));
    forward = Math.max(forward, Math.max(0, beforeForward - maximumBraking * dt));
  }

  if (!car.player && car.shp27ErrorTimer > 0 && car.shp28MistakeKind) {
    const point = track[car.trackIndex];
    if (point) {
      const phase = 1 - car.shp27ErrorTimer / Math.max(0.001, car.shp28MistakeTotal || car.shp27ErrorTimer);
      const pulse = Math.sin(clamp(phase, 0, 1) * Math.PI);
      const side = car.shp27ErrorSide || 1;
      const strength = car.shp28MistakeKind === 'wide' ? 165 : car.shp28MistakeKind === 'snap' ? 95 : 42;
      car.vx += point.nx * side * strength * pulse * dt;
      car.vy += point.ny * side * strength * pulse * dt;
      forward = car.vx * fx + car.vy * fy;
      lateral = car.vx * rx + car.vy * ry;
    }
  }

  const highSpeedLoad = smoothstep(0.58, 1, clamp(Math.abs(forward) / MAX_SPEED, 0, 1));
  if (highSpeedLoad > 0) {
    const steering = Math.abs(car.steerAngle || 0);
    const response = lerp(0.82, 0.54, highSpeedLoad);
    const yawLimit = Math.max(0.20, Math.abs(forward) / CAR_WHEELBASE * Math.abs(Math.tan(steering)) * response + 0.12);
    car.yawRate = clamp(car.yawRate, -yawLimit, yawLimit);
    const microShake = Math.abs(lateral) < 10 && steering < 0.035;
    if (microShake) car.yawRate *= Math.exp(-highSpeedLoad * 3.4 * dt);
  }

  car.vx = fx * forward + rx * lateral;
  car.vy = fy * forward + ry * lateral;
  car.forwardSpeed = forward;
  car.lateralSpeed = lateral;
};