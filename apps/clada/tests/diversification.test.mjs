import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { globalThis: {} };
vm.runInNewContext(fs.readFileSync(new URL('../runtime/v3/14-diversification-core.js', import.meta.url), 'utf8'), context);
const D = context.globalThis.CladaDiversificationCore;

function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function normal(random) {
  const u = Math.max(1e-9, random());
  const v = Math.max(1e-9, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

const regions = [
  { x: .12, y: .2, water: false, moisture: .78, elevation: .28, temperature: .58, biome: 'forest' },
  { x: .82, y: .2, water: false, moisture: .24, elevation: .38, temperature: .72, biome: 'desert' },
  { x: .18, y: .78, water: true, moisture: .94, elevation: .16, temperature: .54, biome: 'ocean' },
  { x: .78, y: .75, water: false, moisture: .52, elevation: .82, temperature: .24, biome: 'highland' },
  { x: .5, y: .48, water: false, moisture: .58, elevation: .42, temperature: .52, biome: 'grassland' },
  { x: .52, y: .82, water: true, moisture: .88, elevation: .32, temperature: .66, biome: 'shallows' }
];
const roles = ['plant', 'prey', 'carrion', 'filter'];

function genomeFor(role, region, random) {
  const g = {
    plantDiet: .12, preyDiet: .12, carrionDiet: .12, filterDiet: .08,
    waterAffinity: region.water ? .78 : .16,
    moisture: region.moisture,
    altitude: region.elevation,
    thermal: region.temperature,
    size: .65 + random() * .7,
    nocturnal: random() * .6,
    migration: .25 + random() * .45,
    mateChoice: .48 + random() * .35
  };
  if (role === 'plant') g.plantDiet = .82;
  if (role === 'prey') g.preyDiet = .84;
  if (role === 'carrion') g.carrionDiet = .86;
  if (role === 'filter') { g.filterDiet = .9; g.waterAffinity = .9; }
  return g;
}

function targetFor(role, region) {
  const g = genomeFor(role, region, () => .5);
  g.mateChoice = .72;
  return g;
}

function blendGenome(a, b, rate) {
  for (const key of Object.keys(a)) if (typeof a[key] === 'number' && typeof b[key] === 'number') a[key] += (b[key] - a[key]) * rate;
}

function geneticDistance(a, b) {
  const keys = ['plantDiet', 'preyDiet', 'carrionDiet', 'filterDiet', 'waterAffinity', 'moisture', 'altitude', 'thermal', 'size', 'nocturnal', 'migration', 'mateChoice'];
  return Math.sqrt(keys.reduce((sum, key) => sum + (a[key] - b[key]) ** 2, 0) / keys.length);
}

function macroRun(seed, origin = 'mature', generations = 600) {
  const random = rng(seed);
  let nextSpecies = 1, nextPopulation = 1;
  const populations = [];
  const extinctSpecies = new Set();
  let speciations = 0;
  let firstSpeciation = null;
  let globalLastSpeciation = -999;
  const lastSpeciationBySpecies = new Map();
  const snapshots = {};

  const initial = origin === 'mature' ? 8 : origin === 'single' ? 1 : 3;
  for (let index = 0; index < initial; index += 1) {
    const region = regions[index % regions.length];
    const role = roles[index % roles.length];
    populations.push({
      id: nextPopulation++, speciesId: nextSpecies++, region: index % regions.length, role,
      genome: genomeFor(role, region, random), size: origin === 'mature' ? 16 + random() * 8 : 13 + random() * 5,
      founded: 0, isolationAge: 0, geneFlow: 0, lowYears: 0
    });
  }

  for (let generation = 1; generation <= generations; generation += 1) {
    const living = populations.filter((p) => p.size >= 1);
    const bySpecies = new Map();
    for (const p of living) {
      if (!bySpecies.has(p.speciesId)) bySpecies.set(p.speciesId, []);
      bySpecies.get(p.speciesId).push(p);
    }

    if (generation % 18 === 0) {
      for (const [speciesId, pops] of bySpecies) {
        const source = [...pops].sort((a, b) => b.size - a.size)[0];
        if (!source || source.size < 13 || random() > .29) continue;
        const occupied = new Set(pops.map((p) => `${p.region}:${p.role}`));
        const options = [];
        for (let r = 0; r < regions.length; r += 1) for (const role of roles) {
          if (role === 'filter' && !regions[r].water) continue;
          if (!occupied.has(`${r}:${role}`)) options.push([r, role]);
        }
        if (!options.length) continue;
        let choice;
        const sameRoleOptions = options.filter((entry) => entry[1] === source.role);
        if (sameRoleOptions.length && random() > .58) choice = sameRoleOptions[Math.floor(random() * sameRoleOptions.length)];
        else choice = options[Math.floor(random() * options.length)];
        const [regionIndex, role] = choice;
        source.size -= 3.5;
        populations.push({
          id: nextPopulation++, speciesId, region: regionIndex, role,
          genome: structuredClone(source.genome), size: 3.5,
          founded: generation, isolationAge: 0, geneFlow: 0, lowYears: 0
        });
      }
    }

    for (const p of living) {
      const region = regions[p.region];
      const target = targetFor(p.role, region);
      const mismatch = 1 - Math.max(0, 1 - Math.abs(p.genome.thermal - region.temperature) - Math.abs(p.genome.moisture - region.moisture) * .4);
      const rate = D.adaptiveRate({ mismatch, opportunity: .55, isolation: Math.min(1, p.isolationAge / 30) });
      blendGenome(p.genome, target, rate);
      for (const key of Object.keys(p.genome)) if (typeof p.genome[key] === 'number' && random() < .08) {
        p.genome[key] = Math.max(0, Math.min(key === 'size' ? 1.72 : 1, p.genome[key] + normal(random) * .0028));
      }
    }

    for (const pops of bySpecies.values()) {
      for (let i = 0; i < pops.length; i += 1) for (let j = i + 1; j < pops.length; j += 1) {
        const a = pops[i], b = pops[j];
        const spatial = Math.hypot(regions[a.region].x - regions[b.region].x, regions[a.region].y - regions[b.region].y);
        const eco = D.nicheDistance(a.genome, b.genome);
        const flow = Math.exp(-spatial * 5.2 - eco * 7.5) * .34 * (1 - Math.min(a.isolationAge, b.isolationAge) / 55);
        a.geneFlow = a.geneFlow * .72 + flow * .28;
        b.geneFlow = b.geneFlow * .72 + flow * .28;
        if (flow > .015) {
          const mean = {};
          for (const key of Object.keys(a.genome)) mean[key] = (a.genome[key] + b.genome[key]) / 2;
          blendGenome(a.genome, mean, flow * .08);
          blendGenome(b.genome, mean, flow * .08);
        }
      }
    }

    const buckets = new Map();
    for (const p of living) {
      const key = `${p.region}:${p.role}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    }

    for (const p of living) {
      const bucket = buckets.get(`${p.region}:${p.role}`);
      const total = bucket.reduce((sum, q) => sum + q.size, 0);
      const own = bucket.filter((q) => q.speciesId === p.speciesId).reduce((sum, q) => sum + q.size, 0);
      const region = regions[p.region];
      const capacity = (region.water ? 25 : region.biome === 'desert' ? 12 : region.biome === 'highland' ? 15 : 24) * (p.role === 'prey' ? .68 : p.role === 'carrion' ? .45 : p.role === 'filter' ? .85 : 1);
      const adjustment = D.frequencyAdjustment({ own, total, capacity, overlap: .72 }) * 220;
      let growth = p.size * (.075 * (1 - total / Math.max(4, capacity)) + adjustment * .22);
      if (p.role === 'plant') growth += .22;
      if (p.role === 'prey') {
        const predators = living.filter((q) => q.region === p.region && q.role === 'prey' && q.speciesId !== p.speciesId).reduce((sum, q) => sum + q.size, 0);
        const refuge = D.preyRefuge({ prey: p.size, predators, community: living.reduce((sum, q) => sum + q.size, 0) });
        growth -= predators * .006 * (1 - refuge);
      }
      growth += normal(random) * .12;
      p.size = Math.max(0, p.size + growth);
      p.lowYears = p.size < 1.2 ? p.lowYears + 1 : 0;
      if (p.lowYears > 5) p.size = 0;
    }

    const currentBySpecies = new Map();
    for (const p of populations.filter((q) => q.size >= 1)) {
      if (!currentBySpecies.has(p.speciesId)) currentBySpecies.set(p.speciesId, []);
      currentBySpecies.get(p.speciesId).push(p);
    }

    for (const [speciesId, pops] of currentBySpecies) {
      if (pops.length < 2) continue;
      const decisions = [];
      for (const p of pops) {
        const others = pops.filter((q) => q !== p);
        const reference = others.sort((a, b) => b.size - a.size)[0];
        const genetic = geneticDistance(p.genome, reference.genome);
        const ecological = D.nicheDistance(p.genome, reference.genome);
        const spatial = Math.min(...others.map((q) => Math.hypot(regions[p.region].x - regions[q.region].x, regions[p.region].y - regions[q.region].y)));
        const barrier = regions[p.region].water !== regions[reference.region].water ? .68 : Math.abs(regions[p.region].elevation - regions[reference.region].elevation) > .35 ? .7 : .15;
        const separated = spatial > .15 || ecological > .075 || barrier > .4;
        p.isolationAge = separated && p.geneFlow < .24 ? p.isolationAge + 1 : Math.max(0, p.isolationAge - 1);
        const decision = D.speciationDecision({
          size: p.size,
          age: generation - p.founded,
          isolationAge: p.isolationAge,
          genetic, ecological, spatial, barrier, geneFlow: p.geneFlow,
          assortative: p.genome.mateChoice * (.58 + ecological * 1.4),
          opportunity: Math.max(0, Math.min(1, (4 - currentBySpecies.size) / 4))
        });
        if (decision.promote) decisions.push({ p, decision });
      }
      decisions.sort((a, b) => b.decision.isolation - a.decision.isolation);
      if (decisions.length) {
        const livingRichness = new Set(populations.filter((q) => q.size >= 1).map((q) => q.speciesId)).size;
        const richnessMinSize = 6 + Math.floor(Math.max(0, livingRichness - 10) / 3);
        const chosen = decisions.find((entry) => entry.p.size >= richnessMinSize);
        const lineageReady = generation - (lastSpeciationBySpecies.get(speciesId) ?? -999) >= 16;
        const globalReady = generation - globalLastSpeciation >= 2;
        if (!chosen || !lineageReady || !globalReady) continue;
        const newSpecies = nextSpecies++;
        chosen.p.speciesId = newSpecies;
        chosen.p.founded = generation;
        chosen.p.isolationAge = 0;
        chosen.p.geneFlow = 0;
        lastSpeciationBySpecies.set(speciesId, generation);
        lastSpeciationBySpecies.set(newSpecies, generation);
        globalLastSpeciation = generation;
        speciations += 1;
        firstSpeciation ??= generation;
      }
    }

    const aliveSpecies = new Set(populations.filter((p) => p.size >= 1).map((p) => p.speciesId));
    if (generation === 200 || generation === 500 || generation === 1000) snapshots[generation] = aliveSpecies.size;
    for (let id = 1; id < nextSpecies; id += 1) if (!aliveSpecies.has(id)) extinctSpecies.add(id);
  }

  const alive = populations.filter((p) => p.size >= 1);
  return {
    species: new Set(alive.map((p) => p.speciesId)).size,
    populations: alive.length,
    speciations,
    extinctions: extinctSpecies.size,
    total: alive.reduce((sum, p) => sum + p.size, 0),
    firstSpeciation,
    snapshots
  };
}

test('ecological and allopatric isolation can create a species', () => {
  const decision = D.speciationDecision({ size: 10, age: 60, isolationAge: 36, genetic: .1, ecological: .27, spatial: .45, barrier: .8, geneFlow: .01, assortative: .82 });
  assert.equal(decision.promote, true);
  assert.ok(decision.isolation > .65);
});

test('high gene flow prevents a false split', () => {
  const decision = D.speciationDecision({ size: 14, age: 80, isolationAge: 30, genetic: .09, ecological: .22, spatial: .25, barrier: .4, geneFlow: .52, assortative: .8 });
  assert.equal(decision.promote, false);
});

test('rare ecotypes get a frequency-dependent advantage', () => {
  const rare = D.frequencyAdjustment({ own: 2, total: 22, capacity: 16, overlap: .8 });
  const common = D.frequencyAdjustment({ own: 18, total: 22, capacity: 16, overlap: .8 });
  assert.ok(rare > common);
});

test('rare prey gains a refuge under predation', () => {
  assert.ok(D.preyRefuge({ prey: 2, predators: 14, community: 120 }) > .5);
  assert.ok(D.preyRefuge({ prey: 25, predators: 4, community: 120 }) < .15);
});


test('a surviving single lineage radiates instead of remaining one species forever', () => {
  const runs = Array.from({ length: 24 }, (_, index) => macroRun(7000 + index, 'single', 500));
  assert.ok(runs.filter((run) => run.speciations > 0).length >= 20, JSON.stringify(runs));
  assert.ok(runs.filter((run) => run.species > 1).length >= 20, JSON.stringify(runs));
  assert.ok(runs.filter((run) => run.firstSpeciation !== null && run.firstSpeciation <= 300).length >= 16, JSON.stringify(runs));
});

test('macro model retains and generates diversity through 600 generations', () => {
  const mature = Array.from({ length: 24 }, (_, index) => macroRun(1000 + index, 'mature'));
  const primordial = Array.from({ length: 24 }, (_, index) => macroRun(3000 + index, 'primordial'));
  const matureMulti = mature.filter((run) => run.species > 1).length;
  const primordialMulti = primordial.filter((run) => run.species > 1).length;
  const matureSpeciation = mature.filter((run) => run.speciations > 0).length;
  const primordialSpeciation = primordial.filter((run) => run.speciations > 0).length;
  assert.ok(matureMulti >= 22, JSON.stringify(mature));
  assert.ok(primordialMulti >= 20, JSON.stringify(primordial));
  assert.ok(matureSpeciation >= 18, JSON.stringify(mature));
  assert.ok(primordialSpeciation >= 18, JSON.stringify(primordial));
  assert.ok(mature.every((run) => Number.isFinite(run.total) && run.total > 5));
});

if (process.argv.includes('--report')) {
  const mature = Array.from({ length: 20 }, (_, index) => macroRun(5000 + index, 'mature', 800));
  const primordial = Array.from({ length: 20 }, (_, index) => macroRun(9000 + index, 'primordial', 800));
  const single = Array.from({ length: 20 }, (_, index) => macroRun(13000 + index, 'single', 800));
  const summarize = (runs) => ({
    runs: runs.length,
    speciesMin: Math.min(...runs.map((r) => r.species)),
    speciesMedian: [...runs].sort((a, b) => a.species - b.species)[Math.floor(runs.length / 2)].species,
    speciesMax: Math.max(...runs.map((r) => r.species)),
    speciationRuns: runs.filter((r) => r.speciations > 0).length,
    medianSpeciations: [...runs].sort((a, b) => a.speciations - b.speciations)[Math.floor(runs.length / 2)].speciations,
    medianPopulations: [...runs].sort((a, b) => a.populations - b.populations)[Math.floor(runs.length / 2)].populations,
    collapsed: runs.filter((r) => r.species <= 1).length,
    collapsedAt200: runs.filter((r) => (r.snapshots[200] || 0) <= 1).length,
    medianAt200: [...runs].sort((a, b) => (a.snapshots[200] || 0) - (b.snapshots[200] || 0))[Math.floor(runs.length / 2)].snapshots[200],
    medianFirstSpeciation: [...runs].filter((r) => r.firstSpeciation !== null).sort((a, b) => a.firstSpeciation - b.firstSpeciation)[Math.floor(runs.filter((r) => r.firstSpeciation !== null).length / 2)]?.firstSpeciation ?? null
  });
  console.log(JSON.stringify({ mature: summarize(mature), primordial: summarize(primordial), single: summarize(single) }, null, 2));
}
