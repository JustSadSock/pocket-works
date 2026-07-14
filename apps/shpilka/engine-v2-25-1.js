// ШПИЛЬКА 2.5.1 — a genuinely competitive top difficulty without rubber-banding.

Object.assign(shpDifficulty.maniac, {
  pace: 1.135,
  aggression: 1.28,
  mistakes: 0.00035
});
shp25DifficultyErrorFactor.maniac = 0.24;

var shp251SkillFloor = {
  rook: 1.145,
  volt: 1.180,
  mara: 1.175,
  shunt: 1.190
};

var shp251ProfileFloor = {
  rook: { straight: 1.018, corner: 1.042, precision: 1.16, overtake: 1.06, aggression: 1.02 },
  volt: { straight: 1.080, corner: 1.015, precision: 1.07, overtake: 1.15, aggression: 1.12 },
  mara: { straight: 1.012, corner: 1.085, precision: 1.19, overtake: 1.08, aggression: 1.04 },
  shunt: { straight: 1.045, corner: 1.045, precision: 1.06, overtake: 1.34, aggression: 1.34 }
};

var shp251ArchetypePace = {
  speed: { straight: 1.018, corner: 1.000 },
  technical: { straight: 1.000, corner: 1.025 },
  mountain: { straight: 1.008, corner: 1.018 },
  cascade: { straight: 1.012, corner: 1.014 }
};

function shp251ManiacProfile(car) {
  const base = car.shp25Profile || shp25Profiles.rook;
  const floor = shp251ProfileFloor[car.id] || shp251ProfileFloor.rook;
  const archetype = shp251ArchetypePace[shpActiveArchetype?.id] || { straight: 1, corner: 1 };
  return {
    ...base,
    straight: Math.max(base.straight, floor.straight) * archetype.straight,
    corner: Math.max(base.corner, floor.corner) * archetype.corner,
    precision: Math.max(base.precision, floor.precision),
    aggression: Math.max(base.aggression, floor.aggression),
    overtake: Math.max(base.overtake, floor.overtake),
    errorRate: base.errorRate * 0.22,
    wander: Math.min(base.wander, 0.014),
    reaction: [0.008, 0.045]
  };
}

function shp251PlaceManiacGrid() {
  if (typeof shp24PlaceGridCar !== 'function' || cars.length < 5) return;
  const slots = [
    [292, -16],
    [66, -30],
    [118, 30],
    [170, -30],
    [222, 30]
  ];
  cars.forEach((car, index) => shp24PlaceGridCar(car, slots[index][0], slots[index][1]));
  player.shp251StartedLast = true;
  updateRaceOrder();
  updateHud();
}

var shp251BaseSetupRace = setupRace;
setupRace = function shp251SetupRace() {
  shp251BaseSetupRace();
  if (shpPrefs.difficulty !== 'maniac') return;

  cars.slice(1).forEach((car, index) => {
    car.shp25Profile = shp251ManiacProfile(car);
    const floor = shp251SkillFloor[car.id] || 1.15;
    car.skill = clamp(Math.max(car.skill, floor), 1.13, 1.205);
    car.aggression = clamp(Math.max(car.aggression, 1.16 + index * 0.035), 1.16, 1.42);
    car.shp25ReactionDelay = 0.008 + shp25Random(car) * 0.037;
    car.shp25MistakeCooldown = 12 + shp25Random(car) * 8;
  });

  shp251PlaceManiacGrid();
  startButton.textContent = 'НА СТАРТ · БЕЗУМЕЦ · P5';
};

var shp251BaseAiControls = aiControls;
aiControls = function shp251AiControls(car, dt) {
  const commands = shp251BaseAiControls(car, dt);
  if (shpPrefs.difficulty !== 'maniac' || !car || car.player) return commands;

  const bend = shp25UpcomingBend(car);
  const cornerLoad = clamp(bend.maximum / 0.00225, 0, 1);
  const onRoad = car.distanceFromRoad < roadHalf * 0.94;
  const makingMistake = Boolean(car.shp25MistakeKind);

  if (onRoad && !makingMistake) {
    commands.brake *= lerp(0.72, 0.89, cornerLoad);
    if (commands.brake < 0.065) commands.brake = 0;

    if (commands.brake < 0.16) {
      const throttleFloor = cornerLoad < 0.32 ? 0.96 : cornerLoad < 0.68 ? 0.62 : 0.30;
      commands.throttle = Math.max(commands.throttle, throttleFloor);
    }

    const steeringGain = lerp(1.065, 1.025, cornerLoad);
    commands.steer = clamp(commands.steer * steeringGain - car.yawRate * 0.012, -1, 1);
  }

  const ahead = findCarAhead(car);
  if (ahead && ahead.gap < 155 && cornerLoad < 0.40 && !makingMistake) {
    commands.throttle = Math.max(commands.throttle, 0.92);
    commands.brake *= 0.72;
  }

  return commands;
};

const shp251Subtitle = document.querySelector('.start-copy .subtitle');
if (shp251Subtitle) {
  shp251Subtitle.textContent = 'Два длинных круга, живые соперники и Безумец, который стартует впереди и не ждёт ошибок игрока.';
}
