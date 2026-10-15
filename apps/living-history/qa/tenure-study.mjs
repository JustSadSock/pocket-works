// Repeatable 20-year socioeconomic tenure audit, designed for independent GitHub shards.
import {createWorld,advanceDays,audit,overview} from '../model.js';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const flag=(n,d)=>process.argv.find(v=>v.startsWith(`--${n}=`))?.slice(n.length+3)??d;
const seed=Number(flag('seed','413')),years=Number(flag('years','20'));
const scenario=flag('scenario','normal');
if(!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isInteger(years)||years<1||years>100||!['normal','drought','isolated','uplands'].includes(scenario))throw Error('Invalid parameters');
const s=createWorld(seed,{scenario}),samples=[],start=performance.now();
for(let y=1;y<=years;y++){
 const startYear=performance.now();advanceDays(s,365);
 const a=audit(s);if(!a.ok)throw Error(`audit ${seed} year ${y}: ${a.issues.join('; ')}`);
 const live=new Set(s.people.filter(p=>p.alive).map(p=>p.houseId));const homes=s.households.filter(h=>live.has(h.id));
 const landless=homes.filter(h=>!h.fields.length).length;
 const commonCattle=homes.reduce((n,h)=>n+(h.cattle||0),0);
 const allLand=homes.reduce((n,h)=>n+h.fields.length,0);
 samples.push({year:y,population:overview(s).population,occupiedHomes:homes.length,landlessHomes:landless,
   grainKg:overview(s).grain,cattle:commonCattle,claimedLandHa:+(allLand*.0625).toFixed(3),
   landDivided:s.stats.landDivided||0,landInherited:s.stats.landInherited||0,
   landReclaimed:s.stats.landReclaimed||0,landAbandoned:s.stats.landAbandoned||0,landReallocated:s.stats.landReallocated||0,
   leaseContracts:s.stats.leasePlots||0,rentGrainKg:s.stats.rentGrain||0,
   migrants:s.stats.migrations||0,lodgingMigrants:s.stats.lodgingMigrants||0,starvationDeaths:s.stats.starvationDeaths||0,homeBuilds:s.stats.built,elapsedMs:Math.round(performance.now()-startYear)});
}
const result={version:'0.4.1',seed,scenario,years,elapsedMs:Math.round(performance.now()-start),samples,last:samples.at(-1)};
const output=resolve(flag('output','/tmp/living-history-tenure.json'));
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2));
console.log(`tenure ${scenario} seed=${seed} year=${years} pop=${result.last.population} landless=${result.last.landlessHomes} migrated=${result.last.migrants} reclaimed=${result.last.landReclaimed} output=${output}`);