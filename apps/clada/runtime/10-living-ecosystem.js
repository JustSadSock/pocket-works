/* КЛАДА 3.0 — living geography, food webs, populations and mature biospheres. */
const livingLegacy = {
  makeGenome,
  genomeDistance,
  buildWorld,
  simulateStep,
  finalizeGeneration,
  snapshotOrganism,
  openGenomeSheet,
  openSpeciesSheet,
  drawWorld,
  selectHistory,
  exitFossil
};

const LIVING_TRAITS = [
  'herding', 'territorial', 'migration', 'nocturnal', 'parentalCare',
  'filterFeeder', 'scavenger', 'burrow', 'reproMode', 'broodSize',
  'sexualDisplay', 'habitatBreadth'
];

const LIVING_SPECIES_LIMIT = 48;
const LIVING_POPULATION_SPLIT_AGE = 8;
const LIVING_POPULATION_MIN_SIZE = 6;

function livingHash01(value) {
  return (hashNumber(value) % 100000) / 100000;
}

function livingSeedPhase() {
  const seed = String(state?.seed || 'garden');
  return [...seed].reduce((sum, char) => hashNumber(sum + char.charCodeAt(0)), 91217) / 4294967296;
}

function ensureLivingGenome(genome) {
  if (!genome) return genome;
  if (typeof gv === 'function') gv(genome);
  const seed = ((genome.hue || 0) / 360 + (genome.pattern || 0) * .31 + (genome.size || 1) * .17) % 1;
  const defaults = {
    herding: clamp((genome.social || 0) * .82 + (1 - genome.diet) * .12),
    territorial: clamp(genome.diet * .48 + genome.armor * .2 - (genome.social || 0) * .24),
    migration: clamp(genome.speed * .27 + (genome.aquatic || 0) * .18 + seed * .2 - .14),
    nocturnal: clamp((1 - (genome.display || 0)) * .28 + genome.vision * .18 + seed * .24),
    parentalCare: clamp((genome.social || 0) * .38 + (1.25 - genome.fertility) * .3 + genome.vision * .12),
    filterFeeder: clamp((genome.aquatic || 0) * .72 + (1 - genome.diet) * .2 - genome.size * .08),
    scavenger: clamp(genome.diet * .5 + genome.armor * .13 + seed * .24 - .18),
    burrow: clamp((1 - (genome.aquatic || 0)) * .28 + genome.armor * .18 + (1 - genome.speed) * .24),
    reproMode: clamp(seed * .45 + (genome.social || 0) * .38 + genome.fertility * .12),
    broodSize: clamp(genome.fertility * .54 + (1 - genome.size) * .28 - (genome.parentalCare || 0) * .12),
    sexualDisplay: clamp((genome.display || 0) * .7 + (genome.pattern || 0) * .2),
    habitatBreadth: clamp(.25 + genome.armor * .18 + (1 - Math.abs((genome.thermal || .5) - .5)) * .22 + seed * .12)
  };
  for (const trait of LIVING_TRAITS) {
    if (!Number.isFinite(genome[trait])) genome[trait] = defaults[trait];
  }
  return genome;
}

const livingBaseMakeGenome = makeGenome;
makeGenome = function livingMakeGenome(base = null, mutationScale = 0) {
  const source = base ? ensureLivingGenome({ ...base }) : null;
  const genome = livingBaseMakeGenome(source, mutationScale);
  ensureLivingGenome(genome);
  if (source) {
    const magnitude = .012 + mutationScale * .12;
    for (const trait of LIVING_TRAITS) {
      genome[trait] = clamp(source[trait] + gauss() * magnitude * (trait === 'reproMode' ? .45 : 1));
    }
  }
  return genome;
};

const livingBaseGenomeDistance = genomeDistance;
genomeDistance = function livingGenomeDistance(a, b) {
  if (!a || !b) return 0;
  ensureLivingGenome(a);
  ensureLivingGenome(b);
  let behaviorDistance = 0;
  for (const trait of LIVING_TRAITS) behaviorDistance += (a[trait] - b[trait]) ** 2;
  return Math.sqrt(livingBaseGenomeDistance(a, b) ** 2 + behaviorDistance * .055);
};

function livingBiomeAt(x, y) {
  const phase = livingSeedPhase() * TAU;
  const river = .5 + Math.sin(x * 7.2 + phase) * .07 + Math.sin(x * 15.7 - phase) * .018;
  const lakeA = Math.hypot(x - (.22 + livingSeedPhase() * .08), y - .29);
  const lakeB = Math.hypot(x - .78, y - (.68 - livingSeedPhase() * .06));
  const coast = y > .88 - Math.sin(x * 5.1 + phase) * .025;
  const water = Math.abs(y - river) < .035 + .012 * Math.sin(x * 9 + phase)
    || lakeA < .105 || lakeB < .085 || coast;
  const ridge = Math.sin(x * 8.4 + phase) * .45 + Math.cos(y * 10.2 - phase) * .36 + Math.sin((x + y) * 15.1) * .19;
  const mountain = !water && ridge > .62 && y < .72;
  const dry = !water && !mountain && (x > .61 && y > .45 || x > .78);
  const wet = !water && !mountain && !dry && (x < .38 || Math.abs(y - river) < .15);
  const cold = y < .22 || mountain;
  let id = 'meadow';
  if (water) id = coast ? 'coast' : 'water';
  else if (mountain) id = 'mountain';
  else if (dry) id = 'dry';
  else if (wet) id = 'wet';
  else if (cold) id = 'tundra';
  const catalog = {
    water: { id, name: 'реки и озёра', water: 1, moisture: 1, food: .72, temp: -.04, barrier: .78 },
    coast: { id, name: 'прибрежная отмель', water: .78, moisture: .92, food: .86, temp: .01, barrier: .42 },
    mountain: { id, name: 'каменистое нагорье', water: 0, moisture: .24, food: .31, temp: -.18, barrier: .72 },
    dry: { id, name: 'сухая степь', water: 0, moisture: .18, food: .38, temp: .14, barrier: .2 },
    wet: { id, name: 'влажная низина', water: .08, moisture: .9, food: .92, temp: .02, barrier: .08 },
    tundra: { id, name: 'холодная равнина', water: 0, moisture: .45, food: .48, temp: -.13, barrier: .16 },
    meadow: { id, name: 'открытая равнина', water: 0, moisture: .58, food: .72, temp: .04, barrier: .04 }
  };
  return catalog[id];
}

