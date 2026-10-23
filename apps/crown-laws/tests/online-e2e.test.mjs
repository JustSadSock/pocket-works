import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(base,"server/module.ts"),"utf8");
const factory=new Function(source.replace(/export\s*\{\s*entry_default\s+as\s+default\s*\};?\s*$/,"")+"\nreturn entry_default;");
const server=factory();
const A={id:"north",name:"North"}, B={id:"south",name:"South"};
const run=(state,player,payload)=>server.onMessage({state,player,payload}).state;
const view=(state,player)=>server.viewForPlayer({state,player});
const started=()=>{let state=server.createRoom({player:A}).state;state=server.onJoin({state,player:B}).state;return state};

test("server creates a real room with 2 independent claimants and strictly hidden enemy cards",()=>{
 const state=started();
 assert.ok(state.game);
 assert.equal(state.game.turn,1);
 assert.equal(server.viewForPlayer({state,player:A}).you,"p1");
 assert.equal(server.viewForPlayer({state,player:B}).you,"p2");
 for(const [player,enemy] of [[A,"p2"],[B,"p1"]]){
   const room=view(state,player);
   assert.ok(room.state.players[enemy].hand.every(id=>id==="hidden"));
   assert.ok(room.state.players.p1.deck.every(id=>id==="hidden"));
   assert.ok(room.state.players.p2.deck.every(id=>id==="hidden"));
   assert.equal(room.state.seed,"private");
   assert.equal(room.state.pendingChoices,null);
 }
});

test("one player's sealed choice is secret, the second resolves one authoritative turn and unlocks both",()=>{
 let state=started();
 const north=state.game.players.p1.hand[0],south=state.game.players.p2.hand[0];
 const before=structuredClone(state);
 state=run(state,A,{type:"match:choose",cardId:north});
 assert.equal(state.ready.p1,true);assert.equal(state.ready.p2,false);
 assert.equal(state.game.turn,1);
 assert.equal(view(state,B).state.players.p1.hand.every(id=>id==="hidden"),true);
 assert.equal(view(state,B).ready.p1,true);
 assert.equal(before.game.turn,1);
 assert.throws(()=>run(state,A,{type:"match:choose",cardId:north}),/Сейчас нельзя/);
 assert.throws(()=>run(state,B,{type:"match:choose",cardId:"invalid"}),/Карты нет/);
 state=run(state,B,{type:"match:choose",cardId:south});
 assert.equal(state.game.turn,2);
 assert.deepEqual(state.ready,{p1:false,p2:false});
 assert.deepEqual(state.pending,{});
 assert.equal(view(state,A).state.turn,view(state,B).state.turn);
 assert.deepEqual(view(state,A).state.pieces,view(state,B).state.pieces);
 assert.ok(!view(state,A).state.players.p2.hand.some(id=>id!=="hidden"));
 assert.ok(!view(state,B).state.players.p1.hand.some(id=>id!=="hidden"));
});

test("full server-side two-client match supports repeated turns, reconnect view and host-only rematch",()=>{
 let state=started();
 let turns=0;
 for(let index=0;index<26&&!state.game.winner;index++){
   const oldTurn=state.game.turn;
   state=run(state,A,{type:"match:choose",cardId:state.game.players.p1.hand[0]});
   const readBack=run(state,B,{type:"sync"});
   assert.equal(readBack.ready.p1,true);
   assert.equal(view(readBack,B).state.players.p1.hand.every(id=>id==="hidden"),true);
   state=run(state,B,{type:"match:choose",cardId:state.game.players.p2.hand[0]});
   assert.equal(state.game.turn,oldTurn+1);
   turns++;
 }
 assert.ok(turns>=2);
 // Force an actual completed server snapshot to exercise rematch authorization
 // without relying on the generated game duration.
 state.game.winner="p1";state.game.players.p1.activeCrowns=3;
 assert.throws(()=>run(state,B,{type:"match:restart"}),/создателю/);
 const restarted=run(state,A,{type:"match:restart"});
 assert.equal(restarted.game.turn,1);
 assert.equal(restarted.game.winner,null);
 assert.deepEqual(restarted.ready,{p1:false,p2:false});
 assert.deepEqual(restarted.pending,{});
 assert.equal(view(restarted,B).you,"p2");
});

test("the server validates role and room departure, and reconnecting does not change seats",()=>{
 let state=started();
 const before=state.slots.p1;
 state=server.onJoin({state,player:A}).state;
 assert.equal(state.slots.p1,before);
 assert.throws(()=>run(state,{id:"stranger"},{type:"match:choose",cardId:"x"}),/Игрок не в комнате/);
 state=server.onLeave({state,player:B}).state;
 assert.equal(state.slots.p2,null);
 assert.deepEqual(state.ready,{p1:false,p2:false});
 assert.throws(()=>run(state,A,{type:"match:choose",cardId:state.game.players.p1.hand[0]}),/Сейчас нельзя/);
 state=server.onJoin({state,player:B}).state;
 assert.equal(view(state,B).you,"p2");
 assert.ok(state.game);
});
