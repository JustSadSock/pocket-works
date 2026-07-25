function speciesNames(id, genome) {
  const a = genus[id % genus.length];
  const bIndex = Math.floor((genome.diet * 4 + genome.thermal * 3 + genome.speed * 2 + id) * 2) % epithet.length;
  const common = commonRoots[Math.floor((genome.hue / 360 * 7 + genome.size * 3 + id) * 2) % commonRoots.length];
  return { scientific: `${a} ${epithet[bIndex]}`, common };
}

function newSpecies(genome, parentId = null) {
  const id = state.nextSpeciesId++;
  const names = speciesNames(id, genome);
  const species = {
    id,
    parentId,
    born: state.generation,
    extinct: null,
    name: names.scientific,
    common: names.common,
    hue: genome.hue,
    diet: genome.diet,
    centroid: deepClone(genome),
    peak: 1,
    lastSeen: state.generation,
    cause: null
  };
  state.species.push(species);
  if (parentId !== null && state.generation > 0) {
    state.events.push({ generation: state.generation, type: 'speciation', speciesId: id, text: `Возник ${species.common}` });
    state.events = state.events.slice(-80);
    chord('birth');
    showToast(`Новая ветвь: ${species.common}`);
  }
  return id;
}

function makeOrganism({ x = random(), y = random(), genome = null, speciesId = null, generation = 0, energy = null, parentId = null } = {}) {
  const finalGenome = genome || makeGenome();
  const finalSpecies = speciesId ?? newSpecies(finalGenome, null);
  return {
    id: state.nextOrganismId++,
    parentId,
    x: clamp(x, .02, .98), y: clamp(y, .03, .97),
    vx: randomRange(-.0003, .0003), vy: randomRange(-.0003, .0003),
    energy: energy ?? randomRange(7, 11),
    age: randomRange(0, 180),
    generation,
    speciesId: finalSpecies,
    genome: finalGenome,
    lastMeal: 0,
    cause: null
  };
}

function createPlants(count = 100) {
  return Array.from({ length: count }, () => ({
    x: randomRange(.025, .975), y: randomRange(.04, .96),
    energy: randomRange(.5, 3.2), phase: randomRange(0, TAU), kind: Math.floor(random() * 3)
  }));
}

function baseState(seed = 'garden') {
  const seedCode = [...seed].reduce((sum, char) => hashNumber(sum + char.charCodeAt(0)), 168973);
  return {
    version: VERSION,
    seed,
    rng: seedCode,
    generation: 0,
    step: 0,
    paused: false,
    speedIndex: 0,
    view: 'world',
    fossilIndex: null,
    selectedId: null,
    selectedSpeciesId: null,
    seedMode: false,
    lens: false,
    nextOrganismId: 1,
    nextSpeciesId: 1,
    env: { temperature: .52, food: .62, mutation: .24 },
    organisms: [],
    plants: [],
    species: [],
    history: [],
    events: [],
    shock: null,
    lastDeathCause: null
  };
}

function buildWorld(seed = 'garden') {
  state = baseState(seed);
  if (seed === 'rift') state.env = { temperature: .24, food: .42, mutation: .33 };
  if (seed === 'red') state.env = { temperature: .68, food: .55, mutation: .3 };
  state.plants = createPlants(seed === 'garden' ? 125 : seed === 'rift' ? 92 : 110);

  const founderGenome = makeGenome();
  if (seed === 'rift') {
    founderGenome.thermal = .28;
    founderGenome.armor = .32;
    founderGenome.metabolism = .72;
  }
  if (seed === 'red') {
    founderGenome.thermal = .66;
    founderGenome.speed = 1.08;
    founderGenome.hue = 96;
  }
  const founderSpecies = newSpecies(founderGenome, null);
  const count = seed === 'garden' ? 46 : 38;
  for (let index = 0; index < count; index += 1) {
    const genome = makeGenome(founderGenome, .09);
    state.organisms.push(makeOrganism({ genome, speciesId: founderSpecies, generation: 0, x: randomRange(.12, .88), y: randomRange(.12, .88) }));
  }
  if (seed === 'red') {
    const predatorGenome = makeGenome({ ...founderGenome, diet: .82, speed: 1.18, size: 1.12, armor: .18, hue: 18 }, .05);
    const predatorSpecies = newSpecies(predatorGenome, founderSpecies);
    for (let index = 0; index < 7; index += 1) {
      state.organisms.push(makeOrganism({ genome: makeGenome(predatorGenome, .07), speciesId: predatorSpecies, energy: 12, x: randomRange(.2, .8), y: randomRange(.2, .8) }));
    }
  }
  recordHistory(true);
  syncAllUI();
  saveState();
}

