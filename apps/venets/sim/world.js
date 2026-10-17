// ВЕНЕЦ v0.4 — deterministic world, kinship and explainable political AI.
import { initialRngState, normalizeSeed, randomInt } from './random.js';
import { recordEvent, transfer, changeTitleHolder } from './transactions.js';
import { assertWorld } from './validate.js';
import { assertWorldV2 } from './validate-v2.js';
import { assertWorldV3 } from './validate-v3.js';
import { initializePolitics, politicalYear, possibleActions, chooseGoal, opinion, remember } from './politics.js';
import { seedFamilyFoundations, demographicYear, migrateV2, birth, marry, die, setSuccessionLaw, descendantBranches, resolveInheritance, ancestors, titlesOf } from './dynasty.js';
export { transfer, recordEvent, changeTitleHolder, assertWorld, birth, marry, die, setSuccessionLaw, descendantBranches, resolveInheritance, ancestors, titlesOf, politicalYear, possibleActions, chooseGoal, opinion, remember };

export const WORLD_SCHEMA_VERSION = 4;
export const START_YEAR = 1066;
const COUNTY_NAMES = ['Берег','Ольхов','Перевал','Вышград','Чернолесье','Речица',
  'Вельск','Устье','Луговое','Белый Яр','Залесье','Кремень'];
const DUCHY_NAMES = ['Прибрежье','Срединные земли','Нагорье','Верховье'];
const NAMES = ['Мирослав','Радослав','Ярослав','Святополк','Всеволод','Добромир',
  'Ростислав','Владислав','Изяслав','Тихомир','Борислав','Глеб','Болеслав','Павел'];
const DYNASTIES = ['Лесские','Ольховичи','Береговичи','Яровичи','Вельские'];

function two(n) { return String(n).padStart(2, '0'); }
const personId = n => 'pe-' + two(n);
const provinceId = n => 'pr-' + two(n);
const countyId = n => 'co-' + two(n);
const duchyId = n => 'du-' + two(n);
function sumInitial(entities, good) {
  return entities.reduce((sum, entity) => sum + entity.treasury[good], 0);
}

export function createWorld(seed = 1) {
  const sourceSeed = normalizeSeed(seed);
  const world = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    seed: sourceSeed,
    rngState: initialRngState(sourceSeed),
    year: START_YEAR,
    nextEventId: 1,
    dynasties: DYNASTIES.map((name, i) => ({ id: 'dy-' + two(i + 1), name })),
    people: [],
    titles: [],
    provinces: [],
    ledger: { initial: { grain: 0, coin: 0 }, created: { grain: 0, coin: 0 }, consumed: { grain: 0, coin: 0 } },
    stats: { years: 0, shortages: 0, harvested: 0, minted: 0, taxGrain: 0, taxCoin: 0 },
    events: []
  };
  // 12 county holders, four ducal holders, one crown holder. No placeholder heirs.
  for (let i = 1; i <= 17; i++) {
    const dynasty = i === 17 ? 0 : randomInt(world, DYNASTIES.length);
    world.people.push({
      id: personId(i),
      name: NAMES[randomInt(world, NAMES.length)] + ' ' + DYNASTIES[dynasty],
      dynastyId: world.dynasties[dynasty].id,
      birthYear: START_YEAR - (24 + randomInt(world, 29)),
      treasury: { grain: 30 + randomInt(world, 81), coin: 12 + randomInt(world, 38) }
    });
  }
  world.titles.push({
    id: 'ki-01', name: 'Королевство Междуречье', rank: 'kingdom',
    liegeId: null, provinceId: null, holderId: personId(17)
  });
  for (let i = 1; i <= 4; i++) {
    world.titles.push({
      id: duchyId(i), name: 'Герцогство ' + DUCHY_NAMES[i - 1],
      rank: 'duchy', liegeId: 'ki-01', provinceId: null, holderId: personId(12 + i)
    });
  }
  // Rectangular neighbor graph is an abstract adjacency topology, not a tactical grid.
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 4; x++) {
      const n = y * 4 + x + 1;
      const adjacent = [
        x > 0 ? n - 1 : null, x < 3 ? n + 1 : null,
        y > 0 ? n - 4 : null, y < 2 ? n + 4 : null
      ].filter(value => value !== null).map(provinceId).sort();
      const hill = randomInt(world, 4) === 0;
      const p = {
        id: provinceId(n), titleId: countyId(n),
        name: COUNTY_NAMES[n - 1], x, y, neighbors: adjacent,
        terrain: hill ? 'hills' : 'plains',
        baseYield: (hill ? 116 : 134) + randomInt(world, 31),
        baseTrade: 12 + randomInt(world, 14),
        demand: 97 + randomInt(world, 35),
        treasury: { grain: 35 + randomInt(world, 80), coin: 12 + randomInt(world, 30) },
        lastShortage: 0, shortages: 0
      };
      world.provinces.push(p);
      world.titles.push({
        id: countyId(n), name: 'Графство ' + p.name,
        rank: 'county', liegeId: duchyId(x + 1), provinceId: p.id,
        holderId: personId(n)
      });
    }
  }
  seedFamilyFoundations(world);
  initializePolitics(world);
  for (const good of ['grain', 'coin']) {
    world.ledger.initial[good] = sumInitial([...world.people, ...world.provinces], good);
  }
  recordEvent(world, 'foundation', 'seeded-world', {
    seed: sourceSeed, kingdom: 'ki-01', provinces: 12, titles: 17, people: world.people.length
  });
  assertWorld(world);
  return world;
}