function livingRegionAt(x, y) {
  const biome = livingBiomeAt(x, y);
  const side = x < .5 ? 'W' : 'E';
  return `${biome.id}:${side}`;
}

function livingHabitatRole(genome) {
  ensureLivingGenome(genome);
  if (genome.aquatic > .68) return 'водная';
  if (genome.wing > .68) return 'воздушная';
  if (genome.burrow > .62) return 'подземная';
  if (genome.fur > .55 || genome.thermal < .27) return 'холодная';
  if (genome.armor > .67 || genome.shell > .58) return 'каменистая';
  return 'наземная';
}

function livingFeedingRole(genome) {
  ensureLivingGenome(genome);
  if (genome.filterFeeder > .63 && genome.aquatic > .5) return 'фильтратор';
  if (genome.scavenger > .66 && genome.diet > .38) return 'падальщик';
  if (genome.diet > .72) return 'хищник';
  if (genome.diet > .38) return 'всеядный';
  if (genome.diet < .16 && genome.size < .82) return 'семяед';
  return 'травоядный';
}

function livingReproductionLabel(genome) {
  ensureLivingGenome(genome);
  if (genome.reproMode < .18) return 'бесполое размножение';
  if (genome.reproMode < .43) return 'гермафродитная стратегия';
  return genome.parentalCare > .62 ? 'раздельнополая форма с заботой о потомстве' : 'раздельнополая форма';
}

function livingBehaviorLabels(genome) {
  ensureLivingGenome(genome);
  const labels = [];
  if (genome.herding > .64) labels.push('стайность');
  if (genome.territorial > .62) labels.push('территориальность');
  if (genome.migration > .62) labels.push('сезонные миграции');
  if (genome.nocturnal > .62) labels.push('ночная активность');
  if (genome.burrow > .62) labels.push('убежища');
  if (genome.parentalCare > .62) labels.push('забота о потомстве');
  return labels.length ? labels : ['одиночный оппортунизм'];
}

function livingHabitatSuitability(genome, biome) {
  ensureLivingGenome(genome);
  const aquatic = genome.aquatic || 0;
  let score = 1;
  if (biome.water > .65) score -= Math.max(0, .66 - aquatic) * 1.15;
  else score -= Math.max(0, aquatic - .62) * .9;
  if (biome.id === 'mountain') score -= Math.max(0, .48 - genome.armor) * .55;
  if (biome.id === 'dry') score -= Math.max(0, genome.metabolism - .92) * .3;
  if (biome.id === 'tundra') score -= Math.max(0, genome.thermal - .4) * .8;
  if (biome.id === 'wet') score += genome.habitatBreadth * .08;
  return clamp(score, .03, 1);
}

const livingBaseLocalTemperature = localTemperature;
localTemperature = function livingLocalTemperature(y, x = .5) {
  const base = livingBaseLocalTemperature(y);
  return clamp(base + livingBiomeAt(x, y).temp);
};

const livingBasePlantGrowth = plantGrowthFactor;
plantGrowthFactor = function livingPlantGrowthFactor(plant) {
  const biome = livingBiomeAt(plant.x, plant.y);
  if (biome.water > .7) return .05;
  return livingBasePlantGrowth(plant) * biome.food * (.45 + biome.moisture * .65);
};

function livingAverageGenome(organisms) {
  if (!organisms.length) return null;
  const first = ensureLivingGenome(deepClone(organisms[0].genome));
  const keys = [
    'size', 'speed', 'vision', 'metabolism', 'thermal', 'diet', 'armor',
    'fertility', 'pattern', 'bodyPlan', 'limbs', 'tail', 'wing', 'fins',
    'shell', 'fur', 'horns', 'eyes', 'camouflage', 'social', 'aquatic',
    'display', ...LIVING_TRAITS
  ];
  for (const key of keys) {
    first[key] = organisms.reduce((sum, organism) => sum + (organism.genome[key] || 0), 0) / organisms.length;
  }
  let sx = 0;
  let sy = 0;
  for (const organism of organisms) {
    sx += Math.cos((organism.genome.hue || 0) / 360 * TAU);
    sy += Math.sin((organism.genome.hue || 0) / 360 * TAU);
  }
  first.hue = (Math.atan2(sy, sx) / TAU * 360 + 360) % 360;
  first.chromosome = Math.round(organisms.reduce((sum, organism) => sum + (organism.genome.chromosome || 2), 0) / organisms.length);
  return ensureLivingGenome(first);
}

function livingSpeciesRecord(genome, parentId, born, extinct = null, flags = {}) {
  const id = state.nextSpeciesId++;
  const names = speciesNames(id, genome);
  const species = {
    id,
    parentId,
    born,
    extinct,
    name: names.scientific,
    common: names.common,
    hue: genome.hue,
    diet: genome.diet,
    centroid: deepClone(ensureLivingGenome(genome)),
    peak: 1,
    lastSeen: extinct ?? state.generation,
    cause: flags.cause || null,
    historical: Boolean(flags.historical),
    hybrid: Boolean(flags.hybrid),
    hybridParentId: flags.hybridParentId ?? null,
    populations: {},
    mainPopulationKey: null,
    populationTrend: 0,
    feedingRole: livingFeedingRole(genome),
    habitatRole: livingHabitatRole(genome)
  };
  state.species.push(species);
  return species;
}

function livingTemplate(overrides = {}) {
  const genome = makeGenome();
  Object.assign(genome, overrides);
  return ensureLivingGenome(genome);
}

function livingFindPoint(genome, cluster = 0) {
  const desired = livingHabitatRole(genome);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    let x = randomRange(.06, .94);
    let y = randomRange(.07, .93);
    if (cluster === 1) x = clamp(x * .45 + .53, .06, .94);
    if (cluster === 2) x = clamp(x * .45 + .03, .06, .94);
    const biome = livingBiomeAt(x, y);
    const roleMatch = desired === 'водная' ? biome.water > .65
      : desired === 'каменистая' ? biome.id === 'mountain' || biome.id === 'dry'
      : desired === 'холодная' ? biome.id === 'tundra' || biome.id === 'mountain'
      : desired === 'подземная' ? biome.water < .4 && biome.id !== 'mountain'
      : desired === 'воздушная' ? true
      : biome.water < .55;
    if (roleMatch && livingHabitatSuitability(genome, biome) > .62) return { x, y };
  }
  return { x: randomRange(.12, .88), y: randomRange(.12, .88) };
}

