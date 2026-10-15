// Paired 100-year counterfactual. Both runs begin at exactly the same seed,
// date, geography and demographic distribution; only bounded policy-neutral
// experimental calibration parameters change.
// Use: node qa/century-paired.mjs --seed=413 --years=100 --output=/tmp/pair.json
import {createWorld,advanceDays,audit,overview,normalizeTuning,serialize,deserialize} from '../model.js';
import {performance} from 'node:perf_hooks';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const argument=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const seed=Number(argument('seed','413'));
const years=Number(argument('years','100'));
const allowedSeeds=[413,7777,43821,9001,12345];
if(!allowedSeeds.includes(seed))throw Error('Expected one of the five paired experiment seeds');
if(!Number.isInteger(years)||years<1||years>100)throw Error('Expected 1–100 years');
// Modest, mixed adjustments, deliberately NOT a historical calibration:
// harvest yield +4%, storage -3%, planted area appetite +2%,
// transport friction -4%, weather intensity -2%.
const adjustments=normalizeTuning({yield:1.04,storage:0.97,planting:1.02,transport:0.96,weather:0.98});
const baseline=normalizeTuning();
const startStamp=new Date().toISOString();
const s0=createWorld(seed,{scenario:'normal',tuning:baseline});
const s1=createWorld(seed,{scenario:'normal',tuning:adjustments});
const first=serialize(s0),second=serialize(s1);
if(!first||!second)throw Error('World initialization failed');
const snapshots=[[],[]];
const summary=(s,year)=>{
 const o=overview(s);
 const occupied=s.households.filter(h=>h.members.some(id=>s.people.some(p=>p.id===id&&p.alive)));
 const occupiedGrain=occupied.reduce((n,h)=>n+h.grain,0);
 const occupiedFood=occupied.reduce((n,h)=>n+h.grain+(h.garden||0)+(h.dairy||0),0);
 const populationByCommunity=s.communities.map(c=>({
  id:c.id,name:c.name,people:occupied.filter(h=>h.communityId===c.id)
    .reduce((n,h)=>n+h.members.filter(id=>s.people.some(p=>p.id===id&&p.alive)).length,0)
 }));
 const loans=s.loans||[];
 const outstanding=loans.filter(l=>l.status==='active'||l.status==='in-transit');
 return {
  year,population:o.population,born:s.stats.born||0,died:s.stats.died||0,
  starvationDeaths:s.stats.starvationDeaths||0,grainKg:o.grain,
  occupiedGrainKg:Math.round(occupiedGrain*100)/100,
  occupiedFoodEquivalentKg:Math.round(occupiedFood*100)/100,
  unownedOrVacantGrainKg:Math.round((o.grain-occupiedGrain)*100)/100,
  families:occupied.length,criticalFamilies:occupied.filter(h=>{
   const members=h.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p?.alive);
   const daily=members.reduce((n,p)=>n+(p.age<4?.35:p.age<10?.55:p.age<15?.77:1)*.68,0);
   return daily>0&&(h.grain+(h.garden||0)+(h.dairy||0))/daily<30;
  }).length,
  grainHarvestKg:Math.round(s.stats.harvest||0),
  gardenProducedEquivalentKg:Math.round(s.stats.gardenProduced||0),
  dairyProducedEquivalentKg:Math.round(s.stats.dairyProduced||0),
  loanIssuedKg:Math.round(s.stats.loanIssuedKg||0),
  loanRepaidKg:Math.round(s.stats.loanRepaidKg||0),
  loanDefaults:s.stats.loanDefaults||0,activeLoans:outstanding.length,
  loanOwedKg:Math.round(outstanding.reduce((n,l)=>n+l.owed,0)),
  serviceMigrants:s.stats.serviceMigrants||0,familyOrLodgingMigrants:(s.stats.migrations||0)-(s.stats.serviceMigrants||0),
  aidKg:Math.round(s.stats.aid||0),tradeCount:s.stats.trades||0,
  livestock:s.households.reduce((n,h)=>n+(h.cattle||0),0),
  communityPopulation:populationByCommunity
 };
};
const worlds=[
 {name:'baseline',tuning:baseline,world:s0},
 {name:'mild-balance',tuning:adjustments,world:s1}
];
const durations={};
for(let j=0;j<worlds.length;j++){
 const item=worlds[j],started=performance.now();
 for(let y=1;y<=years;y++){
  advanceDays(item.world,365);
  const result=audit(item.world);
  if(!result.ok)throw Error(`${item.name} seed=${seed} year=${y} material balance failed: ${result.issues.slice(0,8).join(' | ')}`);
  snapshots[j].push(summary(item.world,y));
  if(y===1||y%10===0||y===years){
   const row=snapshots[j].at(-1);
   console.log(`${item.name} seed=${seed} year=${y}/${years} pop=${row.population} grain=${Math.round(row.grainKg)} starvingDeaths=${row.starvationDeaths} migrated=${row.serviceMigrants} loans=${row.activeLoans}`);
  }
  if(y===50){const copy=deserialize(serialize(item.world));if(!audit(copy).ok)throw Error(`Checkpoint save corrupt: ${item.name}`);}
 }
 durations[item.name]=Math.round(performance.now()-started);
}
const base=snapshots[0].at(-1),alt=snapshots[1].at(-1);
const delta={};
for(const key of ['population','starvationDeaths','grainKg','occupiedFoodEquivalentKg','criticalFamilies','gardenProducedEquivalentKg','dairyProducedEquivalentKg','loanIssuedKg','loanRepaidKg','loanDefaults','serviceMigrants','livestock'])
 delta[key]=Math.round((alt[key]-base[key])*100)/100;
const output={
 schema:1,study:'living-history-century-paired',source:'Pocket Works main',
 sourceCommit:process.env.GITHUB_SHA||null,
 startedAt:startStamp,finishedAt:new Date().toISOString(),
 historicalClaim:'None. Paired sensitivity experiment, not historically calibrated.',
 randomDesign:'Person-and-day keyed mortality/conception and seed/day weather, isolated market and household streams; economic outcomes can still diverge through births, deaths and choice.',
 seed,years,scenario:'normal',calibration:{baseline,alternative:adjustments},
 durationMs:durations,results:{
  baseline:{final:base,annual:snapshots[0]},
  alternative:{final:alt,annual:snapshots[1]}
 },finalDelta:delta
};
const destination=resolve(argument('output','./century-pair.json'));
mkdirSync(dirname(destination),{recursive:true});
writeFileSync(destination,JSON.stringify(output,null,2));
console.log(`PAIR COMPLETE seed=${seed} years=${years} baselinePop=${base.population} alternativePop=${alt.population} difference=${delta.population} destination=${destination}`);