function annualTax(world, province, good, cap, cause) {
  const county = world.titles.find(t => t.id === province.titleId);
  const duke = world.titles.find(t => t.id === county.liegeId);
  const king = world.titles.find(t => t.id === duke.liegeId);
  const base = Math.min(province.treasury[good], Math.max(0, cap));
  const tax = Math.floor(base);
  if (tax <= 0) return;
  transfer(world, { good, from: 'province:' + province.id, to: 'person:' + county.holderId, amount: tax, cause });
  const dues = Math.floor(tax / 3);
  if (dues > 0 && duke.holderId !== county.holderId) {
    transfer(world, { good, from: 'person:' + county.holderId, to: 'person:' + duke.holderId,
      amount: dues, cause: 'feudal-dues:' + province.id });
  }
  const crown = Math.floor(dues / 4);
  if (crown > 0 && king.holderId !== duke.holderId) {
    transfer(world, { good, from: 'person:' + duke.holderId, to: 'person:' + king.holderId,
      amount: crown, cause: 'crown-dues:' + province.id });
  }
  world.stats[good === 'grain' ? 'taxGrain' : 'taxCoin'] += tax;
}
export function stepYear(world) {
  assertWorld(world);
  if (world.year >= 5000) throw new RangeError('Calendar end reached');
  world.year++;
  for (const p of world.provinces) {
    // One weather roll and two economic flows per province, in stable ID order.
    const weather = randomInt(world, 7) - 3;
    const harvest = Math.max(0, p.baseYield + weather * 14);
    transfer(world, { good: 'grain', to: 'province:' + p.id, amount: harvest,
      cause: 'harvest:' + p.id + ':weather:' + weather });
    world.stats.harvested += harvest;
    const used = Math.min(p.treasury.grain, p.demand);
    transfer(world, { good: 'grain', from: 'province:' + p.id, amount: used, cause: 'subsistence:' + p.id });
    p.lastShortage = p.demand - used;
    if (p.lastShortage > 0) {
      p.shortages++;
      world.stats.shortages++;
      recordEvent(world, 'shortage', 'subsistence-deficit:' + p.id, {
        provinceId: p.id, missing: p.lastShortage, required: p.demand, consumed: used
      });
    }
    const trade = Math.max(0, p.baseTrade + randomInt(world, 7) - 3);
    transfer(world, { good: 'coin', to: 'province:' + p.id, amount: trade, cause: 'outside-trade:' + p.id });
    world.stats.minted += trade; // external inflow; not fictitious internal conservation.
    const upkeep = Math.min(p.treasury.coin, Math.floor(p.baseTrade * 0.6));
    transfer(world, { good: 'coin', from: 'province:' + p.id, amount: upkeep, cause: 'maintenance:' + p.id });
    annualTax(world, p, 'grain', Math.floor(harvest * 0.12), 'grain-tax:' + p.id);
    annualTax(world, p, 'coin', Math.floor(trade * 0.28), 'coin-tax:' + p.id);
  }
  demographicYear(world);
  politicalYear(world);
  world.stats.years++;
  recordEvent(world, 'year-closed', 'calendar-tick', {
    year: world.year, shortages: world.stats.shortages,
    grainCreated: world.ledger.created.grain, coinCreated: world.ledger.created.coin
  });
  return world;
}
export function advanceYears(world, years = 1) {
  if (!Number.isSafeInteger(years) || years < 0 || years > 200) throw new RangeError('Years must be an integer in [0, 200]');
  if (world.year + years > 5000) throw new RangeError('Advance exceeds calendar end');
  for (let i = 0; i < years; i++) stepYear(world);
  return world;
}
export function serializeWorld(world) {
  assertWorld(world);
  return JSON.stringify(world);
}
export function loadWorld(source) {
  if (typeof source !== 'string' || source.length > 16_000_000 || source.length < 50) throw new RangeError('Invalid save payload');
  const world = JSON.parse(source);
  if (world.schemaVersion === 2) {
    assertWorldV2(world);
    migrateV2(world);
  }
  if (world.schemaVersion === 3) {
    assertWorldV3(world);
    initializePolitics(world,{migration:true});
  }
  assertWorld(world);
  return world;
}
export function summary(world) {
  const report = assertWorld(world);
  return { ...report, seed: world.seed, shortages: world.stats.shortages,
    harvested: world.stats.harvested, minted: world.stats.minted,
    births:world.stats.births, deaths:world.stats.deaths, marriages:world.stats.marriages,
    partitions:world.stats.partitions, escheats:world.stats.escheats,
    alive:world.people.filter(p=>p.alive).length,
    dynastiesRepresented:new Set(world.people.filter(p=>p.alive).map(p=>p.dynastyId)).size,
    politics:{...world.politics.stats,activeFactions:world.politics.factions.length},
    ledger: structuredClone(world.ledger) };
}
