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

function guarded(count=3,deadline=160_000){
 return {phase:'drawing',participants:Array.from({length:count},(_,i)=>({id:'p'+i})),
  onlineIds:Array.from({length:count},(_,i)=>'p'+i),paused:false,deadline,
  protectedPresence:true,allowedAbsentIds:[]};
}
test('v47 freezes on a single lost seat and publishes the paused transition',()=>{
 for(let count=2;count<=8;count++){
  const state=guarded(count),active=state.onlineIds.slice(0,-1);
  assert.deepEqual(reconcileZamazkaPresence(state,active,110_000),{changed:true,resumed:false});
  assert.equal(state.paused,true);
  assert.equal(state.pauseRemainingMs,50_000);
  assert.deepEqual(state.onlineIds,active);
  assert.deepEqual(reconcileZamazkaPresence(state,active,120_000),{changed:false,resumed:false});
  assert.equal(state.pauseRemainingMs,50_000,'repeated heartbeat never consumes frozen time');
  assert.deepEqual(reconcileZamazkaPresence(state,Array.from({length:count},(_,i)=>'p'+i),900_000),
   {changed:true,resumed:true});
  assert.equal(state.deadline,950_000,'exact remaining time after long sleep');
 }
});
test('v47 curator-approved absent seat does not re-pause until ANOTHER player disconnects',()=>{
 const state=guarded(4);
 reconcileZamazkaPresence(state,['p0','p1','p2'],110_000);
 state.allowedAbsentIds=['p3'];state.paused=false;state.deadline=250_000;state.pausedAt=0;state.pauseRemainingMs=null;
 assert.deepEqual(reconcileZamazkaPresence(state,['p0','p1','p2'],110_001),{changed:false,resumed:false});
 assert.equal(state.paused,false);
 reconcileZamazkaPresence(state,['p0','p1'],120_000);
 assert.equal(state.paused,true,'new unapproved disconnection must pause');
 assert.equal(state.pauseRemainingMs,130_000);
 reconcileZamazkaPresence(state,['p0','p1','p2'],330_000);
 assert.equal(state.paused,false,'returning newly missing player resumes with prior approval');
 assert.equal(state.deadline,460_000);
 assert.deepEqual(state.allowedAbsentIds,['p3']);
 reconcileZamazkaPresence(state,['p0','p1','p2','p3'],331_000);
 assert.deepEqual(state.allowedAbsentIds,[],'returning exempt seat is never permanently exempt');
 reconcileZamazkaPresence(state,['p0','p1','p2'],332_000);
 assert.equal(state.paused,true,'later disconnect of same user must pause again');
});
test('v47 one remaining seat never bypasses freeze on an earlier approval',()=>{
 const state=guarded(3);
 state.allowedAbsentIds=['p2'];
 reconcileZamazkaPresence(state,['p0'],110_000);
 assert.equal(state.paused,true);
 assert.equal(state.pauseRemainingMs,50_000);
 assert.equal(reconcileZamazkaPresence(state,['p0'],112_000).resumed,false);
});
test('v47 untimed paused round and lobby are stable',()=>{
 const untimed=guarded(2,0);
 reconcileZamazkaPresence(untimed,['p0'],110_000);
 assert.equal(untimed.pauseRemainingMs,null);
 reconcileZamazkaPresence(untimed,['p0','p1'],900_000);
 assert.equal(untimed.deadline,0);
 const lobby=guarded(2);
 lobby.phase='lobby';
 reconcileZamazkaPresence(lobby,['p0'],110_000);
 assert.equal(lobby.paused,false);
});
