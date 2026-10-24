import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

let clock=100000;
class TestDate extends Date {static now(){return clock}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(compiled,{exports,Date:TestDate,Math,Array,Number,Object,Error,JSON,Set,Map,parseInt,parseFloat,console});
const game=exports.default;
const host={id:'h',name:'Host'},guest={id:'g',name:'Guest'},players=[host,guest];
const state=game.createRoom({player:host}).state;
game.onJoin({state,player:guest,players});
const send=(player,payload)=>game.onMessage({state,player,players,payload:payload&&['vote','vote_draft'].includes(payload.type)?{...payload,round:state.round,turn:state.turn,targetId:state.participants[state.turn]?.id}:payload});
send(host,{type:'start',rounds:3});
assert.equal(state.phase,'preview');

function completeRound(){
 clock=state.deadline+1;send(host,{type:'pulse'});
 assert.equal(state.phase,'drawing');
 send(host,{type:'submit',strokes:[]});
 send(guest,{type:'submit',strokes:[]});
 assert.equal(state.phase,'voting','server immediately opens expertise after all confirmed submissions');
 for(let i=0;i<2;i++){
  const author=state.participants[state.turn],voter=author.id===host.id?guest:host;
  send(voter,{type:'vote',chips:[3,0,0,0,0]});
  assert.equal(state.phase,'verdict','vote distribution must precede reveal');
  clock=state.deadline+1;send(host,{type:'pulse'});
  assert.equal(state.phase,'reveal');
  clock=state.deadline+1;send(host,{type:'pulse'});
 }
 assert.equal(state.phase,'round-review','Do not auto-start another round');
 assert.equal(state.deadline,0,'Review has no deadline');
 assert.equal(state.revealed,true);
 const gallery=send(guest,{type:'sync'}).events[0].payload.gallery;
 assert.equal(gallery.length,2);
 assert.ok(gallery.every(g=>g&&Array.isArray(g.strokes)&&Object.keys(g.votes).length===1));
 const round=state.round;
 clock+=120000;send(guest,{type:'pulse'});
 assert.equal(state.phase,'round-review','Review survives indefinite time');
 send(guest,{type:'continue'});
 assert.equal(state.round,round,'Non-host cannot advance');
 send(host,{type:'continue'});
 if(round<3){assert.equal(state.phase,'preview');assert.equal(state.round,round+1);}
 else {assert.equal(state.phase,'results');assert.equal(state.round,3);}
}
completeRound();
completeRound();
completeRound();
console.log('ZAMAZKA round gallery flow, voting reveal, host gate, last-round results: OK');
