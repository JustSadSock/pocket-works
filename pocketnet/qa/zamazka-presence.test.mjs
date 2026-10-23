import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcileZamazkaPresence} from '../zamazka-presence.mjs';

function create(deadline=160_000) {
 return {phase:'drawing',participants:[{id:'a'},{id:'b'},{id:'c'}],
  onlineIds:['a','b','c'],paused:false,deadline};
}

test('all sockets lost freezes exactly the remaining drawing time',()=>{
 const state=create();
 const changed=reconcileZamazkaPresence(state,[],110_000);
 assert.deepEqual(changed,{changed:true,resumed:false});
 assert.equal(state.paused,true);
 assert.equal(state.pauseRemainingMs,50_000);
 assert.equal(state.pausedAt,110_000);
 assert.equal(state.deadline,160_000);
});

test('partial reconnect keeps game frozen without altering the budget',()=>{
 const state=create();
 reconcileZamazkaPresence(state,[],110_000);
 const partiallyBack=reconcileZamazkaPresence(state,['a','b'],200_000);
 assert.equal(partiallyBack.resumed,false);
 assert.equal(state.paused,true);
 assert.equal(state.pauseRemainingMs,50_000);
 assert.deepEqual(state.onlineIds,['a','b']);
});

test('complete reconnect resumes once, with the original remaining time',()=>{
 const state=create();
 reconcileZamazkaPresence(state,[],110_000);
 reconcileZamazkaPresence(state,['a','b'],200_000);
 const resumed=reconcileZamazkaPresence(state,['a','b','c'],900_000);
 assert.deepEqual(resumed,{changed:true,resumed:true});
 assert.equal(state.paused,false);
 assert.equal(state.deadline,950_000);
 assert.equal(state.pauseRemainingMs,null);
 assert.equal(state.pausedAt,0);
 assert.deepEqual(reconcileZamazkaPresence(state,['a','b','c'],900_001),{changed:false,resumed:false});
 assert.equal(state.deadline,950_000);
});

test('untimed drawing resumes without inventing a deadline',()=>{
 const state=create(0);
 reconcileZamazkaPresence(state,[],110_000);
 assert.equal(state.pauseRemainingMs,null);
 const restored=reconcileZamazkaPresence(state,['a','b','c'],250_000);
 assert.equal(restored.resumed,true);
 assert.equal(state.deadline,0);
});

test('lobby presence changes are durable but never auto-pause',()=>{
 const state=create();state.phase='lobby';
 assert.deepEqual(reconcileZamazkaPresence(state,[],200_000),{changed:true,resumed:false});
 assert.equal(state.paused,false);
});

test('kicking an offline seat permits remaining players to resume',()=>{
 const state=create();
 reconcileZamazkaPresence(state,[],110_000);
 state.participants=state.participants.filter(p=>p.id!=='c');
 reconcileZamazkaPresence(state,['a','b'],200_000);
 assert.equal(state.paused,false);
 assert.equal(state.deadline,250_000);
});
