import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELDS, ORDINARIES, MAINS, SECONDARIES, COMMANDS, MOTTOS,
  createCampaign, generateOffers, applyOffer, prepareBattle, createBattleState,
  stepBattle, simulateBattle, botAudit, doctrineLayers, recordBattle
} from '../engine.js';

test('catalog has intentionally bounded doctrine space', () => {
  assert.equal(Object.keys(FIELDS).length, 4);
  assert.equal(Object.keys(ORDINARIES).length, 4);
  assert.equal(Object.keys(MAINS).length, 4);
  assert.equal(Object.keys(SECONDARIES).length, 4);
  assert.equal(Object.keys(COMMANDS).length, 3);
  assert.equal(Object.keys(MOTTOS).length, 4);
});

test('campaign starts with field and ordinary only', () => {
  const c = createCampaign('azure', 'chevron', 42);
  assert.equal(c.doctrine.field, 'azure');
  assert.equal(c.doctrine.ordinary, 'chevron');
  assert.equal(c.doctrine.main, null);
  assert.equal(doctrineLayers(c.doctrine).length, 6);
});

test('first reward offers main figures', () => {
  const c = createCampaign('gules', 'pale', 9);
  c.battleIndex = 1;
  const offers = generateOffers(c);
  assert.equal(offers.length, 3);
  assert.ok(offers.every((o) => o.slot === 'main'));
});

test('offer changes only its doctrine layer', () => {
  const c = createCampaign('gules', 'pale', 9);
  c.battleIndex = 1;
  const offer = generateOffers(c)[0];
  const next = applyOffer(c, offer);
  assert.equal(next.doctrine[offer.slot], offer.id);
  assert.equal(next.doctrine.field, 'gules');
});

test('battle contains equal armies with infantry and archers', () => {
  const c = prepareBattle(createCampaign('argent', 'fess', 55));
  const state = createBattleState(c.doctrine, c.currentEnemy, c.currentSeed);
  assert.equal(state.player.infantry.length, 4);
  assert.equal(state.player.archers.length, 4);
  assert.equal(state.player.infantry.reduce((s, q) => s + q.strength, 0), 32);
  assert.equal(state.player.archers.reduce((s, q) => s + q.strength, 0), 16);
  assert.equal(state.enemy.infantry.reduce((s, q) => s + q.strength, 0), 32);
});

test('battle advances and terminates', () => {
  const c = prepareBattle(createCampaign('gules', 'bend', 77));
  const state = createBattleState(c.doctrine, c.currentEnemy, c.currentSeed);
  for (let i = 0; i < 1200 && state.status === 'running'; i++) stepBattle(state, 0.1);
  assert.equal(state.status, 'finished');
  assert.ok(['player', 'enemy'].includes(state.winner));
  assert.ok(state.time <= 96);
});

test('simulation is deterministic for same seed', () => {
  const a = { field:'gules', ordinary:'pale', main:'lion', secondary:'sun', command:'crown', motto:'breach', axis:'center' };
  const b = { field:'azure', ordinary:'chevron', main:'stag', secondary:'eagle', command:'helmet', motto:'banner', axis:'left' };
  assert.deepEqual(simulateBattle(a,b,123), simulateBattle(a,b,123));
});

test('campaign records loss and progresses to reward', () => {
  const c = createCampaign('gules', 'pale', 2);
  const next = recordBattle(c, { winner:'enemy', duration:60, events:[], decisive:[] });
  assert.equal(next.integrity, 2);
  assert.equal(next.battleIndex, 1);
  assert.equal(next.phase, 'reward');
  assert.equal(next.offers.length, 3);
});

test('six battle campaign unlocks layers in intended order', () => {
  let c = createCampaign('gules', 'pale', 81);
  const expected = ['main', 'secondary', 'command', 'motto'];
  for (let battle = 0; battle < 5; battle++) {
    c = recordBattle(c, { winner: 'player', duration: 50, events: [], decisive: [] });
    if (c.completed) break;
    assert.equal(c.offers.length, 3);
    if (battle < 4) assert.ok(c.offers.every((o) => o.slot === expected[battle]));
    if (battle === 4) assert.ok(c.offers.every((o) => o.revision));
    c = applyOffer(c, c.offers[0]);
  }
  c = recordBattle(c, { winner: 'player', duration: 50, events: [], decisive: [] });
  assert.equal(c.completed, true);
  assert.equal(c.victories, 6);
});

test('mirrored bot audit has no side bias explosion', () => {
  const audit = botAudit(20, 100);
  assert.equal(audit.player + audit.enemy, 40);
  assert.ok(Math.abs(audit.player - audit.enemy) <= 12);
  assert.ok(audit.averageDuration < 95);
});
