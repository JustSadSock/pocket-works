import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {NetworkManager} from '../network.js';
const source=await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const participants=Array.from({length:4},(_,i)=>({id:'user'+i,name:'User '+i}));
function start(count){
 const people=participants.slice(0,count);
 let state=game.createRoom({player:people[0]}).state;
 for(const p of people.slice(1))state=game.onJoin({state,player:p}).state;
 for(const p of people)state=game.onMessage({state,player:p,payload:{type:'ready'},connectedIds:people.map(x=>x.id)}).state;
 return state;
}
test('public snapshots omit server PRNG, undealt bags and rate-limit data for every seat',()=>{
 for(let count=2;count<=4;count++){
  const state=start(count);
  const original=structuredClone(state);
  for(let owner=0;owner<count;owner++){
   const view=game.viewForPlayer({state,player:participants[owner]});
   assert.equal(view.engine.rngState,undefined);
   assert.equal(view.engine.players.length,count);
   assert.deepEqual(view.engine.board,state.engine.board);
   assert.deepEqual(view.engine.sharedStats,state.engine.sharedStats);
   for(let i=0;i<count;i++){
    const seat=view.engine.players[i],sourceSeat=state.engine.players[i];
    for(const key of ['bag','keys','inputWindowStart','inputWindowCount','lastTime'])
     assert.equal(seat[key],undefined,`sensitive ${key} leaked for seat ${i}`);
    assert.deepEqual(seat.currentPiece,sourceSeat.currentPiece);
    assert.deepEqual(seat.nextPiece,sourceSeat.nextPiece);
    assert.equal(seat.holdType,sourceSeat.holdType);
    assert.equal(seat.canResume,sourceSeat.canResume);
    assert.equal(seat.lastInputSeq,i===owner?sourceSeat.lastInputSeq:undefined);
   }
   assert.ok(JSON.stringify(view).length<JSON.stringify(state).length,'projection should reduce bandwidth');
  }
  assert.deepEqual(state,original,'projection must not mutate persisted server state');
 }
});
test('the client receives its own acknowledgement but does not learn another players input sequence',()=>{
 let state=start(2);
 state=game.onMessage({state,player:participants[0],payload:{type:'input_batch',actions:[{seq:1,action:'move',direction:1}]},connectedIds:['user0','user1']}).state;
 const own=game.viewForPlayer({state,player:participants[0]});
 const foreign=game.viewForPlayer({state,player:participants[1]});
 assert.equal(own.engine.players[0].lastInputSeq,1);
 assert.equal(own.engine.players[1].lastInputSeq,undefined);
 assert.equal(foreign.engine.players[0].lastInputSeq,undefined);
 assert.equal(foreign.engine.players[1].lastInputSeq,0);
});
test('rejoining a parked teammate yields an authoritative projection without leaking RNG',()=>{
 let state=start(3);
 state=game.onMessage({state,player:participants[0],payload:{type:'pulse'},connectedIds:['user0','user2']}).state;
 const projection=game.viewForPlayer({state,player:participants[1]});
 assert.equal(projection.engine.players[1].offline,true);
 assert.equal(projection.engine.players[1].currentPiece?.length>0,true);
 assert.equal(projection.engine.players[1].lastInputSeq,0);
 assert.equal(projection.engine.rngState,undefined);
 state=game.onMessage({state,player:participants[1],payload:{type:'pulse'},connectedIds:participants.slice(0,3).map(p=>p.id)}).state;
 assert.equal(game.viewForPlayer({state,player:participants[1]}).engine.players[1].offline,false);
});
test('queued inputs use a 65 ms coalescing interval and hard drops bypass the timer',()=>{
 const original=globalThis.performance;
 let wallClock=2000;
 const listeners=[],scheduled=[];
 const net=new NetworkManager();
 net.connected=true;net.started=true;net.inputBatchVersion=1;
 net.net={sendGame:message=>listeners.push(message)};
 try{
  globalThis.performance={now:()=>wallClock};
  const realSetTimeout=globalThis.setTimeout,realClearTimeout=globalThis.clearTimeout;
  globalThis.setTimeout=(fn,ms)=>{scheduled.push(ms);return 101;};
  globalThis.clearTimeout=()=>{};
  try{
   net.sendPlayerInput({action:'move',direction:1});
   net.sendPlayerInput({action:'move',direction:1});
   assert.equal(scheduled[0],65);
   assert.equal(listeners.length,0);
   net.flushInputs();
   assert.equal(listeners.length,1);
   assert.equal(listeners[0].actions.length,2);
   net.sendPlayerInput({action:'hardDrop'});
   assert.equal(listeners.length,2,'hard drop flushes immediately');
  }finally{globalThis.setTimeout=realSetTimeout;globalThis.clearTimeout=realClearTimeout;}
 }finally{globalThis.performance=original;}
});
