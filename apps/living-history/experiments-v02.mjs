import {performance} from 'node:perf_hooks';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createWorld,advanceDays,overview,audit} from './model.js';
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'';
const seeds=[413,43821,7777];const scenarios=['normal','drought','isolated','uplands'];const years=30;
const data=[];
for(const scenario of scenarios)for(const seed of seeds){const w=createWorld(seed,{scenario}),snapshots=[];const start=performance.now();for(let y=1;y<=years;y++){advanceDays(w,365);const a=audit(w);if(!a.ok)throw Error(`${seed}/${scenario}/${y}: ${a.issues.join('; ')}`);if([5,8,10,15,20,30].includes(y)){const o=overview(w);snapshots.push({year:y,population:o.population,grain:Math.round(o.grain),wood:Math.round(o.wood),households:o.households,trades:o.trade,shortages:o.hungry});}}
const families=w.households.filter(h=>h.members.some(id=>w.people.some(p=>p.id===id&&p.alive)));const occupations=Object.fromEntries(['farm','wood','trade'].map(kind=>[kind,families.filter(h=>h.focus===kind).length]));data.push({scenario,seed,elapsedMs:Math.round(performance.now()-start),snapshots,occupations,born:w.stats.born,died:w.stats.died,harvest:Math.round(w.stats.harvest),spoiled:Math.round(w.stats.spoiled||0),construction:w.stats.built,delivered:w.stats.delivered});console.log(scenario,seed,snapshots.at(-1),occupations);}
if(output){mkdirSync(output,{recursive:true});writeFileSync(output+'/experiments.json',JSON.stringify({years,seeds,scenarios,data},null,2));}