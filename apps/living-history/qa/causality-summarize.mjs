#!/usr/bin/env node
// Fail closed on missing shards. Consolidation does not infer historical
// validation from the absence of bugs or from a particular population.
import fs from 'node:fs';
import path from 'node:path';
import {quantiles} from '../historical-calibration.js';

const flags=Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')).map(v=>{
 const i=v.indexOf('=');return [v.slice(2,i),v.slice(i+1)];
}));
const dir=path.resolve(flags.input||'causal-artifacts');
const output=path.resolve(flags.output||'causality-summary');
const group=process.env.CAUSALITY_GROUP||'all';
const expected={family:{shards:16,worlds:32},paired:{shards:12,worlds:144},
 crisis:{shards:12,worlds:48},genealogy:{shards:8,worlds:8}};
if(!(group==='all'||group in expected))throw Error('Invalid audit group');
const selected=group==='all'?Object.keys(expected):[group];
const report={schemaVersion:1,source:'Living History v0.7.1 causal QA',requestedGroup:group,complete:false,
 groups:{},redFlags:[],warnings:[
  'Causal flags identify candidate problems, not proof of faulty household decisions.',
  'Food stock days are not edible days; daily ration caps and protected seed matter.',
  'Worlds in this study are synthetic trials, not historical samples.',
 ]};
for(const key of selected){
 const want=expected[key],population=[],starved=[],variations=[],flagsCount={};
 let worlds=0,deathCases=0,missingCases=0;
 const found=[];
 for(let batch=0;batch<want.shards;batch++){
  const filename=path.join(dir,`causality-${key}-${batch}`,'report.json');
  if(!fs.existsSync(filename)){report.redFlags.push('Missing '+key+' batch '+batch);continue;}
  const data=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(data.group!==key||data.batch!==batch||data.schemaVersion!==1){
   report.redFlags.push('Invalid '+key+' batch '+batch);continue;
  }
  found.push(batch);
  worlds+=data.results.length;
  for(const r of data.results){
   if(!r.audit?.ok)report.redFlags.push('Unverified material audit '+key+' seed='+r.seed);
   const end=r.final||r.annual?.at(-1);
   if(end){population.push(end.population);starved.push(end.starvationDeaths);}
   if(key==='paired'&&r.variant!=='baseline')
    variations.push({seed:r.seed,variant:r.variant,
     deltaPopulation:r.populationDifference,deltaStarvation:r.starvationDifference,
     firstDivergenceYear:r.firstPopulationDivergence});
   if(key==='family'){
    const d=r.deaths||[];
    deathCases+=d.length;missingCases+=r.missingCases||0;
    if(d.length!==r.starvationCount)report.redFlags.push('Death ledger incomplete seed='+r.seed+
     ' ledger='+d.length+' model='+r.starvationCount);
    for(const item of d)for(const flag of item.diagnosticFlags||[])
     flagsCount[flag]=(flagsCount[flag]||0)+1;
   }
  }
 }
 report.groups[key]={expectedShards:want.shards,finishedShards:found.length,
  expectedWorlds:want.worlds,worlds,population:quantiles(population),
  starvationDeaths:quantiles(starved),deathCases,missingCases,diagnosticFlags:flagsCount,
  counterfactualEffects:key==='paired'?variations:undefined};
 if(worlds!==want.worlds)report.redFlags.push('Incomplete '+key+' run count '+worlds+'/'+want.worlds);
 if(missingCases>0)report.redFlags.push('Death evidence missing '+key+' '+missingCases);
}
report.complete=report.redFlags.length===0;
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(report,null,2));
let md='# Living History v0.7.1 — causal audit\n\n';
md+=`**Status:** ${report.complete?'ALL REQUIRED SHARDS COMPLETE':'INCOMPLETE / FAILED'} · Source: ${group}\n\n`;
md+='| Group | Shards | World-runs | Population (median; min–max) | Starvation deaths (median) |\n|---|---:|---:|---:|---:|\n';
for(const [key,r] of Object.entries(report.groups)){
 const p=r.population,d=r.starvationDeaths;
 md+=`| ${key} | ${r.finishedShards}/${r.expectedShards} | ${r.worlds}/${r.expectedWorlds} | ${p.median??'—'}; ${p.min??'—'}–${p.max??'—'} | ${d.median??'—'} |\n`;
}
md+='\n### Causal indicators\n';
for(const [key,r] of Object.entries(report.groups)){
 if(key==='family'){
  md+=`\nRecorded starvation cases: ${r.deathCases}; missing daily entries: ${r.missingCases}.\n`;
  for(const [flag,count] of Object.entries(r.diagnosticFlags))
   md+=`- ${flag}: ${count}\n`;
 }
}
if(report.redFlags.length)md+='\n### Failed checks\n'+report.redFlags.map(x=>'- '+x).join('\n')+'\n';
md+='\n**Interpretation:** successful physical accounting does not prove historical realism. Counterfactual world populations can diverge without a violated invariant. Inspect the underlying artifact trails before changing the economic rules.\n';
fs.writeFileSync(path.join(output,'SUMMARY.md'),md);
console.log(md);
if(!report.complete)process.exitCode=1;