function livingSpawnSpecies(species, count, clusters = 2, energy = 10) {
  const clusterCenters = [];
  for (let index = 0; index < clusters; index += 1) clusterCenters.push(livingFindPoint(species.centroid, index));
  for (let index = 0; index < count && state.organisms.length < MAX_ORGANISMS; index += 1) {
    const center = clusterCenters[index % clusterCenters.length];
    const angle = randomRange(0, TAU);
    const radius = randomRange(.004, .055);
    const genome = makeGenome(species.centroid, .035);
    const organism = makeOrganism({
      x: clamp(center.x + Math.cos(angle) * radius, .02, .98),
      y: clamp(center.y + Math.sin(angle) * radius, .03, .97),
      genome,
      speciesId: species.id,
      generation: Math.max(0, state.generation + Math.floor(randomRange(0, 4))),
      energy: randomRange(energy * .82, energy * 1.2)
    });
    organism.sex = genome.reproMode < .43 ? 2 : (random() < .5 ? 0 : 1);
    organism.populationKey = livingRegionAt(organism.x, organism.y);
    organism.birthBiome = livingBiomeAt(organism.x, organism.y).id;
    organism.homeX = center.x;
    organism.homeY = center.y;
    organism.protectedUntil = organism.age < 90 ? 120 : 0;
    state.organisms.push(organism);
  }
}

function livingSyntheticOrganism(species, generation, index) {
  const point = livingFindPoint(species.centroid, index % 2);
  return {
    id: -species.id * 100 - index,
    x: point.x,
    y: point.y,
    vx: 0,
    vy: 0,
    energy: 8,
    age: 300,
    generation,
    speciesId: species.id,
    genome: deepClone(species.centroid),
    populationKey: livingRegionAt(point.x, point.y)
  };
}

function livingBuildHistory(startGeneration = -180) {
  const moments = [];
  const span = Math.abs(startGeneration);
  for (let index = 0; index <= 9; index += 1) moments.push(Math.round(startGeneration + span * index / 9));
  state.history = moments.map((generation, index) => {
    const active = state.species.filter((species) =>
      species.born <= generation && (species.extinct === null || species.extinct >= generation)
    );
    const counts = {};
    const organisms = [];
    for (const species of active) {
      const current = state.organisms.filter((organism) => organism.speciesId === species.id);
      const count = generation === 0 && current.length
        ? current.length
        : Math.max(3, Math.round(7 + livingHash01(species.id * 73 + generation * 11) * 18));
      counts[species.id] = count;
      const samples = current.length && generation === 0
        ? current.slice(0, Math.min(16, current.length)).map(snapshotOrganism)
        : Array.from({ length: Math.min(6, count) }, (_, sampleIndex) => livingSyntheticOrganism(species, generation, sampleIndex));
      organisms.push(...samples);
    }
    return {
      generation,
      env: deepClone(state.env),
      population: Object.values(counts).reduce((sum, count) => sum + count, 0),
      counts,
      organisms: organisms.slice(0, 180),
      event: index === 0
        ? { generation, type: 'origin', text: 'Общий предок колонизировал среду' }
        : index === moments.length - 1
          ? { generation, type: 'recovery', text: 'Открыта современная биосфера' }
          : null
    };
  });
}

