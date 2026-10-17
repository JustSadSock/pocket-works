// Strong structural + double-entry validation; use at boundaries, not every browser frame.
function demand(condition, message) { if (!condition) throw new Error('Invalid Venets world: ' + message); }
const safe = value => Number.isSafeInteger(value) && value >= 0;
export function assertWorld(world) {
  demand(world && typeof world === 'object' && !Array.isArray(world), 'world object');
  demand(world.schemaVersion === 2 && safe(world.seed) && world.seed <= 0xffffffff, 'schema/seed');
  demand(safe(world.rngState) && world.rngState <= 0xffffffff && world.rngState !== 0, 'PRNG');
  demand(Number.isSafeInteger(world.year) && world.year >= 1066 && world.year <= 5000, 'calendar');
  demand(Array.isArray(world.provinces) && world.provinces.length === 12, 'province count');
  demand(Array.isArray(world.titles) && world.titles.length === 17, 'title count');
  demand(Array.isArray(world.people) && world.people.length === 17, 'people count');
  demand(Array.isArray(world.dynasties) && world.dynasties.length === 5, 'dynasty count');
  demand(Array.isArray(world.events) && safe(world.nextEventId) && world.nextEventId === world.events.length + 1, 'event sequence');
  const index = (array, label) => {
    const map = new Map(array.map(item => [item?.id, item]));
    demand(map.size === array.length && !map.has(undefined), 'unique ' + label);
    return map;
  };
  const provinces = index(world.provinces, 'provinces');
  const titles = index(world.titles, 'titles');
  const people = index(world.people, 'people');
  const dynasties = index(world.dynasties, 'dynasties');
  demand(dynasties.size === 5 && [...dynasties.values()].every(d => typeof d.name === 'string' && d.name), 'dynasties');
  const rank = { county: 1, duchy: 2, kingdom: 3 };
  let counties = 0, duchies = 0, kingdoms = 0;
  const provinceTitleIds = new Set();
  for (const t of world.titles) {
    demand(rank[t.rank] && people.has(t.holderId), 'holder/rank on ' + t.id);
    if (t.rank === 'county') {
      counties++;
      demand(typeof t.provinceId === 'string' && provinces.has(t.provinceId), 'county province');
      demand(!provinceTitleIds.has(t.provinceId), 'duplicate county province');
      provinceTitleIds.add(t.provinceId);
    } else demand(t.provinceId === null, 'non-county province');
    if (t.rank === 'duchy') duchies++;
    if (t.rank === 'kingdom') kingdoms++;
    if (t.liegeId !== null) {
      const liege = titles.get(t.liegeId);
      demand(liege && rank[liege.rank] === rank[t.rank] + 1, 'invalid liege rank');
    } else demand(t.rank === 'kingdom', 'multiple roots');
    let cursor = t, hops = 0;
    while (cursor.liegeId !== null) {
      cursor = titles.get(cursor.liegeId);
      demand(cursor && ++hops <= 2, 'cycle or too-deep hierarchy');
    }
  }
  demand(counties === 12 && duchies === 4 && kingdoms === 1, 'title hierarchy composition');
  const visited = new Set(['pr-01']), queue = ['pr-01'];
  while (queue.length) {
    const p = provinces.get(queue.shift());
    demand(p, 'grid connected start');
    for (const id of p.neighbors) if (!visited.has(id)) { visited.add(id); queue.push(id); }
  }
  demand(visited.size === 12, 'contiguous province graph');
  for (const p of world.provinces) {
    demand(titles.get(p.titleId)?.provinceId === p.id, 'province/county relation');
    demand(safe(p.x) && safe(p.y) && p.x < 4 && p.y < 3, 'province coordinates');
    demand(safe(p.baseYield) && safe(p.baseTrade) && safe(p.demand), 'province economy parameters');
    demand(safe(p.shortages) && safe(p.lastShortage), 'shortage counters');
    demand(Array.isArray(p.neighbors) && new Set(p.neighbors).size === p.neighbors.length, 'duplicate neighbors');
    for (const n of p.neighbors) demand(n !== p.id && provinces.get(n)?.neighbors.includes(p.id), 'asymmetric neighbors');
  }
  for (const p of world.people) {
    demand(dynasties.has(p.dynastyId) && Number.isSafeInteger(p.birthYear), 'person dynasty/birth');
    demand(typeof p.name === 'string' && p.name, 'person name');
  }
  const totals = { grain: 0, coin: 0 };
  for (const entity of [...world.provinces, ...world.people]) {
    for (const good of ['grain','coin']) {
      demand(safe(entity.treasury?.[good]), 'negative or invalid ' + good + ' at ' + entity.id);
      totals[good] += entity.treasury[good];
    }
  }
  for (const good of ['grain','coin']) {
    demand(safe(world.ledger?.initial?.[good]) && safe(world.ledger?.created?.[good]) && safe(world.ledger?.consumed?.[good]), 'invalid ledger ' + good);
    demand(totals[good] === world.ledger.initial[good] + world.ledger.created[good] - world.ledger.consumed[good], 'unbalanced ledger ' + good);
  }
  demand(world.stats && safe(world.stats.years) && world.stats.years === world.year - 1066 && safe(world.stats.shortages) && safe(world.stats.harvested) && safe(world.stats.minted) && safe(world.stats.taxGrain) && safe(world.stats.taxCoin), 'time metrics');
  demand(world.events.every((e, i) => e?.id === i + 1 && e.year >= 1066 && e.year <= world.year && typeof e.kind === 'string' && typeof e.cause === 'string' && e.effect && typeof e.effect === 'object'), 'event integrity');
  return { provinces: provinces.size, titles: titles.size, people: people.size, dynasties: dynasties.size, year: world.year, events: world.events.length, resources: totals };
}
