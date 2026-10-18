import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {initialMatch,simulateRound,validatePlan,aiPlan} from '../engine.js';
import moduleV2 from '../server/module.ts';
import moduleV1 from '../../../pocketnet/module-versions/crossline-5x5/v1.ts';

const dirs=['up','down','left','right'];
function seeded(seed){let x=seed>>>0;return ()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);}
const randItem=(r,options)=>options[Math.min(options.length-1,Math.floor(r()*options.length))];
function randomLegalPlan(r){
 const out=[],moved=new Set();let attack=null,shield=false;
 for(let step=0;step<5;step++){
  const canAttack=!attack&&r()<.23,attackDirections=dirs.filter(d=>!moved.has(d));
  if(canAttack&&attackDirections.length){
   const selected=[randItem(r,attackDirections)];
   if(attackDirections.length>1&&r()<.35)selected.push(randItem(r,attackDirections.filter(d=>d!==selected[0])));
   attack=new Set(selected);out.push({type:'attack',dirs:selected});continue;
  }
  if(!shield&&r()<.17){shield=true;out.push('shield');continue;}
  out.push(randItem(r,dirs.filter(d=>!attack?.has(d))));
  moved.add(out[out.length-1]);
 }
 assert.equal(validatePlan(out),null);
 return out;
}
function verifyRecord(before,after,record){
 assert.equal(record.round,before.round);
 assert.equal(after.revision,before.revision+1);
 assert.equal(after.replays.length,before.replays.length+1);
 assert.ok(record.frames.length>=1&&record.frames.length<=5);
 assert.deepEqual(record.begin,before.units);
 for(const frame of record.frames){
  assert.equal(typeof frame.beat,'number');
  for(const side of ['A','B']){
   const unit=frame.units[side];
   assert.ok(Number.isInteger(unit.x)&&unit.x>=0&&unit.x<=4);
   assert.ok(Number.isInteger(unit.y)&&unit.y>=0&&unit.y<=4);
   assert.equal(typeof unit.alive,'boolean');
  }
  for(const event of frame.events){
   assert.ok(['move','attack','shield','hit','block','fall','collapse'].includes(event.type));
   if(event.type==='fall')assert.ok(event.at?.x>=0&&event.at?.x<=4&&event.at?.y>=0&&event.at?.y<=4);
  }
 }
}
test('20,000 seeded complete matches: conservation, termination, replay integrity and cross-version physics',()=>{
 const total=20_000;let finished={A:0,B:0,draw:0},rounds=0,frames=0;
 for(let seed=1;seed<=total;seed++){
  const r=seeded(Math.imul(seed,2654435761)),start=initialMatch();
  let a=start,b=moduleV2.initialMatch(),v1=moduleV1.initialMatch();
  for(let n=0;n<4&&!a.outcome;n++){
   const plans={A:randomLegalPlan(r),B:randomLegalPlan(r)};
   const output=simulateRound(a,plans),server=moduleV2.simulateRound(b,plans),old=moduleV1.simulateRound(v1,plans);
   verifyRecord(a,output.match,output.record);
   assert.deepEqual(output,server,'browser and pinned v2 diverged at seed '+seed);
   assert.deepEqual(output,old,'v1 and v2 physics diverged at seed '+seed);
   a=output.match;b=server.match;v1=old.match;rounds++;frames+=output.record.frames.length;
  }
  assert.ok(a.outcome,'match must finish by round four');
  assert.equal(a.replays.length,a.revision);
  finished[a.outcome]++;
 }
 assert.equal(Object.values(finished).reduce((a,b)=>a+b,0),total);
 console.log('GAME_STRESS',JSON.stringify({total,rounds,frames,finished}));
});
test('AI seed reproducibility, non-cheating and legal plans across all levels and peril states',()=>{
 const levels=['easy','normal','hard','expert','insane'];
 const sampleCount=40,results={};
 for(const difficulty of levels){
  let wins=0,losses=0,draws=0,live=0;
  for(let sample=0;sample<sampleCount;sample++){
   let match=initialMatch();
   match.round=1+sample%4;
   match.edgesCollapsed=sample%4===3;
   const coord=seeded(sample*7919+13);
   match.units.A={x:Math.floor(coord()*5),y:Math.floor(coord()*5),alive:true};
   match.units.B={x:Math.floor(coord()*5),y:Math.floor(coord()*5),alive:true};
   let r=seeded(sample*277+7);
   const hidden1=Array(5).fill('up'),hidden2=Array(5).fill('left');
   const result=aiPlan(match,hidden1,difficulty,r);
   r=seeded(sample*277+7);
   const same=aiPlan(match,hidden2,difficulty,r);
   assert.deepEqual(same,result,'AI must not read hidden player plans');
   assert.equal(validatePlan(result),null);
   const opponent=randomLegalPlan(seeded(sample*101+313));
   const outcome=simulateRound(match,{A:opponent,B:result}).match.outcome;
   if(outcome==='A')losses++;else if(outcome==='B')wins++;else if(outcome==='draw')draws++;else live++;
  }
  results[difficulty]={wins,losses,draws,live};
 }
 console.log('AI_BENCHMARK',JSON.stringify(results));
 assert.deepEqual(Object.keys(results),levels);
});
test('PocketNet rejects stale and invalid commands over 150 sequential rounds / rooms',()=>{
 const p=id=>({id,name:id}),A=p('alpha'),B=p('bravo'),r=seeded(1039);
 for(let i=0;i<150;i++){
  let state=moduleV2.createRoom({player:A}).state;
  state=moduleV2.onJoin({state,player:B,players:[A,B]}).state;
  state=moduleV2.onMessage({state,player:A,players:[A,B],payload:{type:'start'}}).state;
  for(let round=0;round<4&&state.phase==='planning';round++){
   const actionsA=randomLegalPlan(r),actionsB=randomLegalPlan(r);
   const revision=state.match.revision,roundNo=state.match.round;
   const submit=(who,actions,rev=revision)=>moduleV2.onMessage({
    state,player:who,players:[A,B],payload:{type:'plan',actions,round:roundNo,revision:rev}
   });
   const invalid=submit(A,['shield','shield','up','left','right']);
   assert.equal(invalid.events[0].type,'notice');
   assert.equal(state.pending.A,null);
   state=submit(A,actionsA).state;
   assert.deepEqual(moduleV2.viewForPlayer({state,player:B}).ownPlan,[]);
   assert.equal(moduleV2.viewForPlayer({state,player:B}).ready.A,true);
   const stale=submit(B,actionsB,revision-1);
   assert.equal(stale.events[0].type,'notice');
   assert.equal(state.pending.B,null);
   state=submit(B,actionsB).state;
  }
  assert.equal(state.phase,'finished');
  assert.ok(['A','B','draw'].includes(state.match.outcome));
  assert.equal(state.match.replays.length,state.match.revision);
 }
});