function livingBuildMatureWorld(seed = 'garden') {
  state = baseState(seed);
  state.modelVersion = 3;
  state.generation = 0;
  state.prehistoryStart = seed === 'origin' ? -42 : -180;
  state.env = seed === 'rift'
    ? { temperature: .27, food: .52, mutation: .3 }
    : seed === 'red'
      ? { temperature: .66, food: .57, mutation: .31 }
      : seed === 'origin'
        ? { temperature: .51, food: .66, mutation: .27 }
        : { temperature: .52, food: .68, mutation: .24 };
  state.plants = createPlants(seed === 'rift' ? 115 : 150);
  state.resources = {
    carrion: [],
    plankton: Array.from({ length: 20 }, (_, index) => {
      const point = livingFindPoint(livingTemplate({ aquatic: .95 }), index % 2);
      return { x: point.x, y: point.y, energy: randomRange(1.2, 3.8), phase: randomRange(0, TAU) };
    })
  };
  state.hybridPools = {};
  state.foodWeb = {};
  state.populationEvents = [];
  state.worldStats = { births: 0, deaths: 0, predations: 0, hybridBirths: 0 };

  const rootGenome = livingTemplate({
    size: .74, speed: .72, vision: .68, metabolism: .82, thermal: .5,
    diet: .22, armor: .18, fertility: 1.18, hue: 112, pattern: .28,
    aquatic: .3, social: .5, herding: .54, reproMode: .34
  });
  const root = livingSpeciesRecord(rootGenome, null, state.prehistoryStart, seed === 'origin' ? -18 : -132, {
    historical: true,
    cause: 'адаптивная радиация'
  });

  const basalA = livingSpeciesRecord(livingTemplate({
    ...rootGenome, size: .82, speed: .82, diet: .12, hue: 126, social: .76,
    herding: .84, parentalCare: .48, reproMode: .58
  }), root.id, seed === 'origin' ? -28 : -145, seed === 'origin' ? null : -76, {
    historical: seed !== 'origin',
    cause: seed === 'origin' ? null : 'расхождение потомков'
  });

  const basalB = livingSpeciesRecord(livingTemplate({
    ...rootGenome, aquatic: .78, fins: .82, filterFeeder: .84, hue: 188,
    speed: .7, diet: .26, armor: .12, reproMode: .29
  }), root.id, seed === 'origin' ? -24 : -138, seed === 'origin' ? null : -68, {
    historical: seed !== 'origin',
    cause: seed === 'origin' ? null : 'расхождение потомков'
  });

  const basalC = livingSpeciesRecord(livingTemplate({
    ...rootGenome, diet: .72, speed: 1.16, vision: 1.18, hue: 24,
    social: .4, territorial: .62, reproMode: .68
  }), root.id, seed === 'origin' ? -20 : -126, seed === 'origin' ? null : -59, {
    historical: seed !== 'origin',
    cause: seed === 'origin' ? null : 'конкуренция'
  });

  let extant;
  if (seed === 'origin') {
    extant = [basalA, basalB, basalC];
    livingSpawnSpecies(basalA, 26, 2, 10.5);
    livingSpawnSpecies(basalB, 22, 2, 10.5);
    livingSpawnSpecies(basalC, 15, 1, 11.5);
  } else {
    const presets = [
      [basalA, { size: .76, diet: .08, speed: 1.02, social: .9, herding: .94, parentalCare: .58, hue: 108, broodSize: .62 }, -74, 22, 2],
      [basalA, { size: 1.34, diet: .13, speed: .48, armor: .82, shell: .86, horns: .58, territorial: .48, hue: 78, broodSize: .28 }, -69, 14, 2],
      [basalA, { size: .56, diet: .18, speed: .72, burrow: .9, nocturnal: .82, fertility: 1.38, hue: 44, broodSize: .88 }, -61, 20, 2],
      [basalB, { size: .88, aquatic: .94, fins: .9, filterFeeder: .96, diet: .22, social: .72, hue: 196, migration: .72 }, -72, 18, 2],
      [basalB, { size: .96, aquatic: .58, diet: .44, speed: .92, armor: .35, hue: 154, habitatBreadth: .82 }, -55, 16, 2],
      [basalC, { size: 1.08, diet: .92, speed: 1.31, vision: 1.34, territorial: .76, hue: 8, broodSize: .2 }, -66, 13, 1],
      [basalC, { size: .86, diet: .61, scavenger: .94, armor: .46, nocturnal: .7, hue: 324, habitatBreadth: .72 }, -49, 15, 2],
      [basalA, { size: .48, wing: .9, limbs: .42, diet: .34, speed: 1.46, sexualDisplay: .92, display: .91, hue: 272, broodSize: .78 }, -43, 18, 2]
    ];
    extant = presets.map(([parent, overrides, born]) =>
      livingSpeciesRecord(livingTemplate({ ...parent.centroid, ...overrides }), parent.id, born, null)
    );
    presets.forEach((preset, index) => {
      const [, , , count, clusters] = preset;
      livingSpawnSpecies(extant[index], count, clusters, index === 5 ? 12 : 10.5);
    });
  }

  for (const species of extant) {
    species.peak = state.organisms.filter((organism) => organism.speciesId === species.id).length;
    species.lastSeen = 0;
  }
  livingUpdatePopulationStructure(false);
  livingComputeFoodWeb();
  livingBuildHistory(state.prehistoryStart);
  state.paused = false;
  state.view = 'world';
  state.fossilIndex = null;
  state.selectedId = null;
  state.selectedSpeciesId = null;
  state.seedMode = false;
  state.lens = false;
  syncAllUI();
  updateTimeline();
  saveState();
}

buildWorld = function livingBuildWorld(seed = 'garden') {
  livingBuildMatureWorld(seed);
  showToast(seed === 'origin'
    ? 'Первичная колония: три ранние линии'
    : `Зрелая биосфера: ${new Set(state.organisms.map((organism) => organism.speciesId)).size} видов`, 2200);
};

function ensureLivingState(target = state) {
  if (!target) return;
  target.modelVersion ||= 3;
  target.prehistoryStart ??= Math.min(0, ...(target.species || []).map((species) => species.born || 0));
  target.resources ||= { carrion: [], plankton: [] };
  target.resources.carrion ||= [];
  target.resources.plankton ||= [];
  target.hybridPools ||= {};
  target.foodWeb ||= {};
  target.populationEvents ||= [];
  target.worldStats ||= { births: 0, deaths: 0, predations: 0, hybridBirths: 0 };
  for (const organism of target.organisms || []) {
    ensureLivingGenome(organism.genome);
    organism.sex ??= organism.genome.reproMode < .43 ? 2 : ((organism.id || 0) % 2);
    organism.populationKey ||= livingRegionAt(organism.x, organism.y);
    organism.birthBiome ||= livingBiomeAt(organism.x, organism.y).id;
    organism.homeX ??= organism.x;
    organism.homeY ??= organism.y;
    organism.protectedUntil ??= 0;
  }
  for (const species of target.species || []) {
    ensureLivingGenome(species.centroid);
    species.populations ||= {};
    species.mainPopulationKey ||= null;
    species.populationTrend ??= 0;
    species.feedingRole ||= livingFeedingRole(species.centroid);
    species.habitatRole ||= livingHabitatRole(species.centroid);
  }
  if (!target.resources.plankton.length) {
    target.resources.plankton = Array.from({ length: 12 }, (_, index) => {
      const point = livingFindPoint(livingTemplate({ aquatic: .95 }), index % 2);
      return { x: point.x, y: point.y, energy: 2, phase: index };
    });
  }
}

function livingNearestPlant(organism, radiusSq) {
  let best = null;
  let bestDistance = radiusSq;
  for (const plant of state.plants) {
    if (plant.energy < .25) continue;
    const d = distanceSq(organism.x, organism.y, plant.x, plant.y);
    if (d < bestDistance) {
      best = plant;
      bestDistance = d;
    }
  }
  return best ? { target: best, distance: bestDistance } : null;
}

function livingNearestCarrion(organism, radiusSq) {
  let best = null;
  let bestDistance = radiusSq;
  for (const carrion of state.resources.carrion) {
    if (carrion.energy < .12) continue;
    const d = distanceSq(organism.x, organism.y, carrion.x, carrion.y);
    if (d < bestDistance) {
      best = carrion;
      bestDistance = d;
    }
  }
  return best ? { target: best, distance: bestDistance } : null;
}

function livingNearestPlankton(organism, radiusSq) {
  let best = null;
  let bestDistance = radiusSq;
  for (const patch of state.resources.plankton) {
    if (patch.energy < .12) continue;
    const d = distanceSq(organism.x, organism.y, patch.x, patch.y);
    if (d < bestDistance) {
      best = patch;
      bestDistance = d;
    }
  }
  return best ? { target: best, distance: bestDistance } : null;
}

