import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {performance} from 'node:perf_hooks';
import {paintPackets,paintingChecksum} from '../draft-transfer.js';
import {reconcileZamazkaPresence} from '../../../pocketnet/zamazka-presence.mjs';

// Deterministic server-level soak: 8 authenticated room seats, 3 rounds,
// multipart restores, an interrupted socket upload, every ballot/reveal,
// host continuations and a final results transition. No fake PocketNet IO.
let time=100_000;
class FakeDate extends Date {static now(){return time}}
const raw=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(raw,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
runInNewContext(compiled,{exports,Date:FakeDate,Math,Array,Number,Object,Error,JSON,Set,Map,console});
const game=exports.default;
const people=Array.from({length:8},(_,n)=>({id:'seat-'+n,name:'Restorer '+n}));
const state=game.createRoom({player:people[0]}).state;
for(const who of people.slice(1))game.onJoin({state,player:who,players:people});
const latencies=[];let inboundBytes=0,packetCount=0;
const send=(who,payload)=>{
 const started=performance.now();
 const result=game.onMessage({state,player:who,players:people,payload});
 latencies.push(performance.now()-started);
 inboundBytes+=Buffer.byteLength(JSON.stringify(payload));
 packetCount++;
 return result;
};
const pulse=()=>send(people[0],{type:'pulse'});
const totalRounds=process.env.ZAMAZKA_SOAK_ROUNDS==='5'?5:3;
send(people[0],{type:'start',rounds:totalRounds,drawingSeconds:60});
assert.equal(state.rounds,totalRounds);
let uploaded=0,ballots=0;
for(let round=1;round<=totalRounds;round++){
 assert.equal(state.round,round);
 assert.equal(state.phase,'preview');
 time=state.deadline+1;pulse();
 assert.equal(state.phase,'drawing');
 const groups=people.map((who,n)=>{
  const item=state.assignments[who.id];
  const strokes=Array.from({length:260},(_,i)=>({
   c:n%2?'#123456':'#abcdef',s:8,t:'brush',
   p:Array.from({length:24},(_,j)=>[
    +(10+(i%60)*8+j/10).toFixed(1),+(10+j*2.1).toFixed(1)
   ])
  }));
  const packets=paintPackets({type:'submit_chunk',round,art:item.art,
   variation:item.variation,strokes});
  assert.ok(packets.length>5,'test artwork must require a multipart upload');
  const begin=send(who,{type:'submit_begin',round,art:item.art,variation:item.variation});
  assert.equal(begin.events[0].type,'submit_pending');
  return {who,item,strokes,packets};
 });
 // Send the first packets interleaved. Seat 3 loses its connection after a few
 // parts and resumes from the server's authoritative stored offset.
 const interrupted=groups[3],pausedAt=4;
 for(let part=0;part<pausedAt;part++)for(const group of groups){
  if(group.packets[part])send(group.who,group.packets[part]);
 }
 const query={type:'submit_resume',round,art:interrupted.item.art,
  variation:interrupted.item.variation,
  revision:interrupted.packets[0].revision,
  checksum:interrupted.packets[0].checksum,parts:interrupted.packets.length};
 if(round===2){
  const remaining=state.deadline-time;
  const frozen=reconcileZamazkaPresence(state,[],time);
  assert.equal(frozen.changed,true);
  assert.equal(state.paused,true);
  const originalOffset=state.draftAssemblies[interrupted.who.id].next;
  time+=90_000; // Longer than the original drawing window.
  const rejected=send(interrupted.who,query);
  assert.equal(rejected.events[0].type,'notice','paused room rejects transfer intents');
  assert.equal(state.draftAssemblies[interrupted.who.id].next,originalOffset);
  reconcileZamazkaPresence(state,people.slice(0,-1).map(p=>p.id),time);
  assert.equal(state.paused,true,'partial return must not restart match');
  const back=reconcileZamazkaPresence(state,people.map(p=>p.id),time);
  assert.equal(back.resumed,true);
  assert.equal(state.deadline,time+remaining,'restore exact remaining drawing time');
 }
 const resume=send(interrupted.who,query);
 assert.equal(resume.events[0].type,'submit_resume_state');
 assert.equal(resume.events[0].payload.next,pausedAt);
 assert.equal(pulse().events.length,0,'idle pulse should not rebroadcast eight galleries');
 for(let part=pausedAt;part<Math.max(...groups.map(g=>g.packets.length));part++){
  for(const group of groups){
   if(group.packets[part])send(group.who,group.packets[part]);
  }
 }
 assert.equal(state.phase,'voting','voting opens after all eight final commits');
 assert.equal(state.incompleteSubmissions.length,0);
 for(const group of groups){
  const final=state.assignments[group.who.id].strokes;
  assert.equal(final.length,260);
  assert.equal(paintingChecksum(final),paintingChecksum(group.strokes));
  uploaded++;
 }
 for(let turn=0;turn<people.length;turn++){
  assert.equal(state.turn,turn);
  assert.equal(state.phase,'voting');
  const author=people[turn].id;
  // Every voter places three chips, testing voting receipt and early completion.
  for(const who of people){
   if(who.id===author)continue;
   const result=send(who,{type:'vote',chips:[1,1,1,0,0]});
   assert.ok(result.events.some(e=>e.type==='vote_saved'&&e.to===who.id));
   ballots++;
  }
  assert.equal(state.phase,'verdict');
  assert.equal(Object.keys(state.votes[author]||{}).length,7);
  time=state.deadline+1;pulse();
  assert.equal(state.phase,'reveal');
  time=state.deadline+1;pulse();
  assert.equal(state.phase,turn===people.length-1?'round-review':'voting');
 }
 assert.equal(state.deadline,0,'round review remains untimed');
 send(people[0],{type:'continue'});
 assert.equal(state.phase,round===totalRounds?'results':'preview');
}
assert.equal(uploaded,8*totalRounds);
assert.equal(ballots,56*totalRounds);
assert.equal(state.phase,'results');
assert.equal(state.round,totalRounds);
assert.equal(state.participants.length,8);
for(const who of people)assert.ok(Number.isFinite(state.scores[who.id].mask+state.scores[who.id].eye));
const sorted=latencies.toSorted((a,b)=>a-b);
const q=p=>Math.round(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]*100)/100;
console.log(JSON.stringify({scenario:'zamazka-eight-player-full-match',
 rounds:totalRounds,players:people.length,committedArtworks:uploaded,acceptedBallots:ballots,
 packetCount,inboundKiB:Math.round(inboundBytes/1024),handlerP50Ms:q(.5),
 handlerP95Ms:q(.95),handlerP99Ms:q(.99),handlerMaxMs:q(1),
 result:'passed'}));
