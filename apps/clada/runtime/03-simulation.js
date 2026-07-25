function simulateStep() {
  state.step += 1;
  const births = [];

  for (const plant of state.plants) {
    plant.phase += .025;
    plant.energy = clamp(plant.energy + .0065 * plantGrowthFactor(plant), 0, 4.2);
    if (plant.energy < .12 && random() < .0015 * state.env.food) {
      plant.x = randomRange(.025, .975);
      plant.y = randomRange(.04, .96);
      plant.energy = .35;
    }
  }

  for (const organism of state.organisms) {
    if (organism.energy <= 0) continue;
    organism.age += 1;
    const genome = organism.genome;
    const localTemp = localTemperature(organism.y);
    const thermalMismatch = Math.abs(localTemp - genome.thermal);
    const senseRadius = (.045 + genome.vision * .065) ** 2;
    const { prey, preyDistance, threat } = findPreyAndThreat(organism, senseRadius);
    const plant = findNearestPlant(organism, senseRadius);

    if (threat && genome.diet < .78) steerAway(organism, threat, 1.25 + genome.vision * .3);
    if (genome.diet > .38 && prey) steerToward(organism, prey, .6 + genome.diet * .9);
    if (plant && genome.diet < .78) steerToward(organism, plant.target, .45 + (1 - genome.diet) * .75);

    const wander = .000012 * (1.4 - genome.vision * .3);
    organism.vx += Math.cos(organism.id * 2.13 + state.step * .021 + organism.y * 9) * wander;
    organism.vy += Math.sin(organism.id * 1.71 + state.step * .018 + organism.x * 11) * wander;

    const maxVelocity = .00042 + genome.speed * .00055;
    const velocity = Math.hypot(organism.vx, organism.vy) || 1;
    if (velocity > maxVelocity) {
      organism.vx = organism.vx / velocity * maxVelocity;
      organism.vy = organism.vy / velocity * maxVelocity;
    }
    organism.vx *= .985;
    organism.vy *= .985;
    organism.x += organism.vx;
    organism.y += organism.vy;

    if (organism.x < .018 || organism.x > .982) {
      organism.x = clamp(organism.x, .018, .982);
      organism.vx *= -1.4;
    }
    if (organism.y < .03 || organism.y > .97) {
      organism.y = clamp(organism.y, .03, .97);
      organism.vy *= -1.4;
    }

    if (plant && plant.distance < (.008 + genome.size * .004) ** 2 && genome.diet < .8 && plant.target.energy > .2) {
      const bite = Math.min(plant.target.energy, .14 + genome.size * .18);
      plant.target.energy -= bite;
      organism.energy += bite * (1.35 - genome.diet * .75);
      organism.lastMeal = state.step;
    }

    if (prey && preyDistance < (.007 + genome.size * .005) ** 2 && genome.diet > .42) {
      const damage = (.055 + genome.size * .09) * genome.diet * (1.1 - prey.genome.armor * .55);
      prey.energy -= damage;
      organism.energy += damage * .72;
      organism.lastMeal = state.step;
      if (prey.energy <= 0) prey.cause = 'хищничество';
    }

    const movementCost = (.005 + genome.speed ** 2 * .0035) * genome.metabolism;
    const climateCost = thermalMismatch ** 1.45 * .026 * (1.18 - genome.armor * .25);
    organism.energy -= movementCost + climateCost + applyShockCost(organism);

    const maxAge = 1750 + (1.4 - genome.metabolism) * 720 + genome.armor * 220;
    if (organism.age > maxAge) {
      organism.energy -= .08;
      organism.cause ||= 'старение';
    }
    if (organism.energy <= 0) organism.cause ||= thermalMismatch > .32 ? 'климат' : 'голод';

    const reproductionThreshold = 9.1 + genome.size * 3.6 + genome.armor * 1.5;
    const fertilityChance = .00135 * genome.fertility * clamp(1 - thermalMismatch * 1.5, .12, 1);
    if (organism.energy > reproductionThreshold && organism.age > 190 && random() < fertilityChance) births.push(organism);
  }

  births.slice(0, Math.max(0, MAX_ORGANISMS - state.organisms.length)).forEach(reproduce);
  const dead = state.organisms.filter((organism) => organism.energy <= 0);
  if (dead.length) {
    state.lastDeathCause = dead[dead.length - 1].cause || 'неизвестно';
    for (const organism of dead) {
      if (random() < .42 && state.plants.length < 150) state.plants.push({ x: organism.x, y: organism.y, energy: 1.2, phase: randomRange(0, TAU), kind: 2 });
    }
    state.organisms = state.organisms.filter((organism) => organism.energy > 0);
    if (state.selectedId && !state.organisms.some((organism) => organism.id === state.selectedId)) clearSelection();
  }

  if (state.shock) {
    state.shock.remaining -= 1;
    state.shock.strength = clamp(state.shock.remaining / state.shock.total, 0, 1);
    if (state.shock.remaining <= 0) {
      state.events.push({ generation: state.generation, type: 'recovery', text: 'Среда стабилизировалась' });
      state.shock = null;
      showToast('Среда стабилизировалась');
    }
  }

  if (state.step % 22 === 0) updateReadouts();

  if (state.step % GENERATION_STEPS === 0) {
    state.generation += 1;
    finalizeGeneration();
  }
}

