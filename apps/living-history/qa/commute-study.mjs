// Reproducible geographic labour audit for GitHub-hosted Universal QA.
import {createWorld,advanceDays,audit,overview} from '../model.js';
import {walkingSteps,walkable} from '../navigation.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
const get=(key,defaultValue)=>process.argv.find(arg=>arg.startsWith(`--${key}=`))?.slice(key.length+3)??defaultValue;
const seed=Number(get('seed','413')),years=Number(get('years','20'));
if(!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isInteger(years)||years<1||years>100)throw Error('Invalid seed or years');
const s=createWorld(seed),samples=[],start=performance.now();
for(let year=1;year<=years;year++){
 advanceDays(s,365);const check=audit(s);if(!check.ok)throw Error(`Year ${year}: ${check.issues.join('; ')}`);
 let water=0;for(const p of s.people)if(p.alive&&!walkable(s,p.x,p.y))water++;
 if(water)throw Error(`Year ${year}: ${water} residents located on water/rock`);
 const o=overview(s),homes=s.households.filter(h=>h.members.some(id=>s.people.some(p=>p.id===id&&p.alive)));
 samples.push({year,population:o.population,grainKg:o.grain,trade:s.stats.trades,households:homes.length,
  commutingHours:homes.reduce((n,h)=>n+(h.accounting?.travelHours||0),0),
  workingFarmers:s.people.filter(p=>p.alive&&p.job==='farm').length,
  avgFieldWalkTiles: +(homes.reduce((n,h)=>n+h.fields.reduce((a,i)=>{const d=walkingSteps(s,h,{x:i%160,y:Math.floor(i/160)});return a+(d<0?0:d)},0),0)/Math.max(1,homes.reduce((n,h)=>n+h.fields.length,0))).toFixed(1),
  waterResidents:water});
}
const output=resolve(get('output','/tmp/living-history-commute.json'));
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({version:'0.3.3',seed,years,ms:Math.round(performance.now()-start),samples},null,2));
console.log(`seed=${seed} ${years}yr pop=${samples.at(-1).population} trade=${s.stats.trades}  avg_field_walk=${samples.at(-1).avgFieldWalkTiles} result=${output}`);