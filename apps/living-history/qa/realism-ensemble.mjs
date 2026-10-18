#!/usr/bin/env node
// Reproducible 25/50/100-year audit. One seed per CI matrix job; --seeds
// supports voluntary ensemble runs outside the routine smoke pipeline.
import {createWorld,advanceDays,audit} from '../model.js';
import {snapshotReality,validateObservation,summarizeEnsemble} from './realism-metrics.mjs';
import {renderRealismReport} from './realism-report.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(s=>{
 const i=s.indexOf('=');return [s.slice(2,i<0?undefined:i),i<0?'true':s.slice(i+1)];
}));
const seeds=(args.seeds||args.seed||'413').split(',').map(Number);
const years=Number(args.years||25);
const scenarios=(args.scenarios||args.scenario||'normal').split(',');
if(!Number.isSafeInteger(years)||years<1||years>100)throw Error('years must be integer 1..100');
if(seeds.length<1||seeds.length>64||new Set(seeds).size!==seeds.length||
  seeds.some(s=>!Number.isSafeInteger(s)||s<0||s>4294967295))throw Error('Invalid or duplicate seed');
if(scenarios.length<1||scenarios.length>4||new Set(scenarios).size!==scenarios.length||
  scenarios.some(s=>!['normal','drought','isolated','uplands'].includes(s)))throw Error('Unsupported or duplicate scenario');
const runs=[];
for(const seed of seeds)for(const scenario of scenarios){
 const world=createWorld(seed,{scenario});
 const start=snapshotReality(world,null);
 let previous=start.next;
 const annual=[];
 for(let year=1;year<=years;year++){
  advanceDays(world,365);
  const result=audit(world);
  if(!result.ok)throw Error('Failed physical audit '+seed+'/'+scenario+' year '+year+': '+result.issues.slice(0,7).join('; '));
  const reading=snapshotReality(world,previous);
  const problems=validateObservation(reading.observation);
  if(problems.length)throw Error('Invalid observation '+seed+'/'+scenario+' year '+year+': '+problems.join(', '));
  annual.push(reading.observation);
  previous=reading.next;
  if(year===1||year%25===0||year===years)
   console.log('REALISM sample seed='+seed+' scenario='+scenario+' year='+year+
    ' pop='+reading.observation.population+' grainKg='+reading.observation.food.grainKg+
    ' famineDeaths='+reading.observation.food.starvationDeaths+
    ' disputes='+reading.observation.disputes.started);
 }
 runs.push({seed,scenario,years,
  initial:{population:start.observation.population,households:start.observation.households,
   historicalComparison:start.observation.historicalComparison},
  annual,validation:{materialAudit:true,materialAuditYears:years,observedYears:annual.length,
   historicalTruth:'not-certified',rates:'descriptive-only'}});
}
const summary=summarizeEnsemble(runs);
const report={schema:1,study:'living-history-realism-ensemble',sourceCommit:process.env.GITHUB_SHA||null,
 generatedAt:new Date().toISOString(),protocol:'REALISM_AUDIT.md and REALISM_PROTOCOL.md',
 method:{sampling:'annual',yearDays:365,scenarios,seeds,years,
  independence:'distinct seeds are independent starting worlds; years inside one world are correlated',
  interventions:'fixed documented game scenarios, no posthoc parameter tuning'},
 summary,runs
};
const filename=resolve(args.output||'./realism-ensemble.json');
mkdirSync(dirname(filename),{recursive:true});
writeFileSync(filename,JSON.stringify(report,null,2)+'\n');
const md=filename.replace(/\.json$/i,'')+'.md';
writeFileSync(md,renderRealismReport(report));
console.log('REALISM COMPLETED worlds='+runs.length+' years='+years+' independentSeeds='+seeds.length+
 ' historicalStatus=NOT_VALIDATED json='+filename+' markdown='+md);