function livingPreyAndThreat(organism, radiusSq) {
  let prey = null;
  let preyDistance = radiusSq;
  let threat = null;
  let threatDistance = radiusSq * .82;
  let herdX = 0;
  let herdY = 0;
  let herdCount = 0;
  let localAllies = 0;
  for (const other of state.organisms) {
    if (other === organism || other.energy <= 0) continue;
    const d = distanceSq(organism.x, organism.y, other.x, other.y);
    if (d > radiusSq) continue;
    if (other.speciesId === organism.speciesId) {
      herdX += other.x;
      herdY += other.y;
      herdCount += 1;
      if (d < .018) localAllies += 1;
      continue;
    }
    if (organism.genome.diet > .42 && other.genome.size < organism.genome.size * 1.16 && d < preyDistance) {
      prey = other;
      preyDistance = d;
    }
    if (other.genome.diet > .58 && other.genome.size > organism.genome.size * .78 && d < threatDistance) {
      threat = other;
      threatDistance = d;
    }
  }
  return {
    prey,
    preyDistance,
    threat,
    threatDistance,
    herd: herdCount ? { x: herdX / herdCount, y: herdY / herdCount, count: herdCount } : null,
    localAllies
  };
}

function livingSeason() {
  return (Math.sin((state.generation + state.step / GENERATION_STEPS) * TAU / 6 - Math.PI / 2) + 1) / 2;
}

function livingDaylight() {
  return (Math.sin(state.step / 125 * TAU) + 1) / 2;
}

function livingSteerHome(organism, weight = 1) {
  steerToward(organism, { x: organism.homeX ?? organism.x, y: organism.homeY ?? organism.y }, weight);
}

function livingMixGenomes(a, b, mutationScale) {
  ensureLivingGenome(a);
  ensureLivingGenome(b);
  const result = {};
  const keys = [
    'size', 'speed', 'vision', 'metabolism', 'thermal', 'diet', 'armor',
    'fertility', 'pattern', 'bodyPlan', 'limbs', 'tail', 'wing', 'fins',
    'shell', 'fur', 'horns', 'eyes', 'camouflage', 'social', 'aquatic',
    'display', ...LIVING_TRAITS
  ];
  for (const key of keys) result[key] = lerp(a[key] || 0, b[key] || 0, randomRange(.25, .75));
  const hueDelta = ((b.hue - a.hue + 540) % 360) - 180;
  result.hue = (a.hue + hueDelta * randomRange(.25, .75) + 360) % 360;
  result.chromosome = random() < .5 ? a.chromosome : b.chromosome;
  return makeGenome(result, mutationScale);
}

function livingMateCompatibility(a, b) {
  if (!a || !b || a === b || b.energy <= 6.5 || b.age < 170) return 0;
  ensureLivingGenome(a.genome);
  ensureLivingGenome(b.genome);
  const distance = Math.sqrt(distanceSq(a.x, a.y, b.x, b.y));
  if (distance > .18) return 0;
  const genetic = genomeDistance(a.genome, b.genome);
  const chromosomeGap = Math.abs((a.genome.chromosome || 2) - (b.genome.chromosome || 2));
  if (genetic > .72 || chromosomeGap > 1) return 0;
  const sexual = a.genome.reproMode >= .43;
  if (sexual && a.sex !== 2 && b.sex !== 2 && a.sex === b.sex) return 0;
  const displayMatch = 1 - Math.abs(a.genome.sexualDisplay - b.genome.sexualDisplay) * .25;
  return clamp(1 - genetic / .76) * clamp(1 - distance / .19) * (chromosomeGap ? .55 : 1) * displayMatch;
}

function livingFindMate(parent) {
  const mode = parent.genome.reproMode;
  if (mode < .18) return { mate: parent, score: 1 };
  let best = null;
  let bestScore = 0;
  for (const candidate of state.organisms) {
    const score = livingMateCompatibility(parent, candidate);
    const sameSpeciesBonus = candidate.speciesId === parent.speciesId ? 1.18 : .72;
    const finalScore = score * sameSpeciesBonus;
    if (finalScore > bestScore) {
      best = candidate;
      bestScore = finalScore;
    }
  }
  return { mate: best, score: bestScore };
}

