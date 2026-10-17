// Reproducible v0.8 scale study; empirical proxies, not a "fun score".
import {performance} from 'node:perf_hooks';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createWorld,stepYear,assertWorld,serializeWorld} from '../sim/world.js';

const seeds=[7,31,413],years=25;
const summary=values=>({
  average:+(values.reduce((a,b)=>a+b,0)/Math.max(1,values.length)).toFixed(3),
  min:Math.min(...values),max:Math.max(...values)
});
function run({size,profile='full',experiment=null,seed}){
 const w=createWorld(seed,{size,profile,experiment});
 const times=[],initialOwners=new Map(w.titles.map(t=>[t.id,t.holderId]));
 for(let n=0;n<years;n++){
  const start=performance.now();
  stepYear(w);
  times.push(performance.now()-start);
 }
 assertWorld(w);
 const events=w.events;
 const decision=events.filter(e=>e.kind==='political-decision');
 const actions=new Set(decision.map(e=>e.effect.kind));
 const agents=new Set(decision.map(e=>e.effect.actorId));
 const landTransfers=events.filter(e=>e.kind==='title-transfer').length;
 const remembered=events.filter(e=>e.kind==='goal-changed').length;
 const related=events.filter(e=>e.kind==='faction-founded'||e.kind==='faction-joined'||
  e.kind==='claim-founded'||e.kind==='war-peace'||e.kind==='scheme-ended');
 const pairs=new Set(related.map(e=>String(e.effect.actorId??e.effect.personId??e.effect.leaderId)+
   ':'+String(e.effect.titleId??e.effect.factionId??'')));
 const dynasties=new Set(w.titles.map(t=>w.people.find(p=>p.id===t.holderId)?.dynastyId));
 return {size,profile,seed,experiment:experiment?Object.keys(experiment).join(','):null,
  years,foundingPeople:events.find(e=>e.kind==='foundation')?.effect.people,
  endAlive:w.people.filter(p=>p.alive).length,allPeople:w.people.length,
  endRulingHouses:dynasties.size,titleTransfers:landTransfers,
  transfersPerCountyDecade:+(10*landTransfers/(size*years)).toFixed(3),
  politicalDecisions:decision.length,distinctDecisions:actions.size,
  distinctPoliticalAgents:agents.size,connectedPlotThreads:pairs.size,
  goalReassessments:remembered,
  warSettlements:events.filter(e=>e.kind==='war-peace').length,
  newClaims:events.filter(e=>e.kind==='claim-founded').length,
  marriageEvents:events.filter(e=>e.kind==='marriage').length,
  birthEvents:events.filter(e=>e.kind==='birth').length,
  time:summary(times),p95ms:+times.sort((a,b)=>a-b)[Math.floor(times.length*.95)].toFixed(3),
  snapshotKiB:+(Buffer.byteLength(serializeWorld(w))/1024).toFixed(1)};
}
const combinations=[];
for(const size of [12,48])for(const profile of ['simple','full']){
 const results=seeds.map(seed=>run({size,profile,seed}));
 combinations.push({size,profile,results,
  averageYearMs:summary(results.map(r=>r.time.average)).average,
  avgTransferDensity:summary(results.map(r=>r.transfersPerCountyDecade)).average,
  avgPoliticalAgents:summary(results.map(r=>r.distinctPoliticalAgents)).average,
  avgStoryThreads:summary(results.map(r=>r.connectedPlotThreads)).average});
}
const ablations=[];
for(const system of ['memory','goals','diplomacy','inheritance']){
 const results=seeds.map(seed=>run({size:12,seed,experiment:{[system]:false}}));
 ablations.push({disabled:system,results,
  avgTransferDensity:summary(results.map(r=>r.transfersPerCountyDecade)).average,
  avgPoliticalAgents:summary(results.map(r=>r.distinctPoliticalAgents)).average,
  avgStoryThreads:summary(results.map(r=>r.connectedPlotThreads)).average});
}
const report={
 experiment:'Venets v0.8',method:'Deterministic 3 seed x 25-year 2x2 factorial + one-at-a-time system ablations',
 seeds,years,
 limitations:'Metrics are proxies for activity, variation and CPU. They do not measure player enjoyment, historical authenticity, or mobile responsiveness. No randomized clinical-like hypothesis.',
 combinations,ablations,
 releasePolicy:{defaultSize:12,expandedSize:48,expandedOptIn:true,
   automaticPromotion:false,
   requires:'Player playtest 20-30 min and mobile visual acceptance before promoting 48 as default'}
};
const arg=process.argv.find(x=>x.startsWith('--output='));
if(arg){const path=arg.slice('--output='.length);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');}
console.log('SCALE STUDY',JSON.stringify({
 groups:combinations.map(g=>({size:g.size,profile:g.profile,yearMs:g.averageYearMs,
  transfersPerCountyDecade:g.avgTransferDensity,politicalActors:g.avgPoliticalAgents,threads:g.avgStoryThreads})),
 ablations:ablations.map(a=>({disabled:a.disabled,transfers:a.avgTransferDensity,actors:a.avgPoliticalAgents,threads:a.avgStoryThreads}))
}));
