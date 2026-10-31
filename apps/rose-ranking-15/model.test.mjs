import test from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, makeState, normalizeState, ensureEpisode, movePerson, findTier, countRated, rankChanges } from './model.js';
import { CONTESTANTS } from './contestants.js';

const ids=CONTESTANTS.map(person=>person.id);

test('all 23 real contestants have unique IDs and editorial photos',()=>{
 assert.equal(ids.length,23);
 assert.equal(new Set(ids).size,23);
 for(const person of CONTESTANTS){
  assert.ok(person.name&&person.fact&&person.image);
  assert.ok(person.image.startsWith('https://'));
 }
});

test('first episode contains each contestant once and no initial judgments',()=>{
 const state=makeState(ids);
 assert.deepEqual(Object.values(state.episodes[1].rows).flat(),ids);
 assert.equal(countRated(state.episodes[1].rows),0);
 assert.equal(state.current,1);
});

test('each new episode copies previous rankings but not episode comments',()=>{
 const state=makeState(ids);const [a,b]=ids;
 movePerson(state.episodes[1].rows,a,'S');
 state.episodes[1].notes[a]='This episode';
 ensureEpisode(state,2,ids);
 assert.equal(findTier(state.episodes[2].rows,a),'S');
 assert.deepEqual(state.episodes[2].notes,{});
 movePerson(state.episodes[2].rows,a,'F');
 movePerson(state.episodes[2].rows,b,'A');
 assert.equal(findTier(state.episodes[1].rows,a),'S');
 assert.equal(findTier(state.episodes[1].rows,b),'?');
 ensureEpisode(state,3,ids);
 assert.equal(findTier(state.episodes[3].rows,a),'F');
 movePerson(state.episodes[3].rows,a,'B');
 assert.equal(findTier(state.episodes[2].rows,a),'F');
});

test('same-rank reordering works in either direction and never duplicates',()=>{
 const state=makeState(ids);
 for(const id of ids.slice(0,3))movePerson(state.episodes[1].rows,id,'A');
 assert.deepEqual(state.episodes[1].rows.A,ids.slice(0,3));
 movePerson(state.episodes[1].rows,ids[0],'A',3);
 assert.deepEqual(state.episodes[1].rows.A,[ids[1],ids[2],ids[0]]);
 movePerson(state.episodes[1].rows,ids[0],'A',0);
 assert.deepEqual(state.episodes[1].rows.A,ids.slice(0,3));
 assert.equal(new Set(Object.values(state.episodes[1].rows).flat()).size,ids.length);
});

test('corrupt or stale backup cannot add unknown people or duplicate entries',()=>{
 const raw={schema:1,current:2,episodes:{1:{rows:{S:[ids[0],ids[0],'malicious'],A:[ids[0],ids[1]]}}},nicknames:{[ids[0]]:'OK',malicious:'NO'}};
 const state=normalizeState(raw,ids);
 assert.equal(state.episodes[1].rows.S.length,1);
 assert.equal(state.episodes[1].rows.A.length,1);
 assert.equal(state.episodes[1].rows['?'].length,ids.length-2);
 assert.equal(state.nicknames.malicious,undefined);
 assert.equal(state.current,2);
 assert.deepEqual(Object.values(state.episodes[2].rows).flat().sort(),[...ids].sort());
});

test('scoreboard and change indicators respect unranked people',()=>{
 const state=makeState(ids);
 movePerson(state.episodes[1].rows,ids[0],'D');
 ensureEpisode(state,2,ids);
 movePerson(state.episodes[2].rows,ids[0],'S');
 movePerson(state.episodes[2].rows,ids[1],'A');
 assert.equal(rankChanges(state.episodes[2].rows,state.episodes[1].rows)[ids[0]],'up');
 assert.equal(rankChanges(state.episodes[2].rows,state.episodes[1].rows)[ids[1]],'new');
 assert.equal(countRated(state.episodes[2].rows),2);
 assert.deepEqual(TIERS,['S','A','B','C','D','F','?']);
});