reproduce = function livingReproduce(parent) {
  if (!parent || parent.energy <= 0 || state.organisms.length >= MAX_ORGANISMS) return;
  ensureLivingGenome(parent.genome);
  const { mate, score } = livingFindMate(parent);
  if (!mate) return;
  const hybrid = mate.speciesId !== parent.speciesId;
  const mutationScale = state.env.mutation * (state.shock?.type === 'red' ? 1.35 : 1);
  const available = MAX_ORGANISMS - state.organisms.length;
  const broodPotential = 1 + Math.floor(parent.genome.broodSize * 2.3);
  const brood = Math.min(available, broodPotential, hybrid ? 1 : 3);
  let childSpeciesId = parent.speciesId;

  if (hybrid) {
    const pair = [parent.speciesId, mate.speciesId].sort((a, b) => a - b).join(':');
    const pool = state.hybridPools[pair] ||= { births: 0, viability: 0, speciesId: null };
    pool.births += 1;
    pool.viability = lerp(pool.viability || score, score, .28);
    if (!pool.speciesId && pool.births >= 6 && pool.viability > .42 && state.species.length < LIVING_SPECIES_LIMIT) {
      const hybridGenome = livingMixGenomes(parent.genome, mate.genome, mutationScale * .7);
      pool.speciesId = newSpecies(hybridGenome, parent.speciesId);
      const hybridSpecies = state.species.find((species) => species.id === pool.speciesId);
      if (hybridSpecies) {
        ensureLivingGenome(hybridSpecies.centroid);
        hybridSpecies.hybrid = true;
        hybridSpecies.hybridParentId = mate.speciesId;
        hybridSpecies.populations = {};
        hybridSpecies.feedingRole = livingFeedingRole(hybridSpecies.centroid);
        hybridSpecies.habitatRole = livingHabitatRole(hybridSpecies.centroid);
      }
    }
    if (pool.speciesId) childSpeciesId = pool.speciesId;
  }

  for (let index = 0; index < brood; index += 1) {
    const genome = mate === parent
      ? makeGenome(parent.genome, mutationScale)
      : livingMixGenomes(parent.genome, mate.genome, mutationScale);
    if (hybrid) genome.fertility *= clamp(.38 + score * .72, .18, .92);
    const angle = randomRange(0, TAU);
    const child = makeOrganism({
      x: clamp(lerp(parent.x, mate.x, .5) + Math.cos(angle) * randomRange(.006, .018), .02, .98),
      y: clamp(lerp(parent.y, mate.y, .5) + Math.sin(angle) * randomRange(.006, .018), .03, .97),
      genome,
      speciesId: childSpeciesId,
      generation: Math.max(parent.generation, mate.generation) + 1,
      energy: randomRange(3.8, 5.2) + parent.genome.parentalCare * 1.5,
      parentId: parent.id
    });
    child.secondParentId = mate === parent ? null : mate.id;
    child.sex = genome.reproMode < .43 ? 2 : (random() < .5 ? 0 : 1);
    child.hybrid = hybrid;
    child.populationKey = livingRegionAt(child.x, child.y);
    child.birthBiome = livingBiomeAt(child.x, child.y).id;
    child.homeX = lerp(parent.homeX ?? parent.x, mate.homeX ?? mate.x, .5);
    child.homeY = lerp(parent.homeY ?? parent.y, mate.homeY ?? mate.y, .5);
    child.protectedUntil = Math.round(80 + genome.parentalCare * 220);
    state.organisms.push(child);
    state.worldStats.births += 1;
    if (hybrid) state.worldStats.hybridBirths += 1;
  }

  const careCost = parent.genome.parentalCare * .08;
  parent.energy *= clamp(.76 - parent.genome.broodSize * .08 - careCost, .48, .76);
  parent.age += 20 + brood * 8;
  if (mate !== parent) {
    mate.energy *= clamp(.82 - mate.genome.parentalCare * .05, .62, .82);
    mate.age += 14 + brood * 5;
  }
};

function livingParentProtection(organism) {
  if (organism.age > organism.protectedUntil || !organism.parentId) return 0;
  const parent = state.organisms.find((candidate) => candidate.id === organism.parentId);
  if (!parent || parent.energy <= 0) return 0;
  const distance = Math.sqrt(distanceSq(organism.x, organism.y, parent.x, parent.y));
  if (distance > .11) return 0;
  return clamp(parent.genome.parentalCare * (1 - distance / .11));
}

