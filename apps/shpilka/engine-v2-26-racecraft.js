// ШПИЛЬКА 2.6 — deliberate overtakes, one-move defense and the unlockable Pilot level.

shpDifficulty.pilot = { label: 'ПИЛОТ', pace: 1.20, aggression: 1.36, mistakes: 0 };
shp25DifficultyErrorFactor.pilot = 0;

var shp26PilotButton = null;
var shp26PilotFloors = {
  rook: { skill: 1.190, straight: 1.040, corner: 1.074, precision: 1.22, overtake: 1.12, aggression: 1.08 },
  volt: { skill: 1.210, straight: 1.092, corner: 1.052, precision: 1.16, overtake: 1.22, aggression: 1.18 },
  mara: { skill: 1.208, straight: 1.038, corner: 1.104, precision: 1.25, overtake: 1.15, aggression: 1.10 },
  shunt: { skill: 1.215, straight: 1.065, corner: 1.076, precision: 1.15, overtake: 1.40, aggression: 1.40 }
};

function shp26EnsurePilotOption() {
  if (!shp26Career?.pilotUnlocked) return;
  if (shp26PilotButton) {
    shp26PilotButton.hidden = false;
    return;
  }
  const buttons = Array.from(document.querySelectorAll('[data-difficulty]'));
  const anchor = buttons[buttons.length - 1];
  if (!anchor) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.difficulty = 'pilot';
  button.textContent = 'ПИЛОТ';
  button.className = 'pilot-option';
  button.addEventListener('click', () => {
    shpPrefs.difficulty = 'pilot';
    shpSavePrefs();
    shpUpdateOptionButtons();
    updateRouteUi();
    setupRace();
  });
  anchor.after(button);
  shp26PilotButton = button;

  try {
    const stored = JSON.parse(localStorage.getItem(shpPrefsKey) || '{}');
    if (stored.difficulty === 'pilot') shpPrefs.difficulty = 'pilot';
  } catch { /* optional storage */ }
  shpUpdateOptionButtons();
}

function shp26PilotProfile(car) {
  const base = car.shp25Profile || shp25Profiles.rook;
  const floor = shp26PilotFloors[car.id] || shp26PilotFloors.rook;
  const archetype = shp251ArchetypePace[shpActiveArchetype?.id] || { straight: 1, corner: 1 };
  return {
    ...base,
    straight: Math.max(base.straight, floor.straight) * archetype.straight,
    corner: Math.max(base.corner, floor.corner) * archetype.corner,
    precision: Math.max(base.precision, floor.precision),
    aggression: Math.max(base.aggression, floor.aggression),
    overtake: Math.max(base.overtake, floor.overtake),
    errorRate: 0,
    wander: Math.min(base.wander, 0.008),
    reaction: [0, 0.012]
  };
}

function shp26WrappedGap(a, b) {
  let gap = (b.raceScore || 0) - (a.raceScore || 0);
  const length = Math.max(1, track.totalLength || 1);
  while (gap > length * 0.5) gap -= length;
  while (gap < -length * 0.5) gap += length;
  return gap;
}

function shp26FindCarBehind(car) {
  let best = null;
  let bestGap = Infinity;
  for (const other of cars) {
    if (other === car || other.finishTime != null) continue;
    const signed = shp26WrappedGap(other, car);
    if (signed > 0 && signed < bestGap) {
      bestGap = signed;
      best = other;
    }
  }
  return best ? { car: best, gap: bestGap } : null;
}

function shp26SideClear(car, side, distance = 116) {
  const targetOffset = side * roadHalf * 0.52;
  for (const other of cars) {
    if (other === car || other.finishTime != null) continue;
    const gap = Math.abs(shp26WrappedGap(car, other));
    if (gap > distance) continue;
    if (Math.abs((other.signedRoadOffset || 0) - targetOffset) < 34) return false;
  }
  return true;
}