function localTemperature(y) {
  let value = state.env.temperature + (y - .5) * .22;
  if (state.shock?.type === 'ice') value -= .28 * state.shock.strength;
  if (state.shock?.type === 'meteor') value -= .08 * state.shock.strength;
  return clamp(value);
}

function plantGrowthFactor(plant) {
  const climate = 1 - Math.abs(localTemperature(plant.y) - .56) * 1.45;
  let factor = state.env.food * clamp(climate, .08, 1);
  if (state.shock?.type === 'drought') factor *= .24;
  if (state.shock?.type === 'red') factor *= .78;
  return factor;
}

function findNearestPlant(organism, radiusSq) {
  let best = null;
  let bestDistance = radiusSq;
  for (const plant of state.plants) {
    if (plant.energy < .35) continue;
    const d = distanceSq(organism.x, organism.y, plant.x, plant.y);
    if (d < bestDistance) {
      best = plant;
      bestDistance = d;
    }
  }
  return best ? { target: best, distance: bestDistance } : null;
}

function findPreyAndThreat(organism, radiusSq) {
  let prey = null;
  let preyDistance = radiusSq;
  let threat = null;
  let threatDistance = radiusSq * .7;
  for (const other of state.organisms) {
    if (other === organism || other.energy <= 0) continue;
    const d = distanceSq(organism.x, organism.y, other.x, other.y);
    if (organism.genome.diet > .42 && other.genome.size < organism.genome.size * 1.08 && other.speciesId !== organism.speciesId && d < preyDistance) {
      prey = other;
      preyDistance = d;
    }
    if (other.genome.diet > .5 && other.genome.size > organism.genome.size * .82 && other.speciesId !== organism.speciesId && d < threatDistance) {
      threat = other;
      threatDistance = d;
    }
  }
  return { prey, preyDistance, threat, threatDistance };
}

function steerToward(organism, target, weight = 1) {
  const dx = target.x - organism.x;
  const dy = target.y - organism.y;
  const length = Math.hypot(dx, dy) || 1;
  organism.vx += dx / length * .000025 * weight;
  organism.vy += dy / length * .000025 * weight;
}

function steerAway(organism, target, weight = 1) {
  const dx = organism.x - target.x;
  const dy = organism.y - target.y;
  const length = Math.hypot(dx, dy) || 1;
  organism.vx += dx / length * .000035 * weight;
  organism.vy += dy / length * .000035 * weight;
}

function decideSpecies(childGenome, parent) {
  const currentSpecies = state.species.find((entry) => entry.id === parent.speciesId);
  if (!currentSpecies) return newSpecies(childGenome, null);
  const distance = genomeDistance(childGenome, currentSpecies.centroid);
  const speciesAge = state.generation - currentSpecies.born;
  const threshold = lerp(.23, .14, state.env.mutation);
  if (speciesAge >= 2 && distance > threshold && random() < .42 + state.env.mutation * .2) {
    return newSpecies(childGenome, currentSpecies.id);
  }
  const blend = .012;
  for (const key of ['size', 'speed', 'vision', 'metabolism', 'thermal', 'diet', 'armor', 'fertility', 'pattern']) {
    currentSpecies.centroid[key] = lerp(currentSpecies.centroid[key], childGenome[key], blend);
  }
  const hueDelta = ((childGenome.hue - currentSpecies.centroid.hue + 540) % 360) - 180;
  currentSpecies.centroid.hue = (currentSpecies.centroid.hue + hueDelta * blend + 360) % 360;
  return currentSpecies.id;
}

function reproduce(parent) {
  if (state.organisms.length >= MAX_ORGANISMS) return;
  const mutationScale = state.env.mutation * (state.shock?.type === 'red' ? 1.35 : 1);
  const genome = makeGenome(parent.genome, mutationScale);
  const speciesId = decideSpecies(genome, parent);
  const angle = randomRange(0, TAU);
  const child = makeOrganism({
    x: parent.x + Math.cos(angle) * .012,
    y: parent.y + Math.sin(angle) * .012,
    genome,
    speciesId,
    generation: parent.generation + 1,
    energy: parent.energy * .42,
    parentId: parent.id
  });
  parent.energy *= .54;
  parent.age += 38;
  state.organisms.push(child);
}

function applyShockCost(organism) {
  if (!state.shock) return 0;
  const strength = state.shock.strength;
  if (state.shock.type === 'meteor') {
    const d = Math.sqrt(distanceSq(organism.x, organism.y, state.shock.x, state.shock.y));
    return Math.max(0, .17 - d) * 2.5 * strength;
  }
  if (state.shock.type === 'ice') return Math.max(0, .62 - organism.genome.armor) * .025 * strength;
  if (state.shock.type === 'drought') return Math.max(0, .72 - organism.genome.metabolism) * .018 * strength;
  if (state.shock.type === 'red') return Math.max(0, .58 - organism.genome.diet) * .021 * strength;
  return 0;
}