simulateStep = function livingSimulateStep() {
  ensureLivingState();
  state.step += 1;
  const births = [];
  const season = livingSeason();
  const daylight = livingDaylight();

  for (const plant of state.plants) {
    plant.phase += .025;
    plant.energy = clamp(plant.energy + .0072 * plantGrowthFactor(plant), 0, 4.8);
    if (plant.energy < .1 && random() < .0019 * state.env.food) {
      const point = livingFindPoint(livingTemplate({ aquatic: 0, diet: .05 }), Math.floor(random() * 3));
      plant.x = point.x;
      plant.y = point.y;
      plant.energy = .38;
    }
  }

  for (const patch of state.resources.plankton) {
    patch.phase += .018;
    const biome = livingBiomeAt(patch.x, patch.y);
    patch.energy = clamp(patch.energy + .0045 * state.env.food * biome.water, 0, 4.5);
    if (patch.energy < .12 || biome.water < .55) {
      const point = livingFindPoint(livingTemplate({ aquatic: .95 }), Math.floor(random() * 3));
      patch.x = point.x;
      patch.y = point.y;
      patch.energy = randomRange(.8, 1.8);
    }
  }

  for (const carrion of state.resources.carrion) {
    carrion.age += 1;
    carrion.energy *= .999;
  }
  state.resources.carrion = state.resources.carrion.filter((carrion) => carrion.energy > .08 && carrion.age < 1250).slice(-80);

  for (const organism of state.organisms) {
    if (organism.energy <= 0) continue;
    ensureLivingGenome(organism.genome);
    organism.age += 1;
    const genome = organism.genome;
    const biome = livingBiomeAt(organism.x, organism.y);
    organism.populationKey = livingRegionAt(organism.x, organism.y);
    const localTemp = localTemperature(organism.y, organism.x);
    const thermalMismatch = Math.abs(localTemp - genome.thermal);
    const habitat = livingHabitatSuitability(genome, biome);
    const activity = genome.nocturnal > .55 ? lerp(.48, 1.12, 1 - daylight) : lerp(.72, 1.08, daylight);
    const senseRadius = (.045 + genome.vision * .067) ** 2;
    const plant = livingNearestPlant(organism, senseRadius);
    const carrion = livingNearestCarrion(organism, senseRadius);
    const plankton = livingNearestPlankton(organism, senseRadius);
    const { prey, preyDistance, threat, herd, localAllies } = livingPreyAndThreat(organism, senseRadius);
    const role = livingFeedingRole(genome);

    if (threat && genome.diet < .82) steerAway(organism, threat, 1.2 + genome.vision * .3);
    if (role === 'хищник' && prey) steerToward(organism, prey, (.65 + genome.diet * .9) * activity);
    else if (role === 'падальщик' && carrion) steerToward(organism, carrion.target, (.65 + genome.scavenger) * activity);
    else if (role === 'фильтратор' && plankton) steerToward(organism, plankton.target, .38 + genome.filterFeeder * .35);
    else if ((role === 'травоядный' || role === 'семяед' || role === 'всеядный') && plant) steerToward(organism, plant.target, .46 + (1 - genome.diet) * .62);

    if (genome.herding > .48 && herd) {
      steerToward(organism, herd, genome.herding * .3);
      if (herd.count > 5 && distanceSq(organism.x, organism.y, herd.x, herd.y) < .002) steerAway(organism, herd, .12);
    }
    if (genome.territorial > .55 && herd?.count > 1) steerAway(organism, herd, genome.territorial * .18);
    if (genome.migration > .55) {
      const migrationX = .5 + Math.sin((state.generation / 6 + genome.bodyPlan) * TAU) * .32;
      const migrationY = .5 + Math.cos((state.generation / 6 + genome.hue / 360) * TAU) * .26;
      steerToward(organism, { x: migrationX, y: migrationY }, genome.migration * .16);
    }
    if (habitat < .42) livingSteerHome(organism, (1 - habitat) * .85);

    const wander = .000011 * (1.38 - genome.vision * .28) * activity;
    organism.vx += Math.cos(organism.id * 2.13 + state.step * .021 + organism.y * 9) * wander;
    organism.vy += Math.sin(organism.id * 1.71 + state.step * .018 + organism.x * 11) * wander;
    const mediumBonus = biome.water > .6 ? lerp(.48, 1.14, genome.aquatic) : lerp(1.02, .62, genome.aquatic);
    const maxVelocity = (.00038 + genome.speed * .00052 + genome.wing * .00012) * mediumBonus * activity;
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
      organism.vx *= -1.35;
    }
    if (organism.y < .03 || organism.y > .97) {
      organism.y = clamp(organism.y, .03, .97);
      organism.vy *= -1.35;
    }

    if (plant && plant.distance < (.008 + genome.size * .0045) ** 2 && genome.diet < .72 && plant.target.energy > .16) {
      const bite = Math.min(plant.target.energy, .12 + genome.size * .2);
      plant.target.energy -= bite;
      organism.energy += bite * (1.45 - genome.diet * .62);
      organism.lastMeal = state.step;
      organism.lastFoodType = 'plant';
    }

    if (carrion && carrion.distance < (.009 + genome.size * .004) ** 2 && genome.scavenger > .38) {
      const bite = Math.min(carrion.target.energy, .15 + genome.size * .2);
      carrion.target.energy -= bite;
      organism.energy += bite * (.86 + genome.scavenger * .5);
      organism.lastMeal = state.step;
      organism.lastFoodType = 'carrion';
      organism.lastFoodSpeciesId = carrion.target.speciesId;
    }

    if (plankton && plankton.distance < (.014 + genome.size * .004) ** 2 && genome.filterFeeder > .45 && biome.water > .5) {
      const bite = Math.min(plankton.target.energy, .035 + genome.filterFeeder * .055);
      plankton.target.energy -= bite;
      organism.energy += bite * 1.35;
      organism.lastMeal = state.step;
      organism.lastFoodType = 'plankton';
    }

    if (prey && preyDistance < (.007 + genome.size * .0055) ** 2 && genome.diet > .42) {
      const packBonus = 1 + Math.min(4, localAllies) * genome.herding * .08;
      const damage = (.05 + genome.size * .085) * genome.diet * packBonus * (1.12 - prey.genome.armor * .48 - prey.genome.shell * .2);
      prey.energy -= damage;
      organism.energy += damage * (.64 + genome.scavenger * .08);
      organism.lastMeal = state.step;
      organism.lastFoodType = 'prey';
      organism.lastFoodSpeciesId = prey.speciesId;
      state.worldStats.predations += 1;
      if (prey.energy <= 0) prey.cause = 'хищничество';
    }

    const protection = livingParentProtection(organism);
    const burrowRelief = genome.burrow > .55 && velocity < maxVelocity * .42 ? genome.burrow * .34 : 0;
    const movementCost = (
      .0022 + genome.speed ** 2 * .00145 + genome.size * .00105 +
      genome.armor * .0008 + genome.shell * .00075 + genome.wing * .00072 +
      genome.vision * .00032 + genome.social * .00026
    ) * genome.metabolism * activity;
    const climateCost = thermalMismatch ** 1.45 * .014 * (1.12 - genome.fur * .38 - burrowRelief);
    const habitatCost = (1 - habitat) ** 1.35 * .0095 * (1 - genome.habitatBreadth * .28);
    organism.energy -= movementCost + climateCost + habitatCost * (1 - protection * .42) + applyShockCost(organism) * (1 - protection * .25);

    const maxAge = 1700 + (1.42 - genome.metabolism) * 760 + genome.armor * 170 + genome.parentalCare * 120;
    if (organism.age > maxAge) {
      organism.energy -= .075;
      organism.cause ||= 'старение';
    }
    if (organism.energy <= 0) organism.cause ||= thermalMismatch > .31 ? 'климат' : habitat < .35 ? 'неподходящая среда' : 'голод';

    const reproductionThreshold = 8.7 + genome.size * 3.1 + genome.armor * 1.25 + genome.parentalCare * .7;
    const breedingSeason = lerp(.54, 1.18, season);
    const fertilityChance = .0015 * genome.fertility * breedingSeason * clamp(1 - thermalMismatch * 1.35, .14, 1) * habitat;
    if (organism.energy > reproductionThreshold && organism.age > 180 && random() < fertilityChance) births.push(organism);
  }

  births.slice(0, Math.max(0, MAX_ORGANISMS - state.organisms.length)).forEach(reproduce);
  const dead = state.organisms.filter((organism) => organism.energy <= 0);
  if (dead.length) {
    state.lastDeathCause = dead[dead.length - 1].cause || 'неизвестно';
    state.worldStats.deaths += dead.length;
    for (const organism of dead) {
      state.resources.carrion.push({
        x: organism.x,
        y: organism.y,
        energy: clamp(organism.genome.size * 1.8 + Math.max(0, organism.energy + 1), .35, 4.8),
        age: 0,
        speciesId: organism.speciesId
      });
      if (random() < .28 && state.plants.length < 175) {
        state.plants.push({ x: organism.x, y: organism.y, energy: 1.1, phase: randomRange(0, TAU), kind: 2 });
      }
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
};

function livingPopulationCentroid(group) {
  return {
    genome: livingAverageGenome(group),
    x: group.reduce((sum, organism) => sum + organism.x, 0) / group.length,
    y: group.reduce((sum, organism) => sum + organism.y, 0) / group.length
  };
}

function livingBarrierBetween(a, b) {
  const samples = 9;
  let barrier = 0;
  for (let index = 1; index < samples; index += 1) {
    const t = index / samples;
    barrier += livingBiomeAt(lerp(a.x, b.x, t), lerp(a.y, b.y, t)).barrier;
  }
  return barrier / (samples - 1);
}

function livingUpdatePopulationStructure(allowSplit = true) {
  const groupedBySpecies = new Map();
  for (const organism of state.organisms) {
    organism.populationKey = livingRegionAt(organism.x, organism.y);
    if (!groupedBySpecies.has(organism.speciesId)) groupedBySpecies.set(organism.speciesId, new Map());
    const groups = groupedBySpecies.get(organism.speciesId);
    if (!groups.has(organism.populationKey)) groups.set(organism.populationKey, []);
    groups.get(organism.populationKey).push(organism);
  }

  let splitPerformed = false;
  for (const species of state.species) {
    const groups = groupedBySpecies.get(species.id) || new Map();
    species.populations ||= {};
    const viableGroups = [...groups.entries()].filter(([, members]) => members.length >= 3);
    viableGroups.sort((a, b) => b[1].length - a[1].length);
    const main = viableGroups[0];
    species.mainPopulationKey = main?.[0] || null;
    const mainCentroid = main ? livingPopulationCentroid(main[1]) : null;
    let total = 0;

    for (const [key, members] of viableGroups) {
      total += members.length;
      const centroid = livingPopulationCentroid(members);
      const record = species.populations[key] ||= {
        key,
        born: state.generation,
        lastSeen: state.generation,
        isolation: 0,
        count: 0,
        previousCount: 0,
        x: centroid.x,
        y: centroid.y,
        centroid: deepClone(centroid.genome),
        trend: 0
      };
      record.previousCount = record.count || members.length;
      record.count = members.length;
      record.lastSeen = state.generation;
      record.x = centroid.x;
      record.y = centroid.y;
      record.centroid = deepClone(centroid.genome);
      record.trend = record.count - record.previousCount;

      if (key !== species.mainPopulationKey && mainCentroid) {
        const separation = Math.hypot(centroid.x - mainCentroid.x, centroid.y - mainCentroid.y);
        const barrier = livingBarrierBetween(centroid, mainCentroid);
        if (members.length >= LIVING_POPULATION_MIN_SIZE && (separation > .24 || barrier > .3)) record.isolation += 1;
        else record.isolation = Math.max(0, record.isolation - 1);
      } else {
        record.isolation = 0;
      }

      const geneticDistance = mainCentroid ? genomeDistance(centroid.genome, mainCentroid.genome) : 0;
      if (
        allowSplit && !splitPerformed && key !== species.mainPopulationKey &&
        record.isolation >= LIVING_POPULATION_SPLIT_AGE &&
        members.length >= LIVING_POPULATION_MIN_SIZE &&
        geneticDistance > .105 &&
        state.species.length < LIVING_SPECIES_LIMIT
      ) {
        const newId = newSpecies(centroid.genome, species.id);
        const descendant = state.species.find((entry) => entry.id === newId);
        if (descendant) {
          descendant.populations = {};
          descendant.mainPopulationKey = key;
          descendant.feedingRole = livingFeedingRole(descendant.centroid);
          descendant.habitatRole = livingHabitatRole(descendant.centroid);
          descendant.originPopulation = key;
          descendant.originIsolation = record.isolation;
        }
        for (const member of members) member.speciesId = newId;
        state.populationEvents.push({
          generation: state.generation,
          type: 'split',
          parentSpeciesId: species.id,
          speciesId: newId,
          populationKey: key
        });
        delete species.populations[key];
        splitPerformed = true;
      }
    }

    for (const [key, record] of Object.entries(species.populations)) {
      if (record.lastSeen < state.generation - 3) delete species.populations[key];
    }
    species.populationTrend = total - (species.previousPopulation || total);
    species.previousPopulation = total;
    if (mainCentroid && total > 0) {
      species.centroid = livingAverageGenome([...groups.values()].flat()) || species.centroid;
      species.feedingRole = livingFeedingRole(species.centroid);
      species.habitatRole = livingHabitatRole(species.centroid);
    }
  }
}

function livingComputeFoodWeb() {
  const web = {};
  const currentSpecies = state.species.filter((species) => species.extinct === null);
  for (const species of currentSpecies) {
    web[species.id] = { prey: {}, predators: {}, competitors: {}, role: livingFeedingRole(species.centroid) };
  }
  for (const organism of state.organisms) {
    if (!organism.lastFoodSpeciesId || organism.lastFoodSpeciesId === organism.speciesId) continue;
    const entry = web[organism.speciesId];
    if (!entry) continue;
    entry.prey[organism.lastFoodSpeciesId] = (entry.prey[organism.lastFoodSpeciesId] || 0) + 1;
  }
  for (const [predatorId, entry] of Object.entries(web)) {
    for (const [preyId, count] of Object.entries(entry.prey)) {
      if (!web[preyId]) continue;
      web[preyId].predators[predatorId] = (web[preyId].predators[predatorId] || 0) + count;
    }
  }
  for (let leftIndex = 0; leftIndex < currentSpecies.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < currentSpecies.length; rightIndex += 1) {
      const left = currentSpecies[leftIndex];
      const right = currentSpecies[rightIndex];
      if (livingFeedingRole(left.centroid) !== livingFeedingRole(right.centroid)) continue;
      const leftPops = new Set(Object.keys(left.populations || {}));
      const overlap = Object.keys(right.populations || {}).some((key) => leftPops.has(key));
      if (!overlap) continue;
      web[left.id].competitors[right.id] = 1;
      web[right.id].competitors[left.id] = 1;
    }
  }
  state.foodWeb = web;
}

finalizeGeneration = function livingFinalizeGeneration() {
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
  livingUpdatePopulationStructure(true);
  livingComputeFoodWeb();
  recordHistory(false);
  updateTimeline();
  updateReadouts();
  saveState();
};

snapshotOrganism = function livingSnapshotOrganism(organism) {
  return {
    id: organism.id,
    x: organism.x,
    y: organism.y,
    vx: organism.vx,
    vy: organism.vy,
    energy: organism.energy,
    age: organism.age,
    generation: organism.generation,
    speciesId: organism.speciesId,
    genome: deepClone(organism.genome),
    sex: organism.sex,
    hybrid: Boolean(organism.hybrid),
    populationKey: organism.populationKey,
    birthBiome: organism.birthBiome
  };
};

ensureLivingState();
if (!intro.hidden && !localStorage.getItem(STORAGE_KEY)) {
  livingBuildMatureWorld('garden');
  state.paused = true;
  removeStoredWorld();
}
