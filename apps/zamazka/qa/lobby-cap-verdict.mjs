import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

let clock=100000;
class TestDate extends Date{static now(){return clock}}
const code=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(js,{exports,Date:TestDate,Math,Array,Number,Object,JSON,Set,Map,Error,console});
const game=exports.default;
const host={id:'host',name:'Host'},guest={id:'guest',name:'Guest'},players=[host,guest];
const state=game.createRoom({player:host}).state;
game.onJoin({state,player:guest,players});
const send=(player,payload)=>game.onMessage({state,player,players,payload});
const original={type:'board_delta',revision:0,k:'first',q:0,c:'#123456',s:4,p:[[1,2]]};
assert.equal(send(host,original).events[0].type,'board_delta');
for(let n=1;n<1200;n++){
  const result=send(guest,{...original,k:'g'+n,q:n,p:[[n%960,100]]});
  assert.equal(result.events[0].type,'board_delta','accepted vector packet '+n);
}
assert.equal(state.board.segments.length,1200);
const before=JSON.stringify(state.board.segments[0]);
const capacity=send(host,{...original,k:'extra',q:1});
assert.equal(capacity.events[0].type,'board_full','no silent FIFO eviction');
assert.equal(state.board.segments.length,1200);
assert.equal(JSON.stringify(state.board.segments[0]),before,'first stroke must survive capacity');
send(guest,{type:'board_clear'});
assert.equal(state.board.segments.length,1200,'guests cannot clear artwork');
send(host,{type:'board_clear'});
assert.equal(state.board.segments.length,0,'host clears all marks explicitly');

send(host,{type:'start',rounds:1});
clock=state.deadline+1;send(host,{type:'pulse'});
assert.equal(state.phase,'drawing');
send(host,{type:'submit',strokes:[]});
send(guest,{type:'submit',strokes:[]});
assert.equal(state.phase,'voting');
send(guest,{type:'vote',chips:[2,0,0,0,0]});
assert.equal(state.phase,'verdict','tally must not be skipped after votes');
const shown=send(host,{type:'sync'}).events[0].payload;
assert.equal(shown.gallery.length,2,'tally must receive full gallery');
assert.equal(shown.gallery[0].votes.guest[0],2,'real accepted ballot rendered');
send(host,{type:'advance'});
assert.equal(state.phase,'verdict','cannot immediately skip the vote tally');
clock=state.deadline+1;send(host,{type:'pulse'});
assert.equal(state.phase,'reveal','tally advances to the comparison');
console.log('ZAMAZKA lobby board preservation and real vote-tally phase OK');