function shp26ChooseAttackSide(car, ahead, bend) {
  let side;
  if (bend.maximum > 0.00072 && ahead.gap < 164) side = Math.sign(bend.signed) || 1;
  else side = (ahead.car.signedRoadOffset || 0) > 0 ? -1 : 1;
  if (!shp26SideClear(car, side)) side *= -1;
  if (!shp26SideClear(car, side)) return 0;
  return side;
}

function shp26SetTactic(car, kind, side, duration) {
  car.shp26Tactic = kind;
  car.shp26TacticSide = side;
  car.shp26TacticTimer = duration;
  car.shp26TacticTotal = duration;
  car.shp26TacticCommitted = true;
}

function shp26UpdateRacecraft(car, dt) {
  if (!car || car.player) return;
  car.shp26TacticTimer = Math.max(0, (car.shp26TacticTimer || 0) - dt);
  car.shp26DefenseCooldown = Math.max(0, (car.shp26DefenseCooldown || 0) - dt);
  car.shp26SwitchCooldown = Math.max(0, (car.shp26SwitchCooldown || 0) - dt);
  if (car.shp26TacticTimer <= 0) {
    car.shp26Tactic = 'line';
    car.shp26TacticSide = 0;
    car.shp26TacticCommitted = false;
  }

  const bend = shp25UpcomingBend(car);
  const ahead = findCarAhead(car);
  const behind = shp26FindCarBehind(car);
  const speed = Math.abs(car.forwardSpeed || 0);
  const rivalDefendingPlayer = car.id === shp26RivalId() && behind?.car?.player;
  const defenseRange = rivalDefendingPlayer ? 225 : 168;
  const canDefend = behind && behind.gap < defenseRange && speed > 180 && car.shp26DefenseCooldown <= 0;
  const canAttack = ahead && ahead.gap < 235 && speed > 165;

  if ((car.shp26Tactic === 'line' || !car.shp26Tactic) && canDefend && bend.maximum > 0.00052) {
    const inside = Math.sign(bend.signed) || ((behind.car.signedRoadOffset || 0) > 0 ? 1 : -1);
    if (shp26SideClear(car, inside, 86)) {
      shp26SetTactic(car, 'defend', inside, rivalDefendingPlayer ? 1.75 : 1.28);
      car.shp26DefenseCooldown = rivalDefendingPlayer ? 2.0 : 2.8;
    }
  }

  if ((car.shp26Tactic === 'line' || !car.shp26Tactic) && canAttack) {
    const side = shp26ChooseAttackSide(car, ahead, bend);
    if (side) shp26SetTactic(car, 'attack', side, bend.maximum > 0.00072 ? 1.55 : 2.15);
    else {
      car.shp26Tactic = 'blocked';
      car.shp26TacticTimer = 0.42;
      car.shp26TacticTotal = 0.42;
    }
  }

  if (car.shp26Tactic === 'attack' && ahead) {
    const lateralGap = Math.abs((ahead.car.signedRoadOffset || 0) - (car.signedRoadOffset || 0));
    const elapsed = 1 - car.shp26TacticTimer / Math.max(0.001, car.shp26TacticTotal || 1);
    if (ahead.gap < 58 && lateralGap < 30 && !shp26SideClear(car, car.shp26TacticSide, 72)) {
      car.shp26Tactic = 'blocked';
      car.shp26TacticTimer = 0.34;
    } else if (elapsed > 0.58 && ahead.gap < 88 && bend.maximum > 0.00078 && car.shp26SwitchCooldown <= 0) {
      const switchSide = -car.shp26TacticSide;
      if (shp26SideClear(car, switchSide, 82)) {
        shp26SetTactic(car, 'switchback', switchSide, 0.92);
        car.shp26SwitchCooldown = 2.1;
      }
    }
  }

  if (car.shp26Tactic === 'attack' || car.shp26Tactic === 'switchback' || car.shp26Tactic === 'defend') {
    car.overtakeSide = car.shp26TacticSide;
    car.overtakeTimer = Math.max(car.overtakeTimer || 0, car.shp26TacticTimer);
  }
}

