import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {paintPackets,paintingChecksum} from '../draft-transfer.js';

let clock=100000;
class Clock extends Date{static now(){return clock}}
const raw=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(compiled,{exports,Date:Clock,Math,Array,Number,Object,Error,JSON,Set,Map,console});
const game=exports.default;
const a={id:'artist',name:'Artist'},b={id:'guest',name:'Guest'},players=[a,b];
function room(){
 const s=game.createRoom({player:a}).state;
 game.onJoin({state:s,player:b,players});
 const send=(p,payload)=>game.onMessage({state:s,player:p,players,payload});
 send(a,{type:'start',rounds:1});
 clock=s.deadline+1;send(a,{type:'pulse'});
 assert.equal(s.phase,'drawing');
 return {s,send};
}
const art=Array.from({length:400},(_,i)=>({c:'#abcdef',s:12,t:'brush',p:Array.from({length:30},(_,j)=>[i%70*8+j*.1,j*3])}));
{
 const {s,send}=room(),ass=s.assignments[a.id];
 const meta={round:s.round,art:ass.art,variation:ass.variation,strokes:art};
 const draft=paintPackets({...meta,type:'draft_chunk'});
 for(const chunk of draft)send(a,chunk);
 assert.equal(s.drafts[a.id].length,400);
 const final=paintPackets({...meta,type:'submit_chunk'});
 assert.equal(final[0].checksum,paintingChecksum(art),'packets include integrity checksum');
 send(a,{type:'submit_begin',round:s.round,art:ass.art,variation:ass.variation});
 send(a,final[0]);
 clock=s.deadline+exports.FINAL_SUBMISSION_GRACE_MS+1;
 send(b,{type:'pulse'});
 assert.equal(s.phase,'drawing','no stale draft while final upload is in progress');
 for(const chunk of final.slice(1))send(a,chunk);
 assert.equal(s.assignments[a.id].strokes.length,400);
 assert.deepEqual([...s.incompleteSubmissions||[]],[],'completed final not marked incomplete');
}
{
 const {s,send}=room(),ass=s.assignments[a.id];
 send(a,{type:'submit_begin',round:s.round,art:ass.art,variation:ass.variation});
 clock=s.deadline+exports.FINAL_SUBMISSION_GRACE_MS+1;
 send(b,{type:'pulse'});
 assert.equal(s.phase,'drawing','final intent keeps recovery open');
 clock=s.deadline+exports.FINAL_TRANSFER_RECOVERY_MS+1;
 send(b,{type:'pulse'});
 assert.equal(s.phase,'voting','recovery wait is bounded');
 assert.ok(s.incompleteSubmissions.includes(a.id),'fallback must be explicitly marked incomplete');
}
{
 const {s,send}=room(),ass=s.assignments[a.id];
 const meta={round:s.round,art:ass.art,variation:ass.variation,strokes:art};
 const chunks=paintPackets({...meta,type:'submit_chunk'});
 // All parts arrive in order, but one vector changes in transit or due to a bug.
 const changed=chunks.map(p=>({...p,strokes:p.strokes.map(stroke=>({...stroke,p:stroke.p.map(point=>[...point])}))}));
 changed.at(-1).strokes.at(-1).p[0][0]+=1;
 const result=changed.map(p=>send(a,p)).at(-1);
 assert.equal(s.assignments[a.id].strokes,null,'invalid checksum must never publish corrupted final art');
 assert.ok(result.events.some(e=>e.type==='notice'),'sender must receive a checksum error');
 for(const chunk of chunks)send(a,chunk);
 assert.equal(s.assignments[a.id].strokes.length,400,'a clean retry must be accepted');
}
{
 const {s,send}=room(),ass=s.assignments[a.id];
 const meta={round:s.round,art:ass.art,variation:ass.variation,strokes:art};
 const chunks=paintPackets({...meta,type:'submit_chunk'});
 for(const chunk of chunks.slice(0,7))send(a,chunk);
 const query={type:'submit_resume',round:s.round,art:ass.art,
  variation:ass.variation,revision:chunks[0].revision,
  checksum:chunks[0].checksum,parts:chunks.length};
 const response=send(a,query).events[0];
 assert.equal(response.type,'submit_resume_state');
 assert.equal(response.payload.next,7,'server reports exact durable prefix');
 for(const chunk of chunks.slice(response.payload.next))send(a,chunk);
 assert.equal(s.assignments[a.id].strokes.length,400,'resumed transfer preserves full painting');
}
console.log('ZAMAZKA: final transfer grace, completed chunks, explicit incomplete fallback OK');
