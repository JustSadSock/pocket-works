// Reproducible, bounded paired-seed experimental matrix.
// node qa/parameter-lab.mjs --years=5 --seeds=413,7777 --out=/tmp/lab.json
import {createWorld,advanceDays,audit,BASE_TUNING} from '../model.js';
import {diagnoseWorld,summarizeDiagnostics,comparePaired} from '../laboratory.js';
import {performance} from 'node:perf_hooks';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const flag=(name,def)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??def;
const years=Number(flag('years','5'));
if(!Number.isInteger(years)||years<1||years>50)throw Error('years should be between 1 and 50');
const seeds=flag('seeds','413,7777').split(',').map(x=>Number(x));
if(seeds.length<1||seeds.length>12||seeds.some(x=>!Number.isInteger(x)||x<0||x>4294967295))throw Error('Provide 1–12 unsigned integer seeds');
const scenario=flag('scenario','normal');
if(!['normal','drought','isolated','uplands'].includes(scenario))throw Error('Invalid scenario');
const shortlist=flag('parameters','yield,storage,planting,transport,weather').split(',');
if(shortlist.some(x=>!Object.keys(BASE_TUNING).includes(x))||new Set(shortlist).size!==shortlist.length)throw Error('Invalid/duplicate dimension');
const values={yield:[.85,1,1.15],storage:[.75,1,1.25],planting:[.8,1,1.2],transport:[.5,1,1.5],weather:[.5,1,1.5]};
const variants=[{id:'baseline',dimension:'baseline',multiplier:1,tuning:{...BASE_TUNING}}];
for(const key of shortlist)for(const value of values[key])if(value!==1)variants.push({id:`${key}:${value}`,dimension:key,multiplier:value,tuning:{...BASE_TUNING,[key]:value}});
const results=[],baseline=new Map();
// Never run alternatives before baseline for a given seed; no accidental mixing.
for(const seed of seeds){
 for(const variant of variants){
  const world=createWorld(seed,{scenario,tuning:variant.tuning}),profiles=[],start=performance.now();
  for(let year=1;year<=years;year++){
   const stages={};const t=performance.now();let remaining=365,peakAtRiskHomes=0,monthsAtRisk=0,peakUnhealthyHomes=0;
   while(remaining>0){const n=Math.min(30,remaining);advanceDays(world,n,stages);remaining-=n;
    const interim=diagnoseWorld(world);peakAtRiskHomes=Math.max(peakAtRiskHomes,interim.familiesUnder30Days);
    peakUnhealthyHomes=Math.max(peakUnhealthyHomes,interim.householdsWithUnhealthyPeople);
    if(interim.familiesUnder30Days>0)monthsAtRisk++;
   }
   const invariant=audit(world);if(!invariant.ok)throw Error(`${seed}/${variant.id}/${year}: ${invariant.issues.join('; ')}`);
   const d=diagnoseWorld(world);
   profiles.push({year,durationMs:Math.round(performance.now()-t),stages:Object.fromEntries(Object.entries(stages).map(([k,v])=>[k,Math.round(v)])),
    population:d.population,hungryHomes:d.familiesUnder30Days,grainPerCapita:d.meanGrainKgPerPerson,foodMedianDays:d.foodDaysMedian,peakAtRiskHomes,monthsAtRisk,peakUnhealthyHomes,hungerDeaths:d.hungerDeaths});
  }
  const summary=summarizeDiagnostics(diagnoseWorld(world));
  const record={seed,id:variant.id,dimension:variant.dimension,multiplier:variant.multiplier,years,
   elapsedMs:Math.round(performance.now()-start),summary,profiles};
  if(variant.id==='baseline')baseline.set(seed,summary);
  else record.vsBaseline=comparePaired(baseline.get(seed),summary);
  results.push(record);
  process.stdout.write(`seed ${seed} ${variant.id}: ${summary.population} residents, ${summary.familiesUnder30Days} hungry homes, ${record.elapsedMs}ms\n`);
 }
}
// A comparison is not a historical accuracy score. Retain the unfiltered raw evidence.
const comparisons=variants.filter(v=>v.id!=='baseline').map(v=>{
 const subset=results.filter(r=>r.id===v.id),mean=k=>Number((subset.reduce((n,r)=>n+r.vsBaseline[k],0)/subset.length).toFixed(2));
 return {id:v.id,dimension:v.dimension,multiplier:v.multiplier,
  deltaPopulation:mean('population'),deltaHungryHomes:mean('familiesUnder30Days'),deltaGrainPerCapita:mean('meanGrainKgPerPerson'),
  deltaFoodMedianDays:mean('foodDaysMedian'),deltaTradeCount:mean('tradeCount'),deltaHungerDeaths:mean('hungerDeaths')};
});
const report={schema:1,version:'0.3.1',description:'Paired seeds; only one multiplier changed at a time. Comparison is not evidence of historical accuracy.',
 scenario,seeds,years,variants:variants.map(({id,dimension,multiplier})=>({id,dimension,multiplier})),comparisons,results};
const out=resolve(flag('out','qa/parameter-lab-results.json'));mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2));console.log(`Report: ${out}`);