function finalizeGeneration() {
  const counts = new Map();
  for (const organism of state.organisms) counts.set(organism.speciesId, (counts.get(organism.speciesId) || 0) + 1);
  for (const species of state.species) {
    const count = counts.get(species.id) || 0;
    if (count > 0) {
      species.lastSeen = state.generation;
      species.peak = Math.max(species.peak, count);
      species.extinct = null;
      species.cause = null;
    } else if (species.extinct === null && species.born < state.generation) {
      species.extinct = state.generation;
      species.cause = state.lastDeathCause || (state.shock ? shockLabel(state.shock.type) : 'конкуренция');
      state.events.push({ generation: state.generation, type: 'extinction', speciesId: species.id, text: `Исчез ${species.common}` });
      chord('extinct');
    }
  }
  recordHistory(false);
  updateTimeline();
  updateReadouts();
  saveState();
}

function snapshotOrganism(organism) {
  return {
    id: organism.id, x: organism.x, y: organism.y, vx: organism.vx, vy: organism.vy,
    energy: organism.energy, age: organism.age, generation: organism.generation,
    speciesId: organism.speciesId, genome: deepClone(organism.genome)
  };
}

function recordHistory(force = false) {
  const last = state.history.at(-1);
  if (!force && last?.generation === state.generation) return;
  const counts = {};
  for (const organism of state.organisms) counts[organism.speciesId] = (counts[organism.speciesId] || 0) + 1;
  state.history.push({
    generation: state.generation,
    env: deepClone(state.env),
    population: state.organisms.length,
    counts,
    organisms: state.organisms.slice(0, 180).map(snapshotOrganism),
    event: state.events.at(-1)?.generation === state.generation ? deepClone(state.events.at(-1)) : null
  });
  if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
  state.fossilIndex = null;
}

function saveState() {
  if (!state) return;
  try {
    const payload = deepClone(state);
    payload.paused = false;
    payload.view = 'world';
    payload.fossilIndex = null;
    payload.selectedId = null;
    payload.selectedSpeciesId = null;
    payload.seedMode = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('КЛАДА: не удалось сохранить мир', error);
  }
}

function validateImported(payload) {
  return payload && payload.version === VERSION && Array.isArray(payload.organisms) && Array.isArray(payload.species) && Array.isArray(payload.history) && payload.env && Number.isFinite(payload.generation);
}

function loadState() {
  try {
    const payload = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!validateImported(payload)) return false;
    state = payload;
    state.paused = false;
    state.view = 'world';
    state.fossilIndex = null;
    state.selectedId = null;
    state.selectedSpeciesId = null;
    state.seedMode = false;
    state.lens = Boolean(state.lens);
    state.shock ||= null;
    state.events ||= [];
    state.plants ||= createPlants(100);
    state.nextOrganismId ||= Math.max(0, ...state.organisms.map((entry) => entry.id || 0)) + 1;
    state.nextSpeciesId ||= Math.max(0, ...state.species.map((entry) => entry.id || 0)) + 1;
    syncAllUI();
    return true;
  } catch (error) {
    console.warn('КЛАДА: повреждённое сохранение отброшено', error);
    return false;
  }
}

function shockLabel(type) {
  return ({ meteor: 'метеоритный удар', ice: 'оледенение', drought: 'засуха', red: 'красный прилив' })[type] || 'катаклизм';
}

function applyCataclysm(type) {
  exitFossil();
  const duration = type === 'meteor' ? GENERATION_STEPS * 3 : GENERATION_STEPS * 5;
  state.shock = {
    type,
    total: duration,
    remaining: duration,
    strength: 1,
    x: randomRange(.22, .78),
    y: randomRange(.2, .8)
  };
  if (type === 'meteor') {
    for (const organism of state.organisms) {
      const d = Math.sqrt(distanceSq(organism.x, organism.y, state.shock.x, state.shock.y));
      if (d < .22 && random() < .92 - d * 2.5) {
        organism.energy = -1;
        organism.cause = 'метеоритный удар';
      }
    }
    for (const plant of state.plants) if (distanceSq(plant.x, plant.y, state.shock.x, state.shock.y) < .08) plant.energy *= .08;
  }
  if (type === 'drought') {
    state.env.food = clamp(state.env.food * .48, .04, 1);
    state.plants.forEach((plant) => { plant.energy *= .42; });
  }
  if (type === 'red') state.env.mutation = clamp(state.env.mutation + .12);
  state.events.push({ generation: state.generation, type: 'shock', shock: type, text: shockLabel(type) });
  state.events = state.events.slice(-80);
  closeSheet();
  syncPressureUI();
  chord('shock');
  pulse([30, 30, 45]);
  showToast(`${shockLabel(type)}: отбор ускорен`, 2800);
}

