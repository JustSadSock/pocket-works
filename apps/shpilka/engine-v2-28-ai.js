// ШПИЛЬКА 2.8 — rare contextual mistakes and route-aware pace.
var shp28MistakeRates = { rookie: 0.042, racer: 0.025, maniac: 0.015, pilot: 0.010 };
Object.assign(shp27DifficultyTune.rookie, { brake: 390 });
Object.assign(shp27DifficultyTune.racer, { brake: 425 });
Object.assign(shp27DifficultyTune.maniac, { brake: 450 });
Object.assign(shp27DifficultyTune.pilot, { brake: 465 });

shp27UpdateMildError = function shp28UpdateMildError(car, dt, tune, preview) {
  car.shp27ErrorTimer = Math.max(0, (car.shp27ErrorTimer || 0) - dt);
  car.shp27ErrorCooldown = Math.max(0, (car.shp27ErrorCooldown || 0) - dt);
  if (car.shp27ErrorTimer <= 0 && car.shp28MistakeKind) {
    car.shp28MistakeKind = null;
    car.shp27ErrorCooldown = lerp(8.5, 17, shp25Random(car));
  }
  if (car.shp27ErrorTimer > 0 || car.shp27ErrorCooldown > 0 || raceElapsed < 4) return;

  const difficulty = shpPrefs.difficulty in shp28MistakeRates ? shpPrefs.difficulty : 'racer';
  const rate = shp28MistakeRates[difficulty];
  const section = shp28SectionAtCar(car);
  const useful = preview.maximum > 0.00062 || section?.grip < 0.92;
  if (!useful || shp25Random(car) >= dt * rate) return;

  const roll = shp25Random(car);
  car.shp28MistakeKind = roll < 0.38 ? 'late' : roll < 0.76 ? 'wide' : 'snap';
  car.shp28MistakeTotal = car.shp28MistakeKind === 'late'
    ? lerp(0.70, 1.05, shp25Random(car))
    : lerp(0.48, 0.82, shp25Random(car));
  car.shp27ErrorTimer = car.shp28MistakeTotal;
  car.shp27ErrorSide = car.shp28MistakeKind === 'wide'
    ? -(Math.sign(preview.signed) || (shp25Random(car) > 0.5 ? 1 : -1))
    : (shp25Random(car) > 0.5 ? 1 : -1);
};

var shp28BaseAiControls = aiControls;
aiControls = function shp28AiControls(car, dt) {
  const controls = shp28BaseAiControls(car, dt);
  const section = shp28SectionAtCar(car);
  const phase = car.shp27ErrorTimer > 0
    ? 1 - car.shp27ErrorTimer / Math.max(0.001, car.shp28MistakeTotal || car.shp27ErrorTimer)
    : 0;

  if (car.shp28MistakeKind === 'late') {
    if (phase < 0.46) {
      controls.brake = Math.min(controls.brake, 0.05);
      controls.throttle = Math.max(controls.throttle, 0.72);
    } else {
      controls.brake = Math.max(controls.brake, 0.64);
      controls.throttle = Math.min(controls.throttle, 0.16);
      controls.steer *= 0.80;
    }
  } else if (car.shp28MistakeKind === 'wide') {
    controls.steer *= lerp(0.90, 0.64, Math.sin(phase * Math.PI));
    controls.throttle = Math.min(controls.throttle, 0.76);
  } else if (car.shp28MistakeKind === 'snap') {
    controls.steer = clamp(controls.steer + car.shp27ErrorSide * Math.sin(phase * Math.PI) * 0.24, -1, 1);
    controls.throttle = Math.min(controls.throttle, 0.52);
  }

  if (section?.grip < 0.9) controls.throttle = Math.min(controls.throttle, 0.84);
  if (shp28Jump) {
    const gap = shp28ForwardDistance(track[car.trackIndex]?.distance || 0, shp28Jump.startDistance);
    if (gap < 520 && gap > 0) {
      controls.throttle = Math.max(controls.throttle, 0.92);
      controls.brake = Math.min(controls.brake, 0.02);
    }
  }
  return controls;
};

var shp28BaseTargetSpeed = shp27TargetSpeed;
shp27TargetSpeed = function shp28TargetSpeed(car, profile, tune, preview, ahead) {
  let speed = shp28BaseTargetSpeed(car, profile, tune, preview, ahead);
  const section = shp28SectionAtCar(car);
  if (section?.kind === 'hairpin' || section?.kind === 'switchback') speed *= 0.94;
  if (section?.kind === 'chicane' || section?.kind === 'narrow') speed *= 0.96;
  if (section?.grip < 0.9) speed *= lerp(0.88, 0.96, section.grip / 0.9);
  if (section?.kind === 'straight' || section?.kind === 'descent') speed *= 1.015;
  if (shp28Jump) {
    const distance = track[car.trackIndex]?.distance || 0;
    const gap = shp28ForwardDistance(distance, shp28Jump.startDistance);
    if (gap < 560 && gap > 0) speed = Math.max(speed, 565);
  }
  return clamp(speed, 155, MAX_SPEED * 1.01);
};

var shp28BaseSetupRaceAi = setupRace;
setupRace = function shp28SetupRaceAi() {
  shp28BaseSetupRaceAi();
  for (const car of cars) {
    car.shp28MistakeKind = null;
    car.shp28MistakeTotal = 0;
    car.shp28GapTimer = 0;
    car.shp27ErrorCooldown = car.player ? 0 : 4 + cars.indexOf(car) * 0.8;
  }
};