import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, HERO_BY_ID, TEAM_UPS, PRESETS } from '../data.js';
import {
  heroRating,
  analyzeTeam,
  recommendHeroes,
  autoComplete,
  optimizeTeam,
  exportPayload,
  normalizeImported
} from '../core.js';

test('roster and link data are internally coherent', () => {
  assert.equal(HEROES.length, 52);
  assert.equal(new Set(HEROES.map(hero => hero.id)).size, HEROES.length);
  assert.ok(TEAM_UPS.length >= 40);
  for (const link of TEAM_UPS) {
    assert.equal(new Set(link.members).size, link.members.length, `${link.id} repeats a member`);
    assert.ok(link.members.length >= 2);
    for (const id of link.members) assert.ok(HERO_BY_ID[id], `${link.id} refers to missing ${id}`);
  }
  for (const preset of PRESETS) for (const id of preset.heroes) assert.ok(HERO_BY_ID[id]);
});

test('personal preferences affect a hero rating', () => {
  const hero = HERO_BY_ID['mister-fantastic'];
  const base = heroRating(hero, {});
  const preferred = heroRating(hero, { tiers: { [hero.id]: 'S+' }, scores: { [hero.id]: 100 }, confidence: { [hero.id]: 100 }, favorites: [hero.id] });
  assert.ok(preferred > base);
  assert.ok(preferred <= 110);
});

test('analysis detects known Reed and Sue tactical core', () => {
  const result = analyzeTeam(['mister-fantastic','invisible-woman',null,null,null,null]);
  assert.ok(result.links.some(link => link.id === 'reed-sue'));
  assert.equal(result.counts.Duelist, 1);
  assert.equal(result.counts.Strategist, 1);
  assert.ok(result.overall > 0 && result.overall < 100);
});

test('recommendations never repeat selected heroes and explain the pick', () => {
  const selected = ['mister-fantastic','invisible-woman',null,null,null,null];
  const results = recommendHeroes(selected, {}, { limit: 12, size: 6 });
  assert.equal(results.length, 12);
  assert.ok(results.every(result => !selected.includes(result.hero.id)));
  assert.equal(new Set(results.map(result => result.hero.id)).size, results.length);
  assert.ok(results.some(result => result.reasons.length));
});

test('auto complete fills every open slot with unique valid heroes', () => {
  const team = autoComplete(['mister-fantastic','invisible-woman',null,null,null,null], [true,true,false,false,false,false], {});
  assert.equal(team.filter(Boolean).length, 6);
  assert.equal(new Set(team).size, 6);
  assert.ok(team.every(id => HERO_BY_ID[id]));
});

test('optimizer preserves locked anchors', () => {
  const input = ['rogue','gambit','iron-fist',null,null,null];
  const result = optimizeTeam(input, [true,true,false,false,false,false], {});
  assert.equal(result[0], 'rogue');
  assert.equal(result[1], 'gambit');
  assert.equal(result.filter(Boolean).length, 6);
  assert.equal(new Set(result).size, 6);
});

test('export and import keep valid state while sanitizing unknown heroes', () => {
  const payload = exportPayload({
    teamSize: 3,
    team: ['rogue','missing','gambit'],
    locks: [true,true,false],
    prefs: { tiers: { rogue: 'S+' } },
    savedTeams: []
  });
  const restored = normalizeImported(payload);
  assert.deepEqual(restored.team, ['rogue',null,'gambit']);
  assert.deepEqual(restored.locks, [true,true,false]);
  assert.equal(restored.prefs.tiers.rogue, 'S+');
});
