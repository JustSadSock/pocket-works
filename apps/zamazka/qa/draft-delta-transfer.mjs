import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {paintPackets,paintingChecksum} from '../draft-transfer.js';

let clock=100_000;
class Clock extends Date{static now(){return clock}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(compiled,{exports,Date:Clock,Math,Array,Number,Object,Error,JSON,Set,Map,console});
const game=exports.default;
const a={id:'artist',name:'Artist'},b={id:'guest',name:'Guest'};
const players=[a,b],state=game.createRoom({player:a}).state;
game.onJoin({state,player:b,players});
const send=payload=>game.onMessage({state,player:a,players,payload});
send({type:'start',rounds:1});
clock=state.deadline+1;send({type:'pulse'});
assert.equal(state.phase,'drawing');
const item=state.assignments[a.id];
const initial=Array.from({length:400},(_,i)=>({
 c:'#aabbcc',s:8,t:'brush',p:Array.from({length:24},(_,j)=>[i%72*8+j*.1,j*2.5])
}));
const meta={type:'draft_chunk',round:state.round,art:item.art,variation:item.variation};
function transmit(packets){
 let reply;
 for(const packet of packets)reply=send(packet);
 return reply;
}
const full=paintPackets({...meta,strokes:initial});
assert.ok(full.length>15,'baseline uses many packets');
const saved=transmit(full);
assert.equal(saved.events[0].type,'draft_saved');
assert.equal(saved.events[0].payload.checksum,paintingChecksum(initial));
assert.equal(state.drafts[a.id].length,400);

const append=initial.concat(Array.from({length:4},(_,i)=>({
 c:'#123456',s:8,t:'brush',p:[[60+i,90],[80+i,110]]
})));
const suffix=paintPackets({...meta,strokes:append,basePrefix:400,
 baseChecksum:paintingChecksum(initial)});
assert.ok(suffix.length<full.length/10,'delta sends dramatically fewer packets');
assert.equal(suffix[0].checksum,paintingChecksum(append),'checksum covers whole drawing');
assert.equal(suffix[0].basePrefix,400);
const replaced=transmit(suffix);
assert.equal(replaced.events[0].type,'draft_saved');
assert.equal(JSON.stringify(state.drafts[a.id]),JSON.stringify(append),'suffix reconstructed without losing base');

const edited=append.map((stroke,i)=>i!==120?stroke:{
 ...stroke,p:[[100,100],[120,130]]
});
const partial=paintPackets({...meta,strokes:edited,basePrefix:120,
 baseChecksum:paintingChecksum(append)});
assert.ok(partial.length<full.length,'undo or editing a middle stroke preserves prefix');
transmit(partial);
assert.equal(JSON.stringify(state.drafts[a.id]),JSON.stringify(edited),'changed suffix replaces old tail');

const bad=paintPackets({...meta,strokes:append,basePrefix:100,
 baseChecksum:'deadbeef'});
const previous=JSON.stringify(state.drafts[a.id]);
const denied=send(bad[0]);
assert.equal(denied.events[0].type,'notice','wrong baseline must be rejected');
assert.equal(JSON.stringify(state.drafts[a.id]),previous,'a bad delta cannot corrupt confirmed draft');
// A fallback full revision always works after the rejected delta.
const restored=transmit(paintPackets({...meta,strokes:append}));
assert.equal(restored.events[0].type,'draft_saved');
assert.equal(JSON.stringify(state.drafts[a.id]),JSON.stringify(append));
assert.throws(()=>paintPackets({...meta,type:'submit_chunk',strokes:append,
 basePrefix:400,baseChecksum:paintingChecksum(initial)}),/invalid_painting_prefix/,
 'final submissions are always independently recoverable');
console.log(JSON.stringify({scenario:'zamazka-verified-draft-deltas',baselineParts:full.length,
 appendParts:suffix.length,revisedParts:partial.length,result:'passed'}));