function shp26ApplyTacticSteering(car, commands) {
  if (!car.shp26TacticSide || !['attack', 'switchback', 'defend'].includes(car.shp26Tactic)) return commands;
  const lookAhead = Math.round(22 + Math.abs(car.forwardSpeed || 0) / 24);
  const target = track[(car.trackIndex + lookAhead) % track.length];
  if (!target) return commands;
  const factor = car.shp26Tactic === 'defend' ? 0.42 : car.shp26Tactic === 'switchback' ? 0.58 : 0.54;
  const targetOffset = car.shp26TacticSide * roadHalf * factor;
  const targetX = target.x + target.nx * targetOffset;
  const targetY = target.y + target.ny * targetOffset;
  const correction = wrapAngle(Math.atan2(targetY - car.y, targetX - car.x) - car.angle);
  commands.steer = clamp(commands.steer + correction * (car.shp26Tactic === 'defend' ? 0.18 : 0.24), -1, 1);
  return commands;
}

function shp26ApplyPilotCommands(car, commands) {
  if (shpPrefs.difficulty !== 'pilot' || !car || car.player) return commands;
  const bend = shp25UpcomingBend(car);
  const cornerLoad = clamp(bend.maximum / 0.0023, 0, 1);
  const onRoad = car.distanceFromRoad < roadHalf * 0.96;
  if (onRoad) {
    commands.brake *= lerp(0.64, 0.84, cornerLoad);
    if (commands.brake < 0.052) commands.brake = 0;
    if (commands.brake < 0.15) {
      const floor = cornerLoad < 0.30 ? 0.99 : cornerLoad < 0.68 ? 0.70 : 0.38;
      commands.throttle = Math.max(commands.throttle, floor);
    }
    commands.steer = clamp(commands.steer * lerp(1.075, 1.035, cornerLoad) - car.yawRate * 0.014, -1, 1);
  }
  return commands;
}

var shp26BaseSetupRace = setupRace;
setupRace = function shp26SetupRace() {
  shp26BaseSetupRace();
  const pilot = shpPrefs.difficulty === 'pilot';

  cars.slice(1).forEach((car, index) => {
    car.shp26Tactic = 'line';
    car.shp26TacticSide = 0;
    car.shp26TacticTimer = 0;
    car.shp26TacticTotal = 0;
    car.shp26DefenseCooldown = 0.6 + index * 0.18;
    car.shp26SwitchCooldown = 0;
    car.shp26TacticCommitted = false;

    if (pilot) {
      const floor = shp26PilotFloors[car.id] || shp26PilotFloors.rook;
      car.shp25Profile = shp26PilotProfile(car);
      car.skill = clamp(Math.max(car.skill, floor.skill), 1.18, 1.225);
      car.aggression = clamp(Math.max(car.aggression, floor.aggression), 1.08, 1.46);
      car.shp25ReactionDelay = shp25Random(car) * 0.012;
      car.shp25MistakeKind = null;
      car.shp25MistakeTimer = 0;
      car.shp25MistakeCooldown = 9999;
    }
  });

  if (pilot) {
    if (typeof shp251PlaceManiacGrid === 'function') shp251PlaceManiacGrid();
    startButton.textContent = 'НА СТАРТ · ПИЛОТ · P5';
  }
};

var shp26BaseAiControls = aiControls;
aiControls = function shp26AiControls(car, dt) {
  shp26UpdateRacecraft(car, dt);
  let commands = shp26BaseAiControls(car, dt);
  commands = shp26ApplyTacticSteering(car, commands);

  if (car?.shp26Tactic === 'blocked') {
    const ahead = findCarAhead(car);
    if (ahead && ahead.gap < 64) {
      commands.throttle = Math.min(commands.throttle, 0.66);
      commands.brake = Math.max(commands.brake, clamp((64 - ahead.gap) / 95, 0.08, 0.34));
    }
  }

  commands = shp26ApplyPilotCommands(car, commands);
  return commands;
};

shp26EnsurePilotOption();
