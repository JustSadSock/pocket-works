import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createLevel, currentWind, resolveShot, shotsLeft, validState } from '../model.mjs';

test('three levels have unique ammo and valid health', () => {
  for (let i = 0; i < 3; i++) {
    const state = createLevel(i);
    assert.equal(validState(state), true);
    assert.ok(shotsLeft(state) >= 5);
  }
});
test('wind shifts the actual impact', () => {
  let s = createLevel(1); // +1 wind
  const r = resolveShot(s, 'stone', 0, -30);
  assert.equal(r.x, 24);
  assert.equal(r.hits[0].id, 'gate');
  assert.equal(r.state.turn, 1);
});
test('gate shields keep except bolt', () => {
  let s = createLevel();
  const stone = resolveShot(s, 'stone', 0, -174);
  assert.equal(stone.shielded, true);
  assert.equal(stone.state.structures.find(x => x.id === 'keep').hp, 5);
  const bolt = resolveShot(s, 'bolt', 0, -174);
  assert.equal(bolt.state.structures.find(x => x.id === 'keep').hp, 2);
});
test('gate breach then keep destruction is a valid winning path', () => {
  let s = createLevel();
  for (const [type,x,y] of [['stone',0,-30],['stone',-24,-30],['bolt',0,-174],['stone',24,-174]]) {
    const r = resolveShot(s,type,x,y);
    assert.equal(r.ok,true);
    s = r.state;
  }
  assert.equal(s.phase,'won');
  assert.ok(shotsLeft(s) > 0);
});
test('all ammo can be expended, and no more can be fired', () => {
  let s = createLevel();
  for (const type of ['stone','stone','stone','fire','bolt']) {
    s = resolveShot(s,type,370,50).state;
  }
  assert.equal(s.phase, 'lost');
  assert.equal(resolveShot(s,'stone',0,0).ok,false);
});
test('invalid stored data cannot inject structures or overfill stock', () => {
  const s = createLevel();
  assert.equal(validState({...s, ammo: {...s.ammo, stone: 999}}),false);
  assert.equal(validState({...s, structures: [{id:'oops',hp:3}]}),false);
});
