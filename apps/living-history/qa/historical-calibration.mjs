#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createWorld,advanceDays,audit} from '../model.js';
import {historicalObservation,historicalComparison,summarizeHistoricalRuns} from '../historical-calibration.js';

const options=Object.fromEntries(process.argv.slice(2).filter(s=>s.startsWith('--')).map(s=>{const i=s.indexOf('=');return [s.slice(2,i<0?undefined:i),i<0?'true':s.slice(i+1)];}));
const group=options.group||'ensemble';
const years=Number(options.years||(group==='sensitivity'?25:group==='summary'?20:100));
if(!Number.isSafeInteger(years)||years<1||years>150)throw Error('years must be 1..150');
const listed=options.seeds?options.seeds.split(',').map(Number):group==='summary'?[413,7777,43821,9001,11,29,12345,21773,51291,71331,101,202]:[Number(options.seed||413)];
if(!listed.length||listed.some(s=>!Number.isSafeInteger(s)||s<0))throw Error('Invalid seed list');
const variants=group==='sensitivity'?[
 {name:'baseline',tuning:{}},
 {name:'yield-minus-5-percent',tuning:{yield:.95}},
 {name:'yield-plus-5-percent',tuning:{yield:1.05}},
 {name:'planting-minus-5-percent',tuning:{planting:.95}},
 {name:'storage-minus-5-percent',tuning:{storage:.95}},
 {name:'transport-minus-5-percent',tuning:{transport:.95}}
]:[{name:'baseline',tuning:{}}];

const runs=[];
for(const seed of listed)for(const variant of variants){
 const state=createWorld(seed,{tuning:variant.tuning}),founding=historicalObservation(state),history=[];
 for(let y=1;y<=years;y++){
  advanceDays(state,365);
  const result=audit(state);
  if(!result.ok)throw Error(`Material audit failed on seed=${seed}, variant=${variant.name}, year=${y}: ${result.issues.slice(0,5).join(' | ')}`);
  if(y===1||y===5||y===10||y%10===0||y===years){
   const o=historicalObservation(state);
   history.push({year:y,population:o.population,householdSize:o.householdSize,
    firstMarriagesObserved:o.firstMarriagesObserved,femaleFirstMarriagesObserved:o.femaleFirstMarriagesObserved,maleFirstMarriagesObserved:o.maleFirstMarriagesObserved,femaleFirstMarriage:o.femaleFirstMarriage,
    maleFirstMarriage:o.maleFirstMarriage,starvationDeaths:o.starvationDeaths,
    grainHarvestKg:o.harvestKg,externalGrainKg:o.grainTradeKg,activeVillages:o.activeVillages});
  }
 }
 const end=historicalObservation(state);
 runs.push({seed,variant:variant.name,founding,final:end,comparison:historicalComparison(end),
  history,audit:{ok:true,yearsTested:years}});
 console.log(`HISTORICAL WORLD COMPLETE seed=${seed} variant=${variant.name} years=${years} population=${end.population} famineDeaths=${end.starvationDeaths}`);
}
const baseline=runs.filter(r=>r.variant==='baseline'),baselineStats=summarizeHistoricalRuns(baseline.map(r=>r.final));
const bySeed=new Map(baseline.map(r=>[r.seed,r]));
const differences=runs.filter(r=>r.variant!=='baseline').map(r=>{
 const base=bySeed.get(r.seed).final,alt=r.final;
 return {seed:r.seed,variant:r.variant,
  populationDifference:alt.population-base.population,
  starvationDifference:alt.starvationDeaths-base.starvationDeaths,
  householdSizeDifference:(alt.householdSize??0)-(base.householdSize??0),
  materialAuditPassed:true};
});
const result={schemaVersion:1,group,years,seeds:listed,variants:variants.map(v=>v.name),
 summary:baselineStats,differences,runs,
 methodologicalLimits:[
  'Observed source estimates are uncertain; no pass/fail target on population or famine',
  'Small illustrative Midlands valley, not an England-wide random sample',
  'The 86.1 percent large customary tenements concerns a particular historical source sample',
  'Monte Carlo quantiles describe this model, not confidence intervals for medieval England',
  'One-factor sensitivity trials have shared initial seed and keyed weather/demography, but decisions and population may diverge after intervention'
 ]};
const dest=options.output||options.out;
if(dest){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(result,null,2));console.log('Report: '+dest);}
else console.log(JSON.stringify({...result,runs:undefined},null,2));
