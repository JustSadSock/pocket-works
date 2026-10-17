import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advanceYears, stepYear, summary, serializeWorld, loadWorld,
  transfer, changeTitleHolder, assertWorld, WORLD_SCHEMA_VERSION } from '../sim/world.js';

test('canonical world topology: 12 contiguous counties, 4 duchies, 1 kingdom', () => {
  for (const seed of [0, 1, 42, 413, 7777, 0xffffffff]) {
    const w = createWorld(seed);
    const check = assertWorld(w);
    assert.equal(check.provinces, 12);
    assert.equal(check.titles, 17);
    assert.equal(check.people, 17);
    assert.equal(check.dynasties, 5);
    assert.equal(w.events[0].kind, 'foundation');
    assert.equal(w.schemaVersion, WORLD_SCHEMA_VERSION);
    assert.equal(w.provinces[0].neighbors.length, 2);
    assert.equal(w.provinces[5].neighbors.length, 4);
    assert.equal(w.ledger.created.grain, 0);
    assert.equal(w.ledger.consumed.coin, 0);
  }
});
test('same seed + steps returns byte-identical full journal and snapshot', () => {
  const a = advanceYears(createWorld(413), 50);
  const b = createWorld(413);
  for (let i = 0; i < 50; i++) stepYear(b);
  assert.equal(serializeWorld(a), serializeWorld(b));
  assert.notEqual(serializeWorld(a), serializeWorld(advanceYears(createWorld(414), 50)));
  assert.equal(a.year, 1116);
  assert.equal(a.stats.years, 50);
  assert.ok(a.events.length > 2000);
  assert.ok(a.events.some(e => e.kind === 'shortage'), 'Expected at least one weather-driven shortage');
});
test('save/load is deterministic including future RNG and event sequence', () => {
  const original = advanceYears(createWorld(7777), 21);
  const snap = serializeWorld(original);
  const restored = loadWorld(snap);
  assert.equal(serializeWorld(restored), snap);
  advanceYears(original, 29);
  advanceYears(restored, 29);
  assert.equal(serializeWorld(original), serializeWorld(restored));
  assert.deepEqual(summary(restored), summary(original));
  assert.throws(() => loadWorld('{"schemaVersion":2}'), /Invalid Venets world/);
  assert.throws(() => loadWorld('z'.repeat(16_000_001)), /Invalid save/);
});
test('transaction entries are double-entry and failed transactions are atomic', () => {
  const world = createWorld(1), person = world.people[0];
  const first = serializeWorld(world);
  assert.throws(() => transfer(world, { good: 'grain', from:'person:' + person.id,
    to: 'person:pe-02', amount: person.treasury.grain + 1, cause:'invalid' }), /Insufficient/);
  assert.equal(serializeWorld(world), first);
  assert.throws(() => transfer(world, { good: 'coal', from:'person:pe-01',
    to:'person:pe-02', amount:1,cause:'invalid' }), /Invalid good/);
  assert.equal(serializeWorld(world), first);
  const old = person.treasury.grain;
  transfer(world, { good: 'grain', from:'person:' + person.id,
    to: 'person:pe-02', amount: 5, cause: 'gift-contract' });
  assert.equal(person.treasury.grain, old - 5);
  assert.equal(world.events.at(-1).cause, 'gift-contract');
  assertWorld(world);
  const pre = world.ledger.created.coin;
  transfer(world, { good:'coin', to:'province:pr-01', amount:12,cause:'outside-trade' });
  assert.equal(world.ledger.created.coin, pre + 12);
  assertWorld(world);
});
test('title transfer changes legal owner and the following year flows to new owner', () => {
  const world = createWorld(3);
  const previous = world.people.find(p => p.id === 'pe-01');
  const successor = world.people.find(p => p.id === 'pe-02');
  const initialHolder = world.titles.find(t => t.id === 'co-01');
  assert.equal(initialHolder.holderId, previous.id);
  assert.throws(() => changeTitleHolder(world, { titleId: 'co-01',
    newHolderId: 'missing',cause:'grant' }), /Unknown/);
  changeTitleHolder(world, { titleId:'co-01',newHolderId:successor.id,cause:'sovereign-grant' });
  assert.equal(initialHolder.holderId, successor.id);
  assert.equal(world.events.at(-1).kind, 'title-transfer');
  stepYear(world);
  assert.ok(world.events.some(e => e.cause === 'grain-tax:pr-01' && e.effect.to === 'person:pe-02'));
  assert.ok(!world.events.some(e => e.cause === 'grain-tax:pr-01' && e.effect.to === 'person:pe-01'));
  assertWorld(world);
});
test('one year produces explicit incomes and expenses with causal event records', () => {
  const world = createWorld(1);
  stepYear(world);
  assert.equal(world.year, 1067);
  assert.equal(world.stats.harvested, world.ledger.created.grain);
  assert.equal(world.stats.minted, world.ledger.created.coin);
  assert.equal(world.events.at(-1).kind, 'year-closed');
  assert.ok(world.events.some(e => e.cause.startsWith('subsistence:')));
  assert.ok(world.events.some(e => e.cause.startsWith('outside-trade:')));
  assert.ok(world.events.some(e => e.cause.startsWith('crown-dues:')));
  assertWorld(world);
});
test('tampering with money, title hierarchy, adjacency or event order is rejected', () => {
  const state = createWorld(99);
  const run = mutator => { const w = loadWorld(serializeWorld(state)); mutator(w); assert.throws(() => assertWorld(w)); };
  run(w => w.provinces[0].treasury.grain++);
  run(w => w.provinces[0].treasury.coin = -2);
  run(w => w.titles.find(t => t.id === 'du-01').liegeId = 'du-02');
  run(w => w.provinces[0].neighbors.pop());
  run(w => w.events[0].id = 27);
  run(w => w.people[0].dynastyId = 'dy-404');
});
test('invalid inputs never mutate a valid world', () => {
  for(const seed of [-1,1.1,2**32,NaN,'1']) assert.throws(()=>createWorld(seed));
  const world=createWorld(5), before=serializeWorld(world);
  for(const years of [-1,0.5,201,Infinity,'5']) assert.throws(()=>advanceYears(world,years));
  assert.equal(serializeWorld(world),before);
});
test('stress acceptance: at least 100 seeds × 50 simulated years', () => {
  let auditedYears = 0, shortageWorlds = 0, differentHistories = new Set();
  for (let seed=0; seed<100; seed++) {
    const world = createWorld(seed);
    for (let year=0; year<50; year++) {
      stepYear(world);
      if (year % 5 === 4) assertWorld(world);
      auditedYears++;
    }
    const report=summary(world);
    assert.equal(report.year,1116);
    assert.ok(report.resources.grain>=0 && report.resources.coin>=0);
    if(report.shortages>0)shortageWorlds++;
    differentHistories.add(report.harvested + ':' + report.shortages + ':' + report.minted);
  }
  assert.equal(auditedYears,5000);
  assert.ok(shortageWorlds>0, 'Climate must occasionally affect subsistence');
  assert.ok(differentHistories.size>90, 'World generation should produce distinct histories');
});
