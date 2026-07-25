/* КЛАДА 3.1 — чистые функции макроэволюционной модели. */
globalThis.CladaDiversificationCore = (() => {
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const roleKeys = ['plantDiet', 'preyDiet', 'carrionDiet', 'filterDiet'];

  function roleOf(genome = {}) {
    let best = roleKeys[0];
    for (const key of roleKeys) if ((genome[key] || 0) > (genome[best] || 0)) best = key;
    return best.replace('Diet', '');
  }

  function ecotypeKey(genome = {}, terrain = null) {
    const role = roleOf(genome);
    const habitat = terrain?.water || (genome.waterAffinity || 0) > .66
      ? 'water'
      : terrain?.moisture > .68 || (genome.moisture || 0) > .7
        ? 'wet'
        : terrain?.elevation > .7 || (genome.altitude || 0) > .72
          ? 'high'
          : 'land';
    const activity = (genome.nocturnal || 0) > .68 ? 'night' : 'day';
    return `${role}:${habitat}:${activity}`;
  }

  function nicheVector(genome = {}) {
    return [
      genome.plantDiet || 0,
      genome.preyDiet || 0,
      genome.carrionDiet || 0,
      genome.filterDiet || 0,
      genome.waterAffinity || 0,
      genome.moisture || 0,
      genome.altitude || 0,
      genome.thermal || 0,
      clamp(((genome.size || 1) - .42) / 1.3),
      genome.nocturnal || 0,
      genome.migration || 0
    ];
  }

  function nicheDistance(a = {}, b = {}) {
    const av = nicheVector(a), bv = nicheVector(b);
    const weights = [1.35, 1.35, .85, 1.05, 1.2, .75, .7, .9, .45, .35, .3];
    let sum = 0, weight = 0;
    for (let index = 0; index < av.length; index += 1) {
      sum += (av[index] - bv[index]) ** 2 * weights[index];
      weight += weights[index];
    }
    return Math.sqrt(sum / weight);
  }

  function reproductiveIsolation(input = {}) {
    const genetic = clamp(((input.genetic || 0) - .018) / .13);
    const ecological = clamp(((input.ecological || 0) - .025) / .34);
    const spatial = clamp(((input.spatial || 0) - .09) / .42 + (input.barrier || 0) * .24);
    const duration = clamp((input.duration || 0) / 34);
    const assortative = clamp(input.assortative || 0);
    const flowPenalty = clamp((input.geneFlow || 0) / .38);
    return clamp(genetic * .29 + ecological * .25 + spatial * .17 + duration * .16 + assortative * .13 - flowPenalty * .39);
  }

  function speciationDecision(input = {}) {
    const size = input.size || 0;
    const age = input.age || 0;
    const isolationAge = input.isolationAge || 0;
    const genetic = input.genetic || 0;
    const ecological = input.ecological || 0;
    const spatial = input.spatial || 0;
    const barrier = input.barrier || 0;
    const geneFlow = input.geneFlow || 0;
    const assortative = input.assortative || 0;
    const opportunity = clamp(input.opportunity || 0);
    const isolation = Number.isFinite(input.isolation)
      ? input.isolation
      : reproductiveIsolation({ genetic, ecological, spatial, barrier, duration: isolationAge, geneFlow, assortative });

    const allopatric = size >= 7 && age >= 20 - opportunity * 5 && isolationAge >= 16 - opportunity * 5 && geneFlow <= .16 + opportunity * .025 &&
      genetic >= .05 - opportunity * .012 && (ecological >= .07 - opportunity * .018 || spatial >= .25 - opportunity * .04 || barrier >= .58) && isolation >= .62 - opportunity * .055;
    const ecologicalSplit = size >= 8 && age >= 30 - opportunity * 7 && isolationAge >= 20 - opportunity * 6 && geneFlow <= .18 + opportunity * .02 &&
      genetic >= .04 - opportunity * .008 && ecological >= .18 - opportunity * .035 && assortative >= .58 - opportunity * .06 && isolation >= .64 - opportunity * .05;
    const strongIsolation = size >= 6 && age >= 46 - opportunity * 8 && isolationAge >= 32 - opportunity * 8 && geneFlow <= .08 + opportunity * .015 &&
      genetic >= .065 - opportunity * .01 && isolation >= .7 - opportunity * .05;

    return {
      promote: allopatric || ecologicalSplit || strongIsolation,
      mode: allopatric ? 'allopatric' : ecologicalSplit ? 'ecological' : strongIsolation ? 'reproductive' : null,
      isolation
    };
  }

  function frequencyAdjustment(input = {}) {
    const own = Math.max(0, input.own || 0);
    const total = Math.max(own, input.total || own);
    const capacity = Math.max(1, input.capacity || 12);
    const overlap = clamp(input.overlap ?? .7);
    const saturation = clamp((total - capacity) / capacity, 0, 2);
    const conspecific = clamp((own - capacity * .45) / capacity, 0, 2);
    const rarity = total > 2 ? clamp((.24 - own / total) / .24) : 0;
    return clamp(rarity * .00105 - saturation * (.00055 + overlap * .00035) - conspecific * .00042, -.0023, .00115);
  }

  function preyRefuge(input = {}) {
    const prey = Math.max(0, input.prey || 0);
    const predators = Math.max(0, input.predators || 0);
    const community = Math.max(prey, input.community || prey);
    const rarity = clamp((Math.max(6, community * .055) - prey) / Math.max(6, community * .055));
    const pressure = clamp(predators / Math.max(2, prey * 1.8));
    return clamp(rarity * (.5 + pressure * .38), 0, .88);
  }

  function adaptiveRate(input = {}) {
    const mismatch = clamp(input.mismatch || 0);
    const opportunity = clamp(input.opportunity || 0);
    const isolation = clamp(input.isolation || 0);
    return .0012 + mismatch * .0052 + opportunity * .0028 + isolation * .0012;
  }

  return {
    clamp,
    roleKeys,
    roleOf,
    ecotypeKey,
    nicheVector,
    nicheDistance,
    reproductiveIsolation,
    speciationDecision,
    frequencyAdjustment,
    preyRefuge,
    adaptiveRate
  };
})();
