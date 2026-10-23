import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {paintPackets,paintingChecksum} from '../draft-transfer.js';

// Eight independent final restorations; alternate their frames as simultaneous
// WebSocket clients would. No live Cloudflare connection is used in this test.
let clock=100000;
class Clock extends Date {static now(){return clock}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(output,{exports,Date:Clock,Math,Array,Number,Object,Error,JSON,Set,Map,console});
const game=exports.default;
const players=Array.from({length:8},(_,i)=>({id:'artist'+i,name:'Artist '+i}));
const state=game.createRoom({player:players[0]}).state;
for(const p of players.slice(1))game.onJoin({state,player:p,players});
const send=(p,payload)=>game.onMessage({state,player:p,players,payload});
send(players[0],{type:'start',rounds:1});
clock=state.deadline+1;
send(players[0],{type:'pulse'});
assert.equal(state.phase,'drawing');

const datasets=players.map((player,i)=>{
 const assignment=state.assignments[player.id];
 const strokes=Array.from({length:380},(_,j)=>({
  c:i%2?'#123456':'#abcdef',s:8,t:'brush',
  p:Array.from({length:30},(_,k)=>[+(12+(j%65)*8+k*.1).toFixed(1),+(20+k*2.7).toFixed(1)])
 }));
 const packets=paintPackets({type:'submit_chunk',round:state.round,
  art:assignment.art,variation:assignment.variation,strokes});
 send(player,{type:'submit_begin',round:state.round,art:assignment.art,variation:assignment.variation});
 return {player,strokes,packets};
});
const maxPackets=Math.max(...datasets.map(x=>x.packets.length));
for(let index=0;index<maxPackets;index++){
 for(const item of datasets){
  const packet=item.packets[index];
  if(packet)send(item.player,packet);
 }
}
assert.equal(state.phase,'voting','room transitions only after all eight finalized');
for(const item of datasets){
 const stored=state.assignments[item.player.id].strokes;
 assert.equal(stored.length,380,'final artwork not truncated');
 assert.equal(paintingChecksum(stored),paintingChecksum(item.strokes),'all geometry preserved');
}
assert.equal(state.incompleteSubmissions?.length||0,0);
console.log('ZAMAZKA: eight interleaved 380-stroke final uploads committed intact');
