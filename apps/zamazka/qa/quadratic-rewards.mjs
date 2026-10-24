import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

let now=10_000_000;
class Clock extends Date{static now(){return now}}
const source=readFileSync(new URL('../server/module.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const api={};
runInNewContext(output,{exports:api,Math,Array,Number,Object,JSON,Map,Set,Error,Date:Clock,console});
const game=api.default;
const curator={id:'curator',name:'Curator'},viewer={id:'viewer',name:'Viewer'},third={id:'third',name:'Third'};
const duration=25500;
const ballot=(i,n=3)=>Array.from({length:5},(_,index)=>index===i?n:0);
let assertions=0;

function startBallot(people=[curator,viewer]){
 now+=200_000;
 const state=game.createRoom({player:people[0]}).state;
 for(const p of people.slice(1))game.onJoin({state,player:p,players:people});
 const send=(p,payload)=>game.onMessage({state,player:p,players:people,payload:payload&&['vote','vote_draft'].includes(payload.type)?{...payload,round:state.round,turn:state.turn,targetId:state.participants[state.turn]?.id}:payload});
 send(people[0],{type:'start',rounds:1,drawingSeconds:60});
 now=state.deadline+1;send(people[0],{type:'pulse'});
 assert.equal(state.phase,'drawing');
 for(const p of people)send(p,{type:'submit',strokes:[]});
 assert.equal(state.phase,'voting','last verified submission starts the ballot');
 return {state,send,started:now,trueIndex:state.selected.indexOf(state.assignments.curator.art)};
}
function trial(phase,correct,people=[curator,viewer]){
 const m=startBallot(people);
 const index=correct?m.trueIndex:(m.trueIndex+1)%5;
 now=m.started+Math.min(duration-1,Math.round(phase*duration));
 m.send(viewer,{type:'vote',chips:ballot(index)});
 if(m.state.phase==='voting'){
  now=m.state.deadline+1;
  m.send(curator,{type:'pulse'});
 }
 const timing=m.state.voteTiming.curator.viewer[index][0]/1000;
 const audit=m.send(curator,{type:'sync'}).events[0].payload.gallery[0].scoreAudit;
 const normalized=timing*timing;
 const expectedDelay=Math.round((correct?30:80)*3*normalized/(people.length-1));
 const expectedBase=correct?0:Math.round(50*3/(people.length-1));
 const expectedExtra=correct?0:60;
 assert.equal(correct?audit.late:audit.delay,expectedDelay);
 assert.equal(audit.base,expectedBase);
 assert.equal(audit.undetected,expectedExtra);
 assert.equal(audit.mask,expectedBase+expectedDelay+expectedExtra);
 if(correct){
  assert.equal(audit.byVoter.viewer.base,Math.round(300/(people.length-1)));
  assert.equal(audit.byVoter.viewer.speed,Math.round(120*(1-timing)/(people.length-1)));
 }else{
  assert.equal(audit.byVoter.viewer.eye,0);
 }
 assertions+=correct?6:5;
 return {timing,audit};
}
const progress=[0,.1,.25,.5,.75,.9,1];
const wrong=progress.map(t=>trial(t,false).audit.delay);
const lateCorrect=progress.map(t=>trial(t,true).audit.late);
assert.deepEqual(wrong,[0,2,15,60,135,194,240],'quadratic decoy reward by elapsed time');
assert.deepEqual(lateCorrect,[0,1,6,23,51,73,90],'quadratic late-discovery reward');
for(let i=1;i<progress.length;i++){
 assert(wrong[i]>wrong[i-1],'later incorrect vote must never pay less');
 assert(lateCorrect[i]>=lateCorrect[i-1],'later correct discovery must never pay less to painter');
}
assert(wrong[6]-wrong[4] > wrong[3]-wrong[0],'late phase must grow more steeply than early phase');
assert(wrong[6]>20,'new cap materially surpasses old +20 per coin');
assert.equal(trial(.999,false,[curator,viewer,third]).audit.delay,120,'normalization by opponent count retained');
assert.equal(trial(.999,true,[curator,viewer,third]).audit.late,45,'normalization also applies to late correct discovery');

// Duplicate votes must not allow changing the coin timestamp or reward.
{
 const m=startBallot([curator,viewer,third]);
 const wrongIndex=(m.trueIndex+1)%5;
 now=m.started+Math.round(duration*.2);
 m.send(viewer,{type:'vote_draft',chips:ballot(wrongIndex)});
 const first=Array.from(m.state.voteTiming.curator.viewer[wrongIndex]);
 now=m.started+Math.round(duration*.9);
 m.send(viewer,{type:'vote',chips:ballot(wrongIndex)});
 m.send(viewer,{type:'vote_draft',chips:ballot(m.trueIndex)});
 m.send(viewer,{type:'vote',chips:ballot(m.trueIndex)});
 assert.deepEqual(Array.from(m.state.voteTiming.curator.viewer[wrongIndex]),first);
 assert.equal(m.state.votes.curator.viewer[wrongIndex],3);
 const audit=m.send(curator,{type:'sync'}).events[0].payload;
 assert.equal(audit.gallery,null,'no score details leaked during voting');
 assertions+=3;
}

console.log('ZAMAZKA quadratic scoring: '+assertions+' server time, smooth growth, early/late extremes, multiplier, replay and secrecy checks OK');